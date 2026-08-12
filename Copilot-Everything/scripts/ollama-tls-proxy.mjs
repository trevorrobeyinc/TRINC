#!/usr/bin/env node
/**
 * ollama-tls-proxy.mjs
 *
 * Defense-in-depth HTTPS-terminating reverse proxy in front of Ollama's
 * plain-HTTP loopback inference server.
 *
 * Why this exists
 * ---------------
 * Ollama (`/Applications/Ollama.app` or `brew services ollama`) listens on
 * `http://127.0.0.1:11434/*` over plain HTTP. The Ollama daemon does not
 * expose a TLS configuration knob, and modifying the code-signed app bundle
 * is off the table.
 *
 * On 2026-05-11 the operator opted out of the previous "Ollama :11434
 * plaintext loopback is acceptable" carve-out for the same reasons that
 * motivated the Miyo wrap (2026-05-07), Qdrant wrap (2026-05-08), and
 * LM Studio wrap (2026-05-11): defense-in-depth against advancing localhost
 * attack classes (DNS rebinding, browser-based localhost probes, malicious
 * npm postinstall scripts). This proxy fronts Ollama's :11434 with an HTTPS
 * listener on :11435, using the existing mkcert pair, so every monorepo
 * consumer (vault-zettelkasten Obsidian plugin) speaks TLS to the local LLM
 * just like it does to every other in-house service.
 *
 * What this DOES NOT solve: Ollama continues to listen on :11434 in plain-
 * text — we cannot make it stop. A malicious local process can still hit
 * :11434 directly. This proxy hardens the *documented* architecture; the
 * next hardening step is a `pf` rule restricting inbound to :11434 to
 * specific UIDs only.
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
const LISTEN_PORT = Number(process.env.OLLAMA_TLS_PROXY_PORT ?? 11435);
const UPSTREAM_HOST = process.env.OLLAMA_UPSTREAM_HOST ?? "127.0.0.1";
const UPSTREAM_PORT = Number(process.env.OLLAMA_UPSTREAM_PORT ?? 11434);

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
    `[ollama-tls-proxy] FATAL: failed to load mkcert pair at ${certPath} / ${keyPath}.\n` +
      `[ollama-tls-proxy] Cause: ${err.message}\n` +
      `[ollama-tls-proxy] Refusing to listen — plaintext fallback is forbidden by the\n` +
      `[ollama-tls-proxy] monorepo HTTPS-only invariant. Regenerate the mkcert pair with:\n` +
      `[ollama-tls-proxy]   mkcert -install && mkcert localhost 127.0.0.1\n` +
      `[ollama-tls-proxy] then move the output into ~/.local/share/mkcert/.`,
  );
  process.exit(1);
}

// CORS handling (added 2026-08-12).
//
// Obsidian's Copilot plugin has two request paths. Its own Plus adapter calls
// `safeFetch`, which wraps Obsidian's `requestUrl` and therefore bypasses CORS
// entirely. BYOK providers (BaseModelAdapter) instead use the renderer's native
// request API, so the browser enforces CORS against Ollama. Ollama answers an
// `Origin: null` preflight with 403 and advertises a fixed allow-headers list,
// which is enough to make the renderer drop the real POST — observed as 49
// preflights with zero POSTs reaching Ollama.
//
// We terminate the preflight here and echo back exactly what was requested.
// Scoped to the Obsidian app origins ONLY — deliberately not "*", so an
// ordinary web page cannot reach the local model via DNS rebinding.
const ALLOWED_ORIGINS = new Set(["app://obsidian.md", "null", "capacitor://localhost"]);

function corsHeadersFor(req) {
  const origin = req.headers["origin"];
  if (!origin) return null;
  if (!ALLOWED_ORIGINS.has(origin)) return null;
  const requested = req.headers["access-control-request-headers"];
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS",
    "Access-Control-Allow-Headers": requested ? requested : "*",
    "Access-Control-Max-Age": "600",
    Vary: "Origin, Access-Control-Request-Method, Access-Control-Request-Headers",
  };
}

const server = https.createServer({ cert, key }, (clientReq, clientRes) => {
  const cors = corsHeadersFor(clientReq);

  // Set OLLAMA_TLS_PROXY_DEBUG=1 to log what the renderer actually sends.
  if (process.env.OLLAMA_TLS_PROXY_DEBUG === "1") {
    const org = clientReq.headers["origin"] ? clientReq.headers["origin"] : "-";
    const acrh = clientReq.headers["access-control-request-headers"] ? clientReq.headers["access-control-request-headers"] : "-";
    const verdict = cors ? "allow" : "deny";
    console.log(`[ollama-tls-proxy] ${clientReq.method} ${clientReq.url} origin=${org} acrh=${acrh} cors=${verdict}`);
  }

  // Answer the preflight ourselves so the renderer never sees Ollama's 403.
  if (clientReq.method === "OPTIONS" && cors) {
    clientRes.writeHead(204, { ...cors, "Content-Length": "0" });
    clientRes.end();
    return;
  }

  const upstreamHeaders = { ...clientReq.headers };
  // Rewrite Host so Ollama never sees a TLS-port host string in logs.
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
      // The real POST is subject to the same origin check as the preflight, so
      // CORS must be present on the actual response too.
      //
      // Ollama already sets its own access-control-* headers. Node lowercases
      // incoming header names, so simply spreading ours on top APPENDS rather
      // than replaces, and the response goes out with TWO
      // Access-Control-Allow-Origin values. The CORS spec allows exactly one —
      // a browser rejects the response outright, which presents as a client
      // "connection error" even though the server returned 200. Strip theirs
      // first so exactly one set survives.
      const outHeaders = {};
      for (const [name, value] of Object.entries(upstreamRes.headers)) {
        const lower = name.toLowerCase();
        if (cors && (lower.startsWith("access-control-") || lower === "vary")) continue;
        outHeaders[name] = value;
      }
      clientRes.writeHead(upstreamRes.statusCode ?? 502, {
        ...outHeaders,
        ...(cors ? cors : {}),
      });
      upstreamRes.pipe(clientRes);
    },
  );

  upstreamReq.on("error", (err) => {
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { "Content-Type": "application/json" });
    }
    clientRes.end(
      JSON.stringify({
        error: "OLLAMA_UPSTREAM_UNREACHABLE",
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
    "ollama-tls-proxy constructed a non-HTTPS server; refusing to listen.",
  );
}

server.on("error", (err) => {
  console.error(`[ollama-tls-proxy] server error: ${err.message}`);
  process.exit(1);
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(
    `[ollama-tls-proxy] listening on https://${LISTEN_HOST}:${LISTEN_PORT} ` +
      `→ http://${UPSTREAM_HOST}:${UPSTREAM_PORT}`,
  );
});

const shutdown = (signal) => {
  console.log(`[ollama-tls-proxy] received ${signal}, closing`);
  server.close(() => process.exit(0));
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
