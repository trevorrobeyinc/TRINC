#!/usr/bin/env node
// Regression guard for the adapter's tool surface and its socket transport.
//
//   npm run test:profiles
//
// Asserts:
//   - The "openclaw" profile (Claude's one door since 2026-10-23, and the only profile since
//     2026-11-21) lists EXACTLY its 15 Command Center tools plus the 12 allowlisted Viz Studio tools,
//     never offers a Viz property that writes outside Visualizations/, and refuses one on a call.
//   - The retired "raycast" and "claude" profiles, a missing profile, and the retired upstream URL
//     overrides refuse to start.
//   - The video pipeline's tools, the raycast profile's last ones, are unknown on Claude's door, and
//     the adapter source holds no client for the :8798 vault bridge, no https or tls import, no CA and
//     no TCP endpoint.
//   - Over the bridges' Unix sockets (bridges-uds, 2026-11-24): a missing token, run directory or socket
//     and a stale socket all give obsidian_not_running; a run directory others can open is refused
//     before anything is sent; a fake bridge (test/fake-bridge.mjs) sees exactly the requests the
//     adapter promises (POST /mcp with that bridge's Bearer token and no X-MCP-* header, GET /healthz
//     without a token); and a hung Viz Studio does not stall tools/list.
//   - When a bridge is not reachable (Obsidian closed), or with TEST_PROFILES_SKIP_LIVE=1, its live
//     checks are SKIPPED loudly, and the remaining assertions still gate the exit code.
//
// Plain node, no dependencies. Every offline case runs the adapter with HOME set to its own temporary
// /tmp/uds-* directory (removed at exit) that holds test tokens, so it never reads the real tokens or
// reaches a real bridge. The live checks use the real HOME and are meant for after a deploy.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as http from "node:http";
import * as net from "node:net";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ADAPTER = resolve(__dirname, "../index.mjs");
const FAKE_BRIDGE = resolve(__dirname, "../test/fake-bridge.mjs");

const CC_SOCKET = "command-center.sock";
const VIZ_SOCKET = "viz-studio.sock";
const runDirOf = (home) => join(home, ".local", "state", "trinc", "run");

// The retired URL overrides now stop the adapter at startup, so keep them out of every run except the
// checks that test exactly that.
const { OBSIDIAN_STDIO_COMMAND_CENTER_URL: _ccUrl, OBSIDIAN_STDIO_VIZ_URL: _vizUrl, ...BASE_ENV } = process.env;

// Temporary homes and fake bridges, all removed or stopped at exit.
const tempHomes = [];
const fakeBridges = new Set();
process.on("exit", () => {
  for (const proc of fakeBridges) proc.kill("SIGKILL");
  for (const home of tempHomes) rmSync(home, { recursive: true, force: true });
});

/**
 * A fresh /tmp/uds-* home: short, so its socket paths fit macOS's 103 bytes (never os.tmpdir()). With
 * tokens it holds a test token per bridge, 0600 like the plugins write theirs. runDirMode creates the
 * run directory chain (0700) and then sets that mode on the run directory itself.
 */
function makeHome({ tokens = true, runDirMode = null } = {}) {
  const home = mkdtempSync("/tmp/uds-");
  tempHomes.push(home);
  const made = { home, ccToken: null, vizToken: null };
  if (tokens) {
    made.ccToken = `test-cc-${randomBytes(8).toString("hex")}`;
    made.vizToken = `test-viz-${randomBytes(8).toString("hex")}`;
    for (const [dir, token] of [["openclaw-command-center", made.ccToken], ["trinc-viz-studio", made.vizToken]]) {
      mkdirSync(join(home, ".config", dir), { recursive: true, mode: 0o700 });
      writeFileSync(join(home, ".config", dir, "bridge-token"), `${token}\n`, { mode: 0o600 });
    }
  }
  if (runDirMode !== null) {
    mkdirSync(runDirOf(home), { recursive: true, mode: 0o700 });
    chmodSync(runDirOf(home), runDirMode);
  }
  return made;
}

/**
 * Start test/fake-bridge.mjs on a temporary home; resolves once both sockets are served. requests
 * collects the bridge's request lines. stop() ends it (SIGTERM removes the sockets, SIGKILL leaves them
 * behind as stale sockets) and resolves after its last line was read.
 */
function startFakeBridge(home, mode = "serve") {
  return new Promise((resolveStart, rejectStart) => {
    const proc = spawn(process.execPath, [FAKE_BRIDGE], {
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: home, FAKE_BRIDGE_MODE: mode },
      stdio: ["pipe", "pipe", "pipe"],
    });
    fakeBridges.add(proc);
    const requests = [];
    let buffer = "";
    let stderr = "";
    const closed = new Promise((resolveClosed) => {
      proc.on("close", () => {
        fakeBridges.delete(proc);
        resolveClosed();
      });
    });
    const stop = (signal = "SIGTERM") => {
      if (proc.exitCode === null && proc.signalCode === null) proc.kill(signal);
      return closed;
    };
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      rejectStart(new Error(`fake bridge did not start: ${stderr.slice(0, 300)}`));
    }, 10_000);
    proc.stderr.on("data", (chunk) => (stderr += chunk.toString("utf8")));
    proc.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (event.event === "ready") {
          clearTimeout(timer);
          resolveStart({ requests, stop });
        } else if (event.event === "request") {
          requests.push(event);
        }
      }
    });
    proc.on("exit", (code, signal) => {
      clearTimeout(timer);
      // Only matters before "ready"; once started, the promise is settled and this is a no-op.
      rejectStart(new Error(`fake bridge exited (${signal ?? code}) before it was ready: ${stderr.slice(0, 300)}`));
    });
  });
}

