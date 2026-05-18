# Obsidian MCP Server

CLI-first local MCP-compatible bridge for Obsidian on the current macOS production stack.

For `My Digital Garden`, the bridge-backed CLI lane is the stable production path for the six live note and command operations.

Workspace source-of-truth:

- Parent Raycast package: `../package.json` (`obsidian-bridge-fork`)
- Default Codex sync target: `~/.config/raycast/extensions/obsidian` via `../scripts/codex/sync-config.sh`

This server is the CLI-backed execution layer for note and command operations. It is not the entire runtime by itself: PDF/video summarize flows still use the backend emulator for `/v0/parse-doc` and `/v1/self-host/agent-turn`, then return through the hybrid MCP layer for note writes.

## Quick start

1. Copy `config/obsidian-cli-mcp.local.json.example` to `config/obsidian-cli-mcp.local.json` and adjust values.
2. Install dependencies:

```bash
npm --prefix mcp-server ci
```

3. Build and run:

```bash
npm --prefix mcp-server run build
npm --prefix mcp-server run start:https
```

Default secure transport is UDS on macOS/Linux and named pipe on Windows when `transport.mode` is omitted.
Set `security.globalRateLimitPerMinute` in `mcp-server/config/obsidian-cli-mcp.local.json` to enforce a global cap in addition to per-client limits.

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

- Operator gate: `scripts/direct-cli-stability-gate.sh`
- Validation mode: `OBSIDIAN_LIVE_VALIDATION_CONTRACT=full_direct_cli`
- Contract under investigation:
  - version detection
  - help responsiveness
  - vault registration
  - cold launch and warm readiness
  - create/read/append/search behavior

The bridge-backed lane remains the current stable note/command execution contract for `My Digital Garden` unless the raw direct track earns its own evidence-backed stability claim.

## Transports

- HTTPS: `--transport=https` (preferred; `--transport=http` accepted as a legacy alias — the network transport is HTTPS-only either way, see `src/server/httpTransport.ts`)
- Unix domain socket: `--transport=uds`
- Windows named pipe: `--transport=pipe`

## CLI Baseline

The server probes `obsidian version` with `--version` fallback and enforces `>=1.12.4` to align with [Obsidian CLI troubleshooting guidance](https://help.obsidian.md/cli#Troubleshooting).

`obsidian_health` now exposes structured CLI diagnostics, including:

- resolved binary path
- parsed CLI version
- probe commands attempted
- required vault registration status
- launch and readiness status

## Live Communication + CLI Validation Mode

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
  - `OBSIDIAN_LIVE_MCP_HTTP_URL=https://127.0.0.1:8798`
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
OBSIDIAN_LIVE_MCP_HTTP_URL="https://127.0.0.1:8798" \
npm --prefix mcp-server run live:communication:cli
```

## Operator Stability Gate

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

## Encrypted-by-default invariant (2026-04-30)

The network HTTP transport (`src/server/httpTransport.ts`, port 8798) is **HTTPS-only**. It will refuse to start without a valid mkcert key/cert pair configured in `transport.tls`. Plain HTTP fallback is not permitted; there is no `OPENCLAW_BRIDGE_TLS_DISABLE`-style escape hatch on this transport.

WebSocket upgrades, if ever introduced, MUST attach to the existing `https.createServer` instance (yielding `wss://`). The unix-socket and Windows-pipe transports (`udsTransport.ts`, `windowsPipeTransport.ts`) legitimately use plain HTTP because they bind to filesystem socket paths, not TCP ports — they cannot leak data over the network.

A regression guard (`npm run lint:transport`) rejects any future addition of `http.createServer`, `OPENCLAW_BRIDGE_TLS_DISABLE === "1"` checks, or bare `ws://` literals inside `httpTransport.ts`. Run it as part of pre-commit or CI.
