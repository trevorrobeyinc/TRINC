"use strict";

/**
 * searchFn — the search seam injected into the section citation gate. Since 2026-11-15 the "science"
 * topic goes to mcp/scholarly-search (Europe PMC + Crossref, free and keyless); other topics still
 * go to the SearXNG connector, as below.
 *
 * Wraps the `searxng-search` connector's `search()` so the gate consumes the connector's
 * already-cited output (each result carries `citations[].source:"url"|"metadata"|"text"` provenance,
 * which the grade A/B split depends on — url/metadata are record-identity, text is a mention). The
 * gate must NEVER re-extract via the engine's citation-extractor — only the connector emits
 * per-citation provenance.
 *
 * The connector is `require`d LAZILY (first call), so:
 *   - a connector problem surfaces as a CAUGHT infra error at call time (→ section marked UNCHECKED,
 *     the gate does not fail on that basis) rather than breaking `workflow-engine.js` module load; and
 *   - engines that never reach the quality-audit step never touch the connector at all.
 *
 * @module searxng-mcp/searchfn
 */

const path = require("path");

let _connectorSearch = null;

/** Lazy-load the connector's `search`. Throws (caught upstream as infra) if it cannot be loaded. */
function getConnectorSearch() {
  if (!_connectorSearch) {
    // Resolves the SOURCE-OF-TRUTH repo copy of the connector on the external volume — NOT the staged
    // internal-volume copy the Claude MCP surfaces run. So editing the connector requires re-running
    // Claude/searxng-search-mcp/install-connector.sh to keep engine <-> Claude surfaces in sync.
    // search()'s require graph is 4 dependency-free local files (config/robust/citation-grammar/rerank).
    // Clean under interactive `node` / `claude -p`; NOT launchd-safe (external-volume TCC/EPERM).
    const connectorPath = path.resolve(__dirname, "../../../../Claude/searxng-search-mcp/src/searxng.js");
    _connectorSearch = require(connectorPath).search;
    if (typeof _connectorSearch !== "function") {
      throw new Error(`searxng-search connector at ${connectorPath} does not export search()`);
    }
  }
  return _connectorSearch;
}

// The "science" topic — what the section gate searches for every biomedical report, and for business
// reports since 2026-10-21 (research-profiles.js) — goes straight to Europe PMC and Crossref
// (mcp/scholarly-search, operator decision 2026-11-15) instead of SearXNG's science category, which
// only relayed to those sources and stalled. Any other topic (the general web) still uses the
// SearXNG connector. Both sides keep the contract: rows in the connector's shape, and a throw on an
// infra failure so the section is UNCHECKED rather than zero-coverage (for the scholarly search, also
// one source down while the other found nothing; scholarly-search.js has the whole contract).
let _scholarly = null;
function getScholarlySearch() {
  if (!_scholarly) {
    const { createScholarlySearch } = require("../scholarly-search/scholarly-search.js");
    _scholarly = createScholarlySearch();
  }
  return _scholarly;
}

/**
 * Build an adapter-shaped searchFn from its two back ends (injectable for tests).
 * @param {object} [deps]
 * @param {() => {search: Function}} [deps.scholarly]  the science back end (Europe PMC + Crossref)
 * @param {() => Function} [deps.connector]           the SearXNG connector's search()
 */
function createSearchFn(deps = {}) {
  const scholarly = deps.scholarly || getScholarlySearch;
  const connector = deps.connector || getConnectorSearch;
  return async function routedSearchFn(query, params = {}) {
    const topic = String(params.topic || "science");
    if (topic === "science") return scholarly().search({ query, ...params });
    // The connector's search() takes the parameters it always had: primary_subject and the gate's
    // breadth_retry flag are for the scholarly search only.
    const { primary_subject: _subject, breadth_retry: _retry, ...connectorParams } = params;
    const search = connector();
    return search({ query, ...connectorParams });
  };
}

/**
 * Adapter-shaped searchFn: `(query, params) => Promise<{results:[...]}>`.
 * Throws on infra failure (the scholarly search unable to search in full and finding nothing, or the
 * connector missing / SearXNG unreachable) so the section gate can classify the section as UNCHECKED
 * rather than as zero-coverage.
 *
 * @param {string} query
 * @param {object} [params] topic / max_results / … ("science" when absent, the gate's default)
 */
const searchFn = createSearchFn();

module.exports = { searchFn, createSearchFn, getConnectorSearch, getScholarlySearch };
