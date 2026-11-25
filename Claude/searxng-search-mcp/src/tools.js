"use strict";

/**
 * Tool definitions + dispatch for the SearXNG search connector.
 * Five tools: `search`, `extract`, `map` (Tavily-style), plus `docs_search` (vendor documentation
 * without a search engine) and `search_health` (relevance canary), added 2026-11-24.
 *
 * @module tools
 */

const { z } = require("zod");
const { search } = require("./searxng.js");
const { extract, sameHostLinks } = require("./extract.js");
const { defaultDocsSearch, rankEntries, canonical } = require("./docs-search.js");
const { searchHealth } = require("./health.js");
const { queryTerms } = require("./rank.js");
const { REGISTRY } = require("./doc-sites.js");

const SITE_IDS = REGISTRY.map((s) => s.id).join(", ");

/* ----------------------------- Tool schemas ----------------------------- */

const TOOLS = [
  {
    name: "search",
    description:
      "Web search via a local SearXNG metasearch instance (free, private, no API key). " +
      "Returns ranked results with title, url, snippet, score, and source engine — a " +
      "Tavily-compatible drop-in. Use for current events, facts, docs, and discovery. " +
      "For biomedical work pass topic:'science' to hit the tuned scholarly engines (PubMed, " +
      "Europe PMC, Semantic Scholar, Crossref, OpenAlex, OpenAIRE, arXiv). Each result may carry " +
      "an additive citations[] array of {type,id,source} ids harvested from its text " +
      "(pmid/doi/nct/pmcid/chembl/drugbank/uniprot/arxiv/geo/sra/bioproject/biosample/rrid); source is 'url' " +
      "(page-identity, high confidence), 'text' (from title/snippet), or 'metadata' (a DOI the " +
      "scholarly engine returned as a structured field), and preprint DOIs carry " +
      "subtype:'preprint'. Set min_citations>=1 to keep only results that carry a citation id. " +
      "Set include_raw_content:true to also fetch and clean the full page text of each hit. " +
      "Every answer is judged against the query: `quality.status` is ok, thin, degraded (rows came " +
      "back but none is about the query, e.g. results for only its first word) or empty, and on the " +
      "general and news topics off-topic rows are moved to `off_topic_results` instead of being " +
      "returned as answers. A degraded answer falls back to docs_search when the query names a " +
      "registered documentation site (Aruba, CrowdStrike, Firewalla, Samsung Knox), then to other " +
      "engines; `engines_tried` records each step. General web results are weak for niche technical " +
      "queries: prefer docs_search for vendor documentation.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query." },
        max_results: {
          type: "integer",
          minimum: 0,
          maximum: 40,
          default: 5,
          description: "Maximum number of results to return (0-40).",
        },
        topic: {
          type: "string",
          enum: ["general", "news", "science"],
          default: "general",
          description: "Search category. 'news' favors recency; 'science' favors scholarly sources.",
        },
        time_range: {
          type: "string",
          // "week" is a Tavily-compat legacy value the handler accepts and coerces to "day" (see
          // searxng.js). It MUST appear here to match the zod schema below (which already lists it) —
          // otherwise the advertised contract is stricter than what the server enforces.
          enum: ["day", "week", "month", "year"],
          description:
            "Recency filter. SearXNG honors day/month/year exactly. (A legacy 'week' value is " +
            "still accepted and coerced to 'day'; the response echoes applied_time_range.)",
        },
        language: {
          type: "string",
          description: "Language code, e.g. 'en', 'en-US', 'fr'. Defaults to the instance setting.",
        },
        include_domains: {
          type: "array",
          items: { type: "string" },
          description: "Only keep results from these domains (subdomains match too).",
        },
        exclude_domains: {
          type: "array",
          items: { type: "string" },
          description: "Drop results from these domains (subdomains match too).",
        },
        include_raw_content: {
          type: "boolean",
          default: false,
          description: "Fetch + clean the full page content of each result (slower, richer).",
        },
        engines: {
          type: "string",
          description:
            "Advanced: comma-separated SearXNG engine names (e.g. 'bing,seznam'). Naming engines turns " +
            "the fallback off.",
        },
        rerank: {
          type: "boolean",
          description:
            "Opt in/out of local-LLM listwise reranking for this call (overrides the server " +
            "default). Requires a local model reachable via the HTTPS proxy; fail-soft to native " +
            "score ordering on any error.",
        },
        min_citations: {
          type: "integer",
          minimum: 0,
          default: 0,
          description:
            "Keep only results carrying at least this many citation ids (0 = off). Use 1 for a " +
            "connector-level 'every result sourced' gate.",
        },
        fallback: {
          type: "boolean",
          default: true,
          description:
            "When the answer is not about the query, retry through docs_search and other engines " +
            "(default true). false returns the first answer as judged.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "extract",
    description:
      "Fetch one or more URLs and return clean, readable content (markdown or plain text), " +
      "with boilerplate/nav/ads stripped via Mozilla Readability. Tavily-compatible: returns " +
      "results[] and failed_results[]. Use to read pages found via `search`. Only public http(s) " +
      "targets are fetched: loopback/private/link-local destinations are refused (reported in " +
      "failed_results[]), including via redirect, unless allowlisted server-side.",
    inputSchema: {
      type: "object",
      properties: {
        urls: {
          type: "array",
          items: { type: "string" },
          description:
            "URLs to extract. Pass an array; a single bare string is also accepted for convenience.",
        },
        format: {
          type: "string",
          enum: ["markdown", "text"],
          default: "markdown",
          description: "Output format of the extracted content.",
        },
        max_chars: {
          type: "integer",
          minimum: 500,
          description: "Cap on characters returned per page (default from server config).",
        },
      },
      required: ["urls"],
      additionalProperties: false,
    },
  },
  {
    name: "map",
    description:
      "Discover URLs within a single website. Reads the site's own page list (robots.txt and " +
      "sitemap.xml, or the docs_search registry's sources for a registered site), adds the same-domain " +
      "links on the given page, and keeps urls under the given page's directory. With `query`, ranks " +
      "them locally against it (no search engine) and returns the best first, with titles in " +
      "`ranked`. Use to enumerate a site's pages before extracting the relevant ones. Only public " +
      "http(s) targets are fetched: loopback/private/link-local destinations are refused.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "A page or site root to map, e.g. 'https://example.com'.",
        },
        query: {
          type: "string",
          description: "Optional: rank the site's urls against these words, best first.",
        },
        max_results: {
          type: "integer",
          minimum: 1,
          maximum: 200,
          default: 40,
          description: "Maximum number of URLs to return.",
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    name: "docs_search",
    description:
      "Search vendor documentation sites directly, without any web search engine (general web " +
      "search is unreliable for niche technical queries). Registered sites: HPE Aruba Networking " +
      "TechDocs (AOS 10, Wi-Fi design and deploy, new Central, VSG), the Aruba Developer Hub (Central " +
      "APIs), the CrowdStrike Developer Center (Falcon APIs, Falcon MCP, Foundry), the Firewalla Help " +
      "Center and MSP API docs, and Samsung Knox docs. Each site's page list comes from its sitemaps, " +
      "llms.txt, crawl seeds or Zendesk search API (cached 24 h); pages are ranked locally, the best " +
      "are read through the SSRF-guarded extractor, and each result is the most relevant passage of " +
      "its page, with off-topic pages in off_topic_results. Sites are inferred from the query " +
      `('aruba', 'aos 10', 'crowdstrike', 'falcon api', 'firewalla', 'knox') or named in sites (ids: ${SITE_IDS}); ` +
      "with neither, all sites are searched. list_sites:true returns the registry. Follow up with " +
      "extract for a whole page.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look for, e.g. 'AOS 10 WIDS containment tarpit'." },
        sites: {
          type: "array",
          items: { type: "string" },
          description: "Registry ids or hostnames to search (default: inferred from the query, else all).",
        },
        max_results: { type: "integer", minimum: 1, maximum: 20, default: 5, description: "Results to return (1-20)." },
        read_pages: {
          type: "integer",
          minimum: 1,
          maximum: 12,
          default: 6,
          description: "How many top candidate pages to fetch and read (more is slower and more thorough).",
        },
        include_raw_content: {
          type: "boolean",
          default: false,
          description: "Also return each result page's full extracted text.",
        },
        list_sites: { type: "boolean", default: false, description: "Return the registry instead of searching." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "search_health",
    description:
      "Relevance canary for the SearXNG engines. Asks each engine, by name, two known-answer " +
      "questions (a common technical query and a niche vendor-documentation one) and reports per " +
      "engine: ok, weak (on-topic but not the expected site), junk (results not about the query, e.g. " +
      "matching only its first word, or front pages), silent_zero (nothing and no error, usually a " +
      "CAPTCHA wall), or blocked (CAPTCHA, rate limit, access denied). Use before trusting general web " +
      "search or to explain bad results. Reuses its last run for 10 minutes unless refresh:true.",
    inputSchema: {
      type: "object",
      properties: {
        engines: {
          type: "string",
          description:
            "Comma-separated engine names to probe (default: the instance's enabled general web engines " +
            "plus the fallback engines).",
        },
        refresh: { type: "boolean", default: false, description: "Probe afresh instead of reusing a recent run." },
      },
      additionalProperties: false,
    },
  },
];

