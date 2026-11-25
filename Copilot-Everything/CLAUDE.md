# Copilot-Everything

The Obsidian Copilot side of the stack: the vendored Copilot plugin fork, the canonical vault bridge
(Unix socket `vault-bridge.sock`), the stdio adapter that is Claude's one door, the Copilot agent's proxy,
and the HTTPS proxies for the third-party loopback services. Current facts only (slimmed 2026-10-23; the
previous text, including the 2026-08-12 fork-wipe and port records, is
`git show 2077e79:Copilot-Everything/CLAUDE.md`). Ports, the bridge sockets and the repo-wide invariants
are in the root [`../CLAUDE.md`](../CLAUDE.md). The three bridges left loopback TCP and mkcert TLS on
2026-11-24 (bridges-uds; record:
[`../ops/security/bridges-uds-2026-11-24.md`](../ops/security/bridges-uds-2026-11-24.md)): each serves
the same routes on a 0600 socket in the 0700 run directory `~/.local/state/trinc/run/`.

## Components

| Component | Location | Port or socket | Role |
|---|---|---|---|
| Copilot plugin fork | `repos/obsidian-copilot-mcp-v4` | — | Upstream obsidian-copilot **4.0.0** plus an MCP client module, deployed as plugin id `copilot`. A catalog of 45 MCP tools (`src/mcp/catalog.ts`) reaches the three bridge sockets through `src/mcp/udsClient.ts` (Node `http` over the socket, desktop only); no server has a TCP path. Chat defaults to hosted `copilot-plus-flash`; agent mode runs on an opencode backend. |
| Canonical vault bridge | `bridges/obsidian-copilot-bridge` | `vault-bridge.sock` | The multi-client vault daemon, spawned by the `obsidian-bridge-launcher` plugin as `dist/index.js --transport=uds`. **REST-only**: the Local REST API plugin (`:27124`) is its only backend, with no fallback. `/mcp/tool`'s optional `backendHint` accepts only `"restApi"` (a stale `"cli"` is rejected with HTTP 400). Plain HTTP/1.1 on its Unix socket, with bearer token and replay guard; no TCP listener and no TLS. |
| Stdio adapter | `bridges/obsidian-stdio-adapter` | — | One client, one profile (required): `openclaw` is **Claude's one door** (the Command Center and Viz Studio sockets, see its README). The `raycast` profile was retired on 2026-11-21 with Raycast, and `claude` on 2026-10-23; both refuse to start. |
| Copilot agent proxy | `bridges/openclaw-stdio-proxy` | — | Deployed inside the copilot plugin; carries the agent's tool calls to the Command Center and Viz Studio sockets (env `OPENCLAW_BRIDGE_SOCKET` and `OPENCLAW_BRIDGE_TOKEN`). Tools must answer within its 8 s request timeout. |
| HTTPS proxies | `scripts/{miyo,qdrant,searxng}-tls-proxy.mjs` | 8743, 6433, 8891 | Wrap Miyo `:8742`, Qdrant `:6333` and SearXNG `:8890`. launchd runs staged copies: re-run `scripts/install-tls-proxies.sh` after any edit. The Ollama proxy (`:11435`) was retired 2026-11-12 with Ollama itself. |

## The fork: rules that keep it alive

- **Pin above upstream.** The manifest says `99.4.0`, with the real base in `upstreamBase: "4.0.0"`.
  Obsidian offers an update only when the registry version sorts higher, so a pin *equal* to upstream (as
  `3.3.3` was) gets overwritten the day upstream releases: that happened on 2026-08-12. Never pin to the
  upstream version again. `.obsidian/community-plugins-versions.json` is not a usable pin.
- **`data.json` survives plugin updates**, so a wiped fork keeps its MCP configuration; only the code that
  reads it disappears. Since 2026-11-24 the fork converts its bridge entries there to transport `uds` on
  load (idempotent, saved with the normal settings save, tokens and every other field kept, each change
  listed in Diagnostics); an `http` entry it cannot convert is reported and never dialled.
- **Re-syncing with upstream** means re-applying the MCP module: `src/mcp/*` and
  `src/settings/v2/components/McpSettings.tsx`, seven hooks in `src/main.ts` (see UPSTREAM.md's main.ts
  row), the `McpSettings` type in `src/settings/model.ts`, the `mcp` block in `src/constants.ts`, the MCP
  tab in `SettingsMainV2.tsx`, and the `providerId` / `removeByProvider()` / `replaceByProvider()`
  additions in `src/tools/ToolRegistry.ts`.
  Upstream uses Zod v4, where `z.record(value)` must be `z.record(key, value)`. The fork's identity and sync
  rules are in `repos/obsidian-copilot-mcp-v4/UPSTREAM.md`.
