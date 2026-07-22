# Datarade Provider Setup Guide

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
6. Set pricing (2026-04-30 ladder):
   - Tactical SKUs: $2,500 (Plain-Language Patient Brief) – $4,950 (Conference Synthesis Brief, Trial Design Benchmark Pack); Pharmacovigilance Pack tactical $2,500–$4,950
   - Investor Pre-Mortem (primary): $9,950 anchor / $14,950 standard / $19,950 custom (+ KOL primary)
   - Failed Trial Archaeology (flanking): $14,950
   - Cross-Silo Connector Report: $9,950–$24,950
   - Custom enterprise engagements: discovery call → scoped contract

## Pricing Strategy

- **Tactical SKU band ($2,500–$4,950)**: Pharmacovigilance Pack, Plain-Language Patient Brief, Conference Synthesis Brief, Trial Design Benchmark Pack
- **Investor-grade band ($9,950–$24,950)**: Investor Pre-Mortem, Failed Trial Archaeology, Cross-Silo Connector Report
- **Custom enterprise**: ongoing portfolio coverage with cloud-data-platform delivery — handled as scoped contracts, not a published ARR tier (the prior $60K–$120K+ ARR ladder is retired)
