"use strict";

/**
 * search_health: a relevance canary for the SearXNG engines.
 *
 * A broken engine rarely errors. On 2026-11-24 Google and Mojeek returned zero results with no error
 * (a JavaScript redirect and a "Captcha" page their modules do not recognise), and Bing returned ten
 * results that ignored all but the first word of the query. So each engine is asked, BY NAME, two
 * known-answer questions, and the answers are judged:
 *
 *   common  a popular technical query a working engine answers well (Bing does, today)
 *   niche   a vendor-documentation query, the kind the research engine needs (Bing answers it with
 *           "first word" decoys; no engine finds the Aruba page)
 *
 * Verdicts per probe: ok, weak (on-topic rows but not the expected site), junk (rows, none on-topic),
 * silent_zero (no rows, no error), none (no rows from an engine that answered the other probe: a small
 * index, not a wall), blocked (the engine refused: CAPTCHA, 429, access denied, HTTP error), error
 * (SearXNG itself failed).
 *
 * @module health
 */

const { CONFIG } = require("./config.js");
const { fetchSearxngOnce, normalizeRow } = require("./searxng.js");
const { queryTerms, assessRow, junkKind } = require("./relevance.js");
const { hostOf, hostMatchesDomain } = require("./url-util.js");
const { TTLCache } = require("./robust.js");

const PROBES = Object.freeze([
  {
    id: "common",
    query: "python asyncio gather return_exceptions",
    hosts: ["python.org", "stackoverflow.com", "superfastpython.com", "pythontutorial.net", "realpython.com", "github.com", "dev.to"],
  },
  {
    id: "niche",
    query: "AOS 10 WIDS containment tarpit",
    hosts: ["arubanetworking.hpe.com", "arubanetworks.com", "hpe.com"],
  },
]);

/** General-category engines that are not web search (answerers, dictionaries, encyclopedias). */
const NON_WEB = new Set([
  "currency", "lingva", "dictzone", "mymemory translated", "wikidata", "wikipedia", "wikibooks",
  "wikiquote", "wikisource", "wikivoyage", "wiktionary", "wikinews", "wikispecies", "wikiversity",
  "duckduckgo definitions", "duckduckgo weather", "wttr.in", "openmeteo", "tineye",
]);

/** Order of badness, worst first, for the engine-level status. */
const SEVERITY = ["error", "blocked", "silent_zero", "junk", "weak", "ok"];

const _cache = new TTLCache(Math.max(1, CONFIG.healthCacheTtlMs), 8);

/**
 * Judge one engine's answer to one probe.
 * @param {object} data   SearXNG JSON for `engines=<engine>`
 * @param {string} engine
 * @param {{id:string, query:string, hosts:string[]}} probe
 */
function classifyProbe(data, engine, probe) {
  const terms = queryTerms(probe.query);
  const unresp = (data && Array.isArray(data.unresponsive_engines) ? data.unresponsive_engines : []).find(
    (u) => Array.isArray(u) && u[0] === engine
  );
  if (unresp) return { verdict: "blocked", reason: String(unresp[1]) };
  const rows = (data && Array.isArray(data.results) ? data.results : []).map(normalizeRow);
  if (rows.length === 0) {
    return {
      verdict: "silent_zero",
      reason: "no results and no error: usually a CAPTCHA or JavaScript wall the engine module does not recognise",
    };
  }
  const assessed = rows.map((r) => assessRow(r, terms));
  const onTopic = assessed.filter((a) => a.on_topic).length;
  const rightSite = rows.slice(0, 10).some((r) => probe.hosts.some((h) => hostMatchesDomain(hostOf(r.url), h)));
  const sample = rows.slice(0, 3).map((r) => `${String(r.title).slice(0, 70)} (${hostOf(r.url)})`);
  const base = { results: rows.length, on_topic: onTopic, expected_site_in_top10: rightSite, sample };
  if (onTopic === 0) return { verdict: "junk", junk: junkKind(assessed, terms), ...base };
  if (probe.id === "niche") return { verdict: rightSite ? "ok" : "weak", ...base };
  return { verdict: rightSite || onTopic >= 2 ? "ok" : "weak", ...base };
}

/**
 * The engine-level status: the worst probe verdict (a niche miss with on-topic rows is "weak"; niche
 * junk makes the engine "junk" even when it answers the common query, which is exactly Bing today).
 */
