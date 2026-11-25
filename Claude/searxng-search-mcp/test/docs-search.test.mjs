/**
 * docs_search pipeline tests: inventory → stage-1 url ranking → stage-2 read + relevance judgment.
 * Every fetch is injected (no network, no jsdom). The fixtures mirror what the real sites served on
 * 2026-11-24 (Aruba's AOS sitemap lists the OLD host; robots.txt adds the new-central sitemap).
 * Run: `node --test test/docs-search.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createDocsSearch, canonical, readCut, MAX_READ } = require("../src/docs-search.js");

const NEW = "https://arubanetworking.hpe.com/techdocs";
const OLD = "https://arubanetworks.com/techdocs";
const urlset = (locs) => `<urlset>${locs.map((l) => `<url><loc>${l}</loc></url>`).join("")}</urlset>`;

const PAGES = {
  [`${NEW}/aos/wifi-design-deploy/security/wids-wips/protection/containment/`]: {
    title: "Rogue AP containment",
    raw_content:
      "# Rogue AP containment\n\nAOS 10 access points can contain rogue devices that WIDS classifies as rogue.\n\n" +
      "Tarpit containment answers a rogue AP's clients with false channel information, so they waste time " +
      "on a non-existent BSSID instead of joining the rogue AP.\n\nDeauthentication containment is the other mode.",
  },
  [`${NEW}/aos/wifi-design-deploy/security/wids-wips/overview/`]: {
    title: "WIDS/WIPS overview",
    raw_content: "# WIDS/WIPS overview\n\nWireless intrusion detection in AOS 10 classifies neighbouring and rogue APs.",
  },
  [`${NEW}/aos/aos10/design/ap-ports/`]: {
    title: "AP ports",
    raw_content: "# AP ports\n\nUplink and downlink Ethernet ports on access points, port roles and PoE budgets.",
  },
};

function arubaFixture({ failRead = [] } = {}) {
  const served = {
    "https://arubanetworking.hpe.com/robots.txt": `User-agent: *\nSitemap: ${NEW}/new-central/Sitemap.xml\n`,
    [`${NEW}/aos/sitemap.xml`]: urlset([
      `${OLD}/aos/aos10/design/ap-ports/`,
      `${OLD}/aos/wifi-design-deploy/security/wids-wips/overview/`,
      `${OLD}/aos/wifi-design-deploy/security/wids-wips/protection/containment/`,
      `${OLD}/aos/aos10/design/bc-mc/overview/`,
    ]),
    [`${NEW}/new-central/Sitemap.xml`]: urlset([
      `${NEW}/new-central/content/ai-insights/access-ai-insight-page.htm`,
      "https://elsewhere.example/off-scope",
    ]),
  };
  const fetched = [];
  const read = [];
  const deps = {
    fetchText: async (u) => {
      fetched.push(u);
      return u in served ? { ok: true, status: 200, text: served[u], url: u } : { ok: false, status: 404, text: "" };
    },
    readPage: async (u) => {
      read.push(u);
      if (failRead.includes(u)) throw new Error("HTTP 403");
      const p = PAGES[u];
      if (!p) return { title: "Untitled", raw_content: "Nothing relevant on this page at all." };
      return p;
    },
  };
  return { deps, fetched, read };
}

test("docs_search: finds the Aruba tarpit page from the sitemaps alone, with the old host rewritten", async () => {
  const { deps, fetched } = arubaFixture();
  const docs = createDocsSearch(deps);
  const out = await docs.search({ query: "AOS 10 WIDS containment tarpit", max_results: 3 });

  assert.deepEqual(out.sites.map((s) => s.id), ["aruba-techdocs"], "routed by the 'aos 10' alias");
  assert.ok(!fetched.some((u) => u.startsWith(OLD)), "the old host is never fetched");
  assert.equal(out.inventory["aruba-techdocs"].urls, 5, "4 AOS pages + 1 new-central page; off-scope dropped");
  assert.equal(out.results[0].url, `${NEW}/aos/wifi-design-deploy/security/wids-wips/protection/containment/`);
  assert.match(out.results[0].content, /Tarpit containment/);
  assert.deepEqual(out.results[0].matched_terms.sort(), ["10", "aos", "containment", "tarpit", "wids"]);
  assert.equal(out.quality.status === "ok" || out.quality.status === "thin", true);
  assert.equal(out.provider, "docs");
  assert.deepEqual(out.failed_results, []);
});

test("docs_search: the inventory is built once and shared; an identical call is served from cache", async () => {
  const { deps, fetched } = arubaFixture();
  const docs = createDocsSearch(deps);
  await Promise.all([
    docs.search({ query: "aos 10 tarpit containment" }),
    docs.search({ query: "aos 10 ap ports uplink" }),
  ]);
  const robotsFetches = fetched.filter((u) => u.endsWith("/robots.txt")).length;
  assert.equal(robotsFetches, 1, "two concurrent searches share one inventory build");
  const again = await docs.search({ query: "aos 10 tarpit containment" });
  assert.equal(again.cached, true);
});

test("docs_search: a page that cannot be read is reported in failed_results, the rest still rank", async () => {
  const blocked = `${NEW}/aos/wifi-design-deploy/security/wids-wips/overview/`;
  const { deps } = arubaFixture({ failRead: [blocked] });
  const out = await createDocsSearch(deps).search({ query: "aos 10 wids containment tarpit" });
  assert.deepEqual(out.failed_results, [{ url: blocked, error: "HTTP 403" }]);
  assert.ok(out.results.some((r) => /containment\/$/.test(r.url)));
});

test("docs_search: a Zendesk site answers from its own search API, and those pages are not re-read", async () => {
  const article = "https://help.firewalla.com/hc/en-us/articles/360008521833-Firewalla-Target-Lists";
  const served = {
    "https://help.firewalla.com/hc/sitemap.xml": urlset([article, "https://help.firewalla.com/hc/en-us/articles/1-Monitoring-Mode"]),
  };
  const read = [];
  const zendeskUrls = [];
  const docs = createDocsSearch({
    fetchText: async (u) => {
      if (u.startsWith("https://help.firewalla.com/api/v2/help_center/articles/search.json")) {
        zendeskUrls.push(u);
        return {
          ok: true,
          status: 200,
          text: JSON.stringify({
            results: [
              { html_url: article, title: "Firewalla Target Lists", body: "<p>A <b>target list</b> groups domains and IPs so one rule can block the whole list.</p>" },
              { html_url: "https://elsewhere.example/x", title: "off scope", body: "target list block" },
            ],
          }),
        };
      }
      return u in served ? { ok: true, status: 200, text: served[u] } : { ok: false, status: 404, text: "" };
    },
    readPage: async (u) => {
      read.push(u);
      return { title: "Monitoring Mode", raw_content: "Monitoring mode watches traffic without blocking." };
    },
  });
  const out = await docs.search({ query: "target list block rule", sites: ["firewalla-help"] });
  assert.equal(zendeskUrls.length, 1);
  assert.match(zendeskUrls[0], /query=target\+list\+block\+rule/);
  assert.match(zendeskUrls[0], /locale=en-us/);
  assert.ok(!read.includes(article), "the Zendesk body is used, the page is not fetched again");
  assert.equal(out.results[0].url, article);
  assert.equal(out.results[0].found_via, "zendesk");
  assert.equal(out.candidates.zendesk, 1, "the off-scope hit is dropped");
});

test("docs_search: llms.txt titles and crawl-seed anchor text feed the ranking", async () => {
  const docs = createDocsSearch({
    fetchText: async (u) => {
      if (u === "https://developer.crowdstrike.com/robots.txt") return { ok: true, status: 200, text: "Sitemap: https://developer.crowdstrike.com/sitemap-index.xml" };
      if (u === "https://developer.crowdstrike.com/sitemap-index.xml") return { ok: true, status: 200, text: "<sitemapindex><sitemap><loc>https://developer.crowdstrike.com/sitemap-0.xml</loc></sitemap></sitemapindex>" };
      if (u === "https://developer.crowdstrike.com/sitemap-0.xml") return { ok: true, status: 200, text: urlset(["https://developer.crowdstrike.com/falcon-mcp/modules/custom-ioa/", "https://developer.crowdstrike.com/foundry/overview/"]) };
      if (u === "https://developer.crowdstrike.com/llms.txt") return { ok: true, status: 200, text: "- [Falcon MCP](/falcon-mcp/overview.md): Connect AI assistants to the Falcon platform." };
      return { ok: false, status: 404, text: "" };
    },
    readPage: async (u) =>
      /custom-ioa/.test(u)
        ? { title: "Custom IOA module", raw_content: "The Custom IOA module manages Custom IOA rule groups and rules through the Falcon API." }
        : { title: "Other", raw_content: "Foundry apps and Falcon MCP overview." },
  });
  const out = await docs.search({ query: "crowdstrike falcon custom IOA rule groups API" });
  assert.deepEqual(out.sites.map((s) => s.id), ["crowdstrike-developer"]);
  assert.equal(out.results[0].url, "https://developer.crowdstrike.com/falcon-mcp/modules/custom-ioa/");
  const inv = await docs.inventory(require("../src/doc-sites.js").REGISTRY.find((s) => s.id === "crowdstrike-developer"));
  const mcp = inv.urls.find((e) => e.url.endsWith("/falcon-mcp/overview.md"));
  assert.equal(mcp.title, "Falcon MCP");
  assert.match(mcp.description, /Connect AI assistants/);
});

test("docs_search: unknown sites are an error naming the registry; list_sites and mapInventory work", async () => {
  const { deps } = arubaFixture();
  const docs = createDocsSearch(deps);
  await assert.rejects(docs.search({ query: "tarpit containment", sites: ["nope.example"] }), /no registered doc site matches/);
  await assert.rejects(docs.search({ query: "the of and" }), /no searchable words/);
  assert.equal(docs.listSites().length, 6);
  const m = await docs.mapInventory("https://arubanetworking.hpe.com/techdocs/aos/aos10/");
  assert.equal(m.site, "aruba-techdocs");
  assert.ok(m.entries.length === 2 && m.entries.every((e) => e.url.startsWith(`${NEW}/aos/aos10/`)));
});

test("readCut: a cutoff inside a tie reads the whole tie, never past MAX_READ", () => {
  const s = (...xs) => xs.map((score) => ({ score }));
  assert.equal(readCut(s(10, 9, 8, 7, 6, 5, 4), 6), 6, "no tie at the cutoff");
  // 2026-11-24: seven wids-wips pages tied at 9.173; the 6th-place cut fell inside the tie.
  assert.equal(readCut(s(9.735, 9.55, 9.497, 9.173, 9.173, 9.173, 9.173, 9.173, 9.173, 9.173, 9.135), 6), 10);
  assert.equal(readCut(s(...Array(30).fill(1)), 6), MAX_READ);
  assert.equal(readCut(s(3, 2), 6), 2);
  assert.equal(readCut([], 6), 0);
});

test("docs_search: the page that answers the query is read even when the sitemap ranks it inside a tie", async () => {
  // Eight sibling pages with identical url shapes tie in stage 1; only the 8th says "tarpit".
  const base = `${NEW}/aos/wifi-design-deploy/security/wids-wips`;
  const kids = ["overview", "usecases", "scanning", "detection", "classification", "configuration", "mitigation", "protection"];
  const read = [];
  const docs = createDocsSearch({
    fetchText: async (u) =>
      u === `${NEW}/aos/sitemap.xml`
        ? { ok: true, status: 200, text: urlset(kids.map((k) => `${OLD}/aos/wifi-design-deploy/security/wids-wips/${k}/`)) }
        : { ok: false, status: 404, text: "" },
    readPage: async (u) => {
      read.push(u);
      return u.endsWith("/protection/")
        ? { title: "Protection", raw_content: "AOS 10 WIDS protection: tarpit containment and deauthentication containment of rogue APs." }
        : { title: "WIDS", raw_content: "AOS 10 WIDS overview text about containment in general." };
    },
  });
  const out = await docs.search({ query: "AOS 10 WIDS containment tarpit" });
  assert.equal(read.length, 8, "the 6-page budget is extended through the tie");
  assert.equal(out.results[0].url, `${base}/protection/`);
});

test("canonical: trailing slash, fragment, host case and .md variants fold together", () => {
  assert.equal(canonical("https://Developer.CrowdStrike.com/falcon-mcp/overview.md#x"), canonical("https://developer.crowdstrike.com/falcon-mcp/overview/"));
  assert.equal(canonical("https://a.example/docs/index.md"), canonical("https://a.example/docs/"));
  assert.notEqual(canonical("https://a.example/A"), canonical("https://a.example/a"));
});
