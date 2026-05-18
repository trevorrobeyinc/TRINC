#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_command jq
require_command obsidian
require_command node
require_command curl
require_command miyo

TARGET_VAULT_NAME="$(vault_name "$PRODUCTION_VAULT")"
VALIDATION_DIR="$CONFIG_ROOT/validation"
ensure_dir "$VALIDATION_DIR"

OFFICIAL_DATA_FILE="$OFFICIAL_PLUGIN_DIR/data.json"
RUNTIME_FILE="$VALIDATION_DIR/official-plugin-miyo-runtime.json"
CONSOLE_FILE="$VALIDATION_DIR/official-plugin-miyo-console.txt"
SAMPLE_PDF_PATH="$VALIDATION_DIR/official-plugin-miyo-sample.pdf"
MCP_HEALTH_FILE="$VALIDATION_DIR/official-plugin-direct-mcp-health.json"
MIYO_SEARCH_FILE="$VALIDATION_DIR/official-plugin-miyo-cli-search.json"
SERVER_ID="shared-obsidian-mcp"
REQUIRED_TOOL_IDS_JSON="$(jq -cn --arg server "$SERVER_ID" '[
  "obsidian_health",
  "obsidian_open_vault",
  "obsidian_read_note",
  "obsidian_search_notes",
  "obsidian_execute_command"
] | map("mcp_" + $server + "_" + .)')"

[[ -f "$OFFICIAL_DATA_FILE" ]] || die "Missing official plugin data file: $OFFICIAL_DATA_FILE"
ensure_obsidian_running "$TARGET_VAULT_NAME"

node - "$SAMPLE_PDF_PATH" <<'NODE'
const fs = require("fs");
const outputPath = process.argv[2];
const text = "Official plugin direct Miyo runtime test PDF.";
const escaped = text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const objects = [
  "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
  "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
  "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
  `4 0 obj\n<< /Length ${escaped.length + 33} >>\nstream\nBT\n/F1 18 Tf\n36 96 Td\n(${escaped}) Tj\nET\nendstream\nendobj\n`,
  "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
];
let pdf = "%PDF-1.4\n";
const offsets = [0];
for (const object of objects) {
  offsets.push(Buffer.byteLength(pdf, "utf8"));
  pdf += object;
}
const xrefOffset = Buffer.byteLength(pdf, "utf8");
pdf += `xref\n0 ${objects.length + 1}\n`;
pdf += "0000000000 65535 f \n";
for (let index = 1; index < offsets.length; index += 1) {
  pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
fs.writeFileSync(outputPath, pdf, "utf8");
NODE

node "$SCRIPT_DIR/mcp-health-check.js" >"$MCP_HEALTH_FILE"
# HTTPS-only invariant: target the in-monorepo Miyo TLS proxy on :8743.
if ! miyo search --json --url "https://127.0.0.1:8743" "wireless networking" >"$MIYO_SEARCH_FILE"; then
  tls_diagnose 8743 8742 com.trevorrobey.miyo-tls-proxy "MIYO_SEARCH_FAILED" >&2
  exit 1
fi
obsidian "vault=$TARGET_VAULT_NAME" dev:debug on >/dev/null 2>&1 || true
obsidian "vault=$TARGET_VAULT_NAME" dev:console clear >/dev/null 2>&1 || true

START_CODE="$(cat <<EOF
(() => {
  const plugin = app.plugins.plugins["$OFFICIAL_PLUGIN_ID"];
  if (!plugin) {
    return { ok: false, error: "plugin_not_loaded" };
  }

  const miyoBackend = plugin.vectorStoreManager?.miyoBackend;
  if (!miyoBackend || !miyoBackend.client) {
    return { ok: false, error: "miyo_backend_not_available" };
  }

  window.__officialPluginMiyoRun = {
    status: "running",
    startedAt: new Date().toISOString(),
  };

  (async () => {
    const rawData = (await plugin.loadData()) || {};
    const baseUrl = await miyoBackend.getBaseUrl();
    const sourceId = miyoBackend.getSourceId();
    const headerProbe =
      typeof miyoBackend.client?.buildHeaders === "function"
        ? await miyoBackend.client.buildHeaders()
        : null;
    const searchQuery = "wireless networking";
    const parsePath = ${SAMPLE_PDF_PATH@Q};

    try {
      const search = await miyoBackend.client.search(baseUrl, sourceId, searchQuery, 3);
      const parseDoc = await miyoBackend.client.parseDoc(baseUrl, parsePath);

      window.__officialPluginMiyoRun = {
        status: "completed",
        ok: true,
        timestamp: new Date().toISOString(),
        pluginVersion: plugin.manifest?.version || null,
        backendMode: rawData.backendMode ?? null,
        enableSelfHostMode: rawData.enableSelfHostMode ?? null,
        selfHostExecutionMode: rawData.selfHostExecutionMode ?? null,
        selfHostUrl: rawData.selfHostUrl ?? null,
        selfHostApiKeyConfigured: Boolean(rawData.selfHostApiKey),
        selfHostAdapterBaseUrl: rawData.selfHostAdapter?.baseUrl ?? null,
        defaultModelKey: rawData.defaultModelKey ?? null,
        enableSemanticSearchV3: rawData.enableSemanticSearchV3 ?? null,
        enableMiyo: rawData.enableMiyo ?? null,
        miyoVaultName: rawData.miyoVaultName ?? null,
        miyoServerUrl: rawData.miyoServerUrl ?? null,
        autonomousAgentEnabledToolIds: rawData.autonomousAgentEnabledToolIds ?? [],
        mcp: rawData.mcp ?? null,
        baseUrl,
        sourceId,
        headerProbe: {
          keys: headerProbe ? Object.keys(headerProbe) : [],
          hasAuthorization: Boolean(headerProbe?.Authorization || headerProbe?.authorization),
          hasApiKey: Boolean(headerProbe?.["X-API-Key"] || headerProbe?.["x-api-key"]),
        },
        responses: {
          health: await miyoBackend.client.isBackendAvailable(baseUrl),
          searchCount: Array.isArray(search?.results) ? search.results.length : 0,
          firstSearchPath: search?.results?.[0]?.path || null,
          parseDocText: parseDoc?.text || "",
        },
      };
    } catch (error) {
      window.__officialPluginMiyoRun = {
        status: "failed",
        ok: false,
        error: String(error?.stack || error),
        timestamp: new Date().toISOString(),
        baseUrl,
        sourceId,
      };
    }
  })();

  return { ok: true, status: "started" };
})()
EOF
)"
START_CODE="${START_CODE//$'\n'/ }"
obsidian "vault=$TARGET_VAULT_NAME" eval "code=$START_CODE" >/dev/null

