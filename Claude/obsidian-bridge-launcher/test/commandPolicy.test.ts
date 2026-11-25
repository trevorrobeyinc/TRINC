// The launcher's command allow-list is the authority over which Obsidian commands the vault bridge can run.
// These tests pin it: the five ids pass, look-alikes do not, and the list itself is snapshotted, so widening it
// takes a deliberate edit here as well as in src/commandPolicy.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedCommandIds, isCommandAllowed } from "../src/commandPolicy.ts";

const ALLOWED = [
  "copilot:super-summarize-to-note",
  "copilot:summarize-to-note",
  "command-center:run-workflow",
  "command-center:toggle-pipeline-sidebar",
  "command-center:analyze-current-note",
];

test("the list is exactly the five ids the operator chose on 2026-11-25", () => {
  assert.deepEqual(allowedCommandIds(), ALLOWED);
});

test("each allowed id passes", () => {
  for (const id of ALLOWED) assert.equal(isCommandAllowed(id), true, id);
});

test("look-alikes are refused: the comparison is exact", () => {
  const lookAlikes = [
    "command-center:cancel-workflow",
    "COPILOT:summarize-to-note",
    "copilot:Summarize-to-note",
    " copilot:summarize-to-note",
    "copilot:summarize-to-note ",
    "copilot:summarize",
    "copilot:summarize-to-note-x",
    "copilot:my-prompt-to-note",
    "command-center:",
    ":summarize-to-note",
    "command-center",
    "runjs:run",
    "app:delete-file",
    "",
  ];
  for (const id of lookAlikes) assert.equal(isCommandAllowed(id), false, JSON.stringify(id));
});

test("every allowed id has the shape the bridge checks first, so the bridge never refuses one as malformed", () => {
  for (const id of allowedCommandIds()) assert.match(id, /^[a-z0-9_-]+:[a-z0-9_-]+$/i);
});

test("a copy of the list cannot widen it", () => {
  const copy = allowedCommandIds();
  copy.push("runjs:run");
  assert.equal(isCommandAllowed("runjs:run"), false);
  assert.deepEqual(allowedCommandIds(), ALLOWED);
});
