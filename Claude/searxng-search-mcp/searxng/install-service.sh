#!/bin/zsh
# Install (or reload) the boot-persistent launchd unit for the private SearXNG
# instance. Idempotent: safe to re-run after editing the plist template.
#
# Paths all resolve to the INTERNAL volume so the launchd user-agent can read
# them (the /Volumes/ExtraCurricular TCC gotcha). Run WITHOUT sudo — this is a
# user LaunchAgent, not a system daemon.
set -e -u
set -o pipefail

LABEL="com.trevorrobey.searxng"
HERE="${0:A:h}"                       # dir containing this script (repo copy)
TEMPLATE="$HERE/com.trevorrobey.searxng.plist.template"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
VENV_PY="$HOME/.local/share/searxng/venv/bin/python"
SETTINGS="$HOME/.config/searxng/settings.yml"

echo "== preflight =="
[ -x "$VENV_PY" ]   || { echo "ERROR: venv python not found at $VENV_PY — run the install first." >&2; exit 1; }
[ -f "$SETTINGS" ]  || { echo "ERROR: settings not found at $SETTINGS." >&2; exit 1; }
[ -f "$TEMPLATE" ]  || { echo "ERROR: plist template missing at $TEMPLATE." >&2; exit 1; }
echo "venv python: OK   settings: OK   template: OK"

echo "== render plist -> $PLIST =="
mkdir -p "$HOME/Library/LaunchAgents"
sed "s|__HOME__|$HOME|g" "$TEMPLATE" > "$PLIST"
plutil -lint "$PLIST"

echo "== (re)load service =="
DOMAIN="gui/$(id -u)"
launchctl bootout   "$DOMAIN/$LABEL" 2>/dev/null || true
# bootout returns before launchd has finished removing the job. A bootstrap in that window fails
# with "Bootstrap failed: 5: Input/output error" and leaves the unit UNLOADED, so SearXNG stays
# down (seen 2026-11-15). Wait until launchd no longer knows the label: at most 10 s, which covers
# the job's 5 s exit timeout. Fail loudly rather than load the new plist over a job still there.
for attempt in {1..50}; do
  launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1 || break
  sleep 0.2
done
if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
  echo "ERROR: launchd still holds $LABEL 10 s after bootout; not loading the new plist over it." >&2
  echo "       Inspect it with: launchctl print $DOMAIN/$LABEL" >&2
  exit 1
fi
echo "old job gone (check $attempt of 50)"
if ! launchctl bootstrap "$DOMAIN" "$PLIST"; then
  echo "ERROR: bootstrap failed, so $LABEL is NOT loaded and SearXNG is down." >&2
  echo "       Re-run this script, or run: launchctl bootstrap $DOMAIN $PLIST" >&2
  exit 1
fi
launchctl enable    "$DOMAIN/$LABEL" 2>/dev/null || true
launchctl kickstart -k "$DOMAIN/$LABEL"

echo "== verify =="
sleep 1 2>/dev/null || true
launchctl print "$DOMAIN/$LABEL" 2>/dev/null | grep -E 'state|pid' | head -3 || true
echo "Done. Health-check:  curl -s 'http://127.0.0.1:8890/search?q=test&format=json' | head -c 80"
