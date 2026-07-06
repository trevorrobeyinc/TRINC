"use strict";

/**
 * Content extraction: fetch a URL and return clean, LLM-friendly text/markdown.
 * Pure-Node pipeline (no headless browser): jsdom → Mozilla Readability → Turndown.
 *
 * @module extract
 */

const { JSDOM, VirtualConsole } = require("jsdom");
const { Readability, isProbablyReaderable } = require("@mozilla/readability");
const TurndownService = require("turndown");
const { CONFIG } = require("./config.js");
const { hostOf } = require("./searxng.js");

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});
// Drop noise that never carries article content.
turndown.remove(["script", "style", "noscript", "iframe", "svg", "form"]);

/** Fetch a URL with a timeout + browser-like UA. Returns { ok, status, contentType, text }. */
async function fetchUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.fetchTimeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": CONFIG.userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });
    const contentType = res.headers.get("content-type") || "";
    const text = await res.text();
    return { ok: res.ok, status: res.status, contentType, text };
  } finally {
    clearTimeout(timer);
  }
}

/** Collapse excessive blank lines and trim to the configured character cap. */
function tidy(str, maxChars) {
  const cleaned = String(str || "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  const cap = maxChars || CONFIG.maxExtractChars;
  return cleaned.length > cap
    ? cleaned.slice(0, cap) + "\n\n…[truncated]"
    : cleaned;
}

/**
 * Extract readable content from one URL.
 *
 * @param {string} url
 * @param {object} [opts]
 * @param {"markdown"|"text"} [opts.format="markdown"]
 * @param {number} [opts.maxChars]
 * @returns {Promise<{url:string, raw_content:string, title:string|null, length:number}>}
 * @throws {Error} on network / parse failure (caller records it in failed_results)
 */
async function extractOne(url, opts = {}) {
  const format = opts.format === "text" ? "text" : "markdown";
  const { ok, status, contentType, text } = await fetchUrl(url);

  if (!ok) throw new Error(`HTTP ${status}`);

  // Non-HTML (PDF, JSON, plain text, etc.): return the body as-is when it's
  // text-ish, otherwise report that binary content can't be extracted here.
  if (contentType && !/html/i.test(contentType)) {
    // text/*, JSON, and any XML-family type (xml, rss+xml, atom+xml, …) are extractable as-is.
    if (/^(text\/|application\/(json|.*xml))/i.test(contentType)) {
      return {
        url,
        raw_content: tidy(text, opts.maxChars),
        title: null,
        length: text.length,
      };
    }
    throw new Error(`unsupported content-type "${contentType.split(";")[0]}"`);
  }

  // Silence jsdom's noisy CSS/JS parse errors — we only want the text.
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(text, { url, virtualConsole });
  const doc = dom.window.document;

  let title = null;
  let bodyText = "";
  try {
    const reader = new Readability(doc.cloneNode(true));
    const article = reader.parse();
    if (article && (article.content || article.textContent)) {
      title = article.title || doc.title || null;
      bodyText =
        format === "markdown"
          ? turndown.turndown(article.content || "")
          : article.textContent || "";
    }
  } catch {
    /* fall through to the whole-document fallback below */
  }

  // Readability can bail on non-article pages — fall back to the full document.
  if (!bodyText || bodyText.trim().length < 40) {
    title = title || doc.title || null;
    bodyText =
      format === "markdown"
        ? turndown.turndown(doc.body ? doc.body.innerHTML : text)
        : doc.body
          ? doc.body.textContent
          : text;
  }

  const raw_content = tidy(bodyText, opts.maxChars);
  if (!raw_content) throw new Error("no extractable content");
  return { url, raw_content, title, length: raw_content.length };
}

/** Simple promise pool so a big `urls` list doesn't open 50 sockets at once. */
async function mapPool(items, worker, concurrency) {
  const out = new Array(items.length);
  let i = 0;
  // Never let a bad concurrency value (0/NaN/negative) collapse to zero runners,
  // which would silently skip every item.
  const lanes = Math.max(1, Math.min(Math.trunc(concurrency) || 1, items.length));
  const runners = Array.from({ length: lanes }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return out;
}

/**
 * Extract many URLs, Tavily-shaped.
 * @returns {Promise<{results:Array, failed_results:Array, response_time:number}>}
 */
async function extract(urls, opts = {}) {
  const started = Date.now();
  const list = (Array.isArray(urls) ? urls : [urls]).filter(Boolean);
  const results = [];
  const failed_results = [];

  await mapPool(
    list,
    async (url) => {
      try {
        results.push(await extractOne(url, opts));
      } catch (err) {
        failed_results.push({ url, error: err.message || String(err) });
      }
    },
    CONFIG.extractConcurrency
  );

  return { results, failed_results, response_time: (Date.now() - started) / 1000 };
}

/**
 * Collect same-host links from a page (the crawl primitive behind `map`).
 * @returns {Promise<string[]>} absolute, deduped, same-host URLs
 */
async function sameHostLinks(pageUrl) {
  const { ok, status, contentType, text } = await fetchUrl(pageUrl);
  if (!ok) throw new Error(`HTTP ${status}`);
  if (contentType && !/html/i.test(contentType)) return [];

  const base = hostOf(pageUrl);
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(text, { url: pageUrl, virtualConsole });
  const anchors = dom.window.document.querySelectorAll("a[href]");
  const seen = new Set();
  for (const a of anchors) {
    const href = a.getAttribute("href");
    if (!href || href.startsWith("#") || /^(mailto:|javascript:|tel:)/i.test(href)) continue;
    let abs;
    try {
      abs = new URL(href, pageUrl).toString().split("#")[0];
    } catch {
      continue;
    }
    if (hostOf(abs) === base) seen.add(abs);
  }
  return [...seen];
}

module.exports = { extract, extractOne, sameHostLinks };
