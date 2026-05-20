# obsidian-copilot-mcp — Upstream lineage

This directory is a **vendored fork** of `logancyang/obsidian-copilot`. The fork's nested `.git` is removed per the monorepo "single root, no nested .git" policy.

## Provenance

| Field | Value |
|---|---|
| Upstream repo | `https://github.com/logancyang/obsidian-copilot.git` |
| Upstream baseline | tag `3.3.2` (SHA `ba378e838953a9594a8116fea1d28fc9c5c187a6`) |
| Vendored on | 2026-05-19 |
| Refreshed from | upstream tag `3.2.8` (SHA `95d23b2`) + fork SHA `df61538` (2026-05-07 vendor); see "Previous lineage" below |
| Owner | trevoralexanderrobey |
| Fork version (manifest) | `3.3.2-mcp.1` |

## Fork delta vs upstream v3.3.2 (MCP-only scope)

The fork is **client-only** — adds an MCP client layer so Copilot chat can call tools exposed by the canonical TrevClaw-Obsidianodus obsidian-copilot-bridge at `https://127.0.0.1:8798`. No TCP listener is added by this fork.

### New files

- `src/mcp/types.ts` — `McpServerConfig`, `McpSettings` type definitions
- `src/mcp/catalog.ts` — static catalog of 7 tool definitions (`obsidian_*`) callable via the bridge
- `src/mcp/McpToolProvider.ts` — registers MCP tools into `ToolRegistry`; POSTs to `{httpEndpoint}/mcp/tool` with HMAC replay-protection headers (`X-MCP-Nonce`, `X-MCP-Timestamp`, `X-MCP-Body-Sha256`)
- `src/mcp/McpToolProvider.test.ts` — unit tests
- `src/mcp/McpEventClient.ts` — SSE subscriber to `{httpEndpoint}/mcp/events?stream=research` via Node's `https` module (Electron `fetch` ignores `NODE_EXTRA_CA_CERTS`); handles mkcert CA discovery for macOS/Linux/Windows
- `src/mcp/McpEventBridge.ts` — wires `McpEventClient` into plugin lifecycle; renders `research_arrived` SSE events as chat system bubbles + opens published note
- `src/settings/v2/components/McpSettings.tsx` — settings UI for configuring MCP servers
- `src/settings/v2/components/ContainerContext.tsx` — React context exposing the settings tab's `containerEl` for portal targeting

### Patches (kept minimal)

| File | Change |
|---|---|
| `src/main.ts` | Add imports + `mcpEventBridge?` field + onload wiring (`McpToolProvider.syncFromSettings(getSettings().mcp)`, `new McpEventBridge(...).start()`) + onunload `.stop()` + settings-handler `McpToolProvider.syncFromSettings(next.mcp)` + `this.mcpEventBridge?.restart()` |
| `src/constants.ts` | Add `mcp:` block to `DEFAULT_SETTINGS` with `httpEndpoint: "https://127.0.0.1:8798"` (canonical bridge, HTTPS) and 7-tool default `enabledToolNames` |
| `src/settings/model.ts` | Add `mcp: McpSettings` field to `CopilotSettings` + import |
| `src/settings/v2/SettingsMainV2.tsx` | Add `"mcp"` to `TAB_IDS`, register `Plug` icon, render `<McpSettings />` |
| `src/settings/SettingsPage.tsx` | Wrap `<SettingsMainV2 />` with `<ContainerContext.Provider value={containerEl}>` |
| `src/tools/ToolRegistry.ts` | Add `providerId?: string` to `ToolMetadata` + `removeByProvider(id)` + `replaceByProvider(id, defs)` methods |
| `src/miyo/MiyoServiceDiscovery.ts` | Change fallback URL `http://127.0.0.1:8742` → `https://127.0.0.1:8743` (TLS proxy, HTTPS-only invariant) |
| `manifest.json` | Version `3.3.2` → `3.3.2-mcp.1`, fork description, author note |

### What was deliberately NOT brought over from prior fork (df61538)

