#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

WITH_OFFICIAL=0
if [[ "${1:-}" == "--with-official" ]]; then
  WITH_OFFICIAL=1
fi

"$SCRIPT_DIR/dev-build.sh"
DEV_CONFIG_DIR="$(ensure_dev_vault)"
TARGET_LINK="$DEV_CONFIG_DIR/plugins/$PLUGIN_ID"

if [[ -e "$TARGET_LINK" || -L "$TARGET_LINK" ]]; then
  BACKUP_PATH="$(backup_target "$TARGET_LINK" "deploy-$PLUGIN_ID" || true)"
  if [[ -n "${BACKUP_PATH:-}" ]]; then
    echo "Backed up previous plugin target to $BACKUP_PATH"
  fi
  rm -rf "$TARGET_LINK"
fi

ln -s "$RUNTIME_PLUGIN_DIR" "$TARGET_LINK"
sync_community_plugins_file "$DEV_CONFIG_DIR" "$PLUGIN_ID"

if [[ "$WITH_OFFICIAL" -eq 1 ]]; then
  copy_official_plugin_to_dev_vault "$DEV_CONFIG_DIR"
  sync_community_plugins_file "$DEV_CONFIG_DIR" "$PLUGIN_ID" "$OFFICIAL_PLUGIN_ID"
fi

record_migration_event "deploy-runtime" "$RUNTIME_PLUGIN_DIR" "$TARGET_LINK" "ok"
echo "Deployed $PLUGIN_ID into $TARGET_LINK"
echo "Detected dev vault config dir: $DEV_CONFIG_DIR"
