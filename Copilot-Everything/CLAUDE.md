# Copilot-Everything

The Obsidian Copilot side of the stack: the vendored Copilot plugin fork, the canonical vault bridge
(`:8798`), the stdio adapter that is Claude's one door, the Copilot agent's proxy, and the HTTPS proxies
for the third-party loopback services. Current facts only (slimmed 2026-10-23; the previous text, including
the 2026-08-12 fork-wipe and port records, is `git show 2077e79:Copilot-Everything/CLAUDE.md`). Ports and
the repo-wide invariants are in the root [`../CLAUDE.md`](../CLAUDE.md).

## Components

| Component | Location | Port | Role |
|---|---|---|---|
| Copilot plugin fork | `repos/obsidian-copilot-mcp-v4` | — | Upstream obsidian-copilot **4.0.0** plus an MCP client module, deployed as plugin id `copilot`. A catalog of 45 MCP tools (`src/mcp/catalog.ts`) reaches `:8798`, `:8799` and `:8800`. Chat defaults to hosted `copilot-plus-flash`; agent mode runs on an opencode backend. |
| Canonical vault bridge | `bridges/obsidian-copilot-bridge` | 8798 | The multi-client vault daemon, spawned by the `obsidian-bridge-launcher` plugin. **REST-only**: the Local REST API plugin (`:27124`) is its only backend, with no fallback. `/mcp/tool`'s optional `backendHint` accepts only `"restApi"` (a stale `"cli"` is rejected with HTTP 400). HTTPS with bearer token and replay guard. |
| Stdio adapter | `bridges/obsidian-stdio-adapter` | — | One tool surface per client, profile required: `openclaw` is **Claude's one door** (`:8799` + `:8800`, see its README), `raycast` is Raycast chat's door. |
| Copilot agent proxy | `bridges/openclaw-stdio-proxy` | — | Deployed inside the copilot plugin; carries the agent's tool calls to `:8799` and `:8800`. Tools must answer within its 8 s request timeout. |
| HTTPS proxies | `scripts/{miyo,qdrant,searxng,ollama}-tls-proxy.mjs` | 8743, 6433, 8891, 11435 | Wrap Miyo `:8742`, Qdrant `:6333`, SearXNG `:8890` and Ollama `:11434`. launchd runs staged copies: re-run `scripts/install-tls-proxies.sh` after any edit. Ollama currently has **no model installed**. |

## The fork: rules that keep it alive

- **Pin above upstream.** The manifest says `99.4.0`, with the real base in `upstreamBase: "4.0.0"`.
  Obsidian offers an update only when the registry version sorts higher, so a pin *equal* to upstream (as
  `3.3.3` was) gets overwritten the day upstream releases: that happened on 2026-08-12. Never pin to the
  upstream version again. `.obsidian/community-plugins-versions.json` is not a usable pin.
- **`data.json` survives plugin updates**, so a wiped fork keeps its MCP configuration; only the code that
  reads it disappears.
- **Re-syncing with upstream** means re-applying the MCP module: `src/mcp/*` and
  `src/settings/v2/components/McpSettings.tsx`, five hooks in `src/main.ts`, the `McpSettings` type in
  `src/settings/model.ts`, the `mcp` block in `src/constants.ts`, the MCP tab in `SettingsMainV2.tsx`, and the
  `providerId` / `removeByProvider()` / `replaceByProvider()` additions in `src/tools/ToolRegistry.ts`.
  Upstream uses Zod v4, where `z.record(value)` must be `z.record(key, value)`. The fork's identity and sync
  rules are in `repos/obsidian-copilot-mcp-v4/UPSTREAM.md`.
- **The dev lane uses the official plugin id `copilot`** (`scripts/dev-build.sh`, `dev-deploy.sh` stage the
  build into `deploy/obsidian/plugins/copilot` for the dev vault). Production deploys go through
  `ops/tr-suite/deploy.sh` only.

## What the Copilot agent can call

Through `:8799`, the agent's catalog includes the vault tools, the `obsidian_openclaw_*` engine suite
(start, watch, cancel and read runs, artifacts, delivery evidence, citation integrity, feed stats), the 7
`zk_*` analyses and the 2 `video_pipeline_*` tools; through `:8800`, the 12 `viz_*` tools. Activation is
configuration, not code: list the names in the server's `enabledToolNames` and enable the matching
`mcp_command-center_*` / `mcp_viz-studio_*` ids for the agent. The `zk_*` analyses write nothing to the vault
(`zk_full_pipeline` can take minutes, so size the server timeout). Never exposed, by design: dataset
missions, interaction logs, release and token scripts, feed rebuilds, and the delivery-evidence rebuild
mode. A real-provider engine call answers `operator_gate_not_armed` unless the operator armed a fresh token.

## Key paths

- Workspace: `/Users/myhome/TRINC/Copilot-Everything/`. Vault: `/Users/myhome/My Digital Garden`; the
  production plugin folder is `<vault>/.obsidian/plugins/copilot`.
- `Code/` here is a **gitignored symlink** to `/Users/myhome/Code`, the home of the operator's personal
  repos. Never track the link or vendor those repos in.
