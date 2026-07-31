#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

ensure_workspace_layout
DEV_CONFIG_DIR="$(ensure_dev_vault)"

if [[ ! -f "$DEV_VAULT/README.md" ]]; then
  cat >"$DEV_VAULT/README.md" <<'EOF'
# Copilot MCP Dev Vault

This dedicated vault is the primary safe target for developing the `obsidian-copilot-mcp` fork,
which deploys under its REAL plugin id `copilot` (upstream-exact identity since 9c7ce09a — see
scripts/lib.sh). Side-by-side fork-vs-official installs were retired 2026-07-31: one id loads
once per vault.

- Source code lives outside the vault in `/Users/myhome/TrevClaw-Obsidianodus/Copilot-Everything`.
- Built runtime bundles are deployed into the vault's plugin directory.
- Runtime note/plugin data may still live in the vault by design.
EOF
fi

touch "$DEV_VAULT/.copilot-mcp-dev-vault"

echo "Workspace bootstrap complete."
echo "Dev vault: $DEV_VAULT"
echo "Detected config dir: $DEV_CONFIG_DIR"
