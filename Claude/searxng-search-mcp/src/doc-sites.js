"use strict";

/**
 * Registry of vendor documentation sites that `docs_search` (and `map`, and the `search` fallback) can
 * search WITHOUT a web search engine, from what each site publishes for machines. Every source below
 * was checked live on 2026-11-24 (counts are pages at that date):
 *
 *   aruba-techdocs        robots.txt → new-central (2,351) + VSG (548); aos/sitemap.xml (139) is listed
 *                         under the OLD host arubanetworks.com, whose TLS certificate does not cover that
 *                         name, so its urls are rewritten to arubanetworking.hpe.com before any fetch
 *   aruba-developer       ReadMe portal: no sitemap, no llms.txt; its reference and docs pages carry the
 *                         whole sidebar (413 + 77 + 1,335 + 1,179 + 64 links), so they are crawl seeds
 *   crowdstrike-developer robots.txt → sitemap-index.xml → sitemap-0.xml (460); llms.txt (171 lines)
 *   firewalla-help        Zendesk Help Center: hc/sitemap.xml (422) + the official, unauthenticated
 *                         articles search API
 *   firewalla-docs        sitemap.xml (18) + llms.txt
 *   samsung-knox-docs     robots.txt → admin (2,468), partner, dev sitemaps; plus the root sitemap (16)
 *
 * Fields: `hosts` the site's hostnames; `scope` url prefixes a page must start with; `sitemaps` read
 * directly; `robots` also read each host's robots.txt for `Sitemap:` lines; `llms` llms.txt files (their
 * titles and descriptions help ranking); `crawl` pages whose links are the inventory; `zendesk` a Help
 * Center whose search API is asked at query time; `rewrite` [from-prefix, to-prefix] pairs; `aliases`
 * words that, found in a query, route it to this site.
 *
 * To add a site: check what it publishes (robots.txt, /sitemap.xml, /llms.txt), add an entry, and add
 * it to the id list and the routing cases in test/doc-sites.test.mjs.
 *
 * @module doc-sites
 */

const { tokenize } = require("./rank.js");
const { hostOf, hostMatchesDomain } = require("./url-util.js");

const REGISTRY = Object.freeze([
  {
    id: "aruba-techdocs",
    label: "HPE Aruba Networking TechDocs (AOS 10, Wi-Fi design and deploy, new Central, VSG)",
    hosts: ["arubanetworking.hpe.com"],
    scope: ["https://arubanetworking.hpe.com/techdocs/"],
    robots: true,
    sitemaps: ["https://arubanetworking.hpe.com/techdocs/aos/sitemap.xml"],
    rewrite: [
      ["https://arubanetworks.com/techdocs/", "https://arubanetworking.hpe.com/techdocs/"],
      ["https://www.arubanetworks.com/techdocs/", "https://arubanetworking.hpe.com/techdocs/"],
    ],
    aliases: ["aruba", "hpe aruba", "aos", "aos 10", "aos 8", "aruba central", "new central", "vsg", "validated solution guide", "techdocs"],
  },
  {
    id: "aruba-developer",
    label: "HPE Aruba Networking Developer Hub (new Central and classic Central APIs)",
    hosts: ["developer.arubanetworks.com"],
    scope: ["https://developer.arubanetworks.com/"],
    crawl: [
      "https://developer.arubanetworks.com/new-central/reference",
      "https://developer.arubanetworks.com/new-central/docs",
      "https://developer.arubanetworks.com/new-central-config/reference",
      "https://developer.arubanetworks.com/aruba-central/reference",
      "https://developer.arubanetworks.com/aruba-central/docs",
    ],
    aliases: ["aruba", "hpe aruba", "aruba api", "central api", "new central", "aruba central", "aruba developer"],
  },
  {
    id: "crowdstrike-developer",
    label: "CrowdStrike Developer Center (Falcon APIs, Falcon MCP, Foundry, Configuration as Code)",
    hosts: ["developer.crowdstrike.com"],
    scope: ["https://developer.crowdstrike.com/"],
    robots: true,
    llms: ["https://developer.crowdstrike.com/llms.txt"],
    aliases: ["crowdstrike", "falcon api", "falcon mcp", "falconpy", "falcon foundry", "foundry", "custom ioa", "ioa", "real time response"],
  },
  {
    id: "firewalla-help",
    label: "Firewalla Help Center (Zendesk)",
    hosts: ["help.firewalla.com"],
    scope: ["https://help.firewalla.com/hc/"],
    sitemaps: ["https://help.firewalla.com/hc/sitemap.xml"],
    zendesk: { base: "https://help.firewalla.com", locale: "en-us" },
    aliases: ["firewalla"],
  },
  {
    id: "firewalla-docs",
    label: "Firewalla MSP API documentation",
    hosts: ["docs.firewalla.net"],
    scope: ["https://docs.firewalla.net/"],
    sitemaps: ["https://docs.firewalla.net/sitemap.xml"],
    llms: ["https://docs.firewalla.net/llms.txt"],
    aliases: ["firewalla", "firewalla msp", "msp api", "firewalla api"],
  },
  {
    id: "samsung-knox-docs",
    label: "Samsung Knox documentation (Knox Manage, Knox Suite, KME, KPE, partner and developer docs)",
    hosts: ["docs.samsungknox.com"],
    scope: ["https://docs.samsungknox.com/"],
    robots: true,
    sitemaps: ["https://docs.samsungknox.com/sitemap.xml"],
    aliases: ["knox", "samsung knox", "knox manage", "knox suite", "knox mobile enrollment", "kme", "knox platform for enterprise", "kpe", "knox configure"],
  },
]);

