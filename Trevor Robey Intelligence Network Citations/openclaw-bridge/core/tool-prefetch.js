"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { safeString } = require("../../workflows/governance-automation/common.js");
const defaultTimeProvider = require("./time-provider.js");

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
    const title = record.title || record.tool_name || record.name || record.nctId || record.id || "";
    const meta = [];
    if (record.year) meta.push(String(record.year));
    if (record.journal) meta.push(record.journal);
    if (record.phase) meta.push(`Phase ${record.phase}`);
    if (record.status) meta.push(record.status);
    const lines = [];
    if (title) lines.push(`### ${title}`);
    if (meta.length) lines.push(`*${meta.join(" · ")}*`);
    if (record.whyStopped || record.why_stopped) lines.push(`**Stopped:** ${record.whyStopped || record.why_stopped}`);
    if (record.changeSummary && record.changeSummary.versions) {
      lines.push(`**Protocol history:** ${record.changeSummary.versions} versions; most-amended: ${(record.changeSummary.amended_modules || []).join(", ")} (${record.changeSummary.first}–${record.changeSummary.last})`);
    }
    if (record.abstract) lines.push(record.abstract);
    if (record.description) lines.push(record.description);
    if (record.doi) lines.push(`doi: ${record.doi}`);
    if (record.url) lines.push(record.url);
    if (record.nctId && !title.includes(record.nctId)) lines.push(`NCT: ${record.nctId}`);
    if (record.pmid) lines.push(`PMID: ${record.pmid}`);
    if (record.chemblId) lines.push(`ChEMBL: ${record.chemblId}`);
    if (lines.length === 0) lines.push("```json", JSON.stringify(record).slice(0, 600), "```");
    return lines.join("\n") + "\n\n";
  }

  function formatToolResult(toolName, result, query) {
    const now = timeProvider.nowIso();
    let content = `## Live Data: ${toolName}\n\n`;

    if (Array.isArray(result) && result.length > 0) {
      for (const record of result) {
        content += renderRecord(record);
      }
    } else if (isPlainObject(result)) {
      content += renderRecord(result);
    } else {
      content += "No results returned.\n\n";
    }

    content += `Source: ToolUniverse SMCP / ${toolName}\n`;
    content += `Query: ${query}\n`;
    content += `Retrieved: ${now}\n`;

    return {
      path: `tooluniverse://${toolName}`,
      rel: `live-data/${toolName}`,
      content
    };
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
        const doc = formatToolResult(labelBase, result, labelQuery);
        results.push(doc);
      } catch (err) {
        logger.warn({
          event: "tool_prefetch_call_failed",
          role,
          action,
          query: resolvedQuery,
          error: safeString(err && err.message)
        });
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
