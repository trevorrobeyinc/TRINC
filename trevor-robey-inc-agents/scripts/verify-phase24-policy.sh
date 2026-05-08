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
  if [[ "${PHASE24_POLICY_FORCE_NO_RG:-0}" == "1" ]]; then
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
    rg -n --glob '*.js' --glob '*.sh' -- "$pattern" "$@" || true
    return
  fi
  grep -R -nE --include='*.js' --include='*.sh' -- "$pattern" "$@" || true
}

REQUIRED_FILES=(
  "$ROOT/README.md"
  "$ROOT/ARCHITECTURAL_BLUEPRINT.md"
  "$ROOT/docs/attack-surface.md"
  "$ROOT/docs/supervisor-architecture.md"
  "$ROOT/docs/phase24-operator-sync-and-briefing.md"
  "$ROOT/openclaw-bridge/mutation/phase24-operator-briefing.js"
  "$ROOT/openclaw-bridge/mcp/newsletter-mcp.js"
  "$ROOT/openclaw-bridge/mcp/notion-mcp.js"
  "$ROOT/openclaw-bridge/mcp/mcp-service.js"
  "$ROOT/openclaw-bridge/mcp/newsletter-publisher-mcp/contract.json"
  "$ROOT/openclaw-bridge/mcp/notion-sync-mcp/contract.json"
  "$ROOT/openclaw-bridge/execution/egress-policy.js"
  "$ROOT/openclaw-bridge/docs/mcp-contracts-phase1.md"
  "$ROOT/scripts/verify-phase24-policy.sh"
  "$ROOT/scripts/build-verify.sh"
  "$ROOT/package.json"
  "$ROOT/.github/workflows/ci-enforcement.yml"
  "$ROOT/future openclaw research agents phases to be implemented."
  "$ROOT/audit/evidence/phase24/.gitkeep"
)

for file in "${REQUIRED_FILES[@]}"; do
  [[ -f "$file" ]] || fail "Missing Phase 24 file: $file"
done

PHASE24_SCAN_TARGETS=(
  "$ROOT/openclaw-bridge/mutation/phase24-operator-briefing.js"
  "$ROOT/openclaw-bridge/mcp/newsletter-mcp.js"
  "$ROOT/openclaw-bridge/mcp/notion-mcp.js"
)

UNSAFE_AUTOMATION="$(search_lines 'fetch\(|axios|http\.request\(|https\.request\(|node:http|node:https|WebSocket|browser\.launch|playwright|puppeteer|selenium|setInterval\(' "${PHASE24_SCAN_TARGETS[@]}")"
if [[ -n "$UNSAFE_AUTOMATION" ]]; then
  echo "$UNSAFE_AUTOMATION" >&2
  fail "Phase 24 modules must remain free of network/browser/login/background-sync automation logic"
fi

SESSION_OR_CREDENTIAL_EXPANSION="$(search_lines 'createCredentialBroker|credentialBroker|issueSession' "${PHASE24_SCAN_TARGETS[@]}")"
if [[ -n "$SESSION_OR_CREDENTIAL_EXPANSION" ]]; then
  echo "$SESSION_OR_CREDENTIAL_EXPANSION" >&2
  fail "Phase 24 must not introduce credential or session broker logic"
fi

search_quiet 'phase24-operator-request-snapshot-v1' "$ROOT/openclaw-bridge/mutation/phase24-operator-briefing.js" || fail "Phase 24 request snapshot schema marker missing"
search_quiet 'phase24-operator-sanitized-payload-v1' "$ROOT/openclaw-bridge/mutation/phase24-operator-briefing.js" || fail "Phase 24 sanitized payload schema marker missing"
search_quiet 'phase24-operator-briefing-manifest-v1' "$ROOT/openclaw-bridge/mutation/phase24-operator-briefing.js" || fail "Phase 24 hash manifest schema marker missing"
search_quiet 'operatorBriefing' "$ROOT/openclaw-bridge/mcp/newsletter-mcp.js" || fail "Newsletter MCP must return operatorBriefing references"
search_quiet 'operatorBriefing' "$ROOT/openclaw-bridge/mcp/notion-mcp.js" || fail "Notion MCP must return operatorBriefing references"
search_quiet 'assertOperatorContext' "$ROOT/openclaw-bridge/mcp/newsletter-mcp.js" || fail "Newsletter MCP must enforce operator role"
search_quiet 'assertOperatorContext' "$ROOT/openclaw-bridge/mcp/notion-mcp.js" || fail "Notion MCP must enforce operator role"
search_quiet 'provider is stub-only in research methods' "$ROOT/openclaw-bridge/mcp/mcp-service.js" || fail "Research methods must keep newsletter/notion disabled"
search_quiet 'prepare_publish' "$ROOT/openclaw-bridge/mcp/newsletter-publisher-mcp/contract.json" || fail "Newsletter contract must expose prepare_publish"
search_quiet 'commit_publish' "$ROOT/openclaw-bridge/mcp/newsletter-publisher-mcp/contract.json" || fail "Newsletter contract must expose commit_publish"
search_quiet 'retry_publish' "$ROOT/openclaw-bridge/mcp/newsletter-publisher-mcp/contract.json" || fail "Newsletter contract must expose retry_publish"
search_quiet 'reconcile_publish' "$ROOT/openclaw-bridge/mcp/newsletter-publisher-mcp/contract.json" || fail "Newsletter contract must expose reconcile_publish"
search_quiet 'prepare_publish' "$ROOT/openclaw-bridge/mcp/notion-sync-mcp/contract.json" || fail "Notion contract must expose prepare_publish"
search_quiet 'commit_publish' "$ROOT/openclaw-bridge/mcp/notion-sync-mcp/contract.json" || fail "Notion contract must expose commit_publish"
search_quiet 'retry_publish' "$ROOT/openclaw-bridge/mcp/notion-sync-mcp/contract.json" || fail "Notion contract must expose retry_publish"
search_quiet 'reconcile_publish' "$ROOT/openclaw-bridge/mcp/notion-sync-mcp/contract.json" || fail "Notion contract must expose reconcile_publish"
search_quiet 'verify-phase24-policy\.sh' "$ROOT/scripts/build-verify.sh" || fail "build-verify.sh must include verify-phase24-policy.sh"
search_quiet 'npm run phase24:verify' "$ROOT/.github/workflows/ci-enforcement.yml" || fail "CI must run npm run phase24:verify"
search_quiet 'Phase 24' "$ROOT/README.md" || fail "README must document Phase 24 boundary"
search_quiet 'Phase 24' "$ROOT/docs/attack-surface.md" || fail "attack-surface doc must document Phase 24 boundary"
search_quiet 'Phase 24' "$ROOT/docs/supervisor-architecture.md" || fail "supervisor architecture doc must document Phase 24 boundary"
search_quiet 'Phase 24' "$ROOT/ARCHITECTURAL_BLUEPRINT.md" || fail "architectural blueprint must document Phase 24 boundary"

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
const futureRoadmap = readText("future openclaw research agents phases to be implemented.");
const newsletterContract = readJson("openclaw-bridge/mcp/newsletter-publisher-mcp/contract.json");
const notionContract = readJson("openclaw-bridge/mcp/notion-sync-mcp/contract.json");
const egressPolicy = require(path.join(root, "openclaw-bridge", "execution", "egress-policy.js"));

