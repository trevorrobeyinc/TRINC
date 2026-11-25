"use strict";

/**
 * Site inventory primitives: robots.txt `Sitemap:` lines, sitemap and sitemap-index XML, and llms.txt
 * link lists. Parsing is pure; `collectSitemapUrls` walks sitemap indexes through an INJECTED fetcher
 * (the connector passes its SSRF-guarded one), bounded by a sitemap count and a url count so a huge or
 * looping index cannot run away.
 *
 * Measured 2026-11-24: every vendor documentation root the research engine needs publishes one of
 * these (CrowdStrike 460 pages, Samsung Knox admin 2,468, Aruba new-central 2,351, VSG 548, AOS 139,
 * Firewalla help 422), which is what lets `docs_search` and `map` work without any search engine.
 *
 * @module sitemap
 */

const zlib = require("node:zlib");

/** Decode the five XML entities and unwrap CDATA, which is all a sitemap <loc> may carry. */
function decodeXml(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&")
    .trim();
}

/**
 * Parse sitemap XML (urlset or sitemapindex; namespace prefixes tolerated).
 * @param {string} xml
 * @returns {{kind: "urlset"|"index"|"unknown", entries: {loc: string, lastmod: string|null}[]}}
 */
function parseSitemapXml(xml) {
  const text = String(xml || "");
  const isIndex = /<(?:[\w-]+:)?sitemapindex[\s>]/i.test(text);
  const isUrlset = /<(?:[\w-]+:)?urlset[\s>]/i.test(text);
  const block = isIndex
    ? /<(?:[\w-]+:)?sitemap[\s>][\s\S]*?<\/(?:[\w-]+:)?sitemap>/gi
    : /<(?:[\w-]+:)?url[\s>][\s\S]*?<\/(?:[\w-]+:)?url>/gi;
  const locRe = /<(?:[\w-]+:)?loc>([\s\S]*?)<\/(?:[\w-]+:)?loc>/i;
  const modRe = /<(?:[\w-]+:)?lastmod>([\s\S]*?)<\/(?:[\w-]+:)?lastmod>/i;
  const entries = [];
  for (const m of text.matchAll(block)) {
    const loc = locRe.exec(m[0]);
    if (!loc) continue;
    const mod = modRe.exec(m[0]);
    entries.push({ loc: decodeXml(loc[1]), lastmod: mod ? decodeXml(mod[1]) : null });
  }
  // Malformed but common: bare <loc> elements with no <url>/<sitemap> wrapper.
  if (entries.length === 0) {
    for (const m of text.matchAll(/<(?:[\w-]+:)?loc>([\s\S]*?)<\/(?:[\w-]+:)?loc>/gi)) {
      entries.push({ loc: decodeXml(m[1]), lastmod: null });
    }
  }
  return {
    kind: isIndex ? "index" : isUrlset || entries.length ? "urlset" : "unknown",
    entries: entries.filter((e) => /^https?:\/\//i.test(e.loc)),
  };
}

/**
 * The sitemap urls a robots.txt declares (`Sitemap: <url>` lines, any case).
 * @param {string} text
 * @returns {string[]}
 */
function robotsSitemaps(text) {
  const out = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = /^\s*sitemap\s*:\s*(\S+)/i.exec(line);
    if (m && /^https?:\/\//i.test(m[1])) out.push(m[1]);
  }
  return [...new Set(out)];
}

/**
 * Parse an llms.txt (https://llmstxt.org): markdown list items `- [Title](url): description`.
 * Relative links resolve against the file's own url.
 * @param {string} text
 * @param {string} baseUrl
 * @returns {{url: string, title: string, description: string}[]}
 */
function parseLlmsTxt(text, baseUrl) {
  const out = [];
  const seen = new Set();
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = /\[([^\]]+)\]\(([^)\s]+)\)(?:\s*:\s*(.*))?/.exec(line);
    if (!m) continue;
    let url;
    try {
      url = new URL(m[2], baseUrl).toString();
    } catch {
      continue;
    }
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, title: m[1].trim(), description: (m[3] || "").trim() });
  }
  return out;
}

/** decodeXml plus the HTML entities that appear in link text and article bodies. */
function decodeHtml(s) {
  return decodeXml(
    String(s || "")
      .replace(/&nbsp;/g, " ")
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  );
}

