# AWS Data Exchange — seller registration (Marketplace + Data Exchange qualification case)

> Account-level seller record. **Account access** (how you sign in) is documented
> canonically in [`account-access.md`](account-access.md). The **Data Exchange
> provider-qualification appeal** trail is in
> [`correspondence-2026-05.md`](correspondence-2026-05.md). Playbook: §2 #2 AWS DX; §4 Week 1 Thu.

## Account & sign-in

- AWS account `833390816446`, Org `o-dram9st6t2`, region `us-east-1`.
- Sign in via the IAM Identity Center access portal `https://d-90660e72bc.awsapps.com/start`, YubiKey FIDO2 MFA. Seller work uses the **AdministratorAccess** role (operator-only); the AI/MCP is **ReadOnlyAccess**. No long-lived keys. Full detail: [`account-access.md`](account-access.md).
- Seller-profile primary email: `trevor@trevorobeyinc.com`.
- Entity: **Trevor Robey Intelligence Network Citations LLC** (California), wordmark **"Trevor Robey, INC."** (INC = Intelligence Network Citations).

## Status (updated 2026-07-22 — ✅ CLEARED FOR PAID SELLING)

> **Was "as recorded 2026-05-26" (all gates open). As of 2026-07-22 the full
> account-qualification chain is COMPLETE and the account is cleared to publish
> paid listings** — Marketplace Account status = **"Publish paid and free
> products."** History preserved in the rows below and in
> [`correspondence-2026-05.md`](correspondence-2026-05.md).

| Item | Status | Source |
|---|---|---|
| AWS account access (SSO + YubiKey, ReadOnly/Admin roles) | ✅ **Established 2026-05-26** | [`account-access.md`](account-access.md) — verified live |
| AWS Marketplace seller account | ✅ Registered / **Active** | seller-onboarding thread (handoff 2026-05-26) |
| **AWS Data Exchange / seller qualification** | ✅ **APPROVED & cleared for paid (2026-07-22)** — *(history: application rejected 2026-05-03 → AWS re-engaged → approved; disbursement blocked ~2.5 mo by a stalled account review → cleared 2026-07-22)* | [`correspondence-2026-05.md`](correspondence-2026-05.md) |
| Public seller profile verification | ✅ Verified (implied by the "Publish paid and free products" status) | [`public-seller-profile.md`](public-seller-profile.md) |
| Tax interview (W-9) + DAC7 | ✅ **Completed** (2026-05-01) | [`tax-interview-w9.md`](tax-interview-w9.md) |
| Bank verification (US payout account) | ✅ **Added** — US ACH ending 262 (verification "Not required") | [`bank-verification.md`](bank-verification.md) |
| Disbursement method | ✅ **Added 2026-07-22** — the final gate; account flipped to "Publish paid and free products" | [`correspondence-2026-05.md`](correspondence-2026-05.md) |

> Account qualification is DONE. The only thing between here and revenue is
> **product-side**: create + publish a paid listing (AWS's own product review) —
> nothing paid is live yet. Listing artifacts for the free Pharmacovigilance
> Sample Pack are staged (`workspace/aws-marketplace-listing/pharmacovigilance-sample-pack/`).
