/**
 * The sitemap-aware `map` handler, and the new tools' schemas, with injected inventory and link
 * scraping (no network). Loads tools.js, so it needs the package's dependencies installed.
 * Run: `node --test test/map.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { TOOLS, handleMap, handleDocsSearch, dispatch } = require("../src/tools.js");

const BASE = "https://arubanetworking.hpe.com/techdocs/aos/aos10/";
const docs = {
  mapInventory: async () => ({
    site: "aruba-techdocs",
    registered: true,
    sources: [{ kind: "sitemap", url: "https://arubanetworking.hpe.com/techdocs/aos/sitemap.xml", ok: true, count: 3 }],
    entries: [
      { url: `${BASE}design/ap-ports/`, title: "" },
      { url: `${BASE}design/bc-mc/overview/`, title: "Bridged and tunneled forwarding" },
      { url: `${BASE}design/gw-clusters/overview/`, title: "Gateway clusters" },
    ],
  }),
};
const sameHostLinks = async () => [`${BASE}design/ap-ports`, `${BASE}get-started/`];

test("map without a query: the page's links first (as before), then sitemap pages, deduped", async () => {
  const out = await handleMap({ url: BASE }, { docs, sameHostLinks });
  assert.deepEqual(out.results, [
    `${BASE}design/ap-ports`,
    `${BASE}get-started/`,
    `${BASE}design/bc-mc/overview/`,
    `${BASE}design/gw-clusters/overview/`,
  ]);
  assert.equal(out.total_found, 4);
  assert.equal(out.site, "aruba-techdocs");
  assert.equal(out.sources[0].kind, "sitemap");
  assert.deepEqual(out.errors, []);
});

test("map with a query: ranked locally, best first, with titles; no search engine call", async () => {
  const out = await handleMap({ url: BASE, query: "gateway clusters", max_results: 2 }, { docs, sameHostLinks });
  assert.equal(out.results[0], `${BASE}design/gw-clusters/overview/`);
  assert.equal(out.ranked[0].title, "Gateway clusters");
  assert.equal(out.results.length, 2);
});

test("map: a failing sitemap step is reported in errors; links still come back", async () => {
  const out = await handleMap(
    { url: BASE },
    { docs: { mapInventory: async () => { throw new Error("blocked: private address"); } }, sameHostLinks }
  );
  assert.equal(out.results.length, 2);
  assert.deepEqual(out.errors, [{ step: "sitemap", error: "blocked: private address" }]);
});

test("tool list: five tools, the new ones advertised with additionalProperties false", () => {
  assert.deepEqual(TOOLS.map((t) => t.name), ["search", "extract", "map", "docs_search", "search_health"]);
  for (const t of TOOLS) assert.equal(t.inputSchema.additionalProperties, false, t.name);
  assert.ok(TOOLS.find((t) => t.name === "search").inputSchema.properties.fallback);
});

test("docs_search handler: list_sites needs no query; a query is otherwise required", async () => {
  const listed = await handleDocsSearch({ list_sites: true });
  assert.equal(listed.sites.length, 6);
  const r = await dispatch("docs_search", {});
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /query.*required unless list_sites/);
  const comma = await handleDocsSearch(
    { query: "x", sites: "firewalla-help, firewalla-docs" },
    { docs: { search: async (a) => a, listSites: () => [] } }
  );
  assert.deepEqual(comma.sites, ["firewalla-help", "firewalla-docs"]);
});
