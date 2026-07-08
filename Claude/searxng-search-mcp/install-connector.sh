#!/bin/zsh
# Stage the searxng-search MCP connector to the INTERNAL volume and (re)install deps.
#
# Why: Claude Desktop spawns the MCP server with the nvm `node`, and macOS TCC's
# "Removable Volumes" gate denies that binary read access to /Volumes/ExtraCurricular
# (EPERM at module load — same failure class as the launchd TLS-proxy gotcha in the
# root CLAUDE.md). The connector never reads the external volume at runtime, so the
# fix is the repo's canonical one: run from a staged internal-volume copy.
#
# The repo copy (this directory) stays source-of-truth. RE-RUN THIS SCRIPT AFTER
# EDITING ANY FILE UNDER src/ to re-sync the staged copy.
set -e -u
set -o pipefail

SRC_DIR="${0:A:h}"                                  # repo connector root
DEST="$HOME/.claude/mcp-servers/searxng-search"     # internal-volume runtime copy
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"

echo "== stage $SRC_DIR -> $DEST =="
mkdir -p "$DEST"
rsync -a --delete "$SRC_DIR/src" "$DEST/"
rsync -a "$SRC_DIR/package.json" "$SRC_DIR/package-lock.json" "$DEST/"

echo "== install production deps in the staged copy =="
cd "$DEST"
npm ci --omit=dev --no-audit --no-fund

echo "== verify the staged copy loads =="
node -e "require('$DEST/src/tools.js'); console.log('staged connector loads OK:', '$DEST/src/server.js')"

echo ""
echo "Done. All Claude configs should point at:"
echo "  $DEST/src/server.js"
