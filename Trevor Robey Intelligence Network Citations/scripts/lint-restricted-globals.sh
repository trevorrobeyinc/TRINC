#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

FORBIDDEN_PATTERN='Date\.now\(|new Date\(|Math\.random\(|randomUUID\('

has_rg() {
  command -v rg >/dev/null 2>&1
}

if has_rg; then
  MATCHES="$(rg -n -S "$FORBIDDEN_PATTERN" "$ROOT/openclaw-bridge" \
    --glob '!**/core/time-provider.js' \
    --glob '!**/core/entropy-provider.js' \
    --glob '!**/docs/**' || true)"
else
  # Fallback: grep -E (no ripgrep installed)
  MATCHES="$(grep -RnE "$FORBIDDEN_PATTERN" "$ROOT/openclaw-bridge" \
    --include='*.js' \
    --exclude-dir=docs || true)"
  # Exclude the provider files that are allowed to use these globals
  if [[ -n "$MATCHES" ]]; then
    MATCHES="$(printf '%s\n' "$MATCHES" | grep -vE 'core/time-provider\.js|core/entropy-provider\.js' || true)"
  fi
fi

if [[ -n "$MATCHES" ]]; then
  echo "Restricted global usage detected outside controlled providers:" >&2
  echo "$MATCHES" >&2
  exit 1
fi

echo "Restricted globals lint passed"
