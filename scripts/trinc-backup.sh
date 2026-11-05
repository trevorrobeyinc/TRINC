#!/bin/bash
# trinc-backup.sh — cut the TRINC full-history backup the way the root CLAUDE.md
# ("Hosting, pushes and backups") documents it: ONE `git bundle --all` kept as TWO
# byte-identical copies,
#     ~/Documents/TRINC-FULL-backup-YYYYMMDD-HHMM.bundle
#     /Volumes/ExtraCurricular/Backups/TRINC-FULL-backup-YYYYMMDD-HHMM.bundle
#
# Rewritten 2026-11-05: the 2026-10-23 version auto-detected a separate keypad USB drive,
# SKIPPED ExtraCurricular (its comment called it the Obsidian vault volume; the vault is the
# local ~/My Digital Garden), wrote to the volume root and never made the ~/Documents copy,
# so it could not produce the documented backup at all.
#
# Usage:
#   bash /Users/myhome/TRINC/scripts/trinc-backup.sh                 # cut, verify, mirror
#   bash /Users/myhome/TRINC/scripts/trinc-backup.sh --prune         # ...then move superseded bundles to the Trash
#   bash /Users/myhome/TRINC/scripts/trinc-backup.sh /Volumes/<drive>/Backups   # mirror elsewhere
#
# It refuses (and creates nothing) when the mirror folder is missing or not writable, and it
# deletes nothing: --prune MOVES superseded bundles to the Trash, and only after the new bundle
# has verified and its mirror matched byte for byte.
#
# Still manual, by design (steps in Drive's TRINC/Backups/README-RESTORE.md): the business-Drive
# snapshot (`git archive`, no history) and the "Current" line in the root CLAUDE.md.
# The bundle itself never goes to cloud storage (decision 2026-08-17).
#
# Test overrides: TRINC_BACKUP_SRC, TRINC_BACKUP_LOCAL_DIR, TRINC_BACKUP_TRASH.

set -euo pipefail

SRC="${TRINC_BACKUP_SRC:-/Users/myhome/TRINC}"
LOCAL_DIR="${TRINC_BACKUP_LOCAL_DIR:-$HOME/Documents}"
TRASH="${TRINC_BACKUP_TRASH:-$HOME/.Trash}"
MIRROR_DIR="/Volumes/ExtraCurricular/Backups"
PRUNE=0

for arg in "$@"; do
  case "$arg" in
    --prune) PRUNE=1 ;;
    -h|--help) sed -n '2,27p' "$0"; exit 0 ;;
    -*) echo "unknown option: $arg (see --help)" >&2; exit 2 ;;
    *) MIRROR_DIR="${arg%/}" ;;
  esac
done

fail() { echo "ERROR: $*" >&2; exit 1; }

# 1. Check everything BEFORE writing anything.
git -C "$SRC" rev-parse --git-dir >/dev/null 2>&1 || fail "$SRC is not a git repository"
[ -d "$LOCAL_DIR" ] && [ -w "$LOCAL_DIR" ] || fail "local folder $LOCAL_DIR is missing or not writable"
if [ ! -d "$MIRROR_DIR" ]; then
  case "$MIRROR_DIR" in
    /Volumes/*)
      vol="/Volumes/$(echo "${MIRROR_DIR#/Volumes/}" | cut -d/ -f1)"
      [ -d "$vol" ] || fail "$vol is not mounted: unlock and mount the drive, then re-run (mounted: $(ls /Volumes/ | tr '\n' ' '))" ;;
  esac
  fail "mirror folder $MIRROR_DIR does not exist (create it, or pass another folder)"
fi
[ -w "$MIRROR_DIR" ] || fail "mirror folder $MIRROR_DIR is not writable"

STAMP=$(date +%Y%m%d-%H%M)
NAME="TRINC-FULL-backup-${STAMP}.bundle"
LOCAL="$LOCAL_DIR/$NAME"
MIRROR="$MIRROR_DIR/$NAME"
[ -e "$LOCAL" ] || [ -e "$MIRROR" ] && fail "$NAME already exists; wait a minute and re-run"

dirty=$(git -C "$SRC" status --porcelain | wc -l | tr -d ' ')
[ "$dirty" -gt 0 ] && echo "note: $dirty uncommitted or untracked path(s) are NOT in a bundle (it carries commits only)"

# 2. Cut and verify.
echo "creating $LOCAL"
git -C "$SRC" bundle create "$LOCAL" --all
verdict=$(git -C "$SRC" bundle verify "$LOCAL" 2>&1 || true)
if ! grep -q "is okay" <<<"$verdict" || ! grep -q "records a complete history" <<<"$verdict"; then
  echo "$verdict" | grep -v -E '^[0-9a-f]{40} ' >&2
  fail "verification failed; the bad bundle is left at $LOCAL for inspection"
fi
refs=$(git -C "$SRC" bundle list-heads "$LOCAL" | wc -l | tr -d ' ')

# 3. Mirror and compare byte for byte.
cp -p "$LOCAL" "$MIRROR"
sum_local=$(shasum -a 256 "$LOCAL" | cut -d' ' -f1)
sum_mirror=$(shasum -a 256 "$MIRROR" | cut -d' ' -f1)
[ "$sum_local" = "$sum_mirror" ] || fail "mirror copy differs from the local bundle ($sum_mirror vs $sum_local)"

bytes=$(stat -f %z "$LOCAL")
head=$(git -C "$SRC" log -1 --format='%h %s')
echo
echo "OK  $NAME"
echo "    verified: is okay, records a complete history ($refs refs)"
echo "    sha256:   $sum_local  ($bytes bytes), identical in both copies"
echo "    HEAD:     $head"
if git -C "$SRC" rev-parse -q --verify origin/main >/dev/null; then
  read -r behind ahead < <(git -C "$SRC" rev-list --left-right --count origin/main...main)
  echo "    GitHub:   main is $ahead ahead / $behind behind origin/main (as of the last fetch or push)"
fi
echo "    copies:   $LOCAL"
echo "              $MIRROR"

# 4. Superseded bundles: one version is kept (as two copies).
old=()
for d in "$LOCAL_DIR" "$MIRROR_DIR"; do
  for f in "$d"/TRINC-FULL-backup-*.bundle; do
    [ -e "$f" ] && [ "$(basename "$f")" != "$NAME" ] && old+=("$f")
  done
done
if [ ${#old[@]} -gt 0 ]; then
  echo
  if [ "$PRUNE" -eq 1 ]; then
    mkdir -p "$TRASH"
    for f in "${old[@]}"; do
      dest="$TRASH/$(basename "$f")"
      [ -e "$dest" ] && dest="$TRASH/$(basename "$f" .bundle).from-$(basename "$(dirname "$f")").bundle"
      mv "$f" "$dest"
      echo "moved to Trash: $f"
    done
  else
    echo "superseded (keep one version; re-run with --prune, or move them to the Trash yourself):"
    printf '  %s\n' "${old[@]}"
  fi
fi

echo
echo "next, by hand: refresh the Drive snapshot (Drive: TRINC/Backups/README-RESTORE.md) and the"
echo "\"Current\" backup line in /Users/myhome/TRINC/CLAUDE.md."
echo "eject the drive when finished: diskutil eject \"/Volumes/$(echo "${MIRROR_DIR#/Volumes/}" | cut -d/ -f1)\""