function engineStatus(probes) {
  // "none" (nothing for one query from an engine that answers another) rates like a niche miss.
  const verdicts = Object.values(probes).map((p) => (p.verdict === "none" ? "weak" : p.verdict));
  if (verdicts.length === 0) return "error";
  if (verdicts.every((v) => v === "silent_zero")) return "silent_zero";
  return verdicts.reduce((worst, v) => (SEVERITY.indexOf(v) < SEVERITY.indexOf(worst) ? v : worst), "ok");
}

/**
 * Probe engines and report. Engines run in parallel (different upstreams); each engine's probes run
 * one after the other, so no upstream sees a burst.
 *
 * @param {object} [args]
 * @param {string} [args.engines]  comma-separated engine names (default: the instance's enabled general
 *                                 web engines plus the configured fallback engines)
 * @param {boolean} [args.refresh] ignore the 10-minute reuse
 * @param {object} [deps]          test seams: { fetchJson(url), enabledEngines() }
 */
async function searchHealth(args = {}, deps = {}) {
  const started = Date.now();
  const fetchJson = deps.fetchJson || fetchSearxngOnce;
  let config = null;
  let reachable = true;
  let configError = null;
  try {
    config = deps.config || (await fetchJson(`${CONFIG.searxngBaseUrl}/config`));
  } catch (err) {
    reachable = false;
    configError = String((err && err.message) || err);
  }
  const enabled = new Set(
    (config && Array.isArray(config.engines) ? config.engines : [])
      .filter((e) => e && e.enabled && Array.isArray(e.categories) && e.categories.includes("general"))
      .map((e) => e.name)
  );
  const requested = args.engines
    ? String(args.engines).split(",").map((e) => e.trim()).filter(Boolean)
    : [...new Set([...[...enabled].filter((e) => !NON_WEB.has(e)), ...CONFIG.fallbackEngines])];

  const cacheKey = requested.join(",");
  if (!args.refresh && CONFIG.healthCacheTtlMs > 0) {
    const hit = _cache.get(cacheKey);
    if (hit) return { ...hit, cached: true };
  }

  const engines = await Promise.all(
    requested.map(async (engine) => {
      const probes = {};
      for (const probe of PROBES) {
        const qs = new URLSearchParams({ q: probe.query, format: "json", engines: engine });
        try {
          const data = await fetchJson(`${CONFIG.searxngBaseUrl}/search?${qs}`);
          probes[probe.id] = classifyProbe(data, engine, probe);
        } catch (err) {
          probes[probe.id] = { verdict: "error", reason: String((err && err.message) || err).slice(0, 200) };
        }
      }
      // An engine that returned rows for one probe is not walled: its zero for the other is just "none"
      // (seen 2026-11-24: mwmbl answers the common query and has nothing for the niche one).
      if (Object.values(probes).some((p) => ["ok", "weak", "junk"].includes(p.verdict))) {
        for (const p of Object.values(probes)) {
          if (p.verdict === "silent_zero") {
            p.verdict = "none";
            p.reason = "no results for this query; the engine answers others, so this is a small index, not a wall";
          }
        }
      }
      return { engine, enabled_by_default: enabled.has(engine), status: engineStatus(probes), probes };
    })
  );

  const commonOk = engines.filter((e) => e.probes.common && e.probes.common.verdict === "ok");
  const nicheOk = engines.filter((e) => e.probes.niche && e.probes.niche.verdict === "ok");
  const junk = engines.filter((e) => Object.values(e.probes).some((p) => p.verdict === "junk"));
  const general_web = commonOk.length === 0 ? "down" : nicheOk.length === 0 ? "degraded" : "ok";
  const summary =
    `${commonOk.length} of ${engines.length} engines answer the common query` +
    (nicheOk.length ? `; ${nicheOk.map((e) => e.engine).join(", ")} found the niche page` : "; none finds the niche (vendor docs) page") +
    (junk.length
      ? `; junk from ${junk.map((e) => `${e.engine} (${Object.values(e.probes).filter((p) => p.verdict === "junk").map((p) => p.junk).join("/")})`).join(", ")}`
      : "") +
    (general_web !== "ok" ? ". For vendor documentation use docs_search." : ".");

  const out = {
    searxng: { base_url: CONFIG.searxngBaseUrl, reachable, version: (config && config.version) || null, ...(configError ? { error: configError } : {}) },
    general_web,
    summary,
    engines,
    probes: PROBES.map((p) => ({ id: p.id, query: p.query, expected_sites: p.hosts })),
    checked_at: new Date().toISOString(),
    response_time: (Date.now() - started) / 1000,
  };
  if (CONFIG.healthCacheTtlMs > 0 && reachable) _cache.set(cacheKey, out);
  return out;
}

module.exports = { searchHealth, classifyProbe, engineStatus, PROBES, NON_WEB };
