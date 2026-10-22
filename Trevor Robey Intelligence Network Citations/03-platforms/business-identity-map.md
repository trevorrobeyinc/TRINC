# Business Identity Map — who owns what, and what belongs in the work profile

> **Purpose (2026-07-22).** The operator created a dedicated Chrome profile — **"Trevor Robey
> Intelligence Network Citations"** — to separate business from personal. This file is the
> inventory that makes that real: every external account the business depends on, **which identity
> actually owns it**, and whether that's a business identity or a personal one. Built from a
> 2-agent repo-wide sweep + live checks. Companion: [`google-workspace/google-workspace.md`](./google-workspace/google-workspace.md).
>
> **Headline: the business runs on personal identities.** Mail is now properly business-owned, but
> the domain, the website, the code, and the LLM compute are all bound to personal accounts. (The AWS
> revenue channel was the worst case, a *university* address; it moved to a business group on
> 2026-10-21, R1 below.) Signing into the work profile is the easy half; the ownership fixes below
> are the half that actually reduces risk.
>
> **Reconciled 2026-10-21** against the 2026-10-21 operator confirmations (R1 closed, Zoho closed,
> EIN / LLC-12 / FTB 3522 not done). The obligations in §4 mirror
> [`../00-business-formation/compliance/compliance-calendar.md`](../00-business-formation/compliance/compliance-calendar.md);
> if the two disagree, the calendar wins.

## 1 · The structural risks (ranked — R1 closed 2026-10-21, three open)

| # | Risk | Why it matters | Fix |
|---|---|---|---|
| **R1** ✅ **CLOSED 2026-10-21** | ~~**AWS root email is `Trevor.Robey@my.strayer.edu`**~~ — a *university student* address — on account `833390816446`, which owns the entire AWS Marketplace revenue channel | Student email addresses are revoked after graduation/withdrawal. Losing it means losing root recovery on the account holding your seller listing and future disbursements. This was the single most fragile binding in the business. | **Done 2026-10-21:** root email → **`aws@trevorobeyinc.com`**, a Google **Group** (owner/member trevor@), not an alias. The operator signed in as root and typed the password and code; verified in Organizations (management account email) and Marketplace → Settings → Notifications. Billing + Operations alternate contacts → `aws@`; Security stays `trevor@`. Runbook + record: [`aws-data-exchange/account-access.md`](./aws-data-exchange/account-access.md). |
| **R2** | **Cloudflare is logged in as `trevoralexanderrobey@gmail.com`** (personal Gmail), account `f3b10bacc7e94c72e445b078433aa1d4` | That one personal account controls the **domain registration, all DNS (including the MX/SPF/DKIM that make business mail work), and the Worker serving trevorobeyinc.com**. Lose or compromise it and the business's web + mail presence goes with it. | Add `trevor@trevorobeyinc.com` as a Cloudflare account **Member (Super Administrator)**, then optionally transfer ownership. Do NOT simply move the domain — adding a business admin is reversible and non-disruptive. |
| **R3** | **Customer-facing collateral links to a personal portfolio** — Datarade provider application, Kaggle + HuggingFace setup docs still point at `trevorrobeyinc.github.io` | That URL is the operator's **personal** portfolio ("Trevor Robey — AI Systems & Digital Marketing Portfolio", live HTTP 200) — not the business site. Prospects clicking a business email land on a personal résumé page. Spelling trap: business = `trevorobeyinc.com` (one r), personal = `trevorrobeyinc` (two r's). | **`07-outbound/` FIXED 2026-07-22** (7 links across 4 cold-email + LinkedIn templates → `trevorobeyinc.com`). `REVENUE_PLAYBOOK.md:385` fixed earlier. **Still to fix:** `03-platforms/datarade/provider-setup-guide.md`, `03-platforms/kaggle-seo-breadcrumb/setup-guide.md`, `03-platforms/huggingface/setup-guide.md`. |
| **R4** | **The entire engine runs on one personal Claude Max 20× subscription** with no fallback (all OSS/local providers removed 2026-07-16) | 100% of scout/analyst/synthesizer compute. If that individual subscription lapses or hits its ceiling, the revenue-producing engine stops. No business/team Anthropic account exists. | Decide: keep personal-plan (accept risk) vs. open a business Anthropic account. Contingency plan already written in the engine `CLAUDE.md` (Token Efficiency §Phase 1 restores a local scout lane). |

