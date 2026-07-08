# HuggingFace — dataset card YAML front-matter (canonical)

> **Filled 2026-06-10.** This is the authoritative front-matter for the gated sample. It is already embedded at the top of the live dataset card [`gated-teaser/README.md`](gated-teaser/README.md) — edit there; this file is the reference/explainer. (Slug corrected from the stale `openclaw-pharmacovigilance-teaser` to a brand-clean name.)

- **Repo id (recommended):** `trevorrobeyinc/pharmacovigilance-ici-adverse-events` (see [`org-setup.md`](org-setup.md))
- **License:** `cc-by-nc-4.0` — sample is shareable non-commercially with attribution; production deliverables remain research-use-only under the DSA.
- **Gating:** on, via `extra_gated_*` keys (see [`extra-gated-fields.md`](extra-gated-fields.md)).
- **Data files:** two `config_name` entries point at `data/signal-register.csv` and `data/citation-index.csv` so HF's dataset viewer renders both tables.

```yaml
---
language: [en]
license: cc-by-nc-4.0
pretty_name: "Pharmacovigilance Signal Synthesis — ICI & Repurposing Adverse Events (Citation-Traced Sample)"
size_categories: [n<1K]
task_categories: [text-generation, question-answering, table-question-answering]
tags: [biomedical, pharmacovigilance, drug-safety, adverse-events, immune-checkpoint-inhibitors, verified-citations, research-intelligence, citation-traced]
configs:
- {config_name: signal-register, data_files: data/signal-register.csv}
- {config_name: citation-index,  data_files: data/citation-index.csv}
# extra_gated_* keys: see extra-gated-fields.md (kept in the live README)
---
```

**Watermark requirement** (carried from [`setup-guide.md`](setup-guide.md)): the card body must contain *"Produced by Trevor Robey, INC. (Trevor Robey Intelligence Network Citations LLC) — https://trevorobeyinc.com"*. Present in the live README.
