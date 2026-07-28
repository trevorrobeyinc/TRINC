#!/usr/bin/env bash
# lint-transport-monorepo.sh
#
# Repo-wide regression guard for the "HTTPS-only or nothing" invariant.
#
# Greps every TypeScript / JavaScript source file across all three workspaces
# (Claude/, Copilot-Everything/, "Trevor Robey Intelligence Network Citations/") for foot-gun shapes
# that historically introduced unencrypted TCP listeners, env-gated plaintext
# fallbacks, or plaintext outbound calls. v2.0.0 of Principle I expanded the
# scope from inbound listeners only to listeners AND outbound connections.
#
# Three violation buckets are reported separately:
#
#   1. LISTENER (inbound) violations:
#      - http.createServer(            — plain-HTTP TCP server constructor
#      - OPENCLAW_BRIDGE_TLS_DISABLE   — TLS-disable env var equality check
#      - tlsDisable ?                  — ternary that drops to plaintext
#
#   2. OUTBOUND (originating) violations:
#      - http.request( | http.get(     — node http module outbound calls
#      - fetch("http://...) | fetch('http://...)
#      - axios.get|post|put|delete|patch|request("http://...)
#      - got("http://...)
#      - new URL("http://...)
#
#      STRUCTURAL EXEMPTION: an `http.request(` whose options object contains
#      `socketPath` within 10 lines is a UDS / Windows-pipe outbound — a
#      filesystem-path transport, not TCP. This is the outbound mirror of the
#      LEGITIMATE_NON_TCP listener exemption. Counted separately in the report
#      as "UDS/pipe outbound (structural exempt)".
#
#   3. PLAINTEXT-UPSTREAM-PORT references:
#      - Direct hits on :8742, :6333, :1234, :11434, :8890 in source — these
#        should route through the HTTPS proxies on :8743, :6433, :8891
#        (:1235 LM Studio and :11435 Ollama were decommissioned 2026-07-16/23;
#        their upstream ports :1234/:11434 stay forbidden so neither can return),
#        :8891.
#
# Exemptions:
#   - UDS / Windows-pipe transports legitimately use http.createServer because
#     they bind to filesystem socket paths, not TCP — listed in
#     LEGITIMATE_NON_TCP.
#   - Test files (*.spec.ts, *.spec.js, *.test.ts, *.test.js, *.live.spec.ts)
#     are exempt by filename suffix (additive safety on top of */tests/*
#     directory exclusion).
#   - Lines containing the carve-out marker `// lint-transport: outbound-carve-out`
#     or `# lint-transport: outbound-carve-out` are skipped from the violation
#     count and reported separately.
#   - Vendor code (*/vendor/*) is excluded from the file walk; vendor-code
#     violations are surfaced via the audit step, not this script (route-
#     through-proxy is the resolution path, not fork-and-patch).
#
# Behavior on cert / TLS load failure: REFACTOR THE CONFIG. Never reintroduce
# an http.createServer code path. The required behavior on missing certs is to
# throw with a useful error and refuse to listen.
#
# Usage:
#   bash scripts/lint-transport-monorepo.sh           # scan and report
#   bash scripts/lint-transport-monorepo.sh --strict  # scan and exit 1 on hit (CI mode)
#
# Generated 2026-04-30; v2.0.0 outbound-scope extension 2026-05-13.

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STRICT=0
if [ "${1:-}" = "--strict" ]; then
  STRICT=1
fi

