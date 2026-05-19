# Scraping Targets — License Register

Companion document to the API-source license registers in this directory. Records the license posture of every connector exposed by `scrape-sidecar/` so SOWs and compliance checks can cite a single source of truth.

The sidecar is a manual-invocation tool. Adding a connector to the source code is not authorization to use it commercially — the entry below must be present, signed off, and correctly mirrored in `config/dataset-license-rules.json` before scraped output may flow into a deliverable.

## Posture inheritance

These targets inherit the brand-level commitments from `OFFERINGS.md`:

- No PHI hosted, transmitted, or processed.
- Every row in every deliverable carries a real source identifier (PMID, DOI, NCT, ChEMBL CID, or — for these targets — `source_url` + `citation_hash`).
- Citation-Audit SLA is refund-backed; license posture below is part of the audit chain.

## Active targets

| Connector ID | Domain | License | License rule | Domain rule reason code | Posture | Sidecar status |
|---|---|---|---|---|---|---|
| `elife` | `elifesciences.org` | CC BY 4.0 | `cc-by-4.0` (allowed) | `SCRAPE_DOMAIN_ALLOWED_OPEN_ACCESS` | Open access; attribution to eLife required in any redistributed extract. | **Pilot — implemented** |

## Planned targets (not yet implemented)

These are pre-registered in `config/dataset-license-rules.json` so a future connector cannot ship without an explicit registry decision. Each connector below requires a follow-up plan and a license sign-off before its connector lands.

| Domain | Likely license | Domain rule reason code | Notes |
|---|---|---|---|
| `journals.plos.org` | CC BY 4.0 | `SCRAPE_DOMAIN_ALLOWED_OPEN_ACCESS` | Match eLife pattern; PLOS family is open-access. |
| `frontiersin.org` | CC BY 4.0 | `SCRAPE_DOMAIN_ALLOWED_OPEN_ACCESS` | Frontiers titles are CC BY 4.0; verify per article. |
| `f1000research.com` | CC BY 4.0 | `SCRAPE_DOMAIN_ALLOWED_OPEN_ACCESS` | Open peer-review platform. |
| `biorxiv.org` | CC BY / CC BY-NC / posted-no-license | `SCRAPE_DOMAIN_ALLOWED_PREPRINT` | Confirm per-paper license at parse time; supplementary materials only — paper metadata flows through the existing PubMed pipeline. |
| `medrxiv.org` | CC BY / CC BY-NC / posted-no-license | `SCRAPE_DOMAIN_ALLOWED_PREPRINT` | Same as bioRxiv. |
| `fda.gov` | Public domain (US Govt) | `SCRAPE_DOMAIN_ALLOWED_PUBLIC_DOMAIN` | Identify the agency in any redistributed extract. |
| `ema.europa.eu` | EU Commission re-use notice | `SCRAPE_DOMAIN_ALLOWED_PUBLIC_DOMAIN` | Verify the re-use notice still applies to the specific page. |
| `who.int` | WHO IGO terms | `SCRAPE_DOMAIN_ALLOWED_PUBLIC_DOMAIN` | WHO content is generally re-usable with attribution; verify per page. |
| `asco.org` | All rights reserved | `SCRAPE_DOMAIN_REVIEW_TOS_PER_SOCIETY` | **Do not implement until society TOS reviewed and a license decision recorded here.** |
| `aacr.org` | All rights reserved | `SCRAPE_DOMAIN_REVIEW_TOS_PER_SOCIETY` | Same — society TOS review required. |
| `hematology.org` (ASH) | All rights reserved | `SCRAPE_DOMAIN_REVIEW_TOS_PER_SOCIETY` | Same. |

## Permanently excluded

| Domain | Reason |
|---|---|
| `drugbank.com` / DrugBank in any form | 🚩 Stop-ship without commercial license; see `drugbank-stop-ship-unless-licensed.md`. The sidecar policy gate also rejects any output containing `DB\d{5}` IDs. |
| Elsevier / Springer / Wiley / paywalled journal sites | No paywall bypassing under any framing. The sidecar policy gate rejects HTTP 401/402 and login redirects. |
| Patient portals, EHR-facing sites, or anything that could surface PHI | Brand commitment: no PHI hosted, transmitted, or processed. |

## Add-a-connector checklist

1. Add a Python connector under `scrape-sidecar/app/connectors/<target>.py` and register it in `app/connectors/__init__.py:REGISTRY`.
2. Add the target's domain to `config/dataset-license-rules.json:domain_rules` with a deliberate state (`allowed`, `review_required`, or `blocked`) and a reason code.
3. Add a row to the **Active targets** table above with the SPDX license identifier and notes.
4. If the target's license is not already in `license_rules`, add it.
5. Run the verification script (see `scrape-sidecar/README.md` and `02-license-compliance.md`) to confirm output passes the regex gate and downstream provenance review.
