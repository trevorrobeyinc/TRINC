# Obsidian MCP Server

Local MCP-compatible bridge for Obsidian on the current macOS production stack. Its one backend is the launcher's private fd-3 pipe (since 2026-11-25); from 2026-05-09 it was the Local REST API plugin, and before that a CLI subprocess.

For `My Digital Garden`, the bridge lane — `LauncherIpcBackend` → the fd-3 pipe of **obsidian-bridge-launcher**, which spawned this bridge and serves the six note and command operations in Obsidian's renderer through `app.vault`, `app.workspace` and `app.commands` (its `src/vaultIpc.ts`) — is the production path. No TCP port, API key or certificate is involved: the Local REST API plugin (`https://127.0.0.1:27124`) is no longer used by this bridge. The launcher decides which Obsidian commands may run (its `src/commandPolicy.ts`); `security.executeCommandAllowlist` can only narrow that list.

What changed for clients on 2026-11-25. Every tool except `obsidian_health` keeps its request and response shape; these outcomes and values changed:

- A failed operation is a failed tool result. Under the REST backend a missing note or a refused command still came back `ok: true` with an empty body. Two error codes are new: `LAUNCHER_IPC_TIMEOUT` (the launcher did not answer within 15 s; `obsidian_append_note` records the key as ambiguous) and `PAYLOAD_TOO_LARGE`. A timeout is marked retryable only for reads, searches, opens and appends: a create or a command may already have run.
- `obsidian_execute_command` runs only the five ids in the launcher's `src/commandPolicy.ts`: `copilot:super-summarize-to-note`, `copilot:summarize-to-note`, `command-center:run-workflow`, `command-center:toggle-pipeline-sidebar` and `command-center:analyze-current-note`. An id the bridge passes on that is not among them fails with `COMMAND_NOT_ALLOWED`, and the refusal names the five (the REST plugin ran any id). The bridge refuses some ids first, with the same code: one over 200 characters, one without the `<plugin-id>:<command>` shape, and the `runjs:` and `app:delete` classes. It reports `executed: false` when Obsidian did not run the command.
- `obsidian_search_notes` honours `limit`, and returns at most 500 results without one (the REST plugin returned every match). It honours `path` as a vault-relative folder, matched exactly or in another letter case: `Research`, `Research/`, `/Research` and `./Research` all name the same folder (spaces around it are ignored), and `/`, `.` or an empty path means the whole vault. The folder passes this bridge's path guard first, so one with an empty segment, a climb out of the vault, a hidden folder or a link into one fails with `PATH_INVALID`. A folder that does not exist fails with `NOTE_NOT_FOUND` (an absolute file-system path does too) and a note path, in any letter case, with `PATH_INVALID`, so a mistyped folder is never read as "no matches". A blank query, or one over 1,024 characters, is refused.
- `obsidian_create_note` honours `open` and `newtab` (the REST PUT ignored them). Opening is best effort: a note that was written is reported as written even when it could not be opened.
- `obsidian_open_vault` honours `paneType`. Its `path` is read as link text, as the REST plugin's `/open` read it: another letter case, no `.md`, or a bare note name. A note already on disk that Obsidian has not indexed gets a short wait for the index. Unlike the plugin, a name that resolves to no note fails with `NOTE_NOT_FOUND` instead of creating one.
- `obsidian_read_note`, `obsidian_create_note` and `obsidian_append_note` find a note whose path differs only in letter case, and a note on disk that Obsidian has not indexed yet, as the REST plugin did; a not-yet-indexed file in another letter case is refused with `PATH_INVALID` (give its exact path). `obsidian_read_note` refuses a whole file over 16 MiB with `PAYLOAD_TOO_LARGE`.
- A note body over 16 MiB of UTF-8 is refused with `PAYLOAD_TOO_LARGE`; for `obsidian_append_note` the limit is 16 MiB minus 4 KiB, because its idempotency marker follows the text, and its `idempotencyKey` is at most 256 characters. A file grown past 16 MiB by appends can still be appended to (the append is confirmed by reading only the end of the file) but not read whole. Every write carries the body's sha256, and the launcher writes nothing unless what it received hashes the same.
- `obsidian_health` reports a `launcherIpc` block instead of `restApi`: its `endpoint` field is now `channel`, its diagnostics carry `vault` and `launcherVersion`, and the `auth` diagnosis category is gone. It diagnoses `vault_mismatch`, or `vault_unverified`, when the launcher serves a different vault from `allowedVaultRoots[0]` or does not name its vault. `meta.backendUsed` and the routing maps say `launcherIpc`, and `backendHint` accepts only `"launcherIpc"`.
- A bridge not spawned by the launcher (`scripts/bridge-start.sh`, a terminal) serves no vault operation: the six tools fail with `NO_CAPABLE_BACKEND`. `/healthz`, `obsidian_health`, `miyo_search_context` and `research_notify` still answer. The launcher's 'Restart bridge' replaces such a bridge once its terminal is gone (one `scripts/bridge-restart.sh` started), but refuses one whose terminal is still open: stop that one first with Ctrl-C.

