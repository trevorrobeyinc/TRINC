# Status — Trevor Robey, INC.

> One page: where the business stands and what moves it next. **Rewritten 2026-11-04 as a money-first plan**
> after the 26 older "TR-INC Biz" sessions were folded into one hub session and archived. Three independent planners
> drafted the plan (fastest first dollar, recurring revenue, risk-first); skeptics then checked its claims
> against the web and the repo. The evidence is in the 2026-11-04 entry on
> [`_continuity/CONTINUITY.md`](_continuity/CONTINUITY.md). The previous version of this page is
> `git show cf1c6b0:STATUS.md`; the last full handoff is
> [`_continuity/handoffs/HANDOFF-2026-10-21.md`](_continuity/handoffs/HANDOFF-2026-10-21.md).

## Where it stands (2026-11-04)

| | |
|---|---|
| Revenue | **$0.** Nothing listed; no calls, NDAs or deals (`12-pipeline-tracking/` is all zero). |
| Entity | LLC, CA No. B20260217250, approved 2026-06-18. **Behind on filings:** EIN not applied for; LLC-12 (due 2026-09-16) and the $800 FTB 3522 (due 2026-08-15) are past due. Suspension follows notices, not the due date, and contracts a suspended LLC makes are *voidable* by the other party (R&TC §23304.1). Check the live status read-only on bizfile (B20260217250). |
| Workspace | 🔴 Card declined; the suspension date **(2026-11-02) has passed** and no fix is recorded. Workspace carries trevor@ and `aws@`, the AWS root email. Google reactivates "within a few hours" only after a working **primary** payment method is set; a one-off payment can fall back into suspension. |
| Money rails | **AWS Marketplace payout works** (ACH ending 262; "Publish paid and free products" since 2026-07-22). It is the only way to receive money today. **There is no direct-sale rail:** no business bank account (blocked on the EIN), and the Stripe/invoicing and banking folders are placeholders. |
| Paper | **Nothing signable for direct sales.** All 15 `08-contracts-legal/` files and the `common-paper/` notes are placeholders. `workspace/legal/CommonPaper-Mutual-NDA-v2.pdf` (a saved 404 web page, not an NDA) was removed 2026-11-04. `nda-mutual-template.md:35` names a non-existent "Trevor Robey Inc. d/b/a OpenClaw…" under Delaware law. The refund policy behind the "refund-backed" SLA is empty. AWS sales use AWS's standard DSA (decided). |
| Proven SKUs | **Trial Design Benchmark Pack** ($4,950): 3 gate-PASS runs, all NSCLC; run #6 `workflow-6cc2f82c` is 45/45 VERIFIED. **Failed Trial Archaeology** ($14,950): heart failure `workflow-72f0c288`, 47/47. The Pack fills a 20-of-M cohort in all 13 indications checked; passing the gate outside NSCLC is unproven. Investor Pre-Mortem has no fulfilment path. Neither proven SKU has a packaged sample. |
| Feed | Trial Graveyard Feed: 7,373 rows staged (`refresh-2026-10-21/`, untracked), not listed. **Not worth paying for as built.** Its live columns (NCT id, title, status, phase, stop reason, link) are all free in AACT and the CT.gov API, and 5 paid columns are empty or "UNKNOWN" on every row (CT.gov history 403 since 2026-10-08). Feed tests 38/38. |
| Engine | Works. Engine suite 1352/1355 (2026-11-01, unchanged). The business lane is built but has never run live. |
| Repo | Today's signed commits (`d208f2d` engine, `8f238ac` legal, `b48f9d1` sales, `4d8eff6` status, `25f1c93` backup record) were pushed to GitHub on 2026-11-04 at 15:28; later local commits wait for the next operator push. Backup cut 2026-11-04: `TRINC-FULL-backup-20261104-1519` (HEAD `4d8eff6`) in `~/Documents` and on ExtraCurricular, plus the business-Drive copy `TRINC/Monorepo/` (the only snapshot there since the two older ones were trashed 2026-11-04). The research-memory transformers port is merged; on the Mac it still needs `npm ci --ignore-scripts && npm run build` and the integration test (board, 2026-11-02). |

