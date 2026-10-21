# Copilot in Obsidian Everything

This workspace is the operational control center for a local AI-enabled Obsidian stack. It is already working and in a hardening phase.

## Architecture

Three active layers (backend-emulator retired 2026-04-11, deleted from monorepo 2026-05-08):

| Component | Location | Port | Role |
|---|---|---|---|
| Obsidian plugin fork | **`repos/obsidian-copilot-mcp-v4`** (LIVE) | — | MCP-first fork, **ported onto upstream 4.0.0 on 2026-08-12**, manifest `99.4.0`. Exposes 12 MCP tools to Copilot chat over HTTPS. The old `repos/obsidian-copilot-mcp` (3.3.3) was **retired 2026-10-21** with `scripts/sync-copilot-fork.sh` and `scripts/copilot-update-watcher.sh` (its LaunchAgent was no longer installed); it lives only in git history. |
| Shared MCP bridge | `bridges/obsidian-copilot-bridge` | 8798 | Canonical multi-operator daemon. **REST-only since 2026-05-09**: RestApiBackend (Local REST API plugin :27124) is the sole backend — the CLI subprocess backend was removed together with InprocPluginBackend + the Advanced URI parity tools (`src/backends/backendSelector.ts` requires restApi; there is no fallback). `/mcp/tool`'s optional `backendHint` accepts only the literal `"restApi"` — a stale `"cli"` hint is rejected HTTP 400 `invalid_literal` (this silently broke the Copilot fork's in-plugin agent vault tools until 2026-07-31, when the fork stopped sending the hint entirely). HTTPS/TLS with HMAC replay-guard. |
| Consolidated stdio adapter | `bridges/obsidian-stdio-adapter` | — | Single stdio MCP adapter that tunnels Claude/Raycast stdio consumers to :8798. Replaces claude-adapter, obsidian-mcp-stdio, raycast-obsidian-stdio (deletion of those pending). Three profiles via `OBSIDIAN_STDIO_PROFILE`: `claude` (default) and `raycast` (adds `raycast_daily_open`; since 2026-08-20 also proxies `video_pipeline_run`/`video_pipeline_status` to the Command Center bridge on :8799 — client-edge aggregation, see root `CLAUDE.md`), plus **`openclaw`** (v0.3.0, 2026-10-07): Claude Code's dispatch lane, a closed 13-tool allowlist proxied only to :8799 (start/watch OpenClaw runs); it never loads the :8798 config or token. **Registered 2026-10-07 as `openclaw-obsidian` in the repo `.mcp.json`** after the Security Everything gate hook was taught its prefix (sub-agent bar + Ralph-loop bar, no session scope; proposal and evidence: `~/.claude/plans/openclaw-dispatch-p3-gate-wiring-proposal.md`). **Verified 2026-10-07 (server names in `claude_desktop_config.json`, `~/.claude.json` and `.mcp.json`): the `claude` and `raycast` profiles are registered on no Claude surface; only `openclaw` is, and only since the same day**; see the corrected "Claude / Raycast Integration" section. |
| Miyo (via TLS proxy) | `scripts/miyo-tls-proxy.mjs` → external Miyo app | 8743 → 8742 | Semantic search via in-monorepo HTTPS proxy at :8743 forwarding to plaintext :8742. Index endpoints deprecated in v4. |
| Qdrant (via TLS proxy) | `scripts/qdrant-tls-proxy.mjs` → Miyo-bundled Qdrant | 6433 → 6333 | Local vector DB (collection `miyo`) via in-monorepo HTTPS proxy at :6433 forwarding to plaintext :6333. Fallback chunk retrieval for ZK service. |
| SearXNG (via TLS proxy) | `scripts/searxng-tls-proxy.mjs` → external SearXNG (launchd) | 8891 → 8890 | Local private metasearch via in-monorepo HTTPS proxy at :8891 forwarding to plaintext :8890 (JSON API for the `searxng-search` MCP connector). |

> The retired backend emulator on :8789 (`/v1/self-host/*`, `/v0/*` exact-self-host orchestration) and its `exact_backend_emulator` plugin runtime mode are gone. ZettelkastenService now runs in-process inside the `vault-zettelkasten` Obsidian plugin (Claude/obsidian-vault-zettelkasten/). The Raycast extension's `src/api/backend-emulator/` client was deleted with the emulator.

## Fork wipe 2026-08-12 — the version-matching defense failed

