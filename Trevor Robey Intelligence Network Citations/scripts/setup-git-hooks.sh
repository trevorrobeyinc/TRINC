#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail() {
  echo "$1" >&2
  exit 1
}

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "This command must be run inside a Git worktree."

mkdir -p "$ROOT/.githooks"
git config --local core.hooksPath .githooks

HOOKS_PATH="$(git config --local --get core.hooksPath || true)"
[[ "$HOOKS_PATH" == ".githooks" ]] || fail "Failed to configure core.hooksPath to .githooks"

echo "Configured local Git hooks for this clone:"
echo "  core.hooksPath=.githooks"
echo
echo "Commits on main are now blocked locally unless OPENCLAW_ALLOW_MAIN_COMMIT=1 is set."
echo "Inspect with: git config --local --get core.hooksPath"
