# SYSTEM-REALITY — How Trevor Robey, INC. actually works today

> **Ground-truth snapshot (2026-06-10).** This is the one doc to read when you want to know what the business *is* and *does* right now, in plain language — not what an older design doc aspired to. Where this conflicts with `ARCHITECTURE.md` (a 2026-04-12 Phase-35 reference) or the `README.md` phase table, **this doc wins.** Built from the 2026-06-10 audit ([`audit/business-reality-2026-06/00-audit-report.md`](audit/business-reality-2026-06/00-audit-report.md)). Opinions are tagged *(recommendation)*.

## 1. The business in one paragraph

You sell **citation-traced biomedical due-diligence reports**: a buyer (biotech investor, pharma BD/CI team, or biotech R&D group) gets a research report where **every claim resolves to a public-domain identifier** (a PubMed PMID, a ClinicalTrials.gov NCT number, a ChEMBL ID, a DOI, etc.), delivered in days for a few thousand to ~$20K — versus McKinsey-grade diligence that costs six figures and takes weeks, or free chatbots that hallucinate sources. Medical research is the chosen first niche; the same machine can do any vertical later. The legal wrapper and brand:

| | |
|---|---|
| Legal entity | **Trevor Robey Intelligence Network Citations LLC** (California; filed 2026-05-06, receipt B20260217250) |
| CA SOS approval | Recorded as **pending** as of 2026-05-07 — **verify current status** (expected ~2026-05-09; confirm the entity number landed) |
| Brand wordmark | **Trevor Robey, INC.** — "INC" = *Intelligence Network Citations* (a backronym, not a corporate suffix) |
| Domain / email | trevorobeyinc.com / trevor@trevorobeyinc.com (Zoho; verified live; alias trevorrobeyinc@gmail.com) |
| Tagline | *Every claim, sourced. Every risk, named. In days, not weeks.* |
| Lead product | **Investor Pre-Mortem** — $9,950 anchor / $14,950 standard / $19,950 custom |
| Canonical SKU list | [`OFFERINGS.md`](OFFERINGS.md) |

## 2. What the engine actually does (the part you said you didn't understand)

You type a research question into **Obsidian Copilot chat**. That hands off to an Obsidian plugin (`openclaw-command-center`) which runs a small local web bridge on port `:8799`. The plugin launches a Node program — `scripts/run-workflow.js` — which is the **OpenClaw research engine**. It runs one of **six biomedical workflow templates** (drug-discovery, pharmacovigilance, clinical-trial-landscape, target-validation, rare-disease, general). For each step it calls a large language model, pulls in biomedical tool data, scans the text for citation identifiers, and writes the results back into your Obsidian vault as a set of linked notes. A second tool (the Zettelkasten MCP) then analyzes the note graph.

```
You, in Obsidian Copilot chat
        │
        ▼
openclaw-command-center plugin  ──►  MCP bridge :8799   (lives inside Obsidian)
        │
        ▼
scripts/run-workflow.js          ──►  the Phase 30 "workflow engine"
        │      runs as a normal Node child process (NOT a container)
        ▼
LLM call for each agent role     ──►  per-role provider routing (role-provider-router.js)
        │                              scout → Ollama (local qwen2.5:7b)
        │                              analyst / synthesizer → Claude Code CLI (`claude -p`)
        │                              unmapped roles + default → Claude Code; each route
        │                              falls back to Claude Code on failure
        ▼
ToolUniverse                     ──►  2,116 biomedical tools (Harvard, vendored)
        │
        ▼
citation-extractor.js            ──►  regex pulls PMID / NCT / ChEMBL / DOI / UniProt / CID out of the text
        │
        ▼
citation-gate.js                 ──►  report-level grounding gate (cited ids vs runtime-fetched ids)
        │                              + Crossref DOI retraction screen; hard-fails an
        │                              ungrounded/retracted report (see §3)
        ▼
6 notes written into your vault  ──►  /Volumes/ExtraCurricular/My Digital Garden/OpenClaw/{template}/{date}/
```

