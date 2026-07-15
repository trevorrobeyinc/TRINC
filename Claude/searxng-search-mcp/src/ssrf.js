"use strict";

/**
 * SSRF guard for the outbound page fetcher behind `extract` / `map` / `search(include_raw_content)`.
 *
 * Those tools take an ARBITRARY url, and the url can originate from untrusted text (a search-result
 * snippet, a link on a mapped page). Without this guard an LLM could be steered into fetching an
 * internal loopback/private service and echoing its body back into the transcript — verified
 * 2026-07-10, when `extract` happily returned the contents of the loopback Qdrant API and of
 * SearXNG's own plaintext upstream. (Ports omitted here on purpose: naming a plaintext upstream
 * host:port in source trips `scripts/lint-transport-monorepo.sh`, correctly.)
 *
 * Policy: resolve the hostname, then refuse if ANY resolved address is loopback, private (RFC1918),
 * carrier-grade NAT, link-local (incl. the 169.254.169.254 cloud-metadata address), unique-local,
 * multicast/reserved, or the unspecified address. Non-http(s) schemes are refused outright.
 * `SEARXNG_EXTRACT_ALLOW_HOSTS` (comma-separated HOSTNAMES, as written in the url — not resolved
 * IPs) is the explicit opt-in escape hatch for deliberate local use.
 *
 * Redirects are the other half: a public url can 302 into loopback. `fetchUrl` therefore uses
 * `redirect: "manual"` and re-validates every hop through `assertUrlAllowed` rather than letting
 * undici follow the chain unchecked.
 *
 * KNOWN RESIDUAL RISK — DNS rebinding (TOCTOU). We resolve the name, approve the addresses, then
 * hand the NAME back to `fetch`, which resolves it a second time. A hostile authoritative server
 * answering with a public address on the first lookup and a private one on the second would slip
 * through. Fully closing this requires pinning the approved IP for the connection (an undici
 * `Agent` with a custom `connect.lookup`, or a hand-rolled http/https request). Node 22 exposes no
 * dispatcher hook on global `fetch` and this package deliberately carries no `undici` dependency,
 * so the window is documented rather than closed. It is a much narrower hole than the wide-open
 * "fetch any loopback url on request" behavior this replaces.
 *
 * @module ssrf
 */

const dns = require("node:dns").promises;
const net = require("node:net");
const { CONFIG } = require("./config.js");

/** Hard cap on redirect hops before we give up (each hop is re-validated). */
const MAX_REDIRECTS = 5;

/** Lowercase a URL hostname and strip the brackets `new URL()` keeps around IPv6 literals. */
function normalizeHost(hostname) {
  return String(hostname || "")
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "");
}

/** IPv4 ranges that must never be fetched. */
function isBlockedIpv4(ip) {
  const [a, b] = ip.split(".").map(Number);
  if (a === 0) return true; // 0.0.0.0/8   "this network" (0.0.0.0 often aliases loopback)
  if (a === 10) return true; // 10.0.0.0/8  RFC1918
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 carrier-grade NAT
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local, incl. 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 RFC1918
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 RFC1918
  if (a >= 224) return true; // 224/4 multicast + 240/4 reserved + 255.255.255.255 broadcast
  return false;
}

/**
 * Extract the embedded IPv4 from an IPv6 that carries one in its low 32 bits, else null. Covers BOTH
 * the modern IPv4-MAPPED form (`::ffff:127.0.0.1` / `::ffff:7f00:1`) AND the deprecated IPv4-COMPATIBLE
 * form (`::127.0.0.1`, which `new URL()` canonicalizes to `::7f00:1`) — both must inherit the IPv4
 * block policy or they become an SSRF bypass. `::` and `::1` carry no embedded dotted/hex-PAIR IPv4,
 * so they do NOT match here and stay handled as unspecified/loopback by isBlockedIpv6.
 */
