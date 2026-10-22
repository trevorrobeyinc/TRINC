# Trial Graveyard Feed — console walkthrough (first listing)

Rewritten 2026-10-21 against the AWS Data Exchange User Guide as read that day. Console labels
are quoted from AWS's docs, and the live console can word them slightly differently. **The
operator does every click.** Claude has no AWS CLI or AWS API MCP on this Mac (both are gone, per
`03-platforms/aws-data-exchange/account-access.md`, 2026-10-21). The only way it can look is
the Claude Browser pane on your signed-in ReadOnly session, behind the `cb` YubiKey gate. Nothing
here is automated.

Two consoles are involved:

- **AWS Data Exchange console** (`console.aws.amazon.com/dataexchange`): data sets, revisions,
  file uploads.
- **AWS Marketplace Management Portal** (`aws.amazon.com/marketplace/management`): products,
  offers, visibility, subscription requests. Products and offers moved here from the ADX console,
  so the old sequence in this file (create the product in ADX) no longer applies.

## 0. Before you start

**Decisions still open (operator, 2026-10-21: "we'll get to that later"):**

1. Which products go first: Free Sample, Essentials, Professional (Enterprise waits for Parquet).
2. Breast cancer in v1: hold it out, or ship it labeled partial (2,000 of 2,034).
3. Prices: on hold. `offers.md` stays `[DECIDE]` until you say.
4. Promote `refresh-2026-10-21/` over `data/`.
5. At offer creation: auto-renewal (never changeable afterwards), durations, refund text
   (`offers.md`).

**Compliance flag, not a console blocker.** The records show the LLC-12 Statement of Information
(due 2026-09-16) and the $800 FTB 3522 (due 2026-08-15) as unfiled and the EIN as not applied
for. Nothing on record says the LLC is suspended. A suspended California LLC cannot lawfully
transact, though, so file both before you switch a **paid** product to Public. AWS itself does
not check this. Owner: `00-business-formation/` (a sibling session).

**Known mismatch, not a blocker.** The Marketplace "Legal business name" still reads "Trevor Robey
Inc" (the wordmark). Fixing it takes a Support case with the stamped Articles plus the EIN (see
`03-platforms/business-identity-map.md`).

**Have ready:**

- Logo: `01-brand-system/logo-300x150-transparent-inc.png`
- Support contact: `support@trevorobeyinc.com` (send it one test message first)
- Copy: `product-description.md`. Offer terms: `offers.md`.
- Upload files: Claude prepares an upload folder once decisions 1, 2 and 4 are made (§1.2).

**Region:** create every data set in **one** Region. US East (N. Virginia) `us-east-1` is the usual
choice for ADX and matches the seller ARN. The product wizard only lists data sets from the Region
you pick.

## 1. Data sets (AWS Data Exchange console)

### 1.1 Create one data set per area, plus one for the free samples

For each data set:

1. **Publish data → Owned data sets → Create data set**.
2. **Select data set type: Files**.
3. **Define data set**:
   - Name: `Trial Graveyard Feed - <area>`, for example `Trial Graveyard Feed - glioblastoma`.
     The free one is `Trial Graveyard Feed - Free Samples`.
   - Description: `Stopped (terminated/withdrawn/suspended) ClinicalTrials.gov trials for the
     condition query "<area>", with the sponsor's stated stop reason. One file per revision;
     revisions are monthly full re-pulls.`
4. **Create data set**.
5. **Revisions → Create revision**. Comment: `2026-10-21 refresh` (also tag `v2026-10-21` if
   you like). **Create revision**.
6. **Jobs → Upload**. Select that data set's files from the upload folder and wait until every
   job's **State** is **Completed**.
7. Check **Revision overview** (file names and sizes), then **Finalize revision**.

> **Finalize is the publish button once a data set is in a product.** AWS: a new finalized
> revision "is then automatically published to all products the data set belongs to". There is
> no second review. For the monthly refresh, check the revision before you finalize it.

### 1.2 What goes into each data set

| Data set | Files | Source |
|---|---|---|
| each area (paid) | `register.csv`, `citation-index.csv`, `data-dictionary.md` | `<area>/paid/` |
| Free Samples (one data set) | per area: `<area>__register-sample.csv`, `<area>__citation-index-sample.csv`, `<area>__data-dictionary.md`, `<area>__SAMPLE-NOTICE.md` | `<area>/free/`, renamed with the area prefix |

The free files are renamed because one data set holds every area's sample, and the four names
repeat in each area. Claude builds the renamed copies after decisions 1, 2 and 4. The paid
data sets keep the plain names, so monthly revisions stay drop-in for subscribers.

## 2. Products (AWS Marketplace Management Portal)

Do the Free Sample first. It is the cheapest to test end to end.

1. **Products → Data Products → Create data product**.
2. **Product name**: from `product-description.md`. **Generate product ID and code** →
   **Continue to product details**.
