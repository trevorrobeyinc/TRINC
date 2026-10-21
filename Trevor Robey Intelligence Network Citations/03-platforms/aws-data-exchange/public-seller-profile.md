# AWS — public seller profile

> The public-facing seller identity shown to AWS Marketplace / Data Exchange
> buyers. Managed under the **AdministratorAccess** role via the AWS Marketplace
> Management Portal (operator-only sign-in — see [`account-access.md`](account-access.md)).
> Playbook: §2 #2 AWS DX.

## Profile fields

| Field | Value |
|---|---|
| Seller / legal entity | Trevor Robey Intelligence Network Citations LLC (California limited liability company) |
| Public display wordmark | **Trevor Robey, INC.** (INC = Intelligence Network Citations) |
| Primary contact email | `trevor@trevorobeyinc.com` |
| Website | `https://trevorobeyinc.com` |
| AWS account | `833390816446` |
| Public seller-profile page | <https://aws.amazon.com/marketplace/seller-profile?id=seller-w2j5h3mqryl3g> (seller ID `seller-w2j5h3mqryl3g`) |
| Seller ARN | `arn:aws:aws-marketplace:us-east-1:833390816446:AWSMarketplace/Seller/seller-w2j5h3mqryl3g` |
| CA SOS Entity No. | **B20260217250** (approved 2026-06-18; certified copy Certificate No. 457169837) |
| Logo | Uploaded — the "TR │ TREVOR ROBEY, INC." wordmark mark |
| Categories | Healthcare, Life Sciences, Financial Services |
| Disclosure line | *"Trevor Robey, INC. is the wordmark of Trevor Robey Intelligence Network Citations LLC, a California limited liability company. INC = Intelligence Network Citations."* |

## Live public bio (published 2026-07-23, verified in portal)

> **Hard field limit: 600 characters.** AWS accepts only ®, © , ™ and currency symbols as
> special characters — keep the text plain ASCII (no em dashes, arrows, or smart quotes).
> The text below measures **595/600**, so there are ~5 characters of headroom: any addition
> requires a matching cut. Portal reflects changes in a few minutes; the **public** seller
> page can take up to **30 minutes**.

```text
AWS Data Exchange provider of citation-traced biomedical due diligence for biotech investors and pharma BD: Investor Pre-Mortem, Failed Trial Archaeology, Conference Synthesis. Every cited PMID/NCT/DOI is grounded in records fetched at run time, retraction-screened (Crossref, PubMed), and independently re-resolved against its issuing registry at delivery, with a Reproducibility Manifest per bundle. Sources: PubMed, ClinicalTrials.gov, ChEMBL, FAERS. S3 delivery, Athena-queryable. 5-day SLA. No PHI. Provider: Trevor Robey Intelligence Network Citations LLC (CA), wordmark Trevor Robey, INC.
```

> ⚠️ **Do NOT soften the citation claims in this bio.** The retraction-screening and
> per-identifier re-resolution language is explicitly authorized by
> [`../../SYSTEM-REALITY.md`](../../SYSTEM-REALITY.md) §3a — *"You MAY now assert
> per-citation external re-resolution to a buyer"* — and that file's **copy-sweep warning**
> forbids reducing it to "grounding only," which would be a *false understatement* of a
> shipped, differentiating capability. Honest bounds to preserve if ever reworded:
> re-resolution confirms an identifier **resolves to a source record**, not that the
> source's scientific conclusions are correct; identifiers with no definitive answer are
> reported **UNCHECKED**, never verified; the pass is fail-soft.

**Superseded 2026-07-23** (previous bio, kept for the diff): it led with *"every claim
PMID/NCT/CID-traced"*, which describes **extraction only** — the pre-2026-06-12 capability —
and therefore understated the shipped integrity layer. Cut to fit the 600-char ceiling:
"hedge funds", the Redshift-federation mention, and Open Targets from the source list.
Display name, website, and logo were unchanged.

## Remaining Settings tabs — surveyed 2026-07-23 (all clean / non-blocking)

| Tab | State | Verdict |
|---|---|---|
| **Service-linked roles** | Exactly one role offered: *"Service-linked role for Resale Authorizations"* — status **not created**. | **Not needed.** It only enables reseller / Channel Partner Private Offer (CPPO) distribution. This business sells direct. Create it only if a reseller motion is ever adopted. |
| **Tags** | **No tags.** | **Not needed.** Optional key/value labels for search/filter/cost allocation; with one seller account and zero published products they'd label nothing. |
| **Notifications** | Primary "Email address" = **`aws@trevorobeyinc.com`** since 2026-10-21 (was `Trevor.Robey@my.strayer.edu`; **this is the account ROOT email** — the "Change email address" control is a link out to AWS's root-user procedure, not an editable field). **Added 2026-07-23:** `aws@trevorobeyinc.com` under *Email for custom notifications* (9 recipient slots remain). | ✅ **Root email moved 2026-10-21** (risk R1 closed; `aws@` is a Workspace group; record in `account-access.md`). Read live on this tab the same morning. The custom-notifications recipient does **not** substitute: AWS scopes it to *Professional-services buyer requests, Reseller Opportunity created/updated/expired, Consulting Partner Private Offer created, and recurring scan vulnerability/reminders* — none of which fire for a direct data-product seller. Listing-review outcomes, payout failures, and policy changes all still route to the root address. Added anyway as zero-cost future-proofing ("additional events will be added"). |

> **Note the three-tab consistency:** service-linked roles, the custom-notification event list, and the CPPO tooling all point at a **reseller/channel-partner** distribution model this business does not use. That is why all three read as empty or irrelevant — it is expected, not a gap.

## Status (updated 2026-07-22)

✅ **Verified** — implied by the Marketplace Account status flipping to **"Publish
paid and free products"** on 2026-07-22 (profile verification is one of the gates
that status requires). *(Was "🟡 Pending verification — AWS independent review in
flight" as recorded 2026-05-26.)* Seller-account record in
[`seller-registration.md`](seller-registration.md); resolution trail in
[`correspondence-2026-05.md`](correspondence-2026-05.md).
