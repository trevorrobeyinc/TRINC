# OCRA ↔ TrevGraph-Studio Ecosystem-Integration (EI.0) Analysis — 2026-04-23

**Status (updated 2026-04-27):** Historical investigation memo. Read-only analysis per Session 2026-04-23 handoff (`TextGraph-Studio/docs/handoff/ocra-integration-2026-04-23.md`). No code mutations occurred at the time. **This memo predates the trevor-robey-inc-agents rebrand (2026-04-27)** — references to "OCRA" / "OpenClaw Command Center" / "OpenClaw Research Agents" reflect the pre-rebrand naming and are preserved as historical context. Quotations from earlier ROADMAP versions are also preserved verbatim. For current product naming see [TREVOR_ROBEY_INC_AGENTS_DOSSIER.md](../TREVOR_ROBEY_INC_AGENTS_DOSSIER.md).

**Top-line finding:** The six options (A–F) enumerated in the handoff **mostly presume TrevGraph
calls OCRA synchronously**. TrevGraph-Studio's ROADMAP (`docs/ROADMAP.md` §Ecosystem Integration,
main HEAD `a400e90`) specifies the **opposite direction**: OCRA emits `workflow_result` JSON to
TrevGraph, which listens at a new `/api/bridge/ingest` endpoint in `electron/main.ts`. TrevGraph
is explicitly the **"visual receiving bay"** and MUST retain standalone capability when OCRA is
offline. This reframing eliminates most of A–F as category errors and sharpens the real
decisions.

---

## Section (a) — OCRA bridge code findings (Step 1)

**File**: `openclaw-bridge/bridge/server.ts` (546 lines, TypeScript, NOT compiled — no `dist/`).

### (a.1) Bootstrap shape

**Top-level executable**, not a library module. Line 537:

```ts
bootstrap().catch((error) => { ... process.exit(1); });
```

`bootstrap()` is invoked unconditionally at module load. **There is no `if (require.main ===
module)` guard.** Consequence: any `require()` of `server.ts` from another process (e.g.
Option B in-process import) starts the HTTP server as a side effect. Refactor required before B
is viable.

### (a.2) /mcp endpoint shape + auth

- **Transport**: streamable-HTTP + SSE. Routes: `POST /mcp` (JSON-RPC 2.0 body with `{id, method,
  params}`), `GET /mcp` (endpoint discovery), `GET /mcp/sse` + `POST /mcp/messages?sessionId=`
  (SSE compatibility), `POST /operator/mcp/messages` (operator-only).
- **Auth**: `Authorization: Bearer <token>` header resolved via `createBridgePrincipalResolver`
  against `security/token-store.json`. Principals: `supervisor | operator | anonymous`
  (`BRIDGE_PRINCIPALS`).
- **Method allowlist** per-principal via `getMcpAllowlistForPrincipal` (reader vs operator
  variants).
- **Rate limit**: 120 requests/min per source IP (`mcpPerIpLimitPerMinute`).
- **Origin check**: `RUNTIME_POLICY.gateway.corsAllowlist` — unknown origins get 403.
- **Content-Length required**; body max per `MCP_MAX_BODY_BYTES`; invalid/missing returns 400 or
  413.

### (a.3) Startup init cost — SUBSTANTIAL

At bootstrap, `server.ts` initializes:

| Step | Subsystem | Persistence/IO |
|---|---|---|
| `loadRuntimeConfig(cwd)` | Runtime config | Disk |
| `fs.mkdir(workspaceRoot)` + `fs.mkdir(comms)` | Workspace tree | Disk |
| `new StateStore(workspaceRoot)` + `await store.init()` | Job index + mission report index | Disk — reads `jobs/index.json`, rehydrates `running → queued` on restart |
| `createExecutionRouter({workspaceRoot, supervisorMode: true})` | Phase26 security router | Module init |
| `new JobWorker({store, commsRoot, executionRouter})` + `worker.enqueueQueuedJobs()` | Job worker re-enqueues persisted queued jobs | Disk reads |
| `createMcpService({logger})` + `mcpService.initialize()` | MCP service (tool loading, providers) | Likely disk + module loads |
| `createBridgePrincipalResolver({tokenStorePath})` | Token auth | Reads `security/token-store.json` |
| `buildWorkflowRuntime({rootDir, logger})` | Phase 31 workflow engine | Module init |
| `createResearchApi({workflowEngine, templateLoader, logger})` | Phase 31 research API | Module init |
| `createWorkflowScheduler({...}).start()` | **Cron-based recurring workflows** | **Long-lived state** |
| `createUsageMeter({stateDir, logger})` | Append-only JSONL metering | Disk |
| `server.listen(gatewayPort, gatewayHost, ...)` | HTTP server | Port bind |

