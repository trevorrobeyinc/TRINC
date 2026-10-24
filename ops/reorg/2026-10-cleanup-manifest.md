# 2026-10 TRINC reorganization — cleanup manifest

The record of what the reorganization removes, moves and keeps, and why. Plan of record:
`~/.claude/plans/go-through-and-make-delightful-catmull.md`. Restore point for everything removed:
signed tag **`pre-trinc-reorg-2026-10-23`** (on `7f78dc4`) and the bundle
`~/Documents/TrevClaw-Obsidianodus-FULL-backup-20261023-1950.bundle`
(sha256 `5a9f206b654d40a1bafc08f087c0b47785aeea06f5fe33abaef70af667d2243d`, mirrored to
`/Volumes/ExtraCurricular/Backups/`). Restore one file: `git show pre-trinc-reorg-2026-10-23:<path>`.

## Operator decisions (2026-10-23, 19:3x PDT)

| # | Decision |
|---|---|
| D0 | Keep the engine regression suite (233 test files, 1343 tests) and every gate script. Only junk output goes. |
| D1 | Proceed with every phase despite the 2026-10-20 infra freeze — the reorg removes more than it adds. |
| D2 | Raycast cluster moves out to `~/Code/raycast-obsidian-bridge-fork` (own repo; installed build keeps working). |
| D3 | `obsidian-origin-nest`, `obsidian-contextual-wiki-definitions`, `obsidian-claude-console-mirror` move to `~/Code/<name>` (reverses the 10-21 absorption on purpose). |
| D4 | Viz Studio (`:8800`) stays and joins Claude's one door. |
| D5 | Claude's one door = run dispatch, status, results, read-only vault search/read, Viz renders (writes only to `Visualizations/`). No create/append/exec. |
| D6 | Rename to TRINC everywhere it applies and matters — folder, GitHub repo, every live reference (operator: "it's a big change but it's important"). |
| D7 | Keep the current folder names; add one clear map and doc set. A physical regroup is a separate later plan. |
| D8 | Keep real completed runs; Trash the rest. |
| D9 | `Copilot-Everything/deploy/backups/`: keep the newest snapshot, Trash the rest. |
| D10 | Remove the merged leftover worktree and the three merged `claude/*` branches. |
| D11 | **Keep speckit** (operator wants to use it for the business). Move the four May-era specs (001–004) to `docs/history/`, refresh the constitution to TRINC and current facts via `/speckit-constitution`. Remove the `self-evolving` skill. |
| D12 | Claude.ai hand-off: Claude Desktop Chat reads `docs/learn-and-pitch/` straight from disk (Filesystem connector). |
| D13 | Keep the vendored Copilot fork as is for now. |

## Baseline (captured before any change, 2026-10-23 19:50)

`verify.sh` 0 FAIL / 0 WARN · `lint-transport-monorepo.sh --strict` exit 0 · engine `npm test`
**1343 / 1343 pass**, 811 files · phase29 + phase23 policy pass · connector audit clean ·
stdio-adapter `test:profiles` all PASS (live `:8799`) · obsidianwatch baseline ok, 0 findings.

## Phase 1 — to the Trash (untracked / ignored; nothing in git changes)

Moved to `~/.Trash/trinc-reorg-2026-10-23/<original path>`; the operator empties the Trash.

| Path | Why |
|---|---|
| 14 × `.DS_Store` | Finder metadata |
| `.pytest_cache/` | test cache |
| `Copilot-Everything/node_modules/` (`.vite` only) | build cache |
| `Copilot-Everything/backend/` | empty husk of the retired backend emulator |
| `Copilot-Everything/scripts/lib.sh.bak.1780387695` | stale backup copy |
| `…/state/runtime/state.json.bak.pre-discard-20260922-230230` | one-off backup from 09-22 |
| `…/.ci/npm-cache/_logs/` (11 files) | npm debug logs |
| `Copilot-Everything/deploy/backups/` — 22 of 23 snapshots | keep newest `20261019-015335-…` (D9) |
| `…/workspace/workflows/` — the 8 **failed** runs | not referenced by either `state.json`; the 6 completed runs are all in the vault (D8) |

**Checked and KEPT (looked like junk, is live):**
- `workspace/comms/` — a hash-chained ledger (`comms-bus.js` verifies `prev` hashes); removing part of it breaks verification.
- `workspace/missions/`, `workspace/research-output/` — every mission id is referenced 29–53× by `state/runtime/state.json`.
- `workspace/releases/`, `workspace/datasets/` — every release and both dataset dirs belong to the six completed runs.
- `config/agents/{orchestrator,literature_reviewer,competitive_intel_analyst}/` — still defined in `agent-topology.json` and `autonomy-ladder.json`.
- `Copilot-Everything/dev-vault/` — the dev lane's target (`lib.sh` `DEV_VAULT`).
- `Copilot-Everything/Code` symlink, `Claude/.logs/` — intentional convenience link; live log.

## Phase 2 — removed from the tree (`git rm`; recoverable from the tag)

**2a · root**
- `RECOVERY-REPORT.md` — 2026-06-01 machine-wipe recovery report.
- `audit/salvage-from-archived-repo/` — pointers into an archived repo's orphan branch (0 refs).
- `tasks/` (root) — 2026-07-26 recovery-phase1 todo + lessons.
- `ops/tr-suite/absorb-external-plugins.sh` — one-time 10-21 absorption script.
- `.claude/skills/self-evolving/` (D11) + its 4 permission lines in `.claude/settings.json` + its `.gitignore` lines.
- `Claude/.claude/launch.json` (empty); `Claude/.claude/settings.local.json` untracked and ignored.

