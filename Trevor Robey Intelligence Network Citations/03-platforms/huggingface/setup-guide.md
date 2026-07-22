# HuggingFace Dataset Setup Guide

## Purpose

HuggingFace is a FREE credibility play for the ML/AI research community. Datasets with proper YAML cards get indexed and discoverable. Drives traffic to trevorobeyinc.com.

## Step 1: Generate Distribution Assets

```bash
node scripts/distribute.js --workflow-id <id> --targets huggingface --confirm
```

This creates:
- `workspace/distribution/huggingface/<id>/README.md` (with YAML front matter)
- `workspace/distribution/huggingface/<id>/dataset_info.json`
- `workspace/distribution/huggingface/<id>/data/train.jsonl`

## Step 2: Create HuggingFace Account

1. Go to huggingface.co and sign up
2. Create organization: trevorrobeyinc (optional)

## Step 3: Upload Dataset

1. Go to huggingface.co → New Dataset
2. Repository name: e.g., `pharmacovigilance-ici-adverse-events`
3. Upload all files preserving directory structure (`data/` subdirectory)
4. The README.md with YAML front matter is the dataset card — HuggingFace parses it automatically
5. Categories assigned via YAML: medical, biology, chemistry
6. License: CC-BY-NC-4.0

## Dataset Card

The generated README includes YAML front matter:
```yaml
---
language:
- en
license: cc-by-nc-4.0
task_categories:
- text-generation
- question-answering
tags:
- biomedical
- pharmacovigilance
- drug-safety
- verified-citations
- research-intelligence
---
```

## Watermark

Every HuggingFace upload includes "Produced by Trevor Robey, INC. (Trevor Robey Intelligence Network Citations LLC) — https://trevorobeyinc.com" in the dataset card. INC = Intelligence Network Citations.