/* ----------------------------- Zod guards ------------------------------- */

const searchArgs = z.object({
  query: z.string().min(1),
  max_results: z.number().int().min(0).max(40).optional(),
  topic: z.enum(["general", "news", "science"]).optional(),
  time_range: z.enum(["day", "week", "month", "year"]).optional(),
  language: z.string().optional(),
  include_domains: z.array(z.string()).optional(),
  exclude_domains: z.array(z.string()).optional(),
  include_raw_content: z.boolean().optional(),
  engines: z.string().optional(),
  rerank: z.boolean().optional(),
  min_citations: z.number().int().min(0).optional(),
  fallback: z.boolean().optional(),
});

const extractArgs = z.object({
  // Advertise `array` in the JSON Schema (best MCP-client interop), but still accept a
  // lone string by coercing it to a 1-element array here.
  urls: z.preprocess(
    (v) => (typeof v === "string" ? [v] : v),
    z.array(z.string()).min(1)
  ),
  format: z.enum(["markdown", "text"]).optional(),
  max_chars: z.number().int().min(500).optional(),
});

const mapArgs = z.object({
  url: z.string().min(1),
  query: z.string().optional(),
  max_results: z.number().int().min(1).max(200).optional(),
});

const docsArgs = z
  .object({
    query: z.string().optional(),
    // Accept "a,b" as well as ["a","b"], like extract accepts a lone url.
    sites: z.preprocess(
      (v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : v),
      z.array(z.string()).optional()
    ),
    max_results: z.number().int().min(1).max(20).optional(),
    read_pages: z.number().int().min(1).max(12).optional(),
    include_raw_content: z.boolean().optional(),
    list_sites: z.boolean().optional(),
  })
  .refine((a) => a.list_sites || (typeof a.query === "string" && a.query.trim().length > 0), {
    message: "`query` is required unless list_sites is true",
  });