On 2026-08-12 02:41 Obsidian auto-updated the `copilot` plugin slot to **stock upstream
v4.0.0**, overwriting the fork. Verified by manifest (`"version":"4.0.0"`, `"author":"Logan
Yang"`, 441 bytes) and bundle size (5,232,787 B vs the fork's 3,462,372 B).

**Why the documented defense did not hold.** The fork pinned its manifest to match upstream
**exactly** (`3.3.3`), on the reasoning — recorded in the fork's own manifest description —
that a `-mcp.N` prerelease suffix sorted BELOW stock and got wiped. Matching exactly only
defends until upstream ships a higher version. Upstream released **4.0.0**, which sorts above
`3.3.3`, so Obsidian updated. *Version matching is a defense with an expiry date, not a lock.*
The durable fix is to pin the fork's manifest **above** any plausible upstream (e.g. `99.x.y`),
since Obsidian only offers an update when the registry version sorts higher.
`.obsidian/community-plugins-versions.json` is NOT a usable pin — it is stale since 2026-05-04
and still records `"copilot": "3.2.8"`.

**What was lost, and what was not.** `data.json` is not touched by plugin updates, so ALL fork
configuration survived — including `mcp.servers[]` pointing at `https://127.0.0.1:8798` and
`https://127.0.0.1:8799` (both already HTTPS), and `autonomousAgentEnabledToolIds` still listing
`mcp_local-obsidian-mcp_*` ids. **Config intact; the code that reads it is gone.** Upstream 4.0.0
has no HTTP MCP client at all — verified by signal count in the bundle:

| signal | fork 3.3.3 | upstream 4.0.0 |
|---|---|---|
| `mcp/tool` | 1 | **0** |
| `httpEndpoint` | 4 | **0** |
| `mcpServers` | 0 | 7 *(bundled Claude Agent SDK, unrelated)* |

**No native 4.0.0 config surface can substitute.** `agentMode.mcpServers` has zero readers and is
stripped by the `L0n` normalizer, which whitelists only `byok`, `activeBackend`,
`backends{opencode,claude,codex}`, `deviceProfiles`, `debugFullFrames`, `welcomeDismissed`,
`claudeCli`, `skills`. The `claude` backend normalizer (`j0n`) accepts only `defaultModel`,
`defaultMode`, `autoModePermission`, `enableThinking`, `envOverrides`. Restoring the tools on
4.0.0 therefore REQUIRES porting the fork's MCP module, not configuring it.

**Port surface (measured).** Self-contained: `src/mcp/{McpToolProvider,McpEventClient,McpEventBridge}.ts`
(+ test) and `src/settings/v2/components/McpSettings.tsx` — 1,225 lines total. Integration is
**15 touchpoints across 4 files**: `src/main.ts`, `src/settings/model.ts`,
`src/settings/v2/SettingsMainV2.tsx`, `src/tools/ToolRegistry.ts`. Note 4.0.0 replaced the
settings layer (`activeModels` → `providers`/`configuredModels` registry, `settingsVersion: 8`),
so the two settings touchpoints will need real rework rather than a straight copy.

**Operator decision 2026-08-12: do NOT downgrade to 3.3.3.** Staying on 4.0.0 keeps the Claude
agent lane (5 models enabled under `backends.claude`) and the BYOK provider registry. Upstream
4.0.0 bundle backed up at `deploy/backups/copilot-upstream-4.0.0-20260812-035227/`.

## PORT COMPLETE — 2026-08-12

The MCP module was ported onto upstream 4.0.0 and is **live**. New vendored fork:
`repos/obsidian-copilot-mcp-v4` (upstream `4.0.0` tag `a78b69b` + the MCP module).

**What the port required** — 13 touchpoints plus two things the 15-touchpoint count missed:

| area | change |
|---|---|
| `src/mcp/*` (6 files) | copied verbatim from the 3.3.3 fork |
| `src/settings/v2/components/McpSettings.tsx` | copied verbatim |
| `src/main.ts` | 5 hooks: imports, `mcpEventBridge?` field, `syncFromSettings` in the `subscribeToSettingsChange` callback, initial sync after `initializeBuiltinTools`, `McpEventBridge` ctor after `initWebSelectionWatcher()` |
| `src/settings/model.ts` | `import type { McpSettings }` + `mcp: McpSettings` on `CopilotSettings` |
| `src/constants.ts` | `mcp` block in `DEFAULT_SETTINGS` |
| `src/settings/v2/SettingsMainV2.tsx` | `Plug` icon import, `McpSettings` import, `TAB_IDS`, icon, component, label — 4.0.0 restructured tabs (`byok`/`miyo`/`selfhost`/`skills`), so this was NOT a copy |
| **`src/tools/ToolRegistry.ts`** | **the fork ADDED `providerId?` to `ToolMetadata` plus `removeByProvider()` / `replaceByProvider()`.** The original touchpoint scan saw only a doc comment here and undercounted it — `tsc` caught it. |
| **`src/mcp/catalog.ts`** | **Zod v3 → v4**: upstream 4.0.0 moved to zod `4.4.3`; `z.record(valueType)` must become `z.record(keyType, valueType)`. |

`tsc -noEmit -skipLibCheck` exits **0**; `npm run build` exits **0**.

**`miyo_search_context` was added** (catalog went 11 → 12 tools). Its schema mirrors the bridge's
own zod schema in `bridges/obsidian-copilot-bridge/src/server/tools/miyoSearchContext.ts`
(`query` required, optional `limit` 1–20). Note `McpToolProvider` sends BOTH `tool: entry.toolName`
and `operation`, and the bridge dispatcher keys on the **full tool name** — which is why a
non-`obsidian_`-prefixed tool routes correctly.

**Auto-update hardening.** The manifest is pinned to **`99.4.0`**, deliberately above any plausible
upstream, with the true base recorded in a custom `upstreamBase: "4.0.0"` field. Obsidian only
offers an update when the registry version sorts *higher*, so 99.x can never be superseded.
Matching upstream exactly is what failed on 2026-08-12 — do not go back to it.

**Live proof.** After deploy + reload, `GET https://127.0.0.1:8798/healthz` reports
`"sse_subscribers_total{stream=research}": 1` — that counter was empty before, and it is the ported
`McpEventBridge` holding an SSE connection. Runtime evidence, not just a successful build.

## Command Center agent tools — zk_* + video pipeline (2026-08-20)

The Copilot Chat Agent can now call the `vault-zettelkasten` plugin AND the video pipeline.
Seven zk catalog entries (`zk_serendipity`, `zk_cross_domain`, `zk_echo_chamber`,
`zk_semantic_linker`, `zk_orphan_rescue`, `zk_vault_health`, `zk_full_pipeline`) route through
the **:8799 Command Center bridge**, whose dispatcher calls
`app.plugins["vault-zettelkasten"].api` in-process — the same api `zettelkasten/linker.ts`
already used (zero subprocess, zero new listeners, no `operation` field per the miyo/viz
precedent). Two more entries (`video_pipeline_run`, `video_pipeline_status`) close a gap: the
bridge had served them for a while (and the stdio adapter proxies them for Claude/Raycast),
but without catalog entries the in-plugin agent could not call them. Contract of record:
`Claude/obsidian-command-center/src/bridge/mcp-bridge-server.ts` (bridge **32 tools** as of 2026-09-22 — `obsidian_openclaw_publish_vault` + `obsidian_openclaw_research_memory_search`, catalog 41; previously 30; catalog
27 entries after zk, 29 after the video pair, **39** after the engine suite — see below). zk analyses are synchronous (single ones
seconds-to-a-minute, `zk_full_pipeline` minutes — size the :8799 server `timeoutMs`
accordingly) and write NOTHING to the vault (`writeReport` pinned false; the model saves
results via `obsidian_create_note`). Activation is config, not code: add the `zk_*` +
`video_pipeline_*` names to the `command-center` server's `enabledToolNames` and enable the
matching `mcp_command-center_*` ids in the agent tool list.

**Engine suite — same day, later wave (2026-08-20).** Ten more catalog entries extend the
agent to the research engine's full agent-safe surface, all via :8799:
`obsidian_openclaw_{cancel, history, artifacts, engine_health, research_task,
research_tasks_list, research_output, delivery_evidence, citation_integrity, feed_stats}`,
plus `run_workflow` now returns the **workflow_id** (bounded 15s await of the stderr id
capture). Command-center side: `onWorkflowComplete` decoupled into independent fail-soft
stages (notes / notify / Miyo / ZK / research-memory — ingest now reads the on-disk
synthesizer artifact so it works with notes off), `research_notify` fires on FAILURE too
(payload gained `status`/`error`), the research-memory ingest spawn finally gets the mkcert
CA env + node fallback (it could never reach HTTPS Qdrant from a Finder launch before), the
ZK stdio-subprocess lane + `zettelkastenServerPath` + `bridgeToken` settings were RETIRED,
and the settings UI was regrouped/corrected. Never exposed, by design: dataset missions,
interaction logs, release/token scripts, feed rebuilds, delivery-evidence rebuild mode.
Real-provider engine calls surface `operator_gate_not_armed` when the one-shot YubiKey
token isn't freshly armed; `engine_health`/default `research_task` use the ungated mock
lane only.

## Key Paths

- Workspace root: `/Users/myhome/TrevClaw-Obsidianodus/Copilot-Everything/` (corrected 2026-07-31 — this line still carried the pre-wipe home `/Users/trevorrobey/…`, which has not existed since the 2026-05-31 machine wipe. Historical: the workspace lived at `~/Code/THE Copilot in Obsidian Everything/` until the 2026-05-07 monorepo consolidation, and the whole monorepo moved off `/Volumes/ExtraCurricular` onto the internal FileVault disk on 2026-07-26)
- Target vault: `/Users/myhome/My Digital Garden`
- Official plugin dir: `<vault>/.obsidian/plugins/copilot`
- Personal side-repos: `Code/` → **symlink** to `/Users/myhome/Code` (added 2026-08-18; see next section)

## `Code/` — personal side-repos (symlink, 2026-08-18)

`Copilot-Everything/Code` is a **symlink** to **`/Users/myhome/Code`** — the real and only home
of the independent PERSONAL side-repos: `Obsidian Clipper/`, `whisper-transcriber/`,
`TR-Portfolio/`, `trevorrobeyinc.github.io/`, `Scripts/`, plus two July-2026 `.bundle` DR files.

> **Superseded for TR plugins (2026-10-21).** `obsidian-auto-wiki-summarize` was a TR suite plugin
> (`contextual-wiki-definitions`), not a personal side-repo. It was absorbed with history into
> `Claude/obsidian-contextual-wiki-definitions/` (`9bfaa86`), the vault's plugin folder became a real
> deployed copy instead of a symlink into `~/Code`, and the old repo moved to
> `~/Code/_retired-absorbed-into-monorepo/`. Rule going forward: TR suite components live in this
> monorepo (registry: `ops/tr-suite/manifest.json`); personal projects stay in `~/Code`.

A symlink was chosen over a physical move **on purpose** (operator decision 2026-08-18):
every existing reference to `/Users/myhome/Code/…` (the vault plugin symlink, docs, tool
placeholders) stays valid with zero rewrites, and the monorepo can never ingest the nested
repos — git does not follow directory symlinks, and the link itself is ignored
(`.gitignore` → `/Code`). **Do NOT git-track the link, and do not vendor copies of these
repos into the monorepo** — they are separate git repositories with their own histories.

History: a stale 2026-07-06-era duplicate of this folder lived at `/Volumes/ExtraCurricular/Code`.
On 2026-08-18 it was verified byte-redundant (whisper-transcriber, obsidian-auto-wiki-summarize,
Scripts, and both bundles identical; Obsidian Clipper's only 3 differing files all newer on the
internal side; zero files unique to the external copy; zero references to the external path
anywhere on the machine) and handed to the operator for deletion. Nothing may reference the
external path again.

## Runtime Modes (preserve these)

- `direct_plugin_mcp` — Plugin owns the turn, talks to MCP servers directly
- `exact_backend_emulator` — Plugin delegates to backend emulator for full orchestration

These are not interchangeable.

> **Correction (2026-07-16, verified against the fork source `repos/obsidian-copilot-mcp`):**
> `direct_plugin_mcp`, `exact_backend_emulator`, and `production_official` are **conceptual labels
> only** — none exists as a literal runtime toggle in the current fork. The real live settings are
> `enableSelfHostMode`, `backendMode` (e.g. `hosted`), `defaultChainType` (e.g. `copilot_plus`), and
> `enableAutonomousAgent`. The plugin's actual MCP capability is: agent mode (`enableAutonomousAgent`,
> Copilot-Plus-gated) → a hard-coded tool catalog (`src/mcp/catalog.ts`) → authenticated HTTP
> `POST /mcp/tool` to a configured bridge (:8798 vault tools + `research` SSE; :8799 OpenClaw
> research-workflow tools). Treat the mode names above as historical intent, not code.

