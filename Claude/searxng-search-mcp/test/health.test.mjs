/**
 * search_health canary: probe classification and the report, from canned SearXNG answers (no network).
 * Run: `node --test test/health.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
process.env.SEARXNG_HEALTH_CACHE_TTL_MS = "0";
process.env.SEARXNG_FALLBACK_ENGINES = "seznam";
const { searchHealth, classifyProbe, engineStatus, PROBES } = require("../src/health.js");

const common = PROBES.find((p) => p.id === "common");
const niche = PROBES.find((p) => p.id === "niche");

test("classifyProbe: blocked, silent_zero, junk (first word) and ok", () => {
  assert.deepEqual(classifyProbe({ results: [], unresponsive_engines: [["brave", "too many requests"]] }, "brave", common), {
    verdict: "blocked",
    reason: "too many requests",
  });
  assert.equal(classifyProbe({ results: [] }, "google", common).verdict, "silent_zero");
  const decoy = classifyProbe(
    { results: [
      { title: "American Orchid Society", url: "https://www.aos.org/", content: "Orchids." },
      { title: "A. O. Smith (AOS) stock", url: "https://finance.yahoo.com/quote/AOS/", content: "Quote." },
    ] },
    "bing",
    niche
  );
  assert.equal(decoy.verdict, "junk");
  assert.equal(decoy.junk, "first_word");
  const good = classifyProbe(
    { results: [{ title: "Python asyncio gather exceptions", url: "https://stackoverflow.com/q/1", content: "asyncio.gather return_exceptions=True" }] },
    "seznam",
    common
  );
  assert.equal(good.verdict, "ok");
  assert.equal(good.expected_site_in_top10, true);
});

test("engineStatus: the worst probe wins; all-silent is silent_zero", () => {
  assert.equal(engineStatus({ common: { verdict: "ok" }, niche: { verdict: "junk" } }), "junk");
  assert.equal(engineStatus({ common: { verdict: "ok" }, niche: { verdict: "weak" } }), "weak");
  assert.equal(engineStatus({ common: { verdict: "silent_zero" }, niche: { verdict: "silent_zero" } }), "silent_zero");
  assert.equal(engineStatus({ common: { verdict: "blocked" }, niche: { verdict: "ok" } }), "blocked");
  assert.equal(engineStatus({ common: { verdict: "ok" }, niche: { verdict: "none" } }), "weak");
});

test("searchHealth: an engine that answers one probe gets 'none', not 'silent_zero', for the other", async () => {
  const fetchJson = async (url) => {
    const u = new URL(url);
    if (u.pathname === "/config") return { engines: [] };
    return u.searchParams.get("q") === common.query
      ? { results: [{ title: "asyncio gather return_exceptions in Python", url: "https://docs.python.org/3/x", content: "" }] }
      : { results: [] };
  };
  const out = await searchHealth({ engines: "mwmbl" }, { fetchJson });
  assert.equal(out.engines[0].probes.niche.verdict, "none");
  assert.equal(out.engines[0].status, "weak");
});

test("searchHealth: probes the enabled web engines plus the fallback list and summarizes", async () => {
  const asked = [];
  const fetchJson = async (url) => {
    const u = new URL(url);
    if (u.pathname === "/config") {
      return { version: "2026.7.3", engines: [
        { name: "bing", enabled: true, categories: ["general"] },
        { name: "google", enabled: true, categories: ["general"] },
        { name: "wikipedia", enabled: true, categories: ["general"] },
        { name: "pubmed", enabled: true, categories: ["science"] },
      ] };
    }
    const engine = u.searchParams.get("engines");
    const q = u.searchParams.get("q");
    asked.push(`${engine}:${q}`);
    if (engine === "google") return { results: [] };
    if (engine === "bing" && q === niche.query) return { results: [{ title: "American Orchid Society", url: "https://www.aos.org/", content: "" }] };
    return { results: [
      { title: "Python asyncio gather return_exceptions", url: "https://docs.python.org/3/library/asyncio-task.html", content: "gather" },
      { title: "asyncio gather exceptions", url: "https://stackoverflow.com/q/2", content: "return_exceptions" },
    ] };
  };
  const out = await searchHealth({}, { fetchJson });
  assert.deepEqual(out.engines.map((e) => e.engine), ["bing", "google", "seznam"], "wikipedia is not a web engine; seznam is the fallback");
  assert.equal(out.engines.find((e) => e.engine === "bing").status, "junk");
  assert.equal(out.engines.find((e) => e.engine === "google").status, "silent_zero");
  assert.equal(out.general_web, "degraded");
  assert.match(out.summary, /junk from bing \(first_word\)/);
  assert.match(out.summary, /use docs_search/);
  assert.equal(out.searxng.version, "2026.7.3");
  assert.equal(asked.length, 6);
});

test("searchHealth: SearXNG unreachable is reported, not thrown", async () => {
  const out = await searchHealth({ engines: "bing" }, { fetchJson: async () => { throw new Error("Could not reach SearXNG"); } });
  assert.equal(out.searxng.reachable, false);
  assert.equal(out.engines[0].probes.common.verdict, "error");
  assert.equal(out.general_web, "down");
});
