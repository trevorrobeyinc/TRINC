// Guard: the Raycast path stays retired (phase 4 of retiring Raycast and Downie, 2026-11-20). Run: npm test
//
// The bridge imports `obsidian`, so node --test cannot load it; like no-dynamic-builtin-imports.test.ts, this
// reads the source instead. It checks the three things the phase removed or promised: no Raycast deeplink and
// no /usr/bin/open dispatch, a link refused with a pointer to the download script the run tool's description
// names, and a status description that tells the agent about summaryError and transcriptNote.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LINK_REFUSAL, VIDEO_DOWNLOAD_SCRIPT } from "../src/bridge/video-pipeline-source.ts";

const BRIDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "src", "bridge", "mcp-bridge-server.ts"),
  "utf-8"
);

/** A tool's description string, as written in the bridge's tool list. */
function toolDescription(name: string): string {
  const m = BRIDGE.match(new RegExp(`name: "${name}",\\s*description:\\s*"([^"]*)"`));
  assert.ok(m, `no description found for ${name}`);
  return m[1];
}

test("the bridge no longer dispatches the Raycast runner", () => {
  assert.equal(BRIDGE.includes("raycast://"), false, "a Raycast deeplink is back in the bridge");
  assert.equal(BRIDGE.includes("/usr/bin/open"), false, "an /usr/bin/open dispatch is back in the bridge");
  assert.equal(BRIDGE.includes("raycastWasRunning"), false);
  assert.equal(BRIDGE.includes("videoBackend"), false, "the bridge reads a backend switch again");
});

test("the run tool describes local files and folders only, and names the download script the refusal names", () => {
  const run = toolDescription("video_pipeline_run");
  assert.equal(/raycast|downie/i.test(run), false, run);
  assert.ok(run.includes(VIDEO_DOWNLOAD_SCRIPT), "the description must name the script the refusal points at");
  assert.ok(LINK_REFUSAL.includes(VIDEO_DOWNLOAD_SCRIPT));
});

test("the status tool tells the agent about summaryError and transcriptNote", () => {
  const status = toolDescription("video_pipeline_status");
  for (const field of ["`summaryError`", "`transcriptNote`", "batch.failures[].transcriptNote"]) {
    assert.ok(status.includes(field), `${field} missing from the status description`);
  }
  assert.equal(/raycast|downie/i.test(status), false, status);
});