for _attempt in {1..30}; do
  obsidian "vault=$TARGET_VAULT_NAME" eval 'code=(() => window.__officialPluginMiyoRun || null)()' | sed '1s/^=> //' >"$RUNTIME_FILE"
  if jq -e '.status == "completed"' "$RUNTIME_FILE" >/dev/null 2>&1; then
    break
  fi
  if jq -e '.status == "failed"' "$RUNTIME_FILE" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
obsidian "vault=$TARGET_VAULT_NAME" dev:console limit=400 >"$CONSOLE_FILE"

jq -e '.ok == true and .status == "completed"' "$RUNTIME_FILE" >/dev/null || die "Official plugin runtime check failed."
jq -e '.backendMode == "self_host"' "$RUNTIME_FILE" >/dev/null || die "backendMode is not self_host."
jq -e '.selfHostExecutionMode == "direct_plugin_mcp"' "$RUNTIME_FILE" >/dev/null || die "selfHostExecutionMode is not direct_plugin_mcp."
jq -e '(.selfHostUrl == "" or .selfHostUrl == null) and .selfHostAdapterBaseUrl == ""' "$RUNTIME_FILE" >/dev/null || die "Emulator coupling is still configured."
if ! jq -e '.baseUrl == "https://127.0.0.1:8743"' "$RUNTIME_FILE" >/dev/null; then
  tls_diagnose 8743 8742 com.trevorrobey.miyo-tls-proxy "RUNTIME_BASEURL_NOT_HTTPS_PROXY" >&2
  die "Miyo base URL is not the HTTPS proxy (:8743). The plugin runtime is mis-configured — see diagnostic above."
fi
jq -e '.responses.health == true' "$RUNTIME_FILE" >/dev/null || die "Official plugin Miyo health check failed."
jq -e '.responses.searchCount > 0' "$RUNTIME_FILE" >/dev/null || die "Official plugin search response missing results."
jq -e '.responses.parseDocText | strings and length > 0' "$RUNTIME_FILE" >/dev/null || die "Official plugin parse-doc response missing text."
jq -e '.mcp.enabled == true and .mcp.confirmationPolicy == "read_only_only"' "$RUNTIME_FILE" >/dev/null || die "MCP settings are not in direct read-only mode."
jq -e --argjson ids "$REQUIRED_TOOL_IDS_JSON" '
  . as $root
  | ($ids | all(. as $id | ($root.autonomousAgentEnabledToolIds | index($id) != null)))
' "$RUNTIME_FILE" >/dev/null || die "Required MCP tool ids are not enabled for the autonomous agent."
jq -e '.statusCode == 200 and .ok == true' "$MCP_HEALTH_FILE" >/dev/null || die "Shared MCP server health check failed."
jq -e '.results | arrays and length > 0' "$MIYO_SEARCH_FILE" >/dev/null || die "CLI Miyo search returned no results."

echo "Official plugin direct MCP + Miyo check passed."
echo "  mcp health:      $MCP_HEALTH_FILE"
echo "  miyo search:     $MIYO_SEARCH_FILE"
echo "  sample pdf:      $SAMPLE_PDF_PATH"
echo "  runtime result:  $RUNTIME_FILE"
echo "  console log:     $CONSOLE_FILE"