/** Strip tags, decode entities, collapse whitespace. */
function stripTags(html) {
  return decodeHtml(String(html || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/**
 * HTML to plain text that keeps paragraph breaks (block-level closers become blank lines), for
 * article bodies a search API returns as HTML (Zendesk). Scripts and styles are dropped.
 */
function htmlToText(html) {
  return decodeHtml(
    String(html || "")
      .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h[1-6]|pre|blockquote|table|ul|ol|section|article)>/gi, "\n\n")
      .replace(/<[^>]*>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Distinct anchor texts kept per url (joined with " · "). */
const MAX_TEXTS_PER_URL = 3;

/**
 * Every link in a page with its anchor text, resolved against `baseUrl`, fragment dropped, deduped.
 * When several links point at one url, their DISTINCT texts are all kept (up to 3, joined with " · "):
 * a ReadMe sidebar links each section's first endpoint twice, once as the section label ("WIDS") and
 * once with its real title ("Get a list of monitored APs over a time period"), and the first-seen text
 * alone was the label for 42 of 419 links on 2026-11-24. A regex, not a DOM: such a page is up to
 * 2.3 MB of HTML whose sidebar IS the site's index, and only the anchors are needed from it.
 * @param {string} html
 * @param {string} baseUrl
 * @returns {{url: string, text: string}[]}
 */
function anchorsFromHtml(html, baseUrl) {
  const out = [];
  const index = new Map();
  const texts = new Map(); // url -> distinct texts
  for (const m of String(html || "").matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[1]);
    if (!href) continue;
    const raw = decodeHtml(href[1] ?? href[2] ?? href[3] ?? "");
    if (!raw || raw.startsWith("#") || /^(mailto:|javascript:|tel:|data:)/i.test(raw)) continue;
    let abs;
    try {
      abs = new URL(raw, baseUrl);
    } catch {
      continue;
    }
    if (abs.protocol !== "https:" && abs.protocol !== "http:") continue;
    abs.hash = "";
    const url = abs.toString();
    const text = stripTags(m[2]).slice(0, 200);
    if (!index.has(url)) {
      index.set(url, out.length);
      out.push({ url, text: "" });
      texts.set(url, []);
    }
    const seen = texts.get(url);
    if (text && !seen.includes(text) && seen.length < MAX_TEXTS_PER_URL) {
      seen.push(text);
      out[index.get(url)].text = seen.join(" · ");
    }
  }
  return out;
}

/**
 * Turn a fetched body into text, gunzipping a `.xml.gz` sitemap. Bounded by `maxBytes` of output.
 * @param {Buffer|Uint8Array|string} body
 * @param {number} maxBytes
 * @returns {string}
 */
function bodyText(body, maxBytes) {
  if (typeof body === "string") return body;
  const buf = Buffer.from(body);
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    return zlib.gunzipSync(buf, { maxOutputLength: maxBytes }).toString("utf8");
  }
  return buf.toString("utf8");
}

/**
 * Walk sitemaps (following sitemap indexes breadth-first) and return every page url, bounded.
 *
 * @param {string[]} startUrls
 * @param {object} opts
 * @param {(url: string) => Promise<{ok: boolean, status: number, text: string}>} opts.fetchText
 * @param {(url: string) => string} [opts.rewrite]  applied to every url before it is fetched or kept
 * @param {number} [opts.maxSitemaps=25]
 * @param {number} [opts.maxUrls=20000]
 * @returns {Promise<{urls: {loc: string, lastmod: string|null}[], sources: object[], truncated: boolean}>}
 */
async function collectSitemapUrls(startUrls, { fetchText, rewrite = (u) => u, maxSitemaps = 25, maxUrls = 20000 }) {
  const queue = [...new Set(startUrls.map(rewrite))];
  const visited = new Set();
  const urls = [];
  const seenUrls = new Set();
  const sources = [];
  let truncated = false;
  while (queue.length) {
    const sm = queue.shift();
    if (visited.has(sm)) continue;
    if (visited.size >= maxSitemaps) {
      truncated = true;
      break;
    }
    visited.add(sm);
    let res;
    try {
      res = await fetchText(sm);
    } catch (err) {
      sources.push({ kind: "sitemap", url: sm, ok: false, error: String((err && err.message) || err) });
      continue;
    }
    if (!res || !res.ok) {
      sources.push({ kind: "sitemap", url: sm, ok: false, error: `HTTP ${res ? res.status : "?"}` });
      continue;
    }
    const parsed = parseSitemapXml(res.text);
    if (parsed.kind === "unknown") {
      sources.push({ kind: "sitemap", url: sm, ok: false, error: "not a sitemap (no <loc> entries)" });
      continue;
    }
    if (parsed.kind === "index") {
      for (const e of parsed.entries) queue.push(rewrite(e.loc));
      sources.push({ kind: "sitemap-index", url: sm, ok: true, count: parsed.entries.length });
      continue;
    }
    let added = 0;
    for (const e of parsed.entries) {
      const loc = rewrite(e.loc);
      if (seenUrls.has(loc)) continue;
      if (urls.length >= maxUrls) {
        truncated = true;
        break;
      }
      seenUrls.add(loc);
      urls.push({ loc, lastmod: e.lastmod });
      added++;
    }
    sources.push({ kind: "sitemap", url: sm, ok: true, count: added });
    if (urls.length >= maxUrls) {
      truncated = true;
      break;
    }
  }
  return { urls, sources, truncated };
}

module.exports = {
  decodeXml,
  decodeHtml,
  stripTags,
  htmlToText,
  anchorsFromHtml,
  parseSitemapXml,
  robotsSitemaps,
  parseLlmsTxt,
  bodyText,
  collectSitemapUrls,
};
