"use strict";

// bls.js — Evidence Desk source: U.S. Bureau of Labor Statistics series (2026-10-21).
//
// Wages, employment and prices by industry answer "what do comparable organisations pay" better
// than any web page, and every BLS series has a stable id. Each record carries `BLS: <series id>`,
// which the extractor grounds and the re-resolver checks against the BLS API at delivery.
//
// Which series: config/business-series-map.json (series-map.js), never a model guess. One batched
// POST per run (the keyless API allows 25 queries a day and 25 series a query; a free key raises
// that to 500 and 50 and switches to v2). The VALUE is shown exactly as BLS returned it, with its
// period and BLS's own "preliminary" footnote — never rounded, never extrapolated.
//
// A transport failure, an HTTP error or a refusal ("REQUEST_NOT_PROCESSED", e.g. the daily limit)
// is THROWN, so tool-prefetch records the source as failed rather than as an honest zero. Nothing
// here retries or works around a limit.

const { createPoliteHttp } = require("./polite-http.js");
const { loadSeriesMap, blsSeriesFor, describeSeries } = require("./series-map.js");

const API_V1 = "https://api.bls.gov/publicAPI/v1/timeseries/data/";
const API_V2 = "https://api.bls.gov/publicAPI/v2/timeseries/data/";
const SERIES_RE = /^[A-Z0-9]{8,30}$/;
const MAX_SERIES_KEYLESS = 25;
const MAX_SERIES_KEYED = 50;

function createBls(options = {}) {
  const logger =
    options.logger && typeof options.logger.warn === "function"
      ? options.logger
      : { info() {}, warn() {}, error() {} };
  const client = options.client || createPoliteHttp(options);
  const apiKey = typeof options.apiKey === "string" ? options.apiKey.trim() : "";
  const seriesMap = options.seriesMap || null;
  const rootDir = options.rootDir;
  const cache = new Map();

  function mapOrLoad() {
    return seriesMap || loadSeriesMap(rootDir);
  }

  /**
   * @param {object} args
   * @param {string} [args.industry]  industry words, matched against the series map
   * @param {string} [args.topic]     the question; matched only when industry matches nothing
   * @param {string} [args.series]    comma-separated explicit series ids (replaces the map)
   * @returns {Promise<Array<object>>}
   */
  async function latestSeries(args = {}) {
    const map = mapOrLoad();
    const explicit = typeof args.series === "string" && args.series.trim()
      ? args.series.split(",").map((s) => s.trim().toUpperCase()).filter((s) => SERIES_RE.test(s))
      : [];
    const max = apiKey ? MAX_SERIES_KEYED : MAX_SERIES_KEYLESS;
    const requested = (explicit.length ? explicit : blsSeriesFor(map, args)).slice(0, max);
    if (requested.length === 0) return [];
    const cacheKey = requested.join(",");
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const body = { seriesid: requested };
    if (apiKey) body.registrationkey = apiKey;
    const res = await client.send(apiKey ? API_V2 : API_V1, { method: "POST", body });
    if (res.status !== 200) throw new Error(`BLS HTTP ${res.status}`);
    const data = client.parseJson(res);
    if (!data || data.status !== "REQUEST_SUCCEEDED") {
      const message = data && Array.isArray(data.message) ? data.message.join(" ") : "unparseable response";
      throw new Error(`BLS ${(data && data.status) || "error"}: ${message}`);
    }

    const records = [];
    const missing = [];
    const series = data.Results && Array.isArray(data.Results.series) ? data.Results.series : [];
    for (const id of requested) {
      const s = series.find((x) => x && String(x.seriesID).toUpperCase() === id);
      const rows = s && Array.isArray(s.data) ? s.data : [];
      const row = rows.find((r) => r && r.latest === "true") || rows[0];
      if (!row || row.value === undefined || row.value === null || row.value === "-") {
        missing.push(id);
        continue;
      }
      const { title, unit } = describeSeries(map, "bls", id);
      const period = `${row.periodName || row.period} ${row.year}`;
      const footnotes = (Array.isArray(row.footnotes) ? row.footnotes : [])
        .map((f) => f && f.text)
        .filter(Boolean);
      const note = footnotes.length ? ` (${footnotes.join("; ")})` : "";
      records.push({
        title: `${title || id} — ${period}`,
        year: String(row.year || ""),
        text: [
          `BLS: ${id}`,
          `Series: ${title || id}${unit ? ` — ${unit}` : ""}`,
          `Value: ${row.value} (${period}${note}; U.S. Bureau of Labor Statistics)`
        ].join("\n"),
        url: `https://data.bls.gov/timeseries/${id}`,
        stat: {
          source: "BLS",
          cite: `BLS: ${id}`,
          series: title || id,
          value: String(row.value),
          unit: unit || "",
          period: `${period}${note}`,
          geo: "United States"
        }
      });
    }
    if (missing.length) logger.warn({ event: "bls_series_without_data", series: missing });
    logger.info({ event: "bls_completed", requested: requested.length, returned: records.length, keyed: Boolean(apiKey) });
    cache.set(cacheKey, records);
    return records;
  }

  return Object.freeze({ latestSeries });
}

module.exports = { createBls, SERIES_RE, API_V1, API_V2 };
