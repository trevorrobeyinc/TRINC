"use strict";

// search-terms.js — turn a business question into the keyword query that search back ends
// understand (2026-10-21, found in the first live-run pre-flight).
//
// Business templates pass the operator's question verbatim as {{topic}} ("Where can a mid-size US
// 3PL warehouse cut labour and energy cost?"). OpenAlex returned ZERO works for that sentence and
// eight relevant ones for "mid-size 3pl warehouse cut labour energy cost"; the web search back end
// keyed on the question words ("can") and returned dictionary pages. The question stays the
// mission text the agents read; only the search query is reduced to its content words.
//
// Deterministic and dependency-free: same input, same query, every run.

// Function words and question words. Content words (nouns, verbs, numbers, acronyms) survive.
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "nor", "of", "in", "on", "at", "to", "for", "from", "by",
  "with", "without", "about", "into", "onto", "over", "under", "between", "among", "as", "than",
  "is", "are", "was", "were", "be", "been", "being", "am", "do", "does", "did", "done", "have",
  "has", "had", "can", "could", "should", "would", "will", "shall", "may", "might", "must",
  "what", "which", "who", "whom", "whose", "where", "when", "why", "how", "whether",
  "that", "this", "these", "those", "it", "its", "we", "us", "our", "ours", "you", "your",
  "they", "them", "their", "i", "me", "my", "he", "she", "his", "her", "there", "here",
  "if", "then", "so", "such", "not", "no", "any", "some", "much", "many", "very", "also",
  "just", "only", "more", "most", "less", "least", "get", "gets", "getting"
]);

const MAX_TERMS = 10;

/**
 * Content words of `text`, lower-cased, in order of first appearance, without duplicates.
 * Hyphenated words ("mid-size") and digit-bearing tokens ("3PL", "2025") are kept whole.
 * @param {string} text
 * @returns {string[]}
 */
function toSearchTerms(text) {
  if (typeof text !== "string") return [];
  const terms = [];
  const seen = new Set();
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}-]+/u)) {
    const token = raw.replace(/^-+|-+$/g, "");
    if (!token || STOPWORDS.has(token)) continue;
    if (token.length < 2 && !/\d/.test(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    terms.push(token);
  }
  return terms;
}

/**
 * The search query for a subject plus optional focus words: subject terms first, then focus
 * terms not already present, capped at `maxTerms`. Falls back to the trimmed subject when the
 * subject has no content words at all, so a query is never silently emptied.
 * @param {string} subject
 * @param {string} [focus]
 * @param {number} [maxTerms]
 * @returns {string}
 */
function toSearchQuery(subject, focus, maxTerms = MAX_TERMS) {
  const subjectTerms = toSearchTerms(subject);
  if (subjectTerms.length === 0) {
    return [subject, focus].map((s) => (typeof s === "string" ? s.trim() : "")).filter(Boolean).join(" ");
  }
  const terms = subjectTerms.slice();
  for (const term of toSearchTerms(focus)) if (!terms.includes(term)) terms.push(term);
  return terms.slice(0, Math.max(1, maxTerms)).join(" ");
}

module.exports = { toSearchTerms, toSearchQuery, STOPWORDS, MAX_TERMS };
