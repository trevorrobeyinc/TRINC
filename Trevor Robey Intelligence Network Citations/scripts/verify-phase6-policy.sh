#!/usr/bin/env bash
set -euo pipefail

# --- ripgrep fallback (added 2026-07-27) -------------------------------------
# This script called `rg` directly with no fallback, unlike its ~28 sibling gates
# which degrade to grep via has_rg(). ripgrep is NOT installed here — on this machine
# `rg` resolves only to an interactive shell function, so under npm/CI it is simply
# "command not found". Every forbidden-pattern scan below is written as
# `HITS="$(rg ... || true)"`, so a missing rg made HITS empty and the gate concluded
# CLEAN: the network, autonomy and restricted-globals scans were FAILING OPEN.
# This shim keeps the call sites unchanged and degrades to grep when rg is absent.
# Set POLICY_FORCE_NO_RG=1 to exercise the fallback path deliberately.
if ! command -v rg >/dev/null 2>&1 || [[ "${POLICY_FORCE_NO_RG:-0}" == "1" ]]; then
  rg() {
    local pattern="" quiet=0 icase=0 include=() files=()
    while [[ $# -gt 0 ]]; do
      case "$1" in
        -q)        quiet=1; shift ;;
        -qi|-iq)   quiet=1; icase=1; shift ;;
        -i)        icase=1; shift ;;
        -n|--pcre2|-N) shift ;;
        --glob)    include+=("--include=$2"); shift 2 ;;
        --glob=*)  include+=("--include=${1#--glob=}"); shift ;;
        --)        shift ;;
        -*)        shift ;;
        *)         if [[ -z "$pattern" ]]; then pattern="$1"; else files+=("$1"); fi; shift ;;
      esac
    done
    local flags=(-R -n -E)
    [[ $icase -eq 1 ]] && flags+=(-i)
    [[ $quiet -eq 1 ]] && flags+=(-q)
    grep "${flags[@]}" ${include[@]+"${include[@]}"} \
      --exclude-dir=node_modules --exclude-dir=.git \
      -- "$pattern" ${files[@]+"${files[@]}"}
  }
fi
# --- end ripgrep fallback ----------------------------------------------------

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTCOME_DIR="$ROOT/workflows/rlhf-outcomes"
QUALITY_DIR="$ROOT/analytics/rlhf-quality"
PORTFOLIO_DIR="$ROOT/analytics/portfolio-intelligence"
TEMPLATE_FILE="$ROOT/workflows/rlhf-generator/template-performance.js"
OUTCOME_CAPTURE_FILE="$OUTCOME_DIR/outcome-capture.js"
CALIBRATION_FILE="$QUALITY_DIR/calibration-engine.js"
EGRESS_FILE="$ROOT/openclaw-bridge/execution/egress-policy.js"

fail() {
  echo "$1" >&2
  exit 1
}

for path in \
  "$OUTCOME_DIR/outcome-schema.js" \
  "$OUTCOME_DIR/outcome-capture.js" \
  "$OUTCOME_DIR/outcome-validator.js" \
  "$QUALITY_DIR/quality-schema.js" \
  "$QUALITY_DIR/quality-signals.js" \
  "$QUALITY_DIR/quality-score-engine.js" \
  "$QUALITY_DIR/calibration-engine.js" \
  "$PORTFOLIO_DIR/domain-priority-engine.js" \
  "$PORTFOLIO_DIR/portfolio-planner.js" \
  "$PORTFOLIO_DIR/weekly-report-builder.js" \
  "$TEMPLATE_FILE"; do
  [[ -f "$path" ]] || fail "Missing Phase 6 module: $path"
done

SCAN_TARGETS=(
  "$OUTCOME_DIR"
  "$QUALITY_DIR"
  "$PORTFOLIO_DIR"
  "$TEMPLATE_FILE"
)

