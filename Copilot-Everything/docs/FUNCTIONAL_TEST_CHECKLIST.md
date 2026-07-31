# Functional Test Checklist

Updated: 2026-03-22

> **SUPERSEDED — historical snapshot (banner added 2026-07-31).** This checklist exercises
> the 2026-03 stack: the backend emulator (retired 2026-04-11, deleted 2026-05-08), Ollama
> (removed 2026-07-23), and the CLI-backed bridge lane (CLI backend removed 2026-05-09 —
> the bridge is REST-only via the Obsidian Local REST API `:27124`).
> `cli-stability-gate.sh` and `direct-cli-stability-gate.sh` are tombstoned and exit
> immediately as RETIRED. Current health checks: `Copilot-Everything/CLAUDE.md`
> (Service Health Checks).

## Scope

This checklist covers the current live production setup centered on `My Digital Garden`.

Included:
- core local services
- Ollama local model access
- backend emulator canonical routes
- Miyo compatibility routes
- official Copilot plugin compatibility
- bridge and backend automated test suites
- Raycast extension and MCP server automated test suites

Explicitly not treated as current-production scope:
- deprecated CPBH runtime
- old `dev-vault`-centered user flow
- inactive legacy prompt-bridge processes

## Checklist

| ID | Functionality | Validation Method | Pass Criteria |
|---|---|---|---|
| PRE-01 | Emulator + MCP bridge listeners | `scripts/socket-audit.sh` | Exactly one listener per expected port and no legacy bridge processes |
| CORE-01 | Backend emulator health | `GET https://127.0.0.1:8789/healthz` | `ok=true`, `status=ready`, `bridgeOk=true` |
| CORE-02 | MCP bridge health | `GET https://127.0.0.1:8798/healthz` | `ok=true`, `status=ready` |
| CORE-03 | Bridge CLI probe alignment | `scripts/bridge-health-check.sh` | bridge health and direct CLI probe agree |
| CORE-04 | Ollama model inventory | `GET https://127.0.0.1:11435/api/tags` (via TLS proxy) | expected local models returned |
| CORE-05 | Ollama generation | `POST https://127.0.0.1:11435/api/generate` (via TLS proxy) | non-empty response from `llama3.1:8b` |
| CORE-06 | Direct Miyo health | detected service base URL | health endpoint responds if service file is present |
| CORE-07 | Current-stack CLI stability gate | `scripts/cli-stability-gate.sh` | backend/bridge health, CLI probe parity, vault registration, readiness diagnostics, and live six-op validation all pass |
| BACKEND-01 | Backend contract tests | `scripts/backend-contract-test.sh` | contract and compat alias unit tests pass |
| BACKEND-02 | Backend smoke | `scripts/backend-smoke-test.sh` | emulator and bridge smoke returns success payload |
| BACKEND-03 | Backend + bridge compat sweep | `scripts/backend-bridge-compat-test.sh` | socket audit, bridge health, and backend smoke all pass |
| BACKEND-04 | Buffered self-host turn | `POST /v1/self-host/agent-turn` | successful buffered response on `production_official` lane |
| BACKEND-05 | Deterministic tool call | `POST /v1/self-host/tool-call` | `obsidian_health` succeeds |
| MIYO-01 | Official plugin Miyo alias compatibility | `scripts/official-plugin-miyo-check.sh` | official plugin can hit `/v0/health`, `/v0/search`, `/v0/search/related`, `/v0/parse-doc` |
| TEST-01 | Backend package tests | `npm test` in `backend/copilot-backend-emulator` | vitest suite passes |
| TEST-02 | Raycast extension tests | `npm test` in `bridges/raycast-obsidian-extension` | vitest suite passes |
| TEST-03 | MCP bridge tests | `npm test` in `bridges/obsidian-copilot-bridge` | vitest suite passes |
| TEST-04 | Copilot MCP repo tests | `npm test` in `repos/obsidian-copilot-mcp` | jest suite passes |
| TEST-05 | Raw direct CLI gate | `scripts/direct-cli-stability-gate.sh` | raw direct CLI contract passes without regressing bridge-backed lane |
| DOC-01 | Self-improvement logging | `.learnings/*.md` updates | failures and learnings captured during the run |

## Notes

- Official production behavior is validated against `My Digital Garden`, not the removed `dev-vault` user flow.
- Raycast runtime behavior should be judged by live code and test output, not older architecture prose alone.
- The bridge-backed CLI lane is the stable production CLI path for the current macOS stack; older direct plugin-side CLI design notes should not be read as the production contract.
- Raw direct CLI has its own passing evidence-backed gate in `scripts/direct-cli-stability-gate.sh`; active production acceptance in this workspace is CLI-backed execution plus backend-emulator orchestration where the command path requires it.
- Raycast `aiSummarizeCommand` is the intentional direct-local-CLI exception inside the Raycast layer because the command must preserve the live active-note editor state to rewrite the whole note reliably.