3. **Provide product information**: logo, support contact, two categories (Healthcare, Life
   Sciences), short description and long description, all from `product-description.md`. Append
   that product's "What this tier includes" block to the long description. → **Next**.
4. **Add data sets**: pick the Region, then tick the product's data sets. Only data sets with a
   finalized revision appear.
5. **Revision access rule settings**:

   | Product | Historical revisions | Future revisions |
   |---|---|---|
   | Free Sample | A fixed number of trailing revisions: **1** | **No future revisions** (one-time sample) |
   | Paid tiers | **All pre-existing revisions published prior to subscription** | **All future revisions published during subscription duration** |

   AWS refuses "no historical" combined with "no future" (a product with no data).
6. **Data dictionaries** (optional): one CSV per data set, at most 1 MB, in AWS's own template.
   Download the **blank data dictionary template** from that page and save it into this folder.
   Claude fills it from `data-dictionary.md`; that content can't be written ahead because the
   template's columns are only shown in the console.
7. **Data samples** (optional, recommended on paid products): up to 10 files, at most 50 MB each.
   CSV samples get a preview on the product page. Upload one or two areas'
   `register-sample.csv`, so buyers see real rows without first subscribing to the free product.
8. **Data sensitivity information settings**: **Option 1** (the reason is in
   `product-description.md`).
9. **Configure allowlist**: add any second AWS account you can test from. Your own account is
   always included.
10. **Submit**. The product goes to **Limited** visibility, visible only to you and your allowlist.

**Copying for the paid tiers.** After the first product exists, use the ADX console: **Publish data
→ Products → (select) → Actions → Create copy**. This copies the details and the **public offer**
(custom offers are not copied). Then change the name, data sets, tier block and price.

## 3. Public offer (one per product)

1. **Data Products → (your product) → Getting started tab → Create offer → Public offer**.
2. **Generate offer ID → Continue to wizard**.
3. **Provide offer information**: an offer name (e.g. `Trial Graveyard Feed - Free Sample - public`).
   **Acknowledge and agree to enable Subscription verification**. You can't skip this; AWS
   enables it on every public offer. → **Next**.
4. **Configure offer pricing and duration**: pricing option, contract duration, currency (USD),
   product dimension. The prices come from `offers.md`, and they are `[DECIDE]` until you say. The
   free product is $0.
5. **Auto-renewal**: decide deliberately, because AWS never lets you change it afterwards.
6. **Configure legal terms and offer documents**: use the **Data Exchange default** (AWS's
   standard Data Subscription Agreement). Do **not** upload the custom DSA in `03-platforms/`.
   This step is what the STATUS queue item "accept AWS's StandardDSA" means. The docs read on
   2026-10-21 describe no separate account-level acceptance: the DSA is chosen per offer.
7. **Specify refund policy**: paste the statement from `offers.md`.
8. **Review and create → Create offer**.

## 4. Test in Limited visibility

1. Open the product page while signed in to your seller account (or the allowlisted test account).
2. On the **Free Sample**, request a subscription and fill in the verification form as a buyer would.
3. **Data Products → Subscription requests → Subscription requests to verify → (the request) →
   Approve**.
4. Confirm that the entitled data set appears for the subscriber and that its files download and
   open.
5. On paid products, check the page only: copy, coverage table, samples preview, refund text and
   DSA. Subscribing yourself would charge your own card.

## 5. Go public (AWS reviews it)

**Data Products → (product) → Request changes → Update product visibility → Public → Submit**.
AWS then reviews the listing against its publishing guidelines. The repo's earlier research put a
first listing at roughly **5 to 7 business days**; the pages read on 2026-10-21 give no time.
Review outcomes go to the account's root email, `aws@trevorobeyinc.com` since 2026-10-21, which
delivers to trevor@.

## 6. After launch

- **Subscription requests**: approve or decline within 45 days (expired requests can be
  resubmitted). The subscriber's answers are not checked by AWS. Decline Countries of Concern and
  Covered Persons (DOJ Rule).
- **Monthly refresh**:
  1. Run `scripts/refresh-graveyard-feeds.sh` and let Claude review the staging folder.
  2. Re-apply the copy fix until the generator is corrected (README §"Coverage").
  3. Promote the folder.
  4. In the ADX console, open each data set → **Revisions → Create revision** → **Upload** →
     **Finalize**. Finalizing publishes to subscribers at once.
- **Refunds**: only the ones you authorize, through the refund approval form in the Marketplace
  portal.
- **Seller profile bio** (optional): it names only the dossier SKUs. Once the feed is public,
  consider naming it within the 600-character limit (`03-platforms/aws-data-exchange/public-seller-profile.md`).

## Compliance gate (already enforced by the data)

Public-domain ClinicalTrials.gov only · deterministic (no LLM) · no PHI · no DrugBank · ChEMBL not
used. See `NOTICE.md`.
