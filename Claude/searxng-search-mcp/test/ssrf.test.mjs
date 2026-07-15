/**
 * Unit tests for the extract/map SSRF guard.
 * Address classification is pure. `assertUrlAllowed` uses dns.lookup, which resolves IP literals
 * and `localhost` from the resolver/hosts file without leaving the machine — no network required.
 * Run: `node --test test/ssrf.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// Short DNS/fetch budget so the hung-resolver test rejects fast (config reads this at load). Literal
// and localhost lookups used by the other tests still resolve well within it.
process.env.SEARXNG_FETCH_TIMEOUT_MS = "300";
const { assertUrlAllowed, isBlockedAddress, normalizeHost, toMappedIpv4 } = require("../src/ssrf.js");

const rejects = (p, re) => assert.rejects(p, (e) => re.test(e.message), `expected /${re.source}/`);

test("isBlockedAddress: blocks loopback, private, CGNAT, link-local, multicast, unspecified", () => {
  for (const ip of [
    "127.0.0.1", "127.1.2.3", // loopback /8
    "10.0.0.1", "10.255.255.255", // RFC1918
    "172.16.0.1", "172.31.255.255", // RFC1918
    "192.168.1.1",
    "169.254.169.254", // cloud metadata
    "100.64.0.1", "100.127.0.1", // CGNAT
    "0.0.0.0",
    "224.0.0.1", "255.255.255.255", // multicast / broadcast
    "::1", "::", // v6 loopback / unspecified
    "fe80::1", "febf::1", // v6 link-local
    "fc00::1", "fd12:3456::1", // v6 unique-local
    "ff02::1", // v6 multicast
    "::ffff:127.0.0.1", "::ffff:7f00:1", // IPv4-mapped loopback, both spellings
    "fe80::1%en0", // zone id must not defeat the check
  ]) {
    assert.equal(isBlockedAddress(ip), true, `${ip} must be blocked`);
  }
});

test("isBlockedAddress: allows genuinely public addresses", () => {
  for (const ip of [
    "8.8.8.8", "1.1.1.1", "140.82.112.3",
    "172.15.0.1", "172.32.0.1", // just outside 172.16/12
    "100.63.255.255", "100.128.0.1", // just outside 100.64/10
    "192.169.0.1", "11.0.0.1",
    "2606:4700:4700::1111", "2001:4860:4860::8888",
  ]) {
    assert.equal(isBlockedAddress(ip), false, `${ip} must be allowed`);
  }
});

test("isBlockedAddress: fails closed on anything unparseable", () => {
  for (const junk of ["", "not-an-ip", "999.1.1.1", "127.0.0", undefined, null]) {
    assert.equal(isBlockedAddress(junk), true);
  }
});

test("toMappedIpv4: unwraps both IPv4-mapped spellings, ignores plain v6", () => {
  assert.equal(toMappedIpv4("::ffff:192.168.0.1"), "192.168.0.1");
  assert.equal(toMappedIpv4("::ffff:7f00:1"), "127.0.0.1");
  assert.equal(toMappedIpv4("2606:4700::1111"), null);
});

test("isBlockedAddress: deprecated IPv4-COMPATIBLE IPv6 (::a.b.c.d, no ffff:) inherits the IPv4 block", () => {
  // `new URL('http://[::127.0.0.1]/')` canonicalizes to `::7f00:1` — must still be blocked.
  assert.equal(isBlockedAddress("::7f00:1"), true); // ::127.0.0.1
  assert.equal(isBlockedAddress("::a9fe:a9fe"), true); // ::169.254.169.254 (metadata)
  assert.equal(isBlockedAddress("::c0a8:1"), true); // ::192.168.0.1
  assert.equal(isBlockedAddress("::808:808"), false); // ::8.8.8.8 genuinely routes public → allowed
  assert.equal(toMappedIpv4("::7f00:1"), "127.0.0.1"); // and the ::-form now unwraps
});

test("assertUrlAllowed: the ::a.b.c.d loopback literal is refused (was an SSRF bypass)", async () => {
  await rejects(assertUrlAllowed("http://[::127.0.0.1]:9999/"), /non-public address/);
});

test("assertUrlAllowed: a hung DNS resolver is bounded by fetchTimeoutMs, not left dangling forever", async () => {
  const dns = require("node:dns").promises;
  const orig = dns.lookup;
  dns.lookup = () => new Promise(() => {}); // never settles — simulates a black-holed resolver
  try {
    // Without the timeout race this would hang indefinitely and time out the whole test run.
    await rejects(assertUrlAllowed("http://never-resolves.invalid.example/"), /DNS lookup .* timed out/);
  } finally {
    dns.lookup = orig;
  }
});

test("normalizeHost: lowercases and strips IPv6 brackets", () => {
  assert.equal(normalizeHost("[::1]"), "::1");
  assert.equal(normalizeHost("EXAMPLE.COM"), "example.com");
  assert.equal(normalizeHost(undefined), "");
});

test("assertUrlAllowed: refuses the exact loopback targets that leaked before the fix", async () => {
  await rejects(assertUrlAllowed("http://127.0.0.1:6333/collections"), /non-public address/);
  await rejects(assertUrlAllowed("http://127.0.0.1:8890/config"), /non-public address/);
  await rejects(assertUrlAllowed("http://localhost:8890/config"), /non-public address/);
  await rejects(assertUrlAllowed("http://[::1]:6333/"), /non-public address/);
  await rejects(assertUrlAllowed("http://169.254.169.254/latest/meta-data/"), /non-public address/);
});

test("assertUrlAllowed: refuses non-http(s) schemes and malformed input", async () => {
  await rejects(assertUrlAllowed("file:///etc/passwd"), /unsupported scheme/);
  await rejects(assertUrlAllowed("ftp://example.com/x"), /unsupported scheme/);
  await rejects(assertUrlAllowed("data:text/html,<b>hi"), /unsupported scheme/);
  await rejects(assertUrlAllowed("/not/absolute"), /not a valid absolute URL/);
});

test("assertUrlAllowed: the env allowlist is an explicit, hostname-scoped opt-in", async () => {
  const u = await assertUrlAllowed("http://127.0.0.1:6333/collections", ["127.0.0.1"]);
  assert.equal(u.port, "6333");
  // Allowlisting one host does not unlock a different private host.
  await rejects(assertUrlAllowed("http://10.0.0.5/", ["127.0.0.1"]), /non-public address/);
});

test("assertUrlAllowed: a public hostname resolves and passes", async () => {
  const u = await assertUrlAllowed("https://8.8.8.8/anything");
  assert.equal(u.hostname, "8.8.8.8");
});

/* --- redirect revalidation: a PUBLIC url must not be able to 302 into loopback ---------------- */

