#!/usr/bin/env bash
#
# install-raycast.sh — makes this repo the source of truth for Raycast.
#
#   1. AI providers: copies the repo template to ~/.config/raycast/ai/providers.yaml
#      ONLY if that file does not exist yet (it holds the Copilot Plus licence key,
#      so it is never overwritten and never committed). chmod 600.
#   2. Extension: installs deps and runs `ray build` on
#      Copilot-Everything/bridges/raycast-obsidian-extension to prove it compiles.
#      Raycast loads the extension from `ray develop` (npm run dev), which copies the
#      build into ~/.config/raycast/extensions/obsidian-bridge-fork; run it once after
#      source changes, wait for "built extension successfully", then Ctrl-C.
#
# Run from anywhere:
#   bash /Users/myhome/TrevClaw-Obsidianodus/ops/tr-suite/install-raycast.sh
#
# Never touches ~/.config/raycast/config.json (Raycast account tokens).

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMPLATE="$REPO/Copilot-Everything/configs/raycast/providers.copilot-plus.template.yaml"
EXT="$REPO/Copilot-Everything/bridges/raycast-obsidian-extension"
LIVE="$HOME/.config/raycast/ai/providers.yaml"

mkdir -p "$(dirname "$LIVE")"
if [[ -f "$LIVE" ]]; then
  echo "providers.yaml already present — left as is ($LIVE)"
else
  cp "$TEMPLATE" "$LIVE"
  echo "installed $LIVE from template — paste the Copilot Plus licence key into it"
fi
chmod 600 "$LIVE"

npm --prefix "$EXT" ci
npm --prefix "$EXT" run build
echo "raycast extension builds cleanly from $EXT"
echo "to load it into Raycast: npm --prefix \"$EXT\" run dev   (Ctrl-C once it says built)"
echo "verify: bash $REPO/ops/tr-suite/verify.sh"
