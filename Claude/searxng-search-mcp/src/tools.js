"use strict";

/**
 * Tool definitions + dispatch for the SearXNG search connector.
 * Three Tavily-style tools: `search`, `extract`, `map`.
 *
 * @module tools
 */

const { z } = require("zod");
const { search } = require("./searxng.js");
const { extract, sameHostLinks } = require("./extract.js");
const { hostOf } = require("./searxng.js");

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
      "Set include_raw_content:true to also fetch and clean the full page text of each hit.",
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
          enum: ["day", "month", "year"],
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
          description: "Advanced: comma-separated SearXNG engine names (e.g. 'google,bing,duckduckgo').",
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
      "Discover URLs within a single website. Fetches the given page, collects same-domain " +
      "links, and (optionally, with `query`) augments them via a site-scoped SearXNG search. " +
      "Use to enumerate a site's pages before extracting the relevant ones. Only public http(s) " +
      "targets are fetched: loopback/private/link-local destinations are refused.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "A page or site root to map, e.g. 'https://example.com'.",
        },
        query: {
          type: "string",
          description: "Optional: also run a site-scoped search for these terms on the same domain.",
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

async function handleMap(raw) {
  const args = mapArgs.parse(raw);
  const started = Date.now();
  const max = args.max_results || 40;
  const found = new Set();
  const errors = [];

  // 1) Same-domain links scraped from the page itself.
  try {
    for (const u of await sameHostLinks(args.url)) found.add(u);
  } catch (err) {
    errors.push({ step: "crawl", error: err.message || String(err) });
  }

  // 2) Optional: augment with a site-scoped SearXNG search.
  if (args.query) {
    const host = hostOf(args.url);
    try {
      const res = await search({
        query: args.query,
        max_results: 40,
        include_domains: host ? [host] : [],
      });
      for (const r of res.results) found.add(r.url);
    } catch (err) {
      errors.push({ step: "search", error: err.message || String(err) });
    }
  }

  return {
    base_url: args.url,
    results: [...found].slice(0, max),
    count: Math.min(found.size, max),
    errors,
    response_time: (Date.now() - started) / 1000,
  };
}

/* ----------------------------- Dispatch --------------------------------- */

const HANDLERS = { search: handleSearch, extract: handleExtract, map: handleMap };

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

module.exports = { TOOLS, dispatch, handleSearch, handleExtract, handleMap };
