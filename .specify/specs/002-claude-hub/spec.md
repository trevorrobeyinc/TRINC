# Feature Specification: Claude Hub (Central MCP + Obsidian Plugins)

**Feature Branch**: `002-claude-hub`
**Created**: 2026-05-13
**Status**: Draft (reverse-engineered)

**Input**: Existing `Claude/` workspace inside the monorepo, with deep-dive context in `Claude/CLAUDE.md`.

## User Scenarios & Testing

### User Story 1 — Canonical Vault Access (Priority: P1)

Any operator (Claude Desktop, Cowork, Command Center plugin, Raycast) needs to read/write the Obsidian vault programmatically. The `obsidian-bridge-launcher` plugin spawns the canonical MCP bridge as an Obsidian-lifecycle-tied child process on `:8798` (HTTPS). Operators connect via MCP stdio adapters that translate to HTTPS calls.

**Why P1**: This is the single canonical vault-access surface. Every other operator depends on it. Without `:8798`, the whole stack is offline.

**Independent Test**: Given Obsidian is open and the bridge is running, when an operator calls `curl --cacert <mkcert root CA> https://127.0.0.1:8798/healthz`, then it returns 200 within 2 seconds.

### User Story 2 — Biomedical Workflow Dispatch (Priority: P1)

The Command Center plugin (`obsidian-openclaw-command-center/`) exposes `:8799` (HTTPS, additive) with biomedical workflow tools. A user in Obsidian Copilot chat types "research aspirin for pain" → Copilot calls the workflow tool via `:8799` → Command Center spawns `trevor-robey-inc-agents/scripts/run-workflow.js` via `child_process.spawn()` → results stream back as JSON events.

**Why P1**: This is the entry point for the commercial product (see spec 001). Without it, the biomedical engine is unreachable from the user's actual interface.

**Independent Test**: Given a workflow template name and topic, when the Command Center dispatches via `:8799`, then stdout emits `workflow_created` within 2 seconds and `workflow_result` at completion.

### User Story 3 — Post-Workflow Zettelkasten Analysis (Priority: P2)

After a workflow completes, the Command Center plugin spawns the Medical Zettelkasten MCP (stdio subprocess) to run algorithmic graph analysis (gaps, clusters, diversity, cross-domain) on the synthesizer output. The Zettelkasten MCP has no LLM — it runs deterministic graph algorithms (4-gram co-occurrence, Brandes betweenness, Louvain communities, Shannon entropy).

**Why P2**: Enrichment, not blocking. Workflow can complete and deliver without Zettelkasten analysis, but with it the deliverable surfaces structural insights (echo chambers, repurposing opportunities).

### User Story 4 — Research Memory Pack Storage (Priority: P3)

The Research Memory MCP (`trevorobeyinc-research-memory-mcp/`) stores semantic packs in Qdrant via the `:6433` HTTPS TLS proxy. The Command Center plugin auto-ingests workflow output into the relevant pack.

### Edge Cases

- Obsidian closed → `:8798` and `:8799` both die (lifecycle-tied to plugins). No fallback; this is accepted.
- mkcert root CA missing → bridges throw and refuse to listen (Principle I).
- Zettelkasten MCP subprocess crash → workflow continues but analysis section is empty; surface the failure to the operator, don't silently omit.

## Requirements

### Functional Requirements

