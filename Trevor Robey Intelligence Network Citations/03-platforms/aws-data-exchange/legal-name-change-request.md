> **DRAFT 2026-11-04 — prepared by Claude from Common Paper standard terms (where used); NOT reviewed by counsel. Operator decision 2026-11-04: counsel review deferred until funds allow; recommended before the first contract is signed.**
>
> Not legal or tax advice. Common Paper terms used in this document: none. **Nothing here has been sent.**
> The operator opens the case and sends it, signed in to the AWS account. Claude does not send, submit or
> attach anything.

# AWS Marketplace "Legal business name" change: request draft

## 1 · What changes, and why

| | |
|---|---|
| AWS account | **833390816446** |
| Field | AWS Marketplace seller **"Legal business name"** |
| Current value | "Trevor Robey Inc" (read live 2026-07-22; `../business-identity-map.md` §1, "CHANGED" bullet) |
| Requested value | **Trevor Robey Intelligence Network Citations LLC** |
| Entity of record | California LLC, CA SOS **Entity No. B20260217250**, filed 2026-05-06, approved 2026-06-18; certified copy **Certificate No. 457169837** (`../../00-business-formation/llc/certificate-of-formation.md`) |

**Why it matters.** AWS's seller guide says the legal company name is the official registered name of the
business. It must be unique across AWS Marketplace sellers, and it **appears on all legal documents and
agreements with AWS Marketplace**. ([AWS Marketplace Seller Guide, "Step 1: Register and create your seller
profile"](https://docs.aws.amazon.com/marketplace/latest/userguide/create-public-profile.html), read 2026-11-04.)
"Trevor Robey Inc" is not the name of any entity. It is the wordmark with the punctuation dropped, and a
California LLC's name may not contain "Inc." (Cal. Corp. Code §17701.08(e)). A buyer's procurement team checks
that the vendor's legal name is the same on the contract, the invoice, the W-9 and the AWS agreement. Fix this
before the first paid AWS agreement exists.

**Three fields: don't mix them up.**

1. **Legal business name** (this request): needs AWS to change it.
2. **Account contact information → Company name**: already corrected to the LLC on 2026-07-22 (`../business-identity-map.md` §1). A different field.
3. **Public profile → Display name**: stays **"Trevor Robey, INC."**. AWS allows the display name to be the
   legal name or a doing-business-as name and to differ from the legal name (same AWS page as above).

**No self-service edit is documented.** The Partner Central settings page shows the Legal business name as the
one given at registration. For changing how the name appears to others, it points only to the Display name
([AWS Partner Central settings](https://docs.aws.amazon.com/partner-central/latest/getting-started/partner-central-settings.html),
read 2026-11-04). So this goes through a support case.

## 2 · Who to contact (verified 2026-11-04)

**Partner Central is now in the AWS console.** AWS announced on **2025-11-30** that AWS Partner Central is
available in the AWS Management Console, simplifying access to Partner Central and the AWS Marketplace
Management Portal. Existing partners migrate through a migration feature
([What's New, posted Nov 30, 2025](https://aws.amazon.com/about-aws/whats-new/2025/11/aws-partner-central-available-management-console),
read 2026-11-04). The seller guide now says AWS Marketplace consolidates the management portal with Partner
Central (create-public-profile page above). `[PENDING: check whether account 833390816446 has migrated to the
console Partner Central experience; the route below works either way]`.

1. **Primary: the AWS Marketplace support form.** In AWS Partner Central's left navigation choose
   **Marketplace support**. It opens the AWS Marketplace Management Portal form,
   <https://aws.amazon.com/marketplace/management/contact-us/>
   ([Partner Central "Getting support"](https://docs.aws.amazon.com/partner-central/latest/getting-started/getting-support.html),
   read 2026-11-04). If the account has not migrated, the same form is the **Contact us** link in the
   Marketplace Management Portal. AWS's seller support table lists **"Setting-up seller account information"**
   under the **Managed Catalog Operations (MCO)** team, contacted through that Support Form
   ([AWS Marketplace Seller Guide, "Getting support for AWS Marketplace"](https://docs.aws.amazon.com/marketplace/latest/userguide/getting-support.html),
   read 2026-11-04). This is the same form used in May 2026 as "Seller Operations" for case **00881277**
   (`correspondence-2026-05.md`). Pick the category closest to seller account information or registration.
   In May 2026 that was Seller Operations → Account / Onboarding; the menu may have changed since.
2. **Fallback: Partner Central support,** only if Marketplace support says the field belongs to the Partner
   Central account: **Partner Central support** in the same left navigation,
   <https://partnercentral.awspartner.com/partnercentral2/s/newsupportcase>. It opens the legacy Partner
   Central case form, which takes attachments (same "Getting support" page).
3. **Not this:** the **Support** menu in the console's top-right corner. AWS's own Partner Central doc says it
   goes to general AWS Support and is not recommended for Partner Central or Marketplace inquiries (same page).
   AWS Customer Service, reached through the AWS Support Console, handles account and billing questions, not
   seller account information (Seller Guide "Getting support" table).

Sign in as the operator with the IAM Identity Center SSO identity and the `AdministratorAccess` role
(`account-access.md`). Opening a support case needs the right permissions (same Seller Guide page). Use the
YubiKey; nobody else signs in.

## 3 · Before sending

- [ ] **Business mail works** (root `STATUS.md` step 1). AWS answers on the case and by email to
      `aws@trevorobeyinc.com` / `trevor@trevorobeyinc.com`, and mail to `aws@` since 2026-11-02 may have been lost.
- [ ] **EIN issued, CP 575 saved outside the repo**: `[PENDING: EIN not yet issued]`
      (`../../00-business-formation/llc/ein-confirmation.md`). AWS's registration asks for a business tax ID
      such as an EIN alongside the legal company name (create-public-profile page above).
- [ ] **Good standing**: Statement of Information (LLC-12) filed and FTB 3522 paid. Both were not done as of
      2026-10-21 (`../../00-business-formation/compliance/compliance-calendar.md`). `[PENDING]`
- [ ] `[DECIDE: open the case now with the Articles and say the EIN letter will follow, or wait for the CP 575]`.
      Recommendation: wait. The EIN is planned for the same sitting as the filings (`STATUS.md` step 2), and one
      complete case avoids a second round.

## 4 · What to attach

| Attach | Where it is | Note |
|---|---|---|
| Certified copy of the Articles of Organization, CA SOS **Certificate No. 457169837** (issued 2026-05-12) | `~/Documents/457169837/` (outside the repo) | Anyone can verify it on bizfileOnline → Certification Verification Search |
| Filed Articles / Filing Acknowledgment (Entity No. B20260217250) and the SOS approval (Welcome) letter dated 2026-06-18 | `~/Documents/` (outside the repo) | Optional if the certified copy is attached |
| IRS **Notice CP 575** (EIN confirmation), or **Letter 147C** if CP 575 is lost | outside the repo, once issued | `[PENDING: EIN not yet issued]` |

**Never attach** a Social Security number or any page showing one, bank account details, or the operator's
photo ID. If AWS needs identity re-verification, it runs its own verification flow; don't put an ID in a case.
Check every PDF before upload, and redact anything not on this list.

## 5 · The case

**Subject:** Request to update Legal business name: AWS account 833390816446

**Message (one paragraph, paste as is once the CP 575 is attached and the title is filled in):**

> Hello AWS Marketplace team: please update the Legal business name on the AWS Marketplace seller account for
> AWS account 833390816446 from "Trevor Robey Inc" to "Trevor Robey Intelligence Network Citations LLC", the
> exact registered name of our California limited liability company (California Secretary of State Entity No.
> B20260217250, filed 2026-05-06, approved 2026-06-18). "Trevor Robey, INC." is our wordmark and should remain our
> public display name; it is not a legal entity. Because the legal name appears on AWS Marketplace agreements, we
> want it to match the registered entity before we enter our first paid agreement. Attached are a certified copy
> of our Articles of Organization (California Certificate No. 457169837) and our IRS EIN confirmation letter (CP
> 575). Please also tell us whether this change requires us to update the tax interview, business verification or
> disbursement bank account on file, and whether anything changes for our public profile or listings. Thank you.
> Trevor Robey, [DECIDE: title — same as the NDA Cover Page], Trevor Robey Intelligence Network Citations
> LLC, trevor@trevorobeyinc.com.

The signer's title is decided once, in the open-decisions table of
`../../08-contracts-legal/common-paper/mutual-nda.md`, and copied here so the NDA, the Order Form and this
case use the same one.

If the case goes out before the EIN exists (the `[DECIDE]` in §3), replace the attachment sentence with:
*"Attached is a certified copy of our Articles of Organization (California Certificate No. 457169837); our IRS
EIN confirmation letter will follow in this case as soon as it is issued."*

## 6 · Questions AWS may raise (answer from records, never from memory)

- **Tax interview.** It was completed on 2026-05-01, before the LLC existed (filed 2026-05-06). Which name and
  TIN it carries is not recorded in the repo (`tax-interview-w9.md` stores no identifiers). AWS may ask for it to be
  redone in the LLC's name. Under IRS Form W-9 (Rev. March 2024), a single-member LLC that is disregarded for
  federal tax gives the owner's name on line 1 and the LLC's name on line 2, with the owner's SSN (or EIN, if the
  owner has one). The entity's EIN goes on the form only if the LLC is classified as a corporation or partnership
  (<https://www.irs.gov/pub/irs-pdf/fw9.pdf>, read 2026-11-04).
  `[DECIDE: the LLC's federal tax classification and the TIN to give AWS — with a tax preparer]`
- **Bank account.** Disbursements go to the ACH account ending 262. Whose name it is in is not recorded here.
  `[PENDING: whether AWS needs a bank account in the LLC's name; a business account is blocked on the EIN]`
- **Business verification / KYC.** Global KYC was ruled out on 2026-07-22 as not needed for US selling
  (`../business-identity-map.md` §1). A legal-name change may still trigger business verification. Answer what
  AWS asks, with the documents in §4.

## 7 · After AWS replies

1. Record the case number and AWS's answer here, in a dated block below this line.
2. When AWS confirms, read the field back in the console. It must show "Trevor Robey Intelligence Network
   Citations LLC" exactly.
3. Then update `../business-identity-map.md` §1, step 8 of
   `../../00-business-formation/llc/certificate-of-formation.md`, and the "Known mismatch" note in
   `../../workspace/aws-marketplace-listing/trial-graveyard-feed/UPLOAD-RUNBOOK.md`. Not done in this draft.

## Sources (all read 2026-11-04)

- AWS Marketplace Seller Guide, "Step 1: Register and create your seller profile":
  https://docs.aws.amazon.com/marketplace/latest/userguide/create-public-profile.html
- AWS Marketplace Seller Guide, "Getting support for AWS Marketplace":
  https://docs.aws.amazon.com/marketplace/latest/userguide/getting-support.html
- AWS Partner Central, "AWS Partner Central settings":
  https://docs.aws.amazon.com/partner-central/latest/getting-started/partner-central-settings.html
- AWS Partner Central, "Getting support":
  https://docs.aws.amazon.com/partner-central/latest/getting-started/getting-support.html
- AWS What's New, "AWS Partner Central is now available in the AWS Management Console" (posted Nov 30, 2025):
  https://aws.amazon.com/about-aws/whats-new/2025/11/aws-partner-central-available-management-console
- IRS Form W-9 (Rev. March 2024): https://www.irs.gov/pub/irs-pdf/fw9.pdf
- Not reachable: the AWS re:Post knowledge-center article on Marketplace seller support
  (https://repost.aws/knowledge-center/marketplace-seller-support) answered HTTP 403. Nothing here relies on it.
- Form links named in AWS's docs, not opened (sign-in required):
  https://aws.amazon.com/marketplace/management/contact-us/ and
  https://partnercentral.awspartner.com/partnercentral2/s/newsupportcase

---

*Trevor Robey, INC. is the wordmark of Trevor Robey Intelligence Network Citations LLC, a California limited liability company.*
