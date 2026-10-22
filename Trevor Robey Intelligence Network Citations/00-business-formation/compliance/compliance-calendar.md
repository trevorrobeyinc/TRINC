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
| 2 | **Statement of Information, Form LLC-12** (CA Secretary of State) | Within 90 days of approval → **2026-09-16**. Then every two years. | **NOT FILED — past due (35 days on 2026-10-21)** | $20 filing fee | bizfileOnline.sos.ca.gov — since **2026-08-01** the online LLC-12 needs **User Access** to the entity record. The login that filed the Articles online (2026-05-06) has it; its email is not recorded (find it in Bitwarden). Without it, a PIN letter is mailed to 8161 Oahu Dr. |
| 3 | **$800 annual LLC tax, Form FTB 3522** (CA Franchise Tax Board) | 15th day of the 4th month after formation → **2026-08-15** (a Saturday; FTB moves a weekend due date to the next business day, 2026-08-17) | **NOT PAID — past due (67 days on 2026-10-21)** | $800 | FTB **Web Pay for Businesses** (ftb.ca.gov/pay), entity ID **`20260217250`** (the 11 digits of the SOS number; Web Pay does not take the EIN). Paying by Web Pay = do not also mail a 3522. |

**One-sitting walk-through with every answer pre-filled:** [`filing-walkthrough-2026-10.md`](./filing-walkthrough-2026-10.md).

**Agency mail check, 2026-10-21:** zero SOS / FTB / IRS email in `trevor@trevorobeyinc.com`, all time,
spam and trash included (positive control passed). That covers mail since the 2026-07-22 Gmail cutover,
not the Zoho period, and agency notices come by post: check the paper mail before filing. Record:
`../../03-platforms/business-identity-map.md` § 4.

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

## Coming next (recurring; confirm each date with the agency when it nears)

| Due | Obligation | Basis (read 2026-10-21) |
|---|---|---|
| **2027-04-15** | $800 annual LLC tax for taxable year 2027 (FTB 3522 or Web Pay) | 15th day of the 4th month of the taxable year; a single-member LLC follows its owner's calendar year. No first-year exemption applies to 2026: it covered taxable years beginning 2021–2023 only (FTB 568 booklets). |
| **2027-04-15** | Form 568 (LLC Return of Income) for taxable year 2026 | Single-member LLC owned by an individual: 15th day of the 4th month after the close of the owner's taxable year (FTB 568 booklet). |
| **2027-12-01 → 2028-05-31** | Biennial Statement of Information (LLC-12), $20 | Formation month May → filing window December–May (SOS "Statements of Information Filing Tips" table), every two years. bizfile shows the next due date after this filing; record it then. |

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
  accept AWS's StandardDSA (removes the counsel gate on the custom DSA). The other gate, moving the
  AWS root email off the `.edu` address (risk R1), was **done 2026-10-21** (root = `aws@trevorobeyinc.com`).
