#!/usr/bin/env node
// Regression guard for the adapter's per-profile tool surfaces.
//
//   npm run test:profiles
//
// Asserts:
//   - "raycast" profile lists EXACTLY its 2 video tools (proxied to the Command Center bridge on
//     :8799), refuses its 8 retired tools by name (the 7 vault tools and raycast_daily_open, retired
//     2026-11-18: Raycast AI's vault access is the YubiKey-gated "Obsidian Vault" server), and, like
//     "openclaw", starts with the :8798 config unreadable.
//   - "openclaw" profile (Claude's one door since 2026-10-23) lists EXACTLY its 15 :8799 tools plus
//     the 12 allowlisted Viz Studio tools, never offers a Viz property that writes outside
//     Visualizations/, and refuses one on a call.
//   - The retired "claude" profile, and a missing profile, refuse to start.
//   - When the Command Center bridge is reachable, a dry_run video_pipeline_run
//     through the adapter returns a deeplink of the expected shape (no dispatch),
//     for a URL and for a folder of videos (folder mode, 2026-11-18). When it is
//     not reachable (Obsidian closed), those checks are SKIPPED loudly and the
//     vault assertions still gate the exit code.
//   - The raycast video tool descriptions are the Command Center's, word for word.
//
// Plain node, no dependencies. Requires the mkcert CA the adapter uses. Neither profile reads the
// :8798 bridge config since 2026-11-18, and listing is local to the adapter.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import * as nodeHttps from "node:https";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ADAPTER = resolve(__dirname, "../index.mjs");

// The raycast profile's tools until 2026-11-18. Each must now be refused by name on that door, because
// a Raycast holding the old tool snapshot can still call them.
const RETIRED_RAYCAST = [
  "obsidian_open_vault",
  "obsidian_create_note",
  "obsidian_append_note",
  "obsidian_read_note",
  "obsidian_search_notes",
  "obsidian_execute_command",
  "obsidian_health",
  "raycast_daily_open",
];
const EXPECTED_RAYCAST = ["video_pipeline_run", "video_pipeline_status"];
const DEEPLINK_SHAPE =
  /^raycast:\/\/extensions\/marcjulian\/obsidian-bridge-fork\/videoTranscribeRunnerCommand\?arguments=/;
const COMMAND_CENTER_HEALTHZ = "https://127.0.0.1:8799/healthz";
const VIZ_HEALTHZ = "https://127.0.0.1:8800/healthz";

function caPath() {
  return (
    process.env.NODE_EXTRA_CA_CERTS ||
    `${process.env.HOME}/Library/Application Support/mkcert/rootCA.pem`
  );
}

