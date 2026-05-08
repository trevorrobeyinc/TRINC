# Revenue Playbook — Trevor Robey Inc Agents

Last updated: 2026-04-27

---

## 0. Hero Positioning

**What we sell.** Citation-traced biomedical due diligence dossiers — every claim PMID / NCT / ChEMBL CID / DOI verified at quality-gate time, not flagged as a warning. Refund-backed citation-audit SLA. Powered by OpenClaw (open-source agent framework).

**Headline offerings (2026-04-30 ladder).**

- **Investor Pre-Mortem (PRIMARY)** — $9,950 anchor / $14,950 standard / $19,950 custom (with KOL primary). Per-asset risk dossier: trial design + comparable failures + KOL sentiment + IP runway. 5–10 business days, written Speed SLA. ICP: biotech hedge funds, biotech-specialist VC, pharma BD/licensing.
- **Failed Trial Archaeology (FLANKING)** — $14,950. Structured post-mortem of Phase 2/3 terminations in a single mechanism. ICP: pharma R&D CI, biotech VC diligence.
- **Tactical SKUs** — Conference Synthesis Brief ($4,950 / conference), Trial Design Benchmark Pack ($4,950), Cross-Silo Connector Report ($9,950–$24,950), Plain-Language Patient Brief ($2,500), Pharmacovigilance Pack ($2,500–$4,950 — existing marketplace tier, demoted from primary).

**Why us, not McKinsey, ChatGPT, Causaly, or AlphaSense.** Four reasons, in order of how often they close deals:

1. **Citation traceability is enforced as a gate, not a warning.** Outputs without verifiable PMID / NCT / ChEMBL CID / DOI fail the build. Regulated buyers need that signal, not a "looks good" note.
2. **Speed SLA**: 5–10 business days for Investor Pre-Mortem, 24–48 hours for Conference Synthesis. McKinsey runs 2–6 weeks at $150K–$750K. We run a fifth of the time at a tenth of the price.
3. **Manual-only external-action boundary.** Agents prepare, package, and produce evidence — they never autonomously publish, post, transact, log in, or browse. Pharma compliance treats that as a feature.
4. **Defensible chain of custody.** Powered by OpenClaw with clean-room governance posture (`cleanRoomDerivative: true`), deterministic provenance manifests, and cryptographically chained post-export evidence ledgers. Every artifact is audit-ready.

**What we don't do.** No clinical decision support, no PHI hosting, no autonomous external actions, no live publishing. Disclaimers and upstream-attribution stack live in [NOTICE.md](NOTICE.md). Buyers in regulated workflows are responsible for independent verification and compliance with upstream data-source licensing.

---

## 1. System Architecture (Operator View)

```
Research Input  ──>  Mission (Phase 18)  ──>  Dataset (Phase 19-20)  ──>  Offer (Phase 21)  ──>  Release (Phase 22)  ──>  Export ZIP
     │                    │                        │                          │                        │
  Plain text         3-agent team            Validated rows            Pricing + platform        Approved bundle
  seed docs          (scout/analyst/         with provenance           assignment                ready for upload
                      synthesizer)
```

### Provider Architecture

| Provider | Role | Status | Notes |
|----------|------|--------|-------|
| **Claude Code** (MCP bridge) | Primary LLM | **Active** | `claude -p` stdin pipe, claude-sonnet-4-6, authenticated via Claude Max Pro |
| **LM Studio** (local) | Fallback LLM | **Active** | Runs qwen2.5-coder-7b-instruct on localhost:1234 |
| **Mock** | Testing | Active | Used for CI and deterministic tests |
| **ToolUniverse** (MCP) | Biomedical tools | **Active** | 700+ tools via Harvard MIMS, Phase 29 verified |

### How a research task becomes revenue

**Single command (Phase 30 — recommended):**

```bash
node scripts/run-workflow.js --template drug-discovery-full \
  --inputs '{"compound_name":"aspirin","indication":"pain"}' --confirm
```

Available workflow templates: `drug-discovery-full`, `pharmacovigilance-report`, `clinical-trial-landscape`, `target-validation-pack`, `rare-disease-brief`, `general-research-pack`

**Manual step-by-step (legacy):**