What changed for `obsidian_append_note` on 2026-11-27 (its durable idempotency ledger; record: `ops/security/vault-ipc-2026-11-25.md`, last section):

- A first attempt that provably wrote nothing frees its `idempotencyKey`, so a retry with the same key writes. That is a refusal before any backend ran (`NO_CAPABLE_BACKEND`, the cold-start window included, and `BACKEND_SELECTION_STALE`), a request that never left the bridge (`LAUNCHER_IPC_UNAVAILABLE` with `diagnostics.requestSent: false`), and a launcher refusal with reason `path_refused`, `invalid_params` or `too_large`, which its `vault.append` raises only before writing. Such a key used to stay STARTED, and every later call with it ended `AMBIGUOUS_WRITE_REQUIRES_DECISION`.
- Every other failure records the key as ambiguous, and a retry reconciles it instead of appending again: a timeout, a pipe that closed with the request in flight, an error from the write itself and an answer the bridge could not read may all come after the note was written.
- A reconcile read that finds no such note answers like one that read the note and found no marker (`AMBIGUOUS_WRITE_REQUIRES_DECISION`, retryable false). It used to say retryable true, which for a note that did not exist yet never changed. A read that fails still answers retryable true.
- A key stranded before this change stays stranded: only a new key gets past it.

Workspace source-of-truth:

- Parent Raycast package: `../package.json` (`obsidian-bridge-fork`)
- Default Codex sync target: `~/.config/raycast/extensions/obsidian` via `../scripts/codex/sync-config.sh`
- *(2026-11-22: both lines describe the Raycast extension this bridge once shipped inside. The extension moved out of the monorepo on 2026-10-23, and Raycast was removed from the Mac on 2026-11-21, so neither path exists here.)*

This server is the execution layer for note and command operations (sole backend: `src/backends/launcherIpcBackend.ts`; `restApiBackend.ts` and the `.env.local` loader were removed on 2026-11-25). `.env.local` and `config/obsidian-rest-api.cert.pem` are no longer read, but they are the rollback's credentials: they stay until the Local REST API plugin is uninstalled (see *Deploy and rollback*). The PDF/video summarize flows that used the backend emulator for `/v0/parse-doc` and `/v1/self-host/agent-turn` predate the emulator's retirement (2026-04-11, deleted 2026-05-08).

## Quick start

1. Copy `config/obsidian-cli-mcp.local.json.example` to `config/obsidian-cli-mcp.local.json` and adjust values.
2. Install dependencies:

```bash
npm --prefix mcp-server ci
```

3. Build and run:

```bash
npm --prefix mcp-server run build
npm --prefix mcp-server run start:uds
```

The bridge serves only on its private Unix socket on macOS/Linux (a named pipe on Windows); see *Transports*. In production the obsidian-bridge-launcher Obsidian plugin spawns it with `--transport=uds`; nothing listens on TCP.
Set `security.globalRateLimitPerMinute` in `mcp-server/config/obsidian-cli-mcp.local.json` to enforce a global cap in addition to per-client limits.

A bridge started this way serves no vault operation (it has no launcher pipe); it is for development only.

## Deploy and rollback (launcher 0.2.0 with this bridge, 2026-11-25)

The procedure lives in the decision record, `ops/security/vault-ipc-2026-11-25.md` (*Deploy, in this order*, *Rollback* and *Uninstall*), which lands with the launcher commit so that it is on main before anything else changes. In short: save the current `dist/` outside the repo first and check that it is the REST build; land and deploy the launcher, relaunch Obsidian, and see its "predates the pipe backend" notice; land this bridge, rebuild its `dist/` in the main checkout and run the Bridge Launcher's 'Restart bridge'; `obsidian_health` must show `launcherIpc.available` true and `launcherIpc.diagnostics.launcherVersion` `0.2.0`; run the record's smoke test; only then disable (do not uninstall) the Local REST API plugin. Until the plugin is uninstalled, `.env.local` and `config/obsidian-rest-api.cert.pem` are the rollback's credentials. While a rollback to a saved `dist/` is in place, do not run `Copilot-Everything/scripts/bridge-start.sh`, `bridge-restart.sh`, `miyo-mcp-probe.sh` or a build here: each rebuilds this package's `dist/`, the build the launcher spawns.

