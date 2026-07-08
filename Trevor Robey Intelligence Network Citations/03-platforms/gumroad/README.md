# Gumroad — Trevor Robey, INC. storefront

**Legal entity**: Trevor Robey Intelligence Network Citations LLC (filed at CA SOS 2026-05-06; receipt B20260217250). Wordmark: "Trevor Robey, INC." where INC = Intelligence Network Citations.
**Status**: live, two products published, affiliate program active, storefront profile section deployed.
**Storefront URL**: https://trevorinc.gumroad.com
**Seller account email**: trevor@trevorobeyinc.com (Zoho, SPF/DKIM/DMARC PASS)
**Commission**: flat 10% to Gumroad on paid sales, weekly payouts to personal bank (switch to Trevor Robey Intelligence Network Citations LLC business account once LLC banking active post-approval)

---

## Live products

| Product | URL | Price | Status |
|---|---|---|---|
| Pharmacovigilance Signal Synthesis — ICI Teaser | https://trevorinc.gumroad.com/l/pv-ici-teaser | $0+ pay-what-you-want ($5 suggested) | ✅ Published |
| Pharmacovigilance Safety Report — Standard Pack | https://trevorinc.gumroad.com/l/pharmacovigilance-standard | $2,500 | ✅ Published |

## Affiliate program

- **Signup link** (anyone can self-enroll): https://trevorinc.gumroad.com/affiliates
- **Commission**: 20% of $2,500 sale ($500 per referred buyer)
- **Enabled product**: Pharmacovigilance Safety Report — Standard Pack only
- **Gumroad-Affiliate-Program opt-in**: ON (other Gumroad creators can promote at the default 10% rate)

## Folder layout

```
gumroad/
├── README.md                              ← this file
├── products/
│   ├── pv-ici-teaser/                     ← free teaser product
│   │   ├── OpenClaw-Pharmacovigilance-Teaser.pdf  ← actual file uploaded to Gumroad
│   │   ├── teaser-source.html             ← source HTML used to render the PDF
│   │   └── teaser-source.md               ← source markdown of the 2-page synthesis
│   └── pharmacovigilance-standard/        ← $2,500 paid pack
│       └── sample-full-deliverable.md     ← 48-page redacted full sample (post-NDA reference)
├── assets/
│   └── covers/                            ← 1280×720 cover images (manual drag-drop into Gumroad)
│       ├── pv-ici-teaser-cover.png
│       └── pharmacovigilance-standard-cover.png
└── deliverables/                          ← finished per-buyer packs ready to ship
    └── _workflow-output → /Users/trevorrobey/OpenClaw-Research-Agents/workspace/research-output/
                                            ↑ symlink to OpenClaw native output (read-only, browse-only)
```

## Buyer fulfillment workflow (post-purchase)

1. Sale notification arrives at trevor@trevorobeyinc.com (auto-tagged "Gumroad" in Zoho).
2. Operator replies using template at `/Users/trevorrobey/OpenClaw-Research-Agents/workspace/templates/first-order-reply.md` — requests topic + scope, attaches Common Paper Mutual NDA from `/Users/trevorrobey/OpenClaw-Research-Agents/workspace/legal/CommonPaper-Mutual-NDA-v2.pdf`.
3. After signed NDA returned, fire OpenClaw workflow: `cd /Users/trevorrobey/OpenClaw-Research-Agents && node scripts/run-workflow.js general-research-pack "<buyer topic>"`. Output lands in `OpenClaw-Research-Agents/workspace/research-output/<workflow-id>/` — visible from this folder via `deliverables/_workflow-output` symlink.
4. Run citation validator: `python OpenClaw-Research-Agents/workspace/scripts/citation_validator.py <pack>.md --strict > <pack>-manifest.json`
5. Run PHI/PII screen: `bash OpenClaw-Research-Agents/workspace/scripts/screen_phi.sh <pack>.pdf`
6. **When pack passes both gates and is ready to ship**, copy the bundle into this folder for archival:
   ```
   cp -r OpenClaw-Research-Agents/workspace/research-output/<workflow-id> \
         /Users/trevorrobey/TrevClaw-Obsidianodus/trevor-robey-inc/03-platforms/gumroad/deliverables/<YYYY-MM-DD>_<buyer-entity>/
   ```
