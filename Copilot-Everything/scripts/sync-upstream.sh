#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

export PATH="$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node/" | sort -V | tail -1)/bin:$PATH"

UPSTREAM_REMOTE="upstream"
UPSTREAM_BRANCH="master"

echo "=== Copilot Fork Upstream Sync ==="
echo ""

cd "$PLUGIN_REPO"
FORK_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
echo "Fork branch:    $FORK_BRANCH"
echo "Upstream:       $UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
echo ""

if [[ -n "$(git status --porcelain)" ]]; then
  echo "You have uncommitted changes:"
  git status --short
  echo ""
  read -rp "Stash them and continue? [y/N] " answer
  if [[ "$answer" =~ ^[Yy]$ ]]; then
    git stash push -m "sync-upstream auto-stash $(timestamp)"
    STASHED=1
  else
    die "Aborting. Commit or stash your changes first."
  fi
else
  STASHED=0
fi

echo "Fetching upstream..."
git fetch "$UPSTREAM_REMOTE"

LOCAL_HEAD="$(git rev-parse HEAD)"
UPSTREAM_HEAD="$(git rev-parse "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH")"
MERGE_BASE="$(git merge-base HEAD "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH")"

if [[ "$MERGE_BASE" == "$UPSTREAM_HEAD" ]]; then
  echo "Already up to date with $UPSTREAM_REMOTE/$UPSTREAM_BRANCH."
  if [[ "$STASHED" -eq 1 ]]; then
    git stash pop
  fi
  exit 0
fi

BEHIND_COUNT="$(git rev-list --count HEAD.."$UPSTREAM_REMOTE/$UPSTREAM_BRANCH")"
AHEAD_COUNT="$(git rev-list --count "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"..HEAD)"
echo "Upstream has $BEHIND_COUNT new commit(s). Fork has $AHEAD_COUNT custom commit(s)."
echo ""

echo "Rebasing $FORK_BRANCH onto $UPSTREAM_REMOTE/$UPSTREAM_BRANCH..."
if ! git rebase "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"; then
  echo ""
  echo "CONFLICT detected during rebase."
  echo ""
  echo "To resolve manually:"
  echo "  cd $PLUGIN_REPO"
  echo "  # fix conflicts in the listed files"
  echo "  git add <resolved-files>"
  echo "  git rebase --continue"
  echo ""
  echo "To abort and go back to where you were:"
  echo "  git rebase --abort"
  echo ""
  if [[ "$STASHED" -eq 1 ]]; then
    echo "Your stashed changes are still saved. Run 'git stash pop' after resolving."
  fi
  exit 1
fi

echo ""
echo "Rebase succeeded. Building plugin..."
npm run build

echo ""
echo "Deploying to production vault..."
cp main.js "$OFFICIAL_PLUGIN_DIR/main.js"
cp manifest.json "$OFFICIAL_PLUGIN_DIR/manifest.json"
cp styles.css "$OFFICIAL_PLUGIN_DIR/styles.css"

if [[ "$STASHED" -eq 1 ]]; then
  echo "Restoring stashed changes..."
  git stash pop
fi

echo ""
echo "=== Sync complete ==="
echo ""
echo "  Upstream commits pulled:  $BEHIND_COUNT"
echo "  Fork custom commits:      $AHEAD_COUNT"
echo "  Plugin deployed to:       $OFFICIAL_PLUGIN_DIR"
echo ""
echo "Reload the plugin in Obsidian to pick up the changes."
