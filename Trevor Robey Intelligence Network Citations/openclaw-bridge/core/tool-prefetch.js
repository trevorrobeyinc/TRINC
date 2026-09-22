"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { safeString } = require("../../workflows/governance-automation/common.js");
const defaultTimeProvider = require("./time-provider.js");

const { CITATION_PATTERNS } = require("./citation-extractor.js");

// CONTEXT-ONLY SOURCES (2026-09-22). Vault read-back and research-memory priors inform a role but
// are NEVER citation evidence: their identifiers come from PRIOR runs, not from a source-of-record
// fetched in THIS run. Before this date a PMID sitting in an old vault note satisfied the 0.75
// grounded floor without any live fetch. A prefetch entry flagged `context_only: true` (or a local
// fetcher whose records carry `context_only: true`) is rendered under a NOT-evidence banner with
// every identifier withheld, is given a `vault://` path instead of `tooluniverse://`, and carries
// `context_only: true` on the doc so agent-engine leaves it out of fetched_citation_ids.
const CONTEXT_ONLY_BANNER =
  "CONTEXT ONLY - NOT EVIDENCE. This section is prior research from the operator's own vault or " +
  "memory. Identifiers have been withheld; do not cite anything from this section. Cite only " +
  "identifiers that appear verbatim in the LIVE DATA documents.";

function redactIdentifiers(text) {
  let out = String(text || "");
  for (const { type, regex } of CITATION_PATTERNS) {
    const fresh = new RegExp(regex.source, regex.flags);
    out = out.replace(fresh, `<prior-run ${type} withheld>`);
  }
  return out;
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function resolveTemplate(template, variables) {
  if (!template || typeof template !== "string") return "";
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const val = variables[key];
    return val !== undefined && val !== null ? String(val) : "";
  });
}

