#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

usage() {
  cat <<'EOF'
Usage:
  settings-import.sh dry-run
  settings-import.sh apply
  settings-import.sh clear
  settings-import.sh rollback <backup-path>
EOF
}

MODE="${1:-dry-run}"
SOURCE_DATA="${SETTINGS_IMPORT_SOURCE:-$PRODUCTION_VAULT/.obsidian/plugins/$OFFICIAL_PLUGIN_ID/data.json}"
DEV_CONFIG_DIR="$(ensure_dev_vault)"
TARGET_DIR="$DEV_CONFIG_DIR/plugins/$PLUGIN_ID"
TARGET_DATA="$TARGET_DIR/data.json"

[[ -f "$SOURCE_DATA" ]] || die "Official plugin settings not found: $SOURCE_DATA"
ensure_dir "$TARGET_DIR"

echo "Source: $SOURCE_DATA"
echo "Target: $TARGET_DATA"

if [[ "$MODE" == "dry-run" ]]; then
  node - "$SOURCE_DATA" <<'NODE'
const fs = require("fs");
const sourcePath = process.argv[2];
const payload = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const keys = Object.keys(payload).sort();
console.log(`Dry run only. Source contains ${keys.length} top-level setting keys.`);
console.log(keys.join("\n"));
NODE
  exit 0
fi

if [[ "$MODE" == "clear" ]]; then
  if [[ -f "$TARGET_DATA" ]]; then
    BACKUP_PATH="$(backup_target "$TARGET_DATA" "settings-$PLUGIN_ID-clear")"
    rm -f "$TARGET_DATA"
    record_migration_event "settings-clear" "$TARGET_DATA" "$BACKUP_PATH" "ok"
    echo "Removed $TARGET_DATA"
    echo "Backup: $BACKUP_PATH"
  else
    echo "No target settings to clear at $TARGET_DATA"
  fi
  exit 0
fi

if [[ "$MODE" == "rollback" ]]; then
  BACKUP_PATH="${2:-}"
  [[ -n "$BACKUP_PATH" ]] || {
    usage
    die "Missing backup path for rollback."
  }
  [[ -f "$BACKUP_PATH" ]] || die "Backup file not found: $BACKUP_PATH"
  cp "$BACKUP_PATH" "$TARGET_DATA"
  record_migration_event "settings-rollback" "$BACKUP_PATH" "$TARGET_DATA" "ok"
  echo "Restored $TARGET_DATA from $BACKUP_PATH"
  exit 0
fi

if [[ "$MODE" != "apply" ]]; then
  usage
  die "Unsupported mode: $MODE"
fi

if [[ -f "$TARGET_DATA" ]]; then
  BACKUP_PATH="$(backup_target "$TARGET_DATA" "settings-$PLUGIN_ID")"
  echo "Backed up existing target settings to $BACKUP_PATH"
fi

node - "$SOURCE_DATA" "$TARGET_DATA" <<'NODE'
const fs = require("fs");
const [sourcePath, targetPath] = process.argv.slice(2);
const payload = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
payload.settingsMigration = {
  importedFromPluginId: "copilot",
  importedAt: new Date().toISOString(),
  mode: "one-time-import",
};
fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2) + "\n");
NODE

record_migration_event "settings-import" "$SOURCE_DATA" "$TARGET_DATA" "ok"
echo "Imported settings into $TARGET_DATA"