### Live AWS console check (2026-07-22) — the `trevorrobeyinc@gmail.com` premise did NOT hold

Drove the logged-in AWS console (work profile) to check where `trevorrobeyinc@gmail.com` lives.
**It is not present anywhere in AWS.** Confirmed on-screen:
- **Account → Alternate contacts** (Billing, Operations, Security): all three already
  `trevor@trevorobeyinc.com`, title "Founder & CEO". ✓
- **Account → Contact information:** Trevor Robey / Trevor Robey Inc / 8161 Oahu Dr / +1 2792200923.
- **Marketplace → Settings → Public profile:** company website `https://trevorobeyinc.com` (one-r,
  correct); no support email shown.
- **Root login email:** not viewed (sensitive; root-security page). Per recon it is
  `Trevor.Robey@my.strayer.edu` — the actual R1 personal binding, and a *different* address than
  the one the operator named. **No AWS field was changed** — there was nothing set to
  `trevorrobeyinc@gmail.com` to change.

**Live seller status (read from the actual Settings tabs 2026-07-22 — supersedes the repo's
"approved, payout-review-held" framing):** seller account is **ACTIVE**; **Account status =
"Publish free products"** (free listings allowed today). To sell **paid** products / get paid:
- **Tax interview: Completed** (May 01 2026); **DAC7: Completed**; 1099K + DAC7 docs on file. ✓
- **Bank account: added** — one US-based ACH account (ending 262), verification "Not required". ✓
- **Disbursement method: NONE** — "No disbursement method"; banner "Disbursement information
  required." **This is the actual remaining gate**, plus "your public profile must also be verified."
- **Global KYC:** Business + Bank verification show "Not started" **but KYC is explicitly OPTIONAL
  for US selling** (the tab says it's required only for Korea/UK/EMEA transactions) — NOT the blocker.

**🎉 UPDATE (2026-07-22, later same day — verified live): disbursement method ADDED; account now
cleared for PAID.** The operator successfully set up the disbursement method (the step that had been
blocked ~2.5 months). Marketplace Account status flipped to **✓ "Publish paid and free products"**
(green) — was "Publish free products." So the **entire account-qualification chain is now complete**:
seller registered ✓ · tax/DAC7 ✓ · bank account ✓ · disbursement method ✓ · profile verified
(implied by the status). The §6 escalation letter in `correspondence-2026-05.md` is now **moot — do
not send it.** What remains before actual revenue is **product-side, not account-side:** create and
**publish a paid listing** (nothing paid is live yet — only a free sample pack was staged), which
goes through AWS's own product review. India PE tax-declaration notice still pending (only affects
paid India buyers, Q4 2026).

**✅ FOLLOW-UP (2026-07-22 evening) — full seller-profile survey + 2 fixes applied.** Drove the
logged-in Marketplace + Billing consoles end to end. Confirmed complete: account status **"Publish
paid and free products"**; tax interview + DAC7 **Completed**; bank ACH ending 262; **disbursement
method ACTIVE (USD, Daily schedule)**. Three findings, two changes:

- **Global KYC ruled OUT — not needed.** AWS's own tab text: KYC *"is not mandatory to transact on
  AWS Marketplace"* — required only for Republic-of-Korea payouts, U.K.-based bank accounts, or to
  improve EMEA buyer invoicing. The per-region table shows the **only hard block is South Korea
  disbursement**; EMEA / Japan / Australia / Rest-of-world are all Transaction=Allowed +
  Disbursement=Allowed. KYC would merely move EMEA invoicing from AWS Inc → AWS EMEA SARL (a
  VAT/invoicing nicety for European buyers). **No Korean buyers ⇒ skip.** Revisit only if a Korean
  buyer appears, or an EMEA enterprise demands SARL invoicing.
