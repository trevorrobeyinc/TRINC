# Business Reality Audit — Trevor Robey, INC. (2026-06-10)

> **What this is (2026-06-10).** A ground-truth audit of the whole business — the OpenClaw research engine, the Obsidian citation pipeline, the Claude Desktop/Code connectors, the brand, and the go-to-market state — done because the operator's mental model had drifted from what the repository actually contains and runs. Method: three parallel read-only repository sweeps + one architecture/plan spot-check + live mailbox verification through the Zoho and Gmail MCP connectors. Every claim below cites a path or a verifiable source.
>
> **Namespace note.** This folder (`audit/business-reality-2026-06/`) is deliberately separate from the existing `audit/` clean-room IP-provenance files (`baseline-provenance.json`, `clean-room-derivative-notice.md`, the `evidence/phaseN/` tree). Those are a different kind of audit; nothing here modifies them.

Canonical living docs produced from this audit: [`../../SYSTEM-REALITY.md`](../../SYSTEM-REALITY.md) (how the business actually works today) and [`../../CONNECTOR-ALIGNMENT.md`](../../CONNECTOR-ALIGNMENT.md) (which connector serves which business function). The change-of-record for the edits this audit triggered is in [`01-alignment-actions.md`](01-alignment-actions.md).

---

## 1. Headline

The **engine is real and works** for its intended narrow path; the **business is pre-revenue with zero live listings**; and the **drift was mostly in the documentation and in the operator's memory of the marketplace channels** — not in the running configuration. There are no misconfigured or rogue connectors. The gaps that matter are (a) docs that describe an aspirational architecture the config doesn't implement, (b) a marketplace narrative that needed reconciling against the actual dated record, and (c) one genuine product-quality gap (no citation *resolver*).

The operator's recollection — "rejected by Datarade, heard nothing from AWS" — is **substantially correct**. The repo's dated record confirms it; an earlier reading that said "Datarade was never submitted" was wrong and is corrected below.

---

## 2. How the engine actually works (verified)

```
Obsidian Copilot chat
   → openclaw-command-center plugin  (Obsidian in-process; spawns MCP bridge :8799)
   → scripts/run-workflow.js          (Phase 30 workflow engine; node child_process)
   → agent roles call the LLM         (claude-code CLI = default for ALL roles)
   → ToolUniverse prefetch            (2,116 biomedical tools, vendor/tooluniverse v1.1.10)
   → citation-extractor.js            (regex: PMID / NCT / ChEMBL / DOI / UniProt / DrugBank / CID)
   → citation-integrity gate          (report-level: grounded-ratio cross-check + Crossref DOI retraction screen)
   → 6 vault notes generated          → /Volumes/ExtraCurricular/My Digital Garden/OpenClaw/{template}/{date}/
   → Medical-Zettelkasten-MCP         (stdio, post-workflow graph analysis)
```

