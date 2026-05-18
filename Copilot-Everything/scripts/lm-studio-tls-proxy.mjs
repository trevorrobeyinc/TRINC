#!/usr/bin/env node
/**
 * lm-studio-tls-proxy.mjs
 *
 * Defense-in-depth HTTPS-terminating reverse proxy in front of LM Studio's
 * plain-HTTP loopback OpenAI-compatible server.
 *
 * Why this exists
 * ---------------
 * LM Studio (`/Applications/LM Studio.app`) ships its OpenAI-compatible
 * inference endpoint at `http://127.0.0.1:1234/v1/*` over plain HTTP. The
 * desktop app does not expose a TLS configuration knob, and modifying the
 * code-signed app bundle is off the table.
 *
 * On 2026-05-11 the operator opted out of the previous "LM Studio :1234
 * plaintext loopback is acceptable" carve-out for the same reasons that
 * motivated the Miyo wrap (2026-05-07) and Qdrant wrap (2026-05-08):
 * defense-in-depth against advancing localhost attack classes (DNS rebinding,
 * browser-based localhost probes, malicious npm postinstall scripts). This
 * proxy fronts LM Studio's :1234 with an HTTPS listener on :1235, using the
 * existing mkcert pair, so every monorepo consumer (vault-zettelkasten Obsidian
 * plugin, trevor-robey-inc-agents fallback provider) speaks TLS to the local
 * LLM just like it does to every other in-house service.
 *
 * What this DOES NOT solve: LM Studio continues to listen on :1234 in plain-
 * text — we cannot make it stop. A malicious local process can still hit :1234
 * directly. This proxy hardens the *documented* architecture; the next
 * hardening step is a `pf` rule restricting inbound to :1234 to specific
 * UIDs only.
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
const LISTEN_PORT = Number(process.env.LM_STUDIO_TLS_PROXY_PORT ?? 1235);
const UPSTREAM_HOST = process.env.LM_STUDIO_UPSTREAM_HOST ?? "127.0.0.1";
const UPSTREAM_PORT = Number(process.env.LM_STUDIO_UPSTREAM_PORT ?? 1234);

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
    `[lm-studio-tls-proxy] FATAL: failed to load mkcert pair at ${certPath} / ${keyPath}.\n` +
      `[lm-studio-tls-proxy] Cause: ${err.message}\n` +
      `[lm-studio-tls-proxy] Refusing to listen — plaintext fallback is forbidden by the\n` +
      `[lm-studio-tls-proxy] monorepo HTTPS-only invariant. Regenerate the mkcert pair with:\n` +
      `[lm-studio-tls-proxy]   mkcert -install && mkcert localhost 127.0.0.1\n` +
      `[lm-studio-tls-proxy] then move the output into ~/.local/share/mkcert/.`,
  );
  process.exit(1);
}

const server = https.createServer({ cert, key }, (clientReq, clientRes) => {
  const upstreamHeaders = { ...clientReq.headers };
  // Rewrite Host so LM Studio never sees a TLS-port host string in logs.
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
        error: "LM_STUDIO_UPSTREAM_UNREACHABLE",
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
    "lm-studio-tls-proxy constructed a non-HTTPS server; refusing to listen.",
  );
}

server.on("error", (err) => {
  console.error(`[lm-studio-tls-proxy] server error: ${err.message}`);
  process.exit(1);
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(
    `[lm-studio-tls-proxy] listening on https://${LISTEN_HOST}:${LISTEN_PORT} ` +
      `→ http://${UPSTREAM_HOST}:${UPSTREAM_PORT}`,
  );
});

const shutdown = (signal) => {
  console.log(`[lm-studio-tls-proxy] received ${signal}, closing`);
  server.close(() => process.exit(0));
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
