# Datarade — go-live checklist

**Status as of 2026-05-11**: Pre-call prep DONE. Form **SUBMITTED**. Awaiting May 20 onboarding call to unlock storefront-build phase.

## Done

| ✅ | Item | Date | Pointer |
|---|---|---|---|
| ✅ | Vendor application drafted (paste-ready blocks per Datarade intake taxonomy) | 2026-04-26 | [`vendor-application.md`](vendor-application.md) |
| ✅ | LLC formation filed (Trevor Robey Intelligence Network Citations LLC, CA) | 2026-05-06 | bizfileOnline receipt `B20260217250` |
| ✅ | Datarade-sent intake email received (HubSpot Forms EU1, "Help us prepare for our meeting") | 2026-05-11 | trevor@trevorobeyinc.com Zoho mailbox; thread id `1777865848561153000` |
| ✅ | Brand-current Datarade Sample Pack PDF generated (213 KB, with Data Dictionary differentiator) | 2026-05-11 | `~/Downloads/trevor-robey-inc-datarade-sample-pack.pdf` |
| ✅ | HubSpot intake form completed (3 pages, 9 required fields + sample upload) | 2026-05-11 | [`onboarding-call-notes.md`](onboarding-call-notes.md) |
| ✅ | Sample uploaded to HubSpot CDN (UUID `f2e8abb3-7742-4ffe-aa8e-00e5f0f0d1dc`) | 2026-05-11 | UI confirmed "Upload complete" |
| ✅ | Pre-call talking points written | 2026-05-11 | `~/Downloads/datarade-onboarding-talking-points-2026-05-11.md` |
| ✅ | **Form SUBMITTED** | 2026-05-11 | Confirmed by Trevor 2026-05-11 |
| ✅ | **Brand defect: contact email typo `trevor@trevorrobey.com` → canon `trevor@trevorobeyinc.com` swept across 28 files (52 instances)** | 2026-05-11 | `sed -i ''` global replace; verified zero remaining instances |
| ✅ | **Gumroad PV teaser PDF regenerated** (canon email now in rendered artifact) | 2026-05-11 | [`../../03-platforms/gumroad/products/pv-ici-teaser/trevor-robey-inc-pharmacovigilance-teaser.pdf`](../gumroad/products/pv-ici-teaser/trevor-robey-inc-pharmacovigilance-teaser.pdf) (146 KB, regen'd from corrected `teaser-source.md`) |
| ✅ | **Meeting time reconciled to 10:30 AM** (master playbook §2 row 1 was 8:30 AM — corrected) | 2026-05-11 | Confirmed by Trevor 2026-05-11 |

## Open gates (in priority order)

### #1 — Stale OpenClaw-era branding in PV teaser PDF 🟡 MEDIUM

`trevor-robey-inc-pharmacovigilance-teaser.pdf` titles itself *"OpenClaw Pharmacovigilance Intelligence – Sample Output"* — pre-rebrand language brand-guardian explicitly polices. Email is now correct (regenerated 2026-05-11) but the title was deliberately not rewritten in the same pass. To fix: update line 1 of [`teaser-source.md`](../gumroad/products/pv-ici-teaser/teaser-source.md) to a brand-current title (e.g. *"Pharmacovigilance Intelligence — ICI Sample Output"*) and re-run the pandoc + Chrome-headless render pipeline.

**Sibling file**: `OpenClaw-Pharmacovigilance-Teaser.pdf` next to it is the older artifact (same content, stale brand wordmark in filename); recommend deletion or archiving once the regen above lands.

### #2 — Republish to Gumroad if the corrected PDF needs to live on the public storefront 🟡 MEDIUM

The PDF in this repo is now canon-correct. If Gumroad has a published listing with the old PDF, Trevor needs to upload the regenerated file into the Gumroad product page. (Per master playbook §2 row 4, Gumroad is currently SIGNED UP, PARKED — so no public listing is exposing the old PDF right now. Re-check before the operator un-parks Gumroad.)

### #3 — Storefront copy + product listings (post-approval) 🟢 BLOCKED BY MAY 20 CALL

| Item | Pointer |
|---|---|
| Six pack templates for storefront listings | [`product-listings.md`](product-listings.md) |
| Storefront copy + product taxonomy | [`storefront-copy.md`](storefront-copy.md) |
| Monda commerce tier decision (30%/20% commission gate) | [`monda-commerce-tier.md`](monda-commerce-tier.md) |
| KYC documents | [`kyc-documents.md`](kyc-documents.md) |

## Cross-refs

- Master playbook channel-status table: [`../../trevor-robey-inc Commercial Launch Playbook.md`](../../trevor-robey-inc%20Commercial%20Launch%20Playbook.md) §2 row 1
- Pre-call notes: [`onboarding-call-notes.md`](onboarding-call-notes.md)
- Week-3 Datarade card: [`../../05-launch-plan/week-3-may11-may15/datarade-form-completed.md`](../../05-launch-plan/week-3-may11-may15/datarade-form-completed.md)
- Week-4 meeting card: [`../../05-launch-plan/week-4-may18-may22/datarade-onboarding-call.md`](../../05-launch-plan/week-4-may18-may22/datarade-onboarding-call.md)
