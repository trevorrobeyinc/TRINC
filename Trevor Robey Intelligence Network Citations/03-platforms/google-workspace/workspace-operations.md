# Google Workspace — Business & AWS Seller-Ops Tailoring Plan

> **Purpose (2026-07-23).** `google-workspace.md` records *what the platform is*. This file records
> *how it is tailored to run the business* — mail routing, deadlines, documents, pipeline — now that
> (a) the Zoho→Gmail cutover is complete and (b) **AWS is cleared to publish PAID products**
> (disbursement added 2026-07-22), which turns a dormant channel into one with live obligations.
>
> **Scope boundary (enforced):** this is **operator-side Workspace usage only**. Engine-side Google
> Drive was deliberately removed 2026-07-01 and stays removed; the research engine never reads or
> writes Workspace. Nothing here wires Google into `run-workflow.js`.

## 0 · The problem this solves

Three findings from the 2026-07-23 architecture survey drive everything below:

1. **AWS correspondence has a documented history of being LOST.** A 2026-06-10 audit of both
   mailboxes found **zero** AWS seller-qualification emails. Root cause (confirmed live in the
   Notifications tab): the address AWS actually uses for **listing-review outcomes, payout failures,
   and policy changes** is the account **root email — `Trevor.Robey@my.strayer.edu`**, a university
   address that will be revoked on graduation.
2. **⚠️ The `aws@` custom-notification recipient added 2026-07-23 does NOT fix this.** AWS scopes that
   field to *Professional-services buyer requests, Reseller Opportunity events, and Consulting
   Partner Private Offers* — **none of which fire for a direct data-product seller.** It is a
   no-op for this business. The real fix is the root-email change (operator-only, R1).
   **⇢ Fixed 2026-10-21:** the root email is now `aws@trevorobeyinc.com` (a Workspace group that
   delivers to trevor@), so findings 1 and 2 are resolved; see `../aws-data-exchange/account-access.md`.
3. **Contractual SLAs now exist with zero tracking.** `provider-support-process.md` promises
   1-business-day acknowledgement; `refund-policy.md` promises 1-day ack / 10-business-day review /
   30-day claim window; the qualification package commits to monthly (high-velocity) and quarterly
   (standard) data-refresh cadences. All are **prose only** — no label, no filter, no calendar.
   Once a paid subscriber exists, a missed SLA is a commercial and reputational event.

## 1 · Gmail — routing & triage (implemented via `gmail-filters.xml`)

