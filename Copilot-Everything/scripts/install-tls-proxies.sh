#!/usr/bin/env bash
#
# install-tls-proxies.sh
#
# Stage the in-monorepo TLS-terminating proxy scripts onto the *internal* volume
# and repoint their launchd units at the staged copies.
#
# Why this exists
# ---------------
# This monorepo lives on an external volume (/Volumes/ExtraCurricular/...). On
# modern macOS, a launchd user-agent's TCC context is NOT granted read access to
# removable / external volumes, even when the interactive Terminal is. The five
# proxy launchd units therefore die at startup with:
#
#   Error: EPERM: operation not permitted, open '/Volumes/.../<name>-tls-proxy.mjs'
#
# The repo copies under Copilot-Everything/scripts/ remain the source of truth.
# This installer copies them to ~/.local/share/trevclaw-tls-proxies/ (internal,
# not TCC-gated for the user's own agents) and rewrites each plist's
# ProgramArguments script path to the staged copy, then reloads the unit.
#
# Re-run this after editing any *-tls-proxy.mjs in the repo to re-sync the
# staged copy. Idempotent.
#
# HTTPS-only invariant: this script only relocates where launchd reads the
# proxy *source* from. It changes no transport behavior — the proxies still
# throw on cert-load failure and never fall back to plaintext.

set -euo pipefail

REPO_SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAGE_DIR="$HOME/.local/share/trevclaw-tls-proxies"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
PLIST_BUDDY="/usr/libexec/PlistBuddy"

# launchd label suffix == proxy script basename stem
UNITS=(miyo qdrant lm-studio ollama searxng)

mkdir -p "$STAGE_DIR"

uid="$(id -u)"
installed=0
skipped=0

for name in "${UNITS[@]}"; do
  src="$REPO_SCRIPTS/${name}-tls-proxy.mjs"
  staged="$STAGE_DIR/${name}-tls-proxy.mjs"
  label="com.trevorrobey.${name}-tls-proxy"
  plist="$LAUNCH_AGENTS/${label}.plist"

  if [[ ! -f "$src" ]]; then
    echo "skip ${name}: repo script missing ($src)"
    skipped=$((skipped + 1))
    continue
  fi
  if [[ ! -f "$plist" ]]; then
    echo "skip ${name}: launchd plist missing ($plist)"
    skipped=$((skipped + 1))
    continue
  fi

  # 1. Stage the script onto the internal volume.
  cp -f "$src" "$staged"

  # 2. Repoint the plist's ProgramArguments script path (index 1) at the stage.
  "$PLIST_BUDDY" -c "Set :ProgramArguments:1 $staged" "$plist"

  # 3. Reload the unit so the new path takes effect.
  launchctl bootout "gui/${uid}/${label}" 2>/dev/null || true
  launchctl bootstrap "gui/${uid}" "$plist" 2>/dev/null \
    || { launchctl unload "$plist" 2>/dev/null || true; launchctl load "$plist"; }

  echo "installed ${name}: launchd -> $staged"
  installed=$((installed + 1))
done

echo
echo "staged proxies in: $STAGE_DIR"
echo "installed=$installed skipped=$skipped"
echo
echo "launchd units:"
launchctl list | grep -E "com\.trevorrobey\..*-tls-proxy" || echo "  (none found)"
