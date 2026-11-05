# 2026-11-04 TRINC cleanup — manifest

The record of what the 2026-11-04 cleanup removed, moved, corrected and kept, and why. The operator asked
for junk files, test files and stale configuration to go, keeping only what is current or what the engine
actively uses. Inventory: 8 area finders, each candidate checked by two independent skeptics (a reference
lens and a decision-record lens) plus a completeness critic; the delicate parts were planned and
adversarially checked before anything moved.

## Restore points

| What | Where | Restore |
|---|---|---|
| Tracked files (118 removed, 30 edited) | the commit before the cleanup, `5ecc33b` | `git show 5ecc33b:<path>` or `git checkout 5ecc33b -- <path>` |
| Ignored/untracked junk (28 paths) | `~/.Trash/trinc-cleanup-2026-11-04/<original path>`; log in its `MOVES.tsv` | move back; the operator empties the Trash |
| Engine runtime discard (955 paths, 8 files edited) | `~/.claude/backups/discarded-runs-20261104/` (`MANIFEST.md` has the restore one-liner; `index-before/` holds byte-exact before-copies) | see its `MANIFEST.md` |
| The May stash (`a7fc6a0c`) | `refs/stash` inside `~/Documents/TRINC-FULL-backup-20261104-1519.bundle` | `git fetch <bundle> refs/stash:refs/stash`. Cutting the next bundle and trashing this one discards it for good. |

The discard script, the orphan list and the approved list are kept in
`~/.local/share/trinc-rollback/cleanup-2026-11-04/`.

## Operator decisions (2026-11-04)

| # | Decision |
|---|---|
| N1 | **Keep every test suite a runner executes** (236 engine test files, 1,412 tests). Only test leftovers go. Same rule as D0 in the 2026-10 manifest. |
| N2 | **Discard failed and mock engine runs recoverably**, the 2026-10-08 procedure: move, never delete; edit `state.json` and the indexes after before-copies. |
| N3 | **Remove the seven never-called connector adapters and correct every record that called them wired.** |
| N4 | Remove the Gumroad leftovers, the seven unpursued channel stubs, the Ollama warmer script, and the May stash (after saving its browser-session entries). |
| N5 | **NOTICE.md states plainly** that no model weights are shipped to buyers. The old line ("no model weights downloaded or run") was false before this cleanup. The review then found the approved sentence ("the only model the system runs locally" is the research-memory embedder) missed Miyo's local retrieval model behind the prior-research read-back, so the shipped wording names both local retrieval models, says they write no report text, and says what they find is context only. |
| N6 | The stash's Falcon detection bullet goes to the Security Everything browser-session log, not the GitHub-bound TRINC log. |
| N7 | Correct `SYSTEM-REALITY.md`'s Ollama line now. |

## A. To the Trash (ignored/untracked; nothing in git changes)

