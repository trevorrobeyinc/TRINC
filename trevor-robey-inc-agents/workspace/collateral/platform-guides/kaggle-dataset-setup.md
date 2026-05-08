# Kaggle Dataset Setup Guide

## Purpose

Kaggle is a FREE visibility play. Upload datasets to build credibility and drive traffic to trevorobeyinc.com. No direct revenue — this is for discoverability.

## Step 1: Generate Distribution Assets

```bash
node scripts/distribute.js --workflow-id <id> --targets kaggle --confirm
```

This creates:
- `workspace/distribution/kaggle/<id>/dataset-metadata.json`
- `workspace/distribution/kaggle/<id>/README.md` (with watermark)
- `workspace/distribution/kaggle/<id>/data.csv`
- `workspace/distribution/kaggle/<id>/findings.jsonl`

## Step 2: Create Kaggle Account

1. Go to kaggle.com and sign up
2. Complete profile (add bio referencing biomedical research intelligence)

## Step 3: Upload Dataset

### Option A: Web UI
1. Go to kaggle.com/datasets → New Dataset
2. Upload all files from `workspace/distribution/kaggle/<id>/`
3. Title: Use the title from `dataset-metadata.json`
4. Tags: biomedical, pharmacovigilance, drug-safety, verified-citations
5. License: CC-BY-NC-4.0
6. Visibility: Public

### Option B: CLI
```bash
cd workspace/distribution/kaggle/<id>/
kaggle datasets create -p ./
```

## Watermark

Every Kaggle upload includes "Produced by Trevor Robey Inc Agents — https://trevorobeyinc.com" in the README and dataset description.
