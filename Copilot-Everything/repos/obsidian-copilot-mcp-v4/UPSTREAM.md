# obsidian-copilot-mcp-v4 — Upstream lineage

Vendored fork of `logancyang/obsidian-copilot`. Nested `.git` removed per the monorepo
"single root, no nested .git" policy.

**This supersedes `../obsidian-copilot-mcp` (upstream 3.3.3), which was RETIRED 2026-10-21** and now lives only in
git history (`git log -- Copilot-Everything/repos/obsidian-copilot-mcp`).

## Provenance

| Field | Value |
|---|---|
| Upstream repo | `https://github.com/logancyang/obsidian-copilot.git` |
| Upstream baseline | tag `4.0.0` (SHA `a78b69b9b190803150150473fb1a9a9b4a42abe4`) |
| Created | 2026-08-12 (MCP module ported from the 3.3.3 fork) |
| **Fork manifest version** | **`99.4.0` — deliberately ABOVE upstream (see "Versioning")** |
| Real base recorded in | custom `upstreamBase: "4.0.0"` field in `manifest.json` |

## ⚠️ Versioning — pin ABOVE upstream, not equal to it

**The fork's manifest `version` MUST sort above any plausible upstream release. Use `99.<upstream-minor>.<patch>`.**

History, in three acts:

1. Shipped as `3.3.2-mcp.1`. In semver a prerelease sorts **below** stock `3.3.2`, so auto-update
   saw stock `3.3.3` as strictly newer and overwrote the fork — twice.
2. Fixed by matching the upstream tag **exactly** (`3.3.3`). Auto-update then saw "same version, no
   update." The predecessor `UPSTREAM.md` correctly noted this only holds *"until upstream actually
   releases a higher version."*
3. **2026-08-12 02:41 — upstream released `4.0.0` and the fork was wiped again.** Exact-matching is
   a defense with an expiry date.

`99.4.0` has no expiry: Obsidian offers an update only when the registry version sorts **higher**,
and upstream will not reach 99. The true base lives in `upstreamBase` so provenance is not lost.

**Belt-and-suspenders still recommended:** disable auto-update for Copilot in Obsidian →
Community plugins. Note `.obsidian/community-plugins-versions.json` is NOT a usable pin — it has
been stale since 2026-05-04 and still records `"copilot": "3.2.8"`.

## Fork delta vs upstream 4.0.0

Everything else is stock upstream. The MCP delta is:

**Added files** (copied from the 3.3.3 fork, unmodified except where noted):

| Path | Notes |
|---|---|
| `src/mcp/McpToolProvider.ts` | registers catalog tools against `ToolRegistry`. **bridges-uds (2026-11-24)**: Unix-socket only; no `requestUrl` and no HTTP path for any server (an `http` entry gets no tools and is reported, never dialled); same body bytes and X-MCP-Token/Nonce/Timestamp/Body-Sha256 headers plus explicit Content-Type and Content-Length; `/healthz` over the socket |
| `src/mcp/McpEventClient.ts` | SSE client for the bridge `research` stream. **bridges-uds**: over the vault bridge's socket via `udsOpenStream`, no mkcert CA loader, same 1 s to 30 s backoff, 60 s idle timeout |
| `src/mcp/McpEventBridge.ts` | wires SSE events → chat bubble / tab open. **bridges-uds**: `pickActiveServer` follows the vault bridge only (id `local-obsidian-mcp`, else a socket entry resolving to `vault-bridge.sock`) |
| `src/mcp/catalog.ts` | **modified**: Zod v4 fix + `miyo_search_context` added |
| `src/mcp/types.ts` | `McpSettings` / `McpServerConfig`. **bridges-uds**: `socketPath?`; `httpEndpoint` optional, kept only as a record |
| `src/mcp/McpToolProvider.test.ts` | unit test. **bridges-uds**: transport stubbed at `udsRequest`; asserts zero `requestUrl`/http calls for an `http` entry |
| `src/settings/v2/components/McpSettings.tsx` | settings panel. **bridges-uds**: cards show transport and the resolved socket path (token still masked); Diagnostics lists the entries the socket migration moved and left |
| `src/commands/customCommandHeadless.ts` | **fork addition, ported 2026-08-12.** Headless "→ New Note" runner: executes a custom command with no modal and writes the result to `customCommandNoteFolder`. Adapted for 4.0.0 — model now resolved via `resolveChatBackendModel` (3.3.3 used the legacy `settings.activeModels`), and `app` is threaded in rather than read from the global |

**Added by bridges-uds (2026-11-24)** — the bridges left loopback TCP + mkcert TLS for Unix sockets in
`~/.local/state/trinc/run`:

