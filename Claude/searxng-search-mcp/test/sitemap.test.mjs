/**
 * Unit tests for the inventory parsers and the bounded sitemap walker (no network: fetch is injected).
 * Run: `node --test test/sitemap.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const {
  parseSitemapXml,
  robotsSitemaps,
  parseLlmsTxt,
  anchorsFromHtml,
  htmlToText,
  bodyText,
  collectSitemapUrls,
} = require("../src/sitemap.js");

const URLSET = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://arubanetworks.com/techdocs/aos/aos10/design/ap-ports/</loc><lastmod>2026-10-01</lastmod></url>
  <url><loc> https://arubanetworks.com/techdocs/aos/q?a=1&amp;b=2 </loc></url>
  <url><loc><![CDATA[https://arubanetworks.com/techdocs/aos/cdata/]]></loc></url>
  <url><loc>ftp://not-http.example/x</loc></url>
</urlset>`;

const INDEX = `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://developer.crowdstrike.com/sitemap-0.xml</loc></sitemap>
</sitemapindex>`;

test("parseSitemapXml: urlset with entities, CDATA and lastmod; non-http locs dropped", () => {
  const p = parseSitemapXml(URLSET);
  assert.equal(p.kind, "urlset");
  assert.deepEqual(
    p.entries.map((e) => e.loc),
    [
      "https://arubanetworks.com/techdocs/aos/aos10/design/ap-ports/",
      "https://arubanetworks.com/techdocs/aos/q?a=1&b=2",
      "https://arubanetworks.com/techdocs/aos/cdata/",
    ]
  );
  assert.equal(p.entries[0].lastmod, "2026-10-01");
});

test("parseSitemapXml: index, namespace prefixes, bare locs, and junk", () => {
  assert.equal(parseSitemapXml(INDEX).kind, "index");
  const ns = `<ns:urlset xmlns:ns="x"><ns:url><ns:loc>https://a.example/1</ns:loc></ns:url></ns:urlset>`;
  assert.deepEqual(parseSitemapXml(ns).entries.map((e) => e.loc), ["https://a.example/1"]);
  const bare = `<root><loc>https://a.example/2</loc></root>`;
  assert.deepEqual(parseSitemapXml(bare).entries.map((e) => e.loc), ["https://a.example/2"]);
  assert.equal(parseSitemapXml("<html><body>soft 404</body></html>").kind, "unknown");
});

test("robotsSitemaps: every Sitemap line, any case, deduped", () => {
  const robots = [
    "User-agent: *",
    "Disallow: /private",
    "Sitemap: https://arubanetworking.hpe.com/techdocs/new-central/Sitemap.xml",
    "sitemap:https://arubanetworking.hpe.com/techdocs/VSG/sitemap.xml",
    "Sitemap: https://arubanetworking.hpe.com/techdocs/VSG/sitemap.xml",
    "Sitemap: /relative-is-ignored.xml",
  ].join("\r\n");
  assert.deepEqual(robotsSitemaps(robots), [
    "https://arubanetworking.hpe.com/techdocs/new-central/Sitemap.xml",
    "https://arubanetworking.hpe.com/techdocs/VSG/sitemap.xml",
  ]);
});

test("parseLlmsTxt: links with titles and descriptions, relative links resolved", () => {
  const txt = [
    "# CrowdStrike Developer Center",
    "> intro",
    "- [Falcon API Reference](/api-reference/overview.md): CrowdStrike Falcon API reference documentation.",
    "- [Falcon MCP](https://developer.crowdstrike.com/falcon-mcp/overview.md): Connect AI assistants.",
    "- [Falcon MCP](https://developer.crowdstrike.com/falcon-mcp/overview.md): duplicate",
  ].join("\n");
  const items = parseLlmsTxt(txt, "https://developer.crowdstrike.com/llms.txt");
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], {
    url: "https://developer.crowdstrike.com/api-reference/overview.md",
    title: "Falcon API Reference",
    description: "CrowdStrike Falcon API reference documentation.",
  });
});

test("anchorsFromHtml: urls with anchor text, fragments and non-web schemes dropped, deduped", () => {
  const html = `
    <a href="/new-central/reference/listmonitoredapsv1"><span>GET</span> <span>List Monitored APs</span></a>
    <a href='/new-central/reference/getaccesspointsv1#x'>Get Access Points &amp; Radios</a>
    <a href="/new-central/reference/listmonitoredapsv1"></a>
    <a href="#top">top</a><a href="mailto:x@y">mail</a><a href="javascript:void(0)">js</a>
    <a class="x" href=https://other.example/page>Other</a>`;
  const a = anchorsFromHtml(html, "https://developer.arubanetworks.com/new-central/reference");
  assert.deepEqual(a, [
    { url: "https://developer.arubanetworks.com/new-central/reference/listmonitoredapsv1", text: "GET List Monitored APs" },
    { url: "https://developer.arubanetworks.com/new-central/reference/getaccesspointsv1", text: "Get Access Points & Radios" },
    { url: "https://other.example/page", text: "Other" },
  ]);
});

test("anchorsFromHtml: a section label and the page's own title both survive (the ReadMe sidebar case)", () => {
  // Measured 2026-11-24: the new-central sidebar links listmonitoredapsv1 as "WIDS" (its section) and
  // again with its real title. Keeping only the first text ranked the page 876th.
  const html = `<a href="/new-central/reference/listmonitoredapsv1">WIDS</a>
    <a href="/new-central/reference/listmonitoredapsv1"><span>Get a list of monitored APs over a time period.</span> <span>get</span></a>
    <a href="/new-central/reference/listmonitoredapsv1">WIDS</a>`;
  const [only] = anchorsFromHtml(html, "https://developer.arubanetworks.com/");
  assert.equal(only.text, "WIDS · Get a list of monitored APs over a time period. get");
  const many = Array.from({ length: 6 }, (_, i) => `<a href="/x">label ${i}</a>`).join("");
  assert.equal(anchorsFromHtml(many, "https://a.example/")[0].text.split(" · ").length, 3, "capped at 3 texts");
});

test("htmlToText: keeps paragraph breaks, drops scripts and tags, decodes entities", () => {
  const t = htmlToText("<h2>Target Lists</h2><p>Block a <b>target&nbsp;list</b>.</p><script>x()</script><ul><li>one</li><li>two</li></ul>");
  assert.equal(t, "Target Lists\n\nBlock a target list .\n\none\n\ntwo");
});

test("bodyText: plain and gzipped sitemaps both read as text", () => {
  const xml = "<urlset><url><loc>https://a.example/</loc></url></urlset>";
  assert.equal(bodyText(Buffer.from(xml), 1e6), xml);
  assert.equal(bodyText(zlib.gzipSync(Buffer.from(xml)), 1e6), xml);
  assert.throws(() => bodyText(zlib.gzipSync(Buffer.alloc(5000, 65)), 100));
});

test("collectSitemapUrls: follows an index, rewrites before fetching, records failures, honors budgets", async () => {
  const served = {
    "https://new.example/index.xml": `<sitemapindex><sitemap><loc>https://old.example/a.xml</loc></sitemap><sitemap><loc>https://new.example/missing.xml</loc></sitemap><sitemap><loc>https://new.example/soft404.xml</loc></sitemap></sitemapindex>`,
    "https://new.example/a.xml": `<urlset><url><loc>https://old.example/p1</loc></url><url><loc>https://old.example/p2</loc></url><url><loc>https://old.example/p1</loc></url></urlset>`,
    "https://new.example/soft404.xml": "<html>nope</html>",
  };
  const fetched = [];
  const fetchText = async (u) => {
    fetched.push(u);
    return u in served ? { ok: true, status: 200, text: served[u] } : { ok: false, status: 404, text: "" };
  };
  const rewrite = (u) => u.replace("https://old.example/", "https://new.example/");
  const r = await collectSitemapUrls(["https://new.example/index.xml"], { fetchText, rewrite });
  assert.deepEqual(r.urls.map((x) => x.loc), ["https://new.example/p1", "https://new.example/p2"]);
  assert.ok(!fetched.some((u) => u.startsWith("https://old.example/")), "never fetch the un-rewritten host");
  assert.deepEqual(
    r.sources.map((s) => [s.kind, s.ok]),
    [["sitemap-index", true], ["sitemap", true], ["sitemap", false], ["sitemap", false]]
  );
  assert.equal(r.truncated, false);

  const capped = await collectSitemapUrls(["https://new.example/index.xml"], { fetchText, rewrite, maxUrls: 1 });
  assert.equal(capped.urls.length, 1);
  assert.equal(capped.truncated, true);
  const fewSitemaps = await collectSitemapUrls(["https://new.example/index.xml"], { fetchText, rewrite, maxSitemaps: 1 });
  assert.equal(fewSitemaps.urls.length, 0);
  assert.equal(fewSitemaps.truncated, true);

  // A throwing fetcher is recorded, not raised.
  const boom = await collectSitemapUrls(["https://x.example/s.xml"], { fetchText: async () => { throw new Error("blocked: private address"); } });
  assert.equal(boom.sources[0].ok, false);
  assert.match(boom.sources[0].error, /blocked/);
});
