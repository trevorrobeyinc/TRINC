"use strict";

/**
 * Dependency-free text ranking shared by the relevance guard (`search`), `docs_search` and `map`:
 * a tokenizer with a light, symmetric English stemmer, query-term extraction, Okapi BM25 over a small
 * document set, and best-passage selection.
 *
 * The stemmer is deliberately crude. It only has to map a query word and the same word in a page to the
 * same key ("rules"/"rule", "configured"/"configure", "policies"/"policy"); because the query and the
 * text go through the same function, an over-stemmed key still matches itself.
 *
 * @module rank
 */

/** Words that carry no topic: English function words plus search filler. */
const STOPWORDS = new Set([
  "a", "about", "an", "and", "any", "are", "as", "at", "be", "best", "by", "can", "do", "doc", "docs",
  "documentation", "does", "example", "examples", "for", "from", "get", "guide", "help", "how", "i", "if",
  "in", "info", "information", "into", "is", "it", "its", "me", "my", "not", "of", "on", "or", "our",
  "page", "so", "than", "that", "the", "their", "then", "there", "these", "this", "to", "tutorial", "use",
  "using", "via", "vs", "was", "way", "what", "when", "where", "which", "who", "why", "will", "with",
  "you", "your",
]);

/**
 * Split text into lower-case word tokens. Breaks on anything that is not a letter or digit, on a
 * lower-to-upper camelCase boundary ("getAccessPoints" → get, access, points) and on a letter/digit
 * boundary ("aos10" → aos, 10), so a url slug and the words of a query meet. Drops 1-character tokens.
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  return String(text || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1);
}

/** True when `s` holds a vowel (used to stop the stemmer cutting a word down to consonants). */
function hasVowel(s) {
  return /[aeiouy]/.test(s);
}

/**
 * Light suffix stripper: plurals, -ing, -ed, a doubled final consonant and a final -e.
 * "policies"→"policy", "addresses"→"address", "rules"→"rule", "monitoring"→"monitor",
 * "configured"/"configure"→"configur", "tarpitting"→"tarpit". Words of 3 characters or fewer and
 * anything holding a digit are returned unchanged.
 * @param {string} word lower-case token
 * @returns {string}
 */
function stem(word) {
  let s = String(word || "");
  if (s.length <= 3 || /\d/.test(s)) return s;
  if (s.endsWith("ies") && s.length > 4) s = s.slice(0, -3) + "y";
  else if (/(sses|xes|ches|shes)$/.test(s)) s = s.slice(0, -2);
  else if (s.endsWith("s") && !/(ss|us|is)$/.test(s)) s = s.slice(0, -1);
  let stripped = false;
  if (s.endsWith("ing") && s.length - 3 >= 4 && hasVowel(s.slice(0, -3))) {
    s = s.slice(0, -3);
    stripped = true;
  } else if (s.endsWith("ed") && s.length - 2 >= 4 && hasVowel(s.slice(0, -2))) {
    s = s.slice(0, -2);
    stripped = true;
  }
  // "tarpitting" → "tarpitt" → "tarpit"; never ll/ss/zz ("installed" → "install").
  if (stripped && /([bcdfghjkmnpqrtvwx])\1$/.test(s)) s = s.slice(0, -1);
  if (s.length > 4 && s.endsWith("e")) s = s.slice(0, -1);
  return s;
}

/** Tokenize, drop stopwords and stem. */
function stemTokens(text) {
  const out = [];
  for (const t of tokenize(text)) if (!STOPWORDS.has(t)) out.push(stem(t));
  return out;
}

/**
 * The content words of a search query, in order, without duplicates. Search operators are removed
 * first (`site:host`, `-exclude`, `filetype:pdf`, quotes), so they never count as topic words.
 * @param {string} query
 * @returns {{stem: string, word: string}[]}
 */
