#!/bin/bash
# TrevClaw-Obsidianodus-backup.sh — back up the TrevClaw-Obsidianodus monorepo
# to an encrypted external drive.
#
# Creates a timestamped `git bundle --all` (full history, all branches, all tags)
# on the target volume and verifies it. Produces files named
# TrevClaw-Obsidianodus-YYYYMMDD-HHMM.bundle so they match the canonical
# backup bundle ~/TrevClaw-Obsidianodus.bundle on disk.
#
# Usage:
#   scripts/TrevClaw-Obsidianodus-backup.sh                       # auto-detect external drive
#   scripts/TrevClaw-Obsidianodus-backup.sh /Volumes/<drive-name>  # explicit target
#
# Prerequisites:
#   The encrypted USB drive must already be unlocked (PIN entered on the keypad)
#   and mounted as a writable filesystem before running this script.

set -euo pipefail

SRC="/Users/myhome/TrevClaw-Obsidianodus"
TARGET="${1:-}"

# Auto-detect a writable external volume when no arg is given.
# Excludes the system disk and the Obsidian vault volume.
if [ -z "$TARGET" ]; then
  for v in /Volumes/*/; do
    name=$(basename "$v")
    case "$name" in
      "Macintosh HD"|"ExtraCurricular") continue ;;
    esac
    if [ -w "$v" ]; then
      TARGET="$v"
      echo "auto-detected target: $TARGET"
      break
    fi
  done
fi

if [ -z "$TARGET" ] || [ ! -d "$TARGET" ]; then
  echo "ERROR: no writable external volume found." >&2
  echo "  Unlock + mount your encrypted drive, then re-run." >&2
  echo "  Or pass the path explicitly: $0 /Volumes/<drive-name>" >&2
  echo "  Currently mounted under /Volumes/: $(ls /Volumes/ | tr '\n' ' ')" >&2
  exit 1
fi

STAMP=$(date +%Y%m%d-%H%M)
BUNDLE="${TARGET%/}/TrevClaw-Obsidianodus-${STAMP}.bundle"

echo "creating bundle (all refs): $BUNDLE"
git -C "$SRC" bundle create "$BUNDLE" --all
echo "verifying:"
git -C "$SRC" bundle verify "$BUNDLE" 2>&1 | tail -2
echo "size: $(du -h "$BUNDLE" | awk '{print $1}')"

echo
echo "all bundles on target (newest first):"
ls -lht "${TARGET%/}"/TrevClaw-Obsidianodus-*.bundle 2>/dev/null | awk '{print "  "$5"  "$9}'
echo
echo "done. eject the drive when finished:"
echo "  diskutil eject \"$TARGET\""