1. **Create input sources** — Drop plain-text seed documents into `workspace/research-input/<domain>/`
2. **Run a mission** — `node scripts/run-dataset-mission.js --task "..." --dataset-type retrieval_qa --input workspace/research-input/<domain>/ --confirm`
3. **Generate offer** — `node scripts/generate-offer.js --source mission-XXX --product-line <line> --tier <tier> --targets datarade --confirm`
4. **Approve release** — `node scripts/approve-release.js --offer-id offer-XXX --confirm`
5. **Export ZIP** — `node scripts/export-release.js --offer-id offer-XXX --format zip --confirm`
6. **Upload manually** — Take the ZIP from `workspace/releases/` and submit to your chosen platform

---

## 2. Product Lines

### General

| Product Line | Tiers | Platforms | Description |
|-------------|-------|-----------|-------------|
| research_packs | Standard, Premium | Datarade | Curated research artifacts on any topic |
| dataset_packs | Standard, Premium, Enterprise | Datarade, HuggingFace, Kaggle | Structured datasets with provenance |
| research_subscriptions | Standard, Premium, Enterprise | Datarade | Recurring research delivery |
| dataset_subscriptions | Standard, Premium, Enterprise | Datarade | Recurring dataset updates |
| custom_dataset_services | Premium, Enterprise | Datarade, Manual Secure Transfer | Bespoke dataset builds |
| enterprise_private_delivery | Premium, Enterprise | AWS Data Exchange, Google Cloud BigQuery, Snowflake | Private delivery via cloud data platforms |

### Biomedical (ToolUniverse-powered)

| Product Line | Tiers | Platforms | Margin | Description |
|-------------|-------|-----------|--------|-------------|
| biomedical_research_packs | Standard, Premium, Enterprise | Datarade | Medium | Drug discovery, target ID, clinical trial reports |
| biomedical_dataset_packs | Standard, Premium, Enterprise | Datarade, HuggingFace, Kaggle | Medium-High | Structured biomedical datasets (molecular, genomic, clinical) |
| drug_discovery_intelligence | Premium, Enterprise | Datarade, Manual Secure Transfer | **Highest** | Compound profiles, ADMET, target validation bundles |
| clinical_insights_subscription | Standard, Premium | Datarade | High (recurring) | Ongoing pharmacovigilance + trial monitoring |
| sponsorship_assets | Sample, Standard, Premium | GitHub Sponsors | Low | Community updates for sponsors |

### Pricing Guidance (2026-04-30 — supersedes prior $2,500/$4,950/$15K/$60K+ ladder)

| SKU | Target Buyer | Price | What's Included |
|---|---|---|---|
| **Investor Pre-Mortem (PRIMARY)** | Biotech hedge funds, biotech-specialist VC, pharma BD/licensing | $9,950 anchor / $14,950 standard / $19,950 custom (+ KOL primary) | Per-asset risk dossier (trial design + comparable failures + KOL sentiment + IP runway), every claim PMID/NCT/ChEMBL-traced; 5–10 business days; refund-backed citation-audit SLA |
| **Failed Trial Archaeology (FLANKING)** | Pharma R&D CI, biotech VC diligence | $14,950 | Structured post-mortem of Phase 2/3 terminations in a single mechanism; NCT-indexed failure pattern matrix |
| Conference Synthesis Brief | Pharma R&D, investors, BD/licensing (event-driven) | $4,950 / conference | 500+ ASCO/ESMO/AACR abstracts; 24–48hr |
| Trial Design Benchmark Pack | Biotech R&D, pharma CI | $4,950 | Comparative Phase 3 structure vs 10–20 comparable programs |
| Cross-Silo Connector Report | Pharma R&D, biotech partnerships | $9,950 – $24,950 | Hidden mechanistic links across ChEMBL/PubMed/CT.gov |
| Plain-Language Patient Brief | Patient Advocacy Groups, trial sponsors | $2,500 | EU CTR 536/2014 PLS at 8th-grade literacy |
| Pharmacovigilance Pack (tactical) | Mid-market pharma safety teams | $2,500 – $4,950 | Existing marketplace tier; demoted from primary lead — listings preserved |

