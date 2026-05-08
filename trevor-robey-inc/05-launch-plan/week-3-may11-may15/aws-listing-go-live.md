# AWS Data Exchange listing go-live — Week 3 (May 11–15, 2026)

**Status as of 2026-05-07**: Standards-compliant listing draft is complete and staged in [`trevor-robey-inc-agents/workspace/aws-marketplace-listing/pharmacovigilance-sample-pack/`](../../../trevor-robey-inc-agents/workspace/aws-marketplace-listing/pharmacovigilance-sample-pack/). Awaiting AWS Data Exchange Provider Qualification approval (Support case in flight; AWS standard reply window 7 business days).

## Outstanding before go-live

| Gate | Owner | Target | Status |
|---|---|---|---|
| AWS Data Exchange Provider Qualification approval | AWS | 7 business days SLA | **Pending** — Support case submitted via Marketplace Contact Us form, subcategory "Onboarding Request", primary email `trevor@trevorobeyinc.com` |
| Public seller profile verification | AWS | 2–3 business days | **Pending** — independent review in flight |
| DSA / Data dictionary PDF conversion (if AWS demands PDF over plaintext) | Trevor | At wizard time | Will resolve in real time when wizard requests file upload |
| LLC SOS approval (CA Secretary of State) | CA SOS | 2–3 business days from 2026-05-06 filing | **Pending** — bizfileOnline receipt `B20260217250` filed 2026-05-06 |

## What's already done (2026-05-06)

- Listing copy drafted and ASCII-validated against AWS UI character limits ([`listing-copy.md`](../../../trevor-robey-inc-agents/workspace/aws-marketplace-listing/pharmacovigilance-sample-pack/listing-copy.md))
- Two dataset CSVs prepared (signal-register: 10 ICI-class signals; citation-index: 29 verified identifier rows) — RFC 4180 compliant, no PHI, every PMID/NCT/RxNorm/ChEMBL/UniProt/DOI/MedDRA/DailyMed SPL identifier traces back to the source deliverable
- Data Subscription Agreement drafted ([`data-subscription-agreement.md`](../../../trevor-robey-inc-agents/workspace/aws-marketplace-listing/pharmacovigilance-sample-pack/data-subscription-agreement.md)) with research-use-only terms aligned to [`trevor-robey-inc-agents/NOTICE.md`](../../../trevor-robey-inc-agents/NOTICE.md)
- Schema documentation prepared ([`data-dictionary.md`](../../../trevor-robey-inc-agents/workspace/aws-marketplace-listing/pharmacovigilance-sample-pack/data-dictionary.md))
- Metadata fields drafted ([`metadata-table.md`](../../../trevor-robey-inc-agents/workspace/aws-marketplace-listing/pharmacovigilance-sample-pack/metadata-table.md))
- Pre-flight integrity checks complete (citation traceability, PHI absence, character-limit compliance, ASCII-only enforcement, provider-entity disclosure language)
- Provider entity description finalized: *"Trevor Robey Intelligence Network Citations LLC, a California limited liability company (filed at CA SOS 2026-05-06; receipt B20260217250), operating under the wordmark 'Trevor Robey, INC.' (INC = Intelligence Network Citations)"*
- Bundle archived as `listing-and-dsa.zip` ready for portal upload

## Go-live sequence (when both approvals land)

The 8-step upload workflow is in [`MANIFEST.md`](../../../trevor-robey-inc-agents/workspace/aws-marketplace-listing/pharmacovigilance-sample-pack/MANIFEST.md#upload-sequence-when-dx-qualification-approval-arrives) — paste-ready, ~15 minutes of UI work end-to-end.

## Listing details

| Field | Value |
|---|---|
| Product title | "Pharmacovigilance Signal Synthesis - Free Citation-Traced Sample Pack" (67 chars, under AWS 72-char limit) |
| Short description | 199 chars; mentions citation-traced ICI-class adverse event signals |
| Pricing model | **Free** — sample/teaser tier |
| Visibility | Public |
| Subscription verification | Not required (free tier) |
| AWS review window | 5–7 business days first-time data product listing |
| Paid follow-on | Investor Pre-Mortem ($9,950 anchor / $14,950 standard / $19,950 KOL) and Failed Trial Archaeology ($14,950) listed separately after free-tier publishes and validates the seller profile |

## Risk: AWS approval slips past Week 3

If AWS qualification approval lands after Fri May 15, slip the go-live to Week 4 (May 18–22). Listing artifacts are stable — no rework needed.

## Cross-refs

- Source deliverable: [`trevor-robey-inc-agents/workspace/collateral/samples/pharmacovigilance-sample-deliverable.md`](../../../trevor-robey-inc-agents/workspace/collateral/samples/pharmacovigilance-sample-deliverable.md)
- Setup guide history: [`03-platforms/aws-data-exchange/setup-guide.md`](../../03-platforms/aws-data-exchange/setup-guide.md)
- Seller registration record: [`03-platforms/aws-data-exchange/seller-registration.md`](../../03-platforms/aws-data-exchange/seller-registration.md)
- Playbook section: §4 Week 3 in [`trevor-robey-inc Commercial Launch Playbook.md`](../../trevor-robey-inc%20Commercial%20Launch%20Playbook.md)
