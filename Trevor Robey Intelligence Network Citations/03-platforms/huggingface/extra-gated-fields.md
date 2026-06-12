# HuggingFace — gated access fields & settings

> **Filled 2026-06-10.** Gating turns the free sample into a **lead-capture surface** (you see who requests it and why). These keys are live in [`gated-teaser/README.md`](gated-teaser/README.md). HF supports manual or automatic approval — recommend **manual** at first so you can review/qualify each requester, then switch to automatic if volume grows.

## Fields collected (HF `extra_gated_fields`)

| Field | Type | Why |
|---|---|---|
| Company or affiliation | text | Qualify the lead (pharma / fund / academic). |
| Country | country | Geo + light export awareness. |
| Work email | text | The contact that matters (not the HF account email). |
| Intended use | select | Routes the lead to the right SKU: Investor diligence / Pharma CI / Drug-safety / Academic / Other. |
| "research/evaluation only, not for clinical use" | checkbox | Liability gate; matches the disclaimer. |

## Settings

- **Access requests:** Manual review (Settings → Gated → "Review access requests manually"). Revisit to automatic only if request volume outpaces review.
- **Gate prompt** (`extra_gated_prompt`): present in the card — states data is research/evaluation only, info never sold.
- **Button:** "Request access".
- **Lead workflow:** when a request arrives, log the requester in [`../../12-pipeline-tracking/discovery-calls.md`](../../12-pipeline-tracking/discovery-calls.md) and, if a fit, send the persona-matched outreach from [`../../07-outbound/`](../../07-outbound/). This is how the free artifact feeds the direct-sale motion.