/**
 * Drive one adapter instance over stdio: initialize -> tools/list [-> extra calls]. Resolves, once the
 * adapter has exited, to a Map of the responses by id with the adapter's stderr as its .stderr.
 */
function runAdapter(profile, extraRequests = [], envExtra = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const proc = spawn(process.execPath, [ADAPTER], {
      env: { ...BASE_ENV, OBSIDIAN_STDIO_PROFILE: profile, ...envExtra },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const responses = new Map();
    let buffer = "";
    let stderr = "";
    let answered = false;
    const wanted = new Set([1, 2, ...extraRequests.map((r) => r.id)]);
    const timer = setTimeout(() => {
      proc.kill();
      rejectPromise(new Error(`${profile}: timed out waiting for ids [${[...wanted].join(", ")}]`));
    }, 40_000);

    proc.stdin.on("error", () => {}); // an adapter that exits early closes the pipe; "close" reports it
    proc.stderr.on("data", (chunk) => (stderr += chunk.toString("utf8")));
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
            answered = true;
            proc.kill();
          }
        }
      }
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      rejectPromise(err);
    });
    // "close" comes after the last stderr chunk was read, so a check can assert on the stderr lines.
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (!answered) {
        rejectPromise(new Error(`${profile}: adapter exited (${code}) before answering: ${stderr.slice(-300)}`));
        return;
      }
      responses.stderr = stderr;
      resolvePromise(responses);
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