The retired **Standard / Premium / Custom / Enterprise ARR** ladder ($2,500 / $4,950–$14,950 / $15K–$35K / $60K–$120K+) is no longer the public offering structure. Custom-tier and enterprise-subscription engagements remain available for large-pharma / CRO buyers who need ongoing delivery, but the lead public ladder is the single-deliverable SKU table above.

---

## 3. Biomedical Mission Templates

Six ready-to-run templates, each using ToolUniverse for tool discovery and execution:

| Template | Use Case | Key ToolUniverse Tools |
|----------|----------|----------------------|
| `biomedical_drug_discovery` | Compound profiling, ADMET, target-compound mapping | PubChem, OpenTargets, ChEMBL, ADMETai |
| `biomedical_target_identification` | Target validation, pathway analysis, PPI networks | OpenTargets, UniProt, HPA, InterPro |
| `clinical_trial_intelligence` | Trial landscape, endpoint analysis, competitor tracking | ClinicalTrials.gov, EuropePMC, PubMed |
| `pharmacovigilance_scan` | Adverse event signals, drug interaction analysis | FAERS, DailyMed, RxNorm, DrugSafetyAnalyzer |
| `genomic_variant_analysis` | Variant annotation, pathogenicity, population frequency | ClinVar, dbSNP, gnomAD, OMIM, Ensembl |
| `rare_disease_landscape` | Orphan drug mapping, genetic disease profiling | Monarch, OMIM, OrphaNet, GDC |

### Running a biomedical mission

```bash
node scripts/run-dataset-mission.js \
  --task "Compile molecular properties for GBM drug repurposing candidates" \
  --dataset-type retrieval_qa \
  --input workspace/research-input/biomedical/ \
  --confirm
```

```bash
node scripts/generate-offer.js \
  --source mission-XXX \
  --product-line drug_discovery_intelligence \
  --tier premium \
  --targets datarade \
  --confirm
```

---

## 4. Input Source Setup

### Directory structure

```
workspace/research-input/
├── sample/           # General-purpose (governance docs, default)
├── biomedical/       # Biomedical seed documents
│   ├── drug-repurposing-glioblastoma.txt
│   ├── protein-interaction-alzheimers.txt
│   ├── pharmacovigilance-immune-checkpoint.txt
│   └── genomic-variants-rare-disease.txt
└── <your-domain>/    # Add new domains as needed
```

### Creating new input sources

1. Create a directory under `workspace/research-input/<domain>/`
2. Add plain-text `.txt` files with:
   - **Title and domain** at the top
   - **Background** providing context
   - **Key research questions** (these drive agent focus)
   - **Relevant databases/sources** (guides tool selection)
   - **Expected output types** (maps to dataset schemas)
3. Run a mission pointing `--input` at your new directory

The pipeline reads all `.txt` files recursively and combines them into agent prompts. More specific seed documents produce higher-quality output.

---

## 5. Model Recommendations

Default provider: **Claude Code** (`claude -p` stdin pipe, claude-sonnet-4-6)

| Provider | Strength | Recommended For |
|----------|----------|-----------------|
| **Claude Code** (Sonnet/Opus) | Best reasoning, domain knowledge, synthesis quality | All production tiers, especially Premium/Enterprise |
| LM Studio (qwen2.5-coder-7b) | Fast, good structured output | Development, testing, rapid iteration |
| LM Studio (mistral-nemo-12b) | Strong reasoning, good instruction following | Fallback when Claude unavailable |

Claude Code is the single highest-impact quality driver. Enterprise buyers require the synthesis depth that only large frontier models deliver.

---

## 6. Quality Checklist

Before submitting any product to a marketplace:

- [ ] **Run with Claude Code provider** — Use `claude-code` for all production tiers
- [ ] **Review report** — Verify report.md is 40KB+ with traceable citations throughout
- [ ] **Verify citation CSV** — Every row should have a real identifier (PMID, NCT, CID, DOI)
- [ ] **Check store copy** — store-copy.md should read like buyer-facing marketing
- [ ] **Validate schema** — All rows pass `dataset-validator.js` without errors
- [ ] **Export and inspect ZIP** — Open the release ZIP, verify all expected files present
- [ ] **Match tier to quality** — Don't sell local-7B output as Premium or Enterprise

