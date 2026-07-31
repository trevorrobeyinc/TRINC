#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_ROOT="/Users/myhome/TrevClaw-Obsidianodus/Copilot-Everything"
PRODUCTION_VAULT="/Users/myhome/My Digital Garden"
DEV_VAULT="$WORKSPACE_ROOT/dev-vault"
PLUGIN_REPO="$WORKSPACE_ROOT/repos/obsidian-copilot-mcp"
BRIDGE_REPO="$WORKSPACE_ROOT/bridges/obsidian-copilot-bridge"
DEPLOY_ROOT="$WORKSPACE_ROOT/deploy"
DEPLOY_PLUGIN_ROOT="$DEPLOY_ROOT/obsidian/plugins"
RUNTIME_PLUGIN_DIR="$DEPLOY_PLUGIN_ROOT/copilot"
CONFIG_ROOT="$WORKSPACE_ROOT/configs"
DOCS_ROOT="$WORKSPACE_ROOT/docs"
BACKUP_ROOT="$DEPLOY_ROOT/backups"
# Both ids are "copilot" ON PURPOSE. Since 9c7ce09a (2026-05-23) the fork's manifest
# declares id "copilot" at the upstream-exact version so Obsidian's auto-updater sees
# installed==latest and cannot wipe the fork (see repos/obsidian-copilot-mcp/manifest.json
# description — never change that manifest id). PLUGIN_ID is the id the dev-vault lane
# stages/enables/reloads; OFFICIAL_PLUGIN_ID is the production vault's official plugin
# slot. Keep both names for call-site meaning; do not "deduplicate" them.
PLUGIN_ID="copilot"
OFFICIAL_PLUGIN_ID="copilot"
OFFICIAL_PLUGIN_DIR="$PRODUCTION_VAULT/.obsidian/plugins/$OFFICIAL_PLUGIN_ID"
OLD_SOURCE_REPO="$PRODUCTION_VAULT/copilot"
OLD_BRIDGE_REPO="$PRODUCTION_VAULT/raycast-obsidian-extension"
MIGRATION_LOG="$CONFIG_ROOT/migration-log.tsv"

timestamp() {
  date +"%Y%m%d-%H%M%S"
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

ensure_dir() {
  mkdir -p "$1"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

keychain_is_available() {
  [[ "$(uname -s)" == "Darwin" ]] && command -v security >/dev/null 2>&1
}

read_keychain_secret() {
  local service="$1"
  local account="$2"

  keychain_is_available || return 1
  security find-generic-password -a "$account" -s "$service" -w 2>/dev/null
}

write_keychain_secret() {
  local service="$1"
  local account="$2"
  local value="$3"

  keychain_is_available || die "macOS Keychain is not available on this machine."
  security add-generic-password -U -a "$account" -s "$service" -w "$value" >/dev/null
}

self_host_keychain_service() {
  printf '%s\n' "${SELF_HOST_KEYCHAIN_SERVICE:-obsidian-copilot-self-host}"
}

self_host_keychain_account() {
  printf '%s\n' "${SELF_HOST_KEYCHAIN_ACCOUNT:-backend-emulator}"
}

generate_secret() {
  node -e 'console.log(require("node:crypto").randomBytes(48).toString("base64url"))'
}

resolve_self_host_api_key() {
  if [[ -n "${SELF_HOST_API_KEY:-}" ]]; then
    printf '%s\n' "$SELF_HOST_API_KEY"
    return 0
  fi

  local keychain_value=""
  keychain_value="$(read_keychain_secret "$(self_host_keychain_service)" "$(self_host_keychain_account)" || true)"
  if [[ -n "$keychain_value" ]]; then
    printf '%s\n' "$keychain_value"
    return 0
  fi

  printf '%s\n' "copilot-mcp-dev-self-host-key"
}

store_self_host_api_key() {
  local api_key="$1"

  [[ -n "$api_key" ]] || die "Self-host API key cannot be empty."
  write_keychain_secret "$(self_host_keychain_service)" "$(self_host_keychain_account)" "$api_key"
}

run_with_timeout() {
  local timeout_ms="$1"
  shift

  [[ "$timeout_ms" =~ ^[0-9]+$ ]] || die "run_with_timeout requires an integer timeout in milliseconds."
  [[ "$#" -gt 0 ]] || die "run_with_timeout requires a command to execute."

  node - "$timeout_ms" "$@" <<'NODE'
const { spawn } = require("node:child_process");

const [timeoutRaw, ...command] = process.argv.slice(2);
const timeoutMs = Number(timeoutRaw);

if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  console.error(`Invalid timeout: ${timeoutRaw}`);
  process.exit(64);
}

if (command.length === 0) {
  console.error("Missing command for run_with_timeout.");
  process.exit(64);
}

const child = spawn(command[0], command.slice(1), {
  stdio: ["ignore", "pipe", "pipe"],
});

let timedOut = false;

const killTimer = setTimeout(() => {
  timedOut = true;
  child.kill("SIGTERM");
  setTimeout(() => {
    child.kill("SIGKILL");
  }, 2_000).unref();
}, timeoutMs);

child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
});

child.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
});

child.once("error", (error) => {
  clearTimeout(killTimer);
  console.error(String(error instanceof Error ? error.message : error));
  process.exit(1);
});

child.once("close", (code, signal) => {
  clearTimeout(killTimer);
  if (timedOut || signal) {
    console.error(`Command timed out after ${timeoutMs}ms: ${command.join(" ")}`);
    process.exit(124);
  }
  process.exit(code ?? 1);
});
NODE
}