**Neo4j**: absent. Consistent with v20 audit (Neo4j is greenfield via BI.1, future work).

**Option C (spawn-on-demand subprocess per request) is eliminated** — this startup cost fires
per-request is non-viable (likely 500ms–2s per call, plus disk I/O to rehydrate StateStore).

### (a.4) Long-lived state

Yes. `StateStore.init()` rehydrates persisted jobs, converting any `running` → `queued` with
note "Recovered from restart while running; re-queued automatically." The workflow scheduler
fires cron triggers at configured intervals — only meaningful in a long-lived process. SSE
sessions (`sseSessions` map) persist per-connection with keepalive timers. Rate-limit counters
(`mcpPerIpMinute`) are in-memory per-process.

`SIGTERM`/`SIGINT` handlers stop the workflow scheduler cleanly (lines 289–290). So graceful
shutdown IS supported, which is necessary for Option F (ephemeral lifecycle) if that path were
chosen.

### (a.5) Dependencies

Zero external runtime deps. Uses only Node built-ins: `fs/promises`, `http`, `path`, `url`.
Bridge-level imports are all OCRA-internal (`./state-store`, `../src/core/execution-router`,
`../../logging/logger.js`, `../../security/runtime-policy.js`, `../mcp/mcp-service.js`, etc.).
No Express, no ws, no axios. Security-conscious surface.

OCRA root `package.json`: `"name": "trevor-robey-inc-agents"`, `"version": "2.0.0"`, `"main":
None`. **Option D (library-only via npm) requires OCRA to add a `main` and stabilize a public
API** — substantial OCRA-side scope that is not currently planned.

---

## Section (b) — Phase26 gate result (Step 2)

**PASS** ✓. Ran `bash scripts/verify-phase26-policy.sh` at 2026-04-23 — exit code 0. Final line
stdout: `Phase 26 bridge runtime and execution-router consolidation policy verification passed`.

All required files present. All phase26 invariants enforced:

- `/mcp` streamable endpoint present in `bridge/server.ts`
- `createBridgePrincipalResolver` used
- `createExecutionRouter` used
- `TOOL_EXECUTION_BLOCKED` enforced (bridge returns 403 on `/execute-tool` direct-invocation attempts)
- `phase26-bridge-node` ID + `phase26_jobs_routed` counter present in execution-router
- `JobExecutionContext`, `JobExecutionResult`, `BridgePrincipalKind`, `ExecutionOutcome` types
  present in `types.ts`
- Worker uses `executeViaRouter` + fail-closed semantics
- No Sider export/re-entry or browser-login automation (phase26 safety-boundary check clean)
- `phase26:verify` script wired in `package.json` + `scripts/build-verify.sh` +
  `.github/workflows/ci-enforcement.yml`

**Consequence**: Option A (daemonize) is NOT blocked on security grounds. Bridge meets its own
production-readiness gate. All six options remain viable on security-surface grounds — the
elimination logic that follows is architectural, not security-driven.

---

## Section (c) — Feature-migration map (Step 3)

### (c.1) ROADMAP EI specification (direction of flow)

TrevGraph-Studio ROADMAP `docs/ROADMAP.md:98-139`:

> TrevGraph-Studio becomes the canonical local visual surface for the trevor-robey-inc-agents
> biomedical research pipeline. It **opens a local HTTP listener accepting `workflow_result`
> JSON payloads from the OpenClaw Command Center**, replacing InfraNodus-Visual cloud ingest.

**Flow**: OCRA Command Center POSTs to TrevGraph's `/api/bridge/ingest` — not the reverse.
TrevGraph is the **receiver**, OCRA is the **emitter**.

### (c.2) Invariants (ROADMAP lines 128–133)

- "Zero modification to Phase 1 UI."
- **"TrevGraph MUST NOT couple to Medical-Zettelkasten-MCP. OpenClaw owns algorithmic
  processing; TrevGraph is the visual receiving bay only."**
