#!/usr/bin/env bash
# yt-dlp-impersonate-fix.sh  (2026-06-03)
#
# Makes the Homebrew yt-dlp able to use --impersonate (curl_cffi TLS-fingerprint
# mimicry). The Raycast "Video Download & Transcribe" flow needs this to fetch
# Cloudflare-fronted, login-gated media (e.g. Wiley course videos) — without it
# yt-dlp gets a bare "HTTP Error 403: Forbidden" from Cloudflare even with cookies.
#
# WHY THIS IS NEEDED (version skew, may self-resolve on a future yt-dlp release):
#   Homebrew's yt-dlp runs on python 3.14. curl_cffi only publishes a cp3.14-compatible
#   wheel at 0.15.0, but yt-dlp <= 2026.3.17 caps curl_cffi at <0.15
#   ("Only curl_cffi versions 0.5.10 and 0.10.x through 0.14.x are supported").
#   So we (1) install curl_cffi 0.15.x into yt-dlp's venv and (2) if yt-dlp still
#   rejects it, widen the version gate from <0.15 to <0.16. curl_cffi 0.15.0 works
#   fine with yt-dlp 2026.3.17 at runtime — the gate is merely conservative.
#
# IDEMPOTENT + re-runnable. Re-run after `brew upgrade yt-dlp` / `brew reinstall yt-dlp`
# (which resets the patched file). When a future yt-dlp accepts curl_cffi >=0.15,
# step 3 simply no-ops.
#
# Installs use pip (python-native) — never `curl | bash` (the CrowdStrike curldropper
# Custom-IOA blocks that and must not be weakened).
set -uo pipefail

YTDLP_BIN="${1:-/opt/homebrew/bin/yt-dlp}"
command -v "$YTDLP_BIN" >/dev/null 2>&1 || YTDLP_BIN="$(command -v yt-dlp 2>/dev/null || true)"
[ -n "${YTDLP_BIN:-}" ] || { echo "ERROR: yt-dlp not found"; exit 1; }

CELLAR_PY="$(ls -d /opt/homebrew/Cellar/yt-dlp/*/libexec/bin/python3 2>/dev/null | head -1 || true)"
PY="${CELLAR_PY:-python3}"
echo "yt-dlp     : $YTDLP_BIN"
echo "venv python: $PY"

targets_ok() {
  local out; out="$("$YTDLP_BIN" --list-impersonate-targets 2>/dev/null || true)"
  echo "$out" | grep -qiE 'chrome|safari' && ! echo "$out" | grep -qi 'unavailable'
}

# 0. Already working?
if targets_ok; then echo "OK: impersonation already available — nothing to do."; exit 0; fi

# 1. Ensure curl_cffi is importable by yt-dlp's python.
if ! "$PY" -c "import curl_cffi" 2>/dev/null; then
  echo "installing curl_cffi into yt-dlp venv (pip)..."
  "$PY" -m pip install --quiet curl_cffi || { echo "ERROR: pip install curl_cffi failed"; exit 1; }
fi
echo "curl_cffi  : $("$PY" -c "import curl_cffi; print(curl_cffi.__version__)" 2>/dev/null || echo '?')"

# 2. Works now (curl_cffi was just missing)?
if targets_ok; then echo "OK: impersonation now available."; exit 0; fi

# 3. yt-dlp still rejects the installed curl_cffi version -> widen the <0.15 gate to <0.16.
GATE="$(ls /opt/homebrew/Cellar/yt-dlp/*/libexec/lib/python*/site-packages/yt_dlp/networking/_curlcffi.py 2>/dev/null | head -1 || true)"
[ -n "${GATE:-}" ] || { echo "ERROR: could not locate _curlcffi.py"; exit 1; }
if grep -q 'curl_cffi_version < (0, 15)' "$GATE"; then
  cp "$GATE" "$GATE.bak_impersonate"
  sed -i '' 's/curl_cffi_version < (0, 15)/curl_cffi_version < (0, 16)/' "$GATE"
  echo "widened yt-dlp curl_cffi gate <0.15 -> <0.16 (backup: $GATE.bak_impersonate)"
fi

# 4. Verify.
if targets_ok; then
  echo "OK: impersonation now available."
  "$YTDLP_BIN" --list-impersonate-targets 2>/dev/null | sed -n '1,6p'
else
  echo "WARN: still unavailable. Inspect: $YTDLP_BIN --list-impersonate-targets"
  exit 1
fi
