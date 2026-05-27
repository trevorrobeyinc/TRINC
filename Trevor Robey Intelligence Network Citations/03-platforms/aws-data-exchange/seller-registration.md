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

## Status (as recorded 2026-05-26)

| Item | Status | Source |
|---|---|---|
| AWS account access (SSO + YubiKey, ReadOnly/Admin roles) | ✅ **Established 2026-05-26** | [`account-access.md`](account-access.md) — verified live |
| AWS Marketplace seller account | Registered / **Active** | seller-onboarding thread (handoff 2026-05-26) |
| **AWS Data Exchange provider qualification** | 🔴 **Not approved** — application rejected 2026-05-03; AWS re-engaged; follow-up #3 sent 2026-05-23; escalate ~2026-06-02 if silent. 0 published products. | [`correspondence-2026-05.md`](correspondence-2026-05.md) |
| Public seller profile verification | 🟡 Pending | [`public-seller-profile.md`](public-seller-profile.md) |
| Tax interview (W-9) | 🟡 Incomplete | [`tax-interview-w9.md`](tax-interview-w9.md) |
| Bank verification (US payout account) | 🟡 Incomplete | [`bank-verification.md`](bank-verification.md) |

> The hardware-gated account access is in place; the remaining gates (DX
> qualification, seller profile, tax, bank) are the business-onboarding steps to
> finish once AWS responds. Listing artifacts for the free Pharmacovigilance
> Sample Pack are staged and need no rework when qualification clears
> (`workspace/aws-marketplace-listing/pharmacovigilance-sample-pack/`).
