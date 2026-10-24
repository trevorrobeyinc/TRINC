#!/usr/bin/env node
// bridge-guard-live-check.mjs — live check of the browser guard on the running :8798, :8799 and :8800
// bridges (ARCHITECTURE.md §5 "Browser guard"). Run it after any bridge redeploy, with Obsidian open:
//
//   NODE_EXTRA_CA_CERTS="$HOME/Library/Application Support/mkcert/rootCA.pem" \
//     node /Users/myhome/TRINC/ops/tr-suite/bridge-guard-live-check.mjs
//
// Read-only: every request goes to the unauthenticated /healthz route, so nothing in the vault is touched.
// The three deliberate browser-style probes per bridge are refused by design and show up as refusals:
// BROWSER_REJECT events in ~/Library/Logs/trevclaw/audit.jsonl (:8798) and console warnings (:8799/:8800).
// Exit 0 = every bridge answered as expected; 1 = at least one did not.
import https from "node:https";

const BRIDGES = [8798, 8799, 8800];
const EVIL = { origin: "https://evil.example", "sec-fetch-site": "cross-site", "sec-fetch-mode": "cors" };

function request(port, { method = "GET", headers = {} } = {}) {
  return new Promise((resolve) => {
    const req = https.request(
      // servername pins the TLS name check to a name on the certificate, so a hostile Host header still reaches
      // the bridge's own Host check. Without it, Node checks the certificate against the Host header and the
      // handshake fails client-side: the browser's first line of defence, not the bridge's.
      { host: "127.0.0.1", port, servername: "localhost", path: "/healthz", method, headers: { host: `127.0.0.1:${port}`, ...headers } },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      },
    );
    req.on("error", (e) => resolve(`ERR ${e.code}`));
    req.end();
  });
}

// What each client stack sends was measured on 2026-10-24: Node https, curl and Python send only Host;
// Node's fetch adds sec-fetch-mode: cors; Obsidian's requestUrl (Copilot) is Electron net with no initiator,
// so at most Sec-Fetch-Site: none.
const cases = [
  ["program (Node https, curl, Python)", (p) => request(p), 200],
  ["Electron requestUrl-like (Sec-Fetch-Site: none)", (p) => request(p, { headers: { "sec-fetch-site": "none", "sec-fetch-mode": "no-cors", "sec-fetch-dest": "empty" } }), 200],
  ["Node fetch", async (p) => (await fetch(`https://127.0.0.1:${p}/healthz`)).status, 200],
  ["browser cross-site", (p) => request(p, { headers: EVIL }), 403],
  ["browser preflight", (p) => request(p, { method: "OPTIONS", headers: EVIL }), 403],
  ["DNS-rebinding Host", (p) => request(p, { headers: { host: `evil.example:${p}` } }), 421],
];

let bad = 0;
for (const port of BRIDGES) {
  for (const [label, run, want] of cases) {
    let got;
    try {
      got = await run(port);
    } catch (e) {
      got = `ERR ${e.message}`;
    }
    const ok = got === want;
    if (!ok) bad += 1;
    console.log(`${ok ? "PASS" : "FAIL"}  :${port}  ${label.padEnd(48)} got ${got}, want ${want}`);
  }
}
console.log(bad ? `\n${bad} unexpected result(s) (ECONNREFUSED = Obsidian closed)` : "\nall as expected");
process.exit(bad ? 1 : 0);
