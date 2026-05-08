#!/usr/bin/env bash
# lint-transport-monorepo.sh
#
# Repo-wide regression guard for the "HTTPS-only or nothing" invariant.
#
# Greps every TypeScript / JavaScript source file across all three workspaces
# (Claude/, Copilot-Everything/, trevor-robey-inc-agents/) for the foot-gun
# shapes that historically introduced unencrypted TCP listeners or env-gated
# plaintext fallbacks:
#
#   - http.createServer(             — plain-HTTP TCP server constructor
#   - OPENCLAW_BRIDGE_TLS_DISABLE == "1"   — TLS-disable env var equality check
#   - tlsDisable ?                   — ternary that drops to plaintext
#
# UDS / Windows-pipe transports legitimately use http.createServer because they
# bind to filesystem socket paths, not TCP — they are explicitly excluded from
# the scan. Test fixtures, vendor code, dist output, and archives are excluded
# too. If you add a new bridge, add its source file to the scan automatically
# (this script walks the tree).
#
# Behavior on cert / TLS load failure: REFACTOR THE CONFIG. Never reintroduce
# an http.createServer code path. The required behavior on missing certs is to
# throw with a useful error and refuse to listen.
#
# Usage:
#   bash scripts/lint-transport-monorepo.sh           # scan and report
#   bash scripts/lint-transport-monorepo.sh --strict  # scan and exit 1 on hit (CI mode)
#
# Generated 2026-04-30 as part of the monorepo-wide HTTPS-only enforcement.

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STRICT=0
if [ "${1:-}" = "--strict" ]; then
  STRICT=1
fi

# Foot-gun pattern set: actual function calls, equality checks, and ternaries —
# NOT bare mentions in comments / strings. Patterns are deliberately narrow to
# avoid false positives on hardening-comment text and deprecation notices.
PATTERNS='http\.createServer\(|OPENCLAW_BRIDGE_TLS_DISABLE\s*={2,3}|tlsDisable\s*\?'

# Files that LEGITIMATELY use http.createServer because they bind to a
# filesystem path (UDS / Windows pipe), not a TCP host:port. Adding a new
# entry here requires explicit security review.
LEGITIMATE_NON_TCP=(
  "Copilot-Everything/bridges/obsidian-copilot-bridge/src/server/udsTransport.ts"
  "Copilot-Everything/bridges/obsidian-copilot-bridge/src/server/windowsPipeTransport.ts"
  "Copilot-Everything/bridges/raycast-obsidian-mcp/src/server/udsTransport.ts"
  "Copilot-Everything/bridges/raycast-obsidian-mcp/src/server/windowsPipeTransport.ts"
)

cd "$ROOT" || { echo "cannot cd to $ROOT" >&2; exit 2; }

# Build the find expression: walk Claude/, Copilot-Everything/, trevor-robey-inc-agents/
# under their *source* directories only. Skip node_modules, dist, vendor,
# archive, audit/evidence, workspace runtime state, test fixtures.
mapfile -t CANDIDATES < <(find \
    Claude/ Copilot-Everything/ trevor-robey-inc-agents/ \
    -type f \
    \( -name '*.ts' -o -name '*.js' -o -name '*.mjs' -o -name '*.cjs' \) \
    -not -path '*/node_modules/*' \
    -not -path '*/dist/*' \
    -not -path '*/build/*' \
    -not -path '*/.git/*' \
    -not -path '*/vendor/*' \
    -not -path '*/.archive/*' \
    -not -path '*/audit/evidence/*' \
    -not -path '*/audit/runs/*' \
    -not -path '*/workspace/audit/*' \
    -not -path '*/workspace/research-output/*' \
    -not -path '*/workspace/datasets/*' \
    -not -path '*/test-results/*' \
    -not -path '*/__tests__/*' \
    -not -path '*/tests/*' \
    -not -path '*/test/*' \
    2>/dev/null | sort)

# Strip the legitimate UDS/pipe files from the candidate list.
declare -a SCAN_FILES
for f in "${CANDIDATES[@]}"; do
  skip=0
  for legit in "${LEGITIMATE_NON_TCP[@]}"; do
    if [ "$f" = "$legit" ]; then skip=1; break; fi
  done
  [ "$skip" -eq 0 ] && SCAN_FILES+=("$f")
done

echo "lint-transport-monorepo: scanning ${#SCAN_FILES[@]} source files (excluded ${#LEGITIMATE_NON_TCP[@]} UDS/pipe transports)"

hits=0
hit_files=""
for f in "${SCAN_FILES[@]}"; do
  if grep -nE "$PATTERNS" "$f" >/dev/null 2>&1; then
    hits=$((hits+1))
    hit_files="$hit_files\n$f:"
    while IFS= read -r line; do
      hit_files="$hit_files\n  $line"
    done < <(grep -nE "$PATTERNS" "$f")
  fi
done

if [ "$hits" -eq 0 ]; then
  echo "lint-transport-monorepo: OK — no foot-gun shapes found in monorepo source."
  exit 0
fi

printf '%b\n' "$hit_files"
echo
echo "lint-transport-monorepo: FAILED — $hits file(s) contain a foot-gun pattern."
echo
cat <<'EOF'
What to do (read this — do NOT downgrade to HTTP):

  1. If the hit is in a NETWORK transport (binds host:port over TCP), the file
     MUST construct https.createServer with a valid mkcert key/cert pair and
     refuse to start when the certs cannot be loaded. See
     Copilot-Everything/bridges/obsidian-copilot-bridge/src/server/httpTransport.ts
     for the canonical pattern.

  2. If the hit is in a UDS / Windows-pipe transport (binds a filesystem path,
     not host:port), add the file path to LEGITIMATE_NON_TCP in this script
     after explicit security review. Filesystem transports are out of scope
     for the HTTPS-only rule.

  3. If a TLS cert / key cannot be loaded at runtime, the correct response is
     to REFACTOR the cert configuration (regenerate via mkcert, fix env-var
     propagation, point config at the right paths). Never reintroduce an
     http.createServer code path as a "fallback" — that is the exact regression
     this guard exists to catch.
EOF

[ "$STRICT" -eq 1 ] && exit 1 || exit 0
