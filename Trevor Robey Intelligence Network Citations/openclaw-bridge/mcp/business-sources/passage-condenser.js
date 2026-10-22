"use strict";

// passage-condenser.js — Evidence Desk: show the model the RELEVANT passages of a web page instead
// of its first 2,500 characters (2026-10-21).
//
// Role-call input is ~95% of a run's tokens (run #6: 174K tokens, three role calls). Most of a
// page's opening is navigation, cookie text and preamble. This module is extractive and
// deterministic: it splits the page into passages, ranks them by BM25 against the subject's
// content words with a capped boost for passages that carry figures (money, percentages, years,
// counts), and returns the top-k VERBATIM with their character offsets.
//
// The invariant the citation layer relies on: every passage is exactly
// `text.slice(start, end)` of the stored snapshot, so `WEB: <id> ¶<n>` points at text anyone can
// find in the snapshot that ships in the bundle. The snapshot itself (and so its WEB hash) is
// unchanged — only what the prompt shows is smaller.
//
// No dependencies, no clock, no randomness: same page + same terms → same passages, every run.

const DEFAULT_TOP_K = 3;
const DEFAULT_MAX_PASSAGE_CHARS = 600;
const MIN_PASSAGE_CHARS = 40;
// BM25 constants (the standard Robertson/Zaragoza defaults).
const K1 = 1.2;
const B = 0.75;
// A passage with figures is worth more to a cost or market question, but only when it is already
// about the subject: the boost MULTIPLIES the BM25 score, so a footer full of years scores zero.
const NUMBER_BOOST = 0.15;
const NUMBER_CAP = 4;

function trimRange(text, start, end) {
  let s = start;
  let e = end;
  while (s < e && /\s/.test(text[s])) s++;
  while (e > s && /\s/.test(text[e - 1])) e--;
  return [s, e];
}

// Split [s, e) into pieces of at most maxChars, cutting at a sentence end when one falls in the
// back 60% of the window, else at the last space, else hard at maxChars.
function splitLong(text, s, e, maxChars, out) {
  let start = s;
  while (e - start > maxChars) {
    const window = text.slice(start, start + maxChars);
    let cut = -1;
    const sentenceEnd = /[.!?]["')\]]?\s/g;
    let m;
    while ((m = sentenceEnd.exec(window)) !== null) cut = m.index + m[0].length - 1;
    if (cut < maxChars * 0.4) {
      const space = window.lastIndexOf(" ");
      cut = space > 0 ? space : maxChars;
    }
    out.push([start, start + cut]);
    start += cut;
    while (start < e && /\s/.test(text[start])) start++;
  }
  if (start < e) out.push([start, e]);
}

/**
 * Split page text into passages: consecutive non-blank lines are joined until a passage would
 * exceed maxChars; a blank line always ends one; an over-long line is split at sentence ends.
 * @returns {Array<{start:number, end:number}>} offsets into `text`, in document order
 */
function splitPassages(text, { maxChars = DEFAULT_MAX_PASSAGE_CHARS } = {}) {
  const src = String(text || "");
  const ranges = [];
  let blockStart = -1;
  let blockEnd = -1;
  const flush = () => {
    if (blockStart >= 0) ranges.push([blockStart, blockEnd]);
    blockStart = -1;
  };
  let pos = 0;
  while (pos <= src.length) {
    const nl = src.indexOf("\n", pos);
    const lineEnd = nl === -1 ? src.length : nl;
    const line = src.slice(pos, lineEnd);
    if (!line.trim()) {
      flush();
    } else if (lineEnd - pos > maxChars) {
      flush();
      splitLong(src, pos, lineEnd, maxChars, ranges);
    } else {
      if (blockStart >= 0 && lineEnd - blockStart > maxChars) flush();
      if (blockStart < 0) blockStart = pos;
      blockEnd = lineEnd;
    }
    if (nl === -1) break;
    pos = nl + 1;
  }
  flush();
  return ranges
    .map(([s, e]) => trimRange(src, s, e))
    .filter(([s, e]) => e - s >= MIN_PASSAGE_CHARS)
    .map(([start, end]) => ({ start, end }));
}

function tokenize(text) {
  return String(text || "").toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]*/gu) || [];
}

