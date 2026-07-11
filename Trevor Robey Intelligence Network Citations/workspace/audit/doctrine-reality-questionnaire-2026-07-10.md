# Doctrine vs. Reality — Operator Questionnaire
> Generated 2026-07-10 by a six-dimension repo audit (engine gates, report policy, contracts/SLA,
> product scope, external claims, data coverage). Every item is traceable to a file:line.
> **Doctrine audited against:** never hallucinate; be completely honest about whether the databases
> returned hits (including reporting ZERO hits); reports drive clients' financial decisions;
> the product is really a custom research/report generator.

Answer inline under each question, then hand this file back for conversion into code/config/copy changes.

---

## ⚠️ Doctrine conflicts found

- **`citation-gate.js:95`** — `pass = fetchedIds.length===0 || x.total===0 || x.verified_ratio>=threshold`, documented as an intentional "safety invariant" at `citation-gate.js:12-15`. A run that fetched **zero** evidence, or a report that cites **nothing**, can never hard-fail the gate — directly contradicts doctrine #2/#3 (honest zero-hit reporting).
- **`config/workflow-templates/general-research-pack.json`** — the one template built for "custom research on any topic" has no `quality_audit` step and no ToolUniverse prefetch (`description: "...LLM-only (no ToolUniverse)."`), so it always hits the zero-fetch auto-pass above. It has `product_line: "research_packs"` wired into `config/monetization-map.json` with nothing in code blocking sale.
- **`openclaw-bridge/core/agent-engine.js:168-171,195`** — the anti-scaffolding-leak OUTPUT CONTRACT forbids "meta-commentary... **no data-quality notes**," which bans exactly the "we searched X and found nothing" sentence doctrine #2 requires.
- **`openclaw-bridge/distribution/datarade-format-adapter.js:66`** — hardcoded, unconditional listing string "No AI hallucination risk: all identifiers resolve in their source databases," emitted regardless of actual grounded ratio or whether the run fetched any evidence.
- **`workspace/collateral/catalog/product-catalog.md:3,94`**, `teasers/enterprise-data-teaser.md:25`, `one-pagers/{target-validation-pack,pharmacovigilance-report}.md:45-46` — "Zero Hallucination" / "excluded from the dataset" claims contradict actual behavior: ungrounded citations are inline-flagged `[UNVERIFIED]`, not excluded, and up to ~66% may ship this way.
- **`openclaw-bridge/monetization/integrity-rating.js:32-34`** — a report that fetched and cited nothing renders the same neutral "grade N/A — no extractable citations to verify" as a topic that legitimately has no citable content; the doctrine's required distinction ("we searched and found zero hits") is erased.
- **`product-catalog.md:14-69` + per-template `description`/`verification_tools` fields** — claim ChEMBL/PubChem/UniProt/RxNorm/DailyMed/EudraVigilance/WHO ICTRP/HPA/GARD/Orphanet/Monarch/OMIM/GDC coverage that no sold pipeline ever queries (`config/mission-templates.json` spawns only `scout/analyst/synthesizer` for all 6 sold templates; `verification_tools` is dead config never read by `workflow-engine.js:850-871`) — a coverage claim with no engine mechanism behind it.

## 🔴 Answer these five first

**Q1. Should a run with zero fetched evidence (or a report citing nothing) hard-fail/block delivery, rather than auto-pass the citation gate?**
*Why it matters:* This is the root-cause design decision behind nearly every other gap in this audit — it's the mechanism that lets a report with no live grounding ship as a normal "pass."
*Current reality:* `citation-gate.js:95`, `citation-gate.js:12-15` (explicit "safety invariant," not a bug); `tool_prefetch_zero_docs` (`tool-prefetch.js:285-292`) is log-only, read by nothing downstream.
*Unblocks:* (a) leave as-is, (b) surface the event into the manifest and force `BLOCK`/`DELIVER_WITH_FLAGS`, or (c) require an explicit "ZERO HITS" section whenever this occurs.

