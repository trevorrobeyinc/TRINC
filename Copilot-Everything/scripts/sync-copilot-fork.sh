#!/usr/bin/env bash
#
# sync-copilot-fork.sh
#
# Long-running, local-only update workflow for the Copilot fork.
#
# What it does:
#   1. cd into /Volumes/ExtraCurricular/TrevClaw-Obsidianodus/Copilot-Everything/repos/obsidian-copilot-mcp
#   2. git fetch upstream
#   3. Compare upstream/master HEAD to current HEAD; early-exit if no new upstream commits
#   4. Refuse to run if the working tree is dirty (uncommitted changes)
#   5. Create a timestamped backup branch on the current HEAD
#   6. Rebase the fork branch onto upstream/master
#      - On conflict, abort and tell the user to resolve manually
#   7. Run `npm run build` (tsc + esbuild + tailwind)
#   8. Copy main.js + styles.css + manifest.json into the deployed plugin folder
#   9. Reload the Copilot plugin via the Obsidian CLI
#  10. Print a final status summary
#
# What it does NOT do:
#   - Push to any remote (the fork is local-only by design).
#   - Force-push, reset, or delete branches. Backup branches accumulate.
#   - Touch the deployed plugin's data.json (your settings persist there).
#   - Run any git operation if there are uncommitted changes.
#
# Run it whenever Obsidian announces a new Copilot release. Idempotent —
# re-running on a fork already current with upstream prints "no upstream
# changes" and exits 0.

set -euo pipefail

REPO="/Volumes/ExtraCurricular/TrevClaw-Obsidianodus/Copilot-Everything/repos/obsidian-copilot-mcp"
DEPLOY="/Volumes/ExtraCurricular/My Digital Garden/.obsidian/plugins/copilot"
OBSIDIAN_BIN="/Applications/Obsidian.app/Contents/MacOS/obsidian"
FORK_BRANCH="codex/post-validated-mcp-baseline"
UPSTREAM_REMOTE="upstream"
UPSTREAM_BRANCH="master"

# Colors for log output
green() { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }
red() { printf "\033[31m%s\033[0m\n" "$*"; }

log() { printf "[%s] %s\n" "$(date '+%H:%M:%S')" "$*"; }

cd "$REPO" || { red "Repo not found at $REPO"; exit 1; }

log "Repo: $REPO"
log "Branch expected: $FORK_BRANCH"

CURRENT_BRANCH="$(git branch --show-current)"
if [[ "$CURRENT_BRANCH" != "$FORK_BRANCH" ]]; then
    red "Current branch is '$CURRENT_BRANCH', expected '$FORK_BRANCH'."
    red "Run: git checkout $FORK_BRANCH"
    exit 1
fi

# Refuse to run if dirty.
if [[ -n "$(git status --porcelain)" ]]; then
    red "Working tree is dirty. Commit or stash first."
    git status --short
    exit 1
fi

log "Fetching $UPSTREAM_REMOTE/$UPSTREAM_BRANCH..."
git fetch "$UPSTREAM_REMOTE" "$UPSTREAM_BRANCH" 2>&1 | tail -3

UPSTREAM_HEAD="$(git rev-parse "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH")"
MERGE_BASE="$(git merge-base HEAD "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH")"

if [[ "$UPSTREAM_HEAD" == "$MERGE_BASE" ]]; then
    green "No upstream changes since merge-base. Fork is already current."
    log "Upstream HEAD: $UPSTREAM_HEAD"
    log "Fork HEAD:     $(git rev-parse HEAD)"
    exit 0
fi

NEW_COMMITS="$(git log --oneline "$MERGE_BASE..$UPSTREAM_REMOTE/$UPSTREAM_BRANCH" | wc -l | tr -d ' ')"
log "Upstream advanced by $NEW_COMMITS commit(s):"
git log --oneline "$MERGE_BASE..$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
echo ""

TS="$(date +%Y%m%d-%H%M%S)"
BACKUP="backup/pre-upstream-sync-$TS"
git branch "$BACKUP"
green "Safety branch created: $BACKUP"
log "  Roll back with: git reset --hard $BACKUP"
echo ""

log "Rebasing $FORK_BRANCH onto $UPSTREAM_REMOTE/$UPSTREAM_BRANCH..."
if ! git rebase "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"; then
    red "Rebase hit conflicts. Resolve manually, then run:"
    red "  git rebase --continue"
    red "Or abort with:"
    red "  git rebase --abort"
    red "Your safety branch is intact at: $BACKUP"
    exit 1
fi

green "Rebase clean."
echo ""

log "Building plugin..."
if ! npm run build; then
    red "Build failed. Investigate before deploying."
    red "Roll back with: git reset --hard $BACKUP"
    exit 1
fi

log "Deploying to $DEPLOY"
cp main.js "$DEPLOY/main.js"
cp styles.css "$DEPLOY/styles.css"
cp manifest.json "$DEPLOY/manifest.json"
green "Deployed main.js / styles.css / manifest.json (data.json untouched)."

log "Reloading Copilot plugin..."
"$OBSIDIAN_BIN" plugin:reload id=copilot >/dev/null 2>&1 || yellow "(plugin:reload command did not return — Obsidian may not be running)"

echo ""
green "===================================================="
green "Sync complete."
green "===================================================="
log "Fork HEAD:    $(git rev-parse HEAD) ($(git log --oneline -1 --format=%s HEAD))"
log "Upstream tip: $UPSTREAM_HEAD ($(git log --oneline -1 --format=%s "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"))"
log "Plugin version deployed: $(grep '\"version\"' "$DEPLOY/manifest.json" | head -1 | sed 's/.*: *\"//;s/\".*//')"
log "Safety branch: $BACKUP (kept on disk; delete with: git branch -D $BACKUP)"