### Quality tiers by provider

| Provider | Max Recommended Tier | Notes |
|----------|---------------------|-------|
| LM Studio 7B | Standard | Acceptable for structured extraction, not synthesis |
| LM Studio 12-14B | Premium (with review) | Good for general research, weak on biomedical |
| Claude Code (Sonnet) | Premium | Strong synthesis, reliable citations |
| Claude Code (Opus) | Enterprise | Required for drug_discovery_intelligence, enterprise private delivery |

---

## 7. Enterprise Distribution Channels

### Platform Targets

| Platform | Best For | Tier | Setup |
|----------|----------|------|-------|
| **Datarade** | Research packs, datasets, subscriptions | Standard+ | Provider listing, manual submission |
| **AWS Data Exchange** | Enterprise private delivery | Premium/Enterprise | Provider onboarding, manual offer creation |
| **Google Cloud BigQuery** | Enterprise data feeds | Premium/Enterprise | Marketplace prerequisites, manual listing |
| **Snowflake Marketplace** | Enterprise data subscriptions | Premium/Enterprise | Provider profile, manual submission |
| **HuggingFace** | ML-ready datasets | Standard+ | Dataset card, manual upload (JSONL/CSV/Parquet) |
| **Kaggle** | Data science community datasets | Standard+ | dataset-metadata.json, manual CLI/UI submission |
| **GitHub Sponsors** | Community sponsorship assets | Sample/Standard/Premium | Tier copy, manual setup |

All platforms are **manual submission only**. The system generates submission-ready artifacts (metadata files, checklists, copy blocks) but never publishes automatically.

### First listing recommendation (2026-04-30)

**Lead listing**: **Investor Pre-Mortem (Primary)** — $9,950 anchor. Demonstrates the citation-discipline moat at the price point that closes biotech investor pipeline. Sold via direct outbound + discovery call rather than marketplace self-serve; landing page + LinkedIn + cold email are the primary acquisition surfaces.

**Tactical demonstration listing**: Pharmacovigilance Pack — Immune Checkpoint Inhibitor Adverse Events
**Platform**: Datarade + HuggingFace gated dataset
**Tier**: Tactical ($2,500–$4,950 — existing marketplace tier preserved)
**Contents**: Multi-section pharmacovigilance dossier with 135+ citations, citation index CSV, executive summary, evidence provenance appendix
**Why**: Immediate demand from pharma safety teams, demonstrates citation-backed methodology in marketplace context, top-of-funnel for tactical buyers. Demoted from primary lead — Investor Pre-Mortem is now the headline.

### Manual submission steps

1. Run workflow: `node scripts/run-workflow.js --template pharmacovigilance-report --inputs '{"drug_class":"immune_checkpoint_inhibitor"}' --confirm`
2. Export the release ZIP from `workspace/releases/`
3. Open ZIP, review report.md quality and citation CSV completeness
4. Submit to Datarade with generated copy-blocks.json and checklist.md
5. Set pricing at Standard tier ($2,500)

---

## 8. Enterprise API (Phase 31)

### Research API endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/research` | POST | Submit a workflow |
| `/api/v1/research` | GET | List workflows |
| `/api/v1/research/:id` | GET | Workflow status |
| `/api/v1/research/:id/download` | GET | Download export |

Authentication: Bearer token in `Authorization` header. Configure API keys in bridge startup options.

### Scheduled workflows

Edit `config/scheduled-workflows.json` to enable recurring intelligence feeds. The scheduler checks every 60 seconds and runs workflows matching the 5-field cron expression.

### Usage metering

Usage records are appended to `state/usage/{api_key}/{yyyy-mm}.jsonl`. Use `exportBillingReport(apiKey, month)` for invoicing.

---

## 9. Revenue Priorities (Ordered)

