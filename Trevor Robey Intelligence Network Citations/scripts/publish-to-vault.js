#!/usr/bin/env node
"use strict";

/**
 * publish-to-vault — push a completed research task into the Obsidian vault
 * via the obsidian-copilot-bridge `research_publish` MCP tool.
 *
 * This CLI reads `output.md` and `wiki-links.json` from the task directory and
 * POSTs them to the bridge. The bridge-side `research_publish` handler then:
 *   1. Writes `Research-Output/<YYYY-MM-DD>/<task-id>/output.md` to the vault.
 *   2. Materializes one stub note per wikilink target under
 *      `OpenClaw/atlas/<TYPE_DIR>/<identifier>.md`.
 *   3. Emits an SSE `research_arrived` event so the Copilot plugin can
 *      render a chat bubble and open the new tab.
 *
 * HOW THE WRITE ACTUALLY HAPPENS (corrected 2026-07-23 — an earlier comment
 * here and in atlas-stub-creator.js claimed this went
 * ":8798 -> RestApiBackend -> Local REST API plugin :27124 -> vault". It does
 * NOT.) `researchPublish.ts` writes **directly to the vault filesystem** with
 * `fs.writeFileSync`, via a `writeFileGuarded()` helper that first runs
 * `guardVaultRelativePath(vaultRoot, relPath)` and rejects any `vaultRoot` not
 * present in the bridge's `allowedVaultRoots` allow-list. The Local REST API
 * plugin on :27124 is never involved in this tool's path.
 *
 * Practical consequence: this needs the BRIDGE PROCESS alive, not Obsidian's
 * UI. Under the default deployment the bridge is a child of the
 * obsidian-bridge-launcher plugin and dies with Obsidian, but it can also be
 * started standalone via Copilot-Everything/scripts/bridge-start.sh.
 *
 * NOTE ON FOLDER SCHEME: `Research-Output/...` is this tool's scheme and is
 * currently DORMANT. The scheme actually live in the vault is the Command
 * Center plugin's `OpenClaw/<template_id>/<date> <input-label>/`, written by
 * its own note-generator on workflow completion. Do not wire this tool into the
 * pipeline without deciding which of the two schemes wins — otherwise every run
 * double-writes into two parallel trees.
 *
 * Auth: Uses x-mcp-token + replay-protected headers identical to every other
 * caller of the bridge. The token is read from the bridge config file (the
 * same file the bridge itself reads at startup).
 *
 * Usage:
 *   node scripts/publish-to-vault.js --task-id task-XXXX
 *     [--bridge https://127.0.0.1:8798]
 *     [--bridge-config <path>]
 *     [--vault-root /Volumes/ExtraCurricular/My Digital Garden]
 *     [--vault "My Digital Garden"]
 *     [--title "Optional human-readable title"]
 *     [--mode create|overwrite]
 *     [--source-dir <override path>]
 *
 * Defaults match the local-only research stack: bridge at
 * https://127.0.0.1:8798, vault at /Volumes/ExtraCurricular/My Digital Garden,
 * vault name "My Digital Garden", source dir at
 * `<repo>/workspace/research-output/<task-id>/`.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");
const os = require("node:os");

const DEFAULT_BRIDGE = "https://127.0.0.1:8798";
const DEFAULT_BRIDGE_CONFIG =
  "/Volumes/ExtraCurricular/TrevClaw-Obsidianodus/Copilot-Everything/bridges/obsidian-copilot-bridge/config/obsidian-cli-mcp.local.json";
const DEFAULT_VAULT_ROOT = "/Volumes/ExtraCurricular/My Digital Garden";
const DEFAULT_VAULT_NAME = "My Digital Garden";
const DEFAULT_MKCERT_CA = path.join(
  os.homedir(),
  "Library/Application Support/mkcert/rootCA.pem"
);

function parseArgs(argv) {
  const out = {
    taskId: "",
    bridge: DEFAULT_BRIDGE,
    bridgeConfig: DEFAULT_BRIDGE_CONFIG,
    vaultRoot: DEFAULT_VAULT_ROOT,
    vault: DEFAULT_VAULT_NAME,
    title: "",
    mode: "create",
    sourceDir: "",
    caCert: DEFAULT_MKCERT_CA,
  };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--task-id") { out.taskId = argv[++i] || ""; continue; }
    if (t === "--bridge") { out.bridge = argv[++i] || out.bridge; continue; }
    if (t === "--bridge-config") { out.bridgeConfig = argv[++i] || out.bridgeConfig; continue; }
    if (t === "--vault-root") { out.vaultRoot = argv[++i] || out.vaultRoot; continue; }
    if (t === "--vault") { out.vault = argv[++i] || out.vault; continue; }
    if (t === "--title") { out.title = argv[++i] || ""; continue; }
    if (t === "--mode") { out.mode = argv[++i] || out.mode; continue; }
    if (t === "--source-dir") { out.sourceDir = argv[++i] || ""; continue; }
    if (t === "--ca-cert") { out.caCert = argv[++i] || out.caCert; continue; }
  }
  return out;
}

function usage() {
  return [
    "Usage:",
    "  node scripts/publish-to-vault.js --task-id task-XXXX",
    "    [--bridge https://127.0.0.1:8798]",
    "    [--bridge-config <path>]",
    "    [--vault-root <vault root>]",
    "    [--vault <vault display name>]",
    "    [--title <human title>]",
    "    [--mode create|overwrite]",
    "    [--source-dir <override>]",
    "    [--ca-cert <pem path>]",
    "",
    "Defaults read the bridge auth token from",
    `  ${DEFAULT_BRIDGE_CONFIG}`,
    `and trust the mkcert root at`,
    `  ${DEFAULT_MKCERT_CA}`,
    "",
  ].join("\n");
}

function loadAuthToken(configPath) {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Bridge config not found at ${configPath}`);
  }
  const raw = fs.readFileSync(configPath, "utf8");
  const cfg = JSON.parse(raw);
  const token = cfg && cfg.security && cfg.security.authToken;
  if (!token || typeof token !== "string") {
    throw new Error(`Bridge config at ${configPath} is missing security.authToken`);
  }
  return token;
}

function postJson(url, body, headers, caCert) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const ca = fs.existsSync(caCert) ? fs.readFileSync(caCert) : undefined;
    const req = https.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          ...headers,
        },
        ...(ca ? { ca } : {}),
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode || 0, json, text });
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.taskId) {
    process.stderr.write(usage());
    process.exit(1);
  }

  const sourceDir = args.sourceDir
    ? path.resolve(args.sourceDir)
    : path.resolve(process.cwd(), "workspace/research-output", args.taskId);
  if (!fs.existsSync(sourceDir)) {
    process.stderr.write(`Task source dir not found: ${sourceDir}\n`);
    process.exit(1);
  }

  const token = loadAuthToken(args.bridgeConfig);

  const payload = {
    tool: "research_publish",
    input: {
      taskId: args.taskId,
      sourceDir,
      vault: args.vault,
      vaultRoot: args.vaultRoot,
      mode: args.mode,
      ...(args.title ? { title: args.title } : {}),
    },
  };
  const body = JSON.stringify(payload);
  const ts = String(Date.now());
  const nonce = crypto.randomUUID();
  const bodyHash = crypto.createHash("sha256").update(body, "utf8").digest("hex");

  const headers = {
    "Authorization": `Bearer ${token}`,
    "x-mcp-token": token,
    "x-mcp-timestamp": ts,
    "x-mcp-nonce": nonce,
    "x-mcp-body-sha256": bodyHash,
  };

  const url = `${args.bridge.replace(/\/+$/, "")}/mcp/tool`;
  const result = await postJson(url, body, headers, args.caCert);

  if (result.status !== 200 || !result.json || result.json.ok !== true) {
    process.stderr.write(
      `Publish failed (HTTP ${result.status}):\n${result.text || "(no body)"}\n`
    );
    process.exit(1);
  }

  process.stdout.write(JSON.stringify(result.json, null, 2) + "\n");
}

main().catch((err) => {
  process.stderr.write(`${err && err.stack ? err.stack : String(err)}\n`);
  process.exit(1);
});
