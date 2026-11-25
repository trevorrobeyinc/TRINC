"use strict";

/**
 * Hostname helpers shared by the search client, the extractor and the docs registry. Kept in their own
 * dependency-free module so that doc-sites.js / docs-search.js can use them without loading
 * searxng.js (which loads them lazily for its fallback): no require cycle can form.
 *
 * @module url-util
 */

/** Extract the hostname (lowercased, no leading www.) from a URL, or "" on failure. */
function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** True if `host` equals `domain` or is a subdomain of it. */
function hostMatchesDomain(host, domain) {
  const d = String(domain).toLowerCase().replace(/^www\./, "");
  return host === d || host.endsWith("." + d);
}

module.exports = { hostOf, hostMatchesDomain };