**Q9. Should `general-research-pack` — the only template flexible for "any topic," and the one with all three safeguards (prefetch, quality-audit, working citation gate) simultaneously absent — continue to be sold as-is, be explicitly relabeled as a lower-trust tier, be blocked from sale, or be re-engineered to feed real prefetch queries?**
*Why it matters:* This is the sharpest concrete instance of doctrine conflict found across all six audits, and it sits directly in the sold-product path (`product_line: "research_packs"`).
*Current reality:* `config/workflow-templates/general-research-pack.json` (no `quality_check` step, unlike all five other templates); CLAUDE.md's own usage example runs it on a non-biomedical topic ("AI governance"), contradicting the dossier's "all six templates are biomedical" claim.
*Unblocks:* sell-as-is-with-disclosure vs. add safeguards vs. restrict to internal/demo use.

**Q4. Does the OUTPUT CONTRACT's "no data-quality notes" ban need re-scoping to permit honest negative-finding statements?**
*Why it matters:* This is a direct code-level prohibition on the exact honesty behavior the operator doctrine demands.
*Current reality:* `agent-engine.js:168-171,195` bans "no data-quality notes... no pre-delivery self-audit" with no carve-out for genuine database non-results.
*Unblocks:* a prompt-wording fix exempting "explicit statements a named database returned zero results" vs. accepting negative findings currently have no sanctioned place in output.

**Q7. What should `minGroundedCitationRatio` actually be, and where should it live?**
*Why it matters:* This single hardcoded number determines how much of every shipped report may be ungrounded (currently up to ~66%) — it is the operative "how honest must this be" dial, and it's currently accidental (a fallback literal, not a deliberate policy value).
*Current reality:* `workflow-engine.js:250-251` hardcodes `0.34`; absent from `config/agent-config.json`; `citation-gate.js:91`'s own `0.5` default is unreachable dead code.
*Unblocks:* setting a deliberate, auditable, documented threshold and reconciling the two divergent defaults.

