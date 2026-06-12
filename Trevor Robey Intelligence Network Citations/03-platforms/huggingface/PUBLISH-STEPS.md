# HuggingFace — publish steps (Pharmacovigilance sample)

> **Ready to publish (2026-06-10).** Everything below is prepared; these are the operator-only steps (HF account actions can't be automated from here). Target: a free, **gated** dataset that is your first live, citable artifact. ~15 minutes.

## The upload bundle (already assembled)

Folder: [`gated-teaser/`](gated-teaser/) — upload its contents preserving structure:

```
gated-teaser/
├── README.md                      ← the dataset card (YAML front-matter + body). HF parses this automatically.
├── data-dictionary.md             ← schema reference
└── data/
    ├── signal-register.csv         ← 10 signals
    └── citation-index.csv          ← 29 citations
```

Source of truth for the data: `workspace/aws-marketplace-listing/pharmacovigilance-sample-pack/` (these are verified copies). The card already contains the brand watermark, disclaimer, and gating config.

## Steps

1. **(Optional, recommended) Create the org** `trevorrobeyinc` — [`org-setup.md`](org-setup.md). Skip → publish under user `Trevorrobey`.
2. **New dataset:** huggingface.co → **New Dataset**. Owner: `trevorrobeyinc` (or `Trevorrobey`). Name: **`pharmacovigilance-ici-adverse-events`**. Visibility: **Public**. (Do not reuse the old `openclaw-…` name.)
3. **Upload** the `gated-teaser/` contents (Files → Add file → upload, or drag the folder) so `README.md` and `data-dictionary.md` are at the repo root and the two CSVs are under `data/`.
   - CLI alternative: `huggingface-cli upload trevorrobeyinc/pharmacovigilance-ici-adverse-events ./gated-teaser . --repo-type=dataset`
4. **Turn on gating:** dataset **Settings → Gated dataset → enable**, set **Review access requests: Manually** (per [`extra-gated-fields.md`](extra-gated-fields.md)). The `extra_gated_*` keys in the card drive the request form.
5. **Verify** (checklist below), then share the link from the trevorobeyinc.com landing page and in outbound.

## Post-publish verification

- [ ] Dataset card renders: title, watermark line, tables, disclaimer all visible.
- [ ] **Dataset viewer** shows both `signal-register` and `citation-index` configs (10 and 29 rows).
- [ ] Gate is active — an incognito visitor sees "Request access" with the 5 fields.
- [ ] License shows **cc-by-nc-4.0**; tags indexed (pharmacovigilance, drug-safety, …).
- [ ] Contact email is `trevor@trevorobeyinc.com` (NOT a typo'd variant) and no `openclaw` strings remain.

## After it's live

- Log every access request in [`../../12-pipeline-tracking/discovery-calls.md`](../../12-pipeline-tracking/discovery-calls.md); qualified ones → persona outreach in [`../../07-outbound/`](../../07-outbound/).
- Update [`../../12-pipeline-tracking/kpis-end-of-month.md`](../../12-pipeline-tracking/kpis-end-of-month.md): "listings live" 0 → 1.
- *(optional)* add a Parquet mirror of each CSV for the HF viewer's fast path — not required at this size.
