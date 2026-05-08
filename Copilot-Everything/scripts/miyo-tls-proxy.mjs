#!/usr/bin/env node
/**
 * miyo-tls-proxy.mjs
 *
 * Defense-in-depth HTTPS-terminating reverse proxy in front of the Miyo
 * desktop app's plain-HTTP loopback service.
 *
 * Why this exists
 * ---------------
 * Miyo (`/Applications/Miyo.app`) ships a Node.js server bundled inside a
 * code-signed app at `Contents/Resources/bin/service/server.js`. That server
 * calls `server.listen(port, "127.0.0.1")` over plain HTTP — there is no
 * config knob to flip it to TLS, and patching the bundled JS would break the
 * app's signature and get clobbered on every Miyo update.
 *
 * On 2026-05-07 the operator opted out of the previous "loopback HTTP is
 * acceptable" carve-out for Miyo, citing concerns about advancing localhost
 * attack classes (DNS rebinding, browser-based localhost-probing exploits,
 * malicious npm postinstall scripts). This proxy fronts Miyo's :8742 with
 * an HTTPS listener on :8743, using the existing mkcert pair, so every
 * monorepo consumer (Copilot plugin, MCP bridges, Command Center plugin)
 * can speak TLS to Miyo just like it does to every other in-house service.
 *
 * What this DOES NOT solve: Miyo continues to listen on :8742 in plaintext
 * — we cannot make it stop. A malicious local process can still hit :8742
 * directly. The proxy hardens the *documented* architecture; if the operator
 * wants stronger isolation, the right next step is a `pf` rule restricting
 * inbound to :8742 to this proxy's UID only.
 *
 * HTTPS-only invariant
 * --------------------
 * - Listener is `https.createServer` only. No env-gated plaintext fallback.
 * - On cert / key load failure: throw, log to stderr, and refuse to listen.
 *   That is the documented monorepo-wide policy in CLAUDE.md.
 * - Bound to 127.0.0.1, never 0.0.0.0.
 */

import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const LISTEN_HOST = "127.0.0.1";
const LISTEN_PORT = Number(process.env.MIYO_TLS_PROXY_PORT ?? 8743);
const UPSTREAM_HOST = process.env.MIYO_UPSTREAM_HOST ?? "127.0.0.1";
const UPSTREAM_PORT = Number(process.env.MIYO_UPSTREAM_PORT ?? 8742);

const certPath = process.env.MKCERT_LOCALHOST_CERT
  ?? join(homedir(), ".local/share/mkcert/localhost.pem");
const keyPath = process.env.MKCERT_LOCALHOST_KEY
  ?? join(homedir(), ".local/share/mkcert/localhost-key.pem");

let cert;
let key;
try {
  cert = fs.readFileSync(certPath);
  key = fs.readFileSync(keyPath);
} catch (err) {
  console.error(
    `[miyo-tls-proxy] FATAL: failed to load mkcert pair at ${certPath} / ${keyPath}.\n` +
      `[miyo-tls-proxy] Cause: ${err.message}\n` +
      `[miyo-tls-proxy] Refusing to listen — plaintext fallback is forbidden by the\n` +
      `[miyo-tls-proxy] monorepo HTTPS-only invariant. Regenerate the mkcert pair with:\n` +
      `[miyo-tls-proxy]   mkcert -install && mkcert localhost 127.0.0.1\n` +
      `[miyo-tls-proxy] then move the output into ~/.local/share/mkcert/.`,
  );
  process.exit(1);
}

const server = https.createServer({ cert, key }, (clientReq, clientRes) => {
  const upstreamHeaders = { ...clientReq.headers };
  // Rewrite Host so Miyo's server never sees a TLS-port host string in logs.
  upstreamHeaders.host = `${UPSTREAM_HOST}:${UPSTREAM_PORT}`;

  const upstreamReq = http.request(
    {
      hostname: UPSTREAM_HOST,
      port: UPSTREAM_PORT,
      method: clientReq.method,
      path: clientReq.url,
      headers: upstreamHeaders,
    },
    (upstreamRes) => {
      clientRes.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(clientRes);
    },
  );

  upstreamReq.on("error", (err) => {
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { "Content-Type": "application/json" });
    }
    clientRes.end(
      JSON.stringify({
        error: "MIYO_UPSTREAM_UNREACHABLE",
        detail: err.message,
        upstream: `http://${UPSTREAM_HOST}:${UPSTREAM_PORT}`,
      }),
    );
  });

  clientReq.on("error", () => upstreamReq.destroy());
  clientReq.pipe(upstreamReq);
});

if (!(server instanceof https.Server)) {
  // Belt-and-suspenders post-construction guard, mirrors httpTransport.ts.
  throw new Error(
    "miyo-tls-proxy constructed a non-HTTPS server; refusing to listen.",
  );
}

server.on("error", (err) => {
  console.error(`[miyo-tls-proxy] server error: ${err.message}`);
  process.exit(1);
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(
    `[miyo-tls-proxy] listening on https://${LISTEN_HOST}:${LISTEN_PORT} ` +
      `→ http://${UPSTREAM_HOST}:${UPSTREAM_PORT}`,
  );
});

const shutdown = (signal) => {
  console.log(`[miyo-tls-proxy] received ${signal}, closing`);
  server.close(() => process.exit(0));
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
