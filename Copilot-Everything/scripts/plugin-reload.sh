#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_command obsidian
TARGET_PLUGIN_ID="${1:-$PLUGIN_ID}"
TARGET_VAULT_NAME="${2:-${TARGET_VAULT_NAME_OVERRIDE:-$(vault_name "$DEV_VAULT")}}"

ensure_obsidian_running "$TARGET_VAULT_NAME"

obsidian "vault=$TARGET_VAULT_NAME" plugin:reload "id=$TARGET_PLUGIN_ID"
echo "Requested reload for $TARGET_PLUGIN_ID in vault $TARGET_VAULT_NAME"