- **FR-001**: `:8798` MUST be the SINGLE canonical vault-access bridge. No alternative vault bridges (per `CLAUDE.md` Rules section).
- **FR-002**: `obsidian-bridge-launcher` plugin (at `Claude/obsidian-bridge-launcher/`) MUST manage the child-process lifecycle of `:8798` (bridge code at `Copilot-Everything/bridges/obsidian-copilot-bridge/`), tied to Obsidian's plugin host. The plugin owns only the LIFECYCLE (spawn at Obsidian onload, terminate at Obsidian quit); the BRIDGE CODE lives in the Copilot-Everything workspace and is the canonical HTTPS pattern source. This cross-workspace split is intentional — do not co-locate or duplicate.
- **FR-003**: `obsidian-openclaw-command-center` plugin MUST own `:8799` (additive, biomedical workflow tools).
- **FR-004**: Medical Zettelkasten MCP MUST run as an on-demand stdio subprocess. It MUST have NO LLM; all analyses are deterministic algorithms.
- **FR-005**: Both bridges MUST be HTTPS-only (Principle I). On cert-load failure, throw and refuse to listen.
- **FR-006**: The retired backend-emulator on `:8789` MUST NOT be re-introduced. ZettelkastenService runs in-process inside the `vault-zettelkasten` Obsidian plugin since 2026-04-11.
- **FR-007**: Console-log / eval surfaces MUST go through the `:8798` bridge tools (`obsidian_dev_console_logs`, `obsidian_dev_console_errors`, `obsidian_dev_console_eval`), NOT via the retired chrome-devtools CDP path on `:8315`. The `obsidian_dev_console_eval` tool is GATED by the `devConsoleEvalEnabled` setting (default OFF).
- **FR-008**: Bridge ↔ launcher plugin IPC MUST use the fd-3 line-delimited JSON-RPC channel (`stdio: ["ignore","pipe","pipe","pipe"]` + `BRIDGE_IPC_FD=3`).

### Key Entities

- **MCP Bridge** (canonical, `:8798`): owned by obsidian-bridge-launcher plugin.
- **Command Center Bridge** (additive, `:8799`): biomedical workflow tools, 11 tools (7 vault + 4 workflow).
- **Obsidian Plugins** (under `Claude/`):
  - `obsidian-bridge-launcher` — owns `:8798`
  - `obsidian-openclaw-command-center` — owns `:8799`, dispatches workflows (directory rename pending — still has `openclaw` prefix as of 2026-05-13)
  - `obsidian-vault-zettelkasten` — in-process ZettelkastenService (post-`:8789` retirement)
- **Medical Zettelkasten MCP** (`Claude/Medical-Zettelkasten-MCP/`): 10 stdio tools, no LLM.
- **Research Memory MCP** (`Claude/trevorobeyinc-research-memory-mcp/`): Qdrant-backed pack storage via `:6433`.

## Success Criteria

- **SC-001**: `curl https://127.0.0.1:8798/healthz` returns 200 whenever Obsidian is open.
- **SC-002**: All Claude Hub plugins pass `npm run lint:transport` (HTTPS-only invariant).
- **SC-003**: Zettelkasten algorithmic analyses complete in under 30 seconds against a typical workflow output, where **typical** is defined per spec 001's workflow artifact shape: **six interlinked markdown vault notes per workflow run, ≤500KB total**, written under `/Volumes/ExtraCurricular/My Digital Garden/OpenClaw/{template}/{date}/`. The benchmark uses any single completed workflow's note set (no synthetic corpus). Reproducible via: `time node Claude/Medical-Zettelkasten-MCP/scripts/analyze.js --input <path-to-workflow-note-dir>` — wallclock under 30s on the operator's hardware baseline.
- **SC-004**: Zero alternative vault bridges exist in the codebase.

## Assumptions

- Obsidian is always open during operator activity.
- mkcert root CA installed in System Keychain.
- `NODE_EXTRA_CA_CERTS` set in Obsidian's plugin host environment.

## Open Questions / NEEDS CLARIFICATION

- **[NEEDS CLARIFICATION]** Rename of `obsidian-openclaw-command-center/` directory to drop the `openclaw` prefix is "pending" per `ARCHITECTURE.md`. Confirm timeline; rename touches plugin manifests, vault `.obsidian/plugins/` references, and operator muscle memory.
- **[NEEDS CLARIFICATION]** Claude Hub-specific test count and coverage targets are not stated. Verify against `Claude/CLAUDE.md` (not read in this pass).
