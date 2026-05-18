#!/usr/bin/env bash
#
# copilot-update-watcher.sh
#
# Invoked by the LaunchAgent ai.copilot-fork.update-watcher whenever the
# deployed Copilot plugin's manifest.json changes. Decides whether the
# change is a real upstream upgrade (run sync-copilot-fork.sh) or our own
# self-induced redeploy (silently exit).
#
# Idempotency mechanism — STAMP FILE:
#   Path: $HOME/.local/state/copilot-update-watcher/last-seen.sha256
#   Contains: SHA-256 of the manifest.json the watcher last reacted to.
#   On invocation:
#     - hash deployed manifest
#     - if hash == stamp → silent exit (this fire is our own redeploy)
#     - otherwise → log the upgrade, run the sync, update the stamp
#   The sync script rewrites the manifest with whatever upstream + fork
#   produces, which would otherwise re-fire launchd. The stamp absorbs that
#   self-fire.
#
# Logs:
#   Event log (one line per real upgrade event):
#     /Users/trevorrobey/THE Copilot in Obsidian Everything/logs/copilot-update-watcher.log
#   Diagnostic stdout/stderr (full launchd output):
#     ~/Library/Logs/copilot-fork-update-watcher.{out,err}.log
#
# Manual install/uninstall:
#   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.copilot-fork.update-watcher.plist
#   launchctl bootout    gui/$(id -u)/ai.copilot-fork.update-watcher

set -euo pipefail

# Absolute paths — launchd has no cwd and minimal PATH.
WORKSPACE="/Users/trevorrobey/TrevClaw-Obsidianodus/Copilot-Everything"
SYNC_SCRIPT="$WORKSPACE/scripts/sync-copilot-fork.sh"
DEPLOY_MANIFEST="/Volumes/ExtraCurricular/My Digital Garden/.obsidian/plugins/copilot/manifest.json"
EVENT_LOG="$WORKSPACE/logs/copilot-update-watcher.log"
STATE_DIR="$HOME/.local/state/copilot-update-watcher"
STAMP_FILE="$STATE_DIR/last-seen.sha256"

# Ensure PATH covers homebrew + npm globals so git/node/npm/obsidian resolve.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.npm-global/bin:$PATH"

mkdir -p "$STATE_DIR"
mkdir -p "$(dirname "$EVENT_LOG")"

# ────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────

ts() { date '+%Y-%m-%dT%H:%M:%S%z'; }

log_event() {
    printf '[%s] %s\n' "$(ts)" "$*" >> "$EVENT_LOG"
}

manifest_hash() {
    if [[ ! -f "$DEPLOY_MANIFEST" ]]; then
        echo "missing"
        return
    fi
    shasum -a 256 "$DEPLOY_MANIFEST" | awk '{print $1}'
}

manifest_version() {
    if [[ ! -f "$DEPLOY_MANIFEST" ]]; then
        echo "missing"
        return
    fi
    /usr/bin/python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('version','?'))" "$DEPLOY_MANIFEST" 2>/dev/null || echo "?"
}

# ────────────────────────────────────────────────────────────
# Main
# ────────────────────────────────────────────────────────────

CURRENT_HASH="$(manifest_hash)"
LAST_HASH=""
[[ -f "$STAMP_FILE" ]] && LAST_HASH="$(cat "$STAMP_FILE")"

# Self-induced fire (we just rewrote the manifest as part of a sync) → exit silently.
if [[ -n "$LAST_HASH" && "$CURRENT_HASH" == "$LAST_HASH" ]]; then
    exit 0
fi

# Bootstrap case: no stamp yet → record current hash as baseline and exit
# without running sync. We only react to changes after the watcher is established.
if [[ -z "$LAST_HASH" ]]; then
    echo -n "$CURRENT_HASH" > "$STAMP_FILE"
    log_event "watcher initialized (manifest hash $CURRENT_HASH, version $(manifest_version)); no sync run on bootstrap"
    exit 0
fi

OLD_VERSION="(prev)"
NEW_VERSION="$(manifest_version)"
log_event "detected manifest change: hash $LAST_HASH → $CURRENT_HASH, version $OLD_VERSION → $NEW_VERSION; running sync"

# Debounce: Obsidian's installer may write multiple files; give it a beat.
sleep 5

# Run the sync script as a normal subprocess. Capture exit code.
SYNC_OUT_FILE="$(mktemp -t copilot-sync.out.XXXXXX)"
SYNC_ERR_FILE="$(mktemp -t copilot-sync.err.XXXXXX)"
SYNC_RC=0
"$SYNC_SCRIPT" >"$SYNC_OUT_FILE" 2>"$SYNC_ERR_FILE" || SYNC_RC=$?

# Refresh hash AFTER sync — main.js redeploy in the sync may have rewritten manifest too.
POST_HASH="$(manifest_hash)"
POST_VERSION="$(manifest_version)"

if [[ $SYNC_RC -eq 0 ]]; then
    # Update the stamp to the post-sync hash so the redeploy doesn't re-fire.
    echo -n "$POST_HASH" > "$STAMP_FILE"
    FORK_HEAD="$(cd "$WORKSPACE/repos/obsidian-copilot-mcp" && git rev-parse HEAD 2>/dev/null || echo '?')"
    log_event "sync complete: HEAD=$FORK_HEAD ver=$POST_VERSION; post-hash $POST_HASH stamped"
else
    log_event "sync FAILED (rc=$SYNC_RC); see ~/Library/Logs/copilot-fork-update-watcher.err.log and $SYNC_ERR_FILE"
    log_event "sync stderr tail: $(tail -3 "$SYNC_ERR_FILE" | tr '\n' ' | ')"
    # Do NOT update the stamp on failure — the user can fix and the next manifest
    # change (or a manual sync) will retry cleanly.
fi

rm -f "$SYNC_OUT_FILE" "$SYNC_ERR_FILE"
exit "$SYNC_RC"