> **CLI-era sections (historical).** *CLI Stability Controls*, *Raw Direct CLI Track*, and
> *CLI Baseline* describe the pre-2026-05-09 CLI subprocess backend. That backend was
> removed in the bridge consolidation — the `cliStability` config block is still parsed by
> the config loader but no longer consumed, the direct-CLI gate is tombstoned, and the
> bridge no longer probes the Obsidian CLI binary. `obsidian_health` reports the sole
> `launcherIpc` backend.

## CLI Stability Controls

`obsidian-cli-mcp.local.json` now includes a `cliStability` block for the bridge-backed production lane:

- `probeTimeoutMs`
- `launchTimeoutMs`
- `readinessPollIntervalMs`
- `requiredVaultNames`

The bridge uses those settings to verify:

- CLI version parsing
- `help` responsiveness
- required vault registration via `obsidian vaults`
- macOS launch and readiness via bounded polling

## Raw Direct CLI Track

Raw direct Obsidian CLI is validated separately from the bridge-backed production lane.

- Operator gate: `scripts/direct-cli-stability-gate.sh` (tombstoned 2026-05-09 — exits RETIRED)
- Validation mode: `OBSIDIAN_LIVE_VALIDATION_CONTRACT=full_direct_cli`
- Contract under investigation:
  - version detection
  - help responsiveness
  - vault registration
  - cold launch and warm readiness
  - create/read/append/search behavior

The bridge-backed lane remains the current stable note/command execution contract for `My Digital Garden` unless the raw direct track earns its own evidence-backed stability claim.

## Transports

