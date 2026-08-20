#!/usr/bin/env node
// Regression guard for the adapter's per-profile tool surfaces.
//
//   npm run test:profiles
//
// Asserts:
//   - "claude" profile lists EXACTLY its 7 canonical vault tools (no drift —
//     Claude Desktop's surface must never change as a side effect of raycast work).
//   - "raycast" profile lists EXACTLY 10 tools (7 vault + raycast_daily_open +
//     2 video tools proxied to the Command Center bridge on :8799).
//   - When the Command Center bridge is reachable, a dry_run video_pipeline_run
//     through the adapter returns a deeplink of the expected shape (no dispatch).
//     When it is not reachable (Obsidian closed), that check is SKIPPED loudly
//     and the vault assertions still gate the exit code.
//
// Plain node, no dependencies. Requires the same env discovery the adapter uses
// (bridge config file + mkcert CA); the :8798 daemon does NOT need to be up for
// the tools/list assertions — listing is local to the adapter.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import * as nodeHttps from "node:https";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ADAPTER = resolve(__dirname, "../index.mjs");

const EXPECTED_CLAUDE = [
  "obsidian_open_vault",
  "obsidian_create_note",
  "obsidian_append_note",
  "obsidian_read_note",
  "obsidian_search_notes",
  "obsidian_execute_command",
  "obsidian_health",
];
const EXPECTED_RAYCAST = [
  ...EXPECTED_CLAUDE,
  "raycast_daily_open",
  "video_pipeline_run",
  "video_pipeline_status",
];
const DEEPLINK_SHAPE =
  /^raycast:\/\/extensions\/marcjulian\/obsidian-bridge-fork\/videoTranscribeRunnerCommand\?arguments=/;
const COMMAND_CENTER_HEALTHZ = "https://127.0.0.1:8799/healthz";

function caPath() {
  return (
    process.env.NODE_EXTRA_CA_CERTS ||
    `${process.env.HOME}/Library/Application Support/mkcert/rootCA.pem`
  );
}

/** Drive one adapter instance over stdio: initialize -> tools/list [-> extra calls]. */
function runAdapter(profile, extraRequests = []) {
  return new Promise((resolvePromise, rejectPromise) => {
    const proc = spawn(process.execPath, [ADAPTER], {
      env: { ...process.env, OBSIDIAN_STDIO_PROFILE: profile },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const responses = new Map();
    let buffer = "";
    const wanted = new Set([1, 2, ...extraRequests.map((r) => r.id)]);
    const timer = setTimeout(() => {
      proc.kill();
      rejectPromise(new Error(`${profile}: timed out waiting for ids [${[...wanted].join(", ")}]`));
    }, 40_000);

    proc.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.id !== undefined && wanted.has(msg.id)) {
          responses.set(msg.id, msg);
          wanted.delete(msg.id);
          if (msg.id === 1) {
            send({ jsonrpc: "2.0", method: "notifications/initialized" });
            send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
          } else if (msg.id === 2) {
            for (const r of extraRequests) send(r);
          }
          if (wanted.size === 0) {
            clearTimeout(timer);
            proc.kill();
            resolvePromise(responses);
          }
        }
      }
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      rejectPromise(err);
    });

    function send(obj) {
      proc.stdin.write(JSON.stringify(obj) + "\n");
    }
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test-profiles", version: "0.0.1" },
      },
    });
  });
}

function toolNames(responses) {
  return (responses.get(2)?.result?.tools ?? []).map((t) => t.name).sort();
}

function commandCenterUp() {
  return new Promise((resolveUp) => {
    let ca;
    try {
      ca = readFileSync(caPath());
    } catch {
      return resolveUp(false);
    }
    const req = nodeHttps.get(
      COMMAND_CENTER_HEALTHZ,
      { agent: new nodeHttps.Agent({ ca }), timeout: 3000 },
      (res) => {
        res.resume();
        resolveUp(res.statusCode === 200);
      },
    );
    req.on("error", () => resolveUp(false));
    req.on("timeout", () => {
      req.destroy();
      resolveUp(false);
    });
  });
}

let failures = 0;
function check(label, fn) {
  try {
    fn();
    console.log(`PASS  ${label}`);
  } catch (err) {
    failures += 1;
    console.error(`FAIL  ${label}\n      ${err.message}`);
  }
}

// --- claude profile: exact 7-tool surface, no drift -------------------------
const claude = await runAdapter("claude");
check("claude profile lists exactly the 7 canonical vault tools", () => {
  assert.deepEqual(toolNames(claude), [...EXPECTED_CLAUDE].sort());
});

// --- raycast profile: exact 10-tool surface ----------------------------------
const ccUp = await commandCenterUp();
// Inert placeholder id on an allowlisted host — the deeplink-shape check does
// not care about URL contents, and nothing is dispatched (dry_run).
const FIXTURE_URL = "https://www.youtube.com/watch?v=test-fixture-0000";
// Input-validation rejects happen inside the adapter BEFORE any :8799 call,
// so these three assertions run regardless of whether the bridge is up.
const rejectRequests = [
  {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "video_pipeline_run",
      arguments: { videoUrl: "http://youtube.com/watch?v=test-fixture-0000", dry_run: true },
    },
  },
  {
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
      name: "video_pipeline_run",
      arguments: { videoUrl: "https://evil.example.com/video", dry_run: true },
    },
  },
  {
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: {
      name: "obsidian_read_note",
      arguments: { path: "x".repeat(2 * 1024 * 1024) },
    },
  },
];
const extra = ccUp
  ? [
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "video_pipeline_run",
          arguments: { videoUrl: FIXTURE_URL, dry_run: true },
        },
      },
      ...rejectRequests,
    ]
  : rejectRequests;
const raycast = await runAdapter("raycast", extra);
check("raycast profile lists exactly the 10 aggregated tools", () => {
  assert.deepEqual(toolNames(raycast), [...EXPECTED_RAYCAST].sort());
});

if (ccUp) {
  check("dry_run video_pipeline_run returns a well-formed Raycast deeplink", () => {
    const res = raycast.get(3)?.result;
    assert.ok(res, "no result for tools/call id 3");
    assert.notEqual(res.isError, true, `tool returned isError: ${JSON.stringify(res)}`);
    const payload = JSON.parse(res.content?.[0]?.text ?? "{}");
    assert.equal(payload.dryRun, true, "expected dryRun:true");
    assert.equal(payload.dispatched, false, "dry run must not dispatch");
    assert.match(payload.deeplink ?? "", DEEPLINK_SHAPE);
    console.log(`      deeplink: ${payload.deeplink}`);
  });
} else {
  console.log(
    "SKIP  dry_run deeplink check — Command Center bridge (:8799) unreachable (is Obsidian open?)",
  );
}

// --- input-validation guardrails (adapter-local, no bridge required) ---------
function assertReject(id, label, phrase) {
  check(label, () => {
    const res = raycast.get(id)?.result;
    assert.ok(res, `no result for tools/call id ${id}`);
    assert.equal(res.isError, true, `expected isError:true, got: ${JSON.stringify(res).slice(0, 200)}`);
    const text = res.content?.[0]?.text ?? "";
    assert.ok(
      text.includes(phrase),
      `expected message containing ${JSON.stringify(phrase)}, got: ${text.slice(0, 200)}`,
    );
  });
}
assertReject(4, "http:// video URL rejected with scheme error", "URL scheme must be https");
assertReject(5, "non-allowlisted host rejected with hostname error", "hostname not in allowlist: evil.example.com");
assertReject(6, "2 MB argument payload rejected with size error", "arguments exceed 1 MB limit");

process.exit(failures === 0 ? 0 : 1);