> **Update (2026-06-12) — citation-integrity layer shipped.** A zero-fabrication
> CITATION-INTEGRITY layer + two cost-avoidance deliverables landed after this audit and
> materially change Sections 2 and 3 below (the "no citation resolver" finding is now
> substantially addressed — see §3). All shipped, unit-tested (316/316), and live-verified on
> an armed heart-failure run (6/6 workflow steps, grounded ratio 1.0, 8 stopped trials
> retrieved, integrity grade A, both new deliverables sealed in the release bundle). Mechanics:
> - **Citation gate** (`openclaw-bridge/core/citation-gate.js`, `agent-engine.js`,
>   `workflow-engine.js`). `agent-engine` persists `fetched_citation_ids` (identifiers actually
>   retrieved at runtime by tool-prefetch) + a per-task `citation_verification` block;
>   `buildPrompt` carries an ABSOLUTE-RULE "ZERO FABRICATION" clause (never invent a
>   PMID/NCT/DOI; say `[no verifiable citation found]`). `executeMissionStep` runs a
>   REPORT-LEVEL gate (`verifyReportCitations`) cross-checking every cited identifier against the
>   union of runtime-fetched ids — a cite is *grounded* if present in fetched evidence, else
>   *ungrounded* (likely model-introduced). HARD-FAILS (`PHASE30_CITATION_UNVERIFIED`) when the
>   grounded ratio falls below `minGroundedCitationRatio` (agent-config default 0.34); writes
>   `citation-verification.json` + `report-annotated.md`, annotates surviving ungrounded cites
>   inline `[UNVERIFIED]`. Engages only when fetched ground truth exists.
> - **Retraction screen** (`openclaw-bridge/mcp/crossref-retraction/crossref-retraction.js`).
>   Each cited DOI is checked against Crossref `/works/{DOI}` (retraction relation / update-to
>   type); any retracted paper HARD-STOPS (`PHASE30_CITATION_RETRACTED`). Fail-soft: Crossref
>   errors yield no retractions, so a network blip can never wrongly block a report.
> - **Stop-reason corpora ingestion** (`openclaw-bridge/mcp/ctgov-supplemental/ctgov-supplemental.js`):
>   a LOCAL fetcher (new `localFetchers` seam in `tool-prefetch.js`, tool_name
>   `ctgov_stopped_trials`) that searches ClinicalTrials.gov API v2 for
>   TERMINATED/WITHDRAWN/SUSPENDED trials in a condition, returning each trial's `whyStopped`
>   text plus protocol change-history (version count + most-amended modules); each record is
>   NCT-traced (grounded cite).
> - **New deliverables.** `deliverables/citation-integrity.md` (graded provenance ledger A/B/C/D
>   from the grounded ratio; F/"BLOCKED" on any retraction; N/A if nothing cited —
>   `monetization/integrity-rating.js`) and `deliverables/graveyard-memo.md` + protocol
>   amendment-risk band LOW/MODERATE/HIGH (`monetization/graveyard-memo.js`, rendered
>   DETERMINISTICALLY from fetched records, no LLM) ship in every mission bundle, registered in
>   `manifest.json` and sealed in `checksums.txt`.
>
> **Honesty note:** citations are *grounded in the source records actually retrieved at runtime,
> plus DOI retraction-screened (Crossref)*. This is NOT per-citation external re-resolution
> against a live source database — grounded != re-resolved; that resolver pass is still not built
> (see §3).

Supporting services (all running, Obsidian/launchd-lifecycle): obsidian-bridge `:8798` (HTTPS, mkcert) ↔ Obsidian Local REST API `:27124`; TLS proxies for Miyo `:8743`, Qdrant `:6433`, LM Studio `:1235`, Ollama `:11435`.

