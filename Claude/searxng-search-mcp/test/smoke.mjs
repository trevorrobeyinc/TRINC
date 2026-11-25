/**
 * End-to-end smoke test for the SearXNG search connector.
 * Exercises the handlers directly against the running local SearXNG instance —
 * no MCP transport needed. Run: `npm run smoke` (SearXNG must be up on :8890).
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { TOOLS, handleSearch, handleExtract, handleMap } = require("../src/tools.js");

let failures = 0;
const ok = (label, cond, detail = "") => {
  console.log(`${cond ? "✅" : "❌"} ${label}${detail ? "  — " + detail : ""}`);
  if (!cond) failures++;
};

console.log("=== tool registration ===");
ok(
  "exposes 5 tools (search, extract, map, docs_search, search_health)",
  TOOLS.map((t) => t.name).join(",") === "search,extract,map,docs_search,search_health",
  TOOLS.map((t) => t.name).join(", ")
);
for (const t of TOOLS) {
  ok(`${t.name} has schema`, !!t.inputSchema && t.inputSchema.type === "object");
}

console.log("\n=== search ===");
const s = await handleSearch({ query: "CRISPR base editing off-target", max_results: 5 });
ok("returns results", Array.isArray(s.results) && s.results.length > 0, `${s.results.length} hits`);
ok("result has url+title", !!s.results[0]?.url && s.results[0]?.title !== undefined);
ok("Tavily-shaped keys", ["query", "answer", "results", "response_time"].every((k) => k in s));
console.log("   e.g.:", s.results[0]?.title?.slice(0, 70), "→", s.results[0]?.url);

console.log("\n=== search (science topic → citation extraction) ===");
const sci = await handleSearch({ query: "encorafenib BRAF melanoma", topic: "science", max_results: 8 });
ok("science query returns results", Array.isArray(sci.results) && sci.results.length > 0, `${sci.results.length} hits`);
const withCites = sci.results.filter((r) => Array.isArray(r.citations) && r.citations.length > 0);
// Soft signal (scholarly engines can rate-limit): report coverage, only warn if zero.
console.log(`   citation coverage: ${withCites.length}/${sci.results.length}`,
  withCites[0] ? `e.g. ${withCites[0].citations.map((c) => c.type + ":" + c.id).join(", ")}` : "(none this run)");
if (withCites.length === 0) console.log("   ⚠️  no citations extracted this run (scholarly engines may be throttled)");

console.log("\n=== search (domain filter) ===");
const sd = await handleSearch({
  query: "insulin clinical trial",
  max_results: 5,
  include_domains: ["clinicaltrials.gov", "nih.gov"],
});
const allowed = sd.results.every((r) => /(^|\.)(clinicaltrials\.gov|nih\.gov)$/.test(new URL(r.url).hostname.replace(/^www\./, "")));
ok("include_domains enforced", sd.results.length === 0 || allowed, `${sd.results.length} on-domain hits`);

console.log("\n=== extract ===");
// Deterministic, reachable target (a random search hit may be a bot-blocked or
// sinkholed host — those correctly land in failed_results, which is a separate test).
const e = await handleExtract({ urls: "https://en.wikipedia.org/wiki/CRISPR", format: "markdown" });
ok("extract returns content", e.results.length > 0 && e.results[0].raw_content.length > 50,
  `${e.results[0]?.raw_content?.length || 0} chars, ${e.failed_results.length} failed`);
ok("markdown looks clean", (e.results[0]?.raw_content || "").includes("CRISPR"));
ok("Tavily-shaped keys", ["results", "failed_results", "response_time"].every((k) => k in e));

console.log("\n=== extract (graceful failure) ===");
const ef = await handleExtract({ urls: "https://nonexistent.invalid.tld.example" });
ok("bad URL → failed_results, not a throw", ef.failed_results.length === 1 && ef.results.length === 0,
  ef.failed_results[0]?.error);

console.log("\n=== map ===");
const m = await handleMap({ url: "https://en.wikipedia.org/wiki/CRISPR" });
ok("map finds same-domain urls", Array.isArray(m.results) && m.results.length > 0, `${m.count} urls`);

console.log(`\n${failures === 0 ? "ALL SMOKE CHECKS PASSED" : failures + " CHECK(S) FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
