"use strict";

// operator-approve-gate verifier — consumed by scripts/run-workflow.js when
// --operator-approve is set. Verifies a FRESH armed token minted by the
// `operator-approve-gate arm` ceremony (YubiKey PIN via pinentry + physical touch).
//
// Mirrors the cdp-pipe / gh-mcp YubiKey consent gates: the token is one-shot (unlinked
// on use), TTL 300s, 0600, and hash-verified against a nonce sealed to the YubiKey's
// OpenPGP key. On success the sealed nonce is rotated so a captured token value can never
// be replayed. Fail-closed: any missing/expired/mismatched token denies the approval.
//
// The gate CLI (setup/arm/disarm/status) lives outside the repo at
//   ~/Security Everything/openclaw-approve/bin/operator-approve-gate
// and shares state at ~/.local/state/openclaw-approve/ (override: OPENCLAW_APPROVE_GATE_DIR).
// Set OPENCLAW_APPROVE_GATE=0 to bypass the gate in tests/CI only.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const timeProviderModule = require("./time-provider.js");

const TTL_MS = 300 * 1000;

function stateDir() {
  return process.env.OPENCLAW_APPROVE_GATE_DIR
    || path.join(os.homedir(), ".local", "state", "openclaw-approve");
}

function gpgBin() {
  const candidate = process.env.OPENCLAW_APPROVE_GPG || "/opt/homebrew/bin/gpg";
  try { fs.accessSync(candidate, fs.constants.X_OK); return candidate; } catch { return "gpg"; }
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

// Re-seal a fresh nonce to the YubiKey ENC key so the just-consumed token value can never
// be replayed (mirrors cdp-pipe's server-side nonce rotation). Encrypt-only — no touch.
function rotateNonce(dir, recipient) {
  try {
    const nonce = crypto.randomBytes(32).toString("hex");
    const tmp = path.join(dir, "nonce.gpg.tmp");
    execFileSync(gpgBin(), [
      "--batch", "--yes", "--trust-model", "always",
      "-r", `${recipient}!`, "-e", "-o", tmp
    ], { input: nonce });
    fs.renameSync(tmp, path.join(dir, "nonce.gpg"));
    fs.writeFileSync(path.join(dir, "nonce.sha256"), sha256(nonce), { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

// Returns { ok: true } if a valid fresh token was consumed; { ok: false, reason } otherwise.
function verifyAndConsumeOperatorApproval(logger) {
  const log = logger && typeof logger.info === "function" ? logger : { info() {}, warn() {} };

  // Test/CI bypass — explicit opt-out only (default is fail-closed / gate enforced).
  if (process.env.OPENCLAW_APPROVE_GATE === "0") {
    log.warn({ event: "operator_approve_gate_bypassed", reason: "OPENCLAW_APPROVE_GATE=0" });
    return { ok: true, bypassed: true };
  }

  const dir = stateDir();
  const armed = path.join(dir, ".armed");
  const shaFile = path.join(dir, "nonce.sha256");
  const recipientFile = path.join(dir, "recipient");

  if (!fs.existsSync(shaFile)) {
    return { ok: false, reason: "gate not set up — run: operator-approve-gate setup" };
  }

  let stat;
  try { stat = fs.statSync(armed); }
  catch { return { ok: false, reason: "not armed — run: operator-approve-gate arm (YubiKey PIN + touch)" }; }

  const ageMs = timeProviderModule.nowMs() - stat.mtimeMs;
  if (ageMs > TTL_MS) {
    try { fs.unlinkSync(armed); } catch { /* best effort */ }
    return { ok: false, reason: `armed token expired (${Math.round(ageMs / 1000)}s > 300s) — re-run: operator-approve-gate arm` };
  }

  let token, expected;
  try {
    token = fs.readFileSync(armed, "utf8");
    expected = fs.readFileSync(shaFile, "utf8").trim();
  } catch {
    return { ok: false, reason: "could not read armed token" };
  }

  // Consume one-shot: unlink BEFORE returning either way.
  try { fs.unlinkSync(armed); } catch { /* best effort */ }

  if (sha256(token) !== expected) {
    return { ok: false, reason: "armed token does not match sealed nonce (tampered/stale) — re-run: operator-approve-gate arm" };
  }

  let recipient = "";
  try { recipient = fs.readFileSync(recipientFile, "utf8").trim(); } catch { /* leave empty */ }
  const rotated = recipient ? rotateNonce(dir, recipient) : false;
  log.info({ event: "operator_approve_gate_consumed", rotated });
  return { ok: true, bypassed: false };
}

module.exports = { verifyAndConsumeOperatorApproval };