# Bucket 1 — listener (inbound) foot-gun shapes.
#
# Widened 2026-07-28 (audit): until now this matched ONLY the literal `http.createServer(`,
# so four ordinary ways to open a plaintext listener passed the guard clean —
#   import { createServer } from 'node:http'; createServer(...)   <- the idiomatic modern form
#   net.createServer(...)                                          <- raw TCP
#   http2.createServer(...)                                        <- h2c, cleartext HTTP/2
#   express(...).listen(...)                                       <- (still regex-invisible; see note)
# Nothing in the tree exploited the gap — every live listener is https.createServer — but the
# whole job of this bucket is to stop a plaintext listener being REintroduced, so a hole here
# is a hole in the one automated check backing the HTTPS-only invariant.
#
# The generic alternative below deliberately requires a preceding non-identifier, non-dot
# character, so `https.createServer(` and `https2.createServer(` do NOT match (the `.` is
# excluded) while a bare `createServer(` from a named import DOES. `net.`/`http2.` are then
# listed explicitly because the dot-exclusion would otherwise skip them.
#
# NOT added on purpose: a `from 'node:http'` import trigger. At least 11 live non-test files
# import node:http legitimately — including httpTransport.ts, the file CLAUDE.md names as the
# canonical HTTPS pattern, plus type-only importers — so it would be ~11 false positives and
# still miss the bare-specifier form (`import * as http from "http"`) already in the stack.
LISTENER_PATTERNS='http\.createServer\(|(^|[^A-Za-z0-9_.])createServer\(|net\.createServer\(|http2\.createServer\(|OPENCLAW_BRIDGE_TLS_DISABLE\s*={2,3}|tlsDisable\s*\?'

# Bucket 2 — outbound foot-gun shapes. URL-form patterns are deliberately
# anchored on `http://` literal strings so https:// hits are not flagged.
OUTBOUND_PATTERNS='http\.request\(|http\.get\(|fetch\(["'"'"']http://|axios\.(get|post|put|delete|patch|request)\(["'"'"']http://|got\(["'"'"']http://|new URL\(["'"'"']http://'

# Bucket 3 — direct references to the wrapped plaintext upstream ports.
# These should route through the HTTPS proxies on :8743/:6433/:8891.
# :1234 (LM Studio) and :11434 (Ollama) remain forbidden with NO proxy: both
# runtimes were removed from this machine (2026-07-16 / 2026-07-23).
# Trailing `([^0-9]|$)` anchor prevents :1234 from matching :12345 (e.g. PMID
# identifiers like [PMID:12345]) and prevents :11434 from matching :114340.
#
# SearXNG :8890 is guarded (2026-07-15) alongside the original four. SearXNG
# became the 5th wrapped service (HTTPS proxy on :8891, added 2026-07-06); its
# proxy is exempted in LEGITIMATE_OUTBOUND_PLAINTEXT below. The 5 pre-existing
# benign references were resolved at their source before the guard was enabled
# (none was ever a real plaintext data path):
#   - Claude/searxng-search-mcp/src/config.js — reworded to "port 8890" prose
#     (the live connection was and is https://127.0.0.1:8891, never plaintext).
#   - "Trevor Robey Intelligence Network Citations"/scripts/diag/searxng-section-gate-e2e.mjs
#     — a diagnostic that deliberately probes the RAW upstream for liveness; its
#     one real plaintext line carries an outbound-carve-out marker (permanent by
#     design), the prose comments were reworded.
PLAINTEXT_PORT_PATTERNS='(:8742|:6333|:1234|:11434|:8890)([^0-9]|$)'

# Carve-out marker (matches both // and # comment styles).
CARVE_OUT_MARKER='lint-transport:[[:space:]]*outbound-carve-out'

# Files that LEGITIMATELY use http.createServer because they bind to a
# filesystem path (UDS / Windows pipe), not a TCP host:port. Adding a new
# entry here requires explicit security review.
LEGITIMATE_NON_TCP=(
  "Copilot-Everything/bridges/obsidian-copilot-bridge/src/server/udsTransport.ts"
  "Copilot-Everything/bridges/obsidian-copilot-bridge/src/server/windowsPipeTransport.ts"
)

# Files that LEGITIMATELY make plaintext outbound calls because they ARE the
# canonical "wrap" pattern from Principle I — they terminate HTTPS on the
# proxy port and forward to the plaintext upstream. Their `http.request()`
# and direct `:8742`/`:6333`/`:1234`/`:11434`/`:8890` references are the whole
# point. These files are exempt from OUTBOUND and PLAINTEXT_PORT scans only —
# they remain subject to LISTENER (inbound) scanning.
LEGITIMATE_OUTBOUND_PLAINTEXT=(
  "Copilot-Everything/scripts/miyo-tls-proxy.mjs"
  "Copilot-Everything/scripts/qdrant-tls-proxy.mjs"
  "Copilot-Everything/scripts/searxng-tls-proxy.mjs"
)