function toMappedIpv4(s) {
  const dotted = /^::(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (dotted) return dotted[1];
  const hex = /^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(s);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return [(hi >> 8) & 255, hi & 255, (lo >> 8) & 255, lo & 255].join(".");
  }
  return null;
}

/** IPv6 ranges that must never be fetched (IPv4-mapped forms defer to the IPv4 policy). */
function isBlockedIpv6(ip) {
  const s = ip.toLowerCase().split("%")[0]; // drop any zone id, e.g. fe80::1%en0
  const mapped = toMappedIpv4(s);
  if (mapped) return isBlockedIpv4(mapped);
  if (s === "::" || s === "::1") return true; // unspecified / loopback
  if (/^fe[89ab]/.test(s)) return true; // fe80::/10 link-local
  if (/^f[cd]/.test(s)) return true; // fc00::/7  unique-local
  if (/^ff/.test(s)) return true; // ff00::/8  multicast
  return false;
}

/** True when `ip` is a non-public address. Anything unparseable is treated as blocked. */
function isBlockedAddress(ip) {
  if (net.isIPv4(ip)) return isBlockedIpv4(ip);
  if (net.isIPv6(ip)) return isBlockedIpv6(ip);
  return true; // fail closed
}

/**
 * `dns.lookup` honors NO AbortSignal (node:dns ignores it — verified), and the abort budget in
 * extract.js's `fetchUrl` is wired only to the subsequent `fetch()`, NOT to this pre-fetch
 * resolution. So a hung / black-holed resolver would hang extract/map (and search with
 * include_raw_content) indefinitely, wedging a concurrency lane until the server is restarted.
 * Race the lookup against a timer so the CALLER's wait is bounded — the orphaned lookup itself
 * can't be cancelled, but the tool call recovers instead of dangling forever.
 */
function lookupWithTimeout(host, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`blocked: DNS lookup for "${host}" timed out after ${ms}ms`)),
      ms
    );
  });
  return Promise.race([
    dns.lookup(host, { all: true, verbatim: true }),
    timeout,
  ]).finally(() => clearTimeout(timer));
}

/**
 * Throw unless `rawUrl` is an http(s) url whose hostname resolves exclusively to public addresses.
 * Returns the parsed URL on success. Blocks if ANY resolved address is non-public (a name with one
 * public and one private A record must not be reachable).
 *
 * @param {string} rawUrl
 * @param {string[]} [allowHosts] hostnames exempt from the address check (defaults to CONFIG)
 * @returns {Promise<URL>}
 */
async function assertUrlAllowed(rawUrl, allowHosts = CONFIG.extractAllowHosts) {
  let u;
  try {
    u = new URL(String(rawUrl));
  } catch {
    throw new Error(`blocked: not a valid absolute URL`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`blocked: unsupported scheme "${u.protocol}" (only http/https)`);
  }
  const host = normalizeHost(u.hostname);
  if (!host) throw new Error("blocked: URL has no hostname");
  if (allowHosts.includes(host)) return u; // explicit operator opt-in

  // `dns.lookup` resolves IP literals to themselves, so literal and named hosts share one path.
  // Bounded (see lookupWithTimeout) so a hung resolver can't dangle the whole extract/map call.
  const addrs = await lookupWithTimeout(host, CONFIG.fetchTimeoutMs);
  if (!addrs.length) throw new Error(`blocked: "${host}" did not resolve`);
  const bad = addrs.find((a) => isBlockedAddress(a.address));
  if (bad) {
    throw new Error(
      `blocked: "${host}" resolves to the non-public address ${bad.address}. ` +
        `Set SEARXNG_EXTRACT_ALLOW_HOSTS=${host} to allow it deliberately.`
    );
  }
  return u;
}

module.exports = {
  MAX_REDIRECTS,
  assertUrlAllowed,
  isBlockedAddress,
  isBlockedIpv4,
  isBlockedIpv6,
  normalizeHost,
  toMappedIpv4,
};
