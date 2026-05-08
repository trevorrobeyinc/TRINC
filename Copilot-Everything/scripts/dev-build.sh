#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_command npm
ensure_workspace_layout
ensure_dir "$RUNTIME_PLUGIN_DIR"

TEMP_PRESERVE_DIR=""
cleanup() {
  if [[ -n "${TEMP_PRESERVE_DIR:-}" && -d "$TEMP_PRESERVE_DIR" ]]; then
    rm -rf "$TEMP_PRESERVE_DIR"
  fi
}
trap cleanup EXIT

pushd "$PLUGIN_REPO" >/dev/null
if [[ ! -d node_modules ]]; then
  npm ci
fi
npm run build
popd >/dev/null

[[ -f "$PLUGIN_REPO/main.js" ]] || die "Build did not produce $PLUGIN_REPO/main.js"
[[ -f "$PLUGIN_REPO/manifest.json" ]] || die "Missing manifest.json in plugin repo"

if [[ -f "$RUNTIME_PLUGIN_DIR/data.json" ]]; then
  TEMP_PRESERVE_DIR="$(mktemp -d)"
  cp "$RUNTIME_PLUGIN_DIR/data.json" "$TEMP_PRESERVE_DIR/data.json"
fi

find "$RUNTIME_PLUGIN_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp "$PLUGIN_REPO/manifest.json" "$RUNTIME_PLUGIN_DIR/manifest.json"
cp "$PLUGIN_REPO/main.js" "$RUNTIME_PLUGIN_DIR/main.js"
[[ -f "$PLUGIN_REPO/styles.css" ]] && cp "$PLUGIN_REPO/styles.css" "$RUNTIME_PLUGIN_DIR/styles.css"
[[ -f "$PLUGIN_REPO/versions.json" ]] && cp "$PLUGIN_REPO/versions.json" "$RUNTIME_PLUGIN_DIR/versions.json"
cp "$PLUGIN_REPO/LICENSE" "$RUNTIME_PLUGIN_DIR/LICENSE"

if [[ -n "${TEMP_PRESERVE_DIR:-}" && -f "$TEMP_PRESERVE_DIR/data.json" ]]; then
  cp "$TEMP_PRESERVE_DIR/data.json" "$RUNTIME_PLUGIN_DIR/data.json"
fi

node - "$PLUGIN_REPO/manifest.json" "$RUNTIME_PLUGIN_DIR/build-info.json" <<'NODE'
const fs = require("fs");
const [manifestPath, outputPath] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const payload = {
  builtAt: new Date().toISOString(),
  manifestId: manifest.id,
  manifestName: manifest.name,
  manifestVersion: manifest.version,
};
fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + "\n");
NODE

record_migration_event "build-runtime" "$PLUGIN_REPO" "$RUNTIME_PLUGIN_DIR" "ok"
echo "Built runtime bundle into $RUNTIME_PLUGIN_DIR"
