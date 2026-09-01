#!/Users/myhome/.nvm/versions/node/v22.13.1/bin/node
// ^ ABSOLUTE interpreter on purpose (2026-09-01). `#!/usr/bin/env node` resolved through the
// ACP-provided PATH to /opt/homebrew/bin/node, which a Homebrew upgrade left dyld-broken
// (merve 1.2.2_1 wants libsimdutf.34, simdutf 9.1.0 ships .35) — the proxy then died at
// spawn and opencode marked command-center/viz-studio "failed", silently stripping every
// agent-chat MCP tool. This nvm path is the stack's canonical node (same literal path as
// the sudo-gate/phone-gate/searxng servers in ~/.config/opencode/opencode.jsonc); if that
// node version is ever removed, update all of them together.
// openclaw-stdio-proxy
//
// Transparent stdio<->HTTP JSON-RPC proxy for the Command Center bridge (:8799).
//
// WHY THIS EXISTS: the bridge implements MCP JSON-RPC over HTTP and answers with
// `application/json`. opencode's remote-MCP client speaks the HTTP+SSE transport and rejects
// that with `Invalid content type, expected "text/event-stream"`. Rather than add an SSE
// surface to the bridge (or downgrade transport), this proxy exposes the bridge over stdio —
// the baseline MCP transport every client supports — and forwards frames verbatim.
//
// It is deliberately dumb: no tool catalog, no schema knowledge. Whatever tools the bridge
// serves (the OpenClaw pipeline tools plus the obsidian_* vault tools) pass straight through,
// so the proxy never drifts out of sync with the bridge.
//
// Config via env: OPENCLAW_BRIDGE_URL (default https://127.0.0.1:8799),
// OPENCLAW_BRIDGE_TOKEN (required), NODE_EXTRA_CA_CERTS (mkcert root, optional).

import { existsSync, readFileSync } from "node:fs";
import * as https from "node:https";
import { homedir } from "node:os";
import { createInterface } from "node:readline";

const BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL || "https://127.0.0.1:8799";
const BRIDGE_TOKEN = process.env.OPENCLAW_BRIDGE_TOKEN || "";
const REQUEST_TIMEOUT_MS = 8_000;

if (!BRIDGE_TOKEN) {
  process.stderr.write("openclaw-stdio-proxy: OPENCLAW_BRIDGE_TOKEN is required\n");
  process.exit(1);
}

// Trust the private CA the bridge is served with. Falls back to the system store when the
// mkcert root is absent, so a differently-provisioned host still works.
// os.homedir() rather than $HOME: it resolves via the passwd entry, so the mkcert root is
// still found when a spawning host passes a minimal environment without HOME.
const caPath =
  process.env.NODE_EXTRA_CA_CERTS || `${homedir()}/Library/Application Support/mkcert/rootCA.pem`;
const agent = new https.Agent(existsSync(caPath) ? { ca: readFileSync(caPath) } : {});

/** POST one JSON-RPC frame to the bridge and resolve its parsed response. */
function forward(frame) {
  const body = JSON.stringify(frame);
  const url = new URL(BRIDGE_URL);
  return new Promise((resolvePromise, rejectPromise) => {
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname === "/" ? "/" : url.pathname,
        method: "POST",
        agent,
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${BRIDGE_TOKEN}`,
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode !== 200) {
            // Tagged so the retry logic can tell "the bridge answered and said no" (never retry)
            // from "nothing was listening yet" (worth retrying).
            const httpError = new Error(`bridge HTTP ${res.statusCode}: ${text.slice(0, 200)}`);
            httpError.httpStatus = res.statusCode;
            rejectPromise(httpError);
            return;
          }
          try {
            resolvePromise(JSON.parse(text));
          } catch {
            rejectPromise(new Error(`bridge non-JSON response: ${text.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", rejectPromise);
    req.on("timeout", () => req.destroy(new Error("bridge request timed out")));
    req.write(body);
    req.end();
  });
}

const out = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`);

/**
 * Methods safe to retry: read-only and idempotent. `tools/call` is deliberately EXCLUDED — a
 * retried dispatch tool (e.g. video_pipeline_run) would fire its side effect twice.
 */
const RETRYABLE_METHODS = new Set(["tools/list"]);
const RETRY_DELAYS_MS = [250, 500, 1000, 2000, 4000];

/**
 * Forward a frame, retrying connection-level failures for idempotent methods only.
 *
 * Every bridge here is owned by an Obsidian plugin, so an agent chat opened while Obsidian is
 * still loading can reach this proxy before the plugin has bound its port. `initialize` is
 * answered locally for exactly that reason, but `tools/list` used to fail on the first
 * ECONNREFUSED — and because the client caches the tool list for the session's lifetime, the
 * server's tools then stayed missing for the WHOLE chat even though the bridge came up moments
 * later. Riding out the bind window here is what makes the tools reliably present.
 *
 * A bridge that answers with an HTTP status (401, 500, …) is not retried: it is up and has
 * given a real answer, so repeating the call would only delay surfacing the error.
 */
async function forwardWithRetry(frame) {
  if (!RETRYABLE_METHODS.has(frame.method)) {
    return forward(frame);
  }
  let lastError;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await forward(frame);
    } catch (err) {
      if (err.httpStatus !== undefined) throw err;
      lastError = err;
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined) throw lastError;
      process.stderr.write(
        `openclaw-stdio-proxy: ${frame.method} failed (${err.message}); retrying in ${delay}ms\n`
      );
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
    }
  }
}

/**
 * Answer `initialize` locally instead of forwarding it.
 *
 * The bridge lives inside the Obsidian plugin, so during agent preload it is often not listening
 * yet. Forwarding the handshake made the client block on a connect timeout, which stalled ACP
 * session creation and left the agent UI stuck on "Loading agent models...". The handshake carries
 * no bridge-specific data, so answering it here makes spawn instant and decouples MCP readiness
 * from bridge readiness; tools are fetched later by `tools/list`, once the bridge is up.
 */
function localInitializeResult(frame) {
  const requested = frame?.params?.protocolVersion;
  return {
    jsonrpc: "2.0",
    id: frame.id,
    result: {
      protocolVersion: typeof requested === "string" ? requested : "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "openclaw-stdio-proxy", version: "1.0.0" },
    },
  };
}

createInterface({ input: process.stdin }).on("line", async (line) => {
  const text = line.trim();
  if (!text) return;

  let frame;
  try {
    frame = JSON.parse(text);
  } catch {
    out({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }

  if (frame.method === "initialize") {
    out(localInitializeResult(frame));
    return;
  }

  try {
    const response = await forwardWithRetry(frame);
    // Notifications carry no id and expect no reply; the bridge may still answer, so drop it.
    if (frame.id !== undefined && frame.id !== null) out(response);
  } catch (err) {
    if (frame.id !== undefined && frame.id !== null) {
      out({
        jsonrpc: "2.0",
        id: frame.id,
        error: { code: -32603, message: `proxy: ${err.message}` },
      });
    } else {
      process.stderr.write(`openclaw-stdio-proxy: ${err.message}\n`);
    }
  }
});

process.stderr.write(`openclaw-stdio-proxy: forwarding to ${BRIDGE_URL}\n`);