- Bridge config, including `transport.tls` (the mkcert pair) and the auth token:
  `bridges/obsidian-copilot-bridge/config/obsidian-cli-mcp.local.json` (gitignored).

## The `:8798` bridge contract

- `POST /mcp/tool` (authenticated, replay-protected), `GET /healthz`, `GET /metrics`, `GET /mcp/events`
  (the `research` SSE stream the fork's event bridge subscribes to).
- Auth with `x-mcp-token`; replay protection with `x-mcp-timestamp`, `x-mcp-nonce` and `x-mcp-body-sha256`.
- Every caller needs `NODE_EXTRA_CA_CERTS` pointing at the mkcert root CA.
- **Browser guard first** (`src/server/browserGuard.ts`, 2026-10-24): a wrong Host gets 421
  `REQUEST_WRONG_HOST`; an `Origin`, a `Referer` or a `Sec-Fetch-Site` other than `none` gets 403
  `BROWSER_ORIGIN_REFUSED`. Each refusal writes a `BROWSER_REJECT` audit event and increments
  `browser_rejections_total` in `/metrics`. Callers must be programs (Node `https`/`fetch`, Obsidian
  `requestUrl`, curl, Python), never page-level `fetch`.
- **Dev console tools**, served through the launcher's fd-3 IPC rather than a debugging port:
  `obsidian_dev_console_logs` and `obsidian_dev_console_errors` (read-only ring buffers, always on) and
  `obsidian_dev_console_eval` (off unless "Enable dev console eval tool" is switched on in the Bridge
  Launcher settings; returns `LAUNCHER_IPC_UNAVAILABLE` when the bridge was started outside the launcher).

## Miyo v4

Index endpoints (`/v0/index/files`, `/v0/index/stats`, `/v0/index/documents`) return 501; Miyo indexes
itself. Working endpoints: `/v0/health`, `/v0/search`, `/v0/search/related`, `/v0/parse-doc`,
`/v0/index/upsert`, `/v0/index/by_path`, `/v0/index/clear`. Every consumer, including the fork's
`miyoServerUrl`, must point at the HTTPS proxy `https://127.0.0.1:8743`, never `:8742`; re-check after a
rebuild.

## Raycast

Raycast chat's vault access is the adapter's `raycast` profile, registered in Raycast through
`bridges/obsidian-stdio-adapter/raycast-launch.sh`. Raycast answers from a tool snapshot taken at install
time, so after any tool change remove and re-add the server there. The Raycast extension and its Copilot
Plus relay provider moved to `~/Code/raycast-obsidian-bridge-fork` on 2026-10-23; the relay shares the
Copilot Plus licence key with Obsidian, so rotating one means rotating both.

## Commands

```bash
cd /Users/myhome/TRINC/Copilot-Everything/repos/obsidian-copilot-mcp-v4 && npm run build    # fork build
cd /Users/myhome/TRINC/Copilot-Everything/bridges/obsidian-copilot-bridge && npm run build   # bridge build
cd /Users/myhome/TRINC/Copilot-Everything/bridges/obsidian-copilot-bridge && npm test && npm run lint:transport
cd /Users/myhome/TRINC/Copilot-Everything/bridges/obsidian-stdio-adapter && npm run test:profiles
NODE_EXTRA_CA_CERTS="$HOME/Library/Application Support/mkcert/rootCA.pem" node /Users/myhome/TRINC/ops/tr-suite/bridge-guard-live-check.mjs   # browser guard, Obsidian open
bash /Users/myhome/TRINC/Copilot-Everything/scripts/bridge-start.sh    # manual/dev start; normally the launcher plugin does it
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:8798/healthz
```

The Obsidian CLI (`/Applications/Obsidian.app/Contents/MacOS/obsidian`, default vault "My Digital Garden")
offers `read`, `create`, `open`, `search`, `daily`, `append`, `move` and `plugin:reload id=<id>`.

## Rules

- Keep the REST-backed bridge as the production vault lane, keep its replay protection, and keep every
  listener HTTPS-only (`npm run lint:transport` before committing a bridge change).
- Do not merge the Copilot, Raycast and Claude lanes into one daemon; aggregate per client in the adapter.
- Docs and validation artifacts are part of the contract. Read order for the fork:
  `repos/obsidian-copilot-mcp-v4/UPSTREAM.md`, then `docs/OFFICIAL_DIRECT_MCP_MIYO_RUNTIME.md`,
  `docs/OFFICIAL_PLUGIN_COMPATIBILITY.md`, `docs/OFFICIAL_MIYO_CONTRACT.md`, `docs/MCP_SECURITY.md`.

## Retired here

The backend emulator (`:8789`, and with it the `exact_backend_emulator` mode), the bridge's CLI and
in-process backends, the 3.3.3 fork and its sync scripts, PM2, the outbound `claude-cli-bridge`, the
adapter's `claude` profile and `.mcp.json` `obsidian-bridge` entry, and the bridge's `research_publish`.
The full list is the "Retired" table in [`../ARCHITECTURE.md`](../ARCHITECTURE.md).