if (!packageJson.scripts || !packageJson.scripts["phase24:verify"]) {
  fail("package.json must define phase24:verify");
}
for (const scriptName of ["phase2:gates"]) {
  const body = String(packageJson.scripts[scriptName] || "");
  if (!body.includes("verify-phase24-policy.sh")) {
    fail(`${scriptName} must execute verify-phase24-policy.sh`);
  }
}
if (!String(packageJson.scripts["phase24:verify"]).includes("verify-phase24-policy.sh")) {
  fail("phase24:verify must execute verify-phase24-policy.sh");
}
if (!/## Phase 24: Operator Sync and Briefing MCP Activation/.test(futureRoadmap)) {
  fail("future roadmap must continue listing Phase 24 until it is merged");
}
if (/Phase 24 is now implemented/.test(futureRoadmap)) {
  fail("future roadmap must not claim Phase 24 is implemented before merge");
}

for (const [contractName, contract, expectedPrepareScope] of [
  ["newsletter", newsletterContract, "mutation.newsletter.prepare"],
  ["notion", notionContract, "mutation.notion.prepare"]
]) {
  if (contract.phase !== 24) {
    fail(`${contractName} contract phase must be 24`);
  }
  if (contract.status !== "operator_gated") {
    fail(`${contractName} contract status must be operator_gated`);
  }
  const toolNames = (Array.isArray(contract.tools) ? contract.tools : []).map((entry) =>
    typeof entry === "string" ? entry : String(entry && entry.name || "")
  );
  for (const required of ["prepare_publish", "commit_publish", "retry_publish", "reconcile_publish"]) {
    if (!toolNames.includes(required)) {
      fail(`${contractName} contract missing tool ${required}`);
    }
  }
  const scopes = Array.isArray(contract.behavior && contract.behavior.approvalScopes)
    ? contract.behavior.approvalScopes
    : [];
  for (const scope of [expectedPrepareScope, "mutation.commit", "mutation.reconcile"]) {
    if (!scopes.includes(scope)) {
      fail(`${contractName} contract missing approval scope ${scope}`);
    }
  }
}

function expectPinnedPolicy(slug, host, methods, label) {
  const policy = egressPolicy.TOOL_EGRESS_POLICIES && egressPolicy.TOOL_EGRESS_POLICIES[slug];
  if (!policy) {
    fail(`${label} egress policy missing`);
  }
  const allowedHosts = Array.isArray(policy.allowedHosts) ? policy.allowedHosts : [];
  if (allowedHosts.length !== 1 || allowedHosts[0] !== host) {
    fail(`${label} egress policy must remain pinned to ${host}`);
  }
  const methodsByHost = policy.allowedMethodsByHost && policy.allowedMethodsByHost[host];
  const actualMethods = Array.isArray(methodsByHost) ? [...methodsByHost].sort() : [];
  const expectedMethods = [...methods].sort();
  if (JSON.stringify(actualMethods) !== JSON.stringify(expectedMethods)) {
    fail(`${label} egress methods must remain ${expectedMethods.join(",")}`);
  }
}

expectPinnedPolicy("newsletter-publisher-mcp", "api.beehiiv.com", ["PATCH", "POST"], "newsletter");
expectPinnedPolicy("notion-sync-mcp", "api.notion.com", ["PATCH", "POST"], "notion");
NODE

echo "Phase 24 operator sync and briefing policy verification passed"