const healthArgs = z.object({
  engines: z.string().optional(),
  refresh: z.boolean().optional(),
});

/* ----------------------------- Handlers --------------------------------- */

async function handleSearch(raw) {
  const args = searchArgs.parse(raw);
  const out = await search(args);

  // Optional deep read: fetch + clean each result's page and attach raw_content.
  if (args.include_raw_content && out.results.length > 0) {
    const urls = out.results.map((r) => r.url);
    const { results: pages } = await extract(urls, { format: "markdown" });
    const byUrl = new Map(pages.map((p) => [p.url, p.raw_content]));
    for (const r of out.results) r.raw_content = byUrl.get(r.url) || null;
  }
  return out;
}

async function handleExtract(raw) {
  const args = extractArgs.parse(raw);
  return await extract(args.urls, { format: args.format, maxChars: args.max_chars });
}

async function handleMap(raw, deps = {}) {
  const args = mapArgs.parse(raw);
  const started = Date.now();
  const max = args.max_results || 40;
  const docs = deps.docs || defaultDocsSearch();
  const links = deps.sameHostLinks || sameHostLinks;
  const errors = [];
  const found = new Map(); // canonical url -> { url, title }
  const add = (url, title) => {
    const key = canonical(url);
    const cur = found.get(key);
    if (!cur) found.set(key, { url, title: title || "" });
    else if (title && !cur.title) cur.title = title;
  };

  // 1) Same-domain links on the page itself (first, so an un-queried map still leads with them).
  try {
    for (const u of await links(args.url)) add(u, "");
  } catch (err) {
    errors.push({ step: "crawl", error: err.message || String(err) });
  }

  // 2) The site's own page list: robots.txt + sitemaps, or the docs registry's sources.
  let inv = null;
  try {
    inv = await docs.mapInventory(args.url);
    for (const e of inv.entries) add(e.url, e.title);
  } catch (err) {
    errors.push({ step: "sitemap", error: err.message || String(err) });
  }

  let list = [...found.values()];
  let ranked = null;
  if (args.query) {
    const terms = queryTerms(args.query);
    const scores = rankEntries(list, terms);
    const order = list.map((e, i) => ({ ...e, score: scores[i] }));
    const hits = order.filter((e) => e.score > 0).sort((a, b) => b.score - a.score);
    ranked = hits.slice(0, max).map((e) => ({ url: e.url, title: e.title, score: Math.round(e.score * 1000) / 1000 }));
    list = [...hits, ...order.filter((e) => !(e.score > 0))];
  }

  return {
    base_url: args.url,
    results: list.slice(0, max).map((e) => e.url),
    count: Math.min(list.length, max),
    total_found: list.length,
    ...(ranked ? { ranked } : {}),
    site: inv ? inv.site : null,
    sources: inv ? inv.sources : [],
    errors,
    response_time: (Date.now() - started) / 1000,
  };
}

async function handleDocsSearch(raw, deps = {}) {
  const args = docsArgs.parse(raw);
  const docs = deps.docs || defaultDocsSearch();
  if (args.list_sites) return { sites: docs.listSites() };
  return await docs.search(args);
}

async function handleSearchHealth(raw) {
  const args = healthArgs.parse(raw);
  return await searchHealth(args);
}

/* ----------------------------- Dispatch --------------------------------- */

const HANDLERS = {
  search: handleSearch,
  extract: handleExtract,
  map: handleMap,
  docs_search: handleDocsSearch,
  search_health: handleSearchHealth,
};

/**
 * Route an MCP tool call to its handler and wrap the result as MCP content.
 * Errors are returned as `isError` content rather than thrown, so the client
 * sees a clean tool error instead of a transport failure.
 */
async function dispatch(name, args) {
  const handler = HANDLERS[name];
  if (!handler) {
    return {
      isError: true,
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
    };
  }
  try {
    const result = await handler(args || {});
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text", text: `Error in ${name}: ${err.message || String(err)}` }],
    };
  }
}

module.exports = {
  TOOLS,
  dispatch,
  handleSearch,
  handleExtract,
  handleMap,
  handleDocsSearch,
  handleSearchHealth,
};