Current nuance:

- the intended official-plugin target runtime is still direct MCP plus native Miyo
- the installed plugin exact-emulator lane is also working again as an alternate path
- the installed `copilot` plugin is currently configured in `self_host` + `exact_backend_emulator` + `production_official` for active validation
- exact `copilot-plus` turns now forward the decrypted `plusLicenseKey`
- empty final model text in exact mode now surfaces as a real error instead of a blank bubble
- both lanes (direct MCP and exact-emulator) now read and write freely — no confirmation modals, no disclaimers
- default `confirmationPolicy` is `allow_without_prompt`; `read_only_only` is still available as an opt-in safety valve
- write-intent augmentation injects `create_note`/`append_note` when the planner misses obvious write requests
- deferred writes: the emulator streams the LLM summary first, then writes that polished text as the note content
- the disclaimer only fires when write tools are genuinely unavailable (MCP disabled, no server configured)

## Service Health Checks

```bash
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:8798/healthz
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:8743/v0/health   # Miyo via TLS proxy
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:6433/collections/miyo   # Qdrant via TLS proxy
# Backend emulator (:8789) was retired 2026-04-11; ZettelkastenService runs in-process inside the vault-zettelkasten plugin.
```

- Backend emulator (8789) — HTTP (RETIRED 2026-04-11, deleted 2026-05-08 — per the note inside the code block above; verified 2026-07-31: nothing listens on :8789. ZettelkastenService runs in-process inside the `vault-zettelkasten` plugin)
- MCP bridge (8798) — HTTPS (TLS via mkcert cert at `~/.local/share/mkcert/localhost.pem`)
- Miyo (8742) — HTTP (third-party upstream; reach via HTTPS proxy on :8743)
- Qdrant (6333) — HTTP (third-party upstream; reach via HTTPS proxy on :6433)


