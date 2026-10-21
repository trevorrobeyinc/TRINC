#!/usr/bin/env bash
#
# absorb-external-plugins.sh — one-time import of the two TR plugins whose source
# still lives in their own git repos outside the monorepo, keeping their history:
#
#   origin-nest                  <- $VAULT/.obsidian/plugins/origin-nest (own .git)
#   contextual-wiki-definitions  <- $HOME/Code/obsidian-auto-wiki-summarize (own repo)
#
# Uses `git subtree add -S`, which makes one SIGNED merge commit per plugin. (`git subtree`
# ignores commit.gpgsign, which is why the 2026-10-20 imports a71380d and 9bfaa86 are
# unsigned; -S fixes it.) All three imports are DONE as of 2026-10-21 — re-running skips them. Requires a clean working tree: commit pending work first.
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
  git -C "$REPO" subtree add -S --prefix="$prefix" "$src" "$branch" \
    -m "chore(tr-suite): absorb $(basename "$prefix") into the monorepo with history"
  echo "absorbed $src ($branch) -> $prefix"
}

absorb "$VAULT/.obsidian/plugins/origin-nest" "Claude/obsidian-origin-nest"
absorb "$HOME/Code/obsidian-auto-wiki-summarize" "Claude/obsidian-contextual-wiki-definitions"
# trinc-content was absorbed 2026-10-21 (e485565) from $HOME/.claude/mcp-servers/trinc-content;
# its old repo now lives in $HOME/Code/_retired-absorbed-into-monorepo/.

echo "next: bash $REPO/ops/tr-suite/verify.sh"