- "TrevGraph retains full standalone capability when OpenClaw is offline. Ingestion endpoint
  gracefully noops if no payload arrives; all Phase-1 features remain independently exercisable."
- HTTP listener port ≠ {8318, 8319, 8742, 8798, 8789, 8799, 18789, 5173}; selected at
  integration kickoff (likely `8300–8400` range or `3001`).

### (c.3) Scheduled EI sessions (post-Phase-1)

| # | Session | LoC est. | Notes |
|---|---|---:|---|
| EI.1 | TrevGraph HTTP listener + IPC scaffolding | ~200–300 | Node HTTP listener in `electron/main.ts`; `/api/bridge/ingest` route; main → renderer IPC |
| EI.2 | Ontology mapping adapter + E2E verification | ~150–250 | Renderer adapter maps `workflow_result` → "AI Knowledge Graph" ontology; renders via `src/nlp/pipeline.ts` + Sigma |
| EI.3 | Obsidian plugin re-route + smoke | ~50–100 | Cross-repo change to `infranodus-graph-view` |

### (c.4) LLM provider asymmetry

- **TrevGraph**: Brevilabs (`electron/ipc/chat.ts:5` `https://models.brevilabs.com/v1/chat/completions`),
  bearer via `BREVILABS_API_KEY`.
- **OCRA** (per ROADMAP v20 audit, lines 160–162): **Claude Code via `claude -p` stdin pipe** at
  Phase 33, using the operator's authenticated Claude Max Pro session. **Not** Brevilabs.

These two stacks stay parallel in Phase 1. Post-Phase-1 ROADMAP BI.5 flags an LLM-provider-
abstraction investigation for TrevGraph (pluggable Brevilabs + Qwen + Claude-Code), but it is
discovery-only and marked "may prove redundant."

### (c.5) Tab-by-tab migration candidates (Phase 1 scope)

Checked against RightPanel tabs 1–6 as of Session 19 close:

| Tab | Current backing | Migration candidate? |
|---|---|---|
| 1. AI Insights (summary + exploration question + underlying questions) | Brevilabs via `analyticsAI.ts` (S17) | **No** — fits standalone Phase-1 scope |
| 2. Main Ideas (Main Topics cluster list + Topical Diversity) | `pipeline.ts` algorithmic + S18 relocation | **No** — algorithmic, no LLM per Gate A |
| 3. Content Gaps (bridge-with-AI) | Brevilabs via `generateGapBridgeQuestion` (S19, lazy-on-click) | **No** — working, cost-sane, live-parity verified |
| 4. Relations | 🔵 NEXT (Session 20, 1c.4) | **No (yet)** — own Task A probe pending |
| 5. Sentiment | Local lexicon (ROADMAP), not shipped | **No** — local lexicon, offline |
| 6. Stats | Graph metrics (ROADMAP), not shipped | **No** — pure compute |

**No Phase-1 tab migrates to OCRA MCPs.** OCRA's contribution to TrevGraph per ROADMAP is
**ingesting external `workflow_result` payloads**, not backing any existing analytics tab.

### (c.6) Consequence for A–F

Four of six options (B, C, D, E) assume TrevGraph calls OCRA synchronously. The ROADMAP says
OCRA pushes to TrevGraph asynchronously via HTTP. **The direction of flow eliminates B, C, D,
E as category errors** for the EI scope. The remaining viable options are:

- **A (daemonize OCRA bridge via new launchd label)** — OCRA-side choice about how OCRA runs.
  Relevant because OCRA needs to be alive to emit workflow_results; whether that's via launchd
  or on-demand depends on OCRA's operational profile.
- **F (hybrid ephemeral bridge tied to TrevGraph lifecycle)** — **incompatible with OCRA's
  design**. The bridge hosts a cron scheduler (`createWorkflowScheduler().start()`), a persistent
  JobWorker with a rehydrating StateStore, and an MCP service with long-lived SSE sessions. Tying
  that lifecycle to "when TrevGraph happens to be open" would defeat the scheduler and orphan
  queued jobs. F is eliminated.

---

## Section (d) — Recommendation matrix

### Scoring (1 = worst, 5 = best per dimension)

