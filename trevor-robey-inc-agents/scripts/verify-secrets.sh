#!/usr/bin/env bash
set -euo pipefail

# Secret scanner — regex-based, no external dependencies.
# GitHub's built-in secret scanning handles provider-specific patterns
# (API keys, tokens, etc.) automatically for push protection.

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

PATTERN='(AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|BEGIN[[:space:]]+PRIVATE[[:space:]]+KEY|ghp_[A-Za-z0-9]{36}|xox[baprs]-[A-Za-z0-9-]{10,}|api[_-]?key[[:space:]]*[:=][[:space:]]*[A-Za-z0-9_\-]{16,}|secret[[:space:]]*[:=][[:space:]]*[A-Za-z0-9_\-]{16,})'

has_rg() {
  if [[ "${VERIFY_SECRETS_FORCE_NO_RG:-0}" == "1" ]]; then
    return 1
  fi
  command -v rg >/dev/null 2>&1
}

if has_rg; then
  if rg -n -S "$PATTERN" "$ROOT" \
    --glob '!**/.git/**' \
    --glob '!**/.ci/npm-cache/**' \
    --glob '!**/audit/evidence/**' \
    --glob '!**/node_modules/**'; then
    echo "Potential secrets detected in repository" >&2
    exit 1
  fi
  echo "Secret scan passed via ripgrep regex"
  exit 0
fi

# Fallback: find + grep (slower, no ripgrep)
matched=0
while IFS= read -r -d '' file_path; do
  if grep -nE -- "$PATTERN" "$file_path"; then
    matched=1
  fi
done < <(
  find "$ROOT" \
    \( -path "$ROOT/.git" -o -path "$ROOT/.ci/npm-cache" -o -path "$ROOT/audit/evidence" -o -path "$ROOT/node_modules" \) -prune \
    -o -type f -print0
)

if [[ "$matched" == "1" ]]; then
  echo "Potential secrets detected in repository" >&2
  exit 1
fi

echo "Secret scan passed via regex fallback"
exit 0