**Q15. Has any client already been sold and delivered a paid report ($2,500+) without a signed MSA/SOW/refund policy — and should direct sales pause until the contract stack is real?**
*Why it matters:* Clients pay for honest results to make real financial decisions (doctrine #3); marketing a "refund-backed" SLA (`OFFERINGS.md:31`) with zero enforceable contract behind it for the primary direct-sale product line is a live financial/legal exposure, not a documentation gap.
*Current reality:* `workspace/legal/nda-mutual-template.md` implies sales already happen ("send to every $2,500+ buyer post-purchase"); `08-contracts-legal/` and `15-first-sale-risk-mitigation/` are 100% 3-line placeholder stubs.
*Unblocks:* pause direct sales, retrofit the AWS DX refund language into a direct-sale addendum immediately, or accept current risk tolerance.

---

## A. Zero-evidence & negative findings

**Q1.** Should a run that fetches zero evidence (or a report that cites nothing) hard-fail/block delivery instead of auto-passing the citation gate?
*Why it matters:* doctrine #2/#3 require honest "we found nothing," but the gate's design lets zero-evidence runs ship with no citation floor at all.
*Current reality:* `citation-gate.js:95`, documented intentional at `citation-gate.js:12-15`; `tool_prefetch_zero_docs` (`tool-prefetch.js:285-292`) never read downstream.
*Unblocks:* leave as-is / surface into manifest + force BLOCK / require explicit "ZERO HITS" section.

**Q2.** Should a report citing zero identifiers skip the entire re-resolution/reproducibility-manifest layer, or should "0 citations" itself trigger an explicit BLOCK/flagged state?
*Why it matters:* a $9,950–$19,950 report could ship with zero verifiable identifiers and no delivery-decision record at all.
*Current reality:* `citation-gate.js:95`; `workflow-engine.js:332` (`if (cites.length > 0)` gates all of Slice 4 re-resolution).
*Unblocks:* mapping "0 citations" to an explicit BLOCK/N/A-but-flagged state instead of silently bypassing all downstream integrity machinery.

**Q3.** Should a genuine zero-hit prefetch result (queries ran, database returned nothing) inject the same explicit "DATA LIMITATION NOTICE" into the prompt that a prefetch *failure* already does?
*Why it matters:* the model currently can't distinguish "we asked PubMed and it said nothing exists" from "nobody asked PubMed."
*Current reality:* `agent-engine.js:369-403` (notice only on thrown `prefetchError`); a clean empty-array result triggers nothing beyond the internal log line.
*Unblocks:* adding a parallel "ZERO RESULTS NOTICE," and deciding whether it may survive into customer-facing text.

**Q4.** Does the OUTPUT CONTRACT's "no data-quality notes" ban need re-scoping to permit honest negative-finding statements?
*Why it matters:* as written it bans exactly the sentence doctrine #2 requires.
*Current reality:* `agent-engine.js:168-171,195`.
*Unblocks:* prompt-wording fix with an explicit honesty carve-out vs. status quo.

**Q5.** Should every mission template carry a deterministic, no-LLM "search coverage" ledger (per-database query→hit-count), and should the citation-integrity ledger's "N/A" grade be replaced with an explicit zero-hit statement rather than neutral wording?
*Why it matters:* the only guaranteed honest zero-hit statement today is ClinicalTrials.gov-specific (`graveyard-memo.js`); PubMed/ChEMBL/FAERS/Semantic Scholar zero-hit cases have no client-visible equivalent.
*Current reality:* `openclaw-bridge/monetization/graveyard-memo.js:22-25` (the one exception); `integrity-rating.js:32-34` (`cited===0` → generic "N/A").
*Unblocks:* a "Search Coverage" deliverable/section as a standard bundle artifact.

**Q6.** Should zero-hit-but-succeeded prefetch be treated as leniently as it currently is relative to an outright prefetch failure, given it's arguably the more common and more dangerous "tempted to use training memory" scenario?
*Why it matters:* doctrine #2 requires honesty about the system's own evidentiary state at every internal stage, not just the client-facing report.
*Current reality:* `agent-engine.js:390-401` only fires on the `catch` path.
*Unblocks:* closing the asymmetry as internal engine policy (ties to Q3).

## B. Thresholds & what may ship

**Q7.** What should `minGroundedCitationRatio` actually be, and where should it live?
*Why it matters:* hardcoded 0.34 in `workflow-engine.js`, diverging from `citation-gate.js`'s own unreachable 0.5 default; up to ~66% of citations can be model-introduced and still ship (inline-flagged).
*Current reality:* `workflow-engine.js:250-251`; absent from `config/agent-config.json`; `citation-gate.js:91`'s `0.5` default is dead code.
*Unblocks:* a deliberate, config-driven value and reconciled defaults.

**Q8.** What should `max_unchecked_ratio` be for the live re-resolution DELIVER/DELIVER_WITH_FLAGS decision — is 0% tolerance the intended policy?
*Why it matters:* a single network hiccup at delivery time currently demotes an otherwise fully-grounded report to `DELIVER_WITH_FLAGS`.
*Current reality:* `reproducibility-manifest.js:28-30` (default 0); no caller overrides it (`workflow-engine.js:340-356`).
*Unblocks:* explicit configuration/documentation of this claim-strength policy.

**Q9.** Should `general-research-pack` continue to be sold as-is, be relabeled as an explicitly lower-trust "LLM-synthesis-only" tier, be blocked from sale, or be re-engineered to feed real prefetch queries?
*Why it matters:* three independent safeguards are simultaneously absent for the one template built for arbitrary topics — the sharpest doctrine conflict found.
*Current reality:* `config/workflow-templates/general-research-pack.json` (no `quality_check` step); wired into `config/monetization-map.json`'s `product_line: "research_packs"`; CLAUDE.md's own example runs it non-biomedically.
*Unblocks:* disclosure-and-sell / add safeguards / restrict to internal use.

**Q10.** Is the current `auto_approve: true` mechanical `approve` step (no human review) the intended posture for every SKU, including the $9,950–$19,950 tiers, or should any tier require explicit human-typed approval before `export`?
*Why it matters:* this is the last checkpoint before the client-facing ZIP is produced; today it isn't a review gate at all.
*Current reality:* `workflow-engine.js:555-570`; all six templates set `"auto_approve": true`.
*Unblocks:* adding a human-approval gate for high-price tiers if desired.

## C. Report content & unverified claims

**Q11.** Is "confidence" (the quality_audit citation-density score) an acceptable client-facing term given what it measures, or should it be renamed — and should both the density score and `grounded_ratio` be surfaced side by side?
*Why it matters:* the score is pure citation-pattern density (`workflow-engine.js:651-656`), independent of whether identifiers were verified, yet is labeled "Quality confidence score" to buyers (`deliverable-packager.js:336`).
*Current reality:* two separate, differently-named, differently-computed metrics exist; only `grounded_ratio` (citation-gate.js) ties to actual verification.
*Unblocks:* renaming the density metric and/or dual-surfacing both values.

**Q12.** Should the quality_audit gate's citation check be upgraded from a citation-*shape* regex match to something cross-referencing fetched evidence, or documented as explicitly separate from the truth-based citation gate?
*Why it matters:* a report can pass `minVerifiedCitations` (hardcoded default 5) purely on citation-*looking* strings, independent of grounding.
*Current reality:* `workflow-engine.js:624-711,631,640` (regex patterns `NCT\d{8}`, `PMID:\d+`, DOI).
*Unblocks:* unifying the two gates or explicitly documenting them as independent, differently-scoped checks.

## D. Client promises, SLA & liability

**Q13.** Is the refund-backed "Citation-Audit SLA" intended to cover direct engagements (Investor Pre-Mortem, Failed Trial Archaeology), or only AWS Data Exchange subscriptions?
*Why it matters:* the only defined SLA mechanics are AWS-DX-scoped; the primary revenue line is sold direct with zero governing contract.
*Current reality:* `data-subscription-agreement.md:1-17`, `refund-policy.md:8-14` define scope as AWS DX only; `08-contracts-legal/`, `15-first-sale-risk-mitigation/` are unwritten placeholders.
*Unblocks:* drafting a real MSA/SOW/refund policy before the next direct-sale invoice.

**Q14.** Is a citation shipped inline-flagged `[UNVERIFIED]` a "Citation Defect" under the AWS DX refund-policy §2 definition, or does the flag exempt it — does the current threshold-with-inline-flag design have real refund-SLA teeth?
*Why it matters:* determines whether the SLA has bite for the exact failure mode doctrine worries about most.
*Current reality:* `refund-policy.md` §2 (line 27) is silent on flag-exemption (only the retraction sub-clause conditions on "not flagged").
*Unblocks:* an explicit clause on flagged-citation treatment, or acknowledging the 0.34 threshold as live refund-exposure liability.

**Q15.** Has any client already been sold a paid report ($2,500+) without a signed MSA/SOW/refund policy, and should direct sales pause until the contract stack is real?
*Why it matters:* marketing a "refund-backed" SLA with no underlying enforceable contract is a live liability gap.
*Current reality:* `workspace/legal/nda-mutual-template.md` implies sales already happen; `08-contracts-legal/`, `15-first-sale-risk-mitigation/` are placeholder stubs.
*Unblocks:* pause / retrofit AWS DX language into a direct-sale addendum / accept risk.

**Q16.** What is the intended liability posture when a client makes a financial/investment decision based on a claim that shipped `[UNVERIFIED]`, given the DSA disclaims *clinical* but not *investment* decision-making?
*Why it matters:* the actual named buyer persona (biotech hedge funds, VC diligence) is investment decision-making — the one use case the current disclaimer doesn't cover.
*Current reality:* `data-subscription-agreement.md` §6 (line 77) bars use as sole/primary basis for "clinical" decisions only.
*Unblocks:* an investment-specific disclaimer clause, mirrored into the not-yet-written direct-sale contract.

**Q17.** Should the refund-backed "Citation-Audit SLA" claim continue running in `OFFERINGS.md`/collateral before `refund-policy.md` clears counsel review?
*Why it matters:* the marketing claim asserts a binding remedy while the defining document is explicitly marked DRAFT with placeholder percentages.
*Current reality:* `OFFERINGS.md:31`; `refund-policy.md:70`.
*Unblocks:* gate the claim behind counsel sign-off, or accept current exposure.

**Q18.** Should the "5 outbound quality gates" referenced in `10-quality-pipeline/{pre-publication-checklist-5-yes-no,ragas-faithfulness-judge/two-layer-audit}.md` ("Layer 1 ≥95% verified," "manual 10% spot-check 100% pass") be implemented as real engine gates, or pulled/marked aspirational since no such gate exists?
*Why it matters:* reads as an operating commitment discoverable by a counterparty in diligence or dispute, backed by nothing in code.
*Current reality:* these files are 3-line "Placeholder" stubs; no Ragas integration or manual-spot-check process exists anywhere in `openclaw-bridge/`.
*Unblocks:* build before referencing, or remove/mark as roadmap.

**Q19.** Which turnaround figure (72 hours / 5 business days / 5–10 business days) is the actual contractual SLA per SKU, and is it measured or a target?
*Why it matters:* prospects see conflicting delivery promises for the same/adjacent SKU.
*Current reality:* three figures appear across `sample-full-deliverable.md:227,235`, `email-academic-researcher.md:9,13`, `OFFERINGS.md:74`; only engine compute-time baselines exist as measured data.
*Unblocks:* standardize to one figure or an explicit per-tier table; decide guarantee vs. target framing.

**Q20.** Should the `DELIVER`/`DELIVER_WITH_FLAGS`/`BLOCK` reproducibility-manifest decision be tied to the refund-policy's "Citation Defect" severity tiers, or remain an internal-only artifact?
*Why it matters:* this is the mechanism that could actually operationalize the AWS DX refund tiers (Q14), but currently has no documented tie to any client-facing remedy.
*Current reality:* `reproducibility-manifest.js:18,74-82`; not referenced in `OFFERINGS.md`, `refund-policy.md`, or any collateral found.
*Unblocks:* wiring the manifest into refund-tier language once the direct-sale contract (Q13/Q15) exists.

## E. Product scope, ICP & pain points

**Q21.** Which of the seven priced SKUs are actually meant to be generated end-to-end by the engine, vs. hand-assembled by the operator from engine output?
*Why it matters:* only `pharmacovigilance-report.json` name-matches a priced SKU; the other five sold offerings have no coded correspondence to any of the 6 templates.
*Current reality:* `config/workflow-templates/` (6 templates) vs. 7 SKUs in `OFFERINGS.md`.
*Unblocks:* build/name templates per SKU, disclose manual assembly, or narrow sold SKUs to what's automatable today.

**Q22.** Is "KOL primary research" (the $19,950 Investor Pre-Mortem differentiator) a manual/human deliverable, or expected to be automated via an expert-network connector?
*Why it matters:* no code, connector, or documented fulfillment process exists for this component of the highest-priced SKU.
*Current reality:* zero KOL/expert-network tooling; independently flagged as "the clearest revenue-side gap" in `docs/mcp-connector-gap-analysis-2026-07-10.md:101-110`.
*Unblocks:* license a connector, formalize a manual SOP, or drop the promise until one exists.

**Q23.** Is "IP runway" (also part of Investor Pre-Mortem) meant to rely on opportunistic SearXNG web search, or does it require a structured patent/FTO database (Orange Book, Espacenet)?
*Why it matters:* patent analysis is a core promised risk-dossier component; a web-search hit is a categorically weaker evidence base.
*Current reality:* only two patent-site domains in the SearXNG allowlist (`gate.config.js:39-40`); no structured connector.
*Unblocks:* invest in a patent connector, or explicitly scope "IP runway" to SearXNG-surfaced results.

**Q24.** For SKUs whose promised deliverable format the engine cannot produce (PDF, DOCX, Tableau workbook, HTML filterable table, interactive knowledge-graph export) — will the operator hand-produce those formats, or should offering copy be revised?
*Why it matters:* buyers of e.g. the $4,950 Trial Design Benchmark Pack are promised "PDF + Tableau workbook"; a raw zip is a discoverable promise gap.
*Current reality:* `export-release.js:17-129` supports only `zip`/`folder` of Markdown/CSV/JSON; the interactive-graph capability (InfraNodus) was removed 2026-05-06.
*Unblocks:* build converters, contract out finishing work, or rewrite offering-ladder descriptions.

**Q25.** Is "Academic & Clinical Researchers" a live target ICP needing its own SKU, or leftover planning copy?
*Why it matters:* the only ICP in the ladder with a stated pain point/WTP but no matching offer.
*Current reality:* `OFFERINGS.md:27`, `TREVOR_ROBEY_INC_AGENTS_DOSSIER.md:231` cite $30K–$62.5K/grant with no corresponding SKU or template.
*Unblocks:* design a grant-cycle SKU, or clean up the ICP table.

**Q26.** What is the actual scope boundary — biomedical-only, or "any vertical" as stated ambition — and should `general-research-pack`'s non-biomedical usage example be treated as in-scope or corrected?
*Why it matters:* every other stack component is biomedical-specific; the stated ambition sits unreconciled next to it.
*Current reality:* `THE-WHOLE-SYSTEM.md:44` ("Niche = medical research; ambition = any vertical"), no decision record.
*Unblocks:* keep `general-research-pack` as a built-to-standard cross-vertical offering (ties to Q9), or restrict to biomedical only.

## F. External claims & marketplace copy

**Q27.** Which claim standard should govern `workspace/collateral/` going forward — the ban already written into the intake-form governance doc, or something else?
*Why it matters:* the repo already bans "zero hallucinations"/"100% citation verification" internally, but only in one artifact.
*Current reality:* `claude-design-client-intake-form-prompt-balanced.md:11,23-24` bans it; `catalog/product-catalog.md:3,94`, `teasers/enterprise-data-teaser.md:25`, multiple `one-pagers/`/`outbound/` files, `sample-full-deliverable.md:235` still use it.
*Unblocks:* a mechanical find/replace sweep across the canonical collateral tree.

**Q28.** Should `02-product-packs/` (a duplicate, un-rebranded, unswept tree still carrying "OpenClaw"/`openclaw.io` branding and the same absolute claims) be deleted, redirected, or reconciled?
*Why it matters:* contradicts `_continuity/CONTINUITY.md:449`'s claim the E1 sweep already made this content honest — it didn't.
*Current reality:* `02-product-packs/enterprise-deep-dive/enterprise-data-teaser.md`, `target-validation-onepager.md:45`, `product-catalog.md` diff from `workspace/collateral/` only in branding.
*Unblocks:* extend the sweep here too, or archive/remove the tree.

**Q29.** Which landing-page claim is actually live at trevorobeyinc.com — "grounded, not re-resolved" or "per-citation re-resolved with a Reproducibility Manifest"?
*Why it matters:* materially different technical/legal claims; if the stronger claim is live without go-ahead, that's an unauthorized-deploy question.
*Current reality:* `01-brand-system/landing-page/index.html:470` vs. `workspace/collateral/landing-page/index.html:470` diverge; `_continuity/CONTINUITY.md:124-128` marks the stronger version "queued, NOT deployed" as of 2026-07-08.
*Unblocks:* operator confirmation of deploy status; canonical repo copy determination.

**Q30.** Should the static "N+ verified citations per report" figures (135+/180+/200+/289+/150+) be replaced with measured ranges, "varies by topic" language, or explicit aspirational labeling?
*Why it matters:* precise buyer-facing quantitative claims with no traceable measurement basis; a shortfall is a falsifiable overclaim.
*Current reality:* no aggregation mechanism found in `openclaw-bridge/`; traces only to `REVENUE_PLAYBOOK.md:307,497-499` planning targets.
*Unblocks:* instrument the pipeline to report actual counts, or soften the language.

**Q31.** What should replace "1.0 Quality Confidence Score (deterministic)" as the public-facing quality metric, given no code computes a numeric `1.0`?
*Why it matters:* implies precision that doesn't exist; the already-shipped A/B/C/D grade is more honest.
*Current reality:* appears across `02-product-packs/`, `workspace/collateral/one-pagers/`, `samples/`, gumroad, and outbound email templates; the only matching code is a schema field description (`deliverable-packager.js:336`), not a computed value.
*Unblocks:* swap for the real A/B/C/D grade, or define what "1.0" means.

**Q32.** Should the "Public Hallucination Audit v1 (100 questions, 5 systems)" Brand Commitment be built before further reference, or removed from `OFFERINGS.md`/`product-catalog.md`?
*Why it matters:* presented as a completed, reviewable artifact; it doesn't exist.
*Current reality:* `OFFERINGS.md:34`, `02-product-packs/product-catalog.md:125` assert it; `14-due-diligence-checklist/05-hallucination-audit.md` = "Placeholder. To be filled in."
*Unblocks:* commission the audit, or pull the claim.

**Q33.** Should the hardcoded "No AI hallucination risk" Datarade listing line be removed or made conditional on real grounding data?
*Why it matters:* an unconditional marketing guarantee the engine's own gate logic can't substantiate.
*Current reality:* `datarade-format-adapter.js:66` (fixed literal); `:32` also hardcodes biomedical categories for every listing regardless of topic.
*Unblocks:* hotfix before any real Datarade listing goes live.

## G. Data coverage & licensing

**Q34.** Is the product-catalog/template claim of ChEMBL, PubChem, UniProt, RxNorm, DailyMed, EudraVigilance, WHO ICTRP, HPA, GARD, Orphanet, Monarch, OMIM, and GDC coverage current capability or unreconciled roadmap copy?
*Why it matters:* every sold SKU's catalog/template metadata names 2–5 databases per product never actually queried — only PubMed, Semantic Scholar, ClinicalTrials.gov, EuropePMC, FAERS, and an OpenTargets drug-ID lookup are reachable.
*Current reality:* `config/mission-templates.json` spawns only `scout/analyst/synthesizer` for all 6 sold templates; `verification_tools` is dead config (`workflow-engine.js:850-871`); `product-catalog.md:14-69`.
*Unblocks:* correct catalog copy, or wire the specialized "deep" mission templates in.

**Q35.** Should the specialized roles (`literature_reviewer`, `molecular_profiler`, `safety_signal_detector`, `quality_auditor`, `report_generator`, `competitive_intel_analyst`) and their "wired" connectors — reachable by no sold product — be wired in, removed as dead config, or left as-is with catalog corrected?
*Why it matters:* CLAUDE.md's "6 specialized agent roles" narrative describes a capability no sold workflow reaches.
*Current reality:* confirmed dead in all 6 sold pipelines (ties to Q34).
*Unblocks:* engineering priority decision vs. documentation-only correction.

**Q36.** Should `scripts/audit-connector-coverage.js` be extended to check reachability transitively through `mission-templates.json`'s spawned_roles, rather than only diffing registry ↔ tool-prefetch-map?
*Why it matters:* the current audit passes cleanly while the deeper gap (Q34) persists undetected.
*Current reality:* `scripts/audit-connector-coverage.js:16-19` diffs only two of at least four relevant layers.
*Unblocks:* invest in a stronger drift-detection audit, or rely on manual review.

**Q37.** Should the AWS-DX-only full-text DrugBank content scan (`assertShippable`) also run on the primary manual-ZIP deliverable path (currently citation-type-only)?
*Why it matters:* the primary $9,950–$19,950 SKUs ship via manual ZIP, not AWS DX; a bare prose "DrugBank" mention without a typed accession ID is currently uncaught on that path.
*Current reality:* `deliverable-packager.js:284` (citation-type scan only) vs. `aws-data-exchange-format-adapter.js:83` (fuller schema+text scan, AWS-DX-only).
*Unblocks:* add full-text scanning to the primary path as defense-in-depth, or accept current scope.

**Q38.** What is the required timeline/owner for filling in the five placeholder per-source license docs and resolving the pending ChEMBL ShareAlike counsel opinion, given SOW-preparers are instructed to copy these verbatim into every buyer-facing SOW?
*Why it matters:* SOWs may currently cite an incomplete, placeholder license register.
*Current reality:* 5 of 6 `09-source-licenses/*.md` files are one-line placeholders; `chembl-share-alike-counsel-pending.md` = "counsel opinion still pending."
*Unblocks:* interim language for SOWs going out today, and a counsel-engagement timeline.

---

## ✅ IMPLEMENTATION LOG — operator decisions on Q1/Q4/Q7/Q9/Q15 (2026-07-10)

The operator answered the five priority questions; the never-hallucinate / honest-about-zero-hits
doctrine was translated into code + config + prompt. **Verified:** `citation-gate` + `integrity`
+ `extractor` (36 pass), `phase30-workflow-engine` + `reproducibility-manifest` + `tool-prefetch`
(11 pass), `phase30-workflow-schema` + `phase29-mcp` (51 pass), `verify-phase30-policy.sh` PASSED.
Nothing committed (needs YubiKey) and nothing deployed (engine code, not the live site).

**Q1 — DONE (root fix).** `citation-gate.js#verifyReportCitations` now returns a **three-state
verdict** instead of a silent boolean: `PASS` / `UNVERIFIED` / `INSUFFICIENT_EVIDENCE` (zero runtime
evidence fetched — was the auto-pass hole) / `NO_CITATIONS` (evidence fetched, nothing cited). Only
`PASS` is shippable. Honors an `evidenceRequired` flag (default `true`; no template opts out today).
`workflow-engine.js` maps the verdict to distinct block codes — `PHASE30_CITATION_INSUFFICIENT_EVIDENCE`
and `PHASE30_CITATION_NONE` join the existing `..._UNVERIFIED` / `..._RETRACTED` — and persists
`verdict` into `citation-verification.json`. The old `fetchedIds.length === 0 || x.total === 0`
auto-pass is deleted.

**Q7 — DONE.** `minGroundedCitationRatio` added to `config/agent-config.json` = **0.75** (the B-grade
floor). `workflow-engine.js` reads it **fail-closed** — missing/invalid config → the strict shared
`DEFAULT_MIN_GROUNDED_RATIO` (0.75, exported from `citation-gate.js`) + a `min_grounded_ratio_unconfigured`
warning, never the old lax `0.34`. The dead `0.5` default in `citation-gate.js` and the hardcoded
`0.34` in `workflow-engine.js` are reconciled to the one exported constant. Test pins both the
constant (0.75) and the config value (0.75), and proves a 0.667 run now fails under the default.

**Q4 — DONE.** `agent-engine.js` OUTPUT CONTRACT re-scoped: the ban now targets only self-referential
process-meta (confidence self-scores, restated scaffolding, empty "quality: high" headers). Added a
**HONESTY DUTY** that overrides the anti-echo rule — a zero/limited-result database response is a
FINDING that MUST be preserved, and the `DATA LIMITATION NOTICE` / `ZERO-RESULTS` banner is explicitly
exempted from the "don't reproduce banners" clause. The closing seal was updated to match.

**Q9 — PARTIAL.** The false "LLM-only (no ToolUniverse)" description in `general-research-pack.json`
is corrected, and it's now marked *not for sale as a general/non-biomedical product*. Grounding
safety falls out of Q1 automatically (a non-biomedical topic → zero evidence → `INSUFFICIENT_EVIDENCE`
→ BLOCK). **Staged:** adding an explicit `quality_audit` step to the template pipeline.

**Q33 (bonus) — DONE.** Removed the indefensible "No AI hallucination risk" absolute claim from
`datarade-format-adapter.js`; replaced with an honest citation-integrity-gated statement.

**Q15 — DEFERRED TO OPERATOR (not code).** Pre-revenue: gate the FIRST paid deliverable, don't pause
building/outbound. The contract stack (MSA, SOW, refund addendum, reliance disclaimer + liability
cap, NDA) is **attorney territory — not drafted here.** One fact for the operator to confirm: no money
has changed hands yet.

### ✅ DONE (2026-07-10, second pass)
1. **Doc-truth sweep — COMPLETE (22 docs).** Ran as an 18-agent workflow + self-healing consistency
   critic. Current-behavior docs rewritten to the multi-state / 0.75-fail-closed / new-error-code
   truth: `THE-WHOLE-SYSTEM.md`, `README.md`, `REVENUE_PLAYBOOK.md`, `TREVOR_ROBEY_INC_AGENTS_DOSSIER.md`,
   `ARCHITECTURAL_BLUEPRINT.md`, `ENGINE-CODEBASE-MAP.md`, `trevor-robey-inc Commercial Launch Playbook.md`,
   `openclaw-bridge/docs/runtime-core-architecture.md`, `docs/{phase15-multi-agent-topology,failure-modes,phase18-agent-spawner,mcp-error-codes,WORKFLOW_CATALOG,phase14-agent-engine}.md`,
   `tasks/{lessons,todo}.md`, and the customer-facing `03-platforms/gumroad/README.md` + client prompt
   `claude-design-…-balanced.md`. `docs/mcp-error-codes.md` gained the two new codes. Dated records
   (`CHANGELOG.md`, `product-strategy/novel-cost-cutting-brief-2026-06-11.md`) were **annotated** with
   `_(superseded 2026-07-10…)_` notes, not rewritten (history preserved). **Intentionally left frozen:**
   the `audit/business-reality-2026-06/*` snapshots and this questionnaire — dated point-in-time
   records that were accurate when written. Independent grep confirms no un-annotated current-behavior
   `0.34` / "engages only when there IS fetched ground truth" remains outside those frozen snapshots.
2. **Lint regression — FIXED.** All 5 `new Date()`/`Date.now()` sites routed through `time-provider.js`
   (`workflow-engine.js` ×2, `role-router.js`, `operator-approve-gate.js`, `citation-reresolver.js`);
   `scripts/lint-restricted-globals.sh` now PASSES. 54 touched-file tests green. Bonus: timestamps are
   now honored by the deterministic-time test hooks.

### 🟡 STILL STAGED
3. **Q5 — deterministic Search-Coverage ledger:** render an authoritative honest-zero deliverable
   from the prefetch record (like `graveyard-memo.js`), so a blocked run still ships a truthful
   "these databases returned N hits" artifact instead of only erroring.
4. **Q9 quality_audit step** for `general-research-pack` (above).
5. **Remaining questionnaire items** Q2–Q3, Q5–Q6, Q8, Q10–Q14, Q16–Q38.