## The plan, in order

The owner is in brackets. Prices come only from `OFFERINGS.md`; the feed numbers are your 2026-10-20 ones, still on hold.

1. **[you] Today, 45–60 min: get business mail back.** Sign in to admin.google.com as trevor@ → Billing. Decide on AI Expanded Access, set a working card as **primary**, pay the balance, and add a backup card (`Trevor Robey Intelligence Network Citations/03-platforms/google-workspace/google-workspace.md` §8). Then test it:
   - Mail from outside reaches trevor@ and aws@.
   - Mail from trevor@ to an outside Gmail shows SPF, DKIM and DMARC passing.

   Check the AWS console's own notifications, because mail to aws@ since 11-02 may be lost, and read the two AWS "[ACTION REQUIRED]" emails. Skim today's DMARC reports and stay at `p=quarantine`. ~~Finally, pull in your terminal~~ (done 2026-11-04).
2. **[you] Tomorrow, about 2 h in one sitting: good standing.** Follow `00-business-formation/compliance/filing-walkthrough-2026-10.md`:
   - EIN online (free). Save the CP 575 outside the repo.
   - FTB 3522 by Web Pay, $800, entity ID `20260217250`.
   - LLC-12 on bizfile, $20 (login in Bitwarden under `sos.ca.gov`). If the login fails, request the PIN letter and keep going.

   Then apply for the business bank account. Also ask AWS to change the Marketplace legal name from "Trevor Robey Inc" to the LLC (likely through Partner Central support). That runs in parallel; it doesn't block anything.
3. **[Claude drafts, you decide] Days 1–3: the minimum signable paper.**
   - A real mutual NDA naming the LLC, replacing the 404 file and the template.
   - A refund policy that defines the Citation-Audit SLA. A material defect is a cited identifier that is ungrounded, retracted or UNRESOLVED at delivery. The remedy is correct-and-redeliver first, then a refund capped at the fee.
   - A one-page order form/SOW for the two proven SKUs.
   - A W-9 and vendor-onboarding checklist.

   **Decided by you, 2026-11-04:**
   - **Governing law:** California.
   - **Refunds, fix first:** the buyer claims within 30 days of delivery; we correct and redeliver within 15 business days; if it's still defective, a refund capped at the fee paid, as the sole remedy.
   - **Payment:** Net 30 after delivery. The cash arrives about a month after delivery, and the business bank account must exist before the first invoice.
   - **Counsel:** deferred for lack of budget. Book the recommended hour, before a first signature, once funds allow; until then every document says it hasn't been reviewed by counsel, and no ChEMBL identifiers go in paid deliverables.

   Drafting started 2026-11-04. **Decision sheet (2026-11-06):** `Trevor Robey Intelligence Network Citations/08-contracts-legal/decision-sheet-2026-11.md` turns the drafts' 132 `[DECIDE]` markers into 41 decisions, each listed once with my pick and every place it appears. Answer "all picks, except …" and Claude applies the answers.