1. **Ship first Datarade listing** — Proves the pipeline end-to-end with real revenue. Use `node scripts/run-workflow.js --template pharmacovigilance-report --inputs '{"drug_class":"NSAID"}' --confirm`.
2. **Enable scheduled workflows** — Set `enabled: true` in `config/scheduled-workflows.json` for recurring pharmacovigilance scans. Recurring revenue from clinical_insights_subscription.
3. **Offer Research API to enterprise clients** — Pharma R&D teams submit workflows via POST `/api/v1/research`, pay per workflow via usage metering.
4. **Enterprise private delivery** — AWS Data Exchange, Snowflake, BigQuery for large pharma and hedge fund clients. $60K-$120K+ ARR.
5. **Expand structured datasets** — HuggingFace/Kaggle for ML-ready biomedical datasets. Export as Parquet/CSV.

---

## 10. Enterprise Outbound Sales

### Collateral Assets

| Asset | File | Purpose |
|-------|------|---------|
| Sample deliverable (8-12 page) | `workspace/collateral/samples/pharmacovigilance-sample-deliverable.md` | Gated sample for qualified prospects — request via email |
| 2-page teaser | `workspace/collateral/samples/pharmacovigilance-2page-teaser.md` | Email attachment for Day 7 follow-ups |
| Landing page | `workspace/collateral/landing-page/index.html` | Static HTML — deploy to GitHub Pages, Netlify, or Vercel |
| Prospect targeting guide | `workspace/collateral/outbound/prospect-targeting-guide.md` | LinkedIn search strings, ICP, week-by-week execution plan, discovery call script |
| LinkedIn templates | `workspace/collateral/outbound/linkedin-connection-templates.md` | 4 connection requests + 4 follow-up messages by persona |
| Email: CI Director | `workspace/collateral/outbound/email-ci-director.md` | 3-email cold sequence for pharma CI directors |
| Email: Quant Analyst | `workspace/collateral/outbound/email-quant-analyst.md` | 3-email cold sequence for hedge fund alt data buyers |
| Email: Discovery Scientist | `workspace/collateral/outbound/email-target-discovery.md` | 3-email cold sequence for biotech R&D leads |
| Email: Academic Researcher | `workspace/collateral/outbound/email-academic-researcher.md` | 3-email cold sequence for standard-tier buyers (academic/boutique) |

### Landing Page Deployment

The landing page is a single self-contained HTML file with zero dependencies. Deploy options:

```bash
# GitHub Pages
cp workspace/collateral/landing-page/index.html docs/index.html
git add docs/index.html && git commit -m "deploy landing page" && git push

# Netlify (drag-and-drop)
# Upload workspace/collateral/landing-page/ directory via Netlify dashboard

# Vercel
cd workspace/collateral/landing-page && npx vercel --prod
```

Target URL: `https://trevorrobeyinc.github.io`

### Outbound Cadence Summary

| Week | Activity | Target |
|------|----------|--------|
| 1 | Build 50-prospect list, send 40 cold emails (10/day) | 40 emails sent |
| 2 | Day 3 + Day 7 follow-ups, 10 new emails, attach 2-page teaser on Day 7 | All follow-ups complete |
| 3 | Refresh 25 prospects, A/B subject lines, LinkedIn follow-ups | 75 total prospects |

Target: 5-10% reply rate, 2-3 discovery calls/week by Week 3.

### Pricing in Outbound Materials (2026-04-30 ladder)

All outbound-facing materials use the new ladder:

- **Investor Pre-Mortem (PRIMARY)**: $9,950 anchor / $14,950 standard / $19,950 custom (with KOL primary research)
- **Failed Trial Archaeology (FLANKING)**: $14,950
- **Tactical SKUs**: Conference Synthesis Brief ($4,950 / conference), Trial Design Benchmark Pack ($4,950), Cross-Silo Connector Report ($9,950–$24,950), Plain-Language Patient Brief ($2,500)
- **Pharmacovigilance Pack (tactical)**: $2,500–$4,950 — existing marketplace tier, demoted from primary

Lead with the SKU matched to the prospect persona. Investor Pre-Mortem is the primary top-of-funnel for biotech investors and pharma BD. Pharmacovigilance Pack and Plain-Language Patient Brief stay as low-friction tactical entries for safety teams and patient-advocacy groups. Custom enterprise engagements with cloud-data-platform delivery (Snowflake / AWS / BigQuery) remain available for ongoing portfolio coverage but are no longer a public ladder tier — handled as custom contracts via discovery call.

