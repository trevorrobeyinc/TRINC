"use strict";

// census.js — Evidence Desk source (P2, DORMANT until CENSUS_API_KEY exists): U.S. Census Bureau
// County Business Patterns (2026-10-21).
//
// Establishments, employees and annual payroll for an industry (NAICS), nationally. Each record
// carries `CENSUS: cbp/<year>/<naics>`, which the extractor grounds and the re-resolver re-queries
// at delivery. Which NAICS code: config/business-series-map.json; an unmatched industry sends no
// request at all (there is no "closest" code to guess).
//
// Verified 2026-10-21 (keyless metadata): CBP 2023 exists with NAICS2017 and PAYANN
// ("Annual payroll ($1,000)"). A DATA request needs a key: keyless, Census answers HTTP 200 with an
// HTML "Missing Key" page, so a 200 is never trusted without a JSON body. The data response shape
// below follows the Census API documentation and is to be confirmed on activation
// (docs/business-research-lane.md, P2).
//
// The key never appears in a record, a URL shown to the model, or a log line.

const { createPoliteHttp } = require("./polite-http.js");
const { loadSeriesMap, censusNaicsFor } = require("./series-map.js");

const API = "https://api.census.gov/data";
const NAICS_RE = /^\d{2}(?:-\d{2})?$|^\d{3,6}$/;

// The Census API's own variable labels (variables/<NAME>.json, read 2026-10-21).
const FIELD_LABELS = Object.freeze({
  ESTAB: "Number of establishments",
  EMP: "Number of employees",
  PAYANN: "Annual payroll ($1,000)"
});

function createCensus(options = {}) {
  const logger =
    options.logger && typeof options.logger.warn === "function"
      ? options.logger
      : { info() {}, warn() {}, error() {} };
  const client = options.client || createPoliteHttp(options);
  const apiKey = typeof options.apiKey === "string" ? options.apiKey.trim() : "";
  const seriesMap = options.seriesMap || null;
  const rootDir = options.rootDir;
  const cache = new Map();

  /**
   * @param {object} args  { industry, topic }
   * @returns {Promise<Array<object>>}
   */
  async function businessPatterns(args = {}) {
    if (!apiKey) throw new Error("Census: CENSUS_API_KEY is not configured");
    const map = seriesMap || loadSeriesMap(rootDir);
    const naics = censusNaicsFor(map, args);
    if (!NAICS_RE.test(naics)) {
      logger.info({ event: "census_no_industry_match", note: "no NAICS code in the series map for this run — no request sent" });
      return [];
    }
    const year = String((map.census && map.census.cbp_year) || "");
    const variables = (map.census && map.census.variables) || ["NAICS2017_LABEL", "ESTAB", "EMP", "PAYANN"];
    const cacheKey = `${year}|${naics}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const params = new URLSearchParams({ get: variables.join(","), for: "us:*", NAICS2017: naics, key: apiKey });
    const res = await client.send(`${API}/${encodeURIComponent(year)}/cbp?${params.toString()}`);
    if (res.status === 204) {
      cache.set(cacheKey, []);
      return [];
    }
    const rows = client.parseJson(res);
    if (res.status !== 200 || !Array.isArray(rows)) {
      // A 200 without JSON is the HTML "Missing Key" / "Invalid Key" page, not data.
      throw new Error(`Census CBP: HTTP ${res.status}${res.status === 200 ? " without a JSON body (key missing or rejected)" : ""}`);
    }
    const [header, row] = rows;
    if (!Array.isArray(header) || !Array.isArray(row)) {
      cache.set(cacheKey, []);
      return [];
    }
    const field = (name) => {
      const i = header.indexOf(name);
      return i >= 0 ? row[i] : undefined;
    };
    const label = field("NAICS2017_LABEL") || `NAICS ${naics}`;
    const cite = `CENSUS: cbp/${year}/${naics}`;
    const present = Object.keys(FIELD_LABELS).filter((name) => field(name) !== undefined && field(name) !== null);
    const stats = present.map((name) => ({
      source: "Census",
      cite,
      series: `${FIELD_LABELS[name]}, ${label}`,
      value: String(field(name)),
      unit: name === "PAYANN" ? "$1,000" : "count",
      period: year,
      geo: "United States"
    }));
    const records = stats.length === 0 ? [] : [{
      title: `County Business Patterns ${year}: ${label} (NAICS ${naics}), United States`,
      year,
      text: [
        cite,
        `County Business Patterns ${year}, United States, NAICS ${naics} (${label})`,
        ...present.map((name) => `${FIELD_LABELS[name]}: ${field(name)}`),
        "Source: U.S. Census Bureau, County Business Patterns"
      ].join("\n"),
      url: "https://www.census.gov/programs-surveys/cbp.html",
      stat: stats
    }];
    logger.info({ event: "census_cbp_completed", year, naics, returned: records.length });
    cache.set(cacheKey, records);
    return records;
  }

  return Object.freeze({ businessPatterns });
}

module.exports = { createCensus, NAICS_RE };