**2b · `Claude/`**
- `.archive/` — `claude-cli-bridge` tombstone (retired 2026-05-31).
- `bin/` — `openclaw-stack`, `cc-bridge-monitor.sh` (retired bridge-monitor unit).
- `claude-ai-skills/` — the 2026-07-09 rule keeps skills out of the monorepo.
- `workspace/` — 2026-05-07 "test_visual_parity" test data.
- `obsidian-copilot-terminal-relay/` — retired 2026-08-14, never deployed; its `manifest.json` entry too.

**2c · `Copilot-Everything/`**
- `repos/.upstream-v3.3.2-vault-snapshot/` — superseded plugin snapshot (0 refs).
- `tasks/` — retired backend-emulator plan.
- `tools/zettelkasten-graph-enhancer{,.test}.mjs` + `configs/zettelkasten-graph-enhancer.json` — self-contained, unused.
- 9 scripts whose own headers say RETIRED, or whose lane is gone: `backend-bridge-compat-test`, `bridge-health-check` (header: RETIRED 2026-07-31; added during execution, same category), `cli-stability-gate`, `direct-cli-stability-gate`, `full-functional-sweep`, `plugin-backend-emulator-check`, `zettelkasten-scheduler`, `zettelkasten-smoke-test`, `devtools-lockdown` (the CDP debug-port lane it cleared was retired 2026-05-08).
- 18 docs bannered RETIRED / SUPERSEDED or dated one-offs: `BACKEND_EMULATOR_{ARCHITECTURE,RUNBOOK}`, `COPILOT_WORKSPACE_CLAUDE_HANDOFF_2026-03-24`, `FUNCTIONAL_TEST_{CHECKLIST,REPORT_2026-03-20}`, `HMAC_PLUGIN_BACKEND`, `NAMESPACE_AUDIT`, `NEXT_STEPS`, `OBSIDIAN_CLI_STACK_HANDOFF`, `OFFICIAL_DIRECT_MCP_MIYO_CUTOVER_REPORT_2026-03-21`, `OFFICIAL_WRITE_AND_RAYCAST_PHASE2_REPORT_2026-03-21`, `OPENCODE-AGENT-HANDOFF`, `SELF_HOST_{COMPAT_MATRIX,CONTRACT,LOGIC_MAP}`, `UPSTREAM_SYNC`, `ZETTELKASTEN_BACKEND_{ARCHITECTURE,PLAN}`.

**2d · `Trevor Robey Intelligence Network Citations/`**
- `scripts/{rebrand-to-trevor-robey-inc.mjs,generate-phase29-artifacts.js,generate-phase2-audit-artifacts.sh}` — 0 refs.
- `05-launch-plan/` — the Apr 27–May 22 week-by-week plan (superseded by `STATUS.md` + the Commercial Launch Playbook).
- `audit/business-reality-2026-06/` — superseded by `SYSTEM-REALITY.md`.
- `workspace/audit/` — 7 dated validation / rebrand reports (April–July). The folder stays (a `README.md` keeps it), because `config/plugin-bindings.json` names it as the place for engine run artifacts.
- `workspace/collateral/platform-guides/{outlier,mindrift}-contributor-setup.md` — contradict `03-platforms/rejected-channels`.
- `workspace/collateral/claude-design-client-intake-form-prompt-balanced.md` — one-time prompt.
- `.learnings/{mcp-isolation-log.md,mcp-isolation-summary.json,runtime-mcp-check-raw.json}` — raw one-off dumps (0 refs).

**Checked and KEPT (looked stale, is load-bearing):**
- `ARCHITECTURAL_BLUEPRINT.md` — read by the phase23/24/25 policy gates and their tests.
- `.githooks/` — required by `verify-phase-workflow-policy.sh` and `setup-git-hooks.sh`.
- `.github/` — required by the phase20, phase-workflow and cline-supervisor policy gates.
- `tasks/` (engine) — live: sessions append to `tasks/lessons.md` (latest 2026-10-21).
- `future openclaw research agents phases to be implemented.` — read by the phase23 gate.
- `.clinerules`, `.npmrc`, `workspace/runtime/state.json`, `audit/evidence/`, `security/` (engine governance), all of `tests/`, `scripts/diag/searxng-section-gate-e2e.mjs` (live business-lane diagnostic).
- `Copilot-Everything/configs/migration-log.tsv` — written by the live `lib.sh` logger.
- `Copilot-Everything/scripts/{assert-registered-paths,inventory,bootstrap-workspace,ollama-preload,socket-audit,official-plugin-*}` — dev-lane tooling, maintained as recently as 07-31/08-12.
- The three `.learnings/` folders — the learnings convention; consolidation is a doc-set (Phase 6) question.

## Phase 3 — moved out (later session)

- **Raycast (D2)** → `~/Code/raycast-obsidian-bridge-fork`: `Copilot-Everything/bridges/raycast-obsidian-extension/`, `configs/raycast/`, `ops/tr-suite/install-raycast.sh`, `docs/RAYCAST_COPILOT_PLUS_PROVIDER.md`, `docs/transcribe-and-save/`, `scripts/{wiley-clipper-fix.user.js,yt-dlp-impersonate-fix.sh,raycast-relay-smoke.py}`, the `manifest.json` `raycast` block. The adapter `raycast` profile and Command Center's `video_pipeline_*` tools go in Phase 5.
- **Personal plugins (D3)** → `~/Code/<name>`: `Claude/obsidian-{origin-nest,contextual-wiki-definitions,claude-console-mirror}`.
- **speckit specs (D11)** → `docs/history/speckit-specs-2026-05/`; the `003…/audits/outbound-https-2026-05-13.md` audit → Security Everything.
- **Branches (D10)**: worktree `festive-bun-087452` and branches `claude/{festive-bun-087452,beautiful-sanderson-339997,priceless-tesla-c90ab5}` — all 0 commits ahead of `main`.
