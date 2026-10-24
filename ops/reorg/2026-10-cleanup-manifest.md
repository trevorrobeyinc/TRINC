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

## Phase 3 — moved out (done 2026-10-23)

- **Raycast (D2)** → `~/Code/raycast-obsidian-bridge-fork` (own repo, signed first commit `b0751fb`; the extension is the repo root, the rest under `ops/`): `Copilot-Everything/bridges/raycast-obsidian-extension/`, `configs/raycast/` template, `ops/tr-suite/install-raycast.sh` (rewritten for the new layout), `docs/RAYCAST_COPILOT_PLUS_PROVIDER.md`, `docs/transcribe-and-save/`, `scripts/{wiley-clipper-fix.user.js,yt-dlp-impersonate-fix.sh,raycast-relay-smoke.py}`. `manifest.json` keeps the `raycast` block as `external`, and `verify.sh` still checks the template carries no licence key. **Still pointing back into this repo:** the extension's default `bridgeConfigPath` (the `:8798` bridge config — updated in the rename) and its video pipeline, which calls Command Center's `video_pipeline_*` tools; Command Center's error hint still names the old folder. Both are Phase 5 questions.
- **Personal plugins (D3)** → `~/Code/obsidian-origin-nest` (`a837b46`), `~/Code/obsidian-contextual-wiki-definitions` (`6797252`), `~/Code/obsidian-claude-console-mirror` (`52c2eb8`, given a `.gitignore`). `manifest.json` lists them as `external`, so `deploy.sh` no longer manages them; the vault copies stay deployed.
- **speckit specs (D11)** → `docs/history/speckit-specs-2026-05/`. **Changed from the plan:** the `003…/audits/outbound-https-2026-05-13.md` audit stays with them instead of going to Security Everything — it audits this repo's code against this repo's HTTPS-only lint, not host hardening. speckit itself writes new specs to a top-level `specs/`; start at 005 with `--number 5`.
- **Branches (D10)**: branches `claude/{festive-bun-087452,beautiful-sanderson-339997,priceless-tesla-c90ab5}` deleted (all 0 commits ahead of `main`). The `festive-bun-087452` worktree held 3 uncommitted files, each byte-identical to `main` (the 10-21 graveyard-feed generator fix); the folder went to the Trash, not `rm`, and `git worktree prune` dropped the record.

## Phase 4 — renamed to TRINC (done 2026-10-23)

- **Folder:** `/Users/myhome/TrevClaw-Obsidianodus` → `/Users/myhome/TRINC` (operator ran
  `~/.claude/backups/trinc-rename-2026-10/rename_to_trinc.py --apply`, 20:31 PDT). The old path is a compatibility
  symlink until 14 days of clean use; its removal checklist is Phase 8 in the plan.
- **GitHub:** the operator renamed the repo to `trevorrobeyinc/TRINC`; `origin` repointed; pushed `3812925` + `a0d25d7`.
- **In-repo:** every functional path (`3812925`); `scripts/TrevClaw-Obsidianodus-backup.sh` → `scripts/trinc-backup.sh`
  (bundle prefix `TRINC-FULL-backup-`). Dated history keeps the old name on purpose.

## Phase 5 — one door for Claude (done 2026-10-23)

**Operator decisions (2026-10-23, ~21:15 PDT), asked before any change:**