---

## 11. Multi-Platform Distribution

### Distribution CLI

```bash
# Distribute to all platforms
node scripts/distribute.js --workflow-id <id> --targets all --confirm

# Distribute to specific platforms
node scripts/distribute.js --workflow-id <id> --targets datarade,kaggle,training-data --confirm
```

Available targets: `datarade`, `kaggle`, `huggingface`, `aws-data-exchange`, `data-and-sons`, `training-data`, `all`

### Data Marketplace Channels

| Platform | Tier | Revenue Model | Status |
|----------|------|---------------|--------|
| **Datarade** | Standard+ | Per-dataset listing, $2,500-$35,000 | Format adapter ready |
| **Kaggle** | Free | Visibility/backlink (no direct revenue) | Format adapter ready |
| **HuggingFace** | Free | Visibility/backlink (no direct revenue) | Format adapter ready |
| **AWS Data Exchange** | Enterprise | Subscription, $15K+ | Format adapter ready, provider onboarding required (2-4 weeks) |
| **Data & Sons** | Standard | Per-dataset, $2,500+ | Format adapter ready |

### Distribution Output Structure

```
workspace/distribution/
├── datarade/{workflow-id}/
│   ├── listing-fields.json
│   ├── sample-data.csv
│   └── product-description.md
├── kaggle/{workflow-id}/
│   ├── dataset-metadata.json
│   ├── README.md
│   ├── data.csv
│   └── findings.jsonl
├── huggingface/{workflow-id}/
│   ├── README.md (YAML front matter)
│   ├── dataset_info.json
│   └── data/train.jsonl
├── aws-data-exchange/{workflow-id}/
│   ├── product-description.md
│   ├── revision-metadata.json
│   ├── schema.json
│   └── data/research-output.json
├── data-and-sons/{workflow-id}/
│   ├── listing.json
│   ├── data-dictionary.md
│   └── sample.csv
└── training-data/{workflow-id}/
    ├── qa-pairs.jsonl
    ├── evaluation-rubrics.jsonl
    └── factuality-assessments.jsonl
```

### Platform Setup Status

| Platform | Guide | Provider Account | First Listing |
|----------|-------|-----------------|---------------|
| Datarade | `workspace/collateral/platform-guides/datarade-provider-setup.md` | Pending | Pending |
| Kaggle | `workspace/collateral/platform-guides/kaggle-dataset-setup.md` | Pending | Pending |
| HuggingFace | `workspace/collateral/platform-guides/huggingface-dataset-setup.md` | Pending | Pending |
| AWS Data Exchange | `workspace/collateral/platform-guides/aws-data-exchange-setup.md` | Pending (2-4 weeks) | Pending |
| Outlier.ai | `workspace/collateral/platform-guides/outlier-contributor-setup.md` | Pending | N/A |
| Mindrift.ai | `workspace/collateral/platform-guides/mindrift-contributor-setup.md` | Pending | N/A |

---

## 12. AI Training Data Revenue Lane

### How It Works

The training data generator (`openclaw-bridge/distribution/training-data-generator.js`) transforms verified research reports into structured AI training data. Every output item contains verifiable citations — this is the differentiator from generic training data.

### Task Types and Platform Mapping

| Output Type | Platform | Task Match | Hourly Rate |
|-------------|----------|-----------|-------------|
| Q&A pairs (qa-pairs.jsonl) | Outlier.ai | Biomedical Q&A creation | $25-$65/hr |
| Evaluation rubrics (evaluation-rubrics.jsonl) | Outlier.ai | AI response evaluation | $15-$40/hr |
| Factuality assessments (factuality-assessments.jsonl) | Mindrift.ai | Factuality assessment | $20-$50/hr |

### Expected Throughput Per Workflow Run

| Report Type | Q&A Pairs | Rubrics | Assessments |
|-------------|-----------|---------|-------------|
| Pharmacovigilance (135+ citations) | 20-40 | 8-15 | 30-60 |
| Drug Discovery (200+ citations) | 30-60 | 10-20 | 50-100 |
| Clinical Trial Landscape (180+ citations) | 25-50 | 10-18 | 40-80 |

