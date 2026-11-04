"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { getResearchProfile } = require("./research-profiles.js");

const { safeString } = require("../../workflows/governance-automation/common.js");
const defaultTimeProvider = require("./time-provider.js");

const { CITATION_PATTERNS } = require("./citation-extractor.js");
const { redactBylines } = require("./citation-attribution.js");

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
  // Bylines too (2026-11-04): a prior run's wrong "Chio et al." must not be re-attached to a live id.
  return redactBylines(out);
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

  // One map per research profile (core/research-profiles.js): biomedical → tool-prefetch-map.json
  // (unchanged), business → tool-prefetch-map.business.json. Cached per file.
  const prefetchMaps = new Map();

  function loadPrefetchMap(profileId) {
    const mapFile = getResearchProfile(profileId).prefetchMapFile;
    if (prefetchMaps.has(mapFile)) return prefetchMaps.get(mapFile);
    const mapPath = path.join(rootDir, "config", mapFile);
    let loaded;
    try {
      const raw = JSON.parse(fs.readFileSync(mapPath, "utf8"));
      loaded = raw && raw.role_mappings ? raw.role_mappings : {};
    } catch (err) {
      logger.warn({ event: "tool_prefetch_map_load_failed", map: mapFile, error: safeString(err && err.message) });
      loaded = {};
    }
    prefetchMaps.set(mapFile, loaded);
    return loaded;
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

  // Registry design fields carried by ctgov_design_benchmark records (ctgov-design-benchmark.js).
  // Until 2026-11-04 renderRecord printed only title, phase and status for them, so the
  // competitive_intel_analyst, whose task is to compare allocation, masking, enrollment, endpoints
  // and sponsor class, never saw those fields and guessed: run #6 (workflow-6cc2f82c) named Roche
  // as sponsor of NCT07388524, which the registry, in the same run's design-benchmark.csv, gives
  // as the National Cancer Institute. Print exactly what the fetcher returned, one labelled line
  // per group, and nothing for a field it did not return. A record without these fields (every
  // other source) renders exactly as before.
  // Caps keep an outcome-heavy cohort from flooding the prompt (a 50-trial vaccine cohort reached
  // ~70K characters uncapped, one trial listing 31 primary outcomes). The model is told how many
  // were left out; the deterministic design-benchmark deliverable keeps every value.
  const MAX_RENDERED_OUTCOMES = 3;
  const MAX_RENDERED_INTERVENTIONS = 6;
  const MAX_OUTCOME_TEXT = 240;
  const MAX_TIMEFRAME_TEXT = 160;
  function clip(value, max) {
    return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
  }

  function renderRegistryDesignFields(record) {
    const text = (v) => (typeof v === "string" ? v.trim() : "");
    const out = [];
    const sponsor = text(record.sponsor);
    if (sponsor) {
      const sponsorClass = text(record.sponsorClass);
      out.push(`**Lead sponsor:** ${sponsor}${sponsorClass ? ` (class: ${sponsorClass})` : ""}`);
    }
    const design = [];
    if (text(record.allocation)) design.push(`allocation ${text(record.allocation)}`);
    if (text(record.interventionModel)) design.push(`intervention model ${text(record.interventionModel)}`);
    if (text(record.masking)) design.push(`masking ${text(record.masking)}`);
    if (text(record.primaryPurpose)) design.push(`primary purpose ${text(record.primaryPurpose)}`);
    if (Number.isInteger(record.armCount)) design.push(`${record.armCount} arm group${record.armCount === 1 ? "" : "s"}`);
    if (design.length) out.push(`**Design:** ${design.join(" · ")}`);
    if (Number.isFinite(record.enrollmentCount)) {
      const type = text(record.enrollmentType);
      out.push(`**Enrollment:** ${record.enrollmentCount}${type ? ` (${type})` : ""}`);
    }
    if (Array.isArray(record.interventions)) {
      const interventions = record.interventions
        .filter((iv) => isPlainObject(iv) && text(iv.name))
        .map((iv) => (text(iv.type) ? `${text(iv.type)}: ${text(iv.name)}` : text(iv.name)));
      if (interventions.length) {
        const shown = interventions.slice(0, MAX_RENDERED_INTERVENTIONS);
        const more = interventions.length - shown.length;
        out.push(`**Interventions:** ${shown.join("; ")}${more > 0 ? ` (+${more} more)` : ""}`);
      }
    }
    if (Array.isArray(record.primaryOutcomes)) {
      const outcomes = record.primaryOutcomes
        .filter((o) => isPlainObject(o) && text(o.measure))
        .map((o) => {
          const measure = clip(text(o.measure), MAX_OUTCOME_TEXT);
          return text(o.timeFrame) ? `${measure} [time frame: ${clip(text(o.timeFrame), MAX_TIMEFRAME_TEXT)}]` : measure;
        });
      if (outcomes.length) {
        const shown = outcomes.slice(0, MAX_RENDERED_OUTCOMES);
        const more = outcomes.length - shown.length;
        out.push(
          `**Primary outcome${outcomes.length === 1 ? "" : "s"}:** ${shown.join("; ")}` +
          (more > 0 ? ` (+${more} more primary outcome${more === 1 ? "" : "s"} not shown)` : "")
        );
      }
    }
    const dates = [];
    const dated = (value, type) => (text(type) ? `${text(value)} (${text(type)})` : text(value));
    if (text(record.startDate)) dates.push(`start ${dated(record.startDate, record.startDateType)}`);
    if (text(record.primaryCompletionDate)) {
      dates.push(`primary completion ${dated(record.primaryCompletionDate, record.primaryCompletionDateType)}`);
    }
    if (dates.length) out.push(`**Dates:** ${dates.join(" · ")}`);
    return out;
  }

  // The design-benchmark cohort is the only source whose records carry these fields today, and the
  // note below names exactly what that fetcher requests, so it is tied to the tool, never to field
  // names (a future source with a `startDate` must not inherit a ClinicalTrials.gov label).
  const DESIGN_BENCHMARK_TOOL = "ctgov_design_benchmark";
  const DESIGN_BENCHMARK_NOTE =
    "_Registry fields below come from ClinicalTrials.gov, lightly normalized (phases joined, masking " +
    "flattened, arm groups counted, long outcome lists shortened with a count of what was left out). " +
    "Only these were requested for each trial: lead sponsor and class, allocation, intervention model, " +
    "masking, primary purpose, arm-group count, enrollment, interventions, primary outcomes, start and " +
    "primary-completion dates. A requested field missing for a trial was not returned for that trial. " +
    "Anything else (collaborators, conditions, eligibility, secondary outcomes) was not retrieved in this " +
    "run: call it \"not retrieved\", never \"not reported\". Never infer a sponsor, phase or design field " +
    "from a trial title or an intervention name._\n\n";

  // The cohort's denominator and selection rule ride on the array as non-enumerable properties
  // (ctgov-design-benchmark.js). Until 2026-11-04 nothing rendered them, so no role could state
  // "N of M": run #6's narrative said "20 of 20" while its own design-benchmark.md said 20 of 675.
  function renderCohortLine(result) {
    if (!Array.isArray(result) || !Number.isFinite(result.eligibleTotal)) return "";
    const rule = typeof result.selectionRule === "string" && result.selectionRule ? ` Selection rule: ${result.selectionRule}` : "";
    const sort = typeof result.sort === "string" && result.sort ? ` Sort: ${result.sort}.` : "";
    return `_Cohort: ${result.length} of ${result.eligibleTotal} eligible registered programs (a count of ` +
      `ClinicalTrials.gov records, not a patient population).${rule}${sort}_\n\n`;
  }

  // A literature record's real author list (2026-11-04). Until then no author name reached the
  // prompt, so the model wrote bylines from memory: run #7 credited 6 of the 7 papers in its
  // reference table to the wrong people (Feldman et al. as "Chio et al.", Brown & Al-Chalabi as
  // "Paganoni et al." …), all with real, retrieved, resolving identifiers. Two shapes reach here:
  // ToolUniverse rows carry `author_names` (tu-record-normalizer.js, only from a genuine list — the
  // record's `authors` field there falls back to a category or "tooluniverse" and is never printed),
  // and local fetchers carry `authors` as a plain "Calvo A, Moglia C, …" string.
  const MAX_RENDERED_AUTHORS = 5;
  const MAX_AUTHOR_STRING = 240;
  function renderAuthors(record) {
    if (Array.isArray(record.author_names)) {
      const names = record.author_names.filter((n) => typeof n === "string" && n.trim()).map((n) => n.trim());
      if (names.length === 0) return "";
      const shown = names.slice(0, MAX_RENDERED_AUTHORS);
      const total = Number.isInteger(record.author_count) && record.author_count > names.length ? record.author_count : names.length;
      const rest = total - shown.length;
      const count = record.author_count_is_minimum === true ? `at least ${total} authors` : `${total} authors`;
      return `**Authors:** ${shown.join(", ")}${rest > 0 ? ` et al. (${count})` : ""}`;
    }
    if (typeof record.authors === "string" && record.authors.trim()) {
      const s = record.authors.trim().replace(/\.$/, "");
      return `**Authors:** ${s.length > MAX_AUTHOR_STRING ? `${s.slice(0, MAX_AUTHOR_STRING - 1).trimEnd()}… (list shortened)` : s}`;
    }
    return "";
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
    lines.push(...renderRegistryDesignFields(record));
    const byline = renderAuthors(record);
    if (byline) lines.push(byline);
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
    // Design-benchmark cohort: state N of M and what was (and was not) requested, once, before the
    // records, so the model neither invents a denominator nor fills a missing field from a title.
    if (toolName === DESIGN_BENCHMARK_TOOL && !contextOnly && Array.isArray(result) && result.length > 0) {
      body += renderCohortLine(result);
      body += DESIGN_BENCHMARK_NOTE;
    }
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
    // Evidence Desk (2026-10-21): the structured records behind the rendered text, for the business
    // lane's deterministic evidence brief. Non-enumerable, so they never spread, serialize or reach
    // a prompt; the rendered `content` stays the only thing a model reads.
    const records = Array.isArray(result) ? result : isPlainObject(result) ? [result] : [];
    Object.defineProperty(doc, "records", { value: records, enumerable: false, configurable: true });
    Object.defineProperty(doc, "tool_name", { value: toolName, enumerable: false, configurable: true });
    return doc;
  }

  async function prefetchForRole(roleName, workflowInputs = {}) {
    if (!toolUniverseMcp || typeof toolUniverseMcp.execute !== "function") {
      logger.warn({ event: "tool_prefetch_no_mcp", role: roleName });
      return [];
    }

    const role = safeString(roleName);
    if (!role) return [];

    const mappings = loadPrefetchMap(workflowInputs && workflowInputs.research_profile);
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

      // Evidence Desk (2026-10-21). `requires`: workflow inputs the entry needs (the BLS series only
      // for a U.S. run, Eurostat only for a European one). `local_only`: a source served only by a
      // local fetcher, which the runtime wires only when its key exists (Census, EIA). Either unmet →
      // recorded as SKIPPED (a configuration no-op, not a search) and never sent to ToolUniverse.
      const requires = Array.isArray(queryDef.requires) ? queryDef.requires : [];
      const missingInput = requires.find((key) => !safeString(workflowInputs && workflowInputs[key]));
      const unwiredLocal = queryDef.local_only === true && typeof localFetchers[safeString(queryDef.tool_name)] !== "function";
      if (missingInput || unwiredLocal) {
        logger.info({
          event: "tool_prefetch_skipped_not_applicable",
          role,
          tool_name: covSource,
          reason: missingInput ? `requires ${missingInput}` : "local fetcher not wired"
        });
        coverage.push({ role, source: covSource, action, query: resolvedQuery, status: "skipped", records: 0 });
        continue;
      }

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
