# Filing walk-through: EIN → LLC-12 → FTB 3522 in one sitting

> Prepared 2026-10-21 for the operator. **Nothing here has been filed, paid or submitted by any
> agent**; every step is the operator's. The tracker is [`compliance-calendar.md`](./compliance-calendar.md);
> the entity facts come from [`../llc/certificate-of-formation.md`](../llc/certificate-of-formation.md).
> Agency facts were read from irs.gov and sos.ca.gov on 2026-10-21; ftb.ca.gov refuses automated
> page reads (HTTP 403), so the FTB facts come from FTB's own 2026 Form 3522 instructions and June 2025
> Tax News as indexed by search. Where a screen differs from this file, **the screen wins**: note the
> difference at the bottom.

**Time:** about 45 minutes. **When:** a weekday between 3:00 a.m. and 10:00 p.m. Pacific (the IRS
online EIN window is Mon–Fri 6:00 a.m.–1:00 a.m. Eastern; Sat 6:00 a.m.–9:00 p.m. ET; Sun
6:00 p.m.–midnight ET).

## 0 · Before you start (10 minutes)

1. **Check the paper mail at 8161 Oahu Dr.** The FTB and the Secretary of State send notices by
   post; the IRS never starts contact by email. Put any FTB or SOS letter next to you: it carries
   the notice number and the amount they computed.
2. **Find the bizfile login.** The account that filed the Articles online on 2026-05-06 already has
   Full Access to the entity record (you used it on 2026-06-18 to download the Welcome Letter and the
   Filing Acknowledgment). Search Bitwarden for `sos.ca.gov`. Its username is an email address.
   *If it isn't there:* also try "Need help signing in?" on the bizfile login page with each of your
   addresses. Still nothing → step 2's fallback.
3. Have ready: your SSN (you type it into the IRS form; it never goes into chat or this repo), a
   Visa or Mastercard for the $20, and the bank routing and account number for the $800.