15 `.DS_Store` files (repo root, `.git/`, `.claude/`, `.specify/`, `Claude/` and two of its packages,
`Copilot-Everything/` and the vendored fork's top level, the engine root and `vendor/`, `_continuity/`,
`docs/`, `docs/history/`, `ops/`); the engine's npm debug logs (`.ci/npm-cache/_logs/`); the research-memory
package's vitest caches (`node_modules/.vite`, `node_modules/.vitest-cache`); two compiled orphans in the
`:8798` bridge's `dist/` whose sources are gone (`backends/operationPolicy.js`, `tests/e2e/safety.js`); the
seven `.bak.pre-discard-20260922-*` copies from the 09-22 discard (five role summaries and the two indexes;
the orchestrator's went with section C); and the stale 12-row glioblastoma feed build at
`workspace/distribution/graveyard-feed/` (the script's default `--out`, not the product).

## B. Removed from the tree (`git rm`)

| Area | Removed | Why |
|---|---|---|
| Engine code | `openclaw-bridge/bridge/payload-logger.js`, `openclaw-bridge/core/skill-providers/hosted-skill-provider.js` | nothing requires either (the second was a renamed copy of `openai-skill-provider.js`) |
| Engine config | `config/agents/{analyst,scout,synthesizer}/agent.json`, `config/data-source-credentials.json` | no code loads them |
| Engine workspace | Phase 1 `workspace/MEMORY.md`, `HEARTBEAT.md`, `memory/2026-03-02.md`, `memory/README.md`; `workspace/jobs/` (the TS bridge recreates it on demand); `workspace/legal/CommonPaper-Mutual-NDA-v2.pdf` (a saved HTML 404 page); `workspace/collateral/brand-system.md` (an older copy of `01-brand-system/brand-system.md`) | stale, unread or fake |
| Canon placeholders | `06-target-accounts/` (15), `10-quality-pipeline/` (11), `13-supplementary-research/` (13), `11-financial-ops/pricing-tiers.md`, four `01-brand-system/` placeholders, `01-brand-system/marketplace-listing-visuals/` (6), `03-platforms/kaggle-seo-breadcrumb/README.md` | one-line "Placeholder. To be filled in." stubs |
| Copilot-Everything | `scripts/{sync-upstream,plugin-diagnostics-check,stale-path-search}.sh`; `docs/{ARCHITECTURE_NOTES,RISKS,STREAMING_COMPATIBILITY_NOTES,MCP_CHAT_SMOKE_TEST,SETTINGS_MIGRATION}.md`; `configs/copilot-settings-import.redacted.json`; the bridge's `config/obsidian-cli-mcp.schema.json` and `src/tests/e2e/safety.ts` | retired 3.3.3 fork, retired backend emulator, March one-offs, an unused test helper |
| Claude/ | `obsidian-command-center/{test-results/,COWORK_HANDOFF.md}`; `Medical-Zettelkasten-MCP/docs/{copilot,openclaw}-integration-guide.md`, `config/{server-config,openclaw-role-tool-map}.json`, `scripts/demo-copilot-pipeline.js`; `obsidian-bridge-launcher/deploy.mjs` (and its `npm run deploy` line; `ops/tr-suite/deploy.sh` is the deploy path); research-memory `tests/fixtures/.gitkeep` | a committed Playwright marker, stale May docs, unloaded configs, a superseded deploy script |
| Root | `.gitignore` stanzas for the retired self-evolving skill, the retired cc-bridge-monitor, and `.pm2/` | patterns for things that no longer exist |

## C. Engine runtime discard (`~/.claude/backups/discarded-runs-20261104/`)

9 missions (runs #4 and #5, an orphaned BRCA1 mission, four refused missions and a test phantom), their 13
research-output folders (including three mock/probe tasks), the run #4 dataset `dataset-41d544a9b9aed0ba`
(raw and staged; never commercialization-ready), 7 session records of those missions, 921 orphan
agent-session records written by tests before 2026-07-30, and the orchestrator's three session files
(`session-x.json`, `summary-latest.json` and its 09-22 `.bak`).
Edited after before-copies: `state/runtime/state.json` (missions 32 → 23, open loops 26 → 6),
`tasks-index.json` (41 → 28), `datasets-index.json` (22 → 21 datasets and builds), and the five role
`summary-latest.json` windows. **The scout and analyst prompts no longer carry test data as "Recent
sessions"** (their windows had 15 test or discarded entries each). Run #5 can no longer be resumed.
Smoke-checked through the engine's own loaders: no discarded id remains, and every `tasks-index.json` entry
has its folder. `state.json` and `datasets-index.json` still carry older entries with no folder on disk
(see follow-ups); the discard did not create them.

Left alone on purpose: `workspace/comms/**` (chain-hashed), `workspace/memory/research-ingestion.ndjson`,
`workspace/runtime/state.json` (its RLHF queue still lists 9 pending-review drafts for discarded tasks),
`audit/evidence/agent-engine/*-sample.json`.

## D. Never-called connector adapters

Removed `openclaw-bridge/mcp/{chembl,clinicaltrials,pubmed,huggingface,npi,icd10,owkin}-mcp/` (21 files,
added 2026-04-27, never required by any code, prefetch entry or test). Records corrected: the connector
registry (five tombstones, `adapter_status: retired` with restore commands: `chembl`, `huggingface-metadata`,
`npi-registry`, `icd10`, `owkin`; `pubmed` and `clinicaltrials-gov` re-pointed to their live ToolUniverse
paths), `plugin-bindings.json` and
`PLUGIN-BINDINGS.md` (the Owkin rationale; `~~AI research` resolves to NONE; the bio-research duplicates
note), `NOTICE.md` (decision N5; the source table names the live paths), `CONNECTOR-ALIGNMENT.md`, the
source-licence register, `REVENUE_PLAYBOOK.md`, `README.md`, `ARCHITECTURE.md` §3.6, learn-and-pitch
parts 03 and 05 (pack rebuilt), `scripts/audit-connector-coverage.js` (the new-adapter template now points
at `open-targets-graphql/`), and trinc-local skills. Across the whole cleanup four skills were edited
(`first-sale-gate`, `ad-hoc-research`, `founder-fit`, and section A's `feed-refresh`), their plugins bumped
(operations 1.0.1, bioresearch 1.0.1, founder 1.1.1, engineering 2.1.4) and updated with
`claude plugin update`. The review pass also corrected the root `README.md` posture line, the Ollama owner in
`CLAUDE.md`, `ARCHITECTURE.md` and `REVENUE_PLAYBOOK.md` (the Homebrew service, not an app), two founder-lane
mentions of `06-target-accounts/`, and a line-pinned `NOTICE.md` citation. `openclaw-bridge/core/https-client.js` now has no runtime
caller but stays: the Phase 16 and 18 gates pin it by hash.

## E. Approved judgment calls

Gumroad leftovers (`workspace/collateral/teasers/{pharmaco-teaser.png,pharmacovigilance-report-cover.png,OpenClaw-Pharmacovigilance-Teaser.pdf}`,
10.5 MB, and `workspace/templates/first-order-reply.md`); the seven channel stubs in `03-platforms/`
(Databricks, Ocean Protocol, Snowflake, Substack/Patreon, three report aggregators);
`Copilot-Everything/scripts/ollama-preload.sh` (no plist installed, nothing called it, its model is not
installed; tombstoned in the ARCHITECTURE.md Retired table; the `:11435` proxy stays); the May stash, after
its two AWS browser-session entries were copied to `docs/history/browser-sessions.md` and its Falcon bullet
to the Security Everything log (N6).

## Checked and KEPT (looked removable, is live or decided)

- **Every test a runner executes.** No orphan test files exist; the three `searxng-mcp/test/*.test.mjs` files test live code (run manually; consider adding them to the `npm test` glob).
- `workspace/research-output/task-probe/`-style entries still listed in a live index are discarded only with their index entry (section C), never alone.
- Legal placeholders in `08-contracts-legal/` (active workstream, open `[DECIDE]` items); the registered-agent and Bonsai placeholders (pending decisions); the retired pricing-tier files in `04-pricing-benchmarks/` (an open operator decision and a live skill name them).
- `workspace/collateral/data-dictionaries/` and `teasers/enterprise-data-teaser.md` (outbound templates promise them; they need a redline, not removal); the platform-guide twins (need syncing with `03-platforms/`); `01-brand-system/landing-page/`; the clipped logo PNG (recorded decision).
- `audit/evidence/` and `audit/phase2-checklist.md` (kept by the 2026-10 manifest; D0 gate set), `audit/baseline-provenance.json` (clean-room provenance), `security/access-decision-ledger.json` (live store; its repair is a pending operator decision).
- `workspace/comms/`, `workspace/memory/research-ingestion.ndjson` (live ledgers; test pollution needs an isolation fix, not deletion).
- `openclaw-bridge/docs/` Phase 1 governance records, `scripts/generate-phase7-artifacts.js` (referenced), `workspace/scripts/` (pre-delivery steps), the AWS listing `.txt` upload twins.
- `Copilot-Everything/scripts/{lib.sh,rollback-restore.sh,deploy-mcp-runtime-to-official-plugin.sh}`, `deploy/obsidian/plugins/copilot`, `docs/OPENCLAW-MCP-STATUS-CORRECTED-2026-08-12.md` (tombstone record).
- `Claude/Medical-Zettelkasten-MCP/{lib/copilot-bridge.js,scripts/demo-openclaw-pipeline.js}`, the deployed plugins' `main.js` files.
- Git: the two Desktop-pooled worktrees (`claude/eloquent-thompson-7830d1`, `claude/wonderful-banach-91f9df`; the app manages them), `/Users/myhome/trinc-rm-port` (the only built copy of the ported research-memory code until the main folder is rebuilt), every restore tag, `.git/opencode`.
- `.claude/settings.json` deny rules and `.claude/settings.local.json` (permission configuration is the operator's).

## Found, not changed (follow-ups)

- `security/access-decision-ledger.json` is corrupt; its validated repair waits on the operator (board 2026-07-29).
- `state.json` keeps two failed missions with the same profile as the discarded refused ones (`mission-a531e0a680083657af085cb9`, `mission-db549fab307132b17e159c34`: PHASE15_HUMAN_APPROVAL_REQUIRED, 1970 stamps, no folder). All 6 remaining open loops are theirs. They were not on the approved list; discard them the same way if wanted.
- Older gaps the discard did not create: 16 of the 23 missions in `state.json` have no `workspace/missions/` folder (14 completed research-pack missions and the two above), several carry absolute paths from the old checkout location, and 14 `datasets-index.json` records point at staged folders that no longer exist.
- `STATUS.md`'s Paper row and the first-sale-gate skill still describe `08-contracts-legal/` as all placeholders; the NDA, order form and exhibits were drafted 2026-11-04.
- `render-business-context.js --check` will report drift in the vault's Business Context note (the research-sources table changed); refreshing it with `--apply` is operator-run.
- `workspace/jobs/` is not gitignored; if the TS bridge ever runs it recreates untracked files there.