7. Email the deliverable + Reproducibility Manifest from trevor@trevorobeyinc.com.

> The shipped bundle now also includes `deliverables/citation-integrity.md` (graded provenance ledger) and, when prior terminated/withdrawn/suspended programs exist in the indication, `deliverables/graveyard-memo.md` (stop-reason + protocol amendment-risk memo). Both are registered in the bundle `manifest.json` and sealed in `checksums.txt`. See "Engine-side citation integrity" below.

## Engine-side citation integrity

Before a report reaches step 6, the OpenClaw engine itself enforces a zero-fabrication citation layer (this is in addition to the operator's `citation_validator.py` run in step 4):

- **Grounding.** Every report citation is checked against the union of identifiers (PMID/NCT/DOI) actually retrieved at runtime. A cited id is "grounded" if it was present in fetched evidence, otherwise "ungrounded" (likely model-introduced). The report **hard-fails (`PHASE30_CITATION_UNVERIFIED`)** when the grounded ratio falls below the configured floor (`minGroundedCitationRatio`, default 0.34); surviving ungrounded cites are annotated inline `[UNVERIFIED]`. The gate engages only when there is fetched ground truth.
- **Retraction screen.** Each cited DOI is checked against Crossref. A report citing any retracted paper **hard-stops (`PHASE30_CITATION_RETRACTED`)**. Fail-soft: a Crossref error yields no retractions, so a network blip can never wrongly block a report.
- **Provenance ledger.** `deliverables/citation-integrity.md` renders a graded ledger (A/B/C/D from the grounded ratio; F + "BLOCKED" on any retraction; N/A if nothing cited) — the report's audit-trail spine.
- **Graveyard memo + amendment-risk.** On a gate-passing mission the engine retrieves prior TERMINATED/WITHDRAWN/SUSPENDED trials in the indication (ClinicalTrials.gov), each NCT-traced, and renders `deliverables/graveyard-memo.md` deterministically: the sponsor's stated stop reason (or an explicit "(none stated by sponsor)" — never invented), protocol churn, a resolvable `clinicaltrials.gov/study/<NCT>` link, and a LOW/MODERATE/HIGH protocol amendment-risk band. Fully fail-soft — an empty indication or fetch error simply omits it.

Citations in shipped reports are **grounded in the source records actually retrieved at runtime + DOI retraction-screened (Crossref)**. They are NOT independently re-resolved against each citation's live source database.

## Pipeline-output rule

The OpenClaw workflow's native output path is `OpenClaw-Research-Agents/workspace/research-output/`. **Do not modify the pipeline scripts to change that path** — multiple things depend on it (audit logs, plugin tracker, vault-note generator). Instead:

- Browse all workflow runs from inside this folder via `deliverables/_workflow-output/`.
- After a pack ships to a buyer, copy a snapshot into `deliverables/<YYYY-MM-DD>_<buyer-entity>/` for archival under the Gumroad business unit.

## Related cross-references

| Topic | Location |
|---|---|
| Product pack definition (sources, methodology, citations) | `../../02-product-packs/pharmacovigilance/` |
| Source license register | `../../09-source-licenses/` |
| Pricing benchmarks | `../../04-pricing-benchmarks/` |
| Quality pipeline (validator + Presidio) | `../../10-quality-pipeline/` + `OpenClaw-Research-Agents/workspace/scripts/` |
| Buyer-reply email + NDA template | `OpenClaw-Research-Agents/workspace/templates/` + `OpenClaw-Research-Agents/workspace/legal/` |
| Commercial Launch Playbook (full) | `../../OpenClaw Commercial Launch Playbook.md` |
