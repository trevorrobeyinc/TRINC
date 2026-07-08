# Alignment Actions — change-of-record (2026-06-10)

> **What this is (2026-06-10).** The exact list of documentation edits made as a result of [`00-audit-report.md`](00-audit-report.md). Edits are banner-and-append only — no historical content was deleted, no code was changed, nothing was sent or published. Recommendations are tagged inline as recommendations.

## New files created

| Path | Purpose |
|---|---|
| `audit/business-reality-2026-06/00-audit-report.md` | The full audit (this folder). |
| `audit/business-reality-2026-06/01-alignment-actions.md` | This change-of-record. |
| `SYSTEM-REALITY.md` (vault root) | Single ground-truth "how the business actually works today" doc. |
| `CONNECTOR-ALIGNMENT.md` (vault root) | Maps every connector layer to its business function. |

## Existing files edited

| Path | Change |
|---|---|
| `../../ARCHITECTURE.md` (repo root) | Added a correction banner: the Scout→Ollama / Analyst→LM Studio / Synthesizer→Claude role-routing diagram is a historical Phase-35 design, not the active config (claude-code is default for all roles); container-execution governance is an un-invoked scaffold. Diagrams preserved; redirect to SYSTEM-REALITY.md. |
| `README.md` (vault) | Phase Status table + Future Roadmap reconciled with `CLAUDE.md`: Phases 29/30/31/33 added as implemented; "Phase 31 planned post-Phase 22" corrected to "implemented + locally tested, not externally deployed." |
| `03-platforms/datarade/vendor-application.md` | Stale "Submit by 2026-04-28" header replaced with accurate submitted-2026-05-11 → declined-2026-05-20 status banner. DrugBank source-register line reworded to stop advertising a "Commercial DrugBank-licensed pack" that is not licensed. |
| `03-platforms/aws-data-exchange/correspondence-2026-05.md` | Added a 2026-06-10 status + verification note: escalation threshold passed unsent; mailbox search found no AWS thread in Zoho or Gmail; verify-first checklist before sending follow-up #3. |
| `09-source-licenses/drugbank-stop-ship-unless-licensed.md` | Placeholder filled: no commercial license held, STOP-SHIP posture, cross-link to the corrected Datarade line and the regex gate. |
| `09-source-licenses/drugbank-regex-gate.md` | Placeholder filled: `DB\d{5}` build-gate intent and where it must run. |
| `12-pipeline-tracking/{kpis-end-of-month,discovery-calls,nda-pipeline,signed-deals}.md` | Empty placeholders replaced with a dated 2026-06-10 zero-baseline + structured logging tables for going-forward entries. |
| `REVENUE_PLAYBOOK.md` | Appended a `## Continuation — 2026-06-10` section: corrected channel state, $0 baseline, pointer to the revised 30-day plan. |
| `trevor-robey-inc Commercial Launch Playbook.md` | Appended a post-mortem of the original (Apr 27 – May 22) plan and a `REVISED 30-DAY PLAN — 2026-06-10 → 2026-07-10`. |
| `CHANGELOG.md` | Added `## [2026-06-10] Documentation reality-alignment pass`. |

## Deliberately NOT done

- No code changes. The missing citation **resolver** (PMID→live URL) is specified as a follow-up in `SYSTEM-REALITY.md`, not built.
- No outward-facing actions. Nothing was submitted to a marketplace, and no email was sent — AWS/Datarade items are documented as "ready" or "verify-first," never "done."
- The legacy "typo'd contact email" in collateral was left for the operator (already on `go-live-checklist.md` gate #1) to avoid guessing the intended spelling.
- No edits to the user-global `~/.claude/CLAUDE.md` (its stale "Playwright MCP survives" note is a separate concern, flagged only).
- No git commits (the vault tree is partly untracked already; commit on request).

## Update — 2026-06-12 (post-research citation-integrity engine landed)

> This section updates the "Deliberately NOT done" note above; the 2026-06-10 record is left intact as the historical state of that pass.

The "No code changes" / "resolver not built" status no longer holds for the citation-integrity work. A post-research engine pass shipped a zero-fabrication citation layer plus two cost-avoidance deliverables (unit-tested, live-verified on an armed heart-failure run):

- **Citation gate (code).** `agent-engine` now persists the citation identifiers actually retrieved at runtime (`fetched_citation_ids`) plus a per-task `citation_verification` block, and `buildPrompt` carries an ABSOLUTE-RULE "ZERO FABRICATION" clause (never invent a PMID/NCT/DOI; emit `[no verifiable citation found]` instead). `workflow-engine.executeMissionStep` runs a report-level gate (`verifyReportCitations`) that cross-checks every cited identifier against the union of runtime-fetched ids and **hard-fails** (`PHASE30_CITATION_UNVERIFIED`) when the grounded ratio falls below `minGroundedCitationRatio` (agent-config default 0.34). Files: `openclaw-bridge/core/citation-gate.js`, `core/citation-extractor.js` (DOI-regex terminator fix), `agent-engine.js`, `workflow-engine.js`.
- **Retraction screen (code).** Each cited DOI is checked against Crossref (`crossref-retraction.js`); a report citing any retracted paper hard-stops (`PHASE30_CITATION_RETRACTED`), fail-soft so a Crossref network blip can never wrongly block a report.
- **Stopped-trial corpora ingestion (code).** A local fetcher (`ctgov-supplemental.js`, tool `ctgov_stopped_trials`, wired via the new `localFetchers` seam in `tool-prefetch.js`) pulls TERMINATED/WITHDRAWN/SUSPENDED trials with each sponsor's `whyStopped` text and protocol change-history; each record is NCT-traced.
- **New shipped deliverables.** Every mission bundle now seals `deliverables/citation-integrity.md` (graded provenance ledger A/B/C/D, F+BLOCKED on any retraction; `monetization/integrity-rating.js`) and `deliverables/graveyard-memo.md` (prior terminated/withdrawn/suspended programs in the indication, each NCT-traced with the sponsor's stated stop reason or an explicit "(none stated by sponsor)" — never invented — plus a protocol amendment-risk band; `monetization/graveyard-memo.js`, rendered deterministically from fetched records, no LLM). Both are registered in `manifest.json` and `checksums.txt`.

**Honesty note (unchanged brand constraint).** Citations are **grounded in the source records actually retrieved at runtime + DOI retraction-screened (Crossref)**. The original "No outward-facing actions" and `SYSTEM-REALITY.md` follow-up for a citation **resolver** (per-citation external re-resolution against a live source database — PMID→live URL) is still **not built**; grounded != re-resolved.
