/**
 * Relevance guard tests. The isOnTopic cases are the CLEAR ones from the 2026-11-24 evidence (any sound
 * rule must pass them); borderline cases (2 of 5 words, 1 of 2 on an inner page) are deliberately left
 * unasserted: they are the rule's own design choice.
 * Run: `node --test test/relevance.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { isOnTopic, isHomePage, assessRow, assessQuality, junkKind, queryTerms } = require("../src/relevance.js");

test("isHomePage: front pages, bare locales and index documents; nothing deeper", () => {
  for (const u of ["https://www.asos.com/", "https://www.aos.org", "https://www.samsungknox.com/en", "https://x.example/en-us/", "https://x.example/index.html"]) {
    assert.equal(isHomePage(u), true, u);
  }
  for (const u of ["https://finance.yahoo.com/quote/AOS/", "https://help.firewalla.com/hc/en-us", "https://x.example/?q=1", "https://x.example/?p=123", "not a url"]) {
    assert.equal(isHomePage(u), false, u);
  }
  // Bing appends msockid to the urls it returns; tracking parameters must not hide a front page.
  assert.equal(isHomePage("https://www.asos.com/?msockid=1e5918b917356b140cc400a5167c6a55"), true);
  assert.equal(isHomePage("https://www.samsung.com/us/?msockid=32eb&utm_source=x"), true);
});

test("isOnTopic: the clear cases (your rule must pass these)", () => {
  const T = (termCount, matched, homePage, titleHit) => isOnTopic({ termCount, matched, homePage, titleHit });
  // Nothing in common: Bing's "Stanford University" for "tarpit containment WIDS AOS 10".
  assert.equal(T(5, 0, false, false), false);
  // Only the first word of five: the American Orchid Society for "AOS 10 WIDS containment tarpit".
  assert.equal(T(5, 1, true, true), false);
  assert.equal(T(5, 1, false, true), false);
  // Every word, or most of them: the Aruba containment page.
  assert.equal(T(5, 5, false, true), true);
  assert.equal(T(5, 4, false, false), true);
  // A one-word query's front page IS the answer ("firewalla" → firewalla.com).
  assert.equal(T(1, 1, true, true), true);
  // A front page matching only part of a multi-word query is home-page junk.
  assert.equal(T(2, 1, true, true), false);
  assert.equal(T(4, 1, true, true), false);
});

test("assessRow: real rows from 2026-11-24 against 'AOS 10 WIDS containment tarpit'", () => {
  const terms = queryTerms("AOS 10 WIDS containment tarpit");
  const orchid = assessRow({ title: "American Orchid Society", url: "https://www.aos.org/", content: "Orchids, shows and culture." }, terms);
  assert.deepEqual(orchid.matched_terms, ["aos"]);
  assert.equal(orchid.home_page, true);
  assert.equal(orchid.on_topic, false);
  assert.equal(orchid.relevance, 0.2);
  const aruba = assessRow(
    {
      title: "Rogue AP containment",
      url: "https://arubanetworking.hpe.com/techdocs/aos/wifi-design-deploy/security/wids-wips/protection/containment/",
      content: "AOS 10 APs contain rogues that WIDS finds; tarpit containment sends their clients false channel information.",
    },
    terms
  );
  assert.equal(aruba.relevance, 1);
  assert.equal(aruba.title_hit, true);
  assert.equal(aruba.on_topic, true);
  // No content words: nothing to judge by, so the row is kept.
  assert.equal(assessRow({ title: "x", url: "https://x.example/" }, queryTerms("what is it")).on_topic, true);
});

test("assessQuality: ok / thin / degraded / empty / unjudged", () => {
  const terms = queryTerms("aos wids containment");
  const on = { on_topic: true, matched_terms: ["aos", "wids", "containment"], home_page: false };
  const off = { on_topic: false, matched_terms: ["aos"], home_page: false };
  assert.equal(assessQuality([on, on, off], terms, { limit: 5 }).status, "ok");
  assert.equal(assessQuality([on, off], terms, { limit: 5 }).status, "thin");
  assert.equal(assessQuality([on, off], terms, { limit: 1 }).status, "ok", "one answer is enough when one was asked for");
  const deg = assessQuality([off, off], terms, { limit: 5 });
  assert.equal(deg.status, "degraded");
  assert.match(deg.reason, /best: 1 of 3/);
  assert.equal(assessQuality([], terms).status, "empty");
  assert.equal(assessQuality([on], queryTerms("the of")).status, "unjudged");
});

test("junkKind: unrelated, first_word, home_pages, partial", () => {
  const terms = queryTerms("aos wids containment tarpit");
  const row = (matched, home = false) => ({ on_topic: false, matched_terms: matched, home_page: home });
  assert.equal(junkKind([row([]), row([])], terms), "unrelated");
  assert.equal(junkKind([row(["aos"]), row([])], terms), "first_word");
  assert.equal(junkKind([row(["wids"], true), row(["tarpit"], true), row(["containment"])], terms), "home_pages");
  assert.equal(junkKind([row(["wids"]), row(["tarpit"])], terms), "partial");
  assert.equal(junkKind([], terms), null);
});
