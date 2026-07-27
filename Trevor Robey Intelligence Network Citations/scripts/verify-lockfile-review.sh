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
REVIEW_DOC="$ROOT/security/dependency-review.md"

cd "$ROOT"

changed_files=""
if [[ -n "${GITHUB_BASE_REF:-}" ]] && git show-ref --verify --quiet "refs/remotes/origin/${GITHUB_BASE_REF}"; then
  changed_files="$(git diff --name-only "origin/${GITHUB_BASE_REF}...HEAD")"
elif git rev-parse --verify --quiet HEAD >/dev/null; then
  changed_files="$(git diff --name-only HEAD~1..HEAD 2>/dev/null || true)"
fi

lock_changed=false
cache_lock_changed=false

if [[ "$changed_files" == *"package-lock.json"* ]]; then
  lock_changed=true
fi
if [[ "$changed_files" == *"security/npm-cache.lock.json"* ]]; then
  cache_lock_changed=true
fi

if [[ "${FORCE_LOCK_CHANGED:-0}" == "1" ]]; then
  lock_changed=true
fi
if [[ "${FORCE_CACHE_LOCK_CHANGED:-0}" == "1" ]]; then
  cache_lock_changed=true
fi

if [[ "$lock_changed" == false && "$cache_lock_changed" == false ]]; then
  echo "No lockfile/cache lock changes detected"
  exit 0
fi

if [[ ! -f "$REVIEW_DOC" ]]; then
  echo "Missing dependency review document: $REVIEW_DOC" >&2
  exit 1
fi

if ! rg -n '^Lockfile-Review:[[:space:]]+approved$' "$REVIEW_DOC" >/dev/null; then
  echo "dependency-review.md must include 'Lockfile-Review: approved'" >&2
  exit 1
fi

if ! rg -n '^Reviewer:[[:space:]]+.+$' "$REVIEW_DOC" >/dev/null; then
  echo "dependency-review.md must include a Reviewer" >&2
  exit 1
fi

if [[ "$cache_lock_changed" == true ]]; then
  if ! rg -n '^Cache-Rebuild-Reason:[[:space:]]+.+$' "$REVIEW_DOC" >/dev/null; then
    echo "dependency-review.md must include Cache-Rebuild-Reason when npm-cache lock changes" >&2
    exit 1
  fi
fi

echo "Lockfile/cache review policy passed"
