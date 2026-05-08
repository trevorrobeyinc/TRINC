#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

usage() {
  cat <<'EOF'
Usage:
  rollback-restore.sh list
  rollback-restore.sh restore <backup-path> <target-path>
EOF
}

COMMAND="${1:-list}"

case "$COMMAND" in
  list)
    ensure_dir "$BACKUP_ROOT"
    find "$BACKUP_ROOT" -mindepth 1 -maxdepth 2 | sort
    ;;
  restore)
    BACKUP_PATH="${2:-}"
    TARGET_PATH="${3:-}"
    [[ -n "$BACKUP_PATH" ]] || die "Missing backup path."
    [[ -n "$TARGET_PATH" ]] || die "Missing target path."
    [[ -e "$BACKUP_PATH" ]] || die "Backup path does not exist: $BACKUP_PATH"
    rm -rf "$TARGET_PATH"
    cp -R "$BACKUP_PATH" "$TARGET_PATH"
    record_migration_event "rollback-restore" "$BACKUP_PATH" "$TARGET_PATH" "ok"
    echo "Restored $TARGET_PATH from $BACKUP_PATH"
    ;;
  *)
    usage
    exit 1
    ;;
esac
