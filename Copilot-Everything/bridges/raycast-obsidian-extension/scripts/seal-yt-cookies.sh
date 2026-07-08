#!/bin/bash
# seal-yt-cookies.sh — (re)seal a browser cookies.txt for the Raycast
# "Video Download & Transcribe" command, encrypted to the YubiKey OpenPGP [E] subkey.
#
# WHY: yt-dlp's --cookies-from-browser decrypts Chrome's cookie store via the macOS
# login keychain ("Chrome Safe Storage"), which pops the keychain-password dialog on
# every run. Sealing the jar to the YubiKey replaces that with the host's standard
# pinentry PIN + physical-touch ceremony (same consent model as the other
# operator-approved gates). Run-time decrypt = PIN + touch; sealing here is
# public-key-only, so it needs NO PIN and NO touch and can only lock harder.
#
# usage:
#   seal-yt-cookies.sh <cookies.txt> [--shred]     seal an already-exported cookies file
#   seal-yt-cookies.sh --from-browser <browser>    export via yt-dlp (triggers ONE final
#                                                  keychain prompt), then seal + shred
#
# output: ~/.local/share/raycast-obsidian/sealed-cookies.txt.gpg (0600) — the extension
# picks this default path up automatically; no Raycast preference change needed.
#
# Cookies expire. When downloads start failing with 401/403 again, re-run this script
# to reseal a fresh jar.

set -euo pipefail

# Hardcoded to this YubiKey's ENC subkey (mirrors operator-approved-gate's reseal
# recipient policy) — no env var or recipient file can redirect it to a touchless soft key.
RECIPIENT_FPR="E7C4694D7DB0662664DC19812A352147A9DF24AA"
DEST_DIR="$HOME/.local/share/raycast-obsidian"
DEST="$DEST_DIR/sealed-cookies.txt.gpg"

GPG="$(command -v gpg || echo /opt/homebrew/bin/gpg)"
YTDLP="${YTDLP:-/opt/homebrew/bin/yt-dlp}"

fail() { echo "seal-yt-cookies: $*" >&2; exit 1; }

[ -x "$GPG" ] || fail "gpg not found"
"$GPG" --list-keys "$RECIPIENT_FPR" >/dev/null 2>&1 || fail "YubiKey [E] subkey $RECIPIENT_FPR not in keyring"

SRC=""
SHRED_SRC=0

case "${1:-}" in
  "")
    fail "usage: seal-yt-cookies.sh <cookies.txt> [--shred] | --from-browser <browser>"
    ;;
  --from-browser)
    BROWSER="${2:-chrome}"
    [ -x "$YTDLP" ] || fail "yt-dlp not found at $YTDLP"
    TMP_DIR="$(mktemp -d)"
    chmod 700 "$TMP_DIR"
    SRC="$TMP_DIR/cookies.txt"
    SHRED_SRC=1
    echo "Exporting $BROWSER cookies via yt-dlp — expect ONE final macOS keychain prompt..."
    # --skip-download against linkedin.com just forces the cookie jar load; yt-dlp writes
    # the --cookies jar on exit even when the extractor itself reports nothing to download.
    "$YTDLP" --cookies-from-browser "$BROWSER" --cookies "$SRC" \
      --skip-download --no-warnings --ignore-errors "https://www.linkedin.com/" >/dev/null 2>&1 || true
    [ -s "$SRC" ] || fail "cookie export produced no data (keychain prompt cancelled?)"
    ;;
  *)
    SRC="$1"
    [ -s "$SRC" ] || fail "cookies file not found or empty: $SRC"
    [ "${2:-}" = "--shred" ] && SHRED_SRC=1
    ;;
esac

mkdir -p "$DEST_DIR"
chmod 700 "$DEST_DIR"

"$GPG" --batch --yes --encrypt --recipient "$RECIPIENT_FPR" --output "$DEST" "$SRC"
chmod 600 "$DEST"

if [ "$SHRED_SRC" = "1" ]; then
  rm -P "$SRC" 2>/dev/null || rm -f "$SRC"
  [ -n "${TMP_DIR:-}" ] && rmdir "$TMP_DIR" 2>/dev/null || true
  echo "Plaintext jar shredded."
else
  echo "NOTE: plaintext left at $SRC — delete it (rm -P) once you've verified a run."
fi

# No verify-decrypt here: that would spend a YubiKey PIN+touch ceremony outside an
# operator-approved run. The first Raycast "Video Download & Transcribe" run proves the seal.
echo "Sealed → $DEST"
echo "Recipient: YubiKey [E] $RECIPIENT_FPR (decrypt = PIN + physical touch, at Raycast run time)"
