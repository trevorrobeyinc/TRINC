// Unit tests for src/workflow/status-compaction.ts. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MAX_CHARS, compactWorkflowState } from "../src/workflow/status-compaction.ts";

const big = (n: number) => "x".repeat(n);

function finishedRun() {
  return {
    status: "completed",
    workflow_id: "wf-1",
    pipeline_progress: {
      total_steps: 3,
      steps: [
        {
          step_id: "research",
          type: "mission",
          status: "completed",
          result: { graveyard_memo: big(400_000), citation_verification: big(19_000), tiny: "ok" },
        },
        { step_id: "quality_check", type: "quality_audit", status: "completed", result: { pass: true } },
        { step_id: "approve", type: "approve", status: "failed", error: { code: "X", message: "boom" } },
      ],
    },
    artifacts: {
      mission_id: "mission-1",
      citation_verification: { detail: big(19_000) },
      vault_notes: { folder: "OpenClaw/x", files: ["a.md", "b.md"] },
    },
  };
}

test("an oversized step result becomes a size summary; every other step field survives", () => {
  const out = compactWorkflowState(finishedRun()) as any;
  const research = out.pipeline_progress.steps[0];
  assert.equal(research.step_id, "research");
  assert.equal(research.status, "completed");
  assert.equal(research.result.trimmed, true);
  assert.ok(research.result.chars > 400_000);
  assert.ok(research.result.fields.graveyard_memo > 399_000, "says which field was the big one");
  assert.equal(research.result.fields.tiny, '"ok"'.length);
  assert.match(research.result.hint, /obsidian_openclaw_results/);
  assert.match(research.result.hint, /verbose:true/);
});

test("small step results, errors and untouched steps are passed through as they were", () => {
  const input = finishedRun();
  const out = compactWorkflowState(input) as any;
  assert.deepEqual(out.pipeline_progress.steps[1], input.pipeline_progress.steps[1]);
  assert.deepEqual(out.pipeline_progress.steps[2], input.pipeline_progress.steps[2]);
  assert.equal(out.pipeline_progress.total_steps, 3);
  assert.equal(out.status, "completed");
  assert.equal(out.workflow_id, "wf-1");
});

test("an oversized artifact is summarized, a small one is kept whole", () => {
  const out = compactWorkflowState(finishedRun()) as any;
  assert.equal(out.artifacts.citation_verification.trimmed, true);
  assert.equal(out.artifacts.mission_id, "mission-1");
  assert.deepEqual(out.artifacts.vault_notes, { folder: "OpenClaw/x", files: ["a.md", "b.md"] });
});

test("the reply for a run like run #2 shrinks from ~0.5 MB to a few KB", () => {
  const before = JSON.stringify(finishedRun()).length;
  const after = JSON.stringify(compactWorkflowState(finishedRun())).length;
  assert.ok(before > 400_000, `fixture is realistic (${before})`);
  assert.ok(after < 5_000, `status is small again (${after})`);
});

test("it never mutates its input, and returns the very same object when nothing is oversized", () => {
  const input = finishedRun();
  const snapshot = JSON.stringify(input);
  compactWorkflowState(input);
  assert.equal(JSON.stringify(input), snapshot, "input untouched");

  const small = { status: "running", pipeline_progress: { steps: [{ step_id: "research", status: "running" }] }, artifacts: {} };
  assert.equal(compactWorkflowState(small), small);
});

test("the threshold is the caller's to set, and odd shapes do not throw", () => {
  const state = { pipeline_progress: { steps: [{ step_id: "s", result: { a: big(50) } }] } };
  assert.equal((compactWorkflowState(state, 10) as any).pipeline_progress.steps[0].result.trimmed, true);
  assert.equal((compactWorkflowState(state, DEFAULT_MAX_CHARS) as any).pipeline_progress.steps[0].result.trimmed, undefined);
  assert.doesNotThrow(() => compactWorkflowState({}));
  assert.doesNotThrow(() => compactWorkflowState({ pipeline_progress: null, artifacts: "text" }));
  assert.doesNotThrow(() => compactWorkflowState({ pipeline_progress: { steps: [null, 7, "s", { step_id: "x" }] } }));
});
