# Datarade Provider Setup Guide

> **Canonical copy lives at [`03-platforms/datarade/provider-setup-guide.md`](../../../03-platforms/datarade/provider-setup-guide.md).** Edit that version first and keep this one in step. Every price comes from [`OFFERINGS.md`](../../../OFFERINGS.md), verbatim.
>
> **PARKED 2026-10-24:** the Datarade channel is deferred until the business is operating (declined
> 2026-05-20, "business not yet established"; see [`go-live-checklist.md`](../../../03-platforms/datarade/go-live-checklist.md)).

## Prerequisites

- Business entity (Trevor Robey Intelligence Network Citations LLC; wordmark "Trevor Robey, INC.")
- Email: trevor@trevorobeyinc.com
- At least one completed workflow with exported ZIP

## Step 1: Apply as Data Provider

1. Go to datarade.ai and click "Become a Data Provider" (or equivalent provider contact form)
2. Fill in company details:
   - Company (legal): Trevor Robey Intelligence Network Citations LLC
   - Brand / trading name: Trevor Robey, INC. (INC = Intelligence Network Citations)
   - Categories: Healthcare Data, Life Sciences Data, Pharma Data
   - Website: https://trevorobeyinc.com
3. Wait for provider approval (typically 1-2 weeks)

## Step 2: Generate Distribution Assets

```bash
node scripts/distribute.js --workflow-id <id> --targets datarade --confirm
```

This creates:
- `workspace/distribution/datarade/<id>/listing-fields.json` — Pre-filled listing fields
- `workspace/distribution/datarade/<id>/sample-data.csv` — First 10 rows of citation index
- `workspace/distribution/datarade/<id>/product-description.md` — Buyer-facing description

## Step 3: Create First Listing

1. Log into Datarade provider dashboard
2. Create New Product
3. Copy fields from `listing-fields.json`:
   - Title, description, categories, geographic coverage
4. Upload `sample-data.csv` as preview data
5. Copy `product-description.md` into the long description field
6. Set pricing: one listing per SKU, priced verbatim from the `OFFERINGS.md` "Offering Ladder".

## Pricing Strategy

- List the SKUs on the `OFFERINGS.md` ladder, at its prices. Never compute, round or bundle a price.
- Do not list the Trial Graveyard Feed (price `[DECIDE]`, on hold) or the business-research tiers (booking
  opens only after the first live business-lane run).
- The old Standard / Custom / Enterprise-ARR tiers are retired; never list them.