/** Apply a site's [from, to] url-prefix rewrites (first match wins). */
function applyRewrite(site, url) {
  const s = String(url || "");
  for (const [from, to] of (site && site.rewrite) || []) {
    if (s.startsWith(from)) return to + s.slice(from.length);
  }
  return s;
}

/** True when `url` is on one of the site's hosts and under one of its scope prefixes. */
function inScope(site, url) {
  let u;
  try {
    u = new URL(String(url));
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const host = u.hostname.toLowerCase();
  if (!site.hosts.some((h) => host === h)) return false;
  const href = u.toString();
  return !site.scope || site.scope.length === 0 || site.scope.some((p) => href.startsWith(p));
}

/**
 * The registered site serving `url`'s host, or null. Exact host match by default (what `map` needs:
 * mapping www.hpe.com must not borrow the Aruba inventory). With `allowParent`, a parent domain also
 * matches (`include_domains: ["firewalla.com"]` means help.firewalla.com too).
 */
function siteForUrl(url, { allowParent = false } = {}) {
  const host = hostOf(url);
  if (!host) return null;
  return (
    REGISTRY.find((s) =>
      s.hosts.some((h) => host === h || (allowParent && (hostMatchesDomain(h, host) || hostMatchesDomain(host, h))))
    ) || null
  );
}

/** A query's tokens as one padded string, so aliases match on whole words ("aos10" → " aos 10 "). */
function paddedTokens(text) {
  return ` ${tokenize(text).join(" ")} `;
}

/** Sites whose aliases appear in the query, as whole words. */
function sitesForQuery(query) {
  const q = paddedTokens(query);
  return REGISTRY.filter((s) => (s.aliases || []).some((a) => q.includes(paddedTokens(a))));
}

/**
 * Resolve which sites a call means.
 * @param {object} opts
 * @param {string[]} [opts.sites]            registry ids or hostnames, explicit
 * @param {string[]} [opts.include_domains]  a search call's domain allowlist
 * @param {string} [opts.query]              aliases in it route to their sites
 * @returns {{sites: object[], unknown: string[]}}
 */
function resolveSites({ sites, include_domains, query } = {}) {
  const out = new Map();
  const unknown = [];
  for (const want of sites || []) {
    const w = String(want).trim().toLowerCase();
    const byId = REGISTRY.find((s) => s.id === w);
    const byHost = byId || siteForUrl(w.includes("://") ? w : `https://${w}/`, { allowParent: true });
    if (byHost) out.set(byHost.id, byHost);
    else if (w) unknown.push(want);
  }
  for (const d of include_domains || []) {
    const s = siteForUrl(`https://${String(d).replace(/^\*\./, "")}/`, { allowParent: true });
    if (s) out.set(s.id, s);
  }
  if (out.size === 0 && query && !(sites && sites.length)) {
    for (const s of sitesForQuery(query)) out.set(s.id, s);
  }
  return { sites: [...out.values()], unknown };
}

/**
 * A one-off site for `map` on an unregistered host: read its robots.txt and /sitemap.xml, scoped to the
 * directory of the given url (a site root maps the whole site).
 */
function adHocSite(url) {
  const u = new URL(String(url));
  const dir = u.pathname.endsWith("/") ? u.pathname : u.pathname.replace(/[^/]*$/, "");
  return {
    id: `adhoc:${u.origin}${dir}`,
    label: u.hostname,
    hosts: [u.hostname.toLowerCase()],
    scope: [`${u.origin}${dir}`],
    robots: true,
    sitemaps: [`${u.origin}/sitemap.xml`],
    aliases: [],
  };
}

module.exports = { REGISTRY, applyRewrite, inScope, siteForUrl, sitesForQuery, resolveSites, adHocSite };