### Revenue Model

Training data is NOT sold directly. Instead:
1. Run workflows to produce verified research reports
2. Generate training data from those reports via `distribute.js --targets training-data`
3. Use the generated Q&A pairs and rubrics as **reference material** when completing Outlier/Mindrift tasks
4. The pre-verified citations and structured answers accelerate task completion speed and quality

This creates a **labor income stream** alongside the data product revenue:
- 10-20 hrs/week on Outlier at $25-65/hr = $250-$1,300/week
- 10-20 hrs/week on Mindrift at $15-35/hr = $150-$700/week
- Combined potential: $400-$2,000/week ($20K-$100K annualized)

---

## 13. Upstream Attribution

The full attribution stack lives in [NOTICE.md](NOTICE.md). Summary for sales conversations:

- **OpenClaw patterns** — clean-room derivative; `cleanRoomDerivative: true` flag at `openclaw-bridge/openclaw.json:5`. The `openclaw-bridge/` directory name is intentionally retained as upstream attribution. **Trevor Robey Inc Agents is not affiliated with the openclaw.ai consumer Personal-AI-assistant product** and claims no authorship of any OpenClaw-branded software.
- **ToolUniverse** — Apache-2.0 — Harvard MIMS / Zitnik Lab. Vendored at `vendor/tooluniverse/`. Powers all six biomedical workflow templates. Cite as Gao et al., arXiv:2509.23426.
- **Node.js** — MIT — required runtime, version 22.13.1 (engine-strict).
- **Biomedical data sources** queried at runtime: PubMed/NLM, ClinicalTrials.gov/NIH, ChEMBL/EBI, OpenTargets, DrugBank (commercial license required for redistribution), CMS NPI, ICD-10/WHO, Owkin platform. Buyer must comply with each upstream source's licensing terms when using outputs in commercial workflows.
- **HuggingFace Hub** — metadata queries only; no model weights are downloaded or run.

Buyer-facing positioning copy:

> "Trevor Robey Inc Agents are biomedical research agent bundles authored by Trevor Robey, designed to run on a clean-room governance pattern derived from OpenClaw and powered by ToolUniverse (Apache-2.0, Harvard Zitnik Lab). OpenClaw and openclaw.ai are not affiliated with or endorsing this product."

---

## 14. Research-Only Restrictions

These restrictions are baked into the architecture and surface in product ToS, sales collateral, and contract addenda:

- **Outputs are research artifacts.** Not validated for clinical decision support, pharmaceutical prescribing, regulatory submission, or any professional medical use. Buyers in regulated workflows are responsible for independent verification, validation, and compliance.
- **No PHI hosted or processed.** All queried sources are public biomedical databases. The system does not host, transmit, or process Protected Health Information. HIPAA exposure is therefore architectural-zero, but buyers using outputs alongside their own PHI remain solely responsible for upstream PHI handling.
- **Manual-only external actions.** External publication, marketplace submission, customer delivery, and authentication actions are operator-controlled. The system never logs in, browses, transacts, or publishes autonomously. This is a feature for regulated buyers; do not soften it in sales conversations.
- **Provenance and audit-readiness.** Every release bundle includes a deterministic provenance manifest. Phase 22 submission evidence and Phase 28 delivery evidence are append-only chain-hashed ledgers. Buyers receive audit-ready chain of custody, not a rendered PDF claim of one.
- **Upstream data licensing.** Some sources (notably DrugBank) require commercial licenses for redistribution. The pricing tiers above assume buyer holds the appropriate downstream licenses where required; the project does not relicense or sublicense upstream data.

Sales boilerplate disclaimer for outbound emails / landing-page footer:

> "Trevor Robey Inc Agents (the code stack) produces biomedical research artifacts for informational purposes only. Outputs are not validated for clinical decision support and must not be used as the sole basis for prescribing, diagnostic, or regulatory decisions. Buyers are responsible for compliance with the licensing terms of all upstream data sources cited in deliverables. The legal entity providing these deliverables is Trevor Robey Intelligence Network Citations LLC, a California limited liability company, operating under the wordmark 'Trevor Robey, INC.' where INC = Intelligence Network Citations."