- **⚠️ R1 SHARPENED — the Marketplace notification email IS the account ROOT email.** Settings →
  Notifications shows `Trevor.Robey@my.strayer.edu`, and its "Change email address" link is **not an
  edit form** — it redirects to AWS's *root-user email change* knowledge-center article. Confirmed
  live: under the IAM Identity Center SSO identity, Billing → Account shows **no email field and no
  edit control at all**. So this is the R1 root-email change — **root sign-in + password + MFA,
  operator-only.** The "Email for custom notifications" side-path does **NOT** substitute: it covers
  only Professional-services buyer requests, Reseller Opportunities, CPPO offers, and recurring scan
  reminders — none of which a data-product seller receives. Listing-review outcomes, payout failures,
  and policy changes all go to the root address. **Do not let that student mailbox lapse before the
  swap is done** — it is also the account-recovery path.
  **⇢ Swap DONE 2026-10-21:** the Notifications tab now shows `aws@trevorobeyinc.com` (the root
  email, changed by the operator as root the same morning).
  **The stranded 07-23 11:02 email** ("Your seller profile has been approved", still only in the
  Strayer inbox) **is no longer needed (decided 2026-10-21):** every step it lists (tax, bank,
  disbursement) was completed and read back live on 07-22, and Strayer is no longer the recovery
  path. Optional archive step, one minute, best done when the Strayer stopgap is retired: in
  Strayer Outlook search `seller profile has been approved`, forward it to `aws@trevorobeyinc.com`.
