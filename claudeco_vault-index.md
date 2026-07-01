# claudeco_vault-index.md — Monorepo Index & Orientation

> **Cowork orientation map for `TrevClaw-Obsidianodus`.** Built 2026-07-01 by the
> Claude Cowork operator from a live survey (git history, directory walk, the
> state docs, live connector tests). Companion to `claudeco_project.md` (the
> scope anchor). Where this conflicts with older design docs, the business's own
> `Trevor Robey Intelligence Network Citations/SYSTEM-REALITY.md` and
> `THE-WHOLE-SYSTEM.md` are the ground truth — this index points to them, it does
> not supersede them.

## 1. The business in one paragraph

**Trevor Robey, INC.** (legal: **Trevor Robey Intelligence Network Citations LLC**,
CA, filed 2026-05-06, receipt B20260217250) sells **citation-traced biomedical
due-diligence reports** — every claim resolves to a public identifier (PMID, NCT,
ChEMBL ID, DOI), delivered in days for low-thousands to ~$20K, positioned between
six-figure consulting diligence and hallucination-prone chatbots. Medical research
is the first niche; the same engine generalizes to other verticals.

| | |
|---|---|
| Brand wordmark | **Trevor Robey, INC.** ("INC" = *Intelligence Network Citations*, a backronym) |
| Domain / email | trevorobeyinc.com · trevor@trevorobeyinc.com (Zoho; alias trevorrobeyinc@gmail.com) |
| Tagline | *Every claim, sourced. Every risk, named. In days, not weeks.* |
| Lead product | **Investor Pre-Mortem** — $9,950 / $14,950 / $19,950 |
| Flanking SKU | **Failed Trial Archaeology** — $14,950; tactical SKUs $2,500–$9,950 |
| Canonical SKU list | `Trevor Robey Intelligence Network Citations/OFFERINGS.md` |
| CA SOS approval | recorded "pending" 2026-05-07 — **STALE, verify current status (see §7)** |

## 2. Repo topology (single-repo monorepo, local-only)

Hosting is **local-only** since 2026-05-26 (GitHub remote deleted; no git remotes).
Durable backup = `git bundle --all` (e.g. `~/Downloads/…FULL-backup….bundle`) — keep
an off-device copy. **Do not re-add a remote or push** without an explicit decision.

| Path | Role | Deep dive |
|------|------|-----------|
| `Trevor Robey Intelligence Network Citations/` | The business: due-diligence **engine** (OpenClaw) **+** brand canon, offerings, revenue playbook. 16 numbered workstreams (§4). | its own `CLAUDE.md`, `SYSTEM-REALITY.md`, `THE-WHOLE-SYSTEM.md` |
| `Claude/` | Central hub: Medical Zettelkasten MCP, Command Center Obsidian plugin, Research Memory MCP, obsidian-bridge launcher, vault-zettelkasten | `Claude/CLAUDE.md` |
| `Copilot-Everything/` | Obsidian integration: canonical MCP bridge (`:8798`), Miyo TLS proxy (`:8743`), vendored copilot-mcp fork | `Copilot-Everything/CLAUDE.md` |
| `.specify/` | Spec-Kit workflow (specs, plans, templates, memory) | — |
| `audit/`, `scripts/`, `tasks/` | Root-level audit outputs, ops scripts, `tasks/todo.md` (recovery tracker) | `tasks/todo.md` |

Root canon: `README.md`, `CLAUDE.md` (operator runbook), `ARCHITECTURE.md`
(2026-04-12 reference — **superseded** by SYSTEM-REALITY where they disagree),
`RECOVERY-REPORT.md`. Submodule: `vendor/tooluniverse` → mims-harvard/ToolUniverse
(pinned SHA `3833b0e`, v1.1.10, Apache-2.0).

## 3. The engine — what it is and current state

You type a question in **Obsidian Copilot chat** → the `openclaw-command-center`
plugin (bridge `:8799`) spawns `scripts/run-workflow.js` (the Phase-30 workflow
engine, a plain Node process) → it runs one of **6 workflow templates** across
**6 agent roles**, calls an LLM per role, pulls biomedical tool data, regex-extracts
citation IDs, runs a grounding + Crossref-retraction gate, and writes linked notes
back into Obsidian.

- **LLM routing (live 2026-06-11/22):** scout / analyst / synthesizer all run on
  **claude-code (Claude Opus 4.8, 1M ctx)**; OSS models (Ollama `qwen2.5:7b`,
  LM Studio `qwen3.5-9b`) are demoted to fail-soft **per-role helpers + fallback**.
  Per-role identity/memory at `config/agents/<role>/{SOUL.md,AGENTS.md,sessions/}`.
