/**
 * FORK ADDITION (2026-08-14): expose the fork's own MCP bridges to Agent-mode sessions.
 *
 * Quick Chat reaches the bridges through `McpToolProvider`, a bespoke HTTP client. Agent mode
 * instead speaks ACP, which carries MCP servers in the `session/new`|`resume`|`load` payload —
 * and the fork was sending a hardcoded empty array, so agent sessions saw no vault tools and no
 * OpenClaw pipeline tools at all. This module translates the fork's persisted MCP settings into
 * ACP `McpServer` entries.
 *
 * Scoping matters here: the servers are attached per ACP session, so they reach only the
 * Obsidian-spawned agent. They are deliberately NOT added to opencode's global config, which is
 * shared with the free delegation worker whose MCP surface was stripped on 2026-08-06 (a
 * read-only/public-data allowlist). Vault-write and workflow-runner tools must never reach it.
 */

import type { McpServer } from "@agentclientprotocol/sdk";
import type { McpServerConfig, McpSettings } from "@/mcp/types";

/** See AGENTS.md → "Referential stability". */
const EMPTY_ACP_MCP_SERVERS: readonly McpServer[] = Object.freeze([]);

/**
 * Bridges that implement MCP JSON-RPC (`initialize` / `tools/list` / `tools/call`) over HTTP and
 * can therefore complete an agent's MCP handshake.
 *
 * The Command Center bridge (:8799) does, and its catalog already covers both the OpenClaw
 * workflow tools and the standard `obsidian_*` vault tools. The Viz Studio bridge (:8800,
 * trinc-viz-studio plugin) does too — 6 `viz_*` visualization tools, JSON-RPC verified live
 * 2026-08-16. The canonical bridge (:8798) does NOT — it serves a custom REST surface
 * (`/mcp/tool`, `/mcp/events`, `/healthz`) with no JSON-RPC handler, so declaring it would hand
 * the agent an endpoint whose handshake fails. Add an id here only after confirming that
 * endpoint answers `tools/list`.
 */
const ACP_MCP_CAPABLE_SERVER_IDS: ReadonlySet<string> = new Set(["command-center", "viz-studio"]);

/**
 * Path of the stdio proxy, relative to the vault's plugin directory. Shipped with the plugin so
 * it travels with a deploy and needs no separate install step.
 */
const OPENCLAW_STDIO_PROXY_FILE = "openclaw-stdio-proxy.mjs";

/**
 * Directories prepended to the proxy's PATH so its `#!/usr/bin/env node` shebang resolves.
 * Obsidian launched from Finder inherits a minimal PATH that usually lacks Homebrew and nvm.
 */
const NODE_PATH_CANDIDATES = ["/opt/homebrew/bin", "/usr/local/bin"];

/** `true` when this configured server can serve an agent's MCP handshake over HTTP. */
function isAcpRoutable(server: McpServerConfig): boolean {
  return (
    server.enabled &&
    server.transport === "http" &&
    ACP_MCP_CAPABLE_SERVER_IDS.has(server.id) &&
    server.httpEndpoint.trim().length > 0
  );
}

/**
 * Build the ACP `mcpServers` payload from the fork's MCP settings.
 *
 * @param mcp - Persisted MCP settings; when MCP is disabled the result is empty.
 * @param pluginDir - Absolute path of this plugin's directory, where the stdio proxy is deployed.
 * @returns One stdio entry per routable bridge, carrying its endpoint and bearer token in env.
 */
export function acpMcpServersFromSettings(
  mcp: McpSettings | undefined,
  pluginDir: string
): readonly McpServer[] {
  if (!mcp?.enabled || !pluginDir) return EMPTY_ACP_MCP_SERVERS;

  const servers: McpServer[] = [];
  for (const server of mcp.servers ?? []) {
    if (!isAcpRoutable(server)) continue;
    // Stdio, not http: the bridge answers JSON-RPC with `application/json`, while opencode's
    // remote-MCP client speaks HTTP+SSE and rejects that ("Invalid content type, expected
    // text/event-stream"). Stdio is the baseline transport every MCP client supports, so the
    // proxy sidesteps transport negotiation entirely and forwards frames verbatim.
    const env = [
      { name: "OPENCLAW_BRIDGE_URL", value: server.httpEndpoint.trim() },
      { name: "OPENCLAW_BRIDGE_TOKEN", value: server.authToken },
      {
        name: "PATH",
        value: [...NODE_PATH_CANDIDATES, process.env.PATH ?? ""].filter(Boolean).join(":"),
      },
    ];
    if (process.env.NODE_EXTRA_CA_CERTS) {
      env.push({ name: "NODE_EXTRA_CA_CERTS", value: process.env.NODE_EXTRA_CA_CERTS });
    }
    servers.push({
      name: server.id,
      command: `${pluginDir}/${OPENCLAW_STDIO_PROXY_FILE}`,
      args: [],
      env,
    });
  }

  return servers.length > 0 ? servers : EMPTY_ACP_MCP_SERVERS;
}
