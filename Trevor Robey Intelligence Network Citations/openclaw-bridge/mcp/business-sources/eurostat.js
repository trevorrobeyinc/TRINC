"use strict";

// eurostat.js — Evidence Desk source: Eurostat statistics for European geographies (2026-10-21).
//
// Energy prices for non-household consumers and hourly labour costs by industry, from the
// Eurostat dissemination API (JSON-stat 2.0, public, keyless). Each record carries
// `EUROSTAT: <dataset code>`; the re-resolver confirms the dataset at delivery, and the record
// states the exact filter the value was read under, in the API's own labels.
//
// Which datasets and filters: config/business-series-map.json (series-map.js). Each query must
// resolve to exactly ONE value; a filter that returns several is a map error and is skipped, never
// "the first one". The value is shown exactly as returned, with its period, geography and any
// Eurostat flag (provisional, estimated, ...).
//
// Runs only for a European geography (`geo`, derived from the run's country by
// research-profiles.js). If every query fails in transport or HTTP, the call THROWS so the
// coverage ledger records a failure, not an honest zero.

const { createPoliteHttp } = require("./polite-http.js");
const { loadSeriesMap, eurostatQueriesFor } = require("./series-map.js");

const API = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/";
const DATASET_RE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+){1,5}$/;
const GEO_RE = /^(?:[A-Z]{2}|EU27_2020|EA20)$/;

// Eurostat's published observation flags.
const FLAGS = Object.freeze({
  b: "break in time series",
  c: "confidential",
  d: "definition differs",
  e: "estimated",
  f: "forecast",
  n: "not significant",
  p: "provisional",
  r: "revised",
  s: "Eurostat estimate",
  u: "low reliability",
  z: "not applicable"
});

function firstLabel(dimension) {
  const labels = dimension && dimension.category && dimension.category.label;
  const values = labels ? Object.values(labels) : [];
  return values.length === 1 ? String(values[0]) : "";
}

function onlyValue(container) {
  if (Array.isArray(container)) {
    const present = container.map((v, i) => [String(i), v]).filter(([, v]) => v !== null && v !== undefined);
    return present.length === 1 ? present[0] : null;
  }
  const entries = container && typeof container === "object" ? Object.entries(container) : [];
  return entries.length === 1 ? entries[0] : null;
}

function createEurostat(options = {}) {
  const logger =
    options.logger && typeof options.logger.warn === "function"
      ? options.logger
      : { info() {}, warn() {}, error() {} };
  const client = options.client || createPoliteHttp(options);
  const seriesMap = options.seriesMap || null;
  const rootDir = options.rootDir;
  const cache = new Map();

  /**
   * @param {object} args
   * @param {string} args.geo          Eurostat geography code (DE, FR, EU27_2020, ...)
   * @param {string} [args.industry]   matched against the series map for the labour-cost filter
   * @param {string} [args.topic]
   * @returns {Promise<Array<object>>}
   */
  async function latestValues(args = {}) {
    const geo = String(args.geo || "").trim().toUpperCase();
    if (!GEO_RE.test(geo)) return [];
    const map = seriesMap || loadSeriesMap(rootDir);
    const queries = eurostatQueriesFor(map, args).filter((q) => DATASET_RE.test(q.dataset));
    const cacheKey = JSON.stringify({ geo, queries: queries.map((q) => [q.dataset, q.filter]) });
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const records = [];
    let failures = 0;
    for (const q of queries) {
      const params = new URLSearchParams({ format: "JSON", lang: "EN", geo });
      for (const [dim, code] of Object.entries(q.filter || {})) params.append(dim, String(code));
      params.append("lastTimePeriod", "1");
      let res;
      try {
        res = await client.send(`${API}${q.dataset}?${params.toString()}`);
      } catch (err) {
        failures++;
        logger.warn({ event: "eurostat_request_failed", dataset: q.dataset, error: String(err && err.message) });
        continue;
      }
      const data = client.parseJson(res);
      if (res.status !== 200 || !data || data.error) {
        failures++;
        logger.warn({ event: "eurostat_query_refused", dataset: q.dataset, status: res.status, error: data && data.error });
        continue;
      }
      const cell = onlyValue(data.value);
      if (!cell || typeof cell[1] !== "number") {
        logger.warn({ event: "eurostat_query_not_single_value", dataset: q.dataset, geo });
        continue;
      }
      const [index, value] = cell;
      const dims = data.dimension || {};
      const period = firstLabel(dims.time);
      const geoLabel = firstLabel(dims.geo) || geo;
      const flag = data.status && typeof data.status === "object" ? data.status[index] : undefined;
      const flagNote = flag ? `; flag ${flag}${FLAGS[flag] ? ` (${FLAGS[flag]})` : ""}` : "";
      const described = (Array.isArray(data.id) ? data.id : [])
        .filter((d) => d !== "time" && d !== "geo" && d !== "freq")
        .map((d) => `${d}=${firstLabel(dims[d]) || "?"}`);
      records.push({
        title: `${data.label || q.title || q.dataset} — ${geoLabel} (${period})`,
        year: period.slice(0, 4),
        text: [
          `EUROSTAT: ${q.dataset}`,
          `Dataset: ${data.label || q.title || q.dataset}`,
          `Value: ${value} (${q.measure || "unit as labelled"}; ${geoLabel}, ${period}${flagNote}; Eurostat${data.updated ? `, updated ${data.updated}` : ""})`,
          `Filter: ${described.join("; ")}`
        ].join("\n"),
        url: `https://ec.europa.eu/eurostat/databrowser/view/${q.dataset}/default/table?lang=en`,
        stat: {
          source: "Eurostat",
          cite: `EUROSTAT: ${q.dataset}`,
          series: data.label || q.title || q.dataset,
          value: String(value),
          unit: q.measure || "",
          period: `${period}${flag ? ` (${FLAGS[flag] || `flag ${flag}`})` : ""}`,
          geo: geoLabel
        }
      });
    }
    if (queries.length > 0 && failures === queries.length) {
      throw new Error(`Eurostat: all ${failures} queries failed`);
    }
    logger.info({ event: "eurostat_completed", geo, requested: queries.length, returned: records.length });
    cache.set(cacheKey, records);
    return records;
  }

  return Object.freeze({ latestValues });
}

module.exports = { createEurostat, DATASET_RE, GEO_RE, FLAGS };