| Option | Align w/ standalone | Implementation cx (↓=better) | Security surface | Operational burden (↓=better) | Reversibility | Fit to ROADMAP flow |
|---|---:|---:|---:|---:|---:|---:|
| **A.** Daemonize OCRA bridge (new label `com.openclaw-ocra-bridge`) | **5** (TrevGraph unchanged) | 2 (launchd + plist + logs) | 5 (phase26 PASS) | 3 (launchd mgmt, log tailing) | 4 (`launchctl bootout` reversible) | ✅ |
| **B.** In-process `require()` | 2 (couples OCRA deps into Electron DMG; bridge bootstrap unguarded) | 4 (high — need OCRA refactor: split exports from bootstrap) | 3 (bundling moves security surface into Electron) | 1 (single process lifecycle) | 1 (entangled) | ❌ wrong direction |
| **C.** Spawn-on-demand per request | 1 (bridge init cost ~2s × request count; scheduler can't run) | 3 | 4 | 2 | 4 | ❌ wrong direction + infeasible |
| **D.** Library via npm | 2 (OCRA needs `main` + public API; TrevGraph pulls OCRA deps) | 5 (highest — OCRA publishes + stabilizes public API) | 3 (version drift risk) | 2 (npm maintenance) | 2 (deps tangled) | ❌ wrong direction |
| **E.** Stdio MCP-per-capability (TrevGraph as MCP client) | 2 (**conflicts with "visual receiving bay only" invariant**; adds `@modelcontextprotocol/sdk` dep; Phase-1 tabs have no need today) | 3 (per-tab MCP-client wiring) | 3 (7 high-severity advisories in `openclaw-bridge/github-pro-mcp/node_modules/` — pre-integration blocker) | 3 | 4 | ❌ invariant violation |
| **F.** Ephemeral bridge on `app.whenReady()`/`app.quit()` | 4 | 3 | 4 | 2 | 5 | ❌ **incompatible with bridge's long-lived cron + JobWorker + SSE design** |

### Reasoning Trace

**Observed.** Phase26 gate PASSES (all 6 options viable on security). OCRA bridge at
`bridge/server.ts` has substantial boot (StateStore + WorkflowRuntime + Scheduler + Worker +
MCP service + UsageMeter) and is designed to be long-lived. ROADMAP (`docs/ROADMAP.md`
§98–139) specifies OCRA→TrevGraph direction of flow, not TrevGraph→OCRA. TrevGraph ROADMAP
invariant: "TrevGraph MUST NOT couple to Medical-Zettelkasten-MCP. OpenClaw owns algorithmic
processing; TrevGraph is the visual receiving bay only." Phase 1 currently at sub-phase 1c
Session 19 complete; 🔵 NEXT is 1c.4 Relations tab. EI work is explicitly post-Phase-1.

**Weighed.** The question "does OCRA's bridge need to be daemonized for TrevGraph integration"
is a **split decision**:

1. **TrevGraph integration work itself (EI.1/EI.2/EI.3)** does not require the OCRA bridge to
   exist at all for TrevGraph-side implementation. TrevGraph opens its own HTTP listener
   (`/api/bridge/ingest`) and tests with mocked `workflow_result` payloads. This is
   **orthogonal** to OCRA bridge daemonization.

2. **OCRA operational needs** (cron workflows, long-running research jobs, MCP services,
   persistent JobWorker queue) argue for persistence — but that's an OCRA-internal decision
   independent of TrevGraph. User should decide based on whether OCRA is used frequently
   enough to warrant always-on vs on-demand `npm run` invocation.

Options B, C, D presume synchronous TrevGraph→OCRA calls — ruled out by ROADMAP direction.
Option E additionally violates the "visual receiving bay only" invariant and has the 7
high-severity advisories as a pre-integration hygiene cost. Option F is incompatible with
OCRA's cron scheduler and persistent JobWorker — ruled out.

**Chose.** **Recommended split answer:**

- **For TrevGraph-side EI.1 work**: Implement the ROADMAP-native HTTP listener pattern.
  This is **not** A–F — it's the receiver architecture in `docs/ROADMAP.md` lines 105–106.
  Post-Phase-1 cadence; does NOT require any OCRA bridge state for initial implementation
  + testing (use fixture payloads).

- **For OCRA-side daemonization question (orthogonal)**: **Option A**, using **NEW** label
  `com.openclaw-ocra-bridge` (NOT the retired `com.openclaw.bridge`). Rationale: OCRA's
  bridge is designed as a long-lived service (cron scheduler, persistent JobWorker, SSE
  sessions, token-authenticated MCP service) and phase26 PASSES. If OCRA is used daily,
  launchd is lower friction than manual `npm run bridge:start`. If OCRA is used rarely,
  manual invocation is simpler — in that case, do NOT daemonize (null option), and accept
  that cron-scheduled workflows only fire when the user manually runs the bridge.

- **Runner-up**: "Null" / manual-invocation — `npm run bridge:start` when needed. Appropriate
  if OCRA usage is sporadic and cron triggers aren't load-bearing for the user.

**Risk.** If OCRA bridge is daemonized under launchd without a clear operator story for log
tailing, token rotation, and scheduler config hygiene, the persistent process becomes a
silent-failure surface. Phase26 PASSES gate verification but does not guarantee operational
ergonomics. Mitigation: pair Option A with an operator README section (log paths, `launchctl
bootout` recipe, token-store recovery) before enabling at daemon level.

### Rejected options (2-line rationale each)

- **B (In-process require)**: `bridge/server.ts` top-level `bootstrap()` is unguarded (no
  `require.main === module` check), so import triggers server boot. Would pull OCRA transitive
  tree into TrevGraph DMG (currently ~134 MB) and couple them irreversibly.
- **C (Spawn-per-request)**: Bridge boot cost (StateStore rehydrate + WorkflowRuntime build +
  MCP service init + scheduler start) is measured in seconds, not milliseconds — infeasible
  per-request. Wrong direction under ROADMAP.
- **D (npm library)**: OCRA `package.json` has no `main` field; stabilizing a public API is
  substantial scope not currently planned. Wrong direction under ROADMAP.
- **E (stdio MCP-per-capability)**: Violates TrevGraph "visual receiving bay only" invariant
  (ROADMAP line 131) and adds `@modelcontextprotocol/sdk` dep + 7 high-severity advisories
  blocker in `github-pro-mcp/node_modules/`. No Phase-1 tab needs it today.
- **F (ephemeral bridge tied to Electron lifecycle)**: Bridge hosts cron scheduler, persistent
  JobWorker with rehydrating StateStore, SSE sessions — tying to TrevGraph open/close defeats
  scheduled workflows and orphans queued jobs. Architecturally incompatible.

---

## Section (e) — Next-step implementation sketch for recommended path

### For TrevGraph side (EI.1) — post-Phase-1, ROADMAP-native

**Note**: This is NOT Session 20's work. Session 20 is 1c.4 Relations tab. EI.1 kicks off only
after sub-phase 1c close (5 more Phase-1 sessions ahead: 1c.4, 1c.5, 1c.6, 1c.7, maybe 1d).

**Files (future):**
- `electron/main.ts` — add HTTP listener on localhost:`<EI_PORT>` (port TBD at EI kickoff; avoid
  {8318, 8319, 8742, 8789, 8798, 8799, 18789, 5173}; likely `8300`–`8400` range or `3001`).
- New `electron/ipc/bridge-ingest.ts` — parse `workflow_result` JSON, validate, forward to
  renderer via `mainWindow.webContents.send('bridge:ingest', payload)`.
- `electron/preload.ts` — add `electronAPI.onBridgeIngest(callback)` receiver.
- New `src/renderer/bridgeIngestAdapter.ts` — maps `workflow_result` → "AI Knowledge Graph"
  ontology (EI.2 scope).
- Auth: bearer token in `Authorization` header; token rotated via TrevGraph's `SetupGate` pattern
  (new pref: `BRIDGE_INGEST_TOKEN`). SSRF not applicable (inbound endpoint); origin check
  restricted to `127.0.0.1` loopback.

**Testing**: fixture `workflow_result` JSON payloads in `tests/fixtures/`. No live OCRA
required for EI.1 unit tests.

### For OCRA side (Option A — daemonize with new label)

**Only if user decides daily-use / cron-needed profile.**

**Files (future, OCRA-side):**
- `ops/launchd/com.openclaw-ocra-bridge.plist` — new launchd plist. Label: `com.openclaw-ocra-bridge`.
  ProgramArguments: wrapper script at `ops/launchd/launch-ocra-bridge.sh` that resolves OCRA
  root, sets NODE_OPTIONS if needed, execs `npm run bridge:start` (or `node --loader ts-node/esm
  openclaw-bridge/bridge/server.ts` depending on OCRA's current invocation pattern).
  `WorkingDirectory`: OCRA root. `RunAtLoad: true`, `KeepAlive: { SuccessfulExit: false }`,
  `StandardOutPath`/`StandardErrorPath` under `~/Library/Logs/openclaw-ocra-bridge/`.
- `ops/launchd/install-ocra-bridge.sh` — idempotent installer (checks launchd agent list, boots
  out if present, copies plist to `~/Library/LaunchAgents/`, boots in).
- `ops/launchd/uninstall-ocra-bridge.sh` — clean unload.
- Operator README section — log tailing (`log stream --predicate 'process == "node" AND
  subsystem CONTAINS "openclaw-bridge"'`), token-rotation, scheduler-config hygiene.

**Port**: Bridge listens on 127.0.0.1:`<OCRA_BRIDGE_PORT>`. Historical value 8788 per retired
plist env. Keep 8788 unless conflict. This port does NOT overlap with TrevGraph's EI listener
port — they are orthogonal.

**Sophos**: Adding a daemonized Node process under launchd may trigger a Sophos scan. Pre-emptive
exclusion line for `.sophos-exclusions.md` (TrevGraph-side) — actually not applicable since OCRA
bridge runs entirely outside TrevGraph. OCRA may need its own exclusion file; check Sophos log
after first bootstrap to see if triggered.

**Startup + shutdown semantics:**
- Launch on user login via launchd.
- `bootstrap()` in `server.ts` already exits non-zero on init failure (line 545). Combined with
  `KeepAlive: { SuccessfulExit: false }`, launchd will restart on crash — which is typically
  desirable. HOWEVER, if bootstrap is crash-looping (e.g. misconfigured `security/token-store.json`),
  KeepAlive will produce rapid restart loops. Include a `ThrottleInterval: 30` in plist to
  rate-limit restart attempts.
- Shutdown via `launchctl bootout gui/$(id -u)/com.openclaw-ocra-bridge`. Bridge has
  SIGTERM/SIGINT handlers for the workflow scheduler (lines 289–290) — graceful shutdown of
  scheduled cron. Note: JobWorker does NOT have explicit SIGTERM handling visible in `server.ts`;
  in-flight jobs on shutdown become "running" → next restart converts to "queued" via
  `StateStore.init()`. Acceptable for a research tool; would need hardening for production SLAs.

**Error handling:**
- Bootstrap failures logged via `createLogger("bridge-server")` with `event: "bridge_start_failed"`.
- Per-request errors return JSON 400/403/404/429/500 with `{error, code}`.
- HTTP-level errors (port bind conflict, token-store parse error) crash with exit 1 → launchd
  restart.

**Observability:**
- `GET /health` returns `{status, service, timestamp, uptime_seconds, queued_jobs, running_jobs,
  gateway_port, queue_model}`.
- `log show --predicate 'subsystem CONTAINS "bridge-server"'` for structured logs.
- Mission report index at `workspace/jobs/MISSION_REPORT_INDEX.json` (persisted on every job
  state change).

### Runner-up (null option): manual on-demand

**Most appropriate if OCRA usage is sporadic.**

- User runs `cd ~/trevor-robey-inc-agents && npm run bridge:start` (or `node --loader
  ts-node/esm openclaw-bridge/bridge/server.ts`) when needed.
- No launchd plist. No persistent process. User responsible for starting before any flow
  that needs the bridge; stopping via Ctrl-C or `pkill`.
- Trade-off: cron-scheduled workflows do not fire when the user is not using the bridge. For a
  research-tool use case (not a production SLA), this is typically fine.

---

## Section (f) — Explicit do-not-do list

- ❌ Do NOT spawn `claude/*` worktree branches. Trunk-only on both repos.
- ❌ Do NOT modify any of OCRA's 55 pre-existing uncommitted entries from other workstreams
  (phase27 sider deletions, bridge auth edits, CI yaml, policy gates). User commits those on
  their own cadence.
- ❌ Do NOT edit OCRA's audit/provenance files (`audit/clean-room-derivative-notice.md`,
  `audit/baseline-provenance.json`, `audit/*`). They document historical AABH→OCRA lineage.
- ❌ Do NOT resurrect retired launchd labels `com.openclaw.bridge` or `com.trevorrobeyinc.agents.mcp`. If
  daemonizing under Option A, use new label `com.openclaw-ocra-bridge` only.
- ❌ Do NOT disturb TrevGraph-Studio's Phase 1 sub-phase 1c cadence. Session 20 (1c.4 Relations
  tab) runs on its own trunk-only cadence separate from this EI investigation. EI.1 kicks off
  post-Phase-1, not interleaved with 1c remaining sessions.
