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
  if [[ "${PHASE23_POLICY_FORCE_NO_RG:-0}" == "1" ]]; then
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
  "$ROOT/docs/phase23-portfolio-intelligence.md"
  "$ROOT/analytics/portfolio-intelligence/phase23-evidence-aggregator.js"
  "$ROOT/analytics/portfolio-intelligence/phase23-commercialization-decision-engine.js"
  "$ROOT/analytics/portfolio-intelligence/phase23-report-builder.js"
  "$ROOT/scripts/generate-phase23-report.js"
  "$ROOT/scripts/verify-phase23-policy.sh"
  "$ROOT/scripts/build-verify.sh"
  "$ROOT/package.json"
  "$ROOT/.github/workflows/ci-enforcement.yml"
  "$ROOT/future openclaw research agents phases to be implemented."
)

for file in "${REQUIRED_FILES[@]}"; do
  [[ -f "$file" ]] || fail "Missing Phase 23 file: $file"
done

PHASE23_SCAN_TARGETS=(
  "$ROOT/analytics/portfolio-intelligence/phase23-evidence-aggregator.js"
  "$ROOT/analytics/portfolio-intelligence/phase23-commercialization-decision-engine.js"
  "$ROOT/analytics/portfolio-intelligence/phase23-report-builder.js"
  "$ROOT/scripts/generate-phase23-report.js"
)

UNSAFE_NETWORK="$(search_lines 'fetch\(|axios|http\.request\(|https\.request\(|node:http|node:https|WebSocket|browser\.launch|playwright|puppeteer|selenium|login automation|credential automation' "${PHASE23_SCAN_TARGETS[@]}")"
if [[ -n "$UNSAFE_NETWORK" ]]; then
  echo "$UNSAFE_NETWORK" >&2
  fail "Phase 23 modules must remain free of network/browser/login automation logic"
fi

RESTRICTED_GLOBALS="$(search_lines 'Date\.now\(|new Date\(|Math\.random\(|randomUUID\(' "${PHASE23_SCAN_TARGETS[@]}")"
if [[ -n "$RESTRICTED_GLOBALS" ]]; then
  echo "$RESTRICTED_GLOBALS" >&2
  fail "Determinism violation: restricted globals found in Phase 23 modules"
fi

search_quiet 'phase23-portfolio-evidence-snapshot-v1' "$ROOT/analytics/portfolio-intelligence/phase23-evidence-aggregator.js" || fail "Phase 23 evidence snapshot schema marker missing"
search_quiet 'phase23-commercialization-decision-report-v1' "$ROOT/analytics/portfolio-intelligence/phase23-commercialization-decision-engine.js" || fail "Phase 23 commercialization decision schema marker missing"
search_quiet 'phase23-portfolio-summary-v1' "$ROOT/analytics/portfolio-intelligence/phase23-report-builder.js" || fail "Phase 23 summary schema marker missing"
search_quiet 'submission-evidence-index\.json' "$ROOT/analytics/portfolio-intelligence/phase23-evidence-aggregator.js" || fail "Phase 23 aggregator must consume submission-evidence-index.json"
search_quiet 'delivery-evidence-index\.json' "$ROOT/analytics/portfolio-intelligence/phase23-evidence-aggregator.js" || fail "Phase 23 aggregator must consume delivery-evidence-index.json"
search_quiet 'validateApprovedRelease' "$ROOT/analytics/portfolio-intelligence/phase23-evidence-aggregator.js" || fail "Phase 23 aggregator must validate approved releases"
search_quiet 'rankCommercializationDecisions' "$ROOT/analytics/portfolio-intelligence/phase23-report-builder.js" || fail "Phase 23 report builder must rank commercialization decisions"
search_quiet 'generate-phase23-report\.js' "$ROOT/package.json" || fail "package.json must wire generate-phase23-report.js"
search_quiet 'verify-phase23-policy\.sh' "$ROOT/scripts/build-verify.sh" || fail "build-verify.sh must include verify-phase23-policy.sh"
search_quiet 'npm run phase23:verify' "$ROOT/.github/workflows/ci-enforcement.yml" || fail "CI must run npm run phase23:verify"
search_quiet 'Phase 23' "$ROOT/README.md" || fail "README must document Phase 23"
search_quiet 'Phase 23' "$ROOT/docs/attack-surface.md" || fail "attack-surface doc must document Phase 23"
search_quiet 'Phase 23' "$ROOT/docs/supervisor-architecture.md" || fail "supervisor architecture doc must document Phase 23"

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

if (!packageJson.scripts || !packageJson.scripts["phase23:verify"]) {
  fail("package.json must define phase23:verify");
}
for (const scriptName of ["phase2:gates"]) {
  const body = String(packageJson.scripts[scriptName] || "");
  if (!body.includes("verify-phase23-policy.sh")) {
    fail(`${scriptName} must execute verify-phase23-policy.sh`);
  }
}
if (!String(packageJson.scripts["phase23:verify"]).includes("verify-phase23-policy.sh")) {
  fail("phase23:verify must execute verify-phase23-policy.sh");
}
if (/## Phase 23:/.test(futureRoadmap)) {
  fail("future roadmap must no longer list Phase 23 as unresolved");
}
if (!/Phase 23 is now implemented/.test(futureRoadmap)) {
  fail("future roadmap must record that Phase 23 is implemented");
}
NODE

echo "Phase 23 portfolio intelligence policy verification passed"
