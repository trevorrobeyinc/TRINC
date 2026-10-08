// Unit tests for src/workflow/post-run-ledger.ts. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STAGE_NAMES,
  abortPending,
  createLedger,
  isDone,
  markStage,
  summarizeLedger,
} from "../src/workflow/post-run-ledger.ts";

const T0 = "2026-10-07T00:00:00.000Z";
const T1 = "2026-10-07T00:00:05.000Z";
const clock = (t: string) => () => t;

test("a new ledger has every stage pending and is not done", () => {
  const ledger = createLedger("wf-1", clock(T0));
  assert.equal(ledger.workflowId, "wf-1");
  for (const name of STAGE_NAMES) assert.equal(ledger.stages[name].state, "pending");
  assert.equal(isDone(ledger), false);
  const summary = summarizeLedger(ledger);
  assert.equal(summary.done, false);
  assert.equal(summary.current, "notes");
});

test("done only when every stage is terminal; current tracks the first open stage", () => {
  const ledger = createLedger("wf-2", clock(T0));
  for (const name of STAGE_NAMES) {
    assert.equal(isDone(ledger), false, `still open before ${name}`);
    markStage(ledger, name, "running", undefined, clock(T1));
    assert.equal(summarizeLedger(ledger).current, name);
    markStage(ledger, name, "ok", undefined, clock(T1));
  }
  assert.equal(isDone(ledger), true);
  assert.equal(summarizeLedger(ledger).current, null);
});

test("skipped and failed count as terminal", () => {
  const ledger = createLedger("wf-3", clock(T0));
  markStage(ledger, "notes", "ok");
  markStage(ledger, "notify", "failed", "bridge down");
  markStage(ledger, "miyo", "skipped", "disabled");
  markStage(ledger, "zk", "skipped");
  markStage(ledger, "memory", "ok");
  markStage(ledger, "open", "skipped");
  assert.equal(isDone(ledger), true);
  assert.equal(summarizeLedger(ledger).stages.notify.state, "failed");
});

test("a terminal stage is never reopened", () => {
  const ledger = createLedger("wf-4", clock(T0));
  markStage(ledger, "zk", "failed", "plugin missing", clock(T0));
  markStage(ledger, "zk", "running", undefined, clock(T1));
  markStage(ledger, "zk", "ok", undefined, clock(T1));
  assert.equal(ledger.stages.zk.state, "failed");
  assert.equal(ledger.stages.zk.detail, "plugin missing");
  assert.equal(ledger.stages.zk.at, T0);
});

test("abortPending fails only the stages that never started", () => {
  const ledger = createLedger("wf-5", clock(T0));
  markStage(ledger, "notes", "ok");
  markStage(ledger, "memory", "running");
  abortPending(ledger, "completion handler threw");
  assert.equal(ledger.stages.notes.state, "ok");
  assert.equal(ledger.stages.memory.state, "running", "fire-and-forget ingest settles itself");
  for (const name of ["notify", "miyo", "zk", "open"] as const) {
    assert.equal(ledger.stages[name].state, "failed");
    assert.equal(ledger.stages[name].detail, "completion handler threw");
  }
  assert.equal(isDone(ledger), false, "memory is still running");
  markStage(ledger, "memory", "ok");
  assert.equal(isDone(ledger), true);
});

test("detail is flattened, bounded, and empty details are dropped", () => {
  const ledger = createLedger("wf-6", clock(T0));
  markStage(ledger, "notes", "failed", "line one\nline two\u0007\u001b[31mred");
  assert.equal(ledger.stages.notes.detail, "line one line two [31mred");
  markStage(ledger, "notify", "failed", "x".repeat(500));
  assert.equal(ledger.stages.notify.detail?.length, 200);
  assert.ok(ledger.stages.notify.detail?.endsWith("…"));
  markStage(ledger, "miyo", "skipped", "   \n  ");
  assert.equal("detail" in ledger.stages.miyo, false);
});

test("the summary is a copy: mutating it cannot change the ledger", () => {
  const ledger = createLedger("wf-7", clock(T0));
  const summary = summarizeLedger(ledger);
  summary.stages.notes.state = "ok";
  assert.equal(ledger.stages.notes.state, "pending");
});