- ❌ Do NOT commit OCRA's `ops/launchd/` scaffolding or `openclaw-bridge/github-pro-mcp/` yet.
  Those files are from the 2026-04-23 prior session and wait on this decision + a subsequent
  hygiene pass for the 7 high-severity advisories.
- ❌ Do NOT `npm audit fix --force` on `openclaw-bridge/github-pro-mcp/node_modules/`. Patch
  interactively only, and only if/when that MCP becomes a consumption path (not needed for
  Option A OCRA-side daemonization).
- ❌ Do NOT introduce a TrevGraph runtime dep on `https://mcp.infranodus.com`. It is a
  development-time oracle only. Tracker already crystallized at 3/5 POSITIVE; subscription
  extends through Ecosystem Integration, but MCP is never a runtime component of the shipped
  app.
- ❌ Do NOT add `@modelcontextprotocol/sdk` to TrevGraph's dependencies unless and until the
  user explicitly chooses Option E (currently rejected in §d).
- ❌ Do NOT commit this memo. File is at `trevor-robey-inc-agents/docs/ei-integration-analysis-2026-04-23.md`;
  user decides commit timing after reviewing.
- ❌ Do NOT daemonize OCRA's bridge under launchd this session. User must explicitly approve
  Option A (or null) before any plist gets written. No `launchctl` invocations this session.