The prior fork tip (df61538, vendored 2026-05-07) also contained:
- `src/backend/{BackendAdapter,BackendSelector,HostedBrevilabsAdapter,SelfHostAdapter,selfHostContract}.ts` — adapter abstraction replacing `BrevilabsClient` with `BackendSelector`. **Dropped** in this refresh because (a) `SelfHostAdapter` calls `/v1/self-host/agent-turn` and `/healthz` on the retired `:8789` backend-emulator (deleted 2026-04-11), (b) the refactor touches 14 files, (c) upstream v3.3.2 deeply integrated `BrevilabsClient` into `plusUtils`, `KeychainService`, and the new `ProjectRegister` — high merge cost for zero current benefit.
- `src/LLMProviders/chainRunner/SelfHostEmulatorChainRunner.ts`, `VaultZKDirectChainRunner.ts` — chain runners for the retired emulator and an in-process Vault ZK lane. **Dropped** for the same reason.
- Plugin-side `decryptStoredSettings` / `enableEncryption` re-encryption loop in `main.ts`. **Dropped** — upstream removed encryption entirely in v3.3.1 (replaced by `KeychainService`); the fork's logic is dead code against v3.3.2.
- `OFFICIAL_PLUGIN_ID` / `OFFICIAL_GHOST_CHAT_VIEWTYPE` / `cleanupGhostChatLeaves()` in `main.ts`. **Dropped** — only relevant when the fork co-exists with the official `copilot` plugin in the same vault; the deployment replaces the official plugin entirely.

## How to re-sync from upstream (next release)

```
# 1. Fetch the new upstream tag
git clone https://github.com/logancyang/obsidian-copilot.git /tmp/copilot-vNEW-baseline
git -C /tmp/copilot-vNEW-baseline checkout <new-tag>

# 2. Anchor a rollback in the monorepo
git tag --no-sign pre-copilot-fork-refresh-YYYY-MM-DD <current-HEAD>

# 3. Stage MCP-specific files
mkdir -p /tmp/fork-mcp-stage/src/{mcp,settings/v2/components,tools}
cp -R Copilot-Everything/repos/obsidian-copilot-mcp/src/mcp /tmp/fork-mcp-stage/src/
cp Copilot-Everything/repos/obsidian-copilot-mcp/src/settings/v2/components/McpSettings.tsx /tmp/fork-mcp-stage/src/settings/v2/components/
cp Copilot-Everything/repos/obsidian-copilot-mcp/src/settings/v2/components/ContainerContext.tsx /tmp/fork-mcp-stage/src/settings/v2/components/

# 4. Wipe + re-vendor (this loses your patches; you'll re-apply them in step 5)
rm -rf Copilot-Everything/repos/obsidian-copilot-mcp/*
cp -R /tmp/copilot-vNEW-baseline/. Copilot-Everything/repos/obsidian-copilot-mcp/
rm -rf Copilot-Everything/repos/obsidian-copilot-mcp/.git

# 5. Restore staged files
cp -R /tmp/fork-mcp-stage/src/mcp Copilot-Everything/repos/obsidian-copilot-mcp/src/
cp /tmp/fork-mcp-stage/src/settings/v2/components/McpSettings.tsx Copilot-Everything/repos/obsidian-copilot-mcp/src/settings/v2/components/
cp /tmp/fork-mcp-stage/src/settings/v2/components/ContainerContext.tsx Copilot-Everything/repos/obsidian-copilot-mcp/src/settings/v2/components/

# 6. Re-apply the 8 patches from "Patches" table above. Each is a small,
#    well-bounded edit. The two that most commonly need adjustment as upstream
#    evolves are main.ts (where the import block + onload structure changes
#    each release) and SettingsMainV2.tsx (where the TAB_IDS array sometimes
#    moves). Read the file, find the analogous insertion point, apply.

# 7. Build + deploy
cd Copilot-Everything/repos/obsidian-copilot-mcp
npm install
npm run build
cp main.js manifest.json styles.css "/Volumes/ExtraCurricular/My Digital Garden/.obsidian/plugins/copilot/"
```

## Watch for upstream MCP support

Upstream tracks MCP client support at [logancyang/obsidian-copilot#1451](https://github.com/logancyang/obsidian-copilot/issues/1451). When that lands, this fork's `src/mcp/` may be redundant — at that point, drop the fork and use upstream directly with the appropriate settings. Until then, this fork is the only path to Copilot-in-Obsidian + MCP tool calling.

## Previous lineage (historical)

| Field | Value |
|---|---|
| Vendor SHA (2026-05-07 → 2026-05-19) | `df6153867e162a251a3ab1634ac269d27de17fa6` |
| Fork branch (at vendor time) | `codex/post-validated-mcp-baseline` |
| Tip commit message | `feat: establish copilot-mcp backend adapters and MCP tool layer baseline` |
| Vendor commit log (last 10) | df61538 (fork tip) ← 95d23b2 (v3.2.8) ← 2e3d6ba ← 1960d86 (v3.2.7) ← d8890ad ← c350f37 ← 8577705 ← ccf687b ← 7084705 (v3.2.6) ← 81fd4e5 |

Rollback anchor for the 2026-05-19 refresh: monorepo tag `pre-copilot-fork-refresh-2026-05-19`.