- **✅ CHANGED — account Contact information corrected** (Billing → Account → Contact information):
  **Company name** `Trevor Robey Inc.` → **`Trevor Robey Intelligence Network Citations LLC`**;
  **Website URL** *(blank)* → **`https://trevorobeyinc.com`**. Verified saved ("Your contact
  information was updated successfully"); full name / phone / address deliberately untouched.
  **Two different fields — don't conflate them:** this is the *account* company name. The
  **Marketplace "Legal business name"** still reads the wordmark "Trevor Robey Inc" and still needs
  stamped Articles **+ EIN** via a Support case.

## 2 · Identity inventory

Legend — **B** = business-owned · **P** = personal-owned (entanglement) · **?** = undocumented

| Service | Purpose | Bound identity | | Crit. |
|---|---|---|---|---|
| **Google Workspace** | primary mailbox + identity | `trevor@trevorobeyinc.com` (super-admin) — *but recovery = personal Gmail; password in personal Bitwarden* | **B** | HIGH |
| ~~**Zoho Mail**~~ | **CLOSED 2026-10-21** (operator decision): Mail Lite cancelled, domain and org deleted, Zoho mailed "Your Zoho account is closed" at 04:55; DNS cleaned (SPF Google-only, no Zoho DKIM or verification TXT). **Gmail does NOT hold the full Zoho history:** the 07-22 import reported 1,251/1,251, but a 10-21 check found only 17 pre-cutover conversations in Gmail, and the Sent-only threads were let go by the operator. Record: `~/Security Everything/docs/browser-session-history/2026-10.md`, entry 2026-10-21 04:14. | — (was `trevor@trevorobeyinc.com` on Mail Lite) | **B** | — |
| **Cloudflare** | registrar + DNS + Worker hosting the live site | `trevoralexanderrobey@gmail.com` | **P** | HIGH |
| **AWS** (acct `833390816446`) | Marketplace seller channel | root = **`aws@trevorobeyinc.com`** (Workspace group, since 2026-10-21; was the Strayer `.edu`); SSO user `Trevoralexanderrobey` + 2 YubiKeys; seller *contact* = trevor@ (business); alternate contacts Billing/Operations = aws@, Security = trevor@ | **B** | HIGH |
| **CA SOS bizfileOnline** | LLC system of record; Statement of Information + future filings | **An account exists; its login email is not recorded.** The Articles were filed online 2026-05-06, and the Welcome Letter, Filing Acknowledgment and certified-copy zip in `~/Documents` were all downloaded from the signed-in portal on 2026-06-18 ~22:56–23:01 PDT (file download metadata, read 2026-10-21). Per the SOS *Account Setup and User Access Guide* (v8.22.24), the submitter of an online initial filing gets Full Access to the entity record — which the LLC-12 now needs (User Access required since 2026-08-01). Find the login: search Bitwarden for `sos.ca.gov`, then record the email here. | **?** | HIGH |
| **CA FTB** | $800 annual LLC tax (Form 3522), Form 568 | No MyFTB account recorded. Web Pay for Businesses needs no account: entity ID = the 11 digits of the SOS number (`20260217250`), not the EIN (FTB Tax News, June 2025). | **?** | HIGH |
| **GitHub `trevoralexanderrobey`** | CODEOWNER of the engine; predecessor repo (deleted) | personal username | **P** | HIGH |
| **GitHub `trevorrobeyinc`** | hosts `trevorrobeyinc.github.io` — the **personal portfolio** | personal (business-sounding handle — a trap) | **P** | MED |
| **HuggingFace** | dataset credibility play | personal handle `Trevorrobey`; org `trevorrobeyinc` **not yet created** | **P** | MED |
| **Anthropic / Claude** | 100% of engine LLM compute | personal Claude Max 20× (no business account) | **P** | HIGH |
| **LinkedIn** | primary B2B outbound, founder voice | personal profile (no company page) | **P** | MED |
| **Datarade** | marketplace vendor (declined 2026-05-20, re-apply planned) | `trevor@trevorobeyinc.com` | **B** | MED |
| **Gumroad** | parked payment page | order mail → trevor@; login identity undocumented | **?** | LOW |
| **Google Business Profile** | free listing (cover photo only asset) | **UNKNOWN** — never claimed/documented | **?** | LOW |
| **Kaggle** | free visibility play | **UNKNOWN** — account creation unconfirmed | **?** | LOW |
| **IRS EIN** | **not applied for** (operator re-confirmed 2026-10-21) — a **federal IRS** number, **NOT** in bizfileOnline/CA SOS (verified 2026-07-22: neither the filing receipt nor the certified copy contains one; no CA form collects it). Apply free at irs.gov → confirmation = **IRS Notice CP 575**. Blocks business bank account + the AWS Marketplace legal-name update. Does **not** gate AWS disbursement (done 2026-07-22 on the existing ACH account). See [`../00-business-formation/llc/ein-confirmation.md`](../00-business-formation/llc/ein-confirmation.md) | n/a | **?** | HIGH |
| **Business bank (Mercury/Relay)** | **not opened** — blocked on EIN | n/a | **?** | MED |
| **npm / Obsidian stack** | consume-only / local-only — no accounts exist | n/a | — | LOW |

> Placeholder-only, no live account: Stripe, CommonPaper, Northwest Registered Agent, Snowflake &
> Databricks Marketplace, Ocean Protocol, Substack/Patreon, Data & Sons, Guidepoint/Third Bridge.
> Explicitly rejected as business channels: Outlier.ai, Mindrift.ai (personal side-income only).

## 3 · Work-profile consolidation checklist

Chrome profile **"Trevor Robey Intelligence Network Citations"** — sign in with the business
identity wherever one exists; where the account is personal-owned, still sign in *in this profile*
so the browsing surface is separated, and track the ownership fix separately (§1).

- [x] Google Workspace / Gmail — `trevor@trevorobeyinc.com`
- [x] ~~Zoho Mail~~ — account CLOSED 2026-10-21; nothing left to sign in to (clear any saved Zoho login in this profile when convenient)
- [x] Claude extension installed (this profile drives all business browser work)
- [ ] **Cloudflare** — sign in here; then R2 (add trevor@ as Super Administrator)
- [ ] **AWS** — IAM Identity Center SSO portal `https://d-90660e72bc.awsapps.com/start` + YubiKey (R1 root email ✅ done 2026-10-21)
- [ ] **GitHub** — decide which account is the business one; sign that one in here
- [ ] **HuggingFace** — sign in; create the `trevorrobeyinc` **org** and transfer/publish under it
- [ ] **LinkedIn** — personal profile stays personal, but consider a **company page** for the LLC
- [ ] **Datarade**, **Gumroad**, **Kaggle** — sign in here when next touched; record the identity in this file
- [ ] **CA SOS bizfileOnline** — the account exists (used 2026-06-18); find its login email in Bitwarden (`sos.ca.gov`), record it in §2, sign in here (needed for the Statement of Information)
- [ ] **Bitwarden** — install in this profile; consider a separate business vault/collection
- [ ] Chrome: set this profile's sync to the Workspace account; bookmark the business consoles

## 4 · Time-bound obligations (mirror of the compliance calendar, 2026-10-21)

**Operator-confirmed 2026-10-21: none of the three is done; two are past due.** Order, steps and
the one-sitting walk-through:
[`compliance-calendar.md`](../00-business-formation/compliance/compliance-calendar.md) →
[`filing-walkthrough-2026-10.md`](../00-business-formation/compliance/filing-walkthrough-2026-10.md).
(The 2026-08-20 annotation here, "unverified, not necessarily unpaid", is superseded by that
confirmation.)

| # | Obligation | Due | Status 2026-10-21 | Cost |
|---|---|---|---|---|
| 1 | IRS EIN | no statutory deadline; blocks the bank account and the AWS "Legal business name" | not applied for | free |
| 2 | Statement of Information, Form LLC-12 (CA SOS) | 2026-09-16 | **not filed, 35 days past due** | $20 |
| 3 | $800 annual LLC tax, Form FTB 3522 | 2026-08-15 (a Saturday, so 2026-08-17 without penalty) | **not paid, 67 days past due** | $800 + penalty and interest as billed |
| — | ~~AWS Seller-Operations escalation letter~~ | — | **moot 2026-07-22** (disbursement cleared without it; do not send) | — |

**Mail check for agency notices (2026-10-21, ~16:55 PDT, operator's go, Claude Browser pane signed in
as `trevor@trevorobeyinc.com` by the operator): ZERO agency mail.**
- `{from:sos.ca.gov from:ftb.ca.gov B20260217250 bizfile "Franchise Tax Board"} after:2026/05/01` → no messages.
- Broadened to all time, spam and trash included (`in:anywhere`; adds `from:irs.gov`, `from:ca.gov`,
  "Statement of Information", "Secretary of State", "Franchise Tax", "Employer Identification",
  "LLC-12", "3522") → no messages. Positive control in the same tab (`in:anywhere "AWS Marketplace"`)
  returned 3 conversations, so the search itself worked. Cross-check not needed: `trevor@`'s "Legal"
  filter (since 07-23, per the workspace-setup session) stars and labels exactly
  `from:(sos.ca.gov OR ftb.ca.gov OR irs.gov OR bizfileonline.sos.ca.gov)`, the senders already searched.
  Since 2026-10-16 `trevor@` also forwards a copy of all mail to `trevorrobeyinc@gmail.com`.
- **What this does and does not prove.** No SOS, FTB or IRS email has reached `trevor@` since the
  2026-07-22 Gmail cutover, and none of the pre-cutover mail imported from Zoho matches. It does
  **not** cover mail sent to `trevor@` while it lived on Zoho (May–July): Zoho is closed and that
  history was only partly imported. It also says nothing about the bizfile account's own email or
  `trevorrobeyinc@gmail.com` (not searched). FTB and SOS notices come by **post**, so the paper mail at
  8161 Oahu Dr remains the place a penalty notice would be.
- The bizfile login email is therefore still unknown: Bitwarden (`sos.ca.gov`) is the next place to look.
- Earlier the same afternoon the `gmail` connector route (it reaches `trevorrobeyinc@gmail.com` only)
  was armed once and stopped at `client_malformed` (an email address sealed where the Google client
  ID belongs); no token, no mail read. Fixing it is the operator's re-seal (Security Everything
  `gmail-mcp/gmail_setup.py --seal-client --replace`), not needed for this check.

## 5 · Notes

- **Signing in ≠ owning.** Putting a personal-owned account into the work profile separates
  *browsing*, not *ownership*. Both matter; don't let the first create a false sense of the second.
- **Don't mass-migrate accounts in one sitting.** Each ownership change (R1, R2) is a recovery-path
  change — do them one at a time, verify you can still log in, then move on.
- Every identity fact here is repo- or live-sourced; when one changes, update this file **and**
  `google-workspace.md` if it touches mail identity.
