#!/usr/bin/env node
/**
 * qdrant-tls-proxy.mjs
 *
 * Defense-in-depth HTTPS-terminating reverse proxy in front of Miyo's
 * bundled Qdrant vector DB on plain-HTTP loopback.
 *
 * Why this exists
 * ---------------
 * Miyo (`/Applications/Miyo.app`) spawns Qdrant as a child process bound to
 * `127.0.0.1:6333` over plain HTTP. Qdrant's own TLS support requires a
 * config file Miyo's bundled launcher does not expose, and modifying the
 * code-signed Miyo bundle is off the table for the same reasons documented
 * in `miyo-tls-proxy.mjs`.
 *
 * On 2026-05-08 the operator opted out of the previous "Qdrant :6333 plain
 * HTTP loopback is acceptable" carve-out for the same reasons that motivated
 * the Miyo wrap on 2026-05-07: defense-in-depth against advancing localhost
 * attack classes (DNS rebinding, browser-based localhost-probing exploits,
 * malicious npm postinstall scripts). This proxy fronts Qdrant's :6333 with
 * an HTTPS listener on :6433, using the existing mkcert pair, so every
 * monorepo consumer (`trevorobeyinc-research-memory-mcp`, `vault-zettelkasten`
 * Obsidian plugin) speaks TLS to Qdrant.
 *
 * What this DOES NOT solve: Qdrant continues to listen on :6333 in plaintext
 * — we cannot make it stop. A malicious local process can still hit :6333
 * directly. This proxy hardens the *documented* architecture; the next
 * hardening step is a `pf` rule restricting inbound to :6333 to specific
 * UIDs only.
 *
 * Predecessor
 * -----------
 * Replaces the deleted `Claude/qdrant-tls-proxy/` subproject (had its own
 * package.json + PM2 ownership). The single-file launchd pattern matches
 * `miyo-tls-proxy.mjs` and aligns with the rest of the monorepo.
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
const LISTEN_PORT = Number(process.env.QDRANT_TLS_PROXY_PORT ?? 6433);
const UPSTREAM_HOST = process.env.QDRANT_UPSTREAM_HOST ?? "127.0.0.1";
const UPSTREAM_PORT = Number(process.env.QDRANT_UPSTREAM_PORT ?? 6333);

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
    `[qdrant-tls-proxy] FATAL: failed to load mkcert pair at ${certPath} / ${keyPath}.\n` +
      `[qdrant-tls-proxy] Cause: ${err.message}\n` +
      `[qdrant-tls-proxy] Refusing to listen — plaintext fallback is forbidden by the\n` +
      `[qdrant-tls-proxy] monorepo HTTPS-only invariant. Regenerate the mkcert pair with:\n` +
      `[qdrant-tls-proxy]   mkcert -install && mkcert localhost 127.0.0.1\n` +
      `[qdrant-tls-proxy] then move the output into ~/.local/share/mkcert/.`,
  );
  process.exit(1);
}

const server = https.createServer({ cert, key }, (clientReq, clientRes) => {
  const upstreamHeaders = { ...clientReq.headers };
  // Rewrite Host so Qdrant never sees a TLS-port host string in logs.
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
        error: "QDRANT_UPSTREAM_UNREACHABLE",
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
    "qdrant-tls-proxy constructed a non-HTTPS server; refusing to listen.",
  );
}

server.on("error", (err) => {
  console.error(`[qdrant-tls-proxy] server error: ${err.message}`);
  process.exit(1);
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(
    `[qdrant-tls-proxy] listening on https://${LISTEN_HOST}:${LISTEN_PORT} ` +
      `→ http://${UPSTREAM_HOST}:${UPSTREAM_PORT}`,
  );
});

const shutdown = (signal) => {
  console.log(`[qdrant-tls-proxy] received ${signal}, closing`);
  server.close(() => process.exit(0));
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
