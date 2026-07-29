# Trial Graveyard Feed — ADX Upload Runbook

## Prerequisites (AWS-side)
1. **AWS Data Exchange provider qualification** approved — case 00881277 (application: [`../../../03-platforms/aws-data-exchange/adx-provider-qualification/`](../../../03-platforms/aws-data-exchange/adx-provider-qualification/)).
2. **Public seller profile verified.**
3. **Disbursement method added** — required only for the PAID offer; the **FREE sample can publish without it**.

## Upload sequence (once qualified)
1. AWS DX console → **Owned data sets** → **Create data set** (type: **Files**), name `Trial Graveyard Feed — <TA>`.
2. **Create a revision**, add assets:
   - **Paid** data set ← `data/<TA>/paid/{register.csv, citation-index.csv, data-dictionary.md}`
   - **Free** sample data set ← `data/<TA>/free/{register-sample.csv, citation-index-sample.csv, data-dictionary.md, SAMPLE-NOTICE.md}`
3. **Finalize** each revision (only finalized revisions can be added to a product).
4. **Create product** → attach the data set(s) → paste `product-description.md`, set categories (≤2: Healthcare, Life Sciences), upload logo.
5. **Create offers** (see `offers.md`): public **FREE** (sample, $0) + public **PAID** (full feed, price **[DECIDE]**, duration, auto-renew). **Enable subscription verification.**
6. Attach the **DSA** and **refund policy**.
7. **Publish** → product enters **Limited-visibility** first; preview as a buyer; then make public.

## #2 — Monthly refresh
```
node scripts/build-graveyard-feed.js --condition "<TA>" --asOf <YYYY-MM-DD> \
  --pageSize 50 \
  --out workspace/aws-marketplace-listing/trial-graveyard-feed/data/<slug>
```

> ⚠️ **`--pageSize 50` is required, not optional (corrected 2026-07-29).** This command previously
> omitted it. `build-graveyard-feed.js` defaults `pageSize` to **20**, so running it as written
> would rebuild every feed at 20 rows instead of 50 and **overwrite the shipped assets** — plain
> `fs.writeFileSync`, no merge, no guard. `--out` is equally required: its default is
> `workspace/distribution/graveyard-feed/<slug>-<asOf>/`, a different tree that still holds a
> stale 12-row 2026-06-20 build.
>
> 50 is the hard cap (set in `build-graveyard-feed.js` and `ctgov-supplemental.js`, no pagination),
> so the feed grows by **adding indications**, not by deepening existing ones.
→ create a **new revision** from the refreshed `paid/register.csv` → finalize → add to the product (subscribers receive the update). Add a "What's New" note. Re-running each month is what makes the "refreshed monthly" claim true.

## #1 — Add a therapeutic area
Run the generator with a new `--condition` (e.g., `"non-small cell lung cancer"`, `"pancreatic cancer"`, `"amyotrophic lateral sclerosis"`, `"NASH"`). Create a sibling product, or fold into an all-TA **private-offer bundle**. High-churn TAs carry the largest monthly deltas (avoid empty revisions, which hurt ADX standing).

## #3 — Parquet for the paid tier (follow-up, not yet built)
Add a CSV→Parquet step for `paid/register.csv` (Athena/Redshift/Snowflake convenience for enterprise subscribers). Keep the schema byte-identical to the CSV.

## Compliance gate (already enforced)
Public-domain CT.gov only · deterministic (no LLM) · no PHI · no DrugBank · ChEMBL not used. See `NOTICE.md`.