/** GET /healthz on a bridge socket in the real HOME (live checks only). Pinned to the socket; no token is sent. */
function bridgeUp(socketName) {
  return new Promise((resolveUp) => {
    const socketPath = join(runDirOf(homedir()), socketName);
    const req = http.request({
      socketPath,
      createConnection: () => net.connect({ path: socketPath }),
      method: "GET",
      path: "/healthz",
    });
    req.setTimeout(3000); // this pin ignores the options Node hands it, so a `timeout` option alone would never arm
    req.on("response", (res) => {
      res.resume();
      resolveUp(res.statusCode === 200);
    });
    req.on("error", () => resolveUp(false));
    req.on("timeout", () => {
      req.destroy();
      resolveUp(false);
    });
    req.end();
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

// --- profile selection: one profile; "raycast" and "claude" are retired; there is no default ---
/** Start the adapter with an env, wait for it to exit (or time out), and return code + stderr. */
function runToExit(env, waitMs = 8000) {
  return new Promise((resolveExit) => {
    const proc = spawn(process.execPath, [ADAPTER], { env, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (c) => (stderr += c.toString("utf8")));
    const timer = setTimeout(() => {
      proc.kill();
      resolveExit({ code: "timeout", stderr });
    }, waitMs);
    proc.on("exit", (code) => {
      clearTimeout(timer);
      resolveExit({ code, stderr });
    });
  });
}
const { OBSIDIAN_STDIO_PROFILE: _unused, ...envWithoutProfile } = process.env;
for (const [label, env] of [
  ["the retired raycast profile refuses to start", { ...process.env, OBSIDIAN_STDIO_PROFILE: "raycast" }],
  ["the retired claude profile refuses to start", { ...process.env, OBSIDIAN_STDIO_PROFILE: "claude" }],
  ["a missing profile refuses to start (there is no default)", envWithoutProfile],
]) {
  const exit = await runToExit(env);
  check(label, () => {
    assert.notEqual(exit.code, 0, "adapter started anyway");
    assert.notEqual(exit.code, "timeout", "adapter hung instead of refusing");
    assert.match(exit.stderr, /must be "openclaw"/);
    assert.match(exit.stderr, /"raycast" profile was retired 2026-11-21/);
  });
}

// --- the upstream URL overrides went with TCP (bridges-uds, 2026-11-24): set, they stop the adapter ---
const overrideHome = makeHome();
for (const variable of ["OBSIDIAN_STDIO_COMMAND_CENTER_URL", "OBSIDIAN_STDIO_VIZ_URL"]) {
  const exit = await runToExit({
    ...BASE_ENV,
    HOME: overrideHome.home,
    OBSIDIAN_STDIO_PROFILE: "openclaw",
    [variable]: "https://127.0.0.1:9",
  });
  check(`the retired ${variable} override refuses to start`, () => {
    assert.notEqual(exit.code, 0, "adapter started anyway");
    assert.notEqual(exit.code, "timeout", "adapter hung instead of refusing");
    assert.match(exit.stderr, new RegExp(`${variable} is no longer supported`));
  });
}

// TEST_PROFILES_SKIP_LIVE=1 skips every check that talks to a running bridge. Use it in a checkout whose
// Command Center source is newer than the build Obsidian runs, such as a worktree before its deploy.
const SKIP_LIVE = process.env.TEST_PROFILES_SKIP_LIVE === "1";
if (SKIP_LIVE) console.log("SKIP  every live check (TEST_PROFILES_SKIP_LIVE=1)");
const ccUp = !SKIP_LIVE && (await bridgeUp(CC_SOCKET));
const vizUp = !SKIP_LIVE && (await bridgeUp(VIZ_SOCKET));

// --- openclaw profile: Claude Code's dispatch lane (added 2026-10-07) --------
//
// Safety rule for this section: it NEVER sends a non-dry-run obsidian_openclaw_run_workflow, and it
// only sends a dry_run one to a LIVE Command Center after a read-only version probe shows the daemon
// knows the parameter (a daemon that predates dry_run would ignore it and try to start a real run).
// The Command Center tools, mirrored by hand in the adapter (two read-only vault tools added 2026-10-23, D5).
const EXPECTED_OPENCLAW_CC = [
  "obsidian_health",
  "obsidian_search_notes",
  "obsidian_read_note",
  "obsidian_openclaw_templates",
  "obsidian_openclaw_run_workflow",
  "obsidian_openclaw_status",
  "obsidian_openclaw_results",
  "obsidian_openclaw_cancel",
  "obsidian_openclaw_history",
  "obsidian_openclaw_artifacts",
  "obsidian_openclaw_engine_health",
  "obsidian_openclaw_delivery_evidence",
  "obsidian_openclaw_citation_integrity",
  "obsidian_openclaw_publish_vault",
  "obsidian_openclaw_research_memory_search",
];
// The Viz Studio allowlist (2026-10-23, D4 + D5); schemas come live from the daemon.
const EXPECTED_VIZ = [
  "viz_health",
  "viz_mermaid",
  "viz_chart",
  "viz_canvas",
  "viz_graph_snapshot",
  "viz_guided",
  "viz_perceptual_map",
  "viz_diagram",
  "viz_stat_tiles",
  "viz_mockup",
  "viz_interactive",
  "viz_render_svg",
];
const EXPECTED_OPENCLAW = [...EXPECTED_OPENCLAW_CC, ...EXPECTED_VIZ];
// Viz properties that write outside Visualizations/: never advertised and always refused on this door.
const VIZ_BLOCKED = ["folder", "targetNote", "targetCanvas", "useActiveTab", "useActiveNote", "overwrite"];
// Everything the Command Center daemon (or the vault bridge) offers that this lane must NOT surface.
const FORBIDDEN_ON_OPENCLAW = [
  "obsidian_execute_command",
  "obsidian_create_note",
  "obsidian_append_note",
  "obsidian_open_vault",
  "obsidian_dev_console_eval",
  "obsidian_dev_console_logs",
  "obsidian_dev_console_errors",
  "research_publish",
  "miyo_search_context",
  "obsidian_openclaw_research_task",
  "obsidian_openclaw_research_tasks_list",
  "obsidian_openclaw_research_output",
  "obsidian_openclaw_feed_stats",
  "video_pipeline_run",
  "video_pipeline_status",
  "raycast_daily_open",
  "zk_serendipity",
  "zk_cross_domain",
  "zk_echo_chamber",
  "zk_semantic_linker",
  "zk_orphan_rescue",
  "zk_vault_health",
  "zk_full_pipeline",
];

const callReq = (id, name, args) => ({
  jsonrpc: "2.0",
  id,
  method: "tools/call",
  params: { name, arguments: args },
});
const resultText = (responses, id) => responses.get(id)?.result?.content?.[0]?.text ?? "";
const resultJson = (responses, id) => {
  try {
    return JSON.parse(resultText(responses, id));
  } catch {
    return null;
  }
};

// (1) Adapter-local rejects and a dead upstream. Nothing here can reach a bridge: the rejects fail before
// any call, and HOME is a temporary directory with test tokens but no run directory, so every bridge
// call stops at the client block's check with ENOENT, before anything connects.
const noSocketHome = makeHome();
const DEAD_UPSTREAM = { HOME: noSocketHome.home };
const VALID_RUN = { template: "general-research-pack", inputs: { topic: "fixture" } };
const openclawLocal = await runAdapter(
  "openclaw",
  [
    callReq(10, "obsidian_openclaw_run_workflow", { ...VALID_RUN, provider: "mock" }),
    callReq(11, "obsidian_openclaw_run_workflow", { template: "../../etc/passwd", inputs: { topic: "x" } }),
    callReq(12, "obsidian_openclaw_run_workflow", { template: "t", inputs: { topic: 42 } }),
    callReq(13, "obsidian_openclaw_run_workflow", { template: "t", inputs: { topic: "   " } }),
    callReq(14, "obsidian_openclaw_publish_vault", { workflow_id: "wf-1", force: true }),
    callReq(15, "obsidian_openclaw_publish_vault", { all: true }),
    callReq(16, "obsidian_openclaw_publish_vault", {}),
    callReq(17, "obsidian_execute_command", { id: "app:reload" }),
    callReq(18, "obsidian_openclaw_history", { limit: 500 }),
    callReq(19, "obsidian_openclaw_status", { extra: 1 }),
    callReq(20, "obsidian_openclaw_run_workflow", { ...VALID_RUN, dry_run: "yes" }),
    callReq(21, "obsidian_openclaw_research_memory_search", { query: "q".repeat(501) }),
    // Valid, dry-run, dead upstream: must degrade to a structured obsidian_not_running result.
    callReq(22, "obsidian_health", {}),
    callReq(23, "obsidian_openclaw_run_workflow", { ...VALID_RUN, dry_run: true }),
    callReq(24, "obsidian_openclaw_status", {}),
    // Read-only vault tools: path escapes and stray keys are refused before any call.
    callReq(25, "obsidian_read_note", { path: "../outside.md" }),
    callReq(26, "obsidian_read_note", { path: "/etc/hosts" }),
    callReq(27, "obsidian_read_note", { path: "Note.md", vaultRoot: "/" }),
    callReq(28, "obsidian_search_notes", { query: "x", limit: 500 }),
    callReq(29, "obsidian_create_note", { path: "x.md", content: "x" }),
    // Viz: every property that writes outside Visualizations/ is refused, and so is a path-like fileName.
    callReq(30, "viz_mermaid", { source: "flowchart TD\n A-->B", folder: "Daily" }),
    callReq(31, "viz_chart", { title: "t", targetNote: "Some Note" }),
    callReq(32, "viz_guided", { title: "t", useActiveTab: true }),
    callReq(33, "viz_canvas", { title: "t", targetCanvas: "Board.canvas", overwrite: true }),
    callReq(34, "viz_mermaid", { source: "flowchart TD\n A-->B", fileName: "../escape" }),
    callReq(35, "viz_health", {}),
    // The retired raycast door's tools stay unknown here, and the size cap covers every tool.
    callReq(36, "video_pipeline_run", { videoUrl: "/Users/fixture/clip.mp4", dry_run: true }),
    callReq(37, "obsidian_search_notes", { query: "x".repeat(2 * 1024 * 1024) }),
  ],
  DEAD_UPSTREAM,
);

check("openclaw profile lists exactly its 15 Command Center tools and the 12 Viz tools", () => {
  assert.deepEqual(toolNames(openclawLocal), [...EXPECTED_OPENCLAW].sort());
});
check("with Viz Studio down, every Viz tool is listed as a stub that names the Visualizations/ rule", () => {
  const viz = (openclawLocal.get(2)?.result?.tools ?? []).filter((t) => EXPECTED_VIZ.includes(t.name));
  assert.equal(viz.length, EXPECTED_VIZ.length);
  for (const t of viz) {
    assert.deepEqual(Object.keys(t.inputSchema.properties ?? {}), [], `${t.name} stub should have no properties`);
    assert.ok(t.description.includes("Visualizations/"), `${t.name} stub description lacks the rule`);
  }
});
check("openclaw profile exposes none of the 23 forbidden vault-write/exec/zk/video/task tools", () => {
  const listed = new Set(toolNames(openclawLocal));
  const leaked = FORBIDDEN_ON_OPENCLAW.filter((n) => listed.has(n));
  assert.deepEqual(leaked, []);
});
check("openclaw publish_vault schema does not even advertise force or all", () => {
  const tool = (openclawLocal.get(2)?.result?.tools ?? []).find((t) => t.name === "obsidian_openclaw_publish_vault");
  assert.ok(tool, "publish_vault missing");
  assert.deepEqual(Object.keys(tool.inputSchema.properties).sort(), ["dry_run", "workflow_id"]);
  assert.deepEqual(tool.inputSchema.required, ["workflow_id"]);
});
check("openclaw run_workflow schema requires template and inputs and offers dry_run", () => {
  const tool = (openclawLocal.get(2)?.result?.tools ?? []).find((t) => t.name === "obsidian_openclaw_run_workflow");
  assert.deepEqual(tool.inputSchema.required, ["template", "inputs"]);
  assert.ok("dry_run" in tool.inputSchema.properties);
});

function assertOpenclawReject(id, label, phrase) {
  check(label, () => {
    const res = openclawLocal.get(id)?.result;
    assert.ok(res, `no result for tools/call id ${id}`);
    assert.equal(res.isError, true, `expected isError:true, got: ${JSON.stringify(res).slice(0, 200)}`);
    const text = res.content?.[0]?.text ?? "";
    assert.ok(text.includes(phrase), `expected ${JSON.stringify(phrase)} in: ${text.slice(0, 240)}`);
  });
}
assertOpenclawReject(10, "run_workflow rejects an unknown key (provider) instead of ignoring it", "does not accept: provider");
assertOpenclawReject(11, "run_workflow rejects a path-traversal template id", "template must be a string matching");
assertOpenclawReject(12, "run_workflow rejects a non-string input value", "inputs.topic must be a non-empty string");
assertOpenclawReject(13, "run_workflow rejects a blank input value", "inputs.topic must be a non-empty string");
assertOpenclawReject(14, "publish_vault rejects force", "'force' is not exposed on this profile");
assertOpenclawReject(15, "publish_vault rejects all", "'all' is not exposed on this profile");
assertOpenclawReject(16, "publish_vault requires workflow_id", "workflow_id is required");
assertOpenclawReject(17, "an excluded tool (obsidian_execute_command) is Unknown on this profile", "Unknown tool: obsidian_execute_command");
assertOpenclawReject(18, "history rejects an out-of-range limit", "limit must be an integer from 1 to 50");
assertOpenclawReject(19, "a no-argument tool rejects stray arguments", "does not accept: extra");
assertOpenclawReject(20, "run_workflow rejects a non-boolean dry_run", "dry_run must be a boolean");
assertOpenclawReject(21, "research_memory_search rejects an over-long query", "query exceeds 500 characters");
assertOpenclawReject(25, "read_note rejects a '..' path", "must be vault-relative");
assertOpenclawReject(26, "read_note rejects an absolute path", "must be vault-relative");
assertOpenclawReject(27, "read_note rejects a stray vaultRoot key", "does not accept: vaultRoot");
assertOpenclawReject(28, "search_notes rejects an out-of-range limit", "limit must be an integer from 1 to 100");
assertOpenclawReject(29, "obsidian_create_note stays Unknown on Claude's door (read-only vault)", "Unknown tool: obsidian_create_note");
assertOpenclawReject(30, "viz refuses folder (no writing outside Visualizations/)", "folder not available on this door");
assertOpenclawReject(31, "viz refuses targetNote (no appending to an existing note)", "targetNote not available on this door");
assertOpenclawReject(32, "viz refuses useActiveTab (no writing into the open note or canvas)", "useActiveTab not available on this door");
assertOpenclawReject(33, "viz refuses targetCanvas and overwrite together", "targetCanvas, overwrite not available on this door");
assertOpenclawReject(34, "viz refuses a path-like fileName", "fileName must be a plain base name");
assertOpenclawReject(36, "video_pipeline_run is Unknown on Claude's door (the video pipeline is the Copilot agent's lane)", "Unknown tool: video_pipeline_run");
assertOpenclawReject(37, "a 2 MB argument payload is rejected with the size error", "arguments exceed 1 MB limit");
check("dead upstream: viz_health degrades to obsidian_not_running and names the Viz Studio bridge", () => {
  const body = resultJson(openclawLocal, 35);
  assert.equal(body?.error, "obsidian_not_running", `got: ${resultText(openclawLocal, 35).slice(0, 240)}`);
  assert.ok(body?.message?.includes("Viz Studio bridge"), "message should name the Viz Studio bridge");
  assert.ok(/open Obsidian.*viz_health/i.test(body?.action ?? ""), "action should send the caller to viz_health");
});

for (const [id, label] of [
  [22, "dead upstream: obsidian_health degrades to obsidian_not_running"],
  [23, "dead upstream: a dry_run run_workflow degrades to obsidian_not_running (no run started)"],
  [24, "dead upstream: status degrades to obsidian_not_running"],
]) {
  check(label, () => {
    const res = openclawLocal.get(id)?.result;
    assert.equal(res?.isError, true);
    const body = resultJson(openclawLocal, id);
    assert.equal(body?.error, "obsidian_not_running", `got: ${resultText(openclawLocal, id).slice(0, 240)}`);
    assert.equal(body?.success, false);
    assert.ok(/open Obsidian/i.test(body?.action ?? ""), "action should tell the caller what to do");
  });
}
check("dead upstream: obsidian_not_running names the bridge's socket, never a port", () => {
  for (const [id, socketName] of [[22, CC_SOCKET], [23, CC_SOCKET], [35, VIZ_SOCKET]]) {
    const message = resultJson(openclawLocal, id)?.message ?? "";
    assert.ok(message.includes(`(${socketName})`), `id ${id}: ${message.slice(0, 200)}`);
    assert.ok(!/:\d{2,5}\b/.test(message), `id ${id} names a port: ${message.slice(0, 200)}`);
  }
});
check("each call writes one stderr line labelled upstream=command-center or upstream=viz-studio", () => {
  assert.match(openclawLocal.stderr, /call tool=obsidian_health upstream=command-center status=error latency_ms=\d+/);
  assert.match(openclawLocal.stderr, /call tool=viz_health upstream=viz-studio status=error latency_ms=\d+/);
  assert.doesNotMatch(openclawLocal.stderr, /upstream=\d/);
});

// (1b) The socket transport (bridges-uds, 2026-11-24), offline, each case on its own temporary HOME. A
// missing token, a run directory without a socket and a stale socket (a SIGKILLed bridge leaves its
// socket file behind) all mean "Obsidian is not running"; a run directory that grants group or others
// anything is refused before anything is sent.
const noTokenHome = makeHome({ tokens: false });
const noToken = await runAdapter("openclaw", [callReq(70, "obsidian_health", {}), callReq(71, "viz_health", {})], {
  HOME: noTokenHome.home,
});
const emptyRunDirHome = makeHome({ runDirMode: 0o700 });
const emptyRunDir = await runAdapter("openclaw", [callReq(72, "obsidian_health", {}), callReq(73, "viz_health", {})], {
  HOME: emptyRunDirHome.home,
});
const staleHome = makeHome();
const staleBridge = await startFakeBridge(staleHome.home);
await staleBridge.stop("SIGKILL"); // nothing cleans up: both socket files stay, with no server behind them
const stale = await runAdapter(
  "openclaw",
  [
    callReq(74, "obsidian_health", {}),
    callReq(75, "viz_health", {}),
    callReq(76, "obsidian_openclaw_run_workflow", { ...VALID_RUN, dry_run: true }),
  ],
  { HOME: staleHome.home },
);
for (const [label, responses, ids] of [
  ["no token file", noToken, [70, 71]],
  ["a run directory without a socket", emptyRunDir, [72, 73]],
  ["a stale socket left by a SIGKILLed bridge", stale, [74, 75, 76]],
]) {
  check(`${label}: every bridge call degrades to obsidian_not_running`, () => {
    for (const id of ids) {
      const body = resultJson(responses, id);
      assert.equal(body?.error, "obsidian_not_running", `id ${id}: ${resultText(responses, id).slice(0, 240)}`);
      assert.ok(/open Obsidian/i.test(body?.action ?? ""), `id ${id}: action should tell the caller what to do`);
    }
  });
}
check("a stale socket is still there and refuses the connect (ECONNREFUSED), unlike a missing one", () => {
  for (const name of [CC_SOCKET, VIZ_SOCKET]) {
    assert.ok(lstatSync(join(runDirOf(staleHome.home), name)).isSocket(), `${name} is gone`);
  }
  assert.match(stale.stderr, /ECONNREFUSED/);
});
// socketRefusalCode answers adapter_error: the operator's decision (approval (i), bridges-uds decision record, 2026-11-25).
const looseHome = makeHome({ runDirMode: 0o755 });
const loose = await runAdapter("openclaw", [callReq(77, "obsidian_health", {})], { HOME: looseHome.home });
check("a run directory open to group/others is refused before anything is sent, with a socket_refused stderr line", () => {
  const body = resultJson(loose, 77);
  assert.equal(body?.error, "adapter_error", `got: ${resultText(loose, 77).slice(0, 240)}`);
  assert.ok(body?.message?.includes("was refused before anything was sent"), body?.message);
  assert.match(loose.stderr, /socket_refused code=SOCKET_UNTRUSTED \S*\/run has mode 755/);
});

// A fake bridge on both sockets: the adapter sends exactly the requests it promises, and replies pass
// through unchanged.
const servedHome = makeHome();
const served = await startFakeBridge(servedHome.home);
const servedRun = await runAdapter(
  "openclaw",
  [
    callReq(80, "obsidian_health", {}),
    callReq(81, "viz_health", {}),
    callReq(82, "viz_mermaid", { source: "flowchart TD\n A-->B", bogus: 1 }),
  ],
  { HOME: servedHome.home },
);
await served.stop();
const ccRequests = served.requests.filter((r) => r.socket === CC_SOCKET);
const vizRequests = served.requests.filter((r) => r.socket === VIZ_SOCKET);
const findCall = (requests, method, tool) =>
  requests.find((r) => r.rpc?.method === method && (tool === undefined || r.rpc?.params?.name === tool));
check("fake bridge: the startup health probe is GET /healthz on command-center.sock, without a token", () => {
  const probe = ccRequests.find((r) => r.method === "GET");
  assert.ok(probe, "no GET reached the Command Center socket");
  assert.equal(probe.url, "/healthz");
  assert.equal(probe.headers.authorization, undefined, "the health probe sent a token");
  assert.match(servedRun.stderr, /Command Center healthy at unix:\/tmp\/uds-\w+\/\.local\/state\/trinc\/run\/command-center\.sock/);
});
check("fake bridge: every call is POST /mcp with JSON, its Content-Length and that bridge's Bearer token, no X-MCP-* header", () => {
  const posts = served.requests.filter((r) => r.method === "POST");
  assert.equal(posts.length, 3, `expected Viz tools/list, obsidian_health and viz_health, got ${posts.length} POSTs`);
  for (const r of posts) {
    assert.equal(r.url, "/mcp");
    assert.equal(r.headers["content-type"], "application/json");
    assert.equal(Number(r.headers["content-length"]), r.bodyBytes);
    const token = r.socket === CC_SOCKET ? servedHome.ccToken : servedHome.vizToken;
    assert.ok(r.headers.authorization === `Bearer ${token}`, `${r.socket}: wrong or missing bearer token`);
    assert.deepEqual(Object.keys(r.headers).filter((h) => h.startsWith("x-mcp-")), []);
    assert.equal(r.rpc?.jsonrpc, "2.0");
    assert.match(String(r.rpc?.id), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  }
});
check("fake bridge: Command Center tools go to command-center.sock, Viz tools to viz-studio.sock, replies pass through", () => {
  assert.deepEqual(resultJson(servedRun, 80), { fake: true, socket: CC_SOCKET, tool: "obsidian_health" });
  assert.deepEqual(resultJson(servedRun, 81), { fake: true, socket: VIZ_SOCKET, tool: "viz_health" });
  assert.deepEqual(findCall(ccRequests, "tools/call", "obsidian_health")?.rpc?.params, { name: "obsidian_health", arguments: {} });
  assert.ok(findCall(vizRequests, "tools/call", "viz_health"), "viz_health never reached the Viz socket");
  assert.equal(findCall(ccRequests, "tools/list"), undefined, "tools/list must not be sent to Command Center");
});
check("fake bridge: Viz schemas come live over the socket, stripped of every write-target property", () => {
  const byName = new Map((servedRun.get(2)?.result?.tools ?? []).map((t) => [t.name, t]));
  assert.equal(byName.has("viz_not_on_the_allowlist"), false, "a tool outside VIZ_TOOL_NAMES was listed");
  const mermaid = byName.get("viz_mermaid");
  assert.equal(
    JSON.stringify(mermaid?.inputSchema),
    JSON.stringify({
      type: "object",
      properties: {
        source: { type: "string", description: "Mermaid source" },
        title: { type: "string" },
        fileName: { type: "string" },
      },
      required: ["source"],
    }),
  );
  assert.ok(mermaid.description.startsWith("Fixture: render a Mermaid diagram. On this door the output is written only into Visualizations/"));
  const canvas = byName.get("viz_canvas");
  assert.equal(
    JSON.stringify(canvas?.inputSchema),
    JSON.stringify({
      properties: {
        title: { type: "string" },
        cards: { type: "array", items: { type: "object", properties: { text: { type: "string" } } } },
      },
      additionalProperties: false,
      type: "object",
    }),
  );
  assert.ok(canvas.description.startsWith("On this door the output is written only into Visualizations/"));
  assert.ok(byName.get("viz_chart")?.description.includes("did not answer"), "a tool missing from the reply should be a stub");
});
check("fake bridge: a live Viz schema also checks call arguments (an unknown key is refused before the call)", () => {
  assert.ok(resultText(servedRun, 82).includes("does not accept: bogus"), resultText(servedRun, 82).slice(0, 200));
  assert.equal(findCall(vizRequests, "tools/call", "viz_mermaid"), undefined, "a refused call reached the bridge");
});
check("fake bridge: the per-call stderr lines say upstream=command-center and upstream=viz-studio", () => {
  assert.match(servedRun.stderr, /call tool=obsidian_health upstream=command-center status=ok latency_ms=\d+/);
  assert.match(servedRun.stderr, /call tool=viz_health upstream=viz-studio status=ok latency_ms=\d+/);
});

// A Viz Studio that accepts the connection but never answers must not stall session start: tools/list
// falls back to stubs after its 3 s timeout, and Command Center keeps answering.
const hungHome = makeHome();
const hung = await startFakeBridge(hungHome.home, "hang-viz-list");
const hungStartedAt = Date.now();
const hungRun = await runAdapter("openclaw", [callReq(83, "obsidian_health", {})], { HOME: hungHome.home });
const hungMs = Date.now() - hungStartedAt;
await hung.stop();
check("a hung Viz Studio: tools/list times out into stubs instead of hanging, and Command Center still answers", () => {
  const viz = (hungRun.get(2)?.result?.tools ?? []).filter((t) => EXPECTED_VIZ.includes(t.name));
  assert.equal(viz.length, EXPECTED_VIZ.length);
  assert.ok(viz.every((t) => t.description.includes("did not answer")), "expected every Viz tool as a stub");
  assert.match(hungRun.stderr, /Viz Studio tools\/list unavailable \(trinc-viz-studio request timed out\)/);
  assert.ok(hungMs < 20_000, `the run took ${hungMs} ms`);
  assert.deepEqual(resultJson(hungRun, 83), { fake: true, socket: CC_SOCKET, tool: "obsidian_health" });
});

// (2) Least privilege: the adapter holds no client for the canonical vault bridge (:8798). Until
// 2026-11-21 that client's code was still in index.mjs, unreachable; it went with the raycast profile.
// These are static checks, because no call can prove an absence: the config loader, its env var, its
// socket, the token headers and the request signer must not come back, and neither may a video or
// Raycast tool. Since bridges-uds (2026-11-24) the adapter also has no TLS, CA or TCP code path left.
const ADAPTER_SOURCE = readFileSync(ADAPTER, "utf8");
check("the adapter source holds no :8798 vault-bridge client (config loader, env var, socket, token headers, body signer)", () => {
  const returned = [
    "loadBridgeConfig",
    "OBSIDIAN_MCP_CONFIG",
    "obsidian-cli-mcp.local.json",
    "X-MCP-Token",
    "X-MCP-Body-Sha256",
    // Spelled in two parts, so a search of this package for the socket name finds only real uses.
    ["vault-bridge", "sock"].join("."),
    "x-mcp-token",
    "x-mcp-body-sha256",
  ].filter((s) => ADAPTER_SOURCE.includes(s));
  assert.deepEqual(returned, []);
});
check("the adapter source defines no video-pipeline or Raycast tool", () => {
  const returned = ['name: "video_pipeline_run"', 'name: "video_pipeline_status"', 'name: "raycast_daily_open"'].filter(
    (s) => ADAPTER_SOURCE.includes(s),
  );
  assert.deepEqual(returned, []);
});
check("the adapter source imports neither node:https nor node:tls", () => {
  const imports = ADAPTER_SOURCE.match(/(\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["'](node:)?(https|tls)["']/g) ?? [];
  assert.deepEqual(imports, []);
});
check("the adapter source needs no CA (no NODE_EXTRA_CA_CERTS, mkcert root or trust anchor)", () => {
  assert.deepEqual(["NODE_EXTRA_CA_CERTS", "mkcert", "rootCA", "trust anchor"].filter((s) => ADAPTER_SOURCE.includes(s)), []);
});
check("the adapter source names no TCP endpoint (no loopback address, bridge port or URL)", () => {
  const named = ["127.0.0.1", "[::1]", ":8798", ":8799", ":8800", "http://", "https://"].filter((s) => ADAPTER_SOURCE.includes(s));
  assert.deepEqual(named, []);
});
check("every bridge request goes through the bridges-uds client block (its one http.request, nothing outside it)", () => {
  const begin = ADAPTER_SOURCE.indexOf("// BEGIN bridges-uds client v1\n");
  const end = ADAPTER_SOURCE.indexOf("// END bridges-uds client v1\n");
  assert.ok(begin >= 0 && end > begin, "the bridges-uds client block is missing");
  const outside = ADAPTER_SOURCE.slice(0, begin) + ADAPTER_SOURCE.slice(end);
  assert.deepEqual(outside.match(/\b(http|https|net|tls)\.(request|get|connect|createConnection)\(/g) ?? [], []);
  assert.equal((ADAPTER_SOURCE.slice(begin, end).match(/\bhttp\.request\(/g) ?? []).length, 1);
});

// (3) Static drift guard: every mirrored tool name must still exist in the Command Center source.
// (Names only: the hand-mirrored schemas are not compared property by property.)
const CC_SOURCE = resolve(__dirname, "../../../../Claude/obsidian-command-center/src/bridge/mcp-bridge-server.ts");
check("every openclaw Command Center tool name still exists in the Command Center bridge source", () => {
  const source = readFileSync(CC_SOURCE, "utf8");
  const missing = EXPECTED_OPENCLAW_CC.filter((n) => !source.includes(`name: "${n}"`));
  assert.deepEqual(missing, []);
});
const VIZ_SOURCE = resolve(__dirname, "../../../../Claude/obsidian-viz-studio/src/bridge/toolSchemas.ts");
check("every allowlisted Viz tool name still exists in the Viz Studio schema source", () => {
  const source = readFileSync(VIZ_SOURCE, "utf8");
  const missing = EXPECTED_VIZ.filter((n) => !source.includes(`name: "${n}"`));
  assert.deepEqual(missing, []);
});
// A property Viz Studio adds later that picks a write target (target*, folder, useActive*, overwrite) must
// be blocked on this door in the same change, or Claude could write outside Visualizations/ through it.
check("every write-target property in the Viz Studio schemas is on the door's block list", () => {
  const source = readFileSync(VIZ_SOURCE, "utf8");
  const keys = new Set([...source.matchAll(/^\s+([A-Za-z]+): \{/gm)].map((m) => m[1]));
  const writeTargets = [...keys].filter((k) => /^(target[A-Z]\w*|folder|useActive\w*|overwrite)$/.test(k));
  assert.deepEqual(writeTargets.filter((k) => !VIZ_BLOCKED.includes(k)).sort(), []);
});
check("the Command Center source supports dry_run on run_workflow and post_run_done on status", () => {
  const source = readFileSync(CC_SOURCE, "utf8");
  assert.ok(source.includes("params.dry_run === true"), "dry_run handling missing from handleRunWorkflow");
  assert.ok(source.includes("post_run_done"), "post_run_done missing from handleGetStatus");
});
// (4) Live checks against a reachable Command Center socket. Read-only except the dry_run, which is sent
// only after the status reply proves the daemon is the upgraded build.
if (ccUp) {
  const live = await runAdapter("openclaw", [
    callReq(30, "obsidian_health", {}),
    callReq(31, "obsidian_openclaw_templates", {}),
    callReq(32, "obsidian_openclaw_status", {}),
  ]);
  check("live Command Center answers obsidian_health, templates and status through the openclaw lane", () => {
    for (const id of [30, 31, 32]) {
      assert.notEqual(live.get(id)?.result?.isError, true, `id ${id}: ${resultText(live, id).slice(0, 200)}`);
    }
    const templates = resultText(live, 31);
    assert.ok(templates.length > 20, "templates reply suspiciously short");
  });
  const status = resultJson(live, 32);
  const upgraded = status !== null && "post_run_done" in status && "process_running" in status;
  if (upgraded) {
    check("live status carries the post-run ledger fields (daemon is the upgraded build)", () => {
      assert.equal(typeof status.process_running, "boolean");
      assert.ok(status.post_run_done === null || typeof status.post_run_done === "boolean");
    });
    const templatesJson = resultJson(live, 31);
    const first = (templatesJson?.templates ?? templatesJson?.result?.templates ?? [])[0];
    if (first?.id) {
      const inputs = Object.fromEntries((first.requiredInputs ?? []).map((k) => [k, "dry-run fixture"]));
      const dry = await runAdapter("openclaw", [
        callReq(40, "obsidian_openclaw_run_workflow", { template: first.id, inputs, dry_run: true }),
      ]);
      check("live dry_run run_workflow reports dry_run:true, started:false and uses no operator token", () => {
        const body = resultJson(dry, 40);
        assert.equal(body?.dry_run, true, `got: ${resultText(dry, 40).slice(0, 240)}`);
        assert.equal(body?.started, false);
      });
    } else {
      console.log("SKIP  live dry_run — could not read a template id from the templates reply");
    }
  } else {
    console.log(
      "SKIP  live dry_run + ledger checks — the running Command Center daemon predates post_run_done, so a " +
        "dry_run could be ignored and start a run. Deploy the upgraded Command Center build, then re-run.",
    );
  }
  // Read-only vault lane (D5): one search, then read the first hit. Writes nothing.
  const vaultSearch = await runAdapter("openclaw", [callReq(50, "obsidian_search_notes", { query: "the", limit: 1 })]);
  const firstHit = resultJson(vaultSearch, 50)?.results?.[0]?.path;
  check("live Command Center answers a read-only search through the openclaw lane", () => {
    assert.notEqual(vaultSearch.get(50)?.result?.isError, true, resultText(vaultSearch, 50).slice(0, 200));
    assert.ok(typeof firstHit === "string" && firstHit.length > 0, "search returned no note path");
  });
  if (typeof firstHit === "string") {
    const vaultRead = await runAdapter("openclaw", [callReq(51, "obsidian_read_note", { path: firstHit })]);
    check("live Command Center reads that note back through the openclaw lane", () => {
      assert.notEqual(vaultRead.get(51)?.result?.isError, true, resultText(vaultRead, 51).slice(0, 200));
      assert.equal(typeof resultJson(vaultRead, 51)?.content, "string");
    });
  }
} else {
  console.log("SKIP  live openclaw checks — the Command Center bridge socket is unreachable (is Obsidian open?)");
}

// (5) Live Viz Studio checks against a reachable Viz Studio socket. Read-only: viz_health renders nothing.
if (vizUp) {
  const vizLive = await runAdapter("openclaw", [callReq(60, "viz_health", {})]);
  const vizTools = (vizLive.get(2)?.result?.tools ?? []).filter((t) => EXPECTED_VIZ.includes(t.name));
  check("live Viz Studio: every allowlisted Viz tool is listed with its real schema, not a stub", () => {
    assert.equal(vizTools.length, EXPECTED_VIZ.length);
    const stubs = vizTools.filter((t) => t.description.includes("did not answer")).map((t) => t.name);
    assert.deepEqual(stubs, []);
  });
  check("live Viz Studio: no advertised Viz schema offers a property that writes outside Visualizations/", () => {
    const leaks = vizTools.flatMap((t) =>
      Object.keys(t.inputSchema.properties ?? {}).filter((k) => VIZ_BLOCKED.includes(k)).map((k) => `${t.name}.${k}`),
    );
    assert.deepEqual(leaks, []);
  });
  check("live viz_health answers through the openclaw lane", () => {
    assert.notEqual(vizLive.get(60)?.result?.isError, true, resultText(vizLive, 60).slice(0, 200));
  });
} else {
  console.log("SKIP  live Viz checks — the Viz Studio bridge socket is unreachable (is Obsidian open?)");
}

process.exit(failures === 0 ? 0 : 1);
