#!/usr/bin/env bash
# miyo-mcp-probe.sh — build the vault bridge, then run its Miyo probe.
#
# It rebuilds dist/ in $BRIDGE_REPO, the main checkout's package, which is the build obsidian-bridge-launcher
# spawns. Do not run it while a rollback to a saved dist/ is in place (ops/security/vault-ipc-2026-11-25.md,
# Rollback): the rebuild would put the current source back.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_command npm
require_command node

PACKAGE_DIR="$BRIDGE_REPO"

cd "$PACKAGE_DIR"
npm run --silent build >/dev/null
npm run --silent probe:miyo -- "$@"
