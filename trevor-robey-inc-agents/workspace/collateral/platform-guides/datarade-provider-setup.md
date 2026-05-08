# Datarade Provider Setup Guide

## Prerequisites

- Business entity (Trevor Robey Inc.)
- Email: trevor@trevorobeyinc.com
- At least one completed workflow with exported ZIP

## Step 1: Apply as Data Provider

1. Go to datarade.ai and click "Become a Data Provider" (or equivalent provider contact form)
2. Fill in company details:
   - Company: Trevor Robey Inc.
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
6. Set pricing:
   - Standard: $2,500 per report
   - Custom: $15,000 - $35,000 per project

## Pricing Strategy

- Standard tier ($2,500-$4,950): Single-topic research intelligence packs
- Custom tier ($15,000-$35,000): Multi-topic custom intelligence missions
- Enterprise subscription: Contact for pricing ($60K-$120K+ ARR)