## Obsidian CLI

Official Obsidian CLI (ships with Obsidian 1.12.7+) at `/Applications/Obsidian.app/Contents/MacOS/obsidian`. Default vault: "My Digital Garden".

```bash
obsidian read file=<note-name>                    # Read note
obsidian create name=<note-name> content="text"   # Create note
obsidian open file=<note-name>                    # Open in Obsidian
obsidian search query=<query> format=json         # Search vault
obsidian daily                                    # Open daily note
obsidian daily:read                               # Read daily note
obsidian delete file=<note-name>                  # Delete note
obsidian move file=<note-name> to=<dest>          # Move/rename
obsidian append file=<note-name> content="text"   # Append to note
obsidian vault info=name                          # Vault info
obsidian version                                  # CLI version
```

Claude Desktop reaches the vault through FilesystemPlus and miyo today; the bridge adapter below is not registered on a Claude surface (see the corrected Claude Integration section).

## Build & Dev Commands

```bash
# Plugin
cd repos/obsidian-copilot-mcp-v4 && npm run dev    # Dev build
cd repos/obsidian-copilot-mcp-v4 && npm run build  # Production build

# MCP bridge
cd bridges/obsidian-copilot-bridge && npm run build
# (manual / dev start)
bash scripts/bridge-start.sh

# Note: backend-emulator dev/build commands removed 2026-05-08; module deleted.
# Note: PM2 ecosystem.config.js removed 2026-05-08; bridge ownership migrated to
# the obsidian-bridge-launcher Obsidian plugin (auto-spawn on Obsidian startup).
```

