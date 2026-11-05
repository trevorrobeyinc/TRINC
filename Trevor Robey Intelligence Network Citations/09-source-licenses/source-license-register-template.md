# Source License Register — template for one-pager attached to every SOW

A copy of this register, completed for the specific deliverable, is attached to every Statement of Work. It tells the buyer which sources fed the deliverable and under what terms — and it is the document a court would read first if a license claim were ever raised.

## How to fill this in

1. List **every** data source touched during preparation, in the order it was queried.
2. For each row, reach into `09-source-licenses/<source>.md` for the canonical license posture and copy it verbatim. Do not paraphrase.
3. For sources flagged `🚩 STOP-SHIP` (e.g., DrugBank without an active commercial license): if they appear here, the deliverable cannot ship. Stop and escalate.
5. Sign and date at the bottom. Initials become part of the audit trail.

## Template

```
Deliverable: <SKU + variant + buyer>
SOW: <SOW ID, date, $ amount>
Citation-density gate: <pass/fail>  (must be ≥ 0.15 unique citations / output token)
Presidio PHI screen: <pass/fail>    (must be pass; threshold > 0.6)
License compliance build gate: <pass/fail>  (see 14-due-diligence-checklist/02-license-compliance.md)
```

| # | Source | Access path | License | Attribution requirement | Stop-ship flag? | Identifier in deliverable |
|---|---|---|---|---|---|---|
| 1 | PubMed | API / ToolUniverse `PubMed_search_articles` | Public — citation metadata + abstracts free; full text per PMC OA only | "Source: PubMed" + PMID per row | No | PMID |
| 2 | ClinicalTrials.gov | API / ToolUniverse `search_clinical_trials`, `ctgov-supplemental` | Public domain | Attribute NLM | No | NCT |
| 3 | ChEMBL | Open Targets records (`open-targets-graphql`); ids re-resolved against the ChEMBL API | CC BY-SA 3.0 ⚠️ share-alike | Attribute EMBL-EBI | Counsel review pending — confirm before ship | ChEMBL CID |
| 4 | eLife | API / EuropePMC | CC BY 4.0 | "Source: eLife" + DOI per row | No | DOI |
| ... | ... | ... | ... | ... | ... | ... |

## Out-of-scope sources (must not appear above)

- DrugBank in any form, unless an active commercial license is on file and recorded in `config/dataset-license-rules.json:source_overrides`.
- Any paywalled journal (Elsevier, Springer, Wiley, etc.).
- Anything carrying patient-identifiable information.

If a source on this list appears in a deliverable's register, the deliverable does not ship.

## Sign-off

```
Prepared by: ___________________   Date: ____________
Compliance review by: ___________   Date: ____________
SHA-256 of dataset-license-rules.json at ship time: ____________________________________________________
```

The dataset-license-rules.json hash is reproducible via:

```
node -e "const r=require('./openclaw-bridge/dataset/license-review').createLicenseReview(); console.log(r.getConfigSnapshotHash());"
```

`node -e ...` - prints the canonical config hash. Pinning this in the register lets a future audit confirm which version of the rules the build was checked against.