4. **Ignore mailers** offering to file your Statement of Information for $200 or more. They are not
   the state, and paying them does not meet the filing obligation (SOS alert "Misleading Statement of
   Information Solicitations"). The real fee is $20 at bizfileonline.sos.ca.gov.

Optional, zero touches: paste this into the search box of each mailbox you own (Workspace
`trevor@`, `trevorrobeyinc@gmail.com`, your personal Gmail) to see what the agencies have already
sent, and which address bizfile writes to:

```
{from:sos.ca.gov from:ftb.ca.gov B20260217250 bizfile "Franchise Tax Board"} after:2026/05/01
```

(**Already run on `trevor@trevorobeyinc.com`, 2026-10-21: zero hits**, also all-time with spam and
trash. Details and limits under § 4 of `../../03-platforms/business-identity-map.md`. Still unsearched:
`trevorrobeyinc@gmail.com`, your personal Gmail, and anything that went to `trevor@` while it was on
Zoho.)

## 1 · IRS EIN (free, about 15 minutes)

Start at <https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online>
→ **Apply online now**. Rules from that page (updated 2026-10-16): **one sitting** (you cannot save),
the session **expires after 15 minutes idle**, **one EIN per responsible party per day**, and an
approved EIN is **issued immediately online**.

| The form asks | Answer |
|---|---|
| Type of entity | **Limited Liability Company (LLC)** |
| Number of members | **1** |
| State where the LLC is located | **California** |
| Why you are requesting an EIN | **Started a new business** |
| Responsible party | **Individual: Trevor Robey**, your SSN |
| Physical / mailing address | **8161 Oahu Dr, Fair Oaks, CA 95628** (county: **Sacramento**) |
| Legal name | **Trevor Robey Intelligence Network Citations LLC**: exactly as filed, no abbreviations. The IRS accepts letters, numbers, `-` and `&` only (this name needs none of the others). Its internal manual caps a name line at 35 characters; if the field cuts the name off, let it, and check what the confirmation letter shows. |
| Trade name / DBA | **Leave blank.** The wordmark "Trevor Robey, INC." contains "INC", which the IRS would read as a corporation; the legal name is what the bank and AWS need. |
| Date the business started | **05/2026** (Articles filed 2026-05-06) |
| Closing month of accounting year (if asked) | **December** |
| Employees in the next 12 months | **None** |
| Principal activity | the nearest category, else **Other** → in your own words (e.g. biomedical research and data services) |
| How to receive the confirmation letter | **Online** → save the PDF to `~/Documents/` beside the SOS PDFs, **not** in this repo |

Do **not** elect S-corporation status here; that waits for revenue and a CPA
([`../tax/s-corp-election.md`](../tax/s-corp-election.md)).

**Record:** EIN, date, and where the PDF is saved → [`../llc/ein-confirmation.md`](../llc/ein-confirmation.md) § Record.

## 2 · Statement of Information, Form LLC-12 ($20, about 10 minutes)

Since **2026-08-01** the online Statement of Information appears only to a bizfile user with
**User Access** to the entity record (sos.ca.gov/business-programs/bizfile).

1. <https://bizfileonline.sos.ca.gov> → **Login** (the account from step 0.2).
2. **My Records** → **Trevor Robey Intelligence Network Citations LLC** (B20260217250) →
   **File Statement of Information**.

| The form asks | Answer (from the filed Articles) |
|---|---|
| Principal office address | **8161 Oahu Dr, Fair Oaks, CA 95628-3745** |
| Mailing address | same |
| Managers, or each member if none | member-managed, no managers → member **Trevor Robey**, 8161 Oahu Dr, Fair Oaks, CA 95628-3745 |
| Chief executive officer | only if you have appointed one; otherwise leave blank |
| Agent for service of process | **Individual: Trevor Robey**, same address (as on the Articles; a commercial agent is optional and a separate decision) |
| Type of business | your own words (e.g. biomedical research and data services) |
| Outstanding final labor judgment against any member or manager? | answer truthfully |
| Email for notices (if offered) | **trevor@trevorobeyinc.com**, so future SOS reminders reach the business mailbox |
| Signature | your typed name (under penalty of perjury) |
| Payment | $20, Visa or Mastercard; record any late amount bizfile adds |

3. **My Work Queue** shows the submission; save the filed PDF to `~/Documents/`.

**If you cannot sign in to an account with access:** on the entity's record click **Request
Access** → **Request PIN**. A PIN letter is mailed to the entity's mailing address (8161 Oahu Dr);
once it arrives, sign in, **Request Access** → enter the PIN → **Get Access**, then file as above
(SOS *bizfile Online Account Setup and User Access Guide*, v8.22.24, §3). Request the PIN today and
finish steps 1 and 3 anyway. If the letter is slow, ask SOS whether a paper LLC-12 is still
accepted: bizfile@sos.ca.gov, (916) 653-6814.

**Record:** date filed, document number, amount paid → [`compliance-calendar.md`](./compliance-calendar.md)
and [`../llc/certificate-of-formation.md`](../llc/certificate-of-formation.md) → Next steps, item 5.

## 3 · $800 annual LLC tax, FTB 3522 (about 10 minutes)

1. <https://www.ftb.ca.gov/pay/> → **Web Pay** (bank account) → **Business**.
2. Entity type **LLC**; entity ID **`20260217250`**: the 11 digits of the SOS number, without the
   `B` (FTB Tax News, June 2025: new 12-character SOS numbers use only their 11 digits, and business
   Web Pay does not accept an EIN).
3. Payment type **LLC tax voucher (Form 3522) / annual tax**, taxable year **2026**, amount
   **$800.00**, your bank account, pay today.
4. Save the confirmation number. **Do not also mail a Form 3522**: paying by Web Pay replaces it.
5. The late-payment penalty and interest are **billed separately** by FTB. Paying the tax now stops
   further accrual on it; pay the notice when it comes and record the amount. Do not guess it.

*If Web Pay refuses the entity ID:* pay by check with the 2026 Form 3522 voucher, writing the SOS
file number, the EIN (from step 1) and "2026 FTB 3522" on the check, as the voucher instructions say.

**Record:** date paid, amount, confirmation number → [`compliance-calendar.md`](./compliance-calendar.md)
and `certificate-of-formation.md` → Next steps, item 6.

## 4 · What the three unlock

- **EIN** → open the business bank account ([`../banking/`](../banking/)) → AWS Support case to set
  the seller "Legal business name" (stamped Articles + EIN).
- All three → the LLC stays clear of SOS and FTB suspension, which would block contracting and
  selling, including the first AWS listing.
- Next dates (2027-04-15 twice, then the LLC-12 window 2027-12-01 → 2028-05-31) are in
  [`compliance-calendar.md`](./compliance-calendar.md) § Coming next.

## Screens that differed from this file

_(note them here when filing, so the next walk-through starts from the real screens)_