- **The dev lane uses the official plugin id `copilot`** (`scripts/dev-build.sh`, `dev-deploy.sh` stage the
  build into `deploy/obsidian/plugins/copilot` for the dev vault). Production deploys go through
  `ops/tr-suite/deploy.sh` only.

## What the Copilot agent can call

Through the Command Center socket, the agent's catalog includes the vault tools, the `obsidian_openclaw_*`
engine suite (start, watch, cancel and read runs, artifacts, delivery evidence, citation integrity, feed
stats), the 7 `zk_*` analyses and the 2 `video_pipeline_*` tools; through the Viz Studio socket, the 12
`viz_*` tools. Activation is configuration, not code: list the names in the server's `enabledToolNames` and enable the matching
`mcp_command-center_*` / `mcp_viz-studio_*` ids for the agent. The `zk_*` analyses write nothing to the vault
(`zk_full_pipeline` can take minutes, so size the server timeout). Never exposed, by design: dataset
missions, interaction logs, release and token scripts, feed rebuilds, and the delivery-evidence rebuild
mode. A real-provider engine call answers `operator_gate_not_armed` unless the operator armed a fresh token.

## Key paths

- Workspace: `/Users/myhome/TRINC/Copilot-Everything/`. Vault: `/Users/myhome/My Digital Garden`; the
  production plugin folder is `<vault>/.obsidian/plugins/copilot`.
- `Code/` here is a **gitignored symlink** to `/Users/myhome/Code`, the home of the operator's personal
  repos. Never track the link or vendor those repos in.
- Bridge config, holding the auth token (`security.authToken`):
  `bridges/obsidian-copilot-bridge/config/obsidian-cli-mcp.local.json` (gitignored). Since 2026-11-24 a
  `transport.tls` block and a `transport.udsPath` other than the canonical socket are ignored, each with one
  stderr note; an effective `transport.mode` of `http` or `https` is a startup error, and the launcher's
  `--transport=uds` overrides the config.

## The vault bridge contract (`vault-bridge.sock`)

- **Socket:** `<home>/.local/state/trinc/run/vault-bridge.sock`, with `<home>` = `os.homedir()` (never `~`
  or an XDG variable). The run directory is 0700 and the socket 0600, both owned by the operator's uid; a
  looser directory chain is refused, never repaired. Pidfile `vault-bridge.pid` in the same directory,
  rewritten atomically on every start and never deleted (the launcher validates it). There is no TCP
  listener: nothing answers on 8798 any more, and a listener there is a finding.