4. **[Claude builds, you approve] Days 1–3: two samples and one honesty redline.**
   - Benchmark sample from run #6 (`workflow-6cc2f82c`). Never use `workflow-21d82407`: its memo prints "Amendment-risk: HIGH".
   - Archaeology sample from `workflow-72f0c288`, with its amendment section removed (it prints "MODERATE").
   - One redline across the OFFERINGS copy, the landing page, the four outbound templates and the feed listing: remove amendment-risk claims, unsourced statistics and unfulfillable SKUs; add a CAN-SPAM opt-out line and a postal address; qualify the Pre-Mortem SLA.

   You deploy the landing page.

   **Drafted 2026-11-04 and committed the same day (`8f238ac` paper, checklist and AWS request; `b48f9d1` samples and offer sheets):** both samples, both one-page offer sheets, the NDA cover page (Common Paper MNDA v1.0), the Order Form/SOW (Common Paper PSA v1.1), the refund policy (Exhibit A), payment terms (Exhibit B), a vendor-onboarding checklist and the AWS legal-name request. No banned terms; canon prices only. They carry open `[DECIDE]` markers, and every one is your call. **Found while drafting, and it changes the order:**
   - **Benchmark Pack: fixed and proven (2026-11-04, `d208f2d`).** Run #6's narrative guessed sponsors from drug names because the registry fields never reached it. The engine fix (tests 1,360/1,360) was proven the same day by **run #7, ALS** (`workflow-e5947dccdce0e06fde1884b5`):
     - gate PASS 38/38; delivery 38/38 VERIFIED; DELIVER;
     - all 20 sponsors, the 20-of-64 cohort and the phase and sponsor-class counts match the registry.

     That's the Pack's first pass outside NSCLC. **The sample is rebuilt from run #7** (`workspace/collateral/samples/trial-design-benchmark-sample-als.md`, plus the updated offer sheet). Every one of its 30 NCTs traces to run #7, and every table row carries the registry sponsor. The run #6 sample moved to `.archive/superseded-samples-2026-11-04/`.
   - **Still not buyer-ready: run #7's full `report.md`.** The table and the gate are solid, but the model-written prose still has errors no check catches:
     - two **confirmed author misattributions**: `report.md:146-147` credit Feldman et al. (Lancet 2022) to "Chio et al." and Brown & Al-Chalabi (NEJM 2017) to "Paganoni et al.". The DOIs are real and resolve, so the gate and re-resolution passed them;
     - "14 of 20 use ALSFRS-R", where the registry shows 9;
     - an estimated-enrollment, still-recruiting trial listed among the "largest completed-accrual" trials;
     - leftover internal markup (task ids, "Doc 5", `[[…]]`, "ToolUniverse" as the registry source).

     **Guard built (2026-11-04, `d208f2d`):** delivery now compares the author and year written beside each DOI/PMID with the Crossref/NCBI record. A mismatch flags the report (DELIVER_WITH_FLAGS, your decision: flag plus an inline `[ATTRIBUTION MISMATCH: registry lists …]` mark, never block). Tests 1,394/1,394; adversarially reviewed. Run live over the 7 real reports, it found **6 of the 7 papers in run #7's reference table credited to the wrong authors**, with no false alarm elsewhere. **Root cause fixed too (2026-11-04, `d208f2d`):** the model now sees each paper's real authors, and the prompt and role instructions say to name authors only from that line. Prior-run bylines are withheld from context. Tests 1,412/1,412. Run #7's report itself is unchanged, so send the sample, not that report. The next real Benchmark run is the proof that the bylines come out right.
   - **Failed Trial Archaeology, as OFFERINGS describes it, isn't produced by the engine:** no phase filter, no mechanism filter, no pattern-matrix generator, and no template. Hold its sheet. Feed v1.1 (coded stop reasons plus phase and interventions) is the building block that makes it real.
   - **Client confidentiality:** vault publish and research-memory ingest are on for every run (`config/vault-publish.json`), so a client's run would land in the vault and the shared memory. Customer runs need an off switch before the first client run.
   - **Proof-run ZIPs carry internal files** (marketing copy that overclaims, Datarade packs). Build each buyer ZIP from the deliverable files only, with fresh checksums.
5. **[Claude lists and drafts, you send] Week 2: 40 trigger-matched emails.** Claude builds a list of 30–40 small and mid-size sponsors and boutique firms from read-only CT.gov triggers: a Phase 3 registered in roughly the last 6 months, or a Phase 2 completed in roughly the last 12. It targets indications that match a sample, or whose cohort fills with already-run trials (ALS, IPF). Claude drafts each email. You find the person, send 8–10 a day from trevor@, follow up once on day 4, and log everything in `12-pipeline-tracking/`. Skip the giants for now.
6. **[both] On the first yes: quote, get paid, deliver.**
   - Before you quote, Claude checks read-only that the buyer's indication fills a full cohort.
   - Then: NDA if asked, order form, invoice from the business account, payment before the run. Once the feed is public, an AWS private offer is an alternative and uses the working AWS rail.
   - You arm `openclaw`. Claude dispatches through the door and waits for `post_run_done`, citation PASS and zero UNRESOLVED. You deliver.
