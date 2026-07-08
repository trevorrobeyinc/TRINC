# obsidian-copilot-mcp — Upstream lineage

Vendored fork of `logancyang/obsidian-copilot`. Nested `.git` removed per the monorepo "single root, no nested .git" policy.

## Provenance

| Field | Value |
|---|---|
| Upstream repo | `https://github.com/logancyang/obsidian-copilot.git` |
| Upstream baseline | tag `3.3.3` (SHA `bd8829f`) |
| Refreshed | 2026-05-23 (from prior v3.3.2 baseline) |
| Owner | trevoralexanderrobey |
| **Fork manifest version** | **`3.3.3` — EXACTLY matches the upstream tag (see "Versioning" below)** |

## ⚠️ Versioning — do NOT use a prerelease suffix

**The fork's manifest `version` MUST exactly equal the upstream tag it is based on (e.g. `3.3.3`), never `3.3.3-mcp.1`.**

History: the fork was first shipped as `3.3.2-mcp.1`. In semver, `3.3.2-mcp.1` is a *pre-release* of 3.3.2 and sorts BELOW even stock `3.3.2`. So when Obsidian's community-plugin auto-update saw stock `3.3.3`, it considered it strictly newer and silently overwrote the fork (twice). Matching the upstream version exactly means auto-update sees "same version, no update" and leaves the fork in place until upstream actually releases a higher version.

**Belt-and-suspenders**: the user should also disable auto-update for the Copilot plugin (Obsidian → Community plugins → gear → turn off auto-update, or globally). With auto-update off, the fork is never overwritten regardless of version. Re-sync becomes a deliberate `npm run build` + deploy via this doc.

The fork is distinguished from stock not by version but by the `manifest.json` `description` ("MCP-first Obsidian Copilot fork …") and `author` ("… fork by Trevor Robey").

## Fork delta vs upstream (MCP-only scope)

Client-only — adds an MCP client so Copilot chat can call tools from the canonical bridge at `https://127.0.0.1:8798`. No TCP listener added.

### New files (restore verbatim on every re-sync)
- `src/mcp/{types,catalog,McpToolProvider,McpToolProvider.test,McpEventClient,McpEventBridge}.ts`
- `src/settings/v2/components/McpSettings.tsx`
- `src/settings/v2/components/ContainerContext.tsx`

### Patches (re-apply on every re-sync)
| File | Change |
|---|---|
| `src/main.ts` | imports + `mcpEventBridge?` field + onload `McpToolProvider.syncFromSettings(getSettings().mcp)` + `new McpEventBridge(...).start()` + onunload `.stop()` + settings-handler `syncFromSettings(next.mcp)` + `restart()` |
| `src/constants.ts` | `mcp:` block in DEFAULT_SETTINGS, `httpEndpoint: "https://127.0.0.1:8798"`, 7-tool default |
| `src/settings/model.ts` | `mcp: McpSettings` field + import |
| `src/settings/v2/SettingsMainV2.tsx` | `"mcp"` in TAB_IDS, `Plug` icon, `<McpSettings />` |
| `src/settings/SettingsPage.tsx` | wrap `<SettingsMainV2/>` in `<ContainerContext.Provider value={containerEl}>` |
| `src/tools/ToolRegistry.ts` | `providerId?: string` on ToolMetadata + `removeByProvider()` + `replaceByProvider()` — **commonly missed; build fails without it** |
| `src/miyo/MiyoServiceDiscovery.ts` | fallback URL `http://127.0.0.1:8742` → `https://127.0.0.1:8743` |
| `manifest.json` | version = upstream tag exactly; fork description + author |

### Re-sync stability note (3.3.2 → 3.3.3)
Only `src/constants.ts` changed upstream on the patch surface; main.ts/model.ts/SettingsPage/SettingsMainV2/ToolRegistry/MiyoServiceDiscovery were byte-identical, so those patches re-applied verbatim. The `convertedDocOutputFolder` DEFAULT_SETTINGS insertion anchor for the mcp block has been stable across 3.2.8 → 3.3.3.

## Re-sync procedure

```
git clone https://github.com/logancyang/obsidian-copilot.git /tmp/copilot-vNEW
git -C /tmp/copilot-vNEW checkout <new-tag>
git -C <monorepo> tag --no-sign pre-copilot-fork-refresh-v<NEW>-YYYY-MM-DD
# stage MCP files
mkdir -p /tmp/stage/src/settings/v2/components
cp -R <fork>/src/mcp /tmp/stage/src/mcp
cp <fork>/src/settings/v2/components/{McpSettings,ContainerContext}.tsx /tmp/stage/src/settings/v2/components/
# wipe + re-vendor
rm -rf <fork>/* ; cp -R /tmp/copilot-vNEW/. <fork>/ ; rm -rf <fork>/.git
# restore MCP files
cp -R /tmp/stage/src/mcp <fork>/src/mcp
cp /tmp/stage/src/settings/v2/components/*.tsx <fork>/src/settings/v2/components/
# re-apply the 8 patches above; set manifest version = <new-tag> EXACTLY
cd <fork> && npm install && npm run build
cp main.js manifest.json styles.css "/Volumes/ExtraCurricular/My Digital Garden/.obsidian/plugins/copilot/"
```

## Watch for upstream MCP support
[logancyang/obsidian-copilot#1451](https://github.com/logancyang/obsidian-copilot/issues/1451). When upstream ships MCP client support, drop this fork and use stock + config.

## Rollback anchors
- Monorepo tag `pre-copilot-fork-refresh-v333-2026-05-23` (this refresh)
- Monorepo tag `pre-copilot-fork-refresh-2026-05-19` (the v3.3.2 refresh)
- Vault snapshot: `Copilot-Everything/repos/.upstream-v3.3.2-vault-snapshot/`