- ❌ Do NOT modify TrevGraph-Studio code this session. CSRF hardening from prior session is
  intentional; Session 20 (1c.4) is separate cadence.

---

## Summary

| Section | Verdict |
|---|---|
| Bridge code | Long-lived service by design; unguarded top-level bootstrap; substantial boot cost; no external runtime deps; persistent state (StateStore + cron scheduler + JobWorker) |
| Phase26 gate | **PASS** ✓ |
| Feature-migration | **None** of Phase 1 TrevGraph tabs migrate to OCRA MCPs. OCRA→TrevGraph is the specified direction via `/api/bridge/ingest` receiver — decided by ROADMAP, not reopenable here |
| A–F recommendation | **A (daemonize with new `com.openclaw-ocra-bridge` label) OR null (manual `npm run`)**, depending on OCRA operational profile. **B, C, D, E, F all rejected.** EI.1 is separate, post-Phase-1, ROADMAP-native TrevGraph-side work — not A–F |
| Next-step gating | Session pauses. User picks: **A** / **null** / **something else** / **postpone**. No code written until decision. |

---

## Decision 2026-04-23 — null option selected

**Null option chosen.** No daemonization this session. OCRA bridge runs on-demand via
`npm run bridge:start` (or equivalent `node --loader ts-node/esm openclaw-bridge/bridge/server.ts`
invocation) when usage arises — Option A (launchd `com.openclaw-ocra-bridge`) remains available
as a future toggle but is not pursued today. EI.1 formal integration between OCRA and
TrevGraph-Studio is deferred to **post-Phase-1** per TrevGraph-Studio ROADMAP (`docs/ROADMAP.md`,
main HEAD `a400e90`) — 1c.4 Relations tab (Session 20) and remaining sub-phase 1c sessions
proceed first on TrevGraph's separate trunk-only cadence.

**Consequences of null choice**: cron-scheduled OCRA workflows only fire while the bridge is
manually running; operator is responsible for starting/stopping. Appropriate for sporadic
research-tool usage, not production SLAs. Revisit Option A when OCRA use becomes daily /
cron-load-bearing, or at EI.1 kickoff if post-Phase-1 integration requires persistent OCRA
availability.

**Memo retained on-disk** as reference for future EI.1 kickoff so the bridge analysis and
recommendation matrix don't need re-derivation.