const { extract } = require("../src/extract.js");

/** Minimal Response stand-in; `fetch` is stubbed so these tests need no network and bind no port. */
const fakeRes = ({ status = 200, location = null, body = "", type = "text/html" }) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (h) => (h.toLowerCase() === "location" ? location : type) },
  text: async () => body,
  body: { cancel: async () => {} },
});

test("extract: a public URL that redirects to loopback is blocked at the second hop", async () => {
  const realFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    // Hop 1 is a public literal (passes the guard) and redirects straight at Qdrant.
    if (String(url).startsWith("http://8.8.8.8/")) {
      return fakeRes({ status: 302, location: "http://127.0.0.1:6333/collections" });
    }
    throw new Error("hop 2 must never be fetched — the guard should have refused it");
  };
  try {
    const out = await extract(["http://8.8.8.8/redirect"]);
    assert.equal(out.results.length, 0);
    assert.equal(out.failed_results.length, 1);
    assert.match(out.failed_results[0].error, /non-public address 127\.0\.0\.1/);
    assert.deepEqual(seen, ["http://8.8.8.8/redirect"]); // hop 2 never left the process
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("extract: a relative Location is resolved and revalidated, not blindly followed", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) =>
    String(url).endsWith("/a")
      ? fakeRes({ status: 301, location: "/b" }) // same public host → must be allowed through
      : fakeRes({ status: 200, body: "<html><body>" + "landed ok. ".repeat(20) + "</body></html>" });
  try {
    const out = await extract(["http://8.8.8.8/a"], { format: "text" });
    assert.equal(out.failed_results.length, 0);
    assert.match(out.results[0].raw_content, /landed ok/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("extract: a redirect loop terminates instead of hanging", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => fakeRes({ status: 302, location: "http://8.8.8.8/loop" });
  try {
    const out = await extract(["http://8.8.8.8/loop"]);
    assert.equal(out.results.length, 0);
    assert.match(out.failed_results[0].error, /too many redirects/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
