"use strict";

// Shared operator-authorization preamble for EVERY CLI that can reach a real model.
//
// Why this exists: verifyAndConsumeOperatorApproval used to be called from exactly one file
// (run-workflow.js), so the YubiKey ceremony was a property of one script rather than of the
// engine. run-research-task.js legacy mode reached agent-engine.executeTask() without ever
// entering role-router.dispatch(), which meant --confirm alone performed real research on
// claude-code. This module is the single implementation of the gate so a new CLI cannot
// silently be born ungated.
//
// The posture it enforces: nothing that spends real model capacity starts until the operator
// has authorized THIS run with a physical ceremony (PIN + touch, 300s TTL, one-shot).
// A `mock` run is exempt because mock cannot spend anything — that keeps CI and the test
// suite usable without weakening any real lane.
//
// Fail-closed: an unreadable or unrecognized provider is treated as REAL, never as mock.

const fs = require("node:fs");
const path = require("node:path");

const { verifyAndConsumeOperatorApproval } = require("../openclaw-bridge/core/operator-approve-gate.js");

const MOCK_PROVIDER = "mock";

function safeStr(value) {
  return typeof value === "string" ? value.trim() : "";
}

// Does config/role-provider-map.json route any role to a non-mock backend?
//
// This exists because an explicit --provider is NOT authoritative on a role-routed lane.
// role-provider-router.resolveRoute precedence is:
//   roleEntry.provider || ctx.provider || map.default.provider || "claude-code"
// so a role pinned in the map (scout/analyst/synthesizer are all pinned to claude-code)
// OVERRIDES the CLI flag. Trusting --provider mock on a mission would have exempted the
// ceremony while the router still spent real capacity. Fail-closed: unreadable map => real.
function roleMapReachesRealProvider(rootDir) {
  let map;
  try {
    map = JSON.parse(fs.readFileSync(path.join(rootDir, "config", "role-provider-map.json"), "utf8"));
  } catch {
    return true;
  }
  const providers = [safeStr(map && map.default && map.default.provider)];
  for (const entry of Object.values((map && map.roles) || {})) {
    providers.push(safeStr(entry && entry.provider));
  }
  // A missing/blank provider falls through resolveRoute to the "claude-code" literal.
  return providers.some((name) => name.toLowerCase() !== MOCK_PROVIDER);
}

// What provider will this run ACTUALLY use? An explicit --provider wins ONLY on a lane that is
// not role-routed; otherwise the role map decides. Anything unreadable resolves to "unknown",
// which is gated.
function resolveEffectiveProvider(rootDir, explicitProvider, roleRouted) {
  if (roleRouted === true && roleMapReachesRealProvider(rootDir)) {
    return "role-routed";
  }
  const explicit = safeStr(explicitProvider);
  if (explicit) {
    return explicit.toLowerCase();
  }
  try {
    const raw = fs.readFileSync(path.join(rootDir, "config", "agent-config.json"), "utf8");
    return safeStr(JSON.parse(raw).defaultProvider).toLowerCase() || "unknown";
  } catch {
    return "unknown";
  }
}

// Returns { ok, required, provider, reason, bypassed }.
// Never throws and never exits — the caller owns the exit path so each CLI keeps its own
// rejection-logging style. The approval token is one-shot, so call this AT MOST ONCE per
// process, and only immediately before the work it authorizes.
function enforceOperatorGate(options = {}) {
  const rootDir = safeStr(options.rootDir) || process.cwd();
  // roleRouted: true for any lane that dispatches through role-router (mission / resume), where
  // config/role-provider-map.json overrides the CLI --provider.
  const provider = resolveEffectiveProvider(rootDir, options.provider, options.roleRouted);

  if (provider === MOCK_PROVIDER) {
    // ceremonyVerified stays FALSE here: nothing was proven about the operator, we merely
    // established that this run cannot spend anything. Callers must never treat this as approval.
    return { ok: true, required: false, ceremonyVerified: false, provider, reason: "", bypassed: false };
  }

  if (options.operatorApprove !== true) {
    return {
      ok: false,
      required: true,
      ceremonyVerified: false,
      provider,
      reason: `provider '${provider}' spends real model capacity — pass --operator-approve `
        + "(arm it first: operator-approve-gate arm, which needs the YubiKey PIN + touch)",
      bypassed: false
    };
  }

  const gate = verifyAndConsumeOperatorApproval(options.logger);
  if (!gate.ok) {
    return { ok: false, required: true, ceremonyVerified: false, provider, reason: gate.reason, bypassed: false };
  }
  // ceremonyVerified is the ONLY value a caller may thread downstream as `operatorApproved`.
  // Forwarding the raw --operator-approve flag instead would let the router's
  // PHASE15_HUMAN_APPROVAL_REQUIRED be satisfied by a value nothing verified, collapsing two
  // independent layers into one.
  return { ok: true, required: true, ceremonyVerified: true, provider, reason: "", bypassed: gate.bypassed === true };
}

module.exports = { enforceOperatorGate, resolveEffectiveProvider, MOCK_PROVIDER };
