// Guard: the Raycast path stays retired (phase 4, 2026-11-20), and the Downie hand-off (2026-11-22) stays the
// one place a program is told to open an address. Run: npm test
//
// The bridge imports `obsidian`, so node --test cannot load it; like no-dynamic-builtin-imports.test.ts, this
// reads the source instead. It checks that no Raycast deeplink is back anywhere, that only src/video/downie.ts
// names the open program, a link it opens is approved there, that the run tool's description names the
// download script its refusal points at, and that the status description tells the agent about summaryError,
// transcriptNote and waitingForUser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LINK_REFUSAL, VIDEO_DOWNLOAD_SCRIPT } from "../src/bridge/video-pipeline-source.ts";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const BRIDGE = readFileSync(join(SRC, "bridge", "mcp-bridge-server.ts"), "utf-8");

function* sources(dir: string = SRC): Generator<{ file: string; text: string }> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* sources(full);
    else if (name.endsWith(".ts")) yield { file: full.slice(SRC.length + 1), text: readFileSync(full, "utf-8") };
  }
}

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

// Opening an address is how another program gets one, so it happens in one module, for one program's own
// address, after the approved list has been asked (its own tests prove the asking).
test("only the Downie module opens an address, and only Downie's", () => {
  const opening: string[] = [];
  for (const { file, text } of sources()) {
    assert.equal(text.includes("raycast://"), false, `a Raycast deeplink is back in ${file}`);
    if (text.includes("/usr/bin/open") || /openExternal|window\.open\(/.test(text)) opening.push(file);
    if (/[a-z]+:\/\/XUOpenURL/i.test(text)) assert.equal(file, join("video", "downie.ts"));
  }
  assert.deepEqual(opening, [join("video", "downie.ts")]);
  const downie = readFileSync(join(SRC, "video", "downie.ts"), "utf-8");
  assert.equal(downie.match(/exec\(OPEN_BINARY/g)?.length, 1);
  const opens = downie.slice(downie.indexOf("export async function openInDownie"), downie.indexOf("exec(OPEN_BINARY"));
  assert.ok(opens.includes("approveDownieLink(rawLink)"), "openInDownie must ask the approved list itself");
});

test("the run tool names the approved sites, and the download script the refusal names", () => {
  const run = toolDescription("video_pipeline_run");
  assert.equal(/raycast/i.test(run), false, run);
  for (const said of ["LinkedIn Learning lesson", "Kaltura", "Strayer library film", "`waitingForUser`", "never open a link any other way"]) {
    assert.ok(run.includes(said), `${said} missing from the run description`);
  }
  assert.ok(run.includes(VIDEO_DOWNLOAD_SCRIPT), "the description must name the script the refusal points at");
  assert.ok(LINK_REFUSAL.includes(VIDEO_DOWNLOAD_SCRIPT));
});

test("the status tool tells the agent about summaryError, transcriptNote and waitingForUser", () => {
  const status = toolDescription("video_pipeline_status");
  for (const field of ["`summaryError`", "`transcriptNote`", "batch.failures[].transcriptNote", "`waitingForUser`", "`downloadNote`"]) {
    assert.ok(status.includes(field), `${field} missing from the status description`);
  }
  assert.equal(/raycast/i.test(status), false, status);
});