NETWORK_HITS="$(rg -n --glob '*.js' "fetch\(|axios|https\.request\(|http\.request\(|node:https|node:http|playwright|puppeteer|selenium|webdriver|browser\.launch" "${SCAN_TARGETS[@]}" || true)"
if [[ -n "$NETWORK_HITS" ]]; then
  echo "$NETWORK_HITS" >&2
  fail "Phase 6 modules must not include network/browser automation clients"
fi

HTTPS_LITERAL_HITS="$(rg -n --glob '*.js' "https?://" "${SCAN_TARGETS[@]}" || true)"
if [[ -n "$HTTPS_LITERAL_HITS" ]]; then
  echo "$HTTPS_LITERAL_HITS" >&2
  fail "Phase 6 modules must not contain hardcoded external endpoints"
fi

AUTONOMY_HITS="$(rg -n --pcre2 --glob '*.js' "\\b(autoSubmit|autonomousSubmit|submitToPlatform|loginAutomation|browserAutomation|credentialStore|storeCredentials|platformApiToken)\\b\\s*[(:=]" "${SCAN_TARGETS[@]}" || true)"
if [[ -n "$AUTONOMY_HITS" ]]; then
  echo "$AUTONOMY_HITS" >&2
  fail "Phase 6 modules must not include auto-submission/login automation logic"
fi

RESTRICTED_GLOBALS="$(rg -n "Date\.now\(|new Date\(|Math\.random\(|randomUUID\(" "${SCAN_TARGETS[@]}" || true)"
if [[ -n "$RESTRICTED_GLOBALS" ]]; then
  echo "$RESTRICTED_GLOBALS" >&2
  fail "Determinism violation: restricted globals found in Phase 6 modules"
fi

if ! rg -q "role === \"supervisor\"" "$OUTCOME_CAPTURE_FILE"; then
  fail "outcome-capture.js missing explicit supervisor mutation denial"
fi
if ! rg -q "RLHF_OUTCOME_ROLE_DENIED" "$OUTCOME_CAPTURE_FILE"; then
  fail "outcome-capture.js missing role-denied error path"
fi
if ! rg -q "RLHF_OUTCOME_KILL_SWITCH_ACTIVE" "$OUTCOME_CAPTURE_FILE"; then
  fail "outcome-capture.js missing kill-switch enforcement"
fi
if ! rg -q "RLHF_CALIBRATION_KILL_SWITCH_ACTIVE" "$CALIBRATION_FILE"; then
  fail "calibration-engine.js missing kill-switch enforcement"
fi
if ! rg -q "verifyStateChainAnchor" "$OUTCOME_CAPTURE_FILE"; then
  fail "outcome-capture.js missing startup chain-anchor cross-check"
fi
if ! rg -q "computeOutcomeHash" "$OUTCOME_DIR/outcome-schema.js"; then
  fail "outcome-schema.js missing outcome hash computation"
fi
if ! rg -q "computeOutcomeChainHash" "$OUTCOME_DIR/outcome-schema.js"; then
  fail "outcome-schema.js missing chain hash computation"
fi
if ! rg -q "RLHF_OUTCOME_IDEMPOTENCY_CONFLICT" "$OUTCOME_DIR/outcome-validator.js"; then
  fail "outcome-validator.js missing idempotency conflict enforcement"
fi

node - "$EGRESS_FILE" <<'NODE'
const policy = require(process.argv[2]);
const allowed = new Set(["api.semanticscholar.org", "export.arxiv.org", "api.beehiiv.com", "api.notion.com"]);
const seen = new Set();
for (const [slug, value] of Object.entries(policy.TOOL_EGRESS_POLICIES || {})) {
  if (!value || typeof value !== "object") continue;
  const hosts = Array.isArray(value.allowedHosts) ? value.allowedHosts : [];
  for (const host of hosts) {
    const normalized = String(host || "").trim().toLowerCase();
    if (!normalized) continue;
    seen.add(normalized);
    if (!allowed.has(normalized)) {
      process.stderr.write(`Unexpected egress domain detected (${slug}): ${normalized}\n`);
      process.exit(1);
    }
  }
}
if (JSON.stringify([...seen].sort()) !== JSON.stringify([...allowed].sort())) {
  process.stderr.write(`Egress allowlist set mismatch. seen=${JSON.stringify([...seen].sort())}\n`);
  process.exit(1);
}
NODE

bash "$ROOT/scripts/verify-mcp-policy.sh"
bash "$ROOT/scripts/verify-mutation-policy.sh"
bash "$ROOT/scripts/verify-phase5-policy.sh"

echo "Phase 6 policy verification passed"
