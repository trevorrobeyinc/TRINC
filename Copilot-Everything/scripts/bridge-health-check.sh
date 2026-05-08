#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_command node
require_command jq
require_command pm2
require_command ps
require_command rg

VALIDATION_DIR="$CONFIG_ROOT/validation"
ensure_dir "$VALIDATION_DIR"

MCP_CONFIG_PATH="$BRIDGE_REPO/config/obsidian-cli-mcp.local.json"
BRIDGE_SERVER_DIR="$BRIDGE_REPO"
[[ -f "$MCP_CONFIG_PATH" ]] || die "Missing MCP config: $MCP_CONFIG_PATH"
[[ -d "$BRIDGE_SERVER_DIR/dist" ]] || die "Missing bridge build output: $BRIDGE_SERVER_DIR/dist"

TARGET_PID="${1:-}"
if [[ -z "$TARGET_PID" ]]; then
  TARGET_PID="$(ps -ax -o pid=,command= \
    | rg "node dist/index.js --transport=http" \
    | rg -v "rg node dist/index.js --transport=http" \
    | awk 'NR==1 { print $1 }')"
fi
[[ -n "$TARGET_PID" ]] || die "Could not find running bridge process. Start bridge first."

HEALTH_JSON="$VALIDATION_DIR/bridge-health-after-fix.json"
DIRECT_JSON="$VALIDATION_DIR/direct-cli-probe-with-bridge-runtime-env.json"
SUMMARY_FILE="$VALIDATION_DIR/bridge-env-summary.txt"
PM2_JSON="$VALIDATION_DIR/bridge-pm2-jlist.json"
PM2_ENV_JSON="$VALIDATION_DIR/bridge-pm2-env.json"

node "$SCRIPT_DIR/mcp-health-check.js" >"$HEALTH_JSON"
pm2 jlist >"$PM2_JSON"
jq --argjson pid "$TARGET_PID" '
  map(select(.pid == $pid))
  | .[0].pm2_env.env // {}
' "$PM2_JSON" >"$PM2_ENV_JSON"

{
  echo "bridge_pid=$TARGET_PID"
  for key in HOME USER LOGNAME SHELL; do
    value="$(jq -r --arg key "$key" '.[$key] // empty' "$PM2_ENV_JSON")"
    echo "$key=$value"
  done
  BRIDGE_CWD="$(lsof -a -p "$TARGET_PID" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1)"
  echo "cwd=$BRIDGE_CWD"
  echo "OBSIDIAN_MCP_CONFIG=$MCP_CONFIG_PATH"
} >"$SUMMARY_FILE"

BRIDGE_ENV_JSON="$PM2_ENV_JSON" MCP_CONFIG_PATH="$MCP_CONFIG_PATH" BRIDGE_SERVER_DIR="$BRIDGE_SERVER_DIR" node - <<'NODE' >"$DIRECT_JSON"
const fs = require("node:fs");
const path = require("node:path");
const bridgeServerDir = process.env.BRIDGE_SERVER_DIR;
const { loadConfig } = require(path.join(bridgeServerDir, "dist/config/loader.js"));
const { CliBackend } = require(path.join(bridgeServerDir, "dist/backends/cliBackend.js"));

const envPath = process.env.BRIDGE_ENV_JSON;
const bridgeEnv = envPath ? JSON.parse(fs.readFileSync(envPath, "utf8")) : {};
const allowedEnvKeys = [
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "PATH",
  "PWD",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "OBSIDIAN_VAULT_PATH",
  "OBSIDIAN_CLI_BINARY",
  "NODE_ENV",
];

for (const key of allowedEnvKeys) {
  const value = bridgeEnv[key];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    process.env[key] = String(value);
  }
}

// Keep config path explicit because paths with spaces are hard to parse from ps eww output.
process.env.OBSIDIAN_MCP_CONFIG = process.env.MCP_CONFIG_PATH;

(async () => {
  const { config } = loadConfig();
  const backend = new CliBackend(config);
  const capabilities = await backend.probe();
  process.stdout.write(JSON.stringify(capabilities, null, 2) + "\n");
})().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
NODE

BRIDGE_CLI_AVAILABLE="$(jq -r '.cli.available // false' "$HEALTH_JSON")"
DIRECT_CLI_AVAILABLE="$(jq -r '.available // false' "$DIRECT_JSON")"

if [[ "$BRIDGE_CLI_AVAILABLE" != "$DIRECT_CLI_AVAILABLE" ]]; then
  echo "Bridge health mismatch:"
  echo "  health.cli.available=$BRIDGE_CLI_AVAILABLE"
  echo "  direct.cli.available=$DIRECT_CLI_AVAILABLE"
  exit 1
fi

HEALTH_CLI_PROJECTION="$(jq -c '
  .cli
  | {
      available,
      supportedOps,
      constraints,
      diagnostics: {
        resolvedBinaryPath: .diagnostics.resolvedBinaryPath?,
        parsedVersion: .diagnostics.parsedVersion?,
        requiredVaults: .diagnostics.requiredVaults?,
        launch: {
          requestedVaultName: .diagnostics.launch.requestedVaultName?,
          launchAttempted: .diagnostics.launch.launchAttempted?,
          readinessStatus: .diagnostics.launch.readinessStatus?
        }
      }
    }' "$HEALTH_JSON")"

DIRECT_CLI_PROJECTION="$(jq -c '
  {
    available,
    supportedOps,
    constraints,
    diagnostics: {
      resolvedBinaryPath: .diagnostics.resolvedBinaryPath?,
      parsedVersion: .diagnostics.parsedVersion?,
      requiredVaults: .diagnostics.requiredVaults?,
      launch: {
        requestedVaultName: .diagnostics.launch.requestedVaultName?,
        launchAttempted: .diagnostics.launch.launchAttempted?,
        readinessStatus: .diagnostics.launch.readinessStatus?
      }
    }
  }' "$DIRECT_JSON")"

if [[ "$HEALTH_CLI_PROJECTION" != "$DIRECT_CLI_PROJECTION" ]]; then
  echo "Bridge CLI diagnostics mismatch:"
  echo "  health.cli=$HEALTH_CLI_PROJECTION"
  echo "  direct.cli=$DIRECT_CLI_PROJECTION"
  exit 1
fi

echo "Bridge health check passed."
echo "  health report: $HEALTH_JSON"
echo "  direct probe:  $DIRECT_JSON"
echo "  env summary:   $SUMMARY_FILE"
