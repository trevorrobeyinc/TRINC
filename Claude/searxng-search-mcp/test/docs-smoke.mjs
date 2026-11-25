/**
 * Live smoke test for docs_search, the search relevance guard, sitemap-aware map and search_health.
 * Needs the network (public doc sites) and, for search/search_health, the local SearXNG through the
 * HTTPS proxy, so set NODE_EXTRA_CA_CERTS to the mkcert root. Not part of test:unit.
 *
 *   NODE_EXTRA_CA_CERTS="$HOME/Library/Application Support/mkcert/rootCA.pem" npm run smoke:docs
 *
 * Exit 0 when every docs lookup finds its expected page, 1 otherwise. The search and health checks
 * are reported, not asserted: general-web quality depends on engines this repo does not control.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { handleDocsSearch, handleMap, handleSearch, handleSearchHealth } = require("../src/tools.js");

const DOCS = [
  // The one AOS page that says "tarpit" (2026-11-24); it ties with six siblings in stage 1.
  { query: "AOS 10 WIDS containment tarpit", expect: /arubanetworking\.hpe\.com\/techdocs\/aos\/wifi-design-deploy\/security\/wids-wips\/protection\// },
  { query: "AOS 10 AP ports uplink", expect: /arubanetworking\.hpe\.com\/techdocs\/aos\/aos10\/design\/ap-ports\// },
  { query: "aruba new central API list monitored APs", expect: /developer\.arubanetworks\.com\/new-central\/reference\/listmonitoredaps/ },
  { query: "crowdstrike falcon mcp custom IOA module", expect: /developer\.crowdstrike\.com\/falcon-mcp\/modules\/custom-ioa\// },
  { query: "firewalla target list", expect: /(help\.firewalla\.com|docs\.firewalla\.net)\// },
  { query: "knox manage enrollment android enterprise", expect: /docs\.samsungknox\.com\// },
];

let failed = 0;
const line = (ok, label, detail) => console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `\n      ${detail}` : ""}`);

for (const d of DOCS) {
  const started = Date.now();
  try {
    const out = await handleDocsSearch({ query: d.query, max_results: 5 });
    const hit = out.results.findIndex((r) => d.expect.test(r.url));
    const ok = hit >= 0;
    if (!ok) failed++;
    line(
      ok,
      `docs_search "${d.query}" (${out.sites.map((s) => s.id).join(",")}, ${Date.now() - started} ms)`,
      ok
        ? `#${hit + 1} ${out.results[hit].url}\n      "${out.results[hit].content.slice(0, 160)}…"`
        : `top: ${out.results.slice(0, 3).map((r) => r.url).join("  ") || "(none)"}; quality ${out.quality.status}; failed ${out.failed_results.length}`
    );
  } catch (err) {
    failed++;
    line(false, `docs_search "${d.query}"`, String(err.message || err));
  }
}

try {
  const m = await handleMap({ url: "https://arubanetworking.hpe.com/techdocs/aos/aos10/", query: "ap ports", max_results: 5 });
  const ok = /aos10\/design\/ap-ports\//.test(m.results[0] || "");
  if (!ok) failed++;
  line(ok, `map aos10 query "ap ports" (${m.total_found} urls; sources ${m.sources.filter((s) => s.ok).length} ok)`, `first: ${m.results[0]}`);
} catch (err) {
  failed++;
  line(false, "map aos10", String(err.message || err));
}

for (const q of ["AOS 10 WIDS containment tarpit", "crowdstrike falcon custom IOA rule groups API", "python asyncio gather return_exceptions"]) {
  try {
    const s = await handleSearch({ query: q, max_results: 5 });
    console.log(
      `INFO  search "${q}": quality ${s.quality.status} (initial ${s.quality.initial_status}${s.quality.junk ? `, junk ${s.quality.junk}` : ""}); ` +
        `${s.results.length} results, ${s.off_topic_results.length} off-topic; tried ${s.engines_tried.map((t) => `${t.step}:${t.status}`).join(" → ")}`
    );
    for (const r of s.results.slice(0, 3)) console.log(`        ${String(r.engine).padEnd(24)} ${r.url}`);
  } catch (err) {
    console.log(`INFO  search "${q}": ERROR ${err.message || err}`);
  }
}

try {
  const h = await handleSearchHealth({ refresh: true });
  console.log(`INFO  search_health: general_web ${h.general_web}: ${h.summary}`);
  for (const e of h.engines) console.log(`        ${e.engine.padEnd(12)} ${e.status.padEnd(12)} common=${e.probes.common.verdict} niche=${e.probes.niche.verdict}${e.probes.niche.junk ? `(${e.probes.niche.junk})` : ""}`);
} catch (err) {
  console.log(`INFO  search_health: ERROR ${err.message || err}`);
}

console.log(failed ? `\n${failed} docs check(s) failed` : "\nall docs checks passed");
process.exit(failed ? 1 : 0);
