"use strict";

/**
 * searchFn — the connector-backed search seam injected into the section citation gate.
 *
 * Wraps the `searxng-search` connector's `search()` so the gate consumes the connector's
 * already-cited output (each result carries `citations[].source:"url"|"text"` provenance, which the
 * grade A/B split depends on). The gate must NEVER re-extract via the engine's citation-extractor —
 * only the connector emits per-citation provenance.
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

/**
 * Adapter-shaped searchFn: `(query, params) => Promise<{results:[...]}>`.
 * Throws on infra failure (connector missing / SearXNG unreachable) so the section gate can classify
 * the section as UNCHECKED rather than as zero-coverage.
 *
 * @param {string} query
 * @param {object} [params] topic / max_results / … forwarded to the connector's search()
 */
async function searchFn(query, params = {}) {
  const search = getConnectorSearch();
  return search({ query, ...params });
}

module.exports = { searchFn, getConnectorSearch };
