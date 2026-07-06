"use strict";

/**
 * URL canonicalization + distinct-source clustering for the citation gate.
 *
 * The semantics are PORTED from the connector's `Claude/searxng-search-mcp/src/robust.js`
 * (`canonicalUrl` + `dedupe`) — kept here as a self-contained copy because the engine cannot
 * require() across to that package at runtime, and there is no shared URL-dedup util in
 * `openclaw-bridge/`. KEEP THESE SEMANTICS IN SYNC with the connector's robust.js.
 *
 * G4 invariant (no over-merge): results merge into one source only when they share a canonical
 * URL or a URL-DERIVED citation id. A text-derived citation (a review that merely CITES a paper's
 * PMID in its snippet) NEVER merges — it stays a distinct, independently-corroborating source.
 *
 * Fully deterministic — no wall-clock or RNG globals (forbidden under openclaw-bridge/).
 * `dedup_cluster_id` = the lexicographically smallest cluster key.
 *
 * @module searxng-mcp/cluster
 */

/**
 * Canonicalize a URL for dedup: drop scheme, lowercase the host, strip a leading `www.`, drop
 * default ports (:80/:443), keep the path/query CASE-INTACT (paths are case-sensitive), trim a
 * trailing slash. `http://Www.X.com:80/a/` and `https://x.com/a` fold together; `/AbC` and `/abc`
 * stay distinct. Falls back to a scheme/www/slash strip on parse error.
 */
function canonicalUrl(url) {
  const s = String(url || "");
  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const port = u.port && u.port !== "80" && u.port !== "443" ? ":" + u.port : "";
    return (host + port + u.pathname + u.search).replace(/\/+$/, "");
  } catch {
    return s.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "");
  }
}

/** Hostname (lowercased, no leading www.) of a URL, or "" on failure. */
function hostOf(url) {
  try {
    return new URL(String(url)).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** The dedup keys a result contributes: its canonical URL + each URL-DERIVED citation id. */
function clusterKeys(row) {
  const keys = [];
  const cu = canonicalUrl(row && row.url);
  if (cu) keys.push("u:" + cu);
  const cites = Array.isArray(row && row.citations) ? row.citations : [];
  for (const c of cites) {
    if (c && c.source === "url") keys.push("c:" + c.type + ":" + c.id);
  }
  return keys;
}

/**
 * Union results into distinct-source clusters. Two rows join iff they share any cluster key.
 * Returns an array of clusters `{ id, keys, members }`, where `id` is the lexicographically
 * smallest key (deterministic). A row with no keys (e.g. blank URL) forms its own cluster.
 *
 * @param {Array<object>} rows
 * @returns {Array<{id:string, keys:string[], members:object[]}>}
 */
function clusterResults(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const rowKeys = list.map(clusterKeys);

  // Union-find with deterministic tie-break (always point the higher index at the lower).
  const parent = list.map((_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };

  const keyOwner = new Map();
  rowKeys.forEach((keys, i) => {
    for (const k of keys) {
      if (keyOwner.has(k)) union(i, keyOwner.get(k));
      else keyOwner.set(k, i);
    }
  });

  const byRoot = new Map();
  list.forEach((row, i) => {
    const root = find(i);
    if (!byRoot.has(root)) byRoot.set(root, { members: [], keys: new Set() });
    const g = byRoot.get(root);
    g.members.push(row);
    for (const k of rowKeys[i]) g.keys.add(k);
  });

  const clusters = [];
  for (const [root, g] of byRoot) {
    const sortedKeys = [...g.keys].sort();
    const id = sortedKeys.length ? sortedKeys[0] : "row:" + root; // keyless row → stable own id
    clusters.push({ id, keys: sortedKeys, members: g.members });
  }
  return clusters;
}

module.exports = { canonicalUrl, hostOf, clusterKeys, clusterResults };
