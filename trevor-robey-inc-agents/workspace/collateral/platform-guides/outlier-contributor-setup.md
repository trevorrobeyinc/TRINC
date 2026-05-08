# Outlier.ai Contributor Setup Guide

## Purpose

Outlier.ai pays $25-$65/hr for biomedical STEM tasks. Trevor Robey Inc Agents's training data generator produces pre-verified Q&A pairs and evaluation rubrics that accelerate task completion.

## Step 1: Apply

1. Go to outlier.ai
2. Apply as: Biomedical Engineering / STEM Expert
3. Qualifications to highlight:
   - MBA candidate in AI Systems Management (Strayer University)
   - Builder of biomedical research infrastructure (Trevor Robey Inc Agents)
   - Experience with pharmacovigilance data and drug discovery pipelines
   - Familiarity with PubMed, ClinicalTrials.gov, PubChem, FAERS, ChEMBL, RxNorm, UniProt
   - Citation verification and quality assessment expertise

## Step 2: Target Task Types

| Task Type | Rate | How Trevor Robey Inc Agents Helps |
|-----------|------|--------------------|
| Biomedical Q&A creation | $25-$65/hr | Use `qa-pairs.jsonl` as reference — pre-verified answers with citations |
| AI response evaluation | $15-$40/hr | Use `evaluation-rubrics.jsonl` — rubrics with required identifiers and hallucination markers |
| STEM expert prompts | $30-$55/hr | Use research reports as domain context |
| Factuality assessment | $25-$50/hr | Use `factuality-assessments.jsonl` — pre-identified correct and degraded claims |

## Step 3: Generate Training Data from Trevor Robey Inc Agents Output

```bash
node scripts/distribute.js --workflow-id <id> --targets training-data --confirm
```

This produces:
- `workspace/distribution/training-data/<id>/qa-pairs.jsonl` — Q&A pairs with verifiable citations
- `workspace/distribution/training-data/<id>/evaluation-rubrics.jsonl` — Rubrics with required identifiers
- `workspace/distribution/training-data/<id>/factuality-assessments.jsonl` — Correct and degraded claims

## Step 4: Use During Task Completion

1. Before starting an Outlier task, run `distribute.js` on a relevant completed workflow
2. Open the appropriate JSONL file alongside the Outlier task interface
3. Reference the pre-verified answers and citations when crafting your responses
4. The verified identifiers (PMID, NCT, CID, etc.) give you high-confidence source material

## Expected Earnings

- Time commitment: 5-20 hrs/week (flexible)
- Rate range: $25-$65/hr depending on task type
- Weekly: $125-$1,300
- Monthly: $500-$5,200
