# First-order reply email — OpenClaw $2,500 Pharmacovigilance Standard Pack

**When to use**: a buyer just paid via Gumroad. Order confirmation hits trevor@trevorobeyinc.com. You reply to that thread within 1 business day with the message below.

**Attach**:
1. `/Users/trevorrobey/OpenClaw-Research-Agents/workspace/legal/CommonPaper-Mutual-NDA-v2.pdf`
2. (Optional) A 1-page sample Reproducibility Manifest from a prior pack as evidence of your validation methodology.

---

## Subject line

`Welcome to OpenClaw — next steps for your Pharmacovigilance Safety Report`

## Body (paste from `> Hi {{first_name}},` to the signature)

> Hi {{first_name}},
>
> Thanks for ordering the Pharmacovigilance Safety Report — Standard Pack from OpenClaw Research Intelligence (Trevor Robey Inc.). I'll have your deliverable in your inbox within 72 hours of NDA execution.
>
> **Three quick things I need from you to get started:**
>
> 1. **Topic and scope.** Reply with: (a) the drug class, single agent, indication, or adverse-event signal you want covered; (b) any specific scope constraints — geography, time window, comparator drugs, regulatory jurisdiction; (c) any sources you want explicitly excluded (e.g., a competitor's database).
>
> 2. **Mutual NDA.** Attached is the Common Paper Mutual NDA (v2.0) — the standard B2B template used widely in tech and life sciences. Sign the cover page and return; I'll countersign and send back. Both signatures within 1 business day per the agreement. I'll send my entity address for the cover page in the next message.
>
> 3. **Delivery format.** Standard ships as: signed PDF + Parquet/CSV appendix + Reproducibility Manifest (JSON) attached to email. If you need Snowflake share, AWS S3 pre-signed URL, or BigQuery shared dataset, that's the Custom Intelligence Mission tier — I can quote the upgrade.
>
> **What's included in the Standard pack:**
> - 48-page synthesized deliverable on your specified topic
> - 135+ verified citations resolving to PMID, NCT, AEMS report ID, RxCUI, ChEMBL ID, PubChem CID, DOI
> - Disproportionality analysis (ROR / PRR) with confidence intervals where applicable
> - Source License Register documenting every database used
> - **Reproducibility Manifest** — every cited identifier is automatically validated against its source database at delivery time (NCBI E-utilities, ClinicalTrials.gov v2, RxNav, ChEMBL REST, PubChem PUG, UniProt REST, Crossref, Unpaywall) and the JSON manifest ships with the pack
> - Microsoft Presidio PHI/PII screening attestation (HIPAA Safe Harbor 18-PHI-type recognizers, score threshold 0.6)
> - Structured Parquet/CSV appendix
>
> **Sources used**: AEMS (formerly FAERS, daily updates since Aug 2025; US public domain), ClinicalTrials.gov, PubMed (metadata + PMC OA full-text), RxNorm, OpenFDA, UniProt, ChEMBL (derived analyses with version cited), DailyMed. DrugBank is NOT included — separate licensed pack available on request.
>
> **Post-delivery**: 14 days of clarification questions are included via email at no additional charge.
>
> Looking forward to scoping the topic with you. Reply when convenient with items 1 and 2 above and I'll move into production.
>
> Best,
> Trevor Robey
> Trevor Robey Inc. d/b/a OpenClaw Research Intelligence
> https://trevorobeyinc.com
> trevor@trevorobeyinc.com

---

## Variables to fill before sending

- `{{first_name}}` — from the buyer's email signature or LinkedIn
- Order confirmation reference is implicit (you're replying to the Gumroad email thread)

## Operator timeline (paste into your day-of-order checklist)

| Hour | Action |
|---|---|
| H+0 | Order confirmation arrives in trevor@trevorobeyinc.com |
| H+1 | Send the reply above. Attach NDA. |
| H+24 | Buyer returns NDA + topic. Countersign NDA. File counter-signed copy at `workspace/legal/executed/YYYY-MM-DD_<buyer-entity>_NDA.pdf`. |
| H+24 | Kick off OpenClaw research workflow with buyer's topic. From terminal: `cd /Users/trevorrobey/OpenClaw-Research-Agents && node scripts/run-workflow.js general-research-pack "<buyer topic>"` |
| H+30 | Workflow finishes (~4-5 min wall-clock). Synthesizer markdown lands in `workspace/research-output/`. |
| H+32 | Render to PDF: `pandoc <synthesizer>.md -o <pack>.pdf` (LaTeX engine), or open in Obsidian/Browser → print to PDF. |
| H+36 | Run citation validator: `python workspace/scripts/citation_validator.py <pack>.md --strict > workspace/audit/<pack>-manifest.json` |
| H+38 | Run Presidio screen: `bash workspace/scripts/screen_phi.sh <pack>.pdf workspace/legal/cited-authors-allowlist.txt` |
| H+40 | If both pass: zip pack PDF + Parquet appendix + manifest JSON + screening report → email to buyer. |
| H+72 | Send 14-day support clock starts. |

## Red flags during the back-and-forth

- Buyer asks for analysis of a competitor's proprietary dataset → decline, refund. You do public-domain only.
- Buyer asks for personalized patient data → decline, refund. HIPAA boundary.
- Buyer is slow to return NDA (>3 business days) → ping once, then refund if no response by day 7. Don't let dormant orders eat your bandwidth.
- Buyer asks for "consulting hours" instead of the pack → that's a separate scope. Quote Custom Mission ($15K-$35K) and require a new SOW.

## File this template

Counter-signed NDA + the dated email thread + the deliverable paths get logged in `workspace/audit/orders/YYYY-MM-DD_<buyer-entity>/`. One folder per order. Audit log is your defense if any buyer ever disputes scope.