## Zettelkasten Backend

Five vault-grounded knowledge commands plus vault health, exposed at `POST /v1/self-host/zettelkasten/*` (HISTORICAL SHAPE — that route namespace belonged to the :8789 emulator, retired 2026-04-11 / deleted 2026-05-08; no HTTP surface exists today. The same commands live on in-process inside the `vault-zettelkasten` Obsidian plugin — `Claude/obsidian-vault-zettelkasten/` — as palette commands `run-serendipity`, `run-cross-domain`, `run-echo-chamber`, `run-semantic-linker`, `run-orphan-rescue`, `run-vault-health`, `run-full-pipeline`; verified against `src/main.ts` 2026-07-31):

| Endpoint | Command |
|---|---|
| `/serendipity` | Surface unexpected connections, temporal resurfacing, random catalysts |
| `/cross-domain` | Identify structural isomorphisms across knowledge domains |
| `/echo-chamber` | Challenge assumptions with vault-grounded counterarguments |
| `/semantic-linker` | Classify typed relationships with Dataview syntax output |
| `/orphan-rescue` | Single-note or batch vault-wide orphan detection + rescue |
| `/health` | Connectivity metrics: orphan ratio, avg links, staleness |
| `/pipeline` | Chain up to 5 commands sequentially |

Data strategy (hybrid):
- **Vault filesystem** (`VaultFileSystem`) — file listing, content reading, wikilink extraction (60s TTL cache)
- **Miyo search** (`/v0/search`, `/v0/search/related`) — semantic similarity only
- **Qdrant** (`QdrantScrollClient`, port 6333) — fallback chunk retrieval
- **Hosted `copilot-plus-flash`** (via `ModelGateway`, https://models.brevilabs.com/v1) — LLM analysis. Local runtimes removed: LM Studio 2026-07-16, Ollama 2026-07-23.

Also available as MCP tools via agent-turn: `zettelkasten_serendipity`, `zettelkasten_cross_domain`, `zettelkasten_echo_chamber`, `zettelkasten_semantic_linker`, `zettelkasten_orphan_rescue`, `zettelkasten_vault_health` (HISTORICAL — as of 2026-07-31 these tool names exist in no live source, only this file, the emulator-era `docs/ZETTELKASTEN_BACKEND_ARCHITECTURE.md`, and `tasks/todo.md`; the stdio adapter exposes only the `obsidian_*`/`miyo_search_context`/dev-console set. Not to be confused with the algorithmic Medical Zettelkasten MCP's differently-named tools, e.g. `generate_serendipity`).

PM2 cron: daily orphan scan (2 AM), weekly health digest (Sun 9 AM), weekly serendipity (Wed 9 AM). Reports written to `Zettelkasten/Reports/` in vault. (RETIRED as PM2 jobs — PM2 has run nothing since 2026-05-03: no daemon, no `dump.pm2`, no crontab, no LaunchAgent. The three schedules — same times — moved into the plugin's in-process `Scheduler`, `src/services/scheduler.ts` ("Replaces 3 PM2 cron jobs"; 15-min tick), which fires only while Obsidian is open. Verified live 2026-07-31: daily orphan scans still land in `Zettelkasten/Reports/` — 29 files, newest that morning 02:00, date gaps = Obsidian closed overnight. Two behavior drifts from the PM2 era: the weekly serendipity job now only emits an `analysis:complete` event and writes NO report, and no `Health Report *.md` has ever been observed despite `enableHealthDigest` defaulting on — its Sun 9–10 AM window requires Obsidian open then.)

Key files (historical `backend/` paths — that tree was deleted 2026-05-08; live equivalents under `Claude/obsidian-vault-zettelkasten/src/`): `ZettelkastenService.ts` → `services/zettelkasten-service.ts`, `VaultFileSystem.ts` → `adapters/vault-fs.ts`, `QdrantScrollClient.ts` → `adapters/qdrant-client.ts`, `routes/zettelkasten.ts` → no equivalent (no HTTP routes; palette commands + `services/scheduler.ts`). Docs: `docs/ZETTELKASTEN_BACKEND_ARCHITECTURE.md` (2026-03 emulator-era snapshot — body stays verbatim).

## Miyo v4 Notes

Miyo v4 deprecated three index endpoints (all return 501):
- `GET /v0/index/files`
- `GET /v0/index/stats`
- `GET /v0/index/documents`

Miyo now manages indexing internally via FolderManager with local SQLite (`index_manifest.db`) and Qdrant. The emulator's ZettelkastenService was migrated to bypass these endpoints entirely using direct filesystem access and Qdrant fallback.

Working Miyo endpoints: `/v0/health`, `/v0/search`, `/v0/search/related`, `/v0/parse-doc`, `/v0/index/upsert`, `/v0/index/by_path`, `/v0/index/clear`.

## Scripts

All in `scripts/`. Key ones:

- `bridge-start.sh` — MCP bridge manual/dev start (`bridge-health-check.sh` RETIRED 2026-07-31 — tombstoned CLI-era parity gate, same pattern as `cli-stability-gate.sh`; replacement checks in its header)
- `full-functional-sweep.sh` — 21-check validation suite (RETIRED 2026-05-09 — tombstone; wired against the deleted backend emulator + CLI backend selection. Replacement checks in its header: canonical bridge `healthz` curl + Local REST API :27124 auth probe)
- `zettelkasten-smoke-test.sh` — 11-check ZK validation suite (RETIRED 2026-05-09 — tombstone; ZettelkastenService moved in-process into the `vault-zettelkasten` plugin, so smoke-testing happens through the plugin's own commands or the canonical bridge — see its header)
- `zettelkasten-scheduler.sh` — Scheduled ZK report generation (RETIRED 2026-05-09 — tombstone; scheduling is driven by the Command Center plugin's workflow lifecycle. Header notes no LaunchAgents/cron referenced it as of 2026-05-09)
- `plugin-reload.sh` — Reload plugin in Obsidian
- `dev-build.sh` / `dev-deploy.sh` — Plugin dev workflow: stages the fork build into `deploy/obsidian/plugins/copilot` and symlinks it into the dev vault under the fork's REAL plugin id `copilot` (dev lane adopted the official-id identity 2026-07-31; since `9c7ce09a` the fork manifest matches upstream id+version — **which DID NOT prevent a wipe: upstream 4.0.0 sorted above the pinned 3.3.3 and overwrote the fork on 2026-08-12. Pin ABOVE upstream (99.x.y), not equal to it.** `copilot-mcp` is no longer a plugin id anywhere. `--with-official` retired same day — one id loads once per vault, and the production official slot already runs this fork)
- `lib.sh` — Shared constants and utilities (WORKSPACE_ROOT, PRODUCTION_VAULT, etc.)
- `raycast-relay-smoke.py` — Checks the Raycast custom provider (2026-10-13). For each model in `~/.config/raycast/ai/providers.yaml` it runs one streamed chat, then a tool-call check and an image check. It reads the licence key from that file and never prints it. Run it with `python3 -I`. See the Raycast AI custom provider section below.
- `install-tls-proxies.sh` — Stage the three `*-tls-proxy.mjs` (Miyo/Qdrant/SearXNG) to `~/.local/share/trevclaw-tls-proxies/` and repoint + reload their launchd units. Required historically: the monorepo lived on the external `/Volumes/ExtraCurricular` volume until 2026-07-26 and launchd's TCC context cannot read scripts there. The repo is now on the internal disk, so that wall no longer applies — but staging is **retained** so launchd never depends on where the repo lives. Re-run after editing any proxy script. (LM Studio removed 2026-07-16; Ollama removed 2026-07-23.)

## MCP Bridge Contract

The bridge at `8798` exposes over **HTTPS** (TLS):
- `POST /mcp/tool` — Authenticated tool execution (replay-protected)
- `GET /healthz` — Health check
- `GET /metrics` — Metrics

Auth via `x-mcp-token` header. Replay protection via `x-mcp-timestamp`, `x-mcp-nonce`, `x-mcp-body-sha256`.

### TLS Configuration

TLS is configured in `bridges/obsidian-copilot-bridge/config/obsidian-cli-mcp.local.json` under `transport.tls`:
- `certPath`: `/Users/myhome/.local/share/mkcert/localhost.pem`
- `keyPath`: `/Users/myhome/.local/share/mkcert/localhost-key.pem`
- Cert generated by mkcert, valid for localhost and 127.0.0.1, expires 2028-07-07
- CA root: `/Users/myhome/Library/Application Support/mkcert/rootCA.pem` (installed in macOS System Keychain)
- `NODE_EXTRA_CA_CERTS` must be set in the process environment so Node.js trusts the mkcert CA (configured in launch scripts and inherited by the Obsidian plugin host)

## Claude / Raycast Integration (bridge adapter)

> **CORRECTED 2026-10-07 — this section described a registration that does not exist.** Verified from the server names in
> `claude_desktop_config.json`, `~/.claude.json` and the repo `.mcp.json` (before the `openclaw` registration below): the adapter was registered on **no Claude surface**
> (Claude Desktop runs FilesystemPlus, miyo, opencode, perseus-business, perseus-vault, searxng-search; Claude Code user scope
> runs alphaxiv, falcon, firewalla, github, gmail, klsense-btt, opencode, perseus-vault, phone-gate, searxng-search, sudo-gate,
> zoho-trinc). Raycast has its own MCP config, which cannot be read from here, so the Raycast statements below are unverified.
> The `claude` and `raycast` profiles are therefore unused by Claude surfaces today. The new `openclaw` profile (Claude Code's dispatch
> lane into :8799) was built and then registered in the repo `.mcp.json` as `openclaw-obsidian` on 2026-10-07, only AFTER the Security
> Everything gate hook learned its prefix (the matcher is an allowlist with no catch-all). The rest of this section describes what the adapter DOES when a client is wired to it.

Claude Desktop, Claude Code, and Raycast (via stdio profile) could connect to the workspace
via the consolidated stdio MCP adapter at `bridges/obsidian-stdio-adapter/`. It speaks
standard MCP JSON-RPC on stdin/stdout and forwards every tool call to the canonical
bridge at `https://127.0.0.1:8798` with full auth and replay protection.

The adapter reads bridge config from
`bridges/obsidian-copilot-bridge/config/obsidian-cli-mcp.local.json`
and auto-injects vault defaults so Claude does not need to specify them on every call.

Profiles (set via `OBSIDIAN_STDIO_PROFILE`): `claude` (default — exposes the seven
canonical `obsidian_*` tools) and `raycast` (adds `raycast_daily_open`, mapped locally
to `obsidian_execute_command id="daily-notes"`, plus — since 2026-08-20 —
`video_pipeline_run`/`video_pipeline_status` proxied to the Command Center bridge on
:8799 with its own Bearer token, read per-call from
`~/.config/openclaw-command-center/bridge-token`; the :8799 daemon is unmodified).
Regression guard for both surfaces: `npm run test:profiles` in the adapter package.

Exposed tools (adapter — verified against a live tools/list 2026-08-20):
`obsidian_open_vault`, `obsidian_create_note`, `obsidian_append_note`,
`obsidian_read_note`, `obsidian_search_notes`, `obsidian_execute_command`,
`obsidian_health` (+ profile extras above). *Correction 2026-08-20: this list
previously also named `miyo_search_context` and the three `obsidian_dev_console_*`
tools — those exist on the :8798 bridge daemon itself, but the stdio adapter does NOT
surface them; reach them via a client wired to the daemon's own tool surface (e.g. the
Copilot fork's MCP client), not via the adapter.*

### Raycast AI custom provider — Copilot Plus relay (2026-10-13)

This is separate from the MCP adapter above. Raycast **AI chat** uses the same model as the Copilot
agent's opencode backend (`copilot-plus/copilot-plus-flash`). It does this through a Raycast v2
Custom Provider in `~/.config/raycast/ai/providers.yaml` that points at
`https://models.brevilabs.com/v1`. That is the endpoint Copilot passes to `opencode acp` in
`OPENCODE_CONFIG_CONTENT`, and the Copilot Plus **licence key** is the bearer token.

- **Live file is 0600 and NOT in git.** It holds the licence key, the same value Obsidian's keychain
  holds, so **rotating the key means updating both**.
- **Copy with a placeholder key:** `configs/raycast/providers.copilot-plus.template.yaml`.
- **Smoke test:** `scripts/raycast-relay-smoke.py`.
- **Verified 2026-10-13:** 7 models work. `kimi-k2.7-code` was removed because the relay answers
  400 `invalid_model`, even though Copilot lists it.
- **Reasoning (2026-10-13 follow-up):** on for all 7, defaulting to `high`: per-model
  `reasoning_effort: supported: true` plus a provider-level `additional_parameters:
  {reasoning_effort: high}`. The relay validates the value (422 on anything outside
  `none|minimal|low|medium|high|xhigh|max`). `copilot-plus-flash` and `deepseek-v4-pro` reason
  **only** when the parameter is sent.
- **Hidden relay text (measured 2026-10-13):** `copilot-plus-flash`, `deepseek-v4-flash-0731` and
  `minimax-m2.7` get about 70, 75 and 170 prompt tokens of the relay's own text ahead of the user's
  message; the other four get none. Confirmed for Flash: it names itself Obsidian Copilot even under
  a Raycast system prompt. Contents were not extracted. Cosmetic, not a security finding, but don't
  trust a model's self-description.
- **Raycast plan:** custom providers need Pro, Pro+ or Max.
- **Full doc:** rebuild steps, key handling, risks and the OpenCode Zen free-model fallback are in
  [`docs/RAYCAST_COPILOT_PLUS_PROVIDER.md`](docs/RAYCAST_COPILOT_PLUS_PROVIDER.md).

### Dev console tools (renderer-side, no CDP)

The bridge exposes three tools for inspecting Obsidian's renderer state without
Chrome DevTools Protocol — replacing the retired `obsidian-devtools` chrome-devtools-mcp
path on plain-HTTP `:8315`:

| Tool | Capability | Always available? |
|------|------------|--------------------|
| `obsidian_dev_console_logs` | Recent `console.{log,info,warn,error,debug}` ring buffer | yes (read-only) |
| `obsidian_dev_console_errors` | Recent `window.error` + `unhandledrejection` ring buffer | yes (read-only) |
| `obsidian_dev_console_eval` | Run caller-supplied JS in renderer scope, return JSON-safe result | gated (default OFF) |

**Wire**: bridge child process ↔ launcher plugin via fd-3 line-delimited JSON-RPC.
The launcher (`Claude/obsidian-bridge-launcher/`) spawns the bridge with
`stdio: ["ignore","pipe","pipe","pipe"]` and `BRIDGE_IPC_FD=3`; the bridge's
`src/server/launcherIpc.ts` opens fd 3 as a `net.Socket` and the launcher's
`src/launcherIpcServer.ts` services requests in renderer scope. Console capture
hooks `window.console.*` + `window.error` + `unhandledrejection` at plugin
onload (see `Claude/obsidian-bridge-launcher/src/consoleCapture.ts`); ring
buffer sizes are settable in the plugin's settings tab.

**Eval gate**: `obsidian_dev_console_eval` is OFF by default. To enable, open
the `Obsidian Bridge Launcher` plugin settings tab → Dev console section →
toggle "Enable dev console eval tool". The bridge tool will return
`LAUNCHER_IPC_UNAVAILABLE` if the bridge was started outside the launcher
(e.g. via `bash scripts/bridge-start.sh`), and `obsidian_dev_console_eval`
returns a structured error if the gate is off.

The adapter is a transport shim only — it has no independent logic.
The bridge must be running (`pm2 start` or `scripts/bridge-start.sh`) before tool calls succeed.

**What is NOT exposed as MCP:**
- Backend emulator (8789) — companion orchestration service, not an MCP server (RETIRED 2026-04-11, deleted 2026-05-08 — listed here historically; nothing listens on :8789)
- Miyo (8742) — companion retrieval service, accessed through the bridge's `miyo_search_context` tool

> **Outbound `claude` CLI bridge — ⚠️ RETIRED 2026-05-31** (was `Claude/claude-cli-bridge/`, now archived to `Claude/.archive/claude-cli-bridge/`). Superseded by the native Claude Desktop Code tab; see the root `CLAUDE.md` deletion log. Kept for reference only — do not reintroduce.

## Multi-Operator Context

This workspace's MCP bridge at port **8798** is the canonical Obsidian vault access point for all operators in the biomedical research stack:

| Operator | How it connects | Purpose |
|----------|----------------|---------|
| Claude Desktop | **not via this bridge today** (corrected 2026-10-07: the stdio adapter is not registered on Claude Desktop; it uses FilesystemPlus + miyo) | Vault files and search |
| OpenClaw Command Center | HTTPS :8798 (or direct Vault API when in-plugin) | Vault operations for workflow notes |

The bridge **must be running** before other operators can access the vault. Start via the `obsidian-bridge-launcher` Obsidian plugin (auto-spawns on Obsidian startup), or for manual / dev work: `bash scripts/bridge-start.sh`. Callers must have `NODE_EXTRA_CA_CERTS` set to the mkcert root CA for TLS verification.

**Note on Zettelkasten implementations**: This workspace's `ZettelkastenService` (LLM-driven, vault-grounded) now runs in-process inside the `vault-zettelkasten` Obsidian plugin under `Claude/obsidian-vault-zettelkasten/` (formerly hosted by the backend emulator on :8789, retired 2026-04-11 / deleted 2026-05-08). It is complementary to — not a duplicate of — the algorithmic Medical Zettelkasten MCP at `Claude/Medical-Zettelkasten-MCP/`, which analyzes research text for structural patterns without an LLM.

Related workspaces:
- `/Users/myhome/TrevClaw-Obsidianodus/Claude/` — Zettelkasten MCP, Command Center plugin
- ~~`/Users/trevorrobey/OpenClaw-Research-Agents/` — Research pipeline, HTTPS gateway on :18789~~
  **GONE (corrected 2026-07-31).** No such directory exists. That sibling workspace was folded
  into this monorepo and now lives at `Trevor Robey Intelligence Network Citations/` (the
  2026-05-19 flat merge of `trevor-robey-inc/` + `trevor-robey-inc-agents/`). There is no
  persistent gateway either — `:18789` belonged to the unrelated homebrew `openclaw`, removed
  2026-04-27; the engine runs on demand via `node scripts/run-workflow.js`.

## Source of Truth (read order)

1. `docs/COPILOT_WORKSPACE_CLAUDE_HANDOFF_2026-03-24.md`
2. `docs/OBSIDIAN_CLI_STACK_HANDOFF.md`
3. `docs/OFFICIAL_DIRECT_MCP_MIYO_RUNTIME.md`
4. `docs/SELF_HOST_CONTRACT.md`
5. `docs/BACKEND_EMULATOR_ARCHITECTURE.md`
6. `docs/OFFICIAL_PLUGIN_COMPATIBILITY.md`
7. `docs/ZETTELKASTEN_BACKEND_ARCHITECTURE.md`
8. `docs/OFFICIAL_MIYO_CONTRACT.md`

## Rules

- Preserve the `direct_plugin_mcp` vs `exact_backend_emulator` distinction
- Preserve the REST-backed bridge as the production note/command lane (`:8798` → `RestApiBackend` → Obsidian Local REST API `:27124`; the CLI subprocess backend was removed 2026-05-09)
- Preserve replay protection and signed MCP transport
- Docs and validation artifacts are part of the contract
- Do not silently merge the official plugin, Raycast, and backend-emulator runtimes