// A term longer than four characters matches by its 4-character stem at a word start, as in
// web-evidence.js isOnTopic (labour~labor, warehouse~warehousing). A short term must match a whole
// token or a hyphenated compound's head ("3pl", "3pl-based"); as a bare prefix "per" would match
// "percent" and "period" and rank boilerplate.
function termMatcher(term) {
  const t = String(term || "").toLowerCase();
  if (t.length > 4) {
    const stem = t.slice(0, 4);
    return (tok) => tok.startsWith(stem);
  }
  return (tok) => tok === t || tok.startsWith(`${t}-`);
}

/** How strongly a passage carries figures: money and percentages count double, plain numbers at most twice. */
function numericSignal(text) {
  const s = String(text || "");
  const money = (s.match(/[$€£]\s?\d/g) || []).length;
  const percent = (s.match(/\d\s?(?:%|percent\b|per cent\b)/gi) || []).length;
  const plain = (s.match(/\d+(?:[.,]\d+)*/g) || []).length;
  return Math.min(NUMBER_CAP, 2 * money + 2 * percent + Math.min(plain, 2));
}

/**
 * Rank a page's passages against the subject terms.
 * @param {string} text            the stored snapshot text
 * @param {string[]} terms         content words (search-terms.js toSearchTerms)
 * @param {object} [opts]
 * @param {number} [opts.topK]     passages to return
 * @param {number} [opts.maxChars] maximum passage length
 * @returns {{ passages: Array<{n:number,start:number,end:number,text:string,score:number}>, total:number }}
 *          passages in document order; `n` is the passage's 1-based position in the page (¶n)
 */
function condensePage(text, terms, { topK = DEFAULT_TOP_K, maxChars = DEFAULT_MAX_PASSAGE_CHARS } = {}) {
  const src = String(text || "");
  const ranges = splitPassages(src, { maxChars });
  const matchers = [...new Set((Array.isArray(terms) ? terms : []).map((t) => String(t || "").toLowerCase()).filter(Boolean))]
    .map(termMatcher);
  const docs = ranges.map((r, i) => {
    const passage = src.slice(r.start, r.end);
    return { n: i + 1, start: r.start, end: r.end, text: passage, tokens: tokenize(passage) };
  });
  const total = docs.length;
  if (total === 0) return { passages: [], total };

  const avgLen = docs.reduce((sum, d) => sum + d.tokens.length, 0) / total || 1;
  const tf = docs.map((d) => matchers.map((matches) => d.tokens.filter(matches).length));
  const idf = matchers.map((_, j) => {
    const df = tf.filter((row) => row[j] > 0).length;
    return Math.log(1 + (total - df + 0.5) / (df + 0.5));
  });
  const scored = docs.map((d, i) => {
    const lenNorm = K1 * (1 - B + (B * d.tokens.length) / avgLen);
    let bm25 = 0;
    for (let j = 0; j < matchers.length; j++) {
      const f = tf[i][j];
      if (f > 0) bm25 += idf[j] * ((f * (K1 + 1)) / (f + lenNorm));
    }
    return { ...d, score: bm25 * (1 + NUMBER_BOOST * numericSignal(d.text)) };
  });

  const ranked = scored
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score || a.n - b.n)
    .slice(0, Math.max(1, topK));
  // Nothing matched (possible only when the subject words sit in a dropped fragment): fall back to
  // the page's first passage rather than showing nothing.
  const chosen = ranked.length > 0 ? ranked : [scored[0]];
  const passages = chosen
    .sort((a, b) => a.n - b.n)
    .map((d) => ({ n: d.n, start: d.start, end: d.end, text: d.text, score: Math.round(d.score * 1000) / 1000 }));
  return { passages, total };
}

module.exports = {
  condensePage,
  splitPassages,
  numericSignal,
  DEFAULT_TOP_K,
  DEFAULT_MAX_PASSAGE_CHARS,
  MIN_PASSAGE_CHARS
};