| Path | Notes |
|---|---|
| `src/mcp/udsClient.ts` | the socket client: `resolveBridgeSocket` (each known id bound to its own socket name, other ids to the name their legacy endpoint's port gives), `assertSocketTrust`, `udsRequest`, `udsOpenStream`. Same rules as the "bridges-uds client v1" block (exact path sent is checked; whole directory chain; ENOENT without connecting; socket mode; ACL allow check memoized per process; `createConnection` pin; no agent). Node only through a run-time `globalThis.require`; unavailable on mobile; `setUdsClientDepsForTests` is the jest seam |
| `src/mcp/socketMigration.ts` | on every load, idempotent: `http` entries of the three bridges become `uds` (`socketPath` `""` for the known ids, `~/.local/state/trinc/run/<name>` for others), token and every other field kept; a known id whose port disagrees is left and reported; persisted by the normal settings save; never logs a token or an endpoint |
| `src/mcp/udsClient.test.ts`, `src/mcp/McpEventClient.test.ts` | real-socket suites (`@jest-environment node`, `/tmp/uds-*` homes) |
| `src/mcp/socketMigration.test.ts`, `src/mcp/McpEventBridge.test.ts` | unit tests |
| `src/agentMode/acp/acpMcpServers.ts` (+ `.test.ts`) | fork addition of 2026-08-14 (called from `AcpBackendProcess.mcpServersField`), missing from this table until now. **bridges-uds**: routes enabled `uds` entries of `command-center` / `viz-studio` whose socket resolves; the proxy env is `OPENCLAW_BRIDGE_SOCKET` (resolved absolute path), `OPENCLAW_BRIDGE_TOKEN` and `PATH` only (no `OPENCLAW_BRIDGE_URL`, no `NODE_EXTRA_CA_CERTS`) |

**Modified upstream files** (8). Note `src/mcp/McpToolProvider.test.ts` was additionally adapted to
upstream's obsidian mock API — see bug 3 below; `__mocks__/obsidian.js` itself is left stock:

| Path | Change |
|---|---|
| `src/main.ts` | imports; `mcpEventBridge?` field; `McpToolProvider.syncFromSettings(next.mcp)` + `mcpEventBridge?.restart()` inside the `subscribeToSettingsChange` callback; initial sync after `initializeBuiltinTools(this.app)`; `McpEventBridge` construction after `initWebSelectionWatcher()`. **bridges-uds**: `migrateMcpServersToSockets()` right after `runSettingsMigrations`; `onunload` stops the `McpEventBridge` (and clears the field) before its first `await` |
| `src/settings/model.ts` | `import type { McpSettings }`; `mcp: McpSettings` on `CopilotSettings` |
| `src/constants.ts` | `mcp` block in `DEFAULT_SETTINGS`. **bridges-uds**: the one default server, `local-obsidian-mcp`, is `transport: "uds"` with `socketPath: ""` and no endpoint (was `https://127.0.0.1:8798`) |
| `jest.setup.js` | **bridges-uds**: the `window`-only shims are guarded so `@jest-environment node` suites can load |
| `manifest.json` | fork `name`, `version` (see "Versioning") and `upstreamBase`; the description names the fork's delta. **bridges-uds**: it names the bridges' sockets instead of their old ports |
| `src/settings/v2/SettingsMainV2.tsx` | `Plug` icon import; `McpSettings` import; `"mcp"` in `TAB_IDS`; icon / component / label entries |
| `src/tools/ToolRegistry.ts` | `providerId?` on `ToolMetadata`; `removeByProvider()`; `replaceByProvider()` |
| `src/commands/customCommandRegister.ts` | `getToNoteCommandId()` + a second `addCommand` registering `${commandId}-to-note` per custom command |
| `src/settings/model.ts` | additionally: `customCommandNoteFolder: string` (upstream 4.0.0 removed the field) |
| `src/constants.ts` | additionally: `customCommandNoteFolder: "Copilot Summaries"` default |

## Three live bugs found by testing the tools (2026-08-12)

A successful build proved nothing about whether the tools actually work. Replaying
`McpToolProvider.postHttpToolCall`'s exact wire contract against the running bridges found three
defects a UI smoke test would likely have masked:

1. **`operation` is validated against a STRICT enum by the bridge.** Sending
   `operation: "miyo_search_context"` returns **HTTP 400 `invalid_enum_value`** — the bridge accepts
   only `open_vault | create_note | append_note | read_note | search_notes | execute_command`.
   A tool whose name is not one of those MUST **omit `operation` entirely**; the dispatcher keys on
   `tool` anyway. (`obsidian_health` works precisely because it sends no `operation`.) Fixed by
   dropping the field from the `miyo_search_context` catalog entry.
2. **Response shape differs between the two bridges.** The canonical bridge (`:8798`) answers
   `{ok, data, meta}`, but the OpenClaw Command Center (`:8799`) puts its payload at the **top
   level** — `{ok: true, templates: [...]}` with no `data` key. `McpToolProvider` did
   `data: parsed.data ?? null`, so **every `obsidian_openclaw_*` tool handed the model `null`.**
   This was pre-existing in the 3.3.3 fork, not introduced by the port. Fixed by preferring `data`
   when present and otherwise surfacing the remaining top-level fields.
3. **The fork had also patched `__mocks__/obsidian.js`** — a fourth modified file the delta table
   missed. 3.3.3 made `requestUrl` a `jest.fn()` directly; upstream 4.0.0 exports it as a
   passthrough wrapper with a `__setRequestUrlImpl` helper, so `requestUrl.mockResolvedValue(...)`
   throws `TypeError: ... is not a function`. Fixed by adapting the **test** to upstream's API
   rather than re-patching a shared mock other suites depend on. Note the override must be
   installed via a **namespace import** (`import * as obsidianModule from "obsidian"`) —
   `jest.requireMock("obsidian")` can return a different module instance, silently leaving
   upstream's default impl (`json: undefined`) in place and failing only the test that performs a
   real call.

Verified live after the fixes — all 5 exercised tools return HTTP 200 `ok:true`:
`obsidian_health`, `obsidian_search_notes`, `obsidian_read_note`, `miyo_search_context` (:8798)
and `obsidian_openclaw_templates` (:8799, returns the 7 real workflow templates).

## ⚠️ The 3.3.3 delta table was INCOMPLETE — verify against the tree, not the doc

The predecessor `UPSTREAM.md` documented only the MCP module. It never mentioned
`customCommandHeadless.ts` or the `-to-note` registration, so the 2026-08-12 port copied the
MCP files, passed `tsc`, built clean — and silently dropped a whole second fork feature.

Nothing surfaced it: the plugin worked, the tests passed, and the loss only appeared when the
Raycast "Video Pipeline Runner" was checked and found to be falling back to its paid Anthropic
path because `copilot:summarize-to-note` no longer existed.

**On any future re-port, diff the whole `src/` tree against pristine upstream** rather than
trusting this table. A delta table records what someone remembered; a diff records what is
actually there.

## Two things that bite on re-port

1. **`ToolRegistry.ts` is a real modification, not just a reference.** A grep for
   `McpToolProvider|McpEventClient|McpEventBridge` finds only a doc comment there and will
   under-count the port surface. The fork *adds* `providerId?` + two methods. `tsc` catches it:
   `Property 'removeByProvider' does not exist on type 'ToolRegistry'`.
2. **Zod v3 → v4.** Upstream 4.0.0 ships zod `4.4.3` (3.3.3 had `3.25.76`). `z.record(valueType)`
   must become `z.record(keyType, valueType)`, or you get
   `TS2554: Expected 2-3 arguments, but got 1` in `catalog.ts`.

## Tool catalog (12)

`obsidian_health`, `obsidian_open_vault`, `obsidian_create_note`, `obsidian_append_note`,
`obsidian_read_note`, `obsidian_search_notes`, `obsidian_execute_command`,
`obsidian_openclaw_templates`, `obsidian_openclaw_run_workflow`, `obsidian_openclaw_status`,
`obsidian_openclaw_results`, **`miyo_search_context`** (added 2026-08-12).

`McpToolProvider` posts `{tool, operation?, input}`. The dispatcher keys on the **full tool name**
(`tool`), which is why a non-`obsidian_`-prefixed tool like `miyo_search_context` routes fine — but
`operation`, when sent, is validated against a strict 6-value enum and MUST be omitted for such
tools (see bug 1 above). Its schema mirrors
`bridges/obsidian-copilot-bridge/src/server/tools/miyoSearchContext.ts`.

## Re-sync / rebuild

```bash
cd "/Users/myhome/TRINC/Copilot-Everything/repos/obsidian-copilot-mcp-v4"
npm install
npm run build            # tsc -noEmit -skipLibCheck && esbuild production
```

Deploy to the vault slot (`.obsidian/plugins/copilot/`): copy `main.js`, `manifest.json`,
`styles.css`. **Never copy `data.json`** — the live one holds real bridge auth tokens and the
BYOK provider registry. The production path is `ops/tr-suite/deploy.sh`, which also places
`openclaw-stdio-proxy.mjs`; opencode executes that file directly, so it must stay 0755. The first
load of a bridges-uds build rewrites the `mcp` block of `data.json` itself (`http` → `uds`, see
`src/mcp/socketMigration.ts`); `deploy.sh` keeps a copy of the previous `data.json` for a rollback.

To re-baseline on a newer upstream: clone the new tag, re-apply the delta table above, bump the
fork manifest to `99.<new-minor>.0`, update `upstreamBase`, then `rm -rf .git`.

## Verification

`tsc -noEmit -skipLibCheck` → 0 · `npm run build` → 0 · `npm run test:mobile-load` → passes.
Runtime proof that the MCP layer is live goes through the sockets, never a port:
`node /Users/myhome/TRINC/ops/tr-suite/uds-health.mjs` prints one status line per bridge from its
`/healthz` over `~/.local/state/trinc/run/<name>.sock` (no token is sent or printed), and Settings →
MCP → Diagnostics shows "Server responded to /healthz on unix:…/vault-bridge.sock" for
`local-obsidian-mcp`. This plugin's `McpEventBridge` subscription is counted as
`sse_subscribers_total{stream=research}` in the vault bridge's token-protected `/metrics` (subscriptions
since the bridge started); it was never part of `/healthz`, as this section used to say.
