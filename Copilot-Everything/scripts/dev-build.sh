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
# Agent Mode spawns this proxy from the plugin dir (acpMcpServers.ts builds the command as
# "<pluginDir>/openclaw-stdio-proxy.mjs"), so a bundle without it breaks every ACP MCP server
# spawn — and until 2026-08-16 no script staged it (the live copy was a one-off manual cp).
STDIO_PROXY_SOURCE="$WORKSPACE_ROOT/bridges/openclaw-stdio-proxy/index.mjs"
[[ -f "$STDIO_PROXY_SOURCE" ]] || die "Missing stdio proxy source: $STDIO_PROXY_SOURCE"
cp "$STDIO_PROXY_SOURCE" "$RUNTIME_PLUGIN_DIR/openclaw-stdio-proxy.mjs"
chmod +x "$RUNTIME_PLUGIN_DIR/openclaw-stdio-proxy.mjs"

if [[ -n "${TEMP_PRESERVE_DIR:-}" && -f "$TEMP_PRESERVE_DIR/data.json" ]]; then
  cp "$TEMP_PRESERVE_DIR/data.json" "$RUNTIME_PLUGIN_DIR/data.json"
  # 0600, every time. The wipe above deletes the original inode, so the restored copy
  # is a NEW file created at the shell's umask (0644) — which silently un-hardens the
  # one file here that carries Obsidian-written runtime settings and the full
  # secret-slot schema. A manual chmod does not survive the next rebuild; this does.
  # (2026-07 API-key-storage audit; drift observed and re-fixed 2026-07-31.)
  chmod 600 "$RUNTIME_PLUGIN_DIR/data.json"
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
