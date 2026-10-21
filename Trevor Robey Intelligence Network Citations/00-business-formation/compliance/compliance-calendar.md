# Compliance calendar — Trevor Robey Intelligence Network Citations LLC

> **Status as of 2026-10-21 — operator-confirmed: NONE of the three filings below has been made.**
> Two are **past due**. Nothing here is filed, paid or submitted by any agent: this file prepares
> the work, the operator does it. Source of truth for every fact below:
> [`../llc/certificate-of-formation.md`](../llc/certificate-of-formation.md) and
> [`../llc/ein-confirmation.md`](../llc/ein-confirmation.md). If a date here and those files disagree,
> those files win — fix this one.

Entity: **Trevor Robey Intelligence Network Citations LLC** · CA Entity No. **B20260217250** · filed
2026-05-06 · approved **2026-06-18**.

## Open — do in this order

| # | Obligation | Due | Status 2026-10-21 | Cost (from the filing record) | Where |
|---|---|---|---|---|---|
| 1 | **IRS EIN** (federal; no California filing ever produces one) | No statutory deadline — but it blocks the bank account and the AWS "Legal business name" update | **Not applied for** | Free | IRS online EIN application: <https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online> |
| 2 | **Statement of Information, Form LLC-12** (CA Secretary of State) | Within 90 days of approval → **2026-09-16**. Then every two years. | **NOT FILED — past due (35 days on 2026-10-21)** | $20 filing fee | bizfileOnline.sos.ca.gov |
| 3 | **$800 annual LLC tax, Form FTB 3522** (CA Franchise Tax Board) | 15th day of the 4th month after formation → **2026-08-15** | **NOT PAID — past due (67 days on 2026-10-21)** | $800 | FTB (ftb.ca.gov) — Form 3522 / FTB online payment |

**Why this order:** the EIN is free and immediate and unblocks other work; the LLC-12 is $20 and
online; the $800 is the largest and is accruing the longest. Penalty and interest amounts are **not
recorded in this repo** — read them from the FTB and Secretary of State notices or sites when filing,
and record the actual amounts paid here. Do not assume the late items were waived.

**Already late — so the next step is to file now, not to plan.** Missing the LLC-12 can lead to a
penalty and, if left long enough, suspension by the Secretary of State; an unpaid FTB 3522 accrues
penalties and interest and can lead to suspension by the FTB. A suspended entity cannot contract or
sell — which would block the first AWS listing.

## After each one is done, record it

- **EIN** → fill in [`../llc/ein-confirmation.md`](../llc/ein-confirmation.md) from IRS Notice CP 575
  (save the PDF outside the repo; record only the facts). Then: open the business bank account
  (`../banking/`), and open the AWS Support case to set the seller "Legal business name" (stamped
  Articles + EIN).
- **LLC-12** → date filed, confirmation number, next due date (two years later), here and in
  `certificate-of-formation.md` → Next steps.
- **FTB 3522** → date paid, amount including any penalty/interest, confirmation number. Next year's
  $800 is due on the 15th day of the 4th month of the next taxable year — confirm the date with FTB
  rather than assuming.

## Other formation items still open (from the 2026-10-21 handoff)

These are placeholders in the repo today, not completed records:

| Item | Repo file | State |
|---|---|---|
| Business bank account | `../banking/mercury-account.md`, `../banking/relay-account.md` | Placeholder — needs the EIN first |
| Single-member operating agreement | `../llc/operating-agreement.md` | Placeholder (kept private, not filed with the state) |
| E&O / cyber insurance | `../insurance/bound-policy-eo-cyber.md` | Placeholder — quotes on file, no bound policy recorded |
| Written refund policy | `../../08-contracts-legal/refund-policy-boilerplate.md` | **Placeholder only** (a title line: "Material Defect 30-day window, 15-business-day correction"), yet `OFFERINGS.md` promises a refund-backed SLA — do not extend that promise until the policy is written |

## Platform obligations (for completeness)

- **AWS Data Exchange** — cleared for paid products since 2026-07-22. Before the first paid listing:
  accept AWS's StandardDSA (removes the counsel gate on the custom DSA) and move the AWS root email off
  the `.edu` address (risk R1). Both are operator console steps.
