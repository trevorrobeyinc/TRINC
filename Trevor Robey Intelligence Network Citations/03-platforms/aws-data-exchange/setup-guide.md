# AWS Data Exchange Provider Setup Guide

## Purpose

AWS Data Exchange is the enterprise delivery channel. Premium/Enterprise clients ($15K-$120K+) receive data via AWS native infrastructure. Provider onboarding takes 2-4 weeks.

## Prerequisites

- **AWS account access** — see [`account-access.md`](account-access.md) (canonical). Account `833390816446` is reached via IAM Identity Center SSO + a YubiKey FIDO2 key; the operator assumes `AdministratorAccess` for seller work, the AI/MCP stays `ReadOnlyAccess`. **No long-lived IAM-user keys** — the earlier "root + IAM user with `aws-marketplace:*`" model is obsolete.
- W-9 tax form on file (placeholder: [`tax-interview-w9.md`](tax-interview-w9.md))
- US bank account for payouts (placeholder: [`bank-verification.md`](bank-verification.md))
- At least one completed Premium/Enterprise workflow

## Step 1: Apply as Provider

> Sign in via the IAM Identity Center access portal (`https://d-90660e72bc.awsapps.com/start`) and choose the **AdministratorAccess** role tile — seller/provider registration is a consequential, operator-only action (YubiKey tap). See [`account-access.md`](account-access.md).

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
5. Set pricing: $15,000+ per revision (Custom) or subscription pricing (Enterprise)

## Step 4: Private Offers for Enterprise Clients

For enterprise clients (custom-scoped, typically $9,950–$24,950 for Cross-Silo Connector Reports + ongoing portfolio coverage):
1. Create Private Offer in AWS Marketplace
2. Set custom pricing and terms
3. Client subscribes via their AWS account
4. Data delivered via S3 bucket — zero ETL on client side

## Delivery Options

- **Public listing**: Any AWS customer can subscribe
- **Private offer**: Named customer with custom pricing
- **Snowflake Secure Data Sharing**: Alternative for Snowflake-native clients