| # | Question | Answer |
|---|---|---|
| P5-a | Keep Command Center's `video_pipeline_run`/`video_pipeline_status` (Copilot and Raycast start the course-video pipeline through them)? | **Keep them.** They were never in Claude's door. |
| P5-b | What does Raycast chat use once Claude has its door? | **Raycast keeps its own door** (the adapter's `raycast` profile). Re-register it in Raycast with the TRINC path before the old-path symlink goes. |
| P5-c | Bar the Viz renders during Ralph loops too? | **Leave them open.** They spend nothing, need no YubiKey, and write only into `Visualizations/`; sub-agents stay barred from the whole door by the hook's prefix match. |

**Adopted:** Claude's one Obsidian door is the stdio adapter's `openclaw` profile (v0.4.0, server
`openclaw-obsidian`): run dispatch/status/results plus read-only `obsidian_search_notes`/`obsidian_read_note` on
`:8799`, and the 12 `viz_*` renders on `:8800`. Viz schemas are taken live from `:8800` and six write-target
properties (`folder`, `targetNote`, `targetCanvas`, `useActiveTab`, `useActiveNote`, `overwrite`) are stripped and
refused, so Claude's renders land only in `Visualizations/` (D5). Checked by `npm run test:profiles` (52 checks,
including a source scan that fails if Viz Studio adds an unblocked write-target property).

**Declined again, do not re-propose without new evidence:**
- **One plugin owns one port for everything** (the plan's Option 2): it would rename or merge plugins whose ids are
  frozen, and break Copilot's `mcp_command-center_*` / `mcp_viz-studio_*` tool ids and token paths.
- **Merging the `:8798`/`:8799`/`:8800` daemons** (Option 3): declined 2026-08-20 and again now. Aggregation stays at
  the client edge, in the adapter.

**Removed from the tree** (restore any of them with `git show a0d25d7:<path>`):
- `Trevor Robey Intelligence Network Citations/openclaw-bridge/mcp/viz-bridge-mcp/index.js` and
  `tests/mcp/viz-bridge-mcp.test.js` (12 tests): built 2026-08-16, never called by any deliverable. The
  `researchRuntime.vizBridge` line in `scripts/_workflow-runtime.js` went with them; `connector-registry.json`
  `viz-bridge` is now a superseded tombstone. Engine suite 1343 → **1331**, all pass.
- `Copilot-Everything/bridges/obsidian-copilot-bridge/src/server/tools/researchPublish.ts` and
  `src/tests/researchPublish.spec.ts`, plus `scripts/publish-to-vault.js` and `scripts/atlas-stub-creator.js` in the
  engine folder: the `research_publish` lane, tombstoned since 2026-09-22 (the engine writes run notes itself).
  `research_notify` stays. The stale compiled files went to `~/.Trash/trinc-reorg-2026-10-23/bridge-dist-research-publish/`.
  The running `:8798` bridge drops the tool when Obsidian next restarts it.
- The adapter's `claude` profile (default removed; the env var is now required) and its last registration, the
  `obsidian-bridge` entry in `Copilot-Everything/.mcp.json`: unused since 2026-10-07, and an ungated write lane
  (that server name was in no gate matcher).

## Phase 6 — one clear doc set (done 2026-10-23)

**Operator answers (2026-10-23, ~22:10 PDT):**

| # | Question | Answer |
|---|---|---|
| P6-a | What happens to the docs `HOW-IT-WORKS.md` is built from? | "Go over the current architecture and make sure there's nothing outdated, for record keeping." `ARCHITECTURE.md` was re-verified against live code and processes and stays as the technical record; the two dated docs moved to `docs/history/`. |
| P6-b | How far to slim the root `CLAUDE.md`? | "Slim it to everything that's current only." 89,364 → ~21K characters; history moved to `docs/history/`. |
| P6-c | What should the `AGENTS.md` mirrors become? | "The only opencode that needs to be connected is the Copilot agent's opencode backend. Disconnect the opencode app from Claude and remove the mirrored agent files and the opencode MCP server, unless the business configuration needs them." |

**opencode delegation lane retired (P6-c).** Removed: the `opencode` server from the repo `.mcp.json`,
`~/.claude.json` (user scope) and `claude_desktop_config.json`; `~/.claude/mcp-servers/opencode-mcp/` and
`~/.config/opencode/delegation-guardrail.json*` → `~/.Trash/trinc-reorg-2026-10-23/opencode-delegation-lane/`;
`_opencode-bridge/README.md` and the six repo `AGENTS.md` mirrors (root, `Claude/`, `Claude/Medical-Zettelkasten-MCP/`,
`Claude/obsidian-command-center/`, `Copilot-Everything/`, the engine folder). **Kept, because the business
configuration needs it:** `~/.config/opencode/` (the Copilot agent's opencode loads `opencode.jsonc`, `AGENTS.md`
and `plugins/` from it; its delegation-lane wording was trimmed), `/opt/homebrew/bin/opencode` (BetterTouchTool's
AI chat may use it), the engine's role-identity `config/agents/*/AGENTS.md`, and the Copilot fork's own
upstream `AGENTS.md` files. Still naming the lane, harmless, for Security Everything to tidy: the gate hook's
`mcp__opencode__` matcher entry, `opencode-delegation-guard/`, and the se_parity protect-list prefix.
Restore any repo file with `git show 2077e79:<path>`.

**Docs.** New: the root `HOW-IT-WORKS.md` (the plain-language story). Rewritten from live state:
`ARCHITECTURE.md`, `README.md`, the root, `Claude/` and `Copilot-Everything/` `CLAUDE.md`, and the engine's
`docs/WORKFLOW_CATALOG.md` (it documented 6 of 10 templates, with March-era 7B-model facts). Moved to
`docs/history/`: `THE-WHOLE-SYSTEM-2026-06-10.md`, `TREVOR_ROBEY_INC_AGENTS_DOSSIER-2026-05.md`, the root
`CLAUDE.md`'s deletion log (`claude-md-deletion-log.md`) and Browser Session History (`browser-sessions.md`,
where new entries now go). Targeted fixes: the engine `CLAUDE.md` (topology, no CI runs, template counts, the
duplicate price table replaced by a pointer to `OFFERINGS.md`), and `REVENUE_PLAYBOOK.md` (the board's
tidy-up spec, plus run commands missing `--operator-approve`, a `run-dataset-mission.js` example that has
refused since 2026-07-29, dead `05-launch-plan/` and `workspace/collateral/outbound/` paths, stale Ollama rows).
"Zero hallucinations" replaced with the canonical `OFFERINGS.md` elevator in the README, the root
`CLAUDE.md`, the Launch Playbook and the vault's Copilot business-context note (whose own open copy item
asked for exactly this sweep).

