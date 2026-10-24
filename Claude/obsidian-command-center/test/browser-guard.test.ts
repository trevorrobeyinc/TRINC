// Unit tests for src/bridge/browser-guard.ts and its wiring into the bridge. Run: npm test
//
// The program-client header sets were measured on 2026-10-24 against a throwaway HTTPS echo server
// (Node https, Node fetch, curl, Python urllib). The browser sets follow the Fetch Metadata spec: a web
// page always sends Sec-Fetch-Site (same-origin, same-site or cross-site), and Origin on any POST.
// The same vectors run in the :8798 and :8800 bridges, whose guard copies are byte-identical.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { refuseBrowserRequest } from "../src/bridge/browser-guard.ts";

const SERVER_FILE = "../src/bridge/mcp-bridge-server.ts";
const PORT = 8799;
const HOST = `127.0.0.1:${PORT}`;

test("program clients pass: Node https, curl and Python send only Host", () => {
  assert.equal(refuseBrowserRequest({ host: HOST }, PORT), null);
});

test("Node's built-in fetch passes despite its sec-fetch-mode: cors", () => {
  assert.equal(refuseBrowserRequest({ host: HOST, "sec-fetch-mode": "cors" }, PORT), null);
});

test("Obsidian requestUrl (Electron net, no initiator) passes even with Sec-Fetch-Site: none", () => {
  const headers = { host: HOST, "sec-fetch-site": "none", "sec-fetch-mode": "no-cors", "sec-fetch-dest": "empty" };
  assert.equal(refuseBrowserRequest(headers, PORT), null);
});

test("localhost and [::1] on the arrival port pass", () => {
  assert.equal(refuseBrowserRequest({ host: `localhost:${PORT}` }, PORT), null);
  assert.equal(refuseBrowserRequest({ host: `[::1]:${PORT}` }, PORT), null);
});

test("a cross-site fetch from a web page is refused with 403", () => {
  const refusal = refuseBrowserRequest(
    { host: HOST, origin: "https://evil.example", "sec-fetch-site": "cross-site", "sec-fetch-mode": "cors" },
    PORT
  );
  assert.equal(refusal?.status, 403);
  assert.equal(refusal?.code, "browser_origin");
  assert.match(refusal!.reason, /origin=https:\/\/evil\.example/);
  assert.match(refusal!.reason, /sec-fetch-site=cross-site/);
});

test("a no-cors GET from a web page (an <img> probe, no Origin) is refused by Sec-Fetch-Site", () => {
  const refusal = refuseBrowserRequest(
    { host: HOST, "sec-fetch-site": "cross-site", "sec-fetch-mode": "no-cors", "sec-fetch-dest": "image" },
    PORT
  );
  assert.equal(refusal?.code, "browser_origin");
});

test("same-site and same-origin requests are refused", () => {
  assert.equal(refuseBrowserRequest({ host: HOST, "sec-fetch-site": "same-site" }, PORT)?.code, "browser_origin");
  assert.equal(refuseBrowserRequest({ host: HOST, "sec-fetch-site": "same-origin" }, PORT)?.code, "browser_origin");
});

test("an older browser's POST without fetch metadata is refused by Origin alone, Origin: null included", () => {
  assert.equal(refuseBrowserRequest({ host: HOST, origin: "https://evil.example" }, PORT)?.status, 403);
  assert.equal(refuseBrowserRequest({ host: HOST, origin: "null" }, PORT)?.status, 403);
});

test("a Referer alone is refused, and its value is not logged", () => {
  const refusal = refuseBrowserRequest({ host: HOST, referer: "https://evil.example/page?secret=1" }, PORT);
  assert.equal(refusal?.code, "browser_origin");
  assert.equal(refusal?.reason, "referer");
});

test("DNS rebinding: a page's own host name is refused with 421 before the header check", () => {
  const refusal = refuseBrowserRequest(
    { host: `evil.example:${PORT}`, origin: `https://evil.example:${PORT}`, "sec-fetch-site": "same-origin" },
    PORT
  );
  assert.equal(refusal?.status, 421);
  assert.equal(refusal?.code, "wrong_host");
});

test("a missing Host, another port or another address is refused with 421", () => {
  assert.equal(refuseBrowserRequest({}, PORT)?.code, "wrong_host");
  assert.equal(refuseBrowserRequest({ host: "127.0.0.1:9999" }, PORT)?.code, "wrong_host");
  assert.equal(refuseBrowserRequest({ host: `192.168.1.5:${PORT}` }, PORT)?.code, "wrong_host");
});

test("a duplicated Sec-Fetch-Site that is not exactly none is refused", () => {
  assert.equal(refuseBrowserRequest({ host: HOST, "sec-fetch-site": "none, cross-site" }, PORT)?.code, "browser_origin");
});

test("on a unix socket (no port) Host is not checked, but browser headers still are", () => {
  assert.equal(refuseBrowserRequest({ host: "localhost" }, undefined), null);
  assert.equal(refuseBrowserRequest({ host: "localhost", origin: "https://evil.example" }, undefined)?.code, "browser_origin");
});

test("reason fields are clipped to 100 characters", () => {
  const refusal = refuseBrowserRequest({ host: "x".repeat(500) }, PORT);
  assert.equal(refusal?.reason, `host=${"x".repeat(100)}`);
});

test("the bridge runs the guard before auth, and sends no CORS headers", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(here, SERVER_FILE), "utf8");
  const guard = source.indexOf("refuseBrowserRequest(req.headers, req.socket.localPort)");
  const auth = source.indexOf("verifyToken(this.bridgeToken");
  assert.ok(guard > 0, "the handler must call the browser guard");
  assert.ok(auth > 0, "the handler must still verify the bearer token");
  assert.ok(guard < auth, "the browser guard must run before authentication");
  assert.equal(source.includes("Access-Control-Allow-Origin"), false, "no CORS headers: every client is a program");
});
