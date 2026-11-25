# Obsidian MCP Server

REST-backed local MCP-compatible bridge for Obsidian on the current macOS production stack (REST-only since 2026-05-09 — the former CLI subprocess backend was removed).

For `My Digital Garden`, the bridge lane — `RestApiBackend` → Obsidian **Local REST API** plugin (`https://127.0.0.1:27124`) — is the stable production path for the six live note and command operations.

Workspace source-of-truth:

- Parent Raycast package: `../package.json` (`obsidian-bridge-fork`)
- Default Codex sync target: `~/.config/raycast/extensions/obsidian` via `../scripts/codex/sync-config.sh`
- *(2026-11-22: both lines describe the Raycast extension this bridge once shipped inside. The extension moved out of the monorepo on 2026-10-23, and Raycast was removed from the Mac on 2026-11-21, so neither path exists here.)*

This server is the REST-backed execution layer for note and command operations (sole backend: `src/backends/restApiBackend.ts`). The PDF/video summarize flows that used the backend emulator for `/v0/parse-doc` and `/v1/self-host/agent-turn` predate the emulator's retirement (2026-04-11, deleted 2026-05-08).

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

> **CLI-era sections (historical).** *CLI Stability Controls*, *Raw Direct CLI Track*, and
> *CLI Baseline* describe the pre-2026-05-09 CLI subprocess backend. That backend was
> removed in the bridge consolidation — the `cliStability` config block is still parsed by
> the config loader but no longer consumed, the direct-CLI gate is tombstoned, and the
> bridge no longer probes the Obsidian CLI binary. `obsidian_health` reports the sole
> `restApi` backend.

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
