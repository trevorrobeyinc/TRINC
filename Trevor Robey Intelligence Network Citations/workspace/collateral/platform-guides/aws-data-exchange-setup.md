# AWS Data Exchange Provider Setup Guide

> **Canonical copy lives at [`03-platforms/aws-data-exchange/setup-guide.md`](../../../03-platforms/aws-data-exchange/setup-guide.md); account access at [`03-platforms/aws-data-exchange/account-access.md`](../../../03-platforms/aws-data-exchange/account-access.md).** This collateral copy is kept in sync with those — edit the `03-platforms/` versions first.

## Purpose

AWS Data Exchange carries the business's data products (the first is the Trial Graveyard Feed, not yet listed) and AWS Marketplace private offers for the report SKUs. Every price comes from [`OFFERINGS.md`](../../../OFFERINGS.md), verbatim. The seller account is registered and has been cleared to publish paid products since 2026-07-23.

## Prerequisites

- **AWS account access** — see [`account-access.md`](../../../03-platforms/aws-data-exchange/account-access.md) (canonical). Account `833390816446` is reached via IAM Identity Center SSO + a YubiKey FIDO2 key; the operator assumes `AdministratorAccess` for seller work, the AI/MCP stays `ReadOnlyAccess`. **No long-lived IAM-user keys** — the earlier "root + IAM user with `aws-marketplace:*`" model is obsolete.
- W-9 tax form on file
- US bank account for payouts
- At least one completed workflow that passed the citation gate

## Step 1: Apply as Provider

> Sign in via the IAM Identity Center access portal (`https://d-90660e72bc.awsapps.com/start`) and choose the **AdministratorAccess** role tile — provider registration is a consequential, operator-only action (YubiKey tap).

1. Go to AWS Marketplace Management Portal
2. Select "Register as a data provider"
3. Complete business information:
   - Legal entity: Trevor Robey Intelligence Network Citations LLC (wordmark: "Trevor Robey, INC."; INC = Intelligence Network Citations)
   - Contact: trevor@trevorobeyinc.com
   - Categories: Healthcare, Life Sciences, Financial Services (for hedge fund clients)
4. Submit W-9 and banking details
5. Wait for approval (2-4 weeks typical)

## Step 2: Generate Distribution Assets

```bash
node scripts/distribute.js --workflow-id <id> --targets aws-data-exchange --confirm
```

This creates:
- `workspace/distribution/aws-data-exchange/<id>/product-description.md`
- `workspace/distribution/aws-data-exchange/<id>/revision-metadata.json`
- `workspace/distribution/aws-data-exchange/<id>/schema.json`
- `workspace/distribution/aws-data-exchange/<id>/data/research-output.json`

## Step 3: Create Product Listing (After Approval)

1. Sign in at the access portal and assume **AdministratorAccess** (operator-only; YubiKey tap), then open the AWS Marketplace Management Portal
2. Create New Product → Data Product
3. Use `product-description.md` for listing copy
4. Upload `data/` directory as S3 revision
5. Set pricing from [`OFFERINGS.md`](../../../OFFERINGS.md) only. The Trial Graveyard Feed's price is `[DECIDE]`, on hold since 2026-10-21 ([`offers.md`](../../aws-marketplace-listing/trial-graveyard-feed/offers.md)); never borrow a report SKU's price for a data product. (The old Standard / Premium / Custom / Enterprise-ARR ladder is retired.)

## Step 4: Private Offers for Named Clients

For a named client buying a report SKU (or, once booking opens after the first live business-lane run, a business-research tier):
1. Create Private Offer in AWS Marketplace
2. Set the price from [`OFFERINGS.md`](../../../OFFERINGS.md), verbatim, and choose the Data Exchange default legal terms
3. Client subscribes via their AWS account
4. The client receives the data set through their AWS account (S3)

## Delivery Options

- **Public listing**: Any AWS customer can subscribe
- **Private offer**: A named customer, priced from `OFFERINGS.md`

No other cloud delivery (Snowflake, BigQuery, an API or webhooks) is built.