cd "$ROOT" || { echo "cannot cd to $ROOT" >&2; exit 2; }

# Walk Claude/, Copilot-Everything/, "Trevor Robey Intelligence Network Citations/" source files.
# Skip node_modules, dist, build, vendor, archive, audit/evidence, workspace
# runtime state, test directories, and test files by filename suffix.
# bash 3.2 compatible (macOS ships bash 3.2).
CANDIDATES=()
while IFS= read -r line; do
  [ -n "$line" ] && CANDIDATES+=("$line")
done < <(find \
    Claude/ Copilot-Everything/ "Trevor Robey Intelligence Network Citations/" \
    -type f \
    \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.mjs' -o -name '*.cjs' \) \
    -not -path '*/node_modules/*' \
    -not -path '*/.venv/*' \
    -not -path '*/venv/*' \
    -not -path '*/site-packages/*' \
    -not -path '*/dist/*' \
    -not -path '*/build/*' \
    -not -path '*/.git/*' \
    -not -path '*/vendor/*' \
    -not -path '*/repos/obsidian-copilot-mcp/*' \
    -not -path '*/.archive/*' \
    -not -path '*/deploy/backups/*' \
    -not -path '*/audit/evidence/*' \
    -not -path '*/audit/runs/*' \
    -not -path '*/workspace/audit/*' \
    -not -path '*/workspace/research-output/*' \
    -not -path '*/workspace/datasets/*' \
    -not -path '*/test-results/*' \
    -not -path '*/__tests__/*' \
    -not -path '*/tests/*' \
    -not -path '*/test/*' \
    -not -name 'main.js' \
    -not -name '*.spec.ts' \
    -not -name '*.spec.js' \
    -not -name '*.test.ts' \
    -not -name '*.test.js' \
    -not -name '*.live.spec.ts' \
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

echo "lint-transport-monorepo: scanning ${#SCAN_FILES[@]} source files (excluded ${#LEGITIMATE_NON_TCP[@]} UDS/pipe transports + vendor/repos + test-file suffixes + bundled main.js + deploy/backups; ${#LEGITIMATE_OUTBOUND_PLAINTEXT[@]} TLS-proxy wraps exempt from outbound/port scans only)"

# Three buckets + separate counters for marker-suppressed and UDS-outbound
# structural exemptions.
listener_hits=0
outbound_hits=0
port_hits=0
markers_seen=0
uds_outbound_seen=0
listener_report=""
outbound_report=""
port_report=""

# Per-file scan. For each pattern bucket, we grep the file, then for each
# matched line we check whether the carve-out marker is present on the same
# line — if so, we increment markers_seen and skip the violation count.

scan_bucket() {
  local file="$1"
  local pattern="$2"
  local bucket_name="$3"  # "listener" | "outbound" | "port"

  # `grep -nE` outputs lineno:content. We iterate and check each line for the
  # carve-out marker before counting it as a violation. For outbound `http.request(`
  # hits, also peek 10 lines forward for `socketPath` — that pattern is a UDS /
  # Windows-pipe outbound (filesystem transport, not TCP) and is structurally
  # exempt, mirroring the LEGITIMATE_NON_TCP listener exemption.
  while IFS= read -r match; do
    [ -z "$match" ] && continue
    if echo "$match" | grep -qE "$CARVE_OUT_MARKER"; then
      markers_seen=$((markers_seen+1))
      continue
    fi
    # UDS / pipe outbound: `http.request(` with `socketPath` within 10 lines.
    if [ "$bucket_name" = "outbound" ] && echo "$match" | grep -qE 'http\.(request|get)\('; then
      local lineno end_line
      lineno=$(echo "$match" | cut -d: -f1)
      end_line=$((lineno + 10))
      if sed -n "${lineno},${end_line}p" "$file" 2>/dev/null | grep -qE '(^|[^A-Za-z_])socketPath\b'; then
        uds_outbound_seen=$((uds_outbound_seen+1))
        continue
      fi
    fi
    case "$bucket_name" in
      listener)
        listener_hits=$((listener_hits+1))
        listener_report="${listener_report}
  ${file}:${match}"
        ;;
      outbound)
        outbound_hits=$((outbound_hits+1))
        outbound_report="${outbound_report}
  ${file}:${match}"
        ;;
      port)
        port_hits=$((port_hits+1))
        port_report="${port_report}
  ${file}:${match}"
        ;;
    esac
  done < <(grep -nE "$pattern" "$file" 2>/dev/null || true)
}

for f in "${SCAN_FILES[@]}"; do
  scan_bucket "$f" "$LISTENER_PATTERNS" "listener"
  # OUTBOUND and PLAINTEXT_PORT scans skip files that ARE the canonical wrap
  # pattern (the four TLS proxies) — their outbound plaintext is intentional.
  legit_outbound=0
  for legit in "${LEGITIMATE_OUTBOUND_PLAINTEXT[@]}"; do
    if [ "$f" = "$legit" ]; then legit_outbound=1; break; fi
  done
  if [ "$legit_outbound" -eq 0 ]; then
    scan_bucket "$f" "$OUTBOUND_PATTERNS" "outbound"
    scan_bucket "$f" "$PLAINTEXT_PORT_PATTERNS" "port"
  fi
done

total_hits=$((listener_hits + outbound_hits + port_hits))

echo
echo "=========================================="
echo "lint-transport-monorepo: v2.0.0 report"
echo "=========================================="
echo "Listener (inbound) violations:           $listener_hits"
echo "Outbound (originating) violations:       $outbound_hits"
echo "Plaintext-upstream-port references:      $port_hits"
echo "Carve-out markers observed (suppressed): $markers_seen"
echo "UDS/pipe outbound (structural exempt):   $uds_outbound_seen"
echo "------------------------------------------"
echo "Total unmarked violations:               $total_hits"
echo "=========================================="

if [ "$listener_hits" -gt 0 ]; then
  echo
  echo "--- LISTENER (inbound) violations ---"
  printf '%b\n' "$listener_report"
fi

if [ "$outbound_hits" -gt 0 ]; then
  echo
  echo "--- OUTBOUND (originating) violations ---"
  printf '%b\n' "$outbound_report"
fi

if [ "$port_hits" -gt 0 ]; then
  echo
  echo "--- PLAINTEXT-UPSTREAM-PORT references ---"
  echo "(swap to HTTPS proxy: :8742->:8743, :6333->:6433, :1234->:1235, :11434->:11435, :8890->:8891)"
  printf '%b\n' "$port_report"
fi

if [ "$total_hits" -eq 0 ]; then
  echo
  echo "lint-transport-monorepo: OK — no foot-gun shapes found in monorepo source."
  exit 0
fi

echo
cat <<'EOF'
What to do (read this — do NOT downgrade to HTTP):

  1. LISTENER violations: the file MUST construct https.createServer with a
     valid mkcert key/cert pair and refuse to start when the certs cannot be
     loaded. See Copilot-Everything/bridges/obsidian-copilot-bridge/src/server/httpTransport.ts
     for the canonical pattern.

  2. OUTBOUND violations: replace the http:// URL with https://; if the target
     service only speaks plaintext, choose one of the three sanctioned paths
     in Constitution Principle I v2.0.0:
       (a) Replace with an HTTPS-speaking alternative.
       (b) Wrap with a monorepo-local TLS proxy (canonical pattern:
           Copilot-Everything/scripts/*-tls-proxy.mjs).
       (c) Time-limited carve-out: add `// lint-transport: outbound-carve-out`
           on the same line and register the entry with a concrete deadline.

  3. PLAINTEXT-UPSTREAM-PORT references: swap to the corresponding HTTPS proxy
     port. The five wrapped services and their proxy ports:
       :8742 (Miyo)        -> :8743
       :6333 (Qdrant)      -> :6433
       :1234 (LM Studio)   -> :1235
       :11434 (Ollama)     -> :11435
       :8890 (SearXNG)     -> :8891

  4. UDS / Windows-pipe transport: if the hit is a filesystem-path transport,
     add the file path to LEGITIMATE_NON_TCP in this script after explicit
     security review.

  5. On cert / TLS failure: REFACTOR the cert configuration. Never reintroduce
     an http.createServer or http:// outbound code path as a fallback.
EOF

[ "$STRICT" -eq 1 ] && exit 1 || exit 0
