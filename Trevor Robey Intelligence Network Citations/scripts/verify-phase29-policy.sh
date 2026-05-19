#!/usr/bin/env bash
set -euo pipefail

# Phase 29: ToolUniverse Biomedical Research Integration - Policy Verification
# This script validates that all Phase 29 governance requirements are met.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)
      [[ $# -ge 2 ]] || { echo "ERROR: --root requires a path argument" >&2; exit 1; }
      ROOT_DIR="$(cd "$2" && pwd)"
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

echo "=== Phase 29 Policy Verification ==="
echo ""

# 1. Check required files exist
REQUIRED_FILES=(
  "openclaw-bridge/mcp/tooluniverse-mcp/tooluniverse-mcp.js"
  "openclaw-bridge/mcp/tooluniverse-mcp/tu-process-manager.js"
  "openclaw-bridge/mcp/tooluniverse-mcp/tu-record-normalizer.js"
  "openclaw-bridge/mcp/tooluniverse-mcp/tu-schema.js"
  "security/phase29-startup-integrity.js"
  "scripts/verify-phase29-policy.sh"
)

for f in "${REQUIRED_FILES[@]}"; do
  [[ -f "$ROOT_DIR/$f" ]] || fail "Required file missing: $f"
  echo "  OK: $f"
done

# 2. Check ToolUniverse submodule exists
if [ ! -d "$ROOT_DIR/vendor/tooluniverse/.git" ] && [ ! -f "$ROOT_DIR/vendor/tooluniverse/.git" ] && [ ! -f "$ROOT_DIR/vendor/tooluniverse/README.md" ]; then
  fail "vendor/tooluniverse submodule not found"
fi
echo "  OK: vendor/tooluniverse submodule"

# 3. Check MCP method registry includes new methods
REGISTRY="$ROOT_DIR/openclaw-bridge/bridge/mcp-method-registry.js"
for method in research_findTool research_getToolInfo research_executeTool research_listTools research_grepTools; do
  grep -q "$method" "$REGISTRY" 2>/dev/null || fail "Method '$method' not found in mcp-method-registry.js"
  echo "  OK: Method $method registered"
done

# 4. Check research_executeTool is in operator allowlist
grep -A5 "MCP_OPERATOR_METHOD_ALLOWLIST" "$REGISTRY" | grep -q "RESEARCH_EXECUTE_TOOL" || fail "RESEARCH_EXECUTE_TOOL not in MCP_OPERATOR_METHOD_ALLOWLIST"
echo "  OK: RESEARCH_EXECUTE_TOOL in operator allowlist"

# 5. Check egress policy entry
EGRESS="$ROOT_DIR/openclaw-bridge/execution/egress-policy.js"
grep -q "tooluniverse-mcp" "$EGRESS" 2>/dev/null || fail "tooluniverse-mcp not found in egress-policy.js"
echo "  OK: tooluniverse-mcp egress policy"

# 6. Check feature flag
CONFIG="$ROOT_DIR/openclaw-bridge/openclaw.json"
grep -q "ENABLE_TOOLUNIVERSE_MCP" "$CONFIG" 2>/dev/null || fail "ENABLE_TOOLUNIVERSE_MCP not found in openclaw.json"
echo "  OK: ENABLE_TOOLUNIVERSE_MCP feature flag"

# 7. Check dataset schemas have phase29 versions
SCHEMAS="$ROOT_DIR/config/dataset-schemas.json"
for schema in molecular_properties clinical_trial_record genomic_variant protein_interaction pharmacovigilance_signal; do
  grep -q "$schema" "$SCHEMAS" 2>/dev/null || fail "Dataset schema '${schema}' not found in dataset-schemas.json"
  echo "  OK: Dataset schema ${schema}"
done

# 8. Check mission templates exist
MISSIONS="$ROOT_DIR/config/mission-templates.json"
for template in biomedical_drug_discovery biomedical_target_identification clinical_trial_intelligence pharmacovigilance_scan genomic_variant_analysis rare_disease_landscape; do
  grep -q "\"$template\"" "$MISSIONS" 2>/dev/null || fail "Mission template '${template}' not found in mission-templates.json"
  echo "  OK: Mission template ${template}"
done

# 9. Check no TLS overrides in new code
TU_DIR="$ROOT_DIR/openclaw-bridge/mcp/tooluniverse-mcp"
if grep -rn "rejectUnauthorized\|insecureSkipTlsVerify\|checkServerIdentity" "$TU_DIR" 2>/dev/null; then
  fail "TLS override found in tooluniverse-mcp code"
fi
echo "  OK: No TLS overrides in tooluniverse-mcp"

# 10. Check startup integrity module exports correctly
grep -q "verifyPhase29StartupIntegrity" "$ROOT_DIR/security/phase29-startup-integrity.js" 2>/dev/null || fail "verifyPhase29StartupIntegrity not exported"
echo "  OK: Phase 29 startup integrity exported"

echo ""
echo "=== Phase 29 Policy Verification: ALL CHECKS PASSED ==="
exit 0