> **✅ ALL 11 FILTERS LIVE 2026-07-23** — verified by reading the Filters tab back. 10 imported
> from the XML; the 11th (Finance-Ops) was created by hand after diagnosing the failure below.
>
> **⚠️ Gotcha — "Could not import all the filters. Please fix the XML and try again."**
> That error is **misleading**: the XML was valid. Gmail **refuses to create a label named
> `Finance`** because it is a **reserved system label** (one of Gmail's built-in categories), so
> that single entry failed and Gmail blamed the file. Renamed to **`Finance-Ops`** and it worked.
> Reserved names to avoid when adding labels: *Finance, Personal, Promotions, Social, Updates,
> Forums, Travel, Purchases, Important, Starred, Sent, Draft, Spam, Trash, Inbox, Unread, Chat.*
> If an import ever partially fails again, read the Filters tab back and diff against this file —
> the missing entry names the culprit far faster than re-checking the XML.

Import: Gmail → Settings → **Filters and Blocked Addresses** → *Import filters* →
[`gmail-filters.xml`](./gmail-filters.xml) → Open file → Create filters.
Source-controlled here so the routing is reproducible and reviewable.

| Label | Catches | Why |
|---|---|---|
| **AWS/Seller-Ops** | `to:aws@` + Amazon/AWS mail mentioning Marketplace, Data Exchange, seller, listing, product review | The lost-correspondence failure. Never-spam + always-important. |
| **AWS/Payouts** | disbursement, payout, remittance, billed-revenue, seller reports | Disbursement runs **daily in USD**; payout failures must surface. |
| **AWS/Tax** | 1099-K, DAC7, tax interview, W-9, permanent establishment | Annual/periodic docs — exactly the class that gets buried. India PE notice pending. |
| **Support-SLA** | `to:support@` | Starred + important; backs the **1-business-day** contractual ack. |
| **Prospects** | **subject-only** match on SKU names / "discovery call" / "pre-mortem" | Founder-led outbound is the revenue motion; replies must not be missed. ⚠️ **Fixed 2026-07-23** — originally also matched `"trevorobeyinc.com" AND -from:trevorobeyinc.com`, which matched **nearly all inbound mail** (every message TO you carries your domain in its `To:` header). Observed live: CrowdStrike Falcon security alerts and Google security notices were labelled `Prospects` and marked important. **Never match on your own domain as a bare string.** |
| **Platforms** | Datarade, HuggingFace, Kaggle, Data & Sons | Secondary distribution channels. |
| **Legal** | CA SOS, FTB, IRS, bizfileOnline; NDA/SOW/MSA/Common Paper | Statutory mail — never-spam + starred. |
| **Finance-Ops** | Stripe, Mercury, Relay, Gumroad, Intuit | Ready for when a payment rail goes live. ⚠️ *Not* named "Finance" — see gotcha below. |
| **Vendors** | Cloudflare, Zoho, Anthropic, Workspace | Infrastructure billing/notices. |
| **Via-Strayer** | `to:Trevor.Robey@my.strayer.edu` | Added 2026-07-23. Catches anything arriving via the **Strayer→Gmail forward** (see §1b) and doubles as the liveness probe: if nothing carries this label for ~30 days, the forward is probably dead. |

### 1b · Strayer → Gmail forwarding (STOPGAP for the AWS root-email risk)

> **Superseded 2026-10-21:** the root email is now `aws@trevorobeyinc.com`, so this stopgap is no
> longer load-bearing. Retiring the forward, the `Via-Strayer` label and the monthly check is the
> operator's call; keep them a few weeks in case AWS mails the old address about the change.

**Why (as of 2026-07-23):** the AWS account root email was still `Trevor.Robey@my.strayer.edu`, and AWS sends
**listing-review outcomes, payout failures and policy changes** to the *root* address — the
alternate contacts (already `trevor@`) do **not** cover those categories. Option A (forward at
Strayer) buys time; it does **not** replace the root-email change (risk R1).

**Platform (verified by DNS 2026-07-23):** Strayer is **Microsoft 365 / Outlook** —
`autodiscover.strayer.edu → autodiscover.outlook.com`, `MS=` verification TXT records,
`lyncdiscover → webdir.online.lync.com`; **Proofpoint** (`pphosted.com` MX) sits in front as the
security gateway. The `google-site-verification` TXT records on the domain are for their website,
not mail — do not mistake them for Google Workspace.

**Operator steps:** <https://outlook.office.com/mail/options/mail/forwarding> → *Enable forwarding*
→ `trevor@trevorobeyinc.com` → tick *Keep a copy of forwarded messages* → Save.
(Or Settings ⚙ → Mail → Forwarding.)

> ### ✅ ENABLED AND VERIFIED WORKING — 2026-07-23
> Operator enabled forwarding; a round-trip test **arrived in ~30 seconds**, correctly labelled
> `Via-Strayer`. Strayer→Gmail forwarding is **live**. (Notably, external forwarding is *not*
> blocked by this tenant — the M365 default-block caveat above did not apply here.)
>
> **⚠️ The first test failed, and the test was the bug — not the forwarding.** Test #1 was
> subject `test`, body `hey mufuckkaaa`, from a personal Gmail. It **never arrived and never
> bounced**. Diagnosis: Strayer's **Proofpoint** gateway *accepted then quarantined* it — that
> message is a textbook spam signature (two-word generic subject, ultra-short body, profanity,
> free-mail sender, no prior correspondence), and quarantine holds silently rather than issuing
> an NDR. **The absence of a bounce was the key evidence** that the address was valid and the
> mailbox live: a bad address rejects at SMTP within seconds.
>
> **Lesson for any future mail-routing test:** use a realistic business message (real subject,
> full sentences, signature, no profanity). A "test / asdf" probe tells you nothing except how
> the spam filter feels about it. Diagnostic order that worked: (1) is it in the destination?
> (2) is it in spam/trash? (3) **is there a bounce in the sender's mailbox?** — no bounce +
> no delivery = accepted-then-filtered, not rejected.
>
> **Config re-verified at the source (Outlook Web, 2026-07-23):** *Enable forwarding* = **ON**,
> target = `trevor@trevorobeyinc.com`, banner confirms *"Email is being forwarded to
> trevor@trevorobeyinc.com."* **`Keep a copy of forwarded messages` was UNCHECKED — now ticked
> and saved**, so the Strayer mailbox retains its own copy as a second line of defence.
> Also visible in that inbox: a **Proofpoint quarantine digest**, corroborating the test-#1
> quarantine diagnosis above.
>
> ### 🔴 PROOF the root-email exposure is real, not theoretical (2026-07-23)
> A genuine **AWS Marketplace seller email landed in the Strayer inbox at 11:02 AM**:
> *"Regarding Your AWS Marketplace Seller Registration — Your seller profile has been approved"*,
> from `do-not-reply-aws-marketplace@amazon.com`, listing the tax/bank/disbursement steps for
> paid listings. **It is NOT in Gmail** — a search returns only the Jun 18 thread. Cause: it
> arrived *before* forwarding was switched on (~3 PM), and forwarding is not retroactive.
> Benign in itself, but it demonstrates the exact failure mode: **AWS seller correspondence
> really does route to the root (.edu) address**, and anything arriving while forwarding is
> off — or after the account is deprovisioned — is simply never seen. From now on this class of
> mail will forward and pick up **two** labels (`Via-Strayer` + `AWS/Seller-Ops`).
> Operator note: that 11:02 AM message should be manually forwarded to the business mailbox,
> since it will not backfill.

⚠️ **Expect this may be blocked.** Microsoft 365 disables automatic external forwarding by default
in most tenants (anti-exfiltration policy), and universities commonly keep it off. An inbox *rule*
that forwards is blocked by the same policy, and POP-fetching into Gmail won't work either
(Microsoft retired basic auth). **If it is blocked, there is no user-side workaround — go to the
root-email change.**

**Fragility:** forwarding dies **silently** when the school account is deprovisioned
(graduation/withdrawal), with no notice. Hence the `Via-Strayer` label + the monthly calendar check.

**Also configure (Gmail → Settings → Accounts):** ✅ **ALL DONE 2026-07-23, verified live**
- ✅ **Send mail as** — all three now present: `trevor@` (default), `aws@`, `support@`. Aliases
  *receive* by default but cannot *send* until added here.
  ⚠️ **Two layers, easily confused:** (1) the **alias exists** = Admin console → Users → Alternate
  email addresses (done days earlier — that's why mail already arrived); (2) **Gmail may send as
  it** = this Accounts screen. Adding a send-as does NOT create an alias and vice-versa.
  ⚠️ **Operator-only:** "Add another email address" opens a **separate window** that no Claude
  browser lane can reach, so these two entries are done by hand — budget ~1 min each.
- ✅ **Reply behavior → "Reply from the same address the message was sent to."** This is what makes
  the aliases worth having: mail to `support@` answers *from* `support@`, AWS mail from `aws@`,
  with no dropdown step. `trevor@` stays default (it is the address baked into contracts,
  collateral and 13 engine-code locations — do not "make default" an alias).
- ✅ **Signature "Business"** — set for BOTH new emails and replies/forwards, carrying the required
  entity disclosure (Cal. Bus. & Prof. Code §17910.5(a)):
  > Trevor Robey — Trevor Robey, INC.
  > Citation-traced biomedical due diligence · trevorobeyinc.com
  > *Trevor Robey, INC. is the wordmark of Trevor Robey Intelligence Network Citations LLC, a California limited liability company.*

> **Alias caveat (carried from `google-workspace.md`):** `support@` is an **alias on the single
> `trevor@` user**, not an independent mailbox and **not independently recoverable** — losing
> `trevor@` loses it. **`aws@` was converted to a Workspace Group on 2026-10-21** (the step this
> caveat called for before using it as the AWS root address): owner/member trevor@, anyone on the web
> may post, spam handling posts to the group instead of queueing. Mail to it still arrives `To:
> aws@trevorobeyinc.com`, so the `AWS/Seller-Ops` filter above keeps matching. **Open check:** the
> *Send mail as aws@* entry above was created against the alias and is still listed; it was not
> re-tested. If Gmail ever reports it unverified, re-verify it there (the code now arrives through
> the group). Details: `google-workspace.md` §8.

## 2 · Calendar — deadlines & recurring obligations

> **✅ CREATED LIVE 2026-07-23** (verified on the August + September month views): the four
> hard-date items below are now on the `trevor@trevorobeyinc.com` calendar as all-day events with
> full context in the description — **EIN (Jul 27)**, **Workspace trial / Zoho downgrade decision
> (Aug 5)**, **$800 CA Franchise Tax (Aug 15)**, **Statement of Information (Sep 16)**. Previously
> these existed only as prose in `certificate-of-formation.md`.
> **Added 2026-07-23:** a **monthly recurring** check (24th of each month, first fire 2026-08-24)
> — *"Check: is Strayer → Gmail forwarding still alive?"* with the 10-second test in the
> description (`label:Via-Strayer` quiet for ~30 days ⇒ the pipe is probably dead). Cheap insurance
> against a silently-broken stopgap; retire it once the AWS root email is changed.
>
> Still to add: India PE declaration (Q4), DMARC→quarantine review, and the recurring
> monthly/quarterly data-refresh cadences (those only start once a product is actually published).
>
> *Gotcha for whoever automates this next:* the Calendar `render?action=TEMPLATE` URL pre-fills
> cleanly, but the **first click on Save after page load is swallowed** (it focuses the close X
> instead) — click Save twice, and verify on the month view rather than trusting the toast.

Ordered by urgency:

| When | Item | Consequence if missed |
|---|---|---|
| **2026-08-05** (~) | **Workspace Business Starter trial ends** | Billing starts / service lapses — decide seat + edition |
| **2026-08-05** (~) | DMARC review → move `p=none` → `p=quarantine` after ~2 clean weeks | Spoofing exposure stays open |
| **2026-08-15** | **$800 CA Franchise Tax to FTB** — *~3 weeks out* | State penalties + interest; LLC in bad standing |
| **~2026-09-16** | **Statement of Information (Form LLC-12, $20)** — within 90 days of 2026-06-18 approval | $250 penalty; suspension risk |
| Q4 2026 | India PE tax declaration | Paid India sales suspended |
| Open | **EIN** (free, instant) | Blocks business banking + AWS legal-entity update |
| Recurring | **Monthly** data refresh (high-velocity: pharmacovigilance, CT.gov feeds) | Breaks a published cadence commitment |
| Recurring | **Quarterly** data refresh (standard products) | Same |
| Per-deal | 30-day refund-claim window; 10-business-day claim review | Contractual breach |
| On submit | AWS product review runs **5–7 business days** (first listing) | Set a hold when "Submit" is clicked |

## 3 · Drive — document structure (operator-side only)

Mirrors the repo's business folders so signed/authoritative artifacts have one home:

```
Trevor Robey, INC./
├── 00 Formation & Legal/     Articles, SOS cert, EIN (when issued), Operating Agreement, W-9
├── 01 Contracts/             Common Paper NDA/MSA/SOW executed copies, Certificate of Insurance
├── 02 AWS Marketplace/       Listing copy, DSA, data dictionaries, MANIFESTs, review correspondence
├── 03 Deliverables/          Client-delivered bundles (post-delivery copy; engine output stays local)
├── 04 Finance/               Invoices, 1099-K/DAC7, billed-revenue reports, P&L
└── 05 Collateral/            One-pagers, samples, teasers (current pricing only)
```

> ⚠️ Collateral staleness: `workspace/collateral/catalog/product-catalog.md` and the one-pagers still
> advertise a **retired pricing tier**. Fix before anything is handed to a prospect or copied to Drive.

## 4 · Sheets — pipeline tracking

`12-pipeline-tracking/` and the "Tracking Spreadsheet Columns" spec in
`07-outbound/prospect-targeting-guide.md` are already written as literal spreadsheet
specifications in markdown. Port them directly to two Sheets: **Outbound Pipeline**
(prospect → touch → reply → discovery call → NDA → SOW) and **KPIs / P&L**
(`11-financial-ops/pl-tracking.md` — contractor spend vs revenue). Baseline today: **$0 revenue,
zero activity.**

## 5 · What this does NOT do

- Does **not** wire Google into the research engine (2026-07-01 removal stands).
- Does **not** change the AWS root email — **operator-only, root + MFA** (risk R1 — **closed 2026-10-21**, root = `aws@`).
- Does **not** change the AWS public support contact from `trevor@` to `support@`/`aws@` — that's an
  `AdministratorAccess` portal change plus a repo-doc sync (`listing/product-description.md`,
  `product-creation.md:126`, `listing/data-eligibility-and-compliance.md:80`).
- Does **not** bind the Gmail MCP connector to the business mailbox — that connector is still on the
  **personal** Gmail (`config/connector-registry.json:488`); rebinding is a separate decision.

## 6 · Sequenced next actions

1. **Import `gmail-filters.xml`** — ⚠️ **operator must do this one**: Gmail → Settings → Filters and
   Blocked Addresses → *Import filters* → Choose File → pick
   `03-platforms/google-workspace/gmail-filters.xml` → Open file → Create filters.
   *(Claude cannot upload it — the browser file-upload tool only accepts files the operator has
   explicitly shared with the session; repo paths are rejected by design.)*
2. ~~**Create the calendar entries**~~ ✅ **DONE 2026-07-23** — 4 hard-date events live (see §2).
2b. ~~**Send-as + signature + reply behavior**~~ ✅ **DONE 2026-07-23** — verified live (§1).
3. **File the EIN** (free, instant, IRS online) — unblocks banking + the AWS legal-entity field. *(Operator)*
4. ~~**Change the AWS root email** off `my.strayer.edu` — the actual fix for lost AWS mail. *(Operator, root+MFA)*~~ ✅ **DONE 2026-10-21** — root = `aws@trevorobeyinc.com` (Workspace group).
5. **Publish the first AWS listing** — the free Pharmacovigilance Sample Pack is closest (blocked on
   MD→PDF conversion + a MANIFEST byte-count/file-count mismatch). *(Operator + engine)*
6. Build the two Sheets; sweep stale pricing from collateral.
