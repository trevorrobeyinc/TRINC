#!/usr/bin/env bash
#
# absorb-external-plugins.sh — one-time import of the two TR plugins whose source
# still lives in their own git repos outside the monorepo, keeping their history:
#
#   origin-nest                  <- $VAULT/.obsidian/plugins/origin-nest (own .git)
#   contextual-wiki-definitions  <- $HOME/Code/obsidian-auto-wiki-summarize (own repo)
#
# Uses `git subtree add`, which makes one (signed, if commit.gpgsign is on) merge
# commit per plugin. Requires a clean working tree: commit pending work first.
# Does not touch, move or delete the original repos or the vault — the vault keeps
# loading its current copies until you choose to redeploy from the monorepo.
#
# Run from anywhere:
#   bash /Users/myhome/TrevClaw-Obsidianodus/ops/tr-suite/absorb-external-plugins.sh

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VAULT="${VAULT:-$HOME/My Digital Garden}"

if [[ -n "$(git -C "$REPO" status --porcelain --untracked-files=no)" ]]; then
  echo "working tree has uncommitted changes — commit them first" >&2
  exit 1
fi

absorb() {
  local src="$1" prefix="$2"
  if [[ -d "$REPO/$prefix" ]]; then
    echo "skip: $prefix already exists"
    return
  fi
  local branch
  branch="$(git -C "$src" rev-parse --abbrev-ref HEAD)"
  git -C "$REPO" subtree add --prefix="$prefix" "$src" "$branch" \
    -m "chore(tr-suite): absorb $(basename "$prefix") into the monorepo with history"
  echo "absorbed $src ($branch) -> $prefix"
}

absorb "$VAULT/.obsidian/plugins/origin-nest" "Claude/obsidian-origin-nest"
absorb "$HOME/Code/obsidian-auto-wiki-summarize" "Claude/obsidian-contextual-wiki-definitions"

echo "next: bash $REPO/ops/tr-suite/verify.sh"
