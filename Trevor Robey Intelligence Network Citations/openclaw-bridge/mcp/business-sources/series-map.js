"use strict";

// series-map.js — which official-statistics series a business-lane run pulls (Evidence Desk,
// 2026-10-21).
//
// Reads config/business-series-map.json: a reviewed table of industry → NAICS / NACE → the BLS
// series, Eurostat datasets, Census CBP code and EIA series for that industry. So "warehousing"
// reliably pulls the NAICS 493 series instead of the model guessing a series id. Matching is
// deterministic: a match term must start a word in the run's `industry` input (then, failing
// that, its `topic`), the first industry in file order that matches wins, and the default series
// are always included. An unmatched run still gets the defaults; it never gets a guess.

const fs = require("node:fs");
const path = require("node:path");

const MAP_FILE = "business-series-map.json";
const loaded = new Map();

/** The parsed map for a root directory, cached per file. Throws if the file is missing or invalid. */
function loadSeriesMap(rootDir) {
  const file = path.join(rootDir || process.cwd(), "config", MAP_FILE);
  if (loaded.has(file)) return loaded.get(file);
  const map = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!map || map.schema_version !== "business-series-map-v1" || !Array.isArray(map.industries)) {
    throw new Error(`${MAP_FILE}: unexpected schema`);
  }
  loaded.set(file, map);
  return map;
}

function mentions(text, term) {
  const escaped = String(term).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}`, "u").test(String(text || "").toLowerCase());
}

/**
 * The industry entry a run is about, or null. `industry` is checked before `topic`, so an explicit
 * industry input always beats a word that happens to appear in the question.
 */
function resolveIndustry(map, { industry, topic } = {}) {
  const list = map && Array.isArray(map.industries) ? map.industries : [];
  for (const text of [industry, topic]) {
    if (typeof text !== "string" || !text.trim()) continue;
    const hit = list.find((entry) => (entry.match || []).some((term) => mentions(text, term)));
    if (hit) return hit;
  }
  return null;
}

function uniq(list) {
  return [...new Set(list)];
}

/** BLS series ids for a run: the industry's series first, then the defaults. */
function blsSeriesFor(map, args = {}) {
  const entry = resolveIndustry(map, args);
  const bls = (map && map.bls) || {};
  return uniq([...((entry && entry.bls) || []), ...(bls.default_series || [])]);
}

/** Eurostat queries for a run: the defaults, plus the labour-cost dataset filtered to the industry. */
function eurostatQueriesFor(map, args = {}) {
  const eurostat = (map && map.eurostat) || {};
  const datasets = eurostat.datasets || {};
  const entry = resolveIndustry(map, args);
  const out = [];
  for (const id of eurostat.default_datasets || []) {
    if (datasets[id]) out.push({ dataset: id, ...datasets[id], filter: { ...datasets[id].filter } });
  }
  const labour = datasets.lc_lci_lev;
  if (labour) {
    const dim = labour.industry_dimension || "nace_r2";
    // Unmatched industry → the whole business economy (B-S), labelled as such by the API itself.
    const code = (entry && entry.nace_r2) || "B-S";
    out.push({ dataset: "lc_lci_lev", ...labour, filter: { ...labour.filter, [dim]: code } });
  }
  return out;
}

/** The Census CBP NAICS code for a run, or "" when no industry matched (never a guess). */
function censusNaicsFor(map, args = {}) {
  const entry = resolveIndustry(map, args);
  return (entry && entry.census_naics) || "";
}

/** EIA series ids for a run (U.S. level by default). */
function eiaSeriesFor(map) {
  const eia = (map && map.eia) || {};
  return uniq(eia.default_series || []);
}

/** Title and unit the map records for a series id, or {} when it has none. */
function describeSeries(map, source, id) {
  const table = map && map[source] && map[source].series;
  return (table && table[id]) || {};
}

module.exports = {
  MAP_FILE,
  loadSeriesMap,
  resolveIndustry,
  blsSeriesFor,
  eurostatQueriesFor,
  censusNaicsFor,
  eiaSeriesFor,
  describeSeries
};
