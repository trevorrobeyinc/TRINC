#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

# --with-official RETIRED 2026-07-31: since 9c7ce09a (2026-05-23) the fork's manifest id
# IS "copilot", and one id can only load once per vault — a side-by-side install of fork
# and official is structurally impossible, and the production official slot already runs
# this fork. A/B-compare across vaults instead (this dev vault vs the production vault).
if [[ "${1:-}" == "--with-official" ]]; then
  die "--with-official was retired 2026-07-31: the fork's manifest id IS \"copilot\" (9c7ce09a), so a same-vault side-by-side is impossible. A/B across vaults instead."
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

record_migration_event "deploy-runtime" "$RUNTIME_PLUGIN_DIR" "$TARGET_LINK" "ok"
echo "Deployed $PLUGIN_ID into $TARGET_LINK"
echo "Detected dev vault config dir: $DEV_CONFIG_DIR"