obsidian_main_pid() {
  local pid
  pid="$(
    ps -axo pid=,command= |
      awk '/\/Applications\/Obsidian.app\/Contents\/MacOS\/[Oo]bsidian/ { print $1; exit }'
  )"

  [[ -n "$pid" ]] || return 1
  printf '%s\n' "$pid"
}

ensure_obsidian_running() {
  local target_vault_name="${1:-}"

  if obsidian_main_pid >/dev/null 2>&1; then
    return 0
  fi

  if [[ -n "$target_vault_name" ]]; then
    open -a Obsidian --args "vault=$target_vault_name" >/dev/null 2>&1
  else
    open -a Obsidian >/dev/null 2>&1
  fi

  for _attempt in {1..30}; do
    if obsidian_main_pid >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  die "Obsidian did not start in time."
}

vault_name() {
  basename "$1"
}

detect_miyo_service_file() {
  local platform
  platform="$(uname -s)"

  case "$platform" in
  Darwin)
    local candidate="$HOME/Library/Application Support/Miyo/service.json"
    [[ -f "$candidate" ]] && printf '%s\n' "$candidate"
    ;;
  Linux)
    local candidate="$HOME/.config/Miyo/service.json"
    [[ -f "$candidate" ]] && printf '%s\n' "$candidate"
    ;;
  *)
    return 1
    ;;
  esac
}

detect_miyo_base_url() {
  if [[ -n "${MIYO_BASE_URL:-}" ]]; then
    printf '%s\n' "${MIYO_BASE_URL%/}"
    return 0
  fi

  local service_file
  service_file="$(detect_miyo_service_file || true)"
  [[ -n "$service_file" ]] || return 1

  # HTTPS-only invariant: a local Miyo (service.json always advertises a
  # loopback host) is reached through the in-monorepo TLS proxy on :8743,
  # never its plaintext upstream. Mirrors MiyoServiceDiscovery.ts. For a
  # remote Miyo, pass MIYO_BASE_URL=https://... explicitly (handled above).
  printf '%s\n' "https://127.0.0.1:8743"
}

detect_obsidian_config_dir() {
  local vault_path="$1"
  local override_name="${OBSIDIAN_CONFIG_DIR_NAME:-}"

  if [[ -n "$override_name" && -d "$vault_path/$override_name" ]]; then
    printf '%s\n' "$vault_path/$override_name"
    return 0
  fi

  local best_match=""
  while IFS= read -r candidate; do
    [[ -z "$candidate" ]] && continue
    if [[ -d "$candidate/plugins" || -f "$candidate/app.json" || -f "$candidate/community-plugins.json" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
    if [[ -z "$best_match" ]]; then
      best_match="$candidate"
    fi
  done < <(find "$vault_path" -maxdepth 1 -mindepth 1 -type d -name '.obsidian*' | sort)

  if [[ -n "$best_match" ]]; then
    printf '%s\n' "$best_match"
    return 0
  fi

  printf '%s\n' "$vault_path/.obsidian"
}

record_migration_event() {
  ensure_dir "$CONFIG_ROOT"
  if [[ ! -f "$MIGRATION_LOG" ]]; then
    printf 'timestamp\taction\tsource\tdestination\tstatus\n' >"$MIGRATION_LOG"
  fi
  printf '%s\t%s\t%s\t%s\t%s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$1" "$2" "$3" "$4" >>"$MIGRATION_LOG"
}

ensure_workspace_layout() {
  ensure_dir "$WORKSPACE_ROOT/repos"
  ensure_dir "$WORKSPACE_ROOT/bridges"
  ensure_dir "$WORKSPACE_ROOT/backend"
  ensure_dir "$WORKSPACE_ROOT/configs"
  ensure_dir "$WORKSPACE_ROOT/scripts"
  ensure_dir "$WORKSPACE_ROOT/docs"
  ensure_dir "$DEPLOY_PLUGIN_ROOT"
  ensure_dir "$WORKSPACE_ROOT/tools"
  ensure_dir "$DEV_VAULT"
  ensure_dir "$BACKUP_ROOT"
}

ensure_dev_vault() {
  ensure_workspace_layout
  local config_dir
  config_dir="$(detect_obsidian_config_dir "$DEV_VAULT")"
  ensure_dir "$config_dir"
  ensure_dir "$config_dir/plugins"
  printf '%s\n' "$config_dir"
}

backup_target() {
  local target_path="$1"
  local label="$2"

  if [[ ! -e "$target_path" && ! -L "$target_path" ]]; then
    return 0
  fi

  local destination="$BACKUP_ROOT/$(timestamp)-$label"
  ensure_dir "$destination"
  local backup_path="$destination/$(basename "$target_path")"
  cp -R "$target_path" "$backup_path"
  printf '%s\n' "$backup_path"
}

sync_community_plugins_file() {
  local config_dir="$1"
  shift
  local plugin_ids=("$@")
  local file_path="$config_dir/community-plugins.json"
  ensure_dir "$config_dir"

  node - "$file_path" "${plugin_ids[@]}" <<'NODE'
const fs = require("fs");
const [filePath, ...pluginIds] = process.argv.slice(2);
let current = [];
if (fs.existsSync(filePath)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (Array.isArray(parsed)) current = parsed;
  } catch {}
}
const merged = [...new Set([...current, ...pluginIds.filter(Boolean)])];
fs.writeFileSync(filePath, JSON.stringify(merged, null, 2) + "\n");
NODE
}