- `POST /mcp/tool` (authenticated, replay-protected), `GET /healthz`, `GET /metrics`, `GET /mcp/events`
  (the `research` SSE stream the fork's event bridge subscribes to): the same routes and bodies as before.
- Auth with `x-mcp-token`; replay protection with `x-mcp-timestamp`, `x-mcp-nonce` and `x-mcp-body-sha256`.
- **No CA.** A caller of the socket needs no `NODE_EXTRA_CA_CERTS` and no TLS: there is none on the socket.
  The launcher keeps `NODE_EXTRA_CA_CERTS` in the bridge's own env for its outbound Miyo call (`:8743`), and
  the Local REST API call (`:27124`) is unchanged.
- **Browser guard first** (`src/server/browserGuard.ts`, 2026-10-24), kept as defence in depth: an `Origin`,
  a `Referer` or a `Sec-Fetch-Site` other than `none` gets 403 `BROWSER_ORIGIN_REFUSED`. Each refusal
  writes a `BROWSER_REJECT` audit event and increments `browser_rejections_total` in `/metrics`. **The Host
  rule on the socket:** the guard checks Host only when the request arrived on a TCP port (421
  `REQUEST_WRONG_HOST`); on the socket there is no port, so it skips the check. Node sends
  `Host: localhost` over a socket, or `localhost:80` when the connection is pinned with `createConnection`.
- **Callers must be able to dial a Unix socket**: Node `node:http` with `socketPath` and a pinned
  `createConnection` (the byte-identical `bridges-uds client v1` block, or the fork's `udsClient.ts`),
  Python, or the operator's own terminal. Obsidian `requestUrl`, Chromium or page-level `fetch` and Node's
  global `fetch` cannot reach a socket and are never bridge clients. A client goes through one wrapper that
  validates the exact path it sends (Node turns an empty or undefined `socketPath` into plaintext TCP to
  `localhost:80`), checks the directory chain and the socket mode, and never retries over TCP.
- **Socket audit events** (2026-11-24): `SOCKET_LOST` (the published name was removed or replaced; the
  bridge exits 1) and `SOCKET_REFUSED` (a startup refusal, with `errorCode` = the helper's
  `UdsListenerError` code). The rest of the audit vocabulary and its path are unchanged.
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

## Raycast (retired 2026-11-21)

Operator decision, 2026-11-21: Raycast is removed from this stack. Both video workflows run from the
Copilot agent: its `copilot-video-download` skill downloads a link with yt-dlp (or `--grab` for a
download only), and Command Center's built-in pipeline (`video_pipeline_run` with the file or folder)
transcribes and summarizes. Retired with it: the adapter's `raycast` profile and `raycast-launch.sh`, and
Command Center's Raycast dispatch path. Do not add a Raycast door, a video tool on the adapter or a
deeplink dispatch back without an operator decision. The one such decision (2026-11-22): Command Center hands
LinkedIn Learning lessons, the school's Kaltura videos and Strayer library films to Downie
(`Claude/obsidian-command-center/CLAUDE.md`, "The Downie hand-off").

- The extension's source stays outside this repo, at `~/Code/raycast-obsidian-bridge-fork`, until the
  operator archives it.
- Its Copilot Plus relay provider (`~/.config/raycast/ai/providers.yaml`) holds the same Copilot Plus
  licence key as Obsidian: that file goes when Raycast is uninstalled.
- The pipeline's run log and run marker keep their old folder on purpose:
  `~/.local/share/raycast-obsidian/` must stay, because `video_pipeline_status` reads it.

## Commands

```bash
cd /Users/myhome/TRINC/Copilot-Everything/repos/obsidian-copilot-mcp-v4 && npm run build    # fork build
cd /Users/myhome/TRINC/Copilot-Everything/bridges/obsidian-copilot-bridge && npm run build   # bridge build
cd /Users/myhome/TRINC/Copilot-Everything/bridges/obsidian-copilot-bridge && npm test && npm run lint:transport
cd /Users/myhome/TRINC/Copilot-Everything/bridges/obsidian-stdio-adapter && npm run test:profiles
node /Users/myhome/TRINC/ops/tr-suite/uds-health.mjs                  # GET /healthz over the three bridge sockets; one line each, never a token
node /Users/myhome/TRINC/ops/tr-suite/bridge-guard-live-check.mjs     # browser guard and the TCP tripwire, Obsidian open
bash /Users/myhome/TRINC/Copilot-Everything/scripts/bridge-start.sh    # manual/dev start (--transport=uds); refused while the launcher's bridge holds the socket
```

The health script derives every socket path from the home directory, so no socket path ever goes on a
command line. It needs no CA.

The Obsidian CLI (`/Applications/Obsidian.app/Contents/MacOS/obsidian`, default vault "My Digital Garden")
offers `read`, `create`, `open`, `search`, `daily`, `append`, `move` and `plugin:reload id=<id>`.

## Rules

- Keep the REST-backed bridge as the production vault lane and keep its replay protection. **The bridge
  listens only on its Unix socket** (2026-11-24, bridges-uds): no TCP listener, no TCP fallback, and no
  client path that can dial TCP; a bridge that cannot secure its socket refuses to start. **Every TCP
  listener here stays HTTPS-only** (the TLS proxies). Run `npm run lint:transport` before committing a
  bridge change: it fails on any server constructor or `.listen(` in `src` outside
  `src/server/udsListener.ts` and `src/server/windowsPipeTransport.ts`, and when either file is missing.
- `src/server/udsListener.ts` is byte-identical with Command Center's and Viz Studio's
  `src/bridge/uds-listener.ts` (`ops/tr-suite/verify.sh` compares them); change all three together.
- Do not merge the Copilot and Claude lanes into one daemon; aggregate per client in the adapter.
- Docs and validation artifacts are part of the contract. Read order for the fork:
  `repos/obsidian-copilot-mcp-v4/UPSTREAM.md`, then `docs/OFFICIAL_DIRECT_MCP_MIYO_RUNTIME.md`,
  `docs/OFFICIAL_PLUGIN_COMPATIBILITY.md`, `docs/OFFICIAL_MIYO_CONTRACT.md`, `docs/MCP_SECURITY.md`.

## Retired here

The backend emulator (`:8789`, and with it the `exact_backend_emulator` mode), the bridge's CLI and
in-process backends, the 3.3.3 fork and its sync scripts, PM2, the outbound `claude-cli-bridge`, the
adapter's `claude` profile and `.mcp.json` `obsidian-bridge` entry, the bridge's `research_publish`, and
(2026-11-24, bridges-uds) the bridges' TCP and mkcert TLS transport: `httpTransport.ts`, `start:https`,
`--transport=https`, the proxy's `OPENCLAW_BRIDGE_URL`, and `scripts/official-plugin-direct-mcp-cutover.sh` and
`scripts/official-plugin-enable-write-mcp.sh`, which wrote an `http://` server and the token into Copilot's
`data.json` (they now refuse to run). The full list is the
"Retired" table in [`../ARCHITECTURE.md`](../ARCHITECTURE.md).
