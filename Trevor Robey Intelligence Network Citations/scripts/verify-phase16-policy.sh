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
  if [[ "${PHASE16_POLICY_FORCE_NO_RG:-0}" == "1" ]]; then
    return 1
  fi
  command -v rg >/dev/null 2>&1
}

search_lines() {
  local pattern="$1"
  shift
  if has_rg; then
    rg -n --glob '*.js' -- "$pattern" "$@" || true
    return
  fi
  grep -R -nE --include='*.js' -- "$pattern" "$@" || true
}

REQUIRED_FILES=(
  "$ROOT/integrations/mcp/mcp-client.js"
  "$ROOT/integrations/mcp/arxiv-client.js"
  "$ROOT/integrations/mcp/semantic-scholar-client.js"
  "$ROOT/workflows/research-ingestion/ingestion-pipeline.js"
  "$ROOT/workflows/research-ingestion/normalizer.js"
  "$ROOT/workflows/research-ingestion/citation-metrics.js"
  "$ROOT/workflows/research-ingestion/source-ledger.js"
  "$ROOT/scripts/verify-phase16-policy.sh"
  "$ROOT/tests/security/phase16-policy-gate.test.js"
)

for file in "${REQUIRED_FILES[@]}"; do
  [[ -f "$file" ]] || fail "Missing Phase 16 file: $file"
done

SCAN_TARGETS=(
  "$ROOT/openclaw-bridge/core"
  "$ROOT/integrations/mcp"
  "$ROOT/workflows/research-ingestion"
  "$ROOT/openclaw-bridge/state"
)

# `\bfetch\(` not `fetch\(`: the unanchored form false-matched `createToolPrefetch(`, which
# is the only reason tool-prefetch.js appeared in the allowlist below. With the word boundary
# it matches nothing there, so that entry is dropped rather than carried.
PHASE16_NETWORK_PATTERN='\bfetch\(|axios|http\.request\(|https\.request\(|node:http|node:https|WebSocket'

# Per-file PINNED exemptions, mirroring verify-phase18-policy.sh. A path-only allowlist (what
# this used to be) lets an exempted file acquire ANY new network call unnoticed; pinning the
# sha256 of its exact matching lines means gaining one fails on mismatch and losing the last
# one fails as stale. integrations/mcp/* stays a directory-level allowance — that is the
# policy's stated purpose ("only integrations/mcp/* ... may perform network calls").
#
# format: <path relative to ROOT>|<sha256 of trimmed+sorted matching lines>|<justification>
PHASE16_EXEMPTIONS=(
  "openclaw-bridge/core/llm-adapter.js|307db1d2b8b51885c6adfae0aeb95f0a5cb71f2be1cfdd9fb7ebe4f4f906c199|Named in this policy's own message as a permitted network caller: the LLM provider lane."
  "openclaw-bridge/core/https-client.js|1f49dabe8eb7f79614e02833b2c694f24224cf5849615b7c3ac754fc49867964|The engine's canonical HTTPS client; the monorepo HTTPS-only invariant requires this module to exist."
  "openclaw-bridge/core/prompt-guard.js|a3b51ffd8367695e44347a544ecef33644f8df34a25030c2d3b2d69770b9ae41|LLM Guard prompt-firewall: one https.request to the local guard endpoint, fail-open by design."
  "openclaw-bridge/core/scrape-sidecar-lifecycle.js|a3b51ffd8367695e44347a544ecef33644f8df34a25030c2d3b2d69770b9ae41|Loopback health probe of the local scrape sidecar (rejectUnauthorized:true, mkcert CA). No egress."
)

phase16_pin_for() {
  grep -hE "$PHASE16_NETWORK_PATTERN" "$1" 2>/dev/null \
    | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' \
    | LC_ALL=C sort | shasum -a 256 | awk '{print $1}'
}

NETWORK_HITS="$(search_lines "$PHASE16_NETWORK_PATTERN" "${SCAN_TARGETS[@]}")"
DISALLOWED="$(printf '%s\n' "$NETWORK_HITS" | grep -vE 'integrations/mcp/' || true)"

for entry in "${PHASE16_EXEMPTIONS[@]}"; do
  rel="${entry%%|*}"; rest="${entry#*|}"
  want="${rest%%|*}"; why="${rest#*|}"
  abs="$ROOT/$rel"
  # Absent from the tree under scan (subset fixtures): nothing to exempt. Safe — a file
  # reappearing here with different network code fails the pin check below.
  [[ -f "$abs" ]] || continue
  if ! grep -qE "$PHASE16_NETWORK_PATTERN" "$abs" 2>/dev/null; then
    fail "Phase 16 network exemption is STALE: $rel no longer performs network calls. Remove its PHASE16_EXEMPTIONS entry."
  fi
  got="$(phase16_pin_for "$abs")"
  if [[ "$got" != "$want" ]]; then
    echo "Phase 16 exemption PIN MISMATCH — $rel" >&2
    echo "  expected: $want" >&2
    echo "  actual:   $got" >&2
    echo "  on record: $why" >&2
    grep -nE "$PHASE16_NETWORK_PATTERN" "$abs" >&2 || true
    fail "The network-touching lines in $rel changed. Re-review, then update the pin."
  fi
  DISALLOWED="$(printf '%s\n' "$DISALLOWED" | grep -vF "$abs:" || true)"
done

DISALLOWED="$(printf '%s\n' "$DISALLOWED" | grep -v '^[[:space:]]*$' || true)"
if [[ -n "$DISALLOWED" ]]; then
  echo "$DISALLOWED" >&2
  fail "Phase 16 network isolation violation: only integrations/mcp/* and pinned-exempt core modules may perform network calls"
fi

AUTONOMY_HITS="$(search_lines '\\bpublish\\b|submitToPlatform|autonomousPublish|browser\\.launch|\\blogin\\b' "$ROOT/workflows/research-ingestion")"
if [[ -n "$AUTONOMY_HITS" ]]; then
  echo "$AUTONOMY_HITS" >&2
  fail "Phase 16 ingestion modules must not include autonomous publish/login paths"
fi

echo "Phase 16 policy verification passed"
