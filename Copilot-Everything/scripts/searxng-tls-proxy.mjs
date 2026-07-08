#!/usr/bin/env node
/**
 * searxng-tls-proxy.mjs
 *
 * Defense-in-depth HTTPS-terminating reverse proxy in front of the private
 * SearXNG metasearch instance's plain-HTTP loopback listener.
 *
 * Why this exists
 * ---------------
 * SearXNG (launchd `com.trevorrobey.searxng`, werkzeug dev server via
 * `python -m searx.webapp`) listens on `http://127.0.0.1:8890/*` over plain
 * HTTP. SearXNG's built-in webserver exposes no TLS configuration knob in
 * settings.yml, and running it behind uwsgi solely for TLS would diverge from
 * the stack's Docker-free single-process posture.
 *
 * On 2026-07-06 the operator opted out of the "SearXNG :8890 plaintext
 * loopback is acceptable" carve-out for the same reasons that motivated the
 * Miyo wrap (2026-05-07), Qdrant wrap (2026-05-08), LM Studio wrap
 * (2026-05-11), and Ollama wrap (2026-05-11): defense-in-depth against
 * advancing localhost attack classes (DNS rebinding, browser-based localhost
 * probes, malicious npm postinstall scripts). This proxy fronts SearXNG's
 * :8890 with an HTTPS listener on :8891, using the existing mkcert pair, so
 * every monorepo consumer (searxng-search MCP connector and the
 * openclaw-bridge searxng-mcp engine adapter) speaks TLS to the local
 * metasearch service just like it does to every other in-house service.
 *
 * What this DOES NOT solve: SearXNG continues to listen on :8890 in plain-
 * text — werkzeug cannot terminate TLS here. A malicious local process can
 * still hit :8890 directly. This proxy hardens the *documented* architecture;
 * the next hardening step is a `pf` rule restricting inbound to :8890 to
 * specific UIDs only (same pending step as :8742/:6333/:1234/:11434).
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
const LISTEN_PORT = Number(process.env.SEARXNG_TLS_PROXY_PORT ?? 8891);
const UPSTREAM_HOST = process.env.SEARXNG_UPSTREAM_HOST ?? "127.0.0.1";
const UPSTREAM_PORT = Number(process.env.SEARXNG_UPSTREAM_PORT ?? 8890);

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
    `[searxng-tls-proxy] FATAL: failed to load mkcert pair at ${certPath} / ${keyPath}.\n` +
      `[searxng-tls-proxy] Cause: ${err.message}\n` +
      `[searxng-tls-proxy] Refusing to listen — plaintext fallback is forbidden by the\n` +
      `[searxng-tls-proxy] monorepo HTTPS-only invariant. Regenerate the mkcert pair with:\n` +
      `[searxng-tls-proxy]   mkcert -install && mkcert localhost 127.0.0.1\n` +
      `[searxng-tls-proxy] then move the output into ~/.local/share/mkcert/.`,
  );
  process.exit(1);
}

const server = https.createServer({ cert, key }, (clientReq, clientRes) => {
  const upstreamHeaders = { ...clientReq.headers };
  // Rewrite Host so SearXNG never sees a TLS-port host string in logs.
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
        error: "SEARXNG_UPSTREAM_UNREACHABLE",
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
    "searxng-tls-proxy constructed a non-HTTPS server; refusing to listen.",
  );
}

server.on("error", (err) => {
  console.error(`[searxng-tls-proxy] server error: ${err.message}`);
  process.exit(1);
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(
    `[searxng-tls-proxy] listening on https://${LISTEN_HOST}:${LISTEN_PORT} ` +
      `→ http://${UPSTREAM_HOST}:${UPSTREAM_PORT}`,
  );
});

const shutdown = (signal) => {
  console.log(`[searxng-tls-proxy] received ${signal}, closing`);
  server.close(() => process.exit(0));
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
