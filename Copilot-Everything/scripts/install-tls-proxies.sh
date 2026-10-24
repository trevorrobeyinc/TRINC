#!/usr/bin/env bash
#
# install-tls-proxies.sh
#
# Stage the in-monorepo TLS-terminating proxy scripts onto the *internal* volume
# and repoint their launchd units at the staged copies.
#
# Why this exists
# ---------------
# ORIGINALLY (2026-06-03): this monorepo lived on an external volume
# (/Volumes/ExtraCurricular/...). On modern macOS a launchd user-agent's TCC
# context is NOT granted read access to removable / external volumes, even when
# the interactive Terminal is, so the proxy launchd units died at startup with:
#
#   Error: EPERM: operation not permitted, open '/Volumes/.../<name>-tls-proxy.mjs'
#
# UPDATE 2026-07-26: the monorepo moved to /Users/myhome/TrevClaw-Obsidianodus (renamed
# /Users/myhome/TRINC on 2026-10-23) on
# the internal, FileVault-protected disk, so that specific TCC wall no longer
# applies to this repo. The staging pattern is KEPT anyway, for two reasons:
#   1. The launchd units currently point at the staged copies. Repointing them at
#      the repo would be a live change to five running services for no gain.
#   2. Staging keeps launchd's runtime independent of where the repo lives, so a
#      future relocation cannot silently break TLS termination.
# Treat the EPERM story above as the historical origin, not a current constraint.
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
# (lm-studio removed 2026-07-16 — LM Studio decommissioned. Ollama RE-ADDED 2026-08-12:
#  Ollama.app was reinstalled and resumed serving plaintext :11434, which the transport
#  lint still forbids; the :11435 wrap is restored so the Obsidian Copilot plugin can
#  reach local qwen2.5-coder over TLS instead of plaintext loopback.)
UNITS=(miyo qdrant searxng ollama)

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