/** Drive one adapter instance over stdio: initialize -> tools/list [-> extra calls]. */
function runAdapter(profile, extraRequests = [], envExtra = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const proc = spawn(process.execPath, [ADAPTER], {
      env: { ...process.env, OBSIDIAN_STDIO_PROFILE: profile, ...envExtra },
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

function bridgeUp(healthz) {
  return new Promise((resolveUp) => {
    let ca;
    try {
      ca = readFileSync(caPath());
    } catch {
      return resolveUp(false);
    }
    const req = nodeHttps.get(
      healthz,
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

// --- profile selection: "claude" is retired and there is no default --------
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
  ["the retired claude profile refuses to start", { ...process.env, OBSIDIAN_STDIO_PROFILE: "claude" }],
  ["a missing profile refuses to start (there is no default)", envWithoutProfile],
]) {
  const exit = await runToExit(env);
  check(label, () => {
    assert.notEqual(exit.code, 0, "adapter started anyway");
    assert.notEqual(exit.code, "timeout", "adapter hung instead of refusing");
    assert.match(exit.stderr, /must be "raycast" or "openclaw"/);
  });
}

// --- raycast profile: exact 10-tool surface ----------------------------------
const ccUp = await bridgeUp(COMMAND_CENTER_HEALTHZ);
const vizUp = await bridgeUp(VIZ_HEALTHZ);
// Inert placeholder id on an allowlisted host — the deeplink-shape check does
// not care about URL contents, and nothing is dispatched (dry_run).
const FIXTURE_URL = "https://www.youtube.com/watch?v=test-fixture-0000";
// Folder mode (2026-11-18): a throwaway folder holding one empty video and one non-video file.
// The daemon's folder check reads only names and file types, so an empty clip.mp4 counts as one
// video; nothing is dispatched (dry_run) and the folder is removed after the raycast run.
const VIDEO_FIXTURE_DIR = mkdtempSync(join(tmpdir(), "adapter-video-folder-"));
writeFileSync(join(VIDEO_FIXTURE_DIR, "clip.mp4"), "");
writeFileSync(join(VIDEO_FIXTURE_DIR, "notes.txt"), "not a video\n");
// What the daemon sends on (it canonicalizes with realpathSync: /var/folders/... is
// /private/var/folders/... on macOS), read now because the folder is gone by check time.
const VIDEO_FIXTURE_DIR_REAL = realpathSync(VIDEO_FIXTURE_DIR);
// A path the adapter may not stat (macOS privacy controls can deny Raycast's child a folder that
// Obsidian reads, such as one on an external drive): the edge cannot tell, so the daemon decides.
// A mode-000 parent makes stat fail with EACCES. The folder count skips it (no video extension).
const LOCKED_DIR = join(VIDEO_FIXTURE_DIR, "locked");
mkdirSync(LOCKED_DIR);
chmodSync(LOCKED_DIR, 0o000);
// Sent whether or not :8799 is up: both must pass the adapter's edge either way.
const edgePassRequests = [
  {
    jsonrpc: "2.0",
    id: 9,
    method: "tools/call",
    params: {
      name: "video_pipeline_run",
      arguments: { videoUrl: VIDEO_FIXTURE_DIR, dry_run: true },
    },
  },
  {
    jsonrpc: "2.0",
    id: 11,
    method: "tools/call",
    params: {
      name: "video_pipeline_run",
      arguments: { videoUrl: join(LOCKED_DIR, "inner"), dry_run: true },
    },
  },
];
// Input-validation rejects happen inside the adapter BEFORE any :8799 call,
// so these assertions run regardless of whether the bridge is up.
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
      name: "video_pipeline_run",
      arguments: { videoUrl: "/" + "x".repeat(2 * 1024 * 1024), dry_run: true },
    },
  },
  {
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: {
      name: "video_pipeline_run",
      arguments: { videoUrl: join(VIDEO_FIXTURE_DIR, "notes.txt"), dry_run: true },
    },
  },
  {
    jsonrpc: "2.0",
    id: 8,
    method: "tools/call",
    params: {
      name: "video_pipeline_run",
      arguments: { videoUrl: "Videos/clip.mp4", dry_run: true },
    },
  },
  {
    jsonrpc: "2.0",
    id: 10,
    method: "tools/call",
    params: {
      name: "video_pipeline_run",
      arguments: { videoUrl: join(VIDEO_FIXTURE_DIR, "missing-folder"), dry_run: true },
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
      ...edgePassRequests,
      ...rejectRequests,
    ]
  : [...edgePassRequests, ...rejectRequests];
let raycast;
try {
  raycast = await runAdapter("raycast", extra);
} finally {
  chmodSync(LOCKED_DIR, 0o700);
  rmSync(VIDEO_FIXTURE_DIR, { recursive: true, force: true });
}
check("raycast profile lists exactly its 2 video tools", () => {
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
  // Proves the running daemon is the folder-mode build: an older one refuses a folder.
  check("live :8799: dry_run on a folder reports kind folder, its video count and its canonical path", () => {
    const res = raycast.get(9)?.result;
    assert.ok(res, "no result for tools/call id 9");
    assert.notEqual(res.isError, true, `tool returned isError: ${JSON.stringify(res).slice(0, 300)}`);
    const payload = JSON.parse(res.content?.[0]?.text ?? "{}");
    assert.equal(payload.dryRun, true, "expected dryRun:true");
    assert.equal(payload.dispatched, false, "dry run must not dispatch");
    assert.equal(payload.kind, "folder");
    assert.equal(payload.videoCount, 1, "clip.mp4 is the only video; notes.txt must not count");
    assert.match(payload.deeplink ?? "", DEEPLINK_SHAPE);
    const sent = JSON.parse(decodeURIComponent(payload.deeplink.split("?arguments=")[1]));
    assert.equal(sent.videoUrl, VIDEO_FIXTURE_DIR_REAL);
  });
} else {
  console.log(
    "SKIP  dry_run deeplink checks (URL and folder) — Command Center bridge (:8799) unreachable (is Obsidian open?)",
  );
}
check("an absolute folder path passes the adapter's client edge", () => {
  const res = raycast.get(9)?.result;
  assert.ok(res, "no result for tools/call id 9");
  const text = res.content?.[0]?.text ?? "";
  assert.ok(!text.startsWith("Rejected by adapter input validation"), `refused at the edge: ${text.slice(0, 200)}`);
});
check("a path the adapter cannot stat (EACCES) is left to the daemon, which still refuses it", () => {
  const res = raycast.get(11)?.result;
  assert.ok(res, "no result for tools/call id 11");
  const text = res.content?.[0]?.text ?? "";
  assert.ok(!text.startsWith("Rejected by adapter input validation"), `refused at the edge: ${text.slice(0, 200)}`);
  // With :8799 up the daemon refuses it (it cannot stat it either); with :8799 down the call fails.
  assert.equal(res.isError, true, `expected isError:true, got: ${JSON.stringify(res).slice(0, 200)}`);
  console.log(`      answered: ${text.slice(0, 160)}`);
});

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
assertReject(7, "an existing non-video file is still rejected", "Local file must be a video");
assertReject(8, "a relative video path is rejected", "Local video paths must be absolute");
assertReject(10, "a missing folder is rejected at the edge", "No such file or folder:");

// --- openclaw profile: Claude Code's dispatch lane (added 2026-10-07) --------
//
// Safety rule for this section: it NEVER sends a non-dry-run obsidian_openclaw_run_workflow, and it
// only sends a dry_run one to a LIVE :8799 after a read-only version probe shows the daemon knows
// the parameter (a daemon that predates dry_run would ignore it and try to start a real run).
// The :8799 tools, mirrored by hand in the adapter (two read-only vault tools added 2026-10-23, D5).
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
// The Viz Studio (:8800) allowlist (2026-10-23, D4 + D5); schemas come live from the daemon.
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
// Everything the :8799 daemon (or the :8798 vault bridge) offers that this lane must NOT surface.
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

// (1) Adapter-local rejects and a forced-dead upstream. Nothing here can reach a live daemon: the
// rejects fail before any network call and the upstream URL is a closed loopback port.
const DEAD_UPSTREAM = {
  OBSIDIAN_STDIO_COMMAND_CENTER_URL: "https://127.0.0.1:9",
  OBSIDIAN_STDIO_VIZ_URL: "https://127.0.0.1:9",
};
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
  ],
  DEAD_UPSTREAM,
);

check("openclaw profile lists exactly its 15 :8799 tools and the 12 Viz tools", () => {
  assert.deepEqual(toolNames(openclawLocal), [...EXPECTED_OPENCLAW].sort());
});
check("with :8800 down, every Viz tool is listed as a stub that names the Visualizations/ rule", () => {
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

// (2) Least privilege: both lanes must start and list tools with the :8798 config UNREADABLE.
// OBSIDIAN_MCP_CONFIG is the first candidate loadBridgeConfig tries, and it is read + JSON.parsed, so a
// profile that loaded the config would crash on a file that is not JSON. No profile loads it since
// 2026-11-18 ("openclaw" since 2026-10-07); the negative control below is therefore static.
const POISON_DIR = mkdtempSync(join(tmpdir(), "stdio-adapter-poison-"));
const POISON_CONFIG = join(POISON_DIR, "not-a-config.json");
writeFileSync(POISON_CONFIG, "{ this is not json — no profile may ever read it", "utf8");
try {
  const poisoned = await runAdapter("openclaw", [], { OBSIDIAN_MCP_CONFIG: POISON_CONFIG, ...DEAD_UPSTREAM });
  check("openclaw starts and lists its tools even when the :8798 config is unreadable (it never loads the :8798 token)", () => {
    assert.deepEqual(toolNames(poisoned), [...EXPECTED_OPENCLAW].sort());
  });
  // The retired raycast tools are called HERE, with the config poisoned and every upstream dead, so even
  // a regression in both the name fence and the config switch could not write to the real vault.
  const retiredCalls = RETIRED_RAYCAST.map((name, i) => ({
    jsonrpc: "2.0",
    id: 70 + i,
    method: "tools/call",
    params: { name, arguments: { vault: "fixture", path: "fixture.md", content: "fixture", id: "fixture" } },
  }));
  const poisonedRaycast = await runAdapter("raycast", retiredCalls, {
    OBSIDIAN_MCP_CONFIG: POISON_CONFIG,
    ...DEAD_UPSTREAM,
  });
  check("raycast starts and lists only its 2 video tools even when the :8798 config is unreadable", () => {
    assert.deepEqual(toolNames(poisonedRaycast), [...EXPECTED_RAYCAST].sort());
  });
  check("raycast refuses each of its 8 retired tools by name and points at the gated vault server", () => {
    const wrong = RETIRED_RAYCAST.filter((name, i) => {
      const res = poisonedRaycast.get(70 + i)?.result;
      return !(res?.isError === true && resultText(poisonedRaycast, 70 + i).includes(`${name} is no longer served on this door`));
    });
    assert.deepEqual(wrong, []);
  });
  check("negative control: a profile that loaded the :8798 config would crash on this file (so the checks above are meaningful)", () => {
    assert.throws(() => JSON.parse(readFileSync(POISON_CONFIG, "utf8")), SyntaxError);
    const source = readFileSync(ADAPTER, "utf8");
    const loader = source.slice(source.indexOf("function loadBridgeConfig()"), source.indexOf("const PROFILE ="));
    assert.match(loader, /const candidates = \[\s*process\.env\.OBSIDIAN_MCP_CONFIG,/, "OBSIDIAN_MCP_CONFIG is no longer the first candidate");
    assert.match(loader, /JSON\.parse\(readFileSync\(path, "utf8"\)\)/, "loadBridgeConfig no longer parses the file it finds");
  });
} finally {
  rmSync(POISON_DIR, { recursive: true, force: true });
}

// (3) Static drift guard: every mirrored tool name must still exist in the Command Center source.
// (Names only — property-level drift is covered by the live checks below when :8799 is up.)
const CC_SOURCE = resolve(__dirname, "../../../../Claude/obsidian-command-center/src/bridge/mcp-bridge-server.ts");
check("every openclaw :8799 tool name still exists in the Command Center bridge source", () => {
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
// The raycast video tools are mirrored word for word (2026-11-18: the folder-mode change reached the
// bridge but not this mirror, and no check noticed). Each description is a one-line double-quoted
// literal in the bridge source, so its JSON form must appear there verbatim.
check("every raycast video tool description is the Command Center source's, word for word", () => {
  const source = readFileSync(CC_SOURCE, "utf8");
  const tools = (raycast.get(2)?.result?.tools ?? []).filter((t) => t.name.startsWith("video_pipeline_"));
  assert.equal(tools.length, 2, "expected video_pipeline_run and video_pipeline_status");
  const drifted = [];
  for (const t of tools) {
    if (!source.includes(JSON.stringify(t.description))) drifted.push(t.name);
    for (const [key, prop] of Object.entries(t.inputSchema.properties ?? {})) {
      if (!source.includes(JSON.stringify(prop.description))) drifted.push(`${t.name}.${key}`);
    }
  }
  assert.deepEqual(drifted, []);
});

// (4) Live checks against a reachable :8799. Read-only except the dry_run, which is sent only after
// the status reply proves the daemon is the upgraded build.
if (ccUp) {
  const live = await runAdapter("openclaw", [
    callReq(30, "obsidian_health", {}),
    callReq(31, "obsidian_openclaw_templates", {}),
    callReq(32, "obsidian_openclaw_status", {}),
  ]);
  check("live :8799 answers obsidian_health, templates and status through the openclaw lane", () => {
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
      "SKIP  live dry_run + ledger checks — the running :8799 daemon predates post_run_done, so a dry_run " +
        "could be ignored and start a run. Deploy the upgraded Command Center build, then re-run.",
    );
  }
  // Read-only vault lane (D5): one search, then read the first hit. Writes nothing.
  const vaultSearch = await runAdapter("openclaw", [callReq(50, "obsidian_search_notes", { query: "the", limit: 1 })]);
  const firstHit = resultJson(vaultSearch, 50)?.results?.[0]?.path;
  check("live :8799 answers a read-only search through the openclaw lane", () => {
    assert.notEqual(vaultSearch.get(50)?.result?.isError, true, resultText(vaultSearch, 50).slice(0, 200));
    assert.ok(typeof firstHit === "string" && firstHit.length > 0, "search returned no note path");
  });
  if (typeof firstHit === "string") {
    const vaultRead = await runAdapter("openclaw", [callReq(51, "obsidian_read_note", { path: firstHit })]);
    check("live :8799 reads that note back through the openclaw lane", () => {
      assert.notEqual(vaultRead.get(51)?.result?.isError, true, resultText(vaultRead, 51).slice(0, 200));
      assert.equal(typeof resultJson(vaultRead, 51)?.content, "string");
    });
  }
} else {
  console.log("SKIP  live openclaw checks — Command Center bridge (:8799) unreachable (is Obsidian open?)");
}

// (5) Live Viz Studio checks against a reachable :8800. Read-only: viz_health renders nothing.
if (vizUp) {
  const vizLive = await runAdapter("openclaw", [callReq(60, "viz_health", {})]);
  const vizTools = (vizLive.get(2)?.result?.tools ?? []).filter((t) => EXPECTED_VIZ.includes(t.name));
  check("live :8800: every allowlisted Viz tool is listed with its real schema, not a stub", () => {
    assert.equal(vizTools.length, EXPECTED_VIZ.length);
    const stubs = vizTools.filter((t) => t.description.includes("did not answer")).map((t) => t.name);
    assert.deepEqual(stubs, []);
  });
  check("live :8800: no advertised Viz schema offers a property that writes outside Visualizations/", () => {
    const leaks = vizTools.flatMap((t) =>
      Object.keys(t.inputSchema.properties ?? {}).filter((k) => VIZ_BLOCKED.includes(k)).map((k) => `${t.name}.${k}`),
    );
    assert.deepEqual(leaks, []);
  });
  check("live viz_health answers through the openclaw lane", () => {
    assert.notEqual(vizLive.get(60)?.result?.isError, true, resultText(vizLive, 60).slice(0, 200));
  });
} else {
  console.log("SKIP  live Viz checks — Viz Studio bridge (:8800) unreachable (is Obsidian open?)");
}

process.exit(failures === 0 ? 0 : 1);