- Unix domain socket (macOS/Linux, the only transport there): `--transport=uds`. The socket is always `<home>/.local/state/trinc/run/vault-bridge.sock` (home from `os.homedir()`); a configured `transport.udsPath` or `transport.tls` is ignored with one stderr note each.
- Windows named pipe: `--transport=pipe` (unchanged).
- TCP was removed on 2026-11-24 (bridges-uds): `--transport=https`, `--transport=http` or a config `transport.mode: "http"` as the effective mode stops the bridge at startup with "TCP transport was removed on 2026-11-24 (bridges-uds); start with --transport=uds". `--transport=uds` on the command line wins over a config that still says `"http"`.
- Health check: `node /Users/myhome/TRINC/ops/tr-suite/uds-health.mjs` (GET `/healthz` over the bridges' sockets).

## CLI Baseline

The server probes `obsidian version` with `--version` fallback and enforces `>=1.12.4` to align with [Obsidian CLI troubleshooting guidance](https://help.obsidian.md/cli#Troubleshooting).

`obsidian_health` now exposes structured CLI diagnostics, including:

- resolved binary path
- parsed CLI version
- probe commands attempted
- required vault registration status
- launch and readiness status

## Live Communication + CLI Validation Mode

> **Historical (2026-11-24).** The validator's `dist/tests/live/` entry point no longer exists, and its
> HTTPS endpoint option went away with the TCP transport (bridges-uds). Only the UDS and pipe endpoints below
> describe a bridge that can still run.

`live:communication:cli` is a standalone runtime validator (not Vitest, not CI) that cross-validates direct Obsidian CLI behavior against MCP transport behavior for IDE-style and Raycast-style clients.

Safety behavior:

- Requires `OBSIDIAN_LIVE_TEST=1`.
- Requires an existing MCP server endpoint and token (it does not start/instantiate server runtime).
- Verifies CLI preflight first (`--version >= 1.12.4` and `help` usage markers).
- Isolates writes to `bridge-comm-cli-test/<timestamp>/` only.
- Aborts immediately on first failure.
- Deletes only its own `bridge-comm-cli-test/<timestamp>/` run directory.

Required environment variables:

- `OBSIDIAN_LIVE_TEST=1`
- `OBSIDIAN_LIVE_VAULT_PATH=/absolute/path/to/vault`
- `OBSIDIAN_LIVE_CLI_BIN=<obsidian-cli-binary>`
- `OBSIDIAN_LIVE_MCP_TOKEN=<mcp-token>`
- Exactly one endpoint:
  - `OBSIDIAN_LIVE_MCP_UDS_PATH=/absolute/path/to/socket.sock`
  - `OBSIDIAN_LIVE_MCP_PIPE_NAME=obsidian-mcp-bridge` (Windows)

Optional:

- `OBSIDIAN_LIVE_VAULT_NAME=<vault-name>` (defaults to vault folder basename)

Run:

```bash
npm --prefix mcp-server run build
OBSIDIAN_LIVE_TEST=1 \
OBSIDIAN_LIVE_VAULT_PATH="/absolute/path/to/vault" \
OBSIDIAN_LIVE_CLI_BIN="obsidian" \
OBSIDIAN_LIVE_MCP_TOKEN="<mcp-token>" \
OBSIDIAN_LIVE_MCP_UDS_PATH="/absolute/path/to/socket.sock" \
npm --prefix mcp-server run live:communication:cli
```

## Operator Stability Gate

> **Retired 2026-05-09** — `cli-stability-gate.sh` is tombstoned (it exits immediately;
> its header documents the replacement health checks). The parity item below referenced
> `CliBackend.probe()` and the backend emulator, both removed.

For the current macOS production stack, the canonical operator-facing gate is:

```bash
/Users/trevorrobey/THE\ Copilot\ in\ Obsidian\ Everything/scripts/cli-stability-gate.sh
```

It proves:

- backend emulator health
- MCP bridge health
- `obsidian_health` parity with direct `CliBackend.probe()`
- required vault registration
- launch/readiness diagnostics
- live CLI communication validation in a safe test subtree

Optional cold-launch proof:

```bash
OBSIDIAN_CLI_STABILITY_FORCE_COLD_LAUNCH=1 \
/Users/trevorrobey/THE\ Copilot\ in\ Obsidian\ Everything/scripts/cli-stability-gate.sh
```

Use the cold-launch flag only when you intentionally want the gate to quit and relaunch Obsidian to prove launch-from-not-running behavior.

## No-TCP invariant (bridges-uds, 2026-11-24)

The bridge has **no TCP listener**. The HTTPS transport on port 8798 (`src/server/httpTransport.ts`, the 2026-04-30 encrypted-by-default invariant) was deleted on 2026-11-24, with every client moved to the socket; there is no TCP fallback in the bridge or in any client.

- `src/server/udsTransport.ts` serves the unchanged routes, bodies and auth (token, replay guard, browser guard) over plain HTTP/1.1 on `<home>/.local/state/trinc/run/vault-bridge.sock` through `src/server/udsListener.ts`, the shared helper that is byte-identical in the Command Center and Viz Studio packages (never edit one copy alone; `ops/tr-suite/verify.sh` compares them).
- The helper creates and checks the directory chain (every level a real directory of this uid that others cannot write, the run directory 0700, no ACL allow entry), publishes the socket 0600, replaces a stale socket left by a SIGKILL, refuses a live, foreign or non-socket file at the path, and watches the published name. A refusal is audited as `SOCKET_REFUSED` (with the helper's error code) and the daemon exits 1; a lost or replaced name is audited as `SOCKET_LOST` and the daemon exits 1.
- `vault-bridge.pid` in the same directory holds `<pid>\n`. It is rewritten atomically on every start and never deleted; the launcher validates it before it signals a stale holder.
- SIGTERM/SIGINT: the listener stops accepting and the published socket name goes at once, open connections get 2 s (`DAEMON_CLOSE_GRACE_MS`), in-flight tool calls get at most 2 s more (`SHUTDOWN_DRAIN_MS`), then the idempotency ledger closes and the daemon exits 0: 4 s in all, under the launcher's 5 s `shutdownTimeoutMs`.
- TLS is not used on the socket: only processes of this uid can reach it and no browser can; the bearer token stays as defence in depth. `NODE_EXTRA_CA_CERTS` is still passed by the launcher for the bridge's own outbound HTTPS calls (Miyo).

A regression guard (`npm run lint:transport`) fails on any `createServer(` (plain, `http.`, `https.`, `http2.`, `net.`, `tls.`) or `.listen(` in `src/**/*.ts` outside `src/server/udsListener.ts` and `src/server/windowsPipeTransport.ts`, and fails if either of those files is missing. Child-process test fixtures therefore live outside `src/` (`test/fixtures/`).
