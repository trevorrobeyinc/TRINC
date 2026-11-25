/**
 * Unit tests for the documentation-site registry (pure; no network).
 * Run: `node --test test/doc-sites.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { REGISTRY, applyRewrite, inScope, siteForUrl, resolveSites, adHocSite } = require("../src/doc-sites.js");

const ids = (r) => r.sites.map((s) => s.id);

test("registry: unique ids, every site has a source, scopes sit on the site's own hosts", () => {
  const seen = new Set();
  for (const s of REGISTRY) {
    assert.ok(!seen.has(s.id), `duplicate id ${s.id}`);
    seen.add(s.id);
    assert.ok(s.label && s.hosts.length && s.scope.length, s.id);
    const sources = (s.sitemaps || []).length + (s.llms || []).length + (s.crawl || []).length + (s.robots ? 1 : 0) + (s.zendesk ? 1 : 0);
    assert.ok(sources > 0, `${s.id} has no inventory source`);
    for (const p of s.scope) assert.ok(s.hosts.includes(new URL(p).hostname), `${s.id} scope ${p} off its hosts`);
    for (const u of [...(s.sitemaps || []), ...(s.llms || []), ...(s.crawl || [])]) {
      assert.ok(u.startsWith("https://"), `${s.id}: ${u} must be https`);
    }
  }
  assert.deepEqual([...seen].sort(), [
    "aruba-developer", "aruba-techdocs", "crowdstrike-developer", "firewalla-docs", "firewalla-help", "samsung-knox-docs",
  ]);
});

test("resolveSites: the brief's queries route to the right sites by alias", () => {
  assert.deepEqual(ids(resolveSites({ query: "AOS 10 WIDS containment tarpit" })), ["aruba-techdocs"]);
  assert.deepEqual(ids(resolveSites({ query: "aos10 ap ports" })), ["aruba-techdocs"]);
  assert.deepEqual(ids(resolveSites({ query: "crowdstrike falcon custom IOA rule groups API" })), ["crowdstrike-developer"]);
  assert.deepEqual(ids(resolveSites({ query: "custom-ioa module" })), ["crowdstrike-developer"]);
  assert.deepEqual(ids(resolveSites({ query: "firewalla target list rule" })), ["firewalla-help", "firewalla-docs"]);
  assert.deepEqual(ids(resolveSites({ query: "Knox Manage enrollment android enterprise" })), ["samsung-knox-docs"]);
  assert.deepEqual(ids(resolveSites({ query: "HPE Aruba Networking central API list monitored APs" })), ["aruba-techdocs", "aruba-developer"]);
  assert.deepEqual(ids(resolveSites({ query: "python asyncio gather" })), []);
  // Aliases match whole words only.
  assert.deepEqual(ids(resolveSites({ query: "chaos engineering" })), []);
});

test("resolveSites: explicit sites (ids or hosts) win; include_domains match parent domains; unknowns reported", () => {
  const r = resolveSites({ sites: ["crowdstrike-developer", "docs.samsungknox.com", "nope.example"], query: "aruba" });
  assert.deepEqual(ids(r), ["crowdstrike-developer", "samsung-knox-docs"]);
  assert.deepEqual(r.unknown, ["nope.example"]);
  assert.deepEqual(ids(resolveSites({ include_domains: ["firewalla.com"] })), ["firewalla-help"]);
  assert.deepEqual(ids(resolveSites({ include_domains: ["arubanetworking.hpe.com"], query: "knox" })), ["aruba-techdocs"]);
});

test("siteForUrl: exact host by default (map must not borrow a registry for a parent domain)", () => {
  assert.equal(siteForUrl("https://arubanetworking.hpe.com/techdocs/aos/").id, "aruba-techdocs");
  assert.equal(siteForUrl("https://www.hpe.com/us/en/home.html"), null);
  assert.equal(siteForUrl("https://hpe.com/", { allowParent: true }).id, "aruba-techdocs");
  assert.equal(siteForUrl("not a url"), null);
});

test("applyRewrite + inScope: Aruba's sitemap lists the old host; it is rewritten, then scoped", () => {
  const aruba = REGISTRY.find((s) => s.id === "aruba-techdocs");
  const old = "https://arubanetworks.com/techdocs/aos/aos10/design/ap-ports/";
  const fixed = applyRewrite(aruba, old);
  assert.equal(fixed, "https://arubanetworking.hpe.com/techdocs/aos/aos10/design/ap-ports/");
  assert.equal(inScope(aruba, old), false, "the old host is not in scope (its TLS certificate is invalid)");
  assert.equal(inScope(aruba, fixed), true);
  assert.equal(inScope(aruba, "https://arubanetworking.hpe.com/support/"), false);
  assert.equal(inScope(aruba, "ftp://arubanetworking.hpe.com/techdocs/x"), false);
  assert.equal(applyRewrite(aruba, "https://elsewhere.example/a"), "https://elsewhere.example/a");
});

test("adHocSite: scoped to the given page's directory, reads robots.txt and /sitemap.xml", () => {
  const s = adHocSite("https://example.org/docs/guide/page.html");
  assert.deepEqual(s.scope, ["https://example.org/docs/guide/"]);
  assert.deepEqual(s.sitemaps, ["https://example.org/sitemap.xml"]);
  assert.equal(s.robots, true);
  assert.deepEqual(adHocSite("https://example.org").scope, ["https://example.org/"]);
});
