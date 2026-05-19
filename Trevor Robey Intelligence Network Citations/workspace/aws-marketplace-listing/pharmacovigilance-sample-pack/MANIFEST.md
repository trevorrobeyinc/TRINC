# Pharmacovigilance Sample Pack — AWS Data Exchange Listing Manifest

**Status**: Standards-compliant draft, ready to upload when AWS Data Exchange Provider Qualification approval arrives (Support case in flight, ~7 day SLA).

**Last prepared**: 2026-05-06.

**Source deliverable**: [trevor-robey-inc-agents/workspace/collateral/samples/pharmacovigilance-sample-deliverable.md](../../collateral/samples/pharmacovigilance-sample-deliverable.md)

---

## Files in this listing

| File | Size | Purpose | AWS UI step where this gets uploaded / pasted |
|---|---:|---|---|
| `MANIFEST.md` | this file | Human-readable index. Not uploaded to AWS. | — |
| `signal-register.csv` | 2,879 B | **Dataset asset #1** — 10 pharmacovigilance signals with AEMS metrics, severity tiers, and recommended actions. | Data Exchange wizard → Create dataset → Add file → upload `signal-register.csv` |
| `citation-index.csv` | 2,935 B | **Dataset asset #2** — 29-row citation index linking every signal to a verifiable public-database identifier (PMID, NCT, RxNorm, ChEMBL, PubChem CID, UniProt, MedDRA PT, DOI, DailyMed SPL). | Same dataset → Add file → upload `citation-index.csv` |
| `listing-copy.md` | 5,006 B | **Listing copy** — product title, short description, long description (AWS generic Markdown template), highlights, categories, support contact. | Listing wizard → "Product details" page — paste each section into the matching field |
| `metadata-table.md` | 2,985 B | **Metadata fields** — update frequency, time period, geographic coverage, data format, file count, anonymization status, source databases, key fields. | Listing wizard → "Metadata" / "Dataset details" sections — paste each labeled value into matching field |
| `data-subscription-agreement.md` | 4,738 B | **DSA** — research-use-only license terms (no redistribution, no commercial repackaging, no PHI use, no warranty, governing law). | Listing wizard → "Offer" → "Data subscription agreement" — upload as PDF after converting from MD, OR paste the body into AWS's plain-text DSA editor |
| `data-dictionary.md` | 5,779 B | **Schema documentation** — column definitions, allowed values, identifier resolution URLs, cross-file integrity rules. | Listing wizard → "Dataset documentation" / "Data dictionary" — upload as PDF or paste into the documentation field |

**Total payload**: ~24 KB across 7 files (5 documentation files + 2 dataset CSVs).

---

## Pre-flight integrity checks

- [x] Every `signal_id` in citation-index.csv exists in signal-register.csv (10 unique signals: C-1 through C-5, I-1 through I-5)
- [x] Every PMID, NCT, RxNorm, ChEMBL, CID, UniProt, DOI, MedDRA, DailyMed SPL identifier in the CSVs is sourced from [pharmacovigilance-sample-deliverable.md](../../collateral/samples/pharmacovigilance-sample-deliverable.md) — no fabricated citations
- [x] CSVs are RFC 4180 compliant: UTF-8 encoding, double-quoted text fields containing commas, header row, no smart quotes, no em dashes
- [x] Listing copy is ASCII-only (matches the public profile bio's character constraints AWS enforces)
- [x] DSA explicitly states "Research artifacts only — not validated for clinical decision support" matching [trevor-robey-inc-agents/NOTICE.md](../../../NOTICE.md) language
- [x] Provider entity description: Trevor Robey Intelligence Network Citations LLC, a California limited liability company (filed at CA SOS 2026-05-06; receipt B20260217250), operating under the wordmark "Trevor Robey, INC." (INC = Intelligence Network Citations)
- [x] Listing copy leads with AWS-customer-fit framing ("biotech investors and pharma BD teams running portfolio diligence on AWS"), matching the public-profile bio currently under verification
- [x] Title is 67 characters (under AWS 72-char limit); short description is 199 characters (under AWS 200-char limit)
- [x] No PHI mentioned, claimed, or implied anywhere in the package
- [x] Customer support contact (trevor@trevorobeyinc.com) matches the AWS Marketplace seller profile email and the AWS Support case primary contact

---

## Upload sequence (when DX qualification approval arrives)

1. Open AWS Marketplace Management Portal → **Data products** → **Create data product**
2. **Step 1 (Basic entity)**: Paste product title from [listing-copy.md](listing-copy.md#product-title-max-72-chars). Click "Generate product ID and product code".
3. **Step 2 (Dataset)**: Create a new dataset titled "Pharmacovigilance Signal Synthesis - Free Sample". Add a revision. Upload both CSVs (`signal-register.csv`, `citation-index.csv`) as Files assets.
4. **Step 3 (Product details)**: Paste short description (max 200 chars), long description (Markdown), highlights, categories, support contact from [listing-copy.md](listing-copy.md).
5. **Step 4 (Metadata)**: Fill update frequency, coverage, format fields from [metadata-table.md](metadata-table.md).
6. **Step 5 (Documentation)**: Upload [data-dictionary.md](data-dictionary.md) (convert to PDF first if AWS requires PDF upload) as the schema/data dictionary attachment.
7. **Step 6 (Offer)**: Pricing model = Free. Visibility = Public. Subscription verification = not required for free tier. Attach [data-subscription-agreement.md](data-subscription-agreement.md) (convert to PDF) as the DSA, OR paste body if AWS allows plain text.
8. **Step 7 (Review and publish)**: AWS review window after submission is documented at 5-7 business days for first-time data product listings.

---

## What still has to happen externally

- **AWS Data Exchange Provider Qualification approval**: Support case submitted via AWS Marketplace Contact Us form, primary email trevor@trevorobeyinc.com, subcategory "Onboarding Request" — AWS standard reply within 7 days.
- **Public profile verification**: independent ~2-3 business day review currently in flight.
- **DSA / Data dictionary PDF conversion**: AWS may accept plain-text upload OR may require PDF — handle in real time when wizard requests file upload.

When both approvals land, this listing publishes in 15 minutes of UI work.
