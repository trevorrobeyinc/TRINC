/**
 * Unit tests for the shared ranking primitives (no network).
 * Run: `node --test test/rank.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { tokenize, stem, queryTerms, matchTerms, urlTokens, bm25, normalize, bestPassage } = require("../src/rank.js");

test("tokenize: splits words, camelCase and letter/digit runs; drops 1-character tokens", () => {
  assert.deepEqual(tokenize("AOS 10 WIDS-WIPS"), ["aos", "10", "wids", "wips"]);
  assert.deepEqual(tokenize("aos10/design/ap-ports"), ["aos", "10", "design", "ap", "ports"]);
  assert.deepEqual(tokenize("getAccessPointsV1"), ["get", "access", "points"]);
  assert.deepEqual(tokenize("a b c"), []);
});

test("stem: the pairs a query and a page must agree on", () => {
  const same = [
    ["rules", "rule"],
    ["policies", "policy"],
    ["addresses", "address"],
    ["configured", "configure"],
    ["configuring", "configure"],
    ["monitoring", "monitored"],
    ["tarpitting", "tarpit"],
    ["devices", "device"],
    ["routing", "route"],
    ["groups", "group"],
    ["ioas", "ioa"],
  ];
  for (const [a, b] of same) assert.equal(stem(a), stem(b), `${a} ~ ${b}`);
  // Never cut a word down to nothing useful, never touch digits or short words.
  assert.equal(stem("string"), "string");
  assert.equal(stem("status"), "status");
  assert.equal(stem("analysis"), "analysis");
  assert.equal(stem("installed"), "install");
  assert.equal(stem("aps"), "aps");
  assert.equal(stem("802"), "802");
});

test("queryTerms: content words in order, operators and stopwords removed, no duplicates", () => {
  const t = queryTerms('site:arubanetworking.hpe.com "AOS 10" WIDS containment -cisco how to tarpit the rules rule');
  assert.deepEqual(
    t.map((x) => x.word),
    ["aos", "10", "wids", "containment", "tarpit", "rules"]
  );
  assert.equal(t.find((x) => x.word === "rules").stem, "rule");
  assert.deepEqual(queryTerms("what is the"), []);
});

test("urlTokens + matchTerms: a query word found in the url path or inside a run-together slug", () => {
  const terms = queryTerms("monitored APs list");
  const url = "https://developer.arubanetworks.com/new-central/reference/listmonitoredapsv1";
  assert.ok(urlTokens(url).slugs.includes("listmonitoredapsv"));
  // "monitor" and "list" (4+ characters) are inside the slug; "aps" is too short to match inside one.
  assert.deepEqual(matchTerms(terms, "", url), ["monitored", "list"]);
  assert.deepEqual(
    matchTerms(queryTerms("WIDS containment"), "Rogue AP containment", "https://x.example/aos/wids-wips/"),
    ["wids", "containment"]
  );
});

test("bm25: the document with more, rarer query terms ranks first; no shared term scores 0", () => {
  const stems = queryTerms("wids containment tarpit").map((t) => t.stem);
  const docs = [
    ["wid", "wip", "overview"],
    ["wid", "containment", "tarpit", "rogue"],
    ["asos", "fashion"],
  ];
  const s = bm25(docs, stems);
  assert.ok(s[1] > s[0], "full match beats partial");
  assert.equal(s[2], 0);
  assert.deepEqual(normalize([0, 2, 4]), [0, 0.5, 1]);
  assert.deepEqual(normalize([0, 0]), [0, 0]);
});

test("bestPassage: returns the window that covers the query, trimmed to the cap", () => {
  const text = [
    "Welcome to the documentation home. Navigation and legal text.",
    "Tarpit containment slows a rogue AP's clients by answering with fake channel information.",
    "Unrelated release notes paragraph.",
  ].join("\n\n");
  const stems = queryTerms("tarpit containment").map((t) => t.stem);
  const p = bestPassage(text, stems, 200);
  assert.match(p, /Tarpit containment slows/);
  // A single huge paragraph is still cut so the best part can win.
  const long = `${"filler words here. ".repeat(80)}The tarpit containment detail lives here. ${"more filler. ".repeat(80)}`;
  const q = bestPassage(long, stems, 120);
  assert.ok(q.length <= 121, `capped: ${q.length}`);
  assert.match(q, /tarpit containment/);
});
