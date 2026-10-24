#!/bin/zsh
# Stage the trinc-content MCP server to its runtime location and (re)install deps.
#
# The repo copy (this directory) is source-of-truth since 2026-10-21, when the server's own
# repo was absorbed into the monorepo with history (e485565). The runtime copy at
# ~/.claude/mcp-servers/trinc-content is what .mcp.json launches; it is a staged deploy
# target, not a second source — it carries no .git and no tests.
#
# RE-RUN THIS SCRIPT AFTER EDITING ANY FILE UNDER src/ to re-sync the staged copy.
# Drift check: bash /Users/myhome/TRINC/ops/tr-suite/verify.sh
set -e -u
set -o pipefail

SRC_DIR="${0:A:h}"                                  # repo server root
DEST="$HOME/.claude/mcp-servers/trinc-content"      # runtime copy named in .mcp.json
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"

echo "== test the repo copy before staging it =="
if [[ -d "$SRC_DIR/node_modules" ]]; then
  (cd "$SRC_DIR" && npm test)
else
  echo "(no node_modules in the repo copy; skipping tests — run 'npm ci && npm test' here to include them)"
fi

echo "== stage $SRC_DIR -> $DEST =="
mkdir -p "$DEST"
if [[ -e "$DEST/.git" ]]; then
  echo "refusing: $DEST holds a .git — it is a deploy target, not a repo. Move the .git out first." >&2
  exit 1
fi
rsync -a --delete "$SRC_DIR/src" "$DEST/"
rsync -a "$SRC_DIR/package.json" "$SRC_DIR/package-lock.json" "$SRC_DIR/README.md" "$DEST/"

echo "== install production deps in the staged copy =="
cd "$DEST"
npm ci --omit=dev --no-audit --no-fund

echo "== verify the staged copy loads =="
node -e "require('$DEST/src/tools.js'); console.log('staged server loads OK:', '$DEST/src/server.js')"

echo ""
echo "Done. .mcp.json should point at:"
echo "  $DEST/src/server.js"
echo "Restart the Claude session (or reconnect the server) to pick up the new copy."
