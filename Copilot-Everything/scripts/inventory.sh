#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

ensure_workspace_layout

PROD_CONFIG_DIR="$(detect_obsidian_config_dir "$PRODUCTION_VAULT")"
DEV_CONFIG_DIR="$(detect_obsidian_config_dir "$DEV_VAULT")"
OUTPUT_JSON="$CONFIG_ROOT/path-inventory.json"
OUTPUT_TXT="$CONFIG_ROOT/path-inventory.txt"

node - "$OUTPUT_JSON" "$WORKSPACE_ROOT" "$PRODUCTION_VAULT" "$PROD_CONFIG_DIR" "$DEV_VAULT" "$DEV_CONFIG_DIR" "$OLD_SOURCE_REPO" "$OLD_BRIDGE_REPO" "$RUNTIME_PLUGIN_DIR" <<'NODE'
const fs = require("fs");
const { execFileSync } = require("child_process");

const [
  outputPath,
  workspaceRoot,
  productionVault,
  productionConfigDir,
  devVault,
  devConfigDir,
  oldSourceRepo,
  oldBridgeRepo,
  runtimePluginBundle,
] = process.argv.slice(2);

function run(cmd, args) {
  try {
    const output = execFileSync(cmd, args, { encoding: "utf8" }).trim();
    return output ? output.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

const searchPatterns = [
  "*copilot*",
  "*obsidian-copilot*",
  "*Copilot-Prompt-Bridge-Hybrid*",
  "*prompt-bridge*",
  "*brevilabs*",
  "*miyo*",
  "*mcp*",
];

const inventory = {
  generatedAt: new Date().toISOString(),
  workspaceRoot,
  productionVault: {
    path: productionVault,
    configDir: productionConfigDir,
    installedPlugins: run("find", [`${productionConfigDir}/plugins`, "-maxdepth", "1", "-mindepth", "1", "-type", "d"]),
  },
  devVault: {
    path: devVault,
    configDir: devConfigDir,
    installedPlugins: run("find", [`${devConfigDir}/plugins`, "-maxdepth", "1", "-mindepth", "1", "-type", "d"]),
  },
  workspace: {
    repos: run("find", [`${workspaceRoot}/repos`, "-maxdepth", "2", "-mindepth", "1", "-type", "d"]),
    bridges: run("find", [`${workspaceRoot}/bridges`, "-maxdepth", "2", "-mindepth", "1", "-type", "d"]),
    deployPlugins: run("find", [`${workspaceRoot}/deploy/obsidian/plugins`, "-maxdepth", "2", "-mindepth", "1"]),
    docs: run("find", [`${workspaceRoot}/docs`, "-maxdepth", "1", "-mindepth", "1"]),
    scripts: run("find", [`${workspaceRoot}/scripts`, "-maxdepth", "1", "-mindepth", "1"]),
  },
  migrationAnchors: {
    oldSourceRepo,
    oldBridgeRepo,
    newSourceRepo: `${workspaceRoot}/repos/obsidian-copilot-mcp`,
    newBridgeRepo: `${workspaceRoot}/bridges/raycast-obsidian-extension`,
    runtimePluginBundle,
  },
  relatedAssets: searchPatterns.flatMap((pattern) =>
    run("find", [workspaceRoot, productionVault, "/Users/myhome", "-maxdepth", "4", "-iname", pattern])
  ),
  symlinks: run("find", [workspaceRoot, "-type", "l"]),
};

fs.writeFileSync(outputPath, JSON.stringify(inventory, null, 2) + "\n");
NODE

{
  echo "Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "Production vault: $PRODUCTION_VAULT"
  echo "Production config dir: $PROD_CONFIG_DIR"
  echo "Dev vault: $DEV_VAULT"
  echo "Dev config dir: $DEV_CONFIG_DIR"
  echo
  echo "Workspace repos:"
  find "$WORKSPACE_ROOT/repos" -maxdepth 2 -mindepth 1 -type d | sort
  echo
  echo "Workspace bridges:"
  find "$WORKSPACE_ROOT/bridges" -maxdepth 2 -mindepth 1 -type d | sort
  echo
  echo "Deploy plugins:"
  find "$WORKSPACE_ROOT/deploy/obsidian/plugins" -maxdepth 2 -mindepth 1 | sort
} >"$OUTPUT_TXT"

echo "Wrote $OUTPUT_JSON"
echo "Wrote $OUTPUT_TXT"
