// Unit tests for src/subprocess/gate-denial.ts. Run: npm test
// The sample lines are copied from openclaw-bridge/core/operator-approve-gate.js (reason strings) and
// scripts/run-workflow.js:151 (the "Operator-approve denied: " prefix).
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyGateDenial, gateCodeFromMessage, gateDenialAction } from "../src/subprocess/gate-denial.ts";

const NOT_ARMED = "Operator-approve denied: not armed — run: operator-approve-gate arm (YubiKey PIN + touch)\n";
const EXPIRED = "Operator-approve denied: armed token expired (412s > 300s) — re-run: operator-approve-gate arm\n";
const MISMATCH =
  "Operator-approve denied: armed token does not match sealed nonce (tampered/stale) — re-run: operator-approve-gate arm\n";

test("classifies each of the three documented refusals", () => {
  assert.equal(classifyGateDenial(NOT_ARMED), "operator_gate_not_armed");
  assert.equal(classifyGateDenial(EXPIRED), "operator_gate_expired");
  assert.equal(classifyGateDenial(MISMATCH), "operator_gate_token_mismatch");
});

test("an unrecognised reason is still a gate denial, not a generic crash", () => {
  assert.equal(classifyGateDenial("Operator-approve denied: something new\n"), "operator_gate_denied");
});

test("finds the denial inside a noisy stderr tail", () => {
  const tail = `{"level":"info","msg":"boot"}\n(node:1) Warning: x\n${EXPIRED}`;
  assert.equal(classifyGateDenial(tail), "operator_gate_expired");
});

test("no denial line means null, so the caller keeps its generic exit error", () => {
  assert.equal(classifyGateDenial(""), null);
  assert.equal(classifyGateDenial("Error: ENOENT: no such file or directory\n"), null);
  assert.equal(classifyGateDenial("PHASE30_MISSING_REQUIRED_INPUT: topic\n"), null);
});

test("is case-insensitive on the prefix but strict on the reason shape", () => {
  assert.equal(classifyGateDenial("operator-approve DENIED: NOT ARMED — x"), "operator_gate_not_armed");
  assert.equal(classifyGateDenial("Operator-approve denied: the key was not armed"), "operator_gate_denied");
});

test("gateCodeFromMessage reads the prefix the runner puts on its error", () => {
  assert.equal(gateCodeFromMessage("operator_gate_not_armed: the engine refused"), "operator_gate_not_armed");
  assert.equal(gateCodeFromMessage("operator_gate_expired: x"), "operator_gate_expired");
  assert.equal(gateCodeFromMessage("operator_gate_token_mismatch: x"), "operator_gate_token_mismatch");
  assert.equal(gateCodeFromMessage("operator_gate_bogus: x"), null, "unknown suffix is not a code");
  assert.equal(gateCodeFromMessage("Process exited with code 1"), null);
  assert.equal(gateCodeFromMessage(null), null);
  assert.equal(gateCodeFromMessage(undefined), null);
});

test("every action names the front-end arm command and the 5-minute window", () => {
  for (const code of [
    "operator_gate_not_armed",
    "operator_gate_expired",
    "operator_gate_token_mismatch",
    "operator_gate_denied",
  ] as const) {
    const action = gateDenialAction(code);
    assert.match(action, /operator-approved-gate arm openclaw/);
    assert.match(action, /5 minutes/);
    assert.match(action, /nothing was started or spent/);
  }
});
