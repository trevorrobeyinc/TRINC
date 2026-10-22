"use strict";

// world-bank.js — business-lane local fetcher for World Bank indicators (2026-10-21).
//
// Macro context a cost or market report leans on (inflation, growth, lending rates, labour) from
// the World Bank Indicators API v2: public, keyless, HTTPS. Each record carries `WB: <indicator>`
// so the value is citable; the re-resolver confirms the indicator code exists. The VALUE is shown
// exactly as the API returned it, with its year — never rounded, never extrapolated.
//
// Fail-soft: any error for one indicator skips that indicator; the rest still return.

const { DEFAULT_ORG, DEFAULT_CONTACT } = require("./polite-http.js");

const API = "https://api.worldbank.org/v2";

// Default set when a template names none: the macro series most business reports need.
const DEFAULT_INDICATORS = Object.freeze([
  "NY.GDP.MKTP.KD.ZG", // GDP growth (annual %)
  "FP.CPI.TOTL.ZG", // Inflation, consumer prices (annual %)
  "FR.INR.LEND", // Lending interest rate (%)
  "SL.UEM.TOTL.ZS", // Unemployment (% of labour force, modelled ILO estimate)
  "NY.GDP.MKTP.CD" // GDP (current US$)
]);

const INDICATOR_RE = /^[A-Z]{2,4}(?:\.[A-Z0-9]{1,8}){1,5}$/;
const COUNTRY_RE = /^[A-Za-z]{2,3}$/;

function createWorldBank(options = {}) {
  const logger =
    options.logger && typeof options.logger.warn === "function"
      ? options.logger
      : { info() {}, warn() {}, error() {} };
  const fetchImpl = options.fetchImpl || (typeof fetch === "function" ? fetch : null);
  const timeoutMs = Number(options.timeoutMs) || 15_000;
  // Declared requester, like every Evidence Desk source (2026-10-21; this fetcher sent none before).
  const userAgent = `${options.org || DEFAULT_ORG} ${options.contactEmail || DEFAULT_CONTACT}`;
  const cache = new Map();

  async function getJson(url) {
    if (typeof fetchImpl !== "function") throw new Error("no fetch implementation available");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        signal: controller.signal,
        headers: { "User-Agent": userAgent, Accept: "application/json" }
      });
      if (!res || !res.ok) throw new Error(`HTTP ${res ? res.status : "no-response"}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * @param {object} args
   * @param {string} [args.country]     ISO2/ISO3 code; default "US"
   * @param {string} [args.indicators]  comma-separated indicator codes; default DEFAULT_INDICATORS
   * @returns {Promise<Array<object>>}
   */
  async function latestIndicators(args = {}) {
    const country = COUNTRY_RE.test(String(args.country || "")) ? String(args.country).toUpperCase() : "US";
    const requested = typeof args.indicators === "string" && args.indicators.trim()
      ? args.indicators.split(",").map((s) => s.trim()).filter((s) => INDICATOR_RE.test(s))
      : DEFAULT_INDICATORS.slice();
    const cacheKey = `${country}|${requested.join(",")}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const records = [];
    for (const code of requested) {
      const url = `${API}/country/${encodeURIComponent(country)}/indicator/${encodeURIComponent(code)}?format=json&mrnev=1`;
      let body;
      try {
        body = await getJson(url);
      } catch (err) {
        logger.info({ event: "world_bank_indicator_failed", code, country, error: String(err && err.message) });
        continue;
      }
      const row = Array.isArray(body) && Array.isArray(body[1]) ? body[1][0] : null;
      if (!row || row.value === null || row.value === undefined) continue;
      const name = (row.indicator && row.indicator.value) || code;
      const place = (row.country && row.country.value) || country;
      records.push({
        title: `${name} — ${place} (${row.date})`,
        year: String(row.date || ""),
        text: `WB: ${code}\nValue: ${row.value} (${place}, ${row.date}; World Bank World Development Indicators)`,
        url: `https://data.worldbank.org/indicator/${code}?locations=${country}`,
        // Structured copy for the Evidence Desk brief (never rendered into a prompt by itself).
        stat: {
          source: "World Bank",
          cite: `WB: ${code}`,
          series: name,
          value: String(row.value),
          unit: "",
          period: String(row.date || ""),
          geo: place
        }
      });
    }
    logger.info({ event: "world_bank_completed", country, requested: requested.length, returned: records.length });
    cache.set(cacheKey, records);
    return records;
  }

  return Object.freeze({ latestIndicators });
}

module.exports = { createWorldBank, DEFAULT_INDICATORS };