- **End-to-end: FIXED & PROVEN 2026-06-10.** Was dead-locked at
  `PHASE15_HUMAN_APPROVAL_REQUIRED`; unblocked by an opt-in `--operator-approve`
  flag (now **YubiKey PIN+touch gated**, one-shot, TTL 300s, fail-closed). First
  real run: 5/5 steps, 196-row dataset, 219 citations, 88 KB export bundle.
- **New (2026-06-12):** stopped-trial ingestion (`ctgov-supplemental`, NCT-traced)
  feeds two deterministic no-LLM deliverables — `deliverables/citation-integrity.md`
  (graded A–F provenance ledger) and `deliverables/graveyard-memo.md` (prior
  terminated/withdrawn trials with sponsor stop-reasons). This is what the recent
  **`trial-graveyard-feed` / glioblastoma** git activity is building on.
- **Engine output vault:** per SYSTEM-REALITY, notes land in a **separate** vault at
  `/Volumes/ExtraCurricular/My Digital Garden/OpenClaw/{template}/{date}/` — not in
  this repo. (Verify that path exists on this machine.)
- **Boundary:** external publish / upload / marketplace / delivery / login / browser
  automation are **manual-only**. This is a preparation tool, not an autonomous publisher.

## 4. Business workstreams (`Trevor Robey Intelligence Network Citations/NN-*`)

File counts are live (2026-07-01); one-line roles are inferred from folder names/contents.

| # | Workstream | Files | Role |
|---|-----------|------:|------|
| 00 | business-formation | 19 | LLC filing, EIN, formation records |
| 01 | brand-system | 17 | Brand canon, wordmark, voice, identity |
| 02 | product-packs | 24 | SKU / deliverable pack definitions |
| 03 | platforms | 55 | Marketplace/platform listings (largest — Datarade, Kaggle, AWS Mktpl.) |
| 04 | pricing-benchmarks | 10 | Tier pricing + competitor benchmarks |
| 05 | launch-plan | 25 | Go-to-market / launch plan |
| 06 | target-accounts | 15 | ICP + prospect account lists |
| 07 | outbound | 15 | Outreach sequences, templates |
| 08 | contracts-legal | 15 | MSA/SOW/T&Cs, disclaimers |
| 09 | source-licenses | 11 | Data-source licensing (PubMed, CT.gov, ChEMBL) |
| 10 | quality-pipeline | 11 | Citation QA / grounding-gate process |
| 11 | financial-ops | 7 | Invoicing, banking, financial ops |
| 12 | pipeline-tracking | 4 | Sales pipeline / CRM tracking |
| 13 | supplementary-research | 13 | Supporting research |
| 14 | due-diligence-checklist | 5 | DD methodology checklist |
| 15 | first-sale-risk-mitigation | 10 | De-risking the first sale |

## 5. What's in flight (recent git activity)

- **2026-06-24** — Post-research integrity layer + working-tree sync (latest commit).
- **2026-06-12** — Multi-agent role identities (SOUL/AGENTS/agent.json); citation-
  integrity engine + documentation sync.
- **Uncommitted / recent working files** — `trial-graveyard-feed` glioblastoma pack
  (free + paid citation-index CSVs, data dictionaries), AWS Marketplace listing,
  landing-page `index.html`, `tasks/todo.md` + `tasks/lessons.md`.
- **~120** markdown files carry `TODO`/`FIXME`/`[ ]` markers; the master tracker is
  `tasks/todo.md`.

## 6. Infrastructure & port map (essentials)

Canonical bridge `:8798` (Obsidian MCP, vault access) · Command Center `:8799` ·
Miyo semantic search `:8742` behind TLS proxy `:8743` · Qdrant `:6333`/`:6433` ·
LM Studio `:1234`/`:1235` · Ollama `:11434`/`:11435` · Obsidian Local REST `:27124`.
Full table: root `CLAUDE.md` → Unified Port Map. Most services are launchd-managed
TLS proxies fronting plaintext upstreams.

## 7. Open threads & gaps (as of 2026-07-01)

**Machine recovery (this machine = `myhome`, per `tasks/todo.md`) — interactive, pending you:**

- [ ] **Homebrew** install (sudo) — prerequisite for the below.
- [ ] **mkcert + CA + localhost cert** — needed before the 4 launchd TLS proxies can
      load (they're written but deliberately **not** `launchctl load`-ed to avoid a
      crash-loop against a missing cert).