**Found, not changed (operator decisions):**
- **Ollama has no model installed**: Ollama.app serves `:11434` behind `:11435`, but `ollama list` is empty.
  Reinstall a model for the Copilot BYOK lane, or retire the proxy.
- **Prices quoted outside `OFFERINGS.md`**: a Custom tier ($15K–$35K) and an Enterprise tier ($60K–$120K) in
  `04-pricing-benchmarks/tier-*.md`, which the Launch Playbook's market tables cite; an Annual research credit
  SKU (~$15K) in `04-pricing-benchmarks/annual-research-credit-sku.md`; and the 2026-10-20 tier-ladder draft
  (`product-strategy/tier-ladder-DRAFT-2026-10-20.md`, on hold: feed subscriptions up to $499/month, any-field
  reports, a $7,500/month retainer). The core ladder (Pre-Mortem, Archaeology, the tactical SKUs) agrees
  everywhere. Competitor figures (GlobalData, DealForma) are benchmarks, not conflicts.
- **`.specify/memory/constitution.md` still says "Zero hallucinations on customer-facing output"**: left for the
  `/speckit-constitution` refresh that decision D11 calls for.

## Phase 7 — the learn-and-pitch pack (done 2026-10-23)

**Operator decisions (2026-10-23, verbatim where quoted):**
- **P7-a, pitches:** "8-slide client pitch to biotech investors and then a separate however many slide pitch
  for general, all buyers as well." Built: an 8-slide investor pitch and a 10-slide all-buyers pitch.