7. **[Claude builds about 3 days, you list] In parallel: Feed v1.1, then list it.**

   First, lift the 2026-10-21 deferral and fill in a one-page decision sheet: breast cancer complete; which products; your 10-20 prices or not; durations; auto-renew (cannot be changed later).

   Then Claude builds:
   - **Honest columns:** drop the five dead ones, stop the 403 call, take a stable sorted sample, raise maxRecords.
   - **New fields from the same CT.gov call:** lead sponsor and its class, dates, enrollment and its type, conditions, interventions, hasResults.
   - **A coded stop reason:** a versioned, rule-based `stop_reason_category`, with the sponsor's own words kept as evidence. A 12-rule draft already covers 78.8% of the rows that state a reason.
   - **Truthful listing and runbook copy:** CT.gov attribution, the processing date, a description of every modification, and the Partner Central console.

   You upload and Finalize, but only after steps 1–2. Every free-sample verification request names a company and a use case, which makes it a lead for step 5.
8. **[both] Week 3 onward, only when there's a signal.**
   - A monthly delta file (newly stopped trials), which is what makes subscribers renew.
   - Time-limited ADX data grants for interested accounts.
   - Check whether a feed-tied "Assessments" professional-services listing passes AWS review. It would carry private offers at OFFERINGS prices, at a 0.5% fee, or 0% in an offer set with a paid feed.
   - Sponsor-to-ticker mapping, only if a buyer asks. For reference, Ozmosi BEAM sells ticker-mapped CT.gov data on ADX at $8,500/month.

   The first business-lane run and the Retainer wait until after the first biomedical sale.

## Not doing now (by decision or by this plan)

- Leading with Investor Pre-Mortem, or selling Conference Synthesis, the Patient Brief, Cross-Silo, the Scoped Research Pack or Pharmacovigilance.
- Parquet or the Enterprise tier; ticker mapping before a buyer asks; any scheduler or new service (the infra freeze holds until the first AWS product ships); turning on a social channel before the first sale.
- The `scripts/distribute.js` ADX adapter, the retrieval_qa dataset path, Datarade (deferred 2026-10-24), Outlier or Mindrift (rejected).
- Working around the CT.gov history 403, or selling the amendment-risk band.
- Taking money into a personal account, or quoting any price not in `OFFERINGS.md`.
- Absorbing the Security Bridge (`:8801`); GAM7 (declined).

## Also open (housekeeping, after steps 1–2)

- Chrome Enterprise Premium trial ends around 2026-11-13: keep or cancel.
- Workspace housekeeping (about 10 min): turn off the Strayer Outlook forward, remove the GAM7 leftovers, check trevor@'s recovery email.
- Re-seal the `gmail` MCP client (Security Everything lane).
- Bless obsidianwatch with Obsidian open. Run `node scripts/render-business-context.js --apply` after the next commit.
- Dependency work on the Mac: `ops/security/dependency-audit-2026-10.md`, "On the Mac, in this order". Also decide on a Semantic Scholar API key and register the free Census and EIA keys.
- `ops/paths.env`; the CI decision; the stale `trinc-business:compliance-calendar` skill; revoking the InfraNodus keys. The Zoho and security leftovers are on the Security Everything board (2026-11-04 entry).
- Qdrant gRPC `127.0.0.1:6334` is plaintext with no proxy and is missing from the root `CLAUDE.md` ports table (see Security Everything `docs/mac-listener-inventory-2026-10-24.md`).