- [ ] **Standalone `claude` CLI + SSO login** — the engine's **primary LLM provider**;
      the engine can't run roles until this exists.
- [ ] **ToolUniverse Python deps blocked** — needs Python ≥3.10 (system is 3.9.6):
      `brew install python@3.12` → venv → `pip install -e ".../vendor/tooluniverse"`.
- [ ] **Deferred health checks** — HTTPS on `:8798` (Obsidian bridge) and `:8743` (Miyo).
- [ ] **Claude Desktop MCP** — `obsidian-bridge` added; **filesystem + AWS API MCP**
      need re-add via Settings → Extensions.

**Business (the real bottleneck, per THE-WHOLE-SYSTEM §0):**

- [ ] **Pre-launch: $0 revenue, 0 live listings, 0 discovery calls, 0 signed deals.**
      The engine is no longer the blocker — the **commercial motion** is. Highest-value
      next step = the 30-day launch plan (`05-launch-plan/`, THE-WHOLE-SYSTEM §8).
- [ ] **Verify CA SOS LLC approval** landed (recorded "pending" 2026-05-07; now stale).

## 8. Connectors — status & setup (2026-07-01)

**Live & verified this session** (real data returned): **PubMed** (2,845 hits on a
glioblastoma query) · **ClinicalTrials.gov** (275 terminated glioblastoma trials).
**Live/loadable** (schema present this session): **bioRxiv/medRxiv, ChEMBL,
Open Targets, Consensus (semantic search), NPI registry, ICD-10 (CM+PCS),
Hugging Face Hub, Gmail.**

**Needs authorization — OAuth, only works in an interactive session (not Cowork):**

- **Wiley** (licensed Wiley-journal access — a separate connector from the engine's Semantic Scholar "scholar-gateway"; license-gated), **Synapse**, **BioRender**.
- Also gated: data plugins **Amplitude, Atlassian, Hex** (not core to research).
- **How:** for claude.ai connectors, authorize in **claude.ai → Settings → Connectors**;
  for local servers, run **`/mcp`** (or `claude mcp`) in an interactive Claude session
  and complete the browser OAuth flow. Do **not** paste tokens/codes into Cowork.
  Full per-connector checklist: **`claudeco_connector-setup.md`**.

**Owkin (engine-internal) · Google Drive (removed 2026-07-01).** Owkin is an
engine-internal **subprocess MCP adapter** (`openclaw-bridge/mcp/owkin-mcp/`, tool
`owkin_pathology_query`, bound to the `molecular_profiler` role + `target-validation-pack`
workflow). It runs only while `run-workflow.js` runs, so it will **never** appear in the
Cowork palette; the separate **Owkin Cowork connector** is available but needs a one-time
interactive OAuth (`/mcp` or claude.ai → Connectors). **Google Drive was fully removed on
2026-07-01** per operator request — the `gdrive-subprocess` + `gdrive-host` registry
entries, the `openclaw-bridge/mcp/gdrive-mcp/` adapter, the `google_drive` credential
block, and all doc references are gone; the `GOOGLE_DRIVE_*` env-stripping security guards
in the subprocess spawners were intentionally kept. (The registry also lists Tavily
web-search as required for the no-hallucination gate — worth confirming its key.)

### Required-architecture coverage

| Layer | Connector | Status |
|-------|-----------|--------|
| Literature | PubMed | ✅ live (verified) |
| Preprints | bioRxiv / medRxiv | ✅ live |
| Trials | ClinicalTrials.gov | ✅ live (verified) |
| Genomic evidence | Open Targets | ✅ live |
| Compounds / bioactivity / ADMET | ChEMBL | ✅ live |
| Licensed journals | Wiley | ⚠️ needs authorization (license-gated; Cowork-only) |
| Digital pathology | Owkin | 🧩 engine-internal (`owkin-mcp/`); Cowork connector needs OAuth |
| Cloud storage | Google Drive | ⚪ removed 2026-07-01 (per operator request) |
| Local knowledge base | this vault | ✅ connected |

## 9. Canonical docs to read next

1. `Trevor Robey Intelligence Network Citations/THE-WHOLE-SYSTEM.md` — the single map.
2. `Trevor Robey Intelligence Network Citations/SYSTEM-REALITY.md` — plain-language ground truth.
3. `Trevor Robey Intelligence Network Citations/OFFERINGS.md` + `REVENUE_PLAYBOOK.md` — SKUs & sales.
4. Root `CLAUDE.md` — operator rules, port map, deletion log.
5. `tasks/todo.md` — the live recovery/bring-up tracker.