- **P7-b, prices:** "show the core ladder but also cheaper overall business tiers as well … it's moving to
  general research/other services etc with a focus of bio medical research." Framing: biomedical is the
  flagship, business research "also available", one engine and one gate.
- **P7-c, early stage:** lead with proof of method (no customers exist, so the proof is run #6).
- **P7-d, the learning deck** is for the operator only, covering every detail of the business and both lanes,
  including the missing pieces.
- **P7-e, business tiers:** "Approve prices, gated." The five Section B tiers of
  `product-strategy/tier-ladder-DRAFT-2026-10-20.md` moved into `OFFERINGS.md` → "Business research (any
  field)" exactly as drafted, marked "booking after the first live business-lane run", with the guarantee scope
  for business identifiers. This supersedes the Phase 6 note above for those tiers only; the feed
  subscription prices (Section A) stay on hold, and the other price conflicts listed above stand.

**Built:** `docs/learn-and-pitch/` parts 00–10 and the generated `TRINC-learn-and-pitch-pack.md`
(`scripts/build-learn-and-pitch-pack.py`, `--check` for staleness). Every fact carries its repo path.
`scripts/render-business-context.js` now copies the business section into the Copilot note (test updated).
Every "prices on hold" line for the business tiers was updated (root and engine `CLAUDE.md`,
`HOW-IT-WORKS.md`, `STATUS.md`, `SYSTEM-REALITY.md`, `REVENUE_PLAYBOOK.md`, `WORKFLOW_CATALOG.md`, the
draft, the board's Current focus).

**Checks:** `trinc-business:brand-check` and `trinc-marketing:collateral-audit` applied. Fixed in the pack: it
named the unlicensed drug database (the run #4 lesson: name what may be used, never what must be avoided);
two captions said "every identifier/source" was re-resolved (it is every PMID, NCT and DOI); a graveyard
count read as complete for the disease (it is complete for the query term); a storyboard frame showed a
template id. Every `$` figure in the pack exists verbatim in `OFFERINGS.md` (the only others are $0 revenue
and the internal $800 franchise-tax fee).

**Found, not changed (operator decisions):**
- **Investor Pre-Mortem and Cross-Silo Connector Report have no documented fulfilment path** (no template is
  named for either); the Conference Synthesis Brief and the Plain-Language Patient Brief have no code. The
  pitches leave out the two with no code and gate the investor pitch on confirming the Pre-Mortem path.
- **The ICP table's market statistics** (`OFFERINGS.md` → ICPs) trace to a 2026-04-30 report whose files are
  not on this machine; the pack marks them `[UNVERIFIED]`.
- **Stale plugin skills** (`~/.claude/local-plugins/`, outside the repo): brand-check's elevator still says
  "Zero hallucinations" and its price rule names `REVENUE_PLAYBOOK.md`; brand-check and collateral-audit
  describe a 50-row feed cap and a catalog defect that are both gone. Invoking them with args also mangles
  their `$` figures.
- `01-brand-system/logo-300x150-transparent.png` is visibly clipped ("TREVOR / CITATION-"); the pack points
  at the `-inc` variant and the inline SVG instead.
- `01-brand-system/personal-brand.md` lists founder alternates containing "No hallucinations"; the pack uses
  only the primary lockup.

## Phase 8 — close-out (in progress 2026-10-24)

**Done after Phase 7, same lane:** the pharmacovigilance samples, platform guides, one-pagers, landing-page
source and outbound templates were brought to `OFFERINGS.md` and stripped of unbuilt-delivery and
"verified citations" claims (`d69bc56`, `b7f4ff9`, `e64a6fc`). **Datarade deferred** by the operator
(2026-10-24) until the business is operating; recorded on `03-platforms/datarade/go-live-checklist.md`.

**`trevclaw` sweep (2026-10-24).** In the repo, 128 hits in 39 files: rename notes, dated history and logs
(kept), stale headings fixed (`ENGINE-CODEBASE-MAP.md`, `google-workspace.md` §6, `.learnings/LEARNINGS.md`),
and runtime names **kept on purpose** (decision P8-a): `~/.local/share/trevclaw-tls-proxies/`,
`~/Library/Logs/trevclaw/audit.jsonl` + `TREVCLAW_AUDIT_LOG` + `trevclaw_audit`, `~/.config/trevclaw/brevilabs-key`,
the Copilot fork's "TrevClaw Obsidian MCP Bridge" display name and the SearXNG example's instance name. Renaming
them would mean launchd reloads, plugin rebuilds with obsidianwatch blessings, and moving a secret, for no gain.

**Outside the repo, still resolving through the compat symlink** (all must clear before it is removed, not
before 2026-11-06; recorded in the root `CLAUDE.md` header):
1. The Raycast fork's default `mcpConfigPath` (source `~/Code/raycast-obsidian-bridge-fork`, 4 lines, plus the
   installed build): fix, rebuild, reinstall, test in Raycast.
2. The Desktop folder preset "TrevClaw-Obsidianodus": the operator fixes it in the app's folder picker.
3. **Security finding:** the Falcon Custom-IOA exfiltration rule in anchor group `2d28d290…` (rules[20] of the
   2026-06-01 backup) matches `.*TrevClaw-Obsidianodus.*`, so commands that name the real `/Users/myhome/TRINC`
   path do not match it. Security Everything lane: read-only recon of the live rule, then a propose-only
   pattern update with the operator's typed per-item approval. Never weaken it.

Harmless and left: old project keys in `~/.claude.json`, "formerly" notes in `~/.claude/settings.json`, the
recall hook's TRINC→TrevClaw search alias, `shelf-recall.py` test fixtures. Security Everything mirrored the
rename in `7f8116d`; its remaining 22 matches are dated records.

**Done after the Dependabot session landed** (`6192b5c`, `039ba03`):
- **Gates vs the 2026-10-23 baseline:** `verify.sh` 0 FAIL / 0 WARN, `lint-transport-monorepo.sh --strict` exit
  0, phase29 + phase23 pass, connector audit exit 0 (informational ⚠ only, as before), secrets scan pass, pack
  `--check` OK. Engine `npm test` **1331/1331** (baseline 1343: the difference is tests deleted with retired
  code in Phases 2–5; 1331 since Phase 6). Not run: the adapter's live `test:profiles` (Obsidian closed).
  Expected drift: `render-business-context.js --check` until the operator's `--apply`.
- **Bundle:** `~/Documents/TRINC-FULL-backup-20261024-0304.bundle` (77,244,073 bytes, sha256
  `b8e9678f1095230edd89e32d4006eab6d49225ad09d5a3d5961287777c5da5af`, HEAD `039ba03`, complete history,
  carries `refs/stash` and both restore tags), byte-identical mirror in `/Volumes/ExtraCurricular/Backups/`.
  GitHub `origin/main` was also `039ba03`. The superseded `TrevClaw-Obsidianodus-FULL-backup-20260922-1606`
  and `-20261023-1950` (both locations) await the operator's OK to go to the Trash (one-version policy).
- **Drive offsite:** `git archive` of `039ba03` copied to `My Drive/TRINC/Monorepo-039ba03/` with one literal
  `cp -R` per top-level folder; file-by-file compare: 3,220 entries, 0 missing, 0 extra, 0 different.
  `Backups/README-RESTORE.md` and `SHA256SUMS.txt` rewritten for the new snapshot. Next: the operator trashes
  the old `Monorepo/` (commit `03b0496`) in the Drive web UI as one folder, then the new folder is renamed
  `Monorepo/`.
- Hosting pointer in the root `CLAUDE.md`, the STATUS Engine and Repo rows, and the board updated.

**Still open after Phase 8:** remove the compat symlink (not before 2026-11-06, after the three items above);
the Falcon rule (proposed as a Security Everything session); the dependency audit's 11 decisions.
