"use strict";

// eia.js — Evidence Desk source (P2, DORMANT until EIA_API_KEY exists): U.S. Energy Information
// Administration retail electricity and natural-gas prices (2026-10-21).
//
// Each record carries `EIA: <series id>` (EIA's legacy series-id form, which the v2 API still
// serves under /v2/seriesid/), grounded by the extractor and re-checked at delivery. Which series:
// config/business-series-map.json.
//
// NOT LIVE-VERIFIED: every EIA request needs a key, so no response has been read yet. The parser
// therefore trusts nothing it does not recognise: a row must carry a `period` and a numeric
// `value` or `price` field, or the series is skipped and logged — never a guessed number. Confirm
// the response shape on activation (docs/business-research-lane.md, P2).
//
// The key never appears in a record, a URL shown to the model, or a log line.

const { createPoliteHttp } = require("./polite-http.js");
const { loadSeriesMap, eiaSeriesFor, describeSeries } = require("./series-map.js");

const API = "https://api.eia.gov/v2/seriesid/";
const SERIES_RE = /^[A-Z]{2,6}\.[A-Z0-9_.-]{1,40}[A-Z0-9]$/;
const VALUE_FIELDS = ["value", "price"];
const UNIT_FIELDS = ["units", "price-units", "unit"];

function latestRow(rows) {
  const usable = rows.filter((r) => r && typeof r.period === "string" && r.period);
  usable.sort((a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : 0));
  return usable[0] || null;
}

function createEia(options = {}) {
  const logger =
    options.logger && typeof options.logger.warn === "function"
      ? options.logger
      : { info() {}, warn() {}, error() {} };
  const client = options.client || createPoliteHttp(options);
  const apiKey = typeof options.apiKey === "string" ? options.apiKey.trim() : "";
  const seriesMap = options.seriesMap || null;
  const rootDir = options.rootDir;
  const cache = new Map();

  /** @returns {Promise<Array<object>>} */
  async function latestPrices() {
    if (!apiKey) throw new Error("EIA: EIA_API_KEY is not configured");
    const map = seriesMap || loadSeriesMap(rootDir);
    const requested = eiaSeriesFor(map).filter((id) => SERIES_RE.test(id));
    const cacheKey = requested.join(",");
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const records = [];
    let failures = 0;
    for (const id of requested) {
      let res;
      try {
        res = await client.send(`${API}${encodeURIComponent(id)}?api_key=${encodeURIComponent(apiKey)}`);
      } catch (err) {
        failures++;
        logger.warn({ event: "eia_request_failed", series: id, error: String(err && err.message) });
        continue;
      }
      const body = client.parseJson(res);
      const rows = body && body.response && Array.isArray(body.response.data) ? body.response.data : null;
      if (res.status !== 200 || !rows) {
        failures++;
        logger.warn({ event: "eia_series_refused", series: id, status: res.status });
        continue;
      }
      const row = latestRow(rows);
      const valueField = row && VALUE_FIELDS.find((f) => typeof row[f] === "number" || (typeof row[f] === "string" && /^-?\d+(?:\.\d+)?$/.test(row[f])));
      if (!row || !valueField) {
        logger.warn({ event: "eia_series_unrecognised_shape", series: id });
        continue;
      }
      const unitField = UNIT_FIELDS.find((f) => typeof row[f] === "string" && row[f]);
      const unit = unitField ? row[unitField] : "";
      const { title } = describeSeries(map, "eia", id);
      records.push({
        title: `${title || id} — ${row.period}`,
        year: String(row.period).slice(0, 4),
        text: [
          `EIA: ${id}`,
          `Series: ${title || id}`,
          `Value: ${row[valueField]}${unit ? ` ${unit}` : ""} (${row.period}; U.S. Energy Information Administration)`
        ].join("\n"),
        url: "https://www.eia.gov/opendata/",
        stat: {
          source: "EIA",
          cite: `EIA: ${id}`,
          series: title || id,
          value: String(row[valueField]),
          unit,
          period: String(row.period),
          geo: "United States"
        }
      });
    }
    if (requested.length > 0 && failures === requested.length) throw new Error(`EIA: all ${failures} requests failed`);
    logger.info({ event: "eia_completed", requested: requested.length, returned: records.length });
    cache.set(cacheKey, records);
    return records;
  }

  return Object.freeze({ latestPrices });
}

module.exports = { createEia, SERIES_RE };
