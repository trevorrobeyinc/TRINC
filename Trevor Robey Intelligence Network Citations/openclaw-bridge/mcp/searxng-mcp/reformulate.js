"use strict";

/**
 * v1 breadth-reformulation heuristic (spec build order §1): broaden a query that returned thin
 * evidence, so ONE re-search can surface more distinct sources. Pure & deterministic (no random
 * synonym choice) — the retry's fail-soft behavior lives at the call site in index.js.
 *
 * Heuristic (broaden, don't narrow):
 *   1. Drop exact-match quoting (" and ') so phrase constraints relax to term matching.
 *   2. Drop a trailing parenthetical qualifier — usually the most restrictive scope.
 *   3. If still > 3 terms, drop the LAST term (typically the narrowest qualifier).
 * If every step would empty the query, fall back to the original trimmed query (never return "").
 *
 * @module searxng-mcp/reformulate
 * @param {string} query
 * @returns {string}
 */
function reformulateQuery(query) {
  const original = String(query || "").trim();
  let q = original;

  // 1. loosen exact-match quoting
  q = q.replace(/["']/g, " ").replace(/\s+/g, " ").trim();

  // 2. drop a trailing parenthetical qualifier, e.g. "... (phase 3)"
  q = q.replace(/\s*\([^)]*\)\s*$/, "").trim();

  // 3. drop the narrowest trailing term when there's room to spare
  const terms = q.split(" ").filter(Boolean);
  if (terms.length > 3) q = terms.slice(0, -1).join(" ");

  return q.length ? q : original;
}

module.exports = { reformulateQuery };