function resolveTemplateRecursive(value, variables) {
  if (typeof value === "string") return resolveTemplate(value, variables);
  if (Array.isArray(value)) return value.map((item) => resolveTemplateRecursive(item, variables));
  if (isPlainObject(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = resolveTemplateRecursive(v, variables);
    }
    return out;
  }
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createToolPrefetch(options = {}) {
  const toolUniverseMcp = options.toolUniverseMcp;
  // Slice 2 — local-fetcher seam: tool_name -> async(args) => records[]. Lets the role prefetch
  // call corpora ToolUniverse doesn't surface (ClinicalTrials.gov stop-reason archaeology,
  // change-history, retraction checks) through the SAME prefetch path. A tool_name found here is
  // routed to the local fetcher instead of ToolUniverse; its records flow through renderRecord
  // and into the citation gate's fetched_citation_ids exactly like ToolUniverse results.
  const localFetchers = isPlainObject(options.localFetchers) ? options.localFetchers : {};
  const logger = isPlainObject(options.logger) ? options.logger : { info() {}, warn() {}, error() {} };
  const rootDir = options.rootDir || process.cwd();
  const timeProvider = options.timeProvider && typeof options.timeProvider.nowMs === "function"
    ? options.timeProvider
    : defaultTimeProvider;

  const cache = new Map();
  const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
  const RATE_LIMIT_MS = 500;
  const PER_CALL_TIMEOUT_MS = 30_000;
  const TOTAL_TIMEOUT_MS = 120_000;

  let prefetchMap = null;

  function loadPrefetchMap() {
    if (prefetchMap) return prefetchMap;
    const mapPath = path.join(rootDir, "config", "tool-prefetch-map.json");
    try {
      const raw = JSON.parse(fs.readFileSync(mapPath, "utf8"));
      prefetchMap = raw && raw.role_mappings ? raw.role_mappings : {};
    } catch (err) {
      logger.warn({ event: "tool_prefetch_map_load_failed", error: safeString(err && err.message) });
      prefetchMap = {};
    }
    return prefetchMap;
  }

  function getCacheKey(roleName, workflowInputs) {
    return JSON.stringify({ role: roleName, inputs: workflowInputs });
  }

  function getCached(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (timeProvider.nowMs() - entry.timestamp > CACHE_TTL_MS) {
      cache.delete(key);
      return null;
    }
    return entry.value;
  }

  function setCache(key, value) {
    cache.set(key, { value, timestamp: timeProvider.nowMs() });
  }

  async function callWithTimeout(input, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Tool call timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      ((input && input.tool_name && typeof localFetchers[input.tool_name] === "function")
        ? Promise.resolve().then(() => localFetchers[input.tool_name](input.arguments || {}))
        : toolUniverseMcp.execute(input, {}))
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  function renderRecord(record) {
    if (!isPlainObject(record)) return `${String(record)}\n\n`;
    const title = record.title || record.tool_name || record.name || record.nctId || record.id || record.path || "";
    const meta = [];
    if (record.year) meta.push(String(record.year));
    if (record.journal) meta.push(record.journal);
    if (record.phase) meta.push(`Phase ${record.phase}`);
    if (record.status) meta.push(record.status);
    if (typeof record.score === "number") meta.push(`score ${record.score.toFixed(2)}`);
    const lines = [];
    if (title) lines.push(`### ${title}`);
    if (meta.length) lines.push(`*${meta.join(" · ")}*`);
    if (record.path && record.path !== title) lines.push(`Vault path: ${record.path}`);
    if (record.whyStopped || record.why_stopped) lines.push(`**Stopped:** ${record.whyStopped || record.why_stopped}`);
    if (record.changeSummary && record.changeSummary.versions) {
      lines.push(`**Protocol history:** ${record.changeSummary.versions} versions; most-amended: ${(record.changeSummary.amended_modules || []).join(", ")} (${record.changeSummary.first}–${record.changeSummary.last})`);
    }
    if (record.abstract) lines.push(record.abstract);
    if (record.description) lines.push(record.description);
    // Vault / memory read-back records carry their prose under `text` (or a `snippet`), not an
    // abstract — before 2026-09-22 they fell through to the raw-JSON fallback below.
    if (record.text) lines.push(String(record.text));
    else if (record.snippet) lines.push(String(record.snippet));
    if (record.doi) lines.push(`doi: ${record.doi}`);
    if (record.url) lines.push(record.url);
    if (record.nctId && !title.includes(record.nctId)) lines.push(`NCT: ${record.nctId}`);
    if (record.pmid) lines.push(`PMID: ${record.pmid}`);
    if (record.chemblId) lines.push(`ChEMBL: ${record.chemblId}`);
    if (lines.length === 0) lines.push("```json", JSON.stringify(record).slice(0, 600), "```");
    return lines.join("\n") + "\n\n";
  }

  // Q5: honest record count for the Search-Coverage Ledger — how many records the source actually
  // returned (0 = a genuine zero-result, never a guess). Handles local-fetcher arrays and the MCP
  // {status,data} shape alike; an empty/absent payload counts as zero.
  function countReturnedRecords(result) {
    const payload = result && typeof result === "object" && !Array.isArray(result) && ("data" in result)
      ? result.data : result;
    if (Array.isArray(payload)) return payload.length;
    if (payload && typeof payload === "object") return Object.keys(payload).length > 0 ? 1 : 0;
    if (payload == null || payload === "") return 0;
    return 1;
  }

  function formatToolResult(toolName, result, query, { contextOnly = false } = {}) {
    const now = timeProvider.nowIso();
    let content = contextOnly
      ? `## Prior Context (NOT evidence): ${toolName}\n\n${CONTEXT_ONLY_BANNER}\n\n`
      : `## Live Data: ${toolName}\n\n`;

    let body = "";
    if (Array.isArray(result) && result.length > 0) {
      for (const record of result) {
        body += renderRecord(record);
      }
    } else if (isPlainObject(result)) {
      body += renderRecord(result);
    } else {
      body += "No results returned.\n\n";
    }
    content += contextOnly ? redactIdentifiers(body) : body;

    content += contextOnly
      ? `Source: prior research (context only, identifiers withheld) / ${toolName}\n`
      : `Source: ToolUniverse SMCP / ${toolName}\n`;
    content += `Query: ${query}\n`;
    content += `Retrieved: ${now}\n`;

    const doc = {
      path: contextOnly ? `vault://${toolName}` : `tooluniverse://${toolName}`,
      rel: contextOnly ? `prior-context/${toolName}` : `live-data/${toolName}`,
      content
    };
    if (contextOnly) doc.context_only = true;
    return doc;
  }

  async function prefetchForRole(roleName, workflowInputs = {}) {
    if (!toolUniverseMcp || typeof toolUniverseMcp.execute !== "function") {
      logger.warn({ event: "tool_prefetch_no_mcp", role: roleName });
      return [];
    }

    const role = safeString(roleName);
    if (!role) return [];

    const mappings = loadPrefetchMap();
    const queries = mappings[role];
    if (!Array.isArray(queries) || queries.length === 0) {
      logger.info({ event: "tool_prefetch_no_mapping", role, available_roles: Object.keys(mappings) });
      return [];
    }

    const cacheKey = getCacheKey(role, workflowInputs);
    const cached = getCached(cacheKey);
    if (cached) {
      logger.info({ event: "tool_prefetch_cache_hit", role, doc_count: cached.length });
      return cached;
    }

    const results = [];
    const coverage = []; // Q5: per-search outcome log for the deterministic Search-Coverage Ledger
    const totalStart = timeProvider.nowMs();

    for (let i = 0; i < queries.length; i++) {
      if (timeProvider.nowMs() - totalStart > TOTAL_TIMEOUT_MS) {
        logger.warn({ event: "tool_prefetch_total_timeout", role, completed: i, total: queries.length });
        break;
      }

      const queryDef = queries[i];
      const action = safeString(queryDef.action) || "findTool";
      const rawQuery = safeString(queryDef.query) || "";
      const resolvedQuery = resolveTemplate(rawQuery, workflowInputs);
      const covSource = safeString(queryDef.tool_name) || action || "unknown source";

      try {
        const input = { action };
        if (queryDef.tool_name) input.tool_name = safeString(queryDef.tool_name);
        if (queryDef.arguments && isPlainObject(queryDef.arguments)) {
          input.arguments = resolveTemplateRecursive(queryDef.arguments, workflowInputs);
        }
        if (resolvedQuery) input.query = resolvedQuery;
        if (queryDef.limit) input.limit = queryDef.limit;
        if (queryDef.category) input.category = queryDef.category;

        if (action === "executeTool" && !input.tool_name) {
          logger.warn({ event: "tool_prefetch_executeTool_missing_tool_name", role });
          coverage.push({ role, source: covSource, action, query: resolvedQuery, status: "skipped", records: 0 });
          continue;
        }

        if (action === "executeTool" && isPlainObject(input.arguments)) {
          // Operator-authorized live query (2026-06-10): drug-specific template vars
          // (compound_name/indication/therapeutic_area) are absent for topic-only
          // workflows like general-research-pack, leaving the free-text search fields
          // empty. Fall back to the `topic` input so PubMed/ClinicalTrials/Semantic
          // Scholar/EuropePMC are actually queried instead of skipped.
          const topic = safeString(workflowInputs && workflowInputs.topic);
          const PRIMARY_TEXT_FIELDS = ["query", "query_term"];
          if (topic) {
            for (const field of PRIMARY_TEXT_FIELDS) {
              if (typeof input.arguments[field] === "string" && input.arguments[field].trim().length === 0) {
                input.arguments[field] = topic;
              }
            }
          }
          // Drop empty/whitespace secondary args (condition, intervention, drugName,
          // medicinalproduct, ...) so an absent field no longer blocks an otherwise
          // usable query.
          for (const key of Object.keys(input.arguments)) {
            const value = input.arguments[key];
            if (typeof value === "string" && value.trim().length === 0) {
              delete input.arguments[key];
            }
          }
          // Skip only when nothing queryable remains — i.e. no non-empty string arg.
          // This still gracefully skips tools that can't be driven by a free-text
          // topic (e.g. OpenTargets drugName, FAERS medicinalproduct) when those are
          // the only args and were empty.
          const hasQueryable = Object.values(input.arguments).some((v) => {
            return typeof v === "string" && v.trim().length > 0;
          });
          if (!hasQueryable) {
            logger.info({
              event: "tool_prefetch_skipped_empty_args",
              role,
              tool_name: input.tool_name
            });
            coverage.push({ role, source: covSource, action, query: resolvedQuery, status: "skipped", records: 0 });
            continue;
          }
        }

        const result = await callWithTimeout(input, PER_CALL_TIMEOUT_MS);
        if (process.env.OPENCLAW_TRACE) {
          const _d = result && result.data;
          logger.info({
            event: "trace_tu_call", role, tool_name: input.tool_name, action, query: resolvedQuery,
            result_status: result && result.status,
            data_kind: Array.isArray(_d) ? `array[${_d.length}]` : (_d && typeof _d === "object" ? `object{${Object.keys(_d).join(",")}}` : typeof _d),
            result_keys: result && typeof result === "object" ? Object.keys(result).join(",") : ""
          });
        }
        const labelBase = input.tool_name || `${action}-${resolvedQuery.replace(/\s+/g, "-").slice(0, 40)}`;
        const labelQuery = resolvedQuery || JSON.stringify(input.arguments || {}).slice(0, 120);
        // Context-only by map declaration OR by the fetcher's own records (defence in depth: a
        // read-back fetcher tags every record, so a prefetch-map edit alone cannot turn prior-run
        // identifiers back into evidence).
        const contextOnly =
          queryDef.context_only === true ||
          (Array.isArray(result) && result.some((r) => isPlainObject(r) && r.context_only === true));
        const doc = formatToolResult(labelBase, result, labelQuery, { contextOnly });
        results.push(doc);
        const recordCount = countReturnedRecords(result);
        coverage.push({
          role, source: covSource, action, query: resolvedQuery,
          status: recordCount > 0 ? "returned" : "empty", records: recordCount
        });
      } catch (err) {
        logger.warn({
          event: "tool_prefetch_call_failed",
          role,
          action,
          query: resolvedQuery,
          error: safeString(err && err.message)
        });
        coverage.push({ role, source: covSource, action, query: resolvedQuery, status: "failed", records: 0 });
      }

      // Rate limit between sequential calls
      if (i < queries.length - 1) {
        await sleep(RATE_LIMIT_MS);
      }
    }

    if (results.length === 0 && queries.length > 0) {
      logger.warn({
        event: "tool_prefetch_zero_docs",
        role,
        query_count: queries.length,
        note: "queries ran but returned no documents — the agent prompt will lack live-data grounding, so citations may be model-generated rather than runtime-verified"
      });
    }

    // Q5: attach the per-search outcome log (non-enumerable so it never spreads/serializes as an
    // array element) so the Search-Coverage Ledger can render the honest-zero. Stored by reference
    // in the cache, so a cache hit preserves it too.
    Object.defineProperty(results, "coverage", { value: coverage, enumerable: false, configurable: true });
    setCache(cacheKey, results);

    logger.info({
      event: "tool_prefetch_completed",
      role,
      doc_count: results.length,
      query_count: queries.length,
      duration_ms: timeProvider.nowMs() - totalStart
    });

    return results;
  }

  function clearCache() {
    cache.clear();
  }

  return Object.freeze({
    prefetchForRole,
    clearCache
  });
}

module.exports = {
  createToolPrefetch
};
