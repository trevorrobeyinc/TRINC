/**
 * search() with the relevance guard and the engine fallback, against a stubbed SearXNG (global fetch
 * is replaced; no network). The decoy rows are what Bing really returned on 2026-11-24.
 * Run: `node --test test/search-guard.test.mjs`
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

// Config is read at load: no cache, no retries, a fake base url, and a known fallback list.
process.env.SEARXNG_BASE_URL = "https://searx.test";
process.env.SEARXNG_CACHE_TTL_MS = "0";
process.env.SEARXNG_RETRY_ATTEMPTS = "1";
process.env.SEARXNG_FALLBACK_ENGINES = "seznam,mwmbl";
const { search } = require("../src/searxng.js");

const DECOYS = [
  { title: "ASOS | Online Shopping for the Latest Clothes & Fashion", url: "https://www.asos.com/", content: "Discover the latest fashion and clothing.", engine: "bing" },
  { title: "American Orchid Society", url: "https://www.aos.org/", content: "Orchids, shows and culture.", engine: "bing" },
  { title: "Home - American Ornithological Society", url: "https://americanornithology.org/", content: "Birds and the people who study them.", engine: "bing" },
  { title: "A. O. Smith Corporation (AOS) Stock Price, News, Quote & History", url: "https://finance.yahoo.com/quote/AOS/", content: "Find the latest A. O. Smith stock quote.", engine: "bing" },
];
const PYTHON = [
  { title: "Python asyncio: handling exceptions in gather", url: "https://stackoverflow.com/questions/1/python-asyncio-gather", content: "Use asyncio.gather(*tasks, return_exceptions=True) so one exception does not cancel the rest.", engine: "bing" },
  { title: "Coroutines and tasks — Python documentation", url: "https://docs.python.org/3/library/asyncio-task.html", content: "asyncio.gather runs awaitables concurrently; with return_exceptions exceptions are returned as results.", engine: "bing" },
  { title: "Lady Gaga - Poker Face (Official Music Video)", url: "https://www.youtube.com/watch?v=bESGLojNYSo", content: "Official music video.", engine: "bing" },
];

let calls = [];
let answers = {};
beforeEach(() => {
  calls = [];
  answers = {};
  globalThis.fetch = async (input) => {
    const u = new URL(String(input));
    calls.push(u.pathname === "/config" ? "config" : `search:${u.searchParams.get("engines") || "default"}:${u.searchParams.get("q")}`);
    const body =
      u.pathname === "/config"
        ? { version: "test", engines: [{ name: "bing", enabled: true, categories: ["general"] }, { name: "seznam", enabled: true, categories: ["general"] }, { name: "mwmbl", enabled: false, categories: ["general"] }] }
        : answers[`${u.searchParams.get("engines") || "default"}`] || { results: [] };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
});

test("decoys are not returned as success: partitioned into off_topic_results, quality degraded/first_word", async () => {
  answers.default = { results: DECOYS };
  const out = await search({ query: "AOS 10 WIDS containment tarpit", fallback: false });
  assert.deepEqual(out.results, []);
  assert.equal(out.off_topic_results.length, 4);
  assert.equal(out.quality.status, "degraded");
  assert.equal(out.quality.junk, "first_word");
  assert.deepEqual(out.quality.terms, ["aos", "10", "wids", "containment", "tarpit"]);
  assert.equal(out.off_topic_results[0].home_page, true, "the ASOS front page is flagged as one");
  assert.equal(out.engines_tried.length, 1);
});

test("a degraded answer falls back to docs_search for the site the query names, then to engines not yet asked", async () => {
  answers.default = { results: DECOYS };
  answers.mwmbl = { results: [] };
  let docsArgs = null;
  const docsSearch = async (a) => {
    docsArgs = a;
    return {
      quality: { status: "ok" },
      results: [
        {
          title: "Rogue AP containment",
          url: "https://arubanetworking.hpe.com/techdocs/aos/wifi-design-deploy/security/wids-wips/protection/containment/",
          content: "Tarpit containment answers a rogue AP's clients with false channel information.",
          score: 0.9,
          site: "aruba-techdocs",
          relevance: 1,
          matched_terms: ["aos", "10", "wids", "containment", "tarpit"],
        },
      ],
    };
  };
  const out = await search({ query: "AOS 10 WIDS containment tarpit" }, { docsSearch });
  assert.deepEqual(docsArgs.sites, ["aruba-techdocs"]);
  assert.equal(out.results.length, 1);
  assert.equal(out.results[0].engine, "docs:aruba-techdocs");
  assert.equal(out.results[0].on_topic, true);
  assert.equal(out.quality.initial_status, "degraded");
  assert.equal(out.quality.status, "thin", "one answer, two wanted");
  assert.equal(out.quality.fallback_used, true);
  // seznam is enabled by default (per /config), so only mwmbl is asked one at a time.
  assert.deepEqual(out.engines_tried.map((s) => s.step), ["searxng", "docs_search", "engine:mwmbl"]);
  assert.ok(calls.includes("search:mwmbl:AOS 10 WIDS containment tarpit"));
  assert.ok(!calls.some((c) => c.startsWith("search:seznam:")));
});

test("a good answer is returned as before, decoy rows aside, and no fallback runs", async () => {
  answers.default = { results: PYTHON };
  const out = await search({ query: "python asyncio gather return_exceptions", max_results: 5 });
  assert.equal(out.quality.status, "ok");
  assert.equal(out.results.length, 2);
  for (const k of ["title", "url", "content", "score", "engine", "published_date", "category"]) assert.ok(k in out.results[0], k);
  assert.equal(out.results[0].on_topic, true);
  assert.ok(out.results[0].relevance >= 0.8);
  assert.deepEqual(out.off_topic_results.map((r) => r.title), ["Lady Gaga - Poker Face (Official Music Video)"]);
  assert.equal(out.engines_tried.length, 1);
  assert.deepEqual(calls, ["search:default:python asyncio gather return_exceptions"]);
});

test("naming engines turns the fallback off; the science topic is annotated, never partitioned", async () => {
  answers.bing = { results: DECOYS };
  const pinned = await search({ query: "AOS 10 WIDS containment tarpit", engines: "bing" }, { docsSearch: async () => assert.fail("no fallback") });
  assert.equal(pinned.quality.status, "degraded");
  assert.equal(pinned.engines_tried.length, 1);

  answers.default = { results: DECOYS };
  const sci = await search({ query: "AOS 10 WIDS containment tarpit", topic: "science" });
  assert.equal(sci.results.length, 4, "science rows are kept");
  assert.ok(sci.results.every((r) => r.on_topic === false));
  assert.equal(sci.off_topic_results.length, 0);
  assert.equal(sci.quality.status, "degraded");
});

test("a query of only stopwords is unjudged and passes through untouched", async () => {
  answers.default = { results: DECOYS };
  const out = await search({ query: "what is it", fallback: false });
  assert.equal(out.quality.status, "unjudged");
  assert.equal(out.results.length, 4);
});
