# Business Identity Map — who owns what, and what belongs in the work profile

> **Purpose (2026-07-22).** The operator created a dedicated Chrome profile — **"Trevor Robey
> Intelligence Network Citations"** — to separate business from personal. This file is the
> inventory that makes that real: every external account the business depends on, **which identity
> actually owns it**, and whether that's a business identity or a personal one. Built from a
> 2-agent repo-wide sweep + live checks. Companion: [`google-workspace/google-workspace.md`](./google-workspace/google-workspace.md).
>
> **Headline: the business runs on personal identities.** Mail is now properly business-owned, but
> the domain, the website, the AWS revenue channel, the code, and the LLM compute are all bound to
> personal (or worse, *university*) accounts. Signing into the work profile is the easy half;
> the ownership fixes below are the half that actually reduces risk.

## 1 · The four structural risks (ranked — fix in this order)

| # | Risk | Why it matters | Fix |
|---|---|---|---|
| **R1** | **AWS root email is `Trevor.Robey@my.strayer.edu`** — a *university student* address — on account `833390816446`, which owns the entire AWS Marketplace revenue channel | Student email addresses are revoked after graduation/withdrawal. Losing it means losing root recovery on the account holding your seller listing and future disbursements. This is the single most fragile binding in the business. | Change AWS root email → `trevor@trevorobeyinc.com` (or `aws@`). AWS Console → Account settings → root user email. **Operator-only** (root + MFA). |
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

So the honest answer: **registered seller, can list free products now; one step short of paid** —
tax ✓ and bank ✓ are done, the missing piece is **setting up the disbursement method** (link the
ACH account) + public-profile verification. Setting up a disbursement method is exactly the action
that historically returned *"your account is still being reviewed"* (`correspondence-2026-05.md`).
**Operator-only** (it's how money is received — I won't configure a payout method). Recommendation:
the operator opens Payment information → Disbursement methods → set up; if it still errors, that's
the trigger to finally send the §6 escalation letter; if it succeeds, paid listings are unblocked.
(Also new: an India Permanent-Establishment tax-declaration notice — paid India sales suspendable
Q4 2026 if not addressed; minor/separate.)

## 2 · Identity inventory

Legend — **B** = business-owned · **P** = personal-owned (entanglement) · **?** = undocumented

| Service | Purpose | Bound identity | | Crit. |
|---|---|---|---|---|
| **Google Workspace** | primary mailbox + identity | `trevor@trevorobeyinc.com` (super-admin) — *but recovery = personal Gmail; password in personal Bitwarden* | **B** | HIGH |
| **Zoho Mail** | archive of pre-cutover history | `trevor@trevorobeyinc.com` (paid Mail Lite, downgrade candidate) | **B** | MED |
| **Cloudflare** | registrar + DNS + Worker hosting the live site | `trevoralexanderrobey@gmail.com` | **P** | HIGH |
| **AWS** (acct `833390816446`) | Marketplace seller channel | root = `Trevor.Robey@my.strayer.edu`; SSO user `Trevoralexanderrobey` + 2 YubiKeys; seller *contact* = trevor@ (business) | **P** | HIGH |
| **CA SOS bizfileOnline** | LLC system of record; Statement of Information + future filings | **UNKNOWN** — never recorded | **?** | HIGH |
| **GitHub `trevoralexanderrobey`** | CODEOWNER of the engine; predecessor repo (deleted) | personal username | **P** | HIGH |
| **GitHub `trevorrobeyinc`** | hosts `trevorrobeyinc.github.io` — the **personal portfolio** | personal (business-sounding handle — a trap) | **P** | MED |
| **HuggingFace** | dataset credibility play | personal handle `Trevorrobey`; org `trevorrobeyinc` **not yet created** | **P** | MED |
| **Anthropic / Claude** | 100% of engine LLM compute | personal Claude Max 20× (no business account) | **P** | HIGH |
| **LinkedIn** | primary B2B outbound, founder voice | personal profile (no company page) | **P** | MED |
| **Datarade** | marketplace vendor (declined 2026-05-20, re-apply planned) | `trevor@trevorobeyinc.com` | **B** | MED |
| **Gumroad** | parked payment page | order mail → trevor@; login identity undocumented | **?** | LOW |
| **Google Business Profile** | free listing (cover photo only asset) | **UNKNOWN** — never claimed/documented | **?** | LOW |
| **Kaggle** | free visibility play | **UNKNOWN** — account creation unconfirmed | **?** | LOW |
| **IRS EIN** | **not applied for** — blocks bank account, AWS legal-entity update, disbursement | n/a | **?** | HIGH |
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
- [x] Zoho Mail — `trevor@trevorobeyinc.com`
- [x] Claude extension installed (this profile drives all business browser work)
- [ ] **Cloudflare** — sign in here; then R2 (add trevor@ as Super Administrator)
- [ ] **AWS** — IAM Identity Center SSO portal `https://d-90660e72bc.awsapps.com/start` + YubiKey; then R1 (root email)
- [ ] **GitHub** — decide which account is the business one; sign that one in here
- [ ] **HuggingFace** — sign in; create the `trevorrobeyinc` **org** and transfer/publish under it
- [ ] **LinkedIn** — personal profile stays personal, but consider a **company page** for the LLC
- [ ] **Datarade**, **Gumroad**, **Kaggle** — sign in here when next touched; record the identity in this file
- [ ] **CA SOS bizfileOnline** — find the login, record it here (needed for the Statement of Information)
- [ ] **Bitwarden** — install in this profile; consider a separate business vault/collection
- [ ] Chrome: set this profile's sync to the Workspace account; bookmark the business consoles

## 4 · Time-bound obligations surfaced by this sweep (not identity, but urgent)

| Deadline | Item | Source |
|---|---|---|
| **2026-08-15** | **$800 CA Franchise Tax** to FTB — *~3 weeks out* | `00-business-formation/llc/certificate-of-formation.md:56` |
| **~2026-09-16** | Statement of Information (Form LLC-12, $20) — within 90 days of the 2026-06-18 approval | same, :55 |
| open | IRS EIN (free, instant online) — gates bank account + AWS legal-entity field | same, :54 |
| open | AWS Seller-Operations escalation letter (ready, unsent since 2026-06-02) | `03-platforms/aws-data-exchange/correspondence-2026-05.md` §6 |

## 5 · Notes

- **Signing in ≠ owning.** Putting a personal-owned account into the work profile separates
  *browsing*, not *ownership*. Both matter; don't let the first create a false sense of the second.
- **Don't mass-migrate accounts in one sitting.** Each ownership change (R1, R2) is a recovery-path
  change — do them one at a time, verify you can still log in, then move on.
- Every identity fact here is repo- or live-sourced; when one changes, update this file **and**
  `google-workspace.md` if it touches mail identity.
