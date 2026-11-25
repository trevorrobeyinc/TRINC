"use strict";

/**
 * Relevance guard: judge whether a search answer is about the query before it is returned as success.
 *
 * Why (measured 2026-11-24): Bing, the only general engine answering this instance, receives the FULL
 * query (its own search box and page title echo it) and still serves results for one word of it
 * ("AOS 10 WIDS containment tarpit" → ASOS, the American Orchid Society) or for nothing in it at all
 * (the same words reversed → Lady Gaga, then Stanford University). That is Bing degrading its answers to
 * an automated client; it arrives as HTTP 200 with ten plausible rows, so only the rows themselves can
 * show it. Every result is scored against the query's content words, and the answer carries a verdict.
 *
 * Pure functions, no I/O.
 *
 * @module relevance
 */

const { queryTerms, matchTerms } = require("./rank.js");

/**
 * Query parameters that only track or localize a visit. Bing appends `msockid` to the urls it returns
 * ("https://www.asos.com/?msockid=1e59…", 2026-11-24), which must not hide a front page.
 */
const TRACKING_PARAM = /^(msockid|utm_\w+|gclid|fbclid|msclkid|mc_cid|mc_eid|ref|hl|lang|locale|language)$/i;

/** A site's front page: no path beyond "/", a bare locale ("/en-us/"), or an index/home document. */
function isHomePage(url) {
  try {
    const u = new URL(String(url));
    const p = u.pathname.replace(/\/+$/, "");
    for (const key of u.searchParams.keys()) if (!TRACKING_PARAM.test(key)) return false; // "?p=123" is a page
    return (
      p === "" ||
      /^\/(index\.(html?|php|aspx?)|home|default\.aspx?)$/i.test(p) ||
      /^\/[a-z]{2}(-[a-z]{2})?$/i.test(p)
    );
  } catch {
    return false;
  }
}

/**
 * Decide whether one search result is about the query.
 *
 * @param {object} a
 * @param {number} a.termCount  content words in the query after stopwords are dropped (always >= 1 here)
 * @param {number} a.matched    how many of them the result's title, snippet or url mentions
 * @param {boolean} a.homePage  the url is a site's front page ("/", "/en-us/", "/index.html")
 * @param {boolean} a.titleHit  at least one query word is in the result's title. Deliberately NOT used:
 *                              a decoy carries the query's first word in its title as often as a real
 *                              answer does ("A. O. Smith Corporation (AOS) Stock Price" for "AOS 10 …"),
 *                              so it cannot tell them apart and must not lower the bar.
 * @returns {boolean} true to keep the row as an answer, false to report it as off-topic
 */
function isOnTopic({ termCount, matched, homePage }) {
  // A front page answers only a query it matches whole ("firewalla" → firewalla.com). Otherwise it is
  // the home-page junk Bing returns for one word of a longer query (aos.org, hpe.com, samsung.com).
  if (homePage) return matched === termCount;
  // Half the query's words, rounded up, and never fewer than two once the query has two or more: one
  // matching word is exactly what a first-word decoy has. A number counts as a word ("10" in "AOS 10"),
  // which is why one extra match is not enough on its own ("(AOS)" + "10-K" is still 2 of 5).
  const need = termCount <= 1 ? 1 : Math.max(2, Math.ceil(termCount / 2));
  return matched >= need;
}

/**
 * Score one result row against the query terms.
 * @param {{title?:string, content?:string, url?:string}} row
 * @param {{stem:string, word:string}[]} terms from queryTerms
 * @returns {{relevance:number, matched_terms:string[], home_page:boolean, title_hit:boolean, on_topic:boolean}}
 */
function assessRow(row, terms) {
  const title = String((row && row.title) || "");
  const url = String((row && row.url) || "");
  const matched = matchTerms(terms, `${title}\n${(row && row.content) || ""}`, url);
  const titleHit = matchTerms(terms, title).length > 0;
  const homePage = isHomePage(url);
  const termCount = terms.length;
  return {
    relevance: termCount ? Math.round((matched.length / termCount) * 100) / 100 : 1,
    matched_terms: matched,
    home_page: homePage,
    title_hit: titleHit,
    // No content words at all (e.g. a query of only stopwords): nothing to judge by, keep everything.
    on_topic: termCount === 0 ? true : Boolean(isOnTopic({ termCount, matched: matched.length, homePage, titleHit })),
  };
}

/**
 * Name the kind of junk an answer with no on-topic row is: "unrelated" (no row shares a word with the
 * query), "first_word" (rows match only the query's first word), "home_pages" (mostly front pages), or
 * "partial" (some words matched, never enough).
 */
function junkKind(assessed, terms) {
  if (assessed.length === 0) return null;
  if (assessed.every((a) => a.matched_terms.length === 0)) return "unrelated";
  const first = terms[0] && terms[0].word;
  if (first && terms.length > 1 && assessed.every((a) => a.matched_terms.every((w) => w === first))) {
    return "first_word";
  }
  if (assessed.filter((a) => a.home_page).length * 2 >= assessed.length) return "home_pages";
  return "partial";
}

/**
 * Verdict for a whole answer.
 *   ok        enough on-topic rows (2, or 1 when only 1 was asked for)
 *   thin      some on-topic rows, fewer than that
 *   degraded  rows came back, none of them on-topic (see `junk`)
 *   empty     no rows at all
 *   unjudged  the query has no content words to judge by
 *
 * @param {Array<{on_topic:boolean, matched_terms:string[], home_page:boolean}>} assessed
 * @param {{stem:string, word:string}[]} terms
 * @param {{limit?: number}} [opts] the caller's max_results
 */
function assessQuality(assessed, terms, { limit = 5 } = {}) {
  const words = terms.map((t) => t.word);
  if (terms.length === 0) {
    return { status: "unjudged", terms: words, on_topic: assessed.length, off_topic: 0, junk: null, reason: "the query has no content words to judge by" };
  }
  const onTopic = assessed.filter((a) => a.on_topic).length;
  const offTopic = assessed.length - onTopic;
  const wanted = Math.max(1, Math.min(2, Number(limit) || 1));
  const best = assessed.reduce((m, a) => Math.max(m, a.matched_terms.length), 0);
  let status;
  let reason = null;
  let junk = null;
  if (assessed.length === 0) {
    status = "empty";
    reason = "no engine returned a result";
  } else if (onTopic === 0) {
    status = "degraded";
    junk = junkKind(assessed, terms);
    reason = `none of the ${assessed.length} results is about the query (best: ${best} of ${terms.length} query words)`;
  } else if (onTopic < wanted) {
    status = "thin";
    reason = `only ${onTopic} of ${assessed.length} results is about the query`;
  } else {
    status = "ok";
  }
  return { status, terms: words, on_topic: onTopic, off_topic: offTopic, best_match: `${best} of ${terms.length}`, junk, reason };
}

/** The compact form an off-topic row is reported in (no snippet: it is evidence of junk, not an answer). */
function compactOffTopic(row, a) {
  return {
    title: row.title || "",
    url: row.url,
    engine: row.engine || null,
    relevance: a.relevance,
    matched_terms: a.matched_terms,
    home_page: a.home_page,
  };
}

module.exports = { queryTerms, isHomePage, isOnTopic, assessRow, assessQuality, junkKind, compactOffTopic };
