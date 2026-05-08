#!/usr/bin/env bash
set -euo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SELF_DIR}/.." && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)
      [[ $# -ge 2 ]] || { echo "ERROR: --root requires a path argument" >&2; exit 1; }
      ROOT="$(cd "$2" && pwd)"
      shift 2
      ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

fail() {
  echo "$1" >&2
  exit 1
}

has_rg() {
  if [[ "${PHASE25_POLICY_FORCE_NO_RG:-0}" == "1" ]]; then
    return 1
  fi
  command -v rg >/dev/null 2>&1
}

search_quiet() {
  local pattern="$1"
  local file_path="$2"
  if has_rg; then
    rg -q -- "$pattern" "$file_path"
    return
  fi
  grep -Eq -- "$pattern" "$file_path"
}

search_lines() {
  local pattern="$1"
  shift
  if has_rg; then
    rg -n --glob '*.js' --glob '*.md' --glob '*.sh' -- "$pattern" "$@" || true
    return
  fi
  grep -R -nE --include='*.js' --include='*.md' --include='*.sh' -- "$pattern" "$@" || true
}

REQUIRED_FILES=(
  "$ROOT/README.md"
  "$ROOT/ARCHITECTURAL_BLUEPRINT.md"
  "$ROOT/docs/attack-surface.md"
  "$ROOT/docs/supervisor-architecture.md"
  "$ROOT/docs/phase25-credential-broker-and-session-governance.md"
  "$ROOT/openclaw-bridge/security/credential-broker.js"
  "$ROOT/openclaw-bridge/security/credential-broker-boundary.md"
  "$ROOT/openclaw-bridge/security/credential-broker-threat-model.md"
  "$ROOT/scripts/verify-phase25-policy.sh"
  "$ROOT/scripts/build-verify.sh"
  "$ROOT/package.json"
  "$ROOT/.github/workflows/ci-enforcement.yml"
  "$ROOT/security/scope-registry.json"
  "$ROOT/tests/security/phase25-credential-broker.test.js"
  "$ROOT/tests/security/phase25-policy-gate.test.js"
  "$ROOT/future openclaw research agents phases to be implemented."
  "$ROOT/audit/evidence/phase25/.gitkeep"
)

for file in "${REQUIRED_FILES[@]}"; do
  [[ -f "$file" ]] || fail "Missing Phase 25 file: $file"
done

PHASE25_SCAN_TARGETS=(
  "$ROOT/openclaw-bridge/security/credential-broker.js"
)

UNSAFE_PHASE25="$(search_lines 'require\(["'"'"']node:fs|fs\.|fetch\(|axios|http\.request\(|https\.request\(|node:http|node:https|browser\.launch|playwright|puppeteer|selenium|child_process|spawn\(' "${PHASE25_SCAN_TARGETS[@]}")"
if [[ -n "$UNSAFE_PHASE25" ]]; then
  echo "$UNSAFE_PHASE25" >&2
  fail "Phase 25 broker modules must remain free of filesystem persistence, network, browser, or subprocess automation logic"
fi

BROKER="$ROOT/openclaw-bridge/security/credential-broker.js"
GUIDE="$ROOT/docs/phase25-credential-broker-and-session-governance.md"
BOUNDARY="$ROOT/openclaw-bridge/security/credential-broker-boundary.md"
THREAT="$ROOT/openclaw-bridge/security/credential-broker-threat-model.md"

search_quiet 'issueGovernedHandle' "$BROKER" || fail "Credential broker must implement issueGovernedHandle"
search_quiet 'issueDelegatedSession' "$BROKER" || fail "Credential broker must implement issueDelegatedSession"
search_quiet 'validateDelegatedSession' "$BROKER" || fail "Credential broker must implement validateDelegatedSession"
search_quiet 'resolveDelegatedSession' "$BROKER" || fail "Credential broker must implement resolveDelegatedSession"
search_quiet 'governance\.credential\.handle\.issue' "$BROKER" || fail "Credential broker must enforce governance.credential.handle.issue"
search_quiet 'governance\.connector\.session\.issue' "$BROKER" || fail "Credential broker must enforce governance.connector.session.issue"
search_quiet 'BROKER_SESSION_APPROVAL_INVALID' "$BROKER" || fail "Credential broker must fail closed when delegated-session approval becomes invalid"

search_quiet 'governance\.credential\.handle\.issue' "$GUIDE" || fail "Phase 25 guide must document governance.credential.handle.issue"
search_quiet 'governance\.connector\.session\.issue' "$GUIDE" || fail "Phase 25 guide must document governance.connector.session.issue"
search_quiet 'No external KMS or remote secret manager' "$GUIDE" || fail "Phase 25 guide must document the secret-manager non-goal"
search_quiet 'in memory only' "$BOUNDARY" || fail "Credential broker boundary doc must document in-memory only secret handling"
search_quiet 'approval-token validity' "$THREAT" || fail "Credential broker threat model must document approval-token validity checks"
search_quiet 'Phase 25 keeps credential handles local-only and in-memory' "$ROOT/README.md" || fail "README must document the Phase 25 credential boundary"
search_quiet 'Phase 25 credential broker and delegated session surface' "$ROOT/docs/attack-surface.md" || fail "attack-surface doc must document Phase 25 surface"
search_quiet 'Phase 25 Credential Broker And Delegated Session Gate' "$ROOT/docs/supervisor-architecture.md" || fail "supervisor architecture doc must document Phase 25 gate"
search_quiet 'Phase 25 Credential Broker and Delegated Session Governance' "$ROOT/ARCHITECTURAL_BLUEPRINT.md" || fail "architectural blueprint must document Phase 25"
search_quiet 'verify-phase25-policy\.sh' "$ROOT/scripts/build-verify.sh" || fail "build-verify.sh must include verify-phase25-policy.sh"
search_quiet 'npm run phase25:verify' "$ROOT/.github/workflows/ci-enforcement.yml" || fail "CI must run npm run phase25:verify"

ROOT_DIR="$ROOT" node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const root = process.env.ROOT_DIR;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
}

function readText(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const packageJson = readJson("package.json");
const scopeRegistry = readJson("security/scope-registry.json");
const futureRoadmap = readText("future openclaw research agents phases to be implemented.");

if (!packageJson.scripts || !packageJson.scripts["phase25:verify"]) {
  fail("package.json must define phase25:verify");
}
if (!String(packageJson.scripts["phase25:verify"]).includes("verify-phase25-policy.sh")) {
  fail("phase25:verify must execute verify-phase25-policy.sh");
}
for (const scriptName of ["phase2:gates"]) {
  const body = String(packageJson.scripts[scriptName] || "");
  if (!body.includes("verify-phase25-policy.sh")) {
    fail(`${scriptName} must execute verify-phase25-policy.sh`);
  }
}
for (const testName of [
  "tests/security/phase25-credential-broker.test.js",
  "tests/security/phase25-policy-gate.test.js"
]) {
  if (!String(packageJson.scripts["phase25:verify"]).includes(testName)) {
    fail(`phase25:verify must execute ${testName}`);
  }
}

const scopes = Array.isArray(scopeRegistry.scopes) ? scopeRegistry.scopes : [];
for (const [scopeId, resource] of [
  ["governance.credential.handle.issue", "phase25.credential"],
  ["governance.connector.session.issue", "phase25.session"]
]) {
  const entry = scopes.find((item) => item && item.scope_id === scopeId);
  if (!entry) {
    fail(`scope registry must define ${scopeId}`);
  }
  if (entry.phase !== "phase25") {
    fail(`${scopeId} must be tagged as phase25`);
  }
  if (entry.required_role !== "operator_admin") {
    fail(`${scopeId} must require operator_admin`);
  }
  if (entry.resource !== resource) {
    fail(`${scopeId} must target ${resource}`);
  }
}

if (!/## Phase 25: Credential Broker and Delegated Session Governance/.test(futureRoadmap)) {
  fail("future roadmap must continue listing Phase 25 until it is merged");
}
if (/Phase 25 is now implemented/.test(futureRoadmap)) {
  fail("future roadmap must not claim Phase 25 is implemented before merge");
}
NODE

echo "Phase 25 credential broker policy verification passed"
