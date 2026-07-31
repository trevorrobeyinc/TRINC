"use strict";

// Unit tests for scripts/_operator-gate-cli.js — the single chokepoint that decides whether a CLI
// run needs the YubiKey ceremony. It had zero coverage when it was introduced, which is exactly
// how a chokepoint gets quietly weakened.
//
// These tests never arm, consume, or touch the real gate state: every case here either resolves to
// the mock exemption (returns before the ceremony) or fails on the missing --operator-approve flag
// (also returns before the ceremony). No case reaches verifyAndConsumeOperatorApproval.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  enforceOperatorGate,
  resolveEffectiveProvider,
  MOCK_PROVIDER
} = require("../../scripts/_operator-gate-cli.js");

// A fixture root with a chosen defaultProvider and a chosen role-provider-map.
function makeRoot(defaultProvider, roleMap) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opgate-cli-"));
  fs.mkdirSync(path.join(root, "config"), { recursive: true });
  if (defaultProvider !== null) {
    fs.writeFileSync(
      path.join(root, "config", "agent-config.json"),
      JSON.stringify({ defaultProvider })
    );
  }
  if (roleMap !== null) {
    fs.writeFileSync(
      path.join(root, "config", "role-provider-map.json"),
      JSON.stringify(roleMap)
    );
  }
  return root;
}

const ALL_MOCK_MAP = { default: { provider: "mock" }, roles: { scout: { provider: "mock" } } };
const REAL_MAP = { default: { provider: "claude-code" }, roles: { scout: { provider: "claude-code" } } };

test("mock provider is exempt but is NOT an approval", () => {
  const root = makeRoot("claude-code", REAL_MAP);
  const gate = enforceOperatorGate({ rootDir: root, provider: "mock", operatorApprove: false });
  assert.equal(gate.ok, true);
  assert.equal(gate.required, false);
  // The important half: an exempt run must never look like a verified operator.
  assert.equal(gate.ceremonyVerified, false);
});

test("a real provider without --operator-approve is refused before the ceremony", () => {
  const root = makeRoot("claude-code", REAL_MAP);
  const gate = enforceOperatorGate({ rootDir: root, provider: "claude-code", operatorApprove: false });
  assert.equal(gate.ok, false);
  assert.equal(gate.required, true);
  assert.equal(gate.ceremonyVerified, false);
  assert.match(gate.reason, /--operator-approve/);
});

test("the default provider is used when no explicit provider is given", () => {
  assert.equal(resolveEffectiveProvider(makeRoot("mock", REAL_MAP), "", false), MOCK_PROVIDER);
  assert.equal(resolveEffectiveProvider(makeRoot("claude-code", REAL_MAP), "", false), "claude-code");
});

test("roleRouted ignores an explicit mock provider when the role map reaches a real backend", () => {
  // The trap this guards: role-provider-router precedence is roleEntry.provider || ctx.provider,
  // so the role map OVERRIDES --provider. Trusting the flag on a mission lane would exempt the
  // ceremony while the router still spent real capacity.
  const root = makeRoot("mock", REAL_MAP);
  assert.equal(resolveEffectiveProvider(root, "mock", true), "role-routed");
  const gate = enforceOperatorGate({ rootDir: root, provider: "mock", roleRouted: true, operatorApprove: false });
  assert.equal(gate.ok, false, "a role-routed lane must be gated even when --provider mock is passed");
  assert.equal(gate.required, true);
});

test("roleRouted honours mock only when the whole role map is mock", () => {
  const root = makeRoot("mock", ALL_MOCK_MAP);
  assert.equal(resolveEffectiveProvider(root, "mock", true), MOCK_PROVIDER);
});

test("an unreadable role map fails CLOSED on a role-routed lane", () => {
  const root = makeRoot("mock", null); // no role-provider-map.json at all
  assert.equal(resolveEffectiveProvider(root, "mock", true), "role-routed");
});

test("an unreadable agent-config fails CLOSED", () => {
  const root = makeRoot(null, REAL_MAP); // no agent-config.json
  assert.equal(resolveEffectiveProvider(root, "", false), "unknown");
  const gate = enforceOperatorGate({ rootDir: root, operatorApprove: false });
  assert.equal(gate.ok, false, "an unknown provider must be treated as real, never as mock");
});

test("mock detection is not fooled by lookalikes, casing, padding, or non-strings", () => {
  const root = makeRoot("claude-code", REAL_MAP);
  // Casing and padding SHOULD normalise to the exemption (same provider, typed loosely).
  for (const value of ["MOCK", "  mock  ", "Mock"]) {
    assert.equal(
      enforceOperatorGate({ rootDir: root, provider: value, operatorApprove: false }).required,
      false,
      `${JSON.stringify(value)} should normalise to the mock exemption`
    );
  }
  // Everything else must be gated.
  for (const value of ["mock-but-real", "mockery", "notmock", "claude-code", 123, null, undefined, {}, [], true]) {
    assert.equal(
      enforceOperatorGate({ rootDir: root, provider: value, operatorApprove: false }).ok,
      false,
      `${JSON.stringify(value)} must be gated, not exempted`
    );
  }
});

test("operatorApprove must be exactly true — truthy values do not count", () => {
  const root = makeRoot("claude-code", REAL_MAP);
  for (const value of ["true", 1, {}, [], "yes"]) {
    const gate = enforceOperatorGate({ rootDir: root, provider: "claude-code", operatorApprove: value });
    assert.equal(gate.ok, false, `${JSON.stringify(value)} must not satisfy the flag`);
  }
});