**Provider truth** (`config/agent-config.json:3` → `"defaultProvider": "claude-code"`; `config/llm-providers.json:44` → `lm-studio` is only `claude-code`'s `fallbackProvider`; the Ollama-equivalent `local` provider is `enabled: false`). Phase 33 (`CLAUDE.md:128`) made Claude Code the **primary** provider, replacing LM Studio. There is **no per-role Scout/Analyst/Synthesizer routing**; routing is per-template via `provider_preference` (`CLAUDE.md:173`), and in practice everything runs through claude-code.

**Phase status** (`CLAUDE.md:128`): Phases 1–33 implemented. Phase 29 (ToolUniverse) active, 58/58 tests. Phase 30 (workflow engine) active, 6 templates. Phase 31 (Enterprise Delivery: Research REST API + scheduled workflows + usage metering) implemented and locally tested — `openclaw-bridge/bridge/research-api.js` (17.8 KB), `tests/core/phase31-research-api.test.js`, `tests/core/phase31-workflow-scheduler.test.js`, "34/34 tests passing" (`CLAUDE.md:66`) — **but not externally deployed**; nothing serves customers.

---

## 3. Real / Mock / Phantom / Dead inventory

| State | Component | Evidence |
|---|---|---|
| **REAL** | Phase 30 workflow engine + 6 templates | `scripts/run-workflow.js`, `config/workflow-templates/*.json` |
| **REAL** | claude-code provider (primary) | `openclaw-bridge/core/llm-adapter.js` `callClaudeCode()`; `config/agent-config.json:3` |
| **REAL** | ToolUniverse MCP (2,116 tools) | `vendor/tooluniverse/` (v1.1.10, Apache-2.0, Harvard); 58/58 tests |
| **REAL** | Citation **extraction** (regex) + quality gates | `openclaw-bridge/core/citation-extractor.js` |
| **REAL** *(2026-06-12)* | Citation-integrity **gate** (grounded-ratio cross-check; hard-fails `PHASE30_CITATION_UNVERIFIED` below `minGroundedCitationRatio` 0.34) | `openclaw-bridge/core/citation-gate.js`, `workflow-engine.js` `verifyReportCitations` |
| **REAL** *(2026-06-12)* | Crossref DOI **retraction screen** (hard-stop `PHASE30_CITATION_RETRACTED`; fail-soft) | `openclaw-bridge/mcp/crossref-retraction/crossref-retraction.js` |
| **REAL** *(2026-06-12)* | Stopped-trial / change-history local fetcher (CT.gov v2; NCT-traced) | `openclaw-bridge/mcp/ctgov-supplemental/ctgov-supplemental.js`; `tool-prefetch.js` `localFetchers` |
| **REAL** *(2026-06-12)* | Deliverables: Citation Integrity ledger + Graveyard Memo & amendment-risk (deterministic, no LLM) | `openclaw-bridge/monetization/{integrity-rating,graveyard-memo}.js`; bundle `deliverables/{citation-integrity,graveyard-memo}.md` |
| **REAL** | Vault note generation (6 notes) | `Claude/obsidian-openclaw-command-center/src/notes/note-generator.ts` |
| **REAL** | Zettelkasten MCP (stdio) | `Claude/Medical-Zettelkasten-MCP/` |
| **MOCK** | `mock` LLM provider (CI/tests) | `llm-adapter.js buildMockResponse()`; not default |
| **PHANTOM** | Container-execution governance | `openclaw-bridge/execution/` — policy scaffold, never invoked; workflows are node child_process, not containers |
| **PHANTOM** | Ollama / `local` provider routing | configured but `enabled:false`; proxy `:11435` live but engine never routes to it |
| **DISABLED** | Phase 24 (Notion/newsletter), Phase 25 (credential broker) | implemented; operator-gated; not enabled in `research.search`/`research.getPaper` (`README.md:527-528`) |
| **NOT DEPLOYED** | Phase 31 Research REST API + scheduler | implemented + tested locally; no hosted instance |
| **DEAD** | TrevNodus / InfraNodus | fully removed 2026-05-06 (`ARCHITECTURE.md:7`) |
| **DEAD** | OpenClaw gateway `:18789`, backend emulator `:8789` | removed 2026-04-27 / 2026-04-11 |

### Live-run finding (2026-06-10): engine blocked at the approval gate → RESOLVED same day
A real `general-research-pack` run halted at `PHASE15_HUMAN_APPROVAL_REQUIRED` (`openclaw-bridge/core/role-router.js`): every research role's `execute_task` requires `context.operatorApproved === true`, set **only in `tests/core/phase15-lane-queue.test.js`** — never in the CLI/runtime/plugin (the Phase-30 tests pass only because they mock `spawnMission`). **FIXED 2026-06-10:** opt-in `--operator-approve` flag on `run-workflow.js` threads the operator approval through to the gate (default OFF / fail-closed; gate logic unchanged), plus an EXDEV copy-fallback in `deliverable-packager.js` for the external-volume case; regression tests in `tests/core/phase30-operator-approve.test.js`. A run then completed 5/5 steps and exported an 88 KB citation-traced report bundle (196-row dataset, 219 citations). **Quality gap as of this run (now substantially addressed 2026-06-12):** tool-prefetch returned near-empty results (`doc_count` 0/1/2), so citations were model-generated, not grounded in fetched evidence — see the resolver gap below. The 2026-06-12 citation-integrity layer closes most of this: the report-level gate now hard-fails when the grounded ratio (cited ids present in runtime-fetched evidence) falls below 0.34, and screens cited DOIs for Crossref retractions. A subsequent armed heart-failure run hit grounded ratio 1.0 / integrity grade A.

### The citation gap: substantially narrowed 2026-06-12 (grounding shipped; per-citation external re-resolution still not built)
`citation-extractor.js` finds identifiers and the note generator embeds them as wikilinks (`[[PMID:12345678]]`), which resolve only to other vault notes. As of 2026-06-12 the engine now **grounds** every cited identifier against the source records actually retrieved at runtime (the report-level gate hard-fails below `minGroundedCitationRatio` 0.34) and **screens cited DOIs for Crossref retractions** (hard-stop on any retracted paper), and ships a graded Citation Integrity / provenance ledger as `deliverables/citation-integrity.md`. The graveyard-memo deliverable also emits resolvable `clinicaltrials.gov/study/<NCT>` links for stopped trials.

**Still not built** (be precise to a buyer): there is **no per-citation external re-resolution** that independently re-resolves/verifies each `PMID:12345678` against its live source database, nor a general second pass that turns every identifier into a live clickable source URL (the ChEMBL/NCT/DOI equivalents) inside the prose deliverables. *Grounded != re-resolved:* a cite being grounded means it was present in the runtime-fetched evidence, not that the engine round-tripped it back out to the source DB. Separately, the Datarade/compliance copy claims build-time citation **validation** "via NCBI E-utilities, Crossref, and Unpaywall" (`03-platforms/datarade/vendor-application.md:103`) and a per-delivery "Reproducibility Manifest"; the 2026-06-12 layer adds Crossref retraction screening but is NOT the same as that full E-utilities/Unpaywall validator, so whether the marketed validator is wired in remains **unconfirmed — verify before asserting it to a buyer**. Recommended follow-up (still not built): a deterministic resolver/validator pass that (1) emits clickable source URLs for all identifier types in deliverables and (2) produces the Reproducibility Manifest the marketing already promises. This remains the highest-value engineering investment because it is the product's core differentiator.

---

## 4. Channel reality (dated, reconciled)

| Channel | Verified state | Source |
|---|---|---|
| **Datarade** | Intake **SUBMITTED 2026-05-11** (HubSpot UUID `f2e8abb3-7742-4ffe-aa8e-00e5f0f0d1dc`); onboarding call **2026-05-20 10:30 AM**; **DECLINED — "business not yet established."** Re-apply after establishment proof (LLC approval + closed direct-sale engagements); no product rework needed. | `03-platforms/datarade/onboarding-call-notes.md`; Launch Playbook STATUS UPDATE row 1 + PROGRESS LOG 2026-05-23 |
| **AWS Data Exchange / Marketplace** | Seller app **REJECTED 2026-05-03** ("proposed solution does not currently meet these criteria"); AWS re-outreach offered; 2 operator emails (~05-09, ~05-11); **follow-up #3 drafted 2026-05-23**; escalation threshold **2026-06-02 passed**. AWS **account access established 2026-05-26** (acct `833390816446`, IAM Identity Center SSO + two YubiKey 5 FIPS FIDO2 keys, ReadOnly for AI / Admin for operator). | `03-platforms/aws-data-exchange/correspondence-2026-05.md`, `account-access.md`; Launch Playbook PROGRESS LOGs 2026-05-23/26/28 |
| **HuggingFace** | Unblocked, zero gate — **not pushed live.** | Launch Playbook STATUS UPDATE row 3 |
| **Snowflake (free listing)** | ~1-day approval path — **not done.** | Launch Playbook STATUS UPDATE row 5 |
| **Gumroad** | Signed up, **parked** by operator decision 2026-05-04. | Launch Playbook STATUS UPDATE row 4 |

### Mailbox verification finding (new, 2026-06-10)
The AWS correspondence file (`correspondence-2026-05.md`) records the thread but every message body is a `_paste_` placeholder — **the actual email texts were never filed**. A live search of **both** the Zoho business mailbox (`trevor@trevorobeyinc.com`, via the zoho-mail MCP) **and** the connected personal Gmail returned **no AWS Data Exchange / Marketplace seller-qualification emails at all** (only unrelated Amazon retail order and AWS-sponsored-newsletter mail). The Datarade mailbox trail is present (welcome/verify/nurture emails from `marketplace@datarade.ai` in Zoho), but **no AWS seller thread exists in either inbox I can reach.** Consequence: the AWS appeal is **unverified** — before sending follow-up #3 the operator must confirm where the thread actually lives (likely the AWS console case history, or `trevorrobeyinc@gmail.com` which is a confirmed alias on the Zoho account but may have its own Google inbox). This is why the revised plan makes AWS **verify-first**.

---

## 5. Brand & connectors

**Brand is internally consistent.** Legal name *Trevor Robey Intelligence Network Citations LLC*, wordmark *Trevor Robey, INC.* (INC = Intelligence Network Citations backronym), domain `trevorobeyinc.com`, email `trevor@trevorobeyinc.com` (Zoho; verified live, alias `trevorrobeyinc@gmail.com`), tagline *"Every claim, sourced. Every risk, named. In days, not weeks."* — all align post the 2026-04-30 rename (`README.brand.md`, `OFFERINGS.md`, `REVENUE_PLAYBOOK.md:7-23`). One known cosmetic item already flagged in-repo: a "typo'd contact email" in legacy collateral (`03-platforms/datarade/onboarding-call-notes.md:33,54`, `go-live-checklist.md` gate #1) — not fixed here to avoid guessing; it remains on the operator's checklist.

**Connectors: documentation gap, not a configuration problem.** No rogue, duplicate, or dead-path MCP registrations were found. The real issue is that nothing maps the **three distinct connector layers** to business functions, and they are easily conflated:
1. **claude.ai-level connectors** (PubMed, ChEMBL, ClinicalTrials, ICD-10, NPI, bioRxiv, Scholar Gateway, Tavily, Hugging Face, Figma, Gmail, Google Drive/Calendar, Zoho Mail; plus unauthenticated: AdisInsight, BioRender, DataHub, Owkin, Synthesize Bio) — **chat-supervisory only; NOT reachable from the `run-workflow.js` subprocess engine.**
2. **Subprocess connectors** the engine actually uses (`config/connector-registry.json`: chembl, clinicaltrials-gov, pubmed, europepmc, faers, opentargets, scholar-gateway, arxiv).
3. **Infra/ops connectors** (`~/.claude.json`: falcon, github, cdp-pipe, zoho-mail) — security, repo, browser, mailbox; not product data sources.

The five **unauthenticated** claude.ai connectors are a loose end (recommend: authenticate the ones with a clear research use — Owkin, Synthesize Bio — or stop listing them). AWS console work is done through the Claude-for-Chrome extension in a dedicated AWS-only profile (out of scope for product data flow). Full mapping: [`../../CONNECTOR-ALIGNMENT.md`](../../CONNECTOR-ALIGNMENT.md).

---

## 6. Where earlier readings were wrong (kept for honesty)

- **"Datarade never submitted."** False. It was submitted 2026-05-11 and declined after a 2026-05-20 call. The error came from trusting a stale "Submit by 2026-04-28" header in `vendor-application.md` that was never updated after the real submission. Corrected in this pass.
- **"Pricing tier files present current contradictory tiers."** Overstated. `04-pricing-benchmarks/tier-*.md` already carry prominent 2026-04-30 "Superseded / retired" banners pointing to `OFFERINGS.md`. Only light cross-linking, if anything, is warranted.
- **"Phase 31 is just planned."** The vault `README.md` says so, but the code and tests exist and `CLAUDE.md` says implemented. README is the stale doc; reconciled to "implemented + locally tested, not externally deployed."

---

## 7. Revenue reality

$0 revenue. 0 discovery calls, 0 NDAs, 0 signed deals, 0 live listings — `12-pipeline-tracking/*.md` were empty placeholders (now seeded with a dated zero-baseline). The original 30-day launch plan (Apr 27 – May 22) expired ~19 days before this audit with its marketplace items blocked. The path forward is the **direct-sale motion** the playbook itself names as primary; that is also the "establishment" proof Datarade demanded. See the revised plan in [`../../trevor-robey-inc Commercial Launch Playbook.md`](../../trevor-robey-inc%20Commercial%20Launch%20Playbook.md).
