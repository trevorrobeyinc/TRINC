#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"
source "$SCRIPT_DIR/lib/tls-diagnostic.sh"

require_command obsidian
require_command jq
require_command curl

MODEL_NAME=""
TARGET_VAULT_NAME="$(vault_name "$PRODUCTION_VAULT")"
# HTTPS-only invariant: target the in-monorepo Ollama TLS proxy on :11435, NOT
# the plaintext upstream :11434. tls_diagnose surfaces root-cause if unreachable.
TARGET_BASE_URL="https://127.0.0.1:11435"
SET_AS_DEFAULT="false"
TARGET_PLUGIN_ID="$OFFICIAL_PLUGIN_ID"
DATA_FILE="$OFFICIAL_PLUGIN_DIR/data.json"

usage() {
  cat <<'EOF'
Usage:
  official-plugin-add-ollama-model.sh --model <name> [--default] [--base-url <url>] [--vault <name>]

Examples:
  official-plugin-add-ollama-model.sh --model llama3.1:8b
  official-plugin-add-ollama-model.sh --model qwen2.5-coder:7b --default
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
  --model)
    MODEL_NAME="${2:-}"
    shift 2
    ;;
  --vault)
    TARGET_VAULT_NAME="${2:-}"
    shift 2
    ;;
  --base-url)
    TARGET_BASE_URL="${2:-}"
    shift 2
    ;;
  --default)
    SET_AS_DEFAULT="true"
    shift
    ;;
  -h|--help)
    usage
    exit 0
    ;;
  *)
    usage >&2
    die "Unknown argument: $1"
    ;;
  esac
done

[[ -n "$MODEL_NAME" ]] || {
  usage >&2
  die "Missing required --model argument."
}

[[ -f "$DATA_FILE" ]] || die "Official Copilot data file not found: $DATA_FILE"
ensure_obsidian_running "$TARGET_VAULT_NAME"

NORMALIZED_BASE_URL="${TARGET_BASE_URL%/}"
NORMALIZED_BASE_URL="${NORMALIZED_BASE_URL%/v1}"

curl -sS "$NORMALIZED_BASE_URL/api/tags" \
  | jq -e --arg model "$MODEL_NAME" '.models | any(.name == $model)' >/dev/null \
  || die "Ollama model not found at $NORMALIZED_BASE_URL: $MODEL_NAME"

MODEL_LABEL="$(printf '%s' "$MODEL_NAME" | tr -c 'A-Za-z0-9._-' '_')"
BACKUP_PATH="$(backup_target "$DATA_FILE" "copilot-official-data.ollama-model-$MODEL_LABEL")"

MODEL_NAME_JSON="$(printf '%s' "$MODEL_NAME" | jq -Rsa .)"
PLUGIN_ID_JSON="$(printf '%s' "$TARGET_PLUGIN_ID" | jq -Rsa .)"
BASE_URL_JSON="$(printf '%s' "$NORMALIZED_BASE_URL" | jq -Rsa .)"

JS_CODE="$(cat <<EOF
(async () => {
  const plugin = app.plugins.plugins[$PLUGIN_ID_JSON];
  if (!plugin) {
    throw new Error("Official Copilot plugin is not loaded.");
  }

  const data = (await plugin.loadData()) || {};
  const activeModels = Array.isArray(data.activeModels) ? data.activeModels : [];
  const modelName = $MODEL_NAME_JSON;
  const provider = "ollama";
  const baseUrl = $BASE_URL_JSON;
  const modelKey = \`\${modelName}|\${provider}\`;

  let model = activeModels.find((entry) => entry?.name === modelName && entry?.provider === provider);
  const added = !model;

  if (!model) {
    model = {
      name: modelName,
      provider,
      baseUrl,
      enabled: true,
      isBuiltIn: false,
      capabilities: [],
    };
    activeModels.push(model);
  } else {
    model.baseUrl = baseUrl;
    model.enabled = true;
    if (model.isBuiltIn === undefined) {
      model.isBuiltIn = false;
    }
    model.capabilities = [];
  }

  data.activeModels = activeModels;
  if ($SET_AS_DEFAULT) {
    data.defaultModelKey = modelKey;
  }

  await plugin.saveData(data);

  return {
    ok: true,
    added,
    modelKey,
    defaultModelKey: data.defaultModelKey ?? null,
    activeModelCount: activeModels.length,
    matchedModel: model,
  };
})()
EOF
)"
JS_CODE="${JS_CODE//$'\n'/ }"

RESULT="$(obsidian "vault=$TARGET_VAULT_NAME" eval "code=$JS_CODE" | sed '1s/^=> //')"
obsidian "vault=$TARGET_VAULT_NAME" plugin:reload "id=$TARGET_PLUGIN_ID" >/dev/null

jq -e --arg model "$MODEL_NAME" '.activeModels | any(.name == $model and .provider == "ollama")' "$DATA_FILE" >/dev/null \
  || die "Verification failed: model missing from $DATA_FILE after save."

if [[ "$SET_AS_DEFAULT" == "true" ]]; then
  jq -e --arg key "$MODEL_NAME|ollama" '.defaultModelKey == $key' "$DATA_FILE" >/dev/null \
    || die "Verification failed: defaultModelKey was not updated."
fi

echo "Official Copilot Ollama model updated."
echo "  vault:            $TARGET_VAULT_NAME"
echo "  plugin:           $TARGET_PLUGIN_ID"
echo "  model:            $MODEL_NAME"
echo "  base URL:         $NORMALIZED_BASE_URL"
echo "  set as default:   $SET_AS_DEFAULT"
echo "  backup:           ${BACKUP_PATH:-none}"
echo "  result:           $RESULT"
