# Mindrift.ai Contributor Setup Guide

## Purpose

Mindrift.ai (part of Toloka AI, established 2014) pays $15-$35/hr for domain expert tasks. Trevor Robey Inc Agents's training data output provides pre-verified factuality assessments that accelerate task completion.

## Step 1: Apply

1. Go to mindrift.ai/apply
2. Apply as: Domain Expert — Biology/Medicine
3. Qualifications to highlight:
   - Biomedical research data infrastructure experience
   - Pharmacovigilance and drug safety data analysis
   - Citation verification across PubMed, ClinicalTrials.gov, PubChem, FAERS
   - AI evaluation and factuality assessment experience
   - MBA candidate in AI Systems Management

## Step 2: Target Task Types

| Task Type | Rate | How Trevor Robey Inc Agents Helps |
|-----------|------|--------------------|
| Prompt creation | $15-$30/hr | Use research reports for domain-specific prompt context |
| AI evaluation | $20-$35/hr | Use `evaluation-rubrics.jsonl` for pre-built rubrics with hallucination markers |
| Content refinement | $15-$25/hr | Use verified citations to refine and fact-check content |
| Factuality assessment | $20-$50/hr | Use `factuality-assessments.jsonl` — pre-identified correct and degraded claims |

## Step 3: Generate Training Data from Trevor Robey Inc Agents Output

```bash
node scripts/distribute.js --workflow-id <id> --targets training-data --confirm
```

This produces:
- `workspace/distribution/training-data/<id>/qa-pairs.jsonl`
- `workspace/distribution/training-data/<id>/evaluation-rubrics.jsonl`
- `workspace/distribution/training-data/<id>/factuality-assessments.jsonl`

## Step 4: Use During Task Completion

1. Before starting a Mindrift task, generate training data from a relevant workflow
2. Open `factuality-assessments.jsonl` — each line contains a claim with `is_factual`, `errors`, and `corrections`
3. Use these as reference when evaluating AI-generated biomedical content
4. The degraded claims (is_factual: false) show common error patterns to look for

## Expected Earnings

- Time commitment: 10-20 hrs/week (flexible)
- Rate range: $15-$35/hr depending on task type
- Weekly: $150-$700
- Monthly: $600-$2,800

## Platform Details

- Toloka AI has been operating since 2014 (established, reliable payments)
- Tasks available globally
- Payment via PayPal or bank transfer
- Flexible scheduling — no minimum hours