function queryTerms(query) {
  const cleaned = String(query || "")
    .replace(/(^|\s)-\S+/g, " ")
    .replace(/\b(site|inurl|intitle|filetype|ext|lang):\S+/gi, " ")
    .replace(/["“”]/g, " ");
  const seen = new Set();
  const out = [];
  for (const word of tokenize(cleaned)) {
    if (STOPWORDS.has(word)) continue;
    const s = stem(word);
    if (seen.has(s)) continue;
    seen.add(s);
    out.push({ stem: s, word });
  }
  return out;
}

/**
 * Tokens of a url's host and path, for matching query words against an address. Also returns the long
 * "slug" tokens (10+ characters) whose words were run together, e.g. "listmonitoredapsv" — a query word
 * of 4+ characters found INSIDE one of those counts as a match.
 * @param {string} url
 * @returns {{set: Set<string>, slugs: string[]}}
 */
function urlTokens(url) {
  let raw = "";
  try {
    const u = new URL(String(url));
    raw = `${u.hostname} ${decodeURIComponent(u.pathname)}`;
  } catch {
    raw = String(url || "");
  }
  const toks = tokenize(raw);
  return {
    set: new Set(toks.filter((t) => !STOPWORDS.has(t)).map(stem)),
    slugs: toks.filter((t) => t.length >= 10),
  };
}

/**
 * Which query terms a piece of text (and optionally a url) mentions.
 * @param {{stem:string, word:string}[]} terms from queryTerms
 * @param {string} text
 * @param {string} [url]
 * @returns {string[]} the matched query words (original spelling, lower-case)
 */
function matchTerms(terms, text, url) {
  const inText = new Set(stemTokens(text));
  const inUrl = url ? urlTokens(url) : { set: new Set(), slugs: [] };
  return terms
    .filter(
      (t) =>
        inText.has(t.stem) ||
        inUrl.set.has(t.stem) ||
        (t.stem.length >= 4 && inUrl.slugs.some((slug) => slug.includes(t.stem)))
    )
    .map((t) => t.word);
}

/**
 * Okapi BM25 of each document against the query terms. Documents are arrays of stemmed tokens.
 * @param {string[][]} docs
 * @param {string[]} stems query stems
 * @param {{k1?: number, b?: number}} [opts]
 * @returns {number[]} one score per document (0 when it shares no term)
 */
function bm25(docs, stems, { k1 = 1.2, b = 0.75 } = {}) {
  const n = docs.length;
  if (n === 0 || stems.length === 0) return docs.map(() => 0);
  const avgdl = docs.reduce((a, d) => a + d.length, 0) / n || 1;
  const df = new Map(stems.map((s) => [s, 0]));
  const tfs = docs.map((doc) => {
    const tf = new Map();
    for (const w of doc) if (df.has(w)) tf.set(w, (tf.get(w) || 0) + 1);
    for (const w of tf.keys()) df.set(w, df.get(w) + 1);
    return tf;
  });
  return tfs.map((tf, i) => {
    const dl = docs[i].length;
    let score = 0;
    for (const s of stems) {
      const f = tf.get(s) || 0;
      if (!f) continue;
      const d = df.get(s);
      const idf = Math.log(1 + (n - d + 0.5) / (d + 0.5));
      score += (idf * (f * (k1 + 1))) / (f + k1 * (1 - b + (b * dl) / avgdl));
    }
    return score;
  });
}

/** Scale an array of scores to 0..1 by its maximum (all zeros stay zeros). */
function normalize(scores) {
  const max = Math.max(0, ...scores);
  return scores.map((s) => (max > 0 ? s / max : 0));
}

/**
 * The passage of `text` that best covers the query: paragraphs are merged into windows of up to
 * `maxChars`, each scored by distinct terms matched (weighted) plus occurrences, and the best window is
 * returned trimmed at a word boundary.
 * @param {string} text
 * @param {string[]} stems
 * @param {number} [maxChars=600]
 * @returns {string}
 */
function bestPassage(text, stems, maxChars = 600) {
  const paras = [];
  for (const block of String(text || "").split(/\n\s*\n/)) {
    const p = block.replace(/\s+/g, " ").trim();
    if (!p) continue;
    if (p.length <= maxChars) {
      paras.push(p);
      continue;
    }
    // A page with no blank lines arrives as one huge paragraph: cut it at sentence ends, and cut a
    // sentence longer than the window into window-sized pieces, so the best part can still win.
    for (const sentence of p.split(/(?<=[.!?])\s+/)) {
      for (let i = 0; i < sentence.length; i += maxChars) paras.push(sentence.slice(i, i + maxChars));
    }
  }
  if (paras.length === 0) return "";
  const windows = [];
  let cur = "";
  for (const p of paras) {
    if (cur && cur.length + p.length + 1 > maxChars) {
      windows.push(cur);
      cur = p;
    } else {
      cur = cur ? `${cur} ${p}` : p;
    }
  }
  if (cur) windows.push(cur);
  const want = new Set(stems);
  let best = windows[0];
  let bestScore = -1;
  for (const w of windows) {
    const toks = stemTokens(w);
    const distinct = new Set(toks.filter((t) => want.has(t))).size;
    const hits = toks.filter((t) => want.has(t)).length;
    const score = distinct * 3 + Math.min(hits, 12);
    if (score > bestScore) {
      best = w;
      bestScore = score;
    }
  }
  if (best.length <= maxChars) return best;
  const cut = best.slice(0, maxChars);
  const space = cut.lastIndexOf(" ");
  return `${space > maxChars * 0.6 ? cut.slice(0, space) : cut}…`;
}

module.exports = {
  STOPWORDS,
  tokenize,
  stem,
  stemTokens,
  queryTerms,
  urlTokens,
  matchTerms,
  bm25,
  normalize,
  bestPassage,
};