**Plain-English takeaways:**
- **Per-role provider routing is now live (the engine is genuinely multi-agent).** **Updated 2026-06-11:** the prior claim here — that "claude-code does everything; LM Studio is a backup; Ollama is switched off" — is **superseded.** A stateful multi-agent routing layer was built and verified live on 2026-06-11. Roles are mapped in `config/role-provider-map.json` (precedence: `roles[role]` → the template's `provider_preference` → `default = claude-code`):
  - **scout → Ollama** (provider `local`, model `qwen2.5:7b-instruct`; a boot-persistent launchd service on `:11434`, reached through a `:11435` mkcert TLS proxy).
  - **analyst → claude-code** (`claude-sonnet-4-6`) — briefly pointed at LM Studio on 2026-06-11, then reverted to claude-code for 16 GB-RAM stability (Ollama is the only local model carrying a role).
  - **synthesizer → claude-code** (`claude-sonnet-4-6`).
  - **Unmapped roles and the default → claude-code**, and *every* non-claude route falls back to claude-code if it fails.
  - **Persistent agent identity/memory:** each role has `config/agents/<role>/{SOUL.md, AGENTS.md, sessions/}`, loaded by `role-router.dispatch` (via `agent-context-loader`) and written back by `agent-session-recorder`. New modules: `openclaw-bridge/core/{role-provider-router, agent-context-loader, agent-session-recorder}.js`; `llm-adapter.complete()` takes a per-call provider override with role-level fallback. Config schema bumped `agent-config.json` → `phase34-agent-config-v2`.
  - **LM Studio is installed** (brew cask 0.4.16, `qwen/qwen3.5-9b` on disk, server `:1234` via a `:1235` proxy) but the model is **UNLOADED and not boot-persistent**; the analyst's LM-Studio route is staged in `role-provider-map` under `_recommended_after_install` for a future flip-back.
  - **Verified 2026-06-11:** an armed run had scout provider `= local` (0 fallbacks), analyst + synthesizer on claude-code, `SOUL.md` loaded, sessions recorded, `workflow.json` 5/5 steps completed (plugin contract intact), clean exit.
- **Nothing runs in Docker/containers.** There's a folder of container-security rules (`openclaw-bridge/execution/`) but the engine never uses it — workflows are plain Node processes. It's scaffolding for a future that hasn't been built.
- **Engine end-to-end: FIXED & PROVEN (2026-06-10).** It used to halt at a human-approval gate (`role-router.js`, `PHASE15_HUMAN_APPROVAL_REQUIRED`) no production code could satisfy. Now `scripts/run-workflow.js` has an opt-in **`--operator-approve`** flag (default OFF / fail-closed; gate unchanged for every other caller) that threads the operator's approval through to the gate, plus a packager EXDEV fix for running on the external volume. A real run completed 5/5 steps and exported an 88 KB report bundle (61 KB `report.md`, 196-row dataset, 219 citations). **Updated 2026-06-11:** `--operator-approve` is now **YubiKey-gated** (PIN + touch via `operator-approve-gate arm`; one-shot, TTL 300s, rotated token, fail-closed), and `scripts/run-workflow.sh` exports `NODE_EXTRA_CA_CERTS` (the mkcert CA) so the local TLS proxies are trusted. The Obsidian Command Center plugin now spawns the engine with `--operator-approve` plus that CA env. Tests: `tests/core/phase30-operator-approve.test.js`. Detail: [`THE-WHOLE-SYSTEM.md`](THE-WHOLE-SYSTEM.md) §0a.
- **The output is Obsidian notes**, stored under `My Digital Garden/OpenClaw/`. Two more bridges keep Obsidian reachable: `:8798` (the bridge) talks to `:27124` (Obsidian's Local REST API).
- **New (2026-06-12): stopped-trial ingestion + two new bundle deliverables.** A local fetcher (`openclaw-bridge/mcp/ctgov-supplemental/ctgov-supplemental.js`, NOT ToolUniverse) searches ClinicalTrials.gov API v2 for TERMINATED/WITHDRAWN/SUSPENDED trials in a condition and returns each trial's sponsor-stated stop reason (`whyStopped`) plus protocol change-history (version count + most-amended modules); it's routed into role prefetch through a new local-fetcher seam in `tool-prefetch.js` (`createToolPrefetch` `options.localFetchers`, tool `ctgov_stopped_trials`), and every record is NCT-traced. On a gate-PASSING mission the workflow engine builds two deterministic, no-LLM deliverables from those fetched records and seals them into the mission bundle (registered in `manifest.json` + `checksums.txt`): **`deliverables/citation-integrity.md`** — a graded (A/B/C/D, or F+BLOCKED on a retraction, N/A if nothing cited) provenance ledger rendered from the `citation_verification` block (`openclaw-bridge/monetization/integrity-rating.js`); and **`deliverables/graveyard-memo.md`** — a memo of prior terminated/withdrawn/suspended programs in the indication, each NCT-traced with the sponsor's stated stop reason (or an explicit "(none stated by sponsor)" — never invented), protocol churn, a resolvable `clinicaltrials.gov/study/<NCT>` link, and a LOW/MODERATE/HIGH protocol amendment-risk band (`openclaw-bridge/monetization/graveyard-memo.js`). Both memos are fully fail-soft and bounded — an absent fetcher, empty indication, or fetch error simply omits them and never blocks a passing report.

## 3. Citations — what's real, and the one real gap

**Real:** the engine *extracts* citation identifiers with regular expressions (`openclaw-bridge/core/citation-extractor.js`) and embeds them in the notes, and there are quality gates that check citation density before a report is considered done.

**Updated 2026-06-12 — a zero-fabrication CITATION-INTEGRITY layer now ships.** The engine no longer just extracts identifiers; it checks that the cited ones are *grounded in the source records actually retrieved at runtime*, and screens cited DOIs for retraction. What's now live:
- **Runtime grounding gate (report-level).** `agent-engine` persists `fetched_citation_ids` (the identifiers actually retrieved at runtime by tool-prefetch) plus a per-task `citation_verification` block; `buildPrompt` carries an ABSOLUTE-RULE "ZERO FABRICATION" clause (never invent a PMID/NCT/DOI — say "[no verifiable citation found]" instead). `workflow-engine.executeMissionStep` then runs `verifyReportCitations` (`openclaw-bridge/core/citation-gate.js`): every identifier cited in the assembled report is cross-checked against the union of runtime-fetched ids. A cited id is **grounded** if it was in fetched evidence, else **ungrounded** (likely model-introduced). The report **hard-fails / refuses to ship** (`PHASE30_CITATION_UNVERIFIED`) when the grounded ratio falls below `minGroundedCitationRatio` (`agent-config` default `0.34`); it writes `citation-verification.json` + `report-annotated.md` (surviving ungrounded cites annotated inline `[UNVERIFIED]`). The gate engages only when there IS fetched ground truth.
- **DOI retraction screen.** Each cited DOI is checked against Crossref `/works/{DOI}` (`openclaw-bridge/mcp/crossref-retraction/crossref-retraction.js`); a report citing ANY retracted paper hard-stops (`PHASE30_CITATION_RETRACTED`). Fail-soft: Crossref errors yield no retractions, so a network blip can never wrongly block a report.
- **DOI extraction fix.** The DOI regex now stops at non-DOI terminators and strips trailing sentence punctuation, so `]]` / `;` / `.` are no longer captured (which had deflated the grounded ratio and duplicated DOIs).

**Honest framing (the brand is zero-fabrication):** citations are now **grounded in the source records actually retrieved at runtime, and DOI retraction-screened (Crossref).** This is NOT the same as per-citation external re-resolution — *grounded ≠ independently re-resolved*.

**The remaining gap (still your only true product-quality hole):** there is still **no "resolver"** — nothing turns `PMID:12345678` into a clickable, verified `https://pubmed.ncbi.nlm.nih.gov/12345678` link, and nothing yet *independently re-resolves* each identifier against its live source database at delivery time. The grounding gate proves a cite came from retrieved evidence; it does not re-resolve it externally. Your marketing already promises that resolution ("Reproducibility Manifest… every PMID/NCT/ChEMBL/DOI checked against source databases at delivery time" — `03-platforms/datarade/vendor-application.md`). **Do not assert per-citation external re-resolution to a buyer until it's verified or built.**

> *(Recommendation — follow-up, not built in this pass):* build a deterministic resolver/validator step that (1) re-resolves every extracted identifier against its source API (NCBI E-utilities for PMID, ClinicalTrials.gov for NCT, ChEMBL for ChEMBL IDs, Crossref/Unpaywall for DOI), (2) emits clickable source links in the deliverable, and (3) writes the per-citation Reproducibility Manifest the sales copy already sells. This is the single highest-leverage engineering investment because citation-traceability *is* the product. (The grounding gate + retraction screen above are a partial down-payment on this, not a substitute for it.)

## 4. Built but NOT live (so you don't think these are working features)

| Capability | State |
|---|---|
| **Phase 31** — Research REST API, scheduled workflows, usage metering | Code written + 34/34 tests pass locally (`openclaw-bridge/bridge/research-api.js`). **Not deployed; serves no customers.** |
| **Phase 24** — Notion sync / newsletter publishing | Implemented but **disabled**; operator-gated, not in the research flow. |
| **Phase 25** — credential broker / delegated sessions | Implemented but **not active by default**. |
| Container-execution governance | Scaffold only; never invoked. |
| TrevNodus / InfraNodus graph viz | **Removed entirely** 2026-05-06. |

## 5. Where the money stands (channel reality)

| Channel | Reality (2026-06-10) |
|---|---|
| **Datarade** | Submitted 2026-05-11; onboarding call 2026-05-20; **DECLINED — "business not yet established."** Re-apply after you have an LLC approval + a couple of closed deals. No product rework needed. |
| **AWS Data Exchange** | **Seller APPROVED** (portal shows approved). Blocked at disbursement: adding a payment method errors *"account still being reviewed"*, so payouts can't be configured. **~34 days silent.** Escalation letter ready (`03-platforms/aws-data-exchange/correspondence-2026-05.md` §[6]). Account access set up (SSO + 2 YubiKeys). |
| **HuggingFace** | No gatekeeper — **not yet published.** Fastest path to a live, citable artifact. |
| **Snowflake (free listing)** | ~1-day approval — **not done.** |
| **Gumroad** | Signed up, **parked.** |

**Revenue: $0. Live listings: 0. Discovery calls / NDAs / signed deals: 0.** Tracking baseline: [`12-pipeline-tracking/kpis-end-of-month.md`](12-pipeline-tracking/kpis-end-of-month.md). Next moves: [`trevor-robey-inc Commercial Launch Playbook.md`](trevor-robey-inc%20Commercial%20Launch%20Playbook.md) → "REVISED 30-DAY PLAN."

## 6. Doc map — where to look for what

| You want… | Read |
|---|---|
| What products cost | [`OFFERINGS.md`](OFFERINGS.md) |
| Strategy, legal entity, attribution | [`REVENUE_PLAYBOOK.md`](REVENUE_PLAYBOOK.md) |
| What to do next (30-day plan) | [`trevor-robey-inc Commercial Launch Playbook.md`](trevor-robey-inc%20Commercial%20Launch%20Playbook.md) |
| Which connector does what | [`CONNECTOR-ALIGNMENT.md`](CONNECTOR-ALIGNMENT.md) |
| The full audit this came from | [`audit/business-reality-2026-06/00-audit-report.md`](audit/business-reality-2026-06/00-audit-report.md) |
| Engine internals (historical design) | [`../ARCHITECTURE.md`](../ARCHITECTURE.md) (read its 2026-06-10 correction banner first) |
