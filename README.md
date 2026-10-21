# TrevClaw-Obsidianodus

Monorepo for the **Trevor Robey, INC.** biomedical research intelligence stack.

> *"Trevor Robey, INC."* is the brand wordmark of **Trevor Robey Intelligence Network Citations LLC**, a California limited liability company filed 2026-05-06 (**APPROVED 2026-06-18; CA SOS Entity No. B20260217250**).
>
> **INC = Intelligence Network Citations** (a backronym, not a corporate suffix).

## Tagline

*Every claim, sourced. Every risk, named. In days, not weeks.*

Citation-traced biomedical due diligence for biotech investors and pharma BD. Five days. Zero hallucinations. Audit trail included. Powered by [OpenClaw](https://github.com/anthropics/openclaw) (open-source agent framework).

## Repo topology

| Path | Role |
|------|------|
| [`Claude/`](Claude/) | Code we built: Obsidian plugins (Command Center `:8799`, Bridge Launcher, Vault Zettelkasten, Viz Studio `:8800`, Wiki Definitions, Origin Nest, Console Mirror, Terminal Relay) and MCP servers (Medical Zettelkasten, Research Memory, searxng-search, trinc-content) |
| [`Copilot-Everything/`](Copilot-Everything/) | Obsidian integration: vendored Copilot fork (v4), canonical bridge daemon (`:8798`), stdio adapter, Raycast extension, TLS proxies (Miyo `:8743`, Qdrant `:6433`, SearXNG `:8891`, Ollama `:11435`) |
| [`Trevor Robey Intelligence Network Citations/`](Trevor%20Robey%20Intelligence%20Network%20Citations/) | The business, in one folder (flat-merged 2026-05-19 from the former `trevor-robey-inc-agents/` + `trevor-robey-inc/`): the OpenClaw citation-traced research **engine** — ten workflow templates (seven biomedical, three business-lane since 2026-10-21), ToolUniverse subprocess (~2,116 tools), project MCP adapters under `openclaw-bridge/mcp/` — and the **brand canon** (LLC paperwork, [`OFFERINGS.md`](Trevor%20Robey%20Intelligence%20Network%20Citations/OFFERINGS.md), [`REVENUE_PLAYBOOK.md`](Trevor%20Robey%20Intelligence%20Network%20Citations/REVENUE_PLAYBOOK.md), `NOTICE.md`, launch playbook). |
| [`ops/tr-suite/`](ops/tr-suite/) | Component registry (`manifest.json`), `verify.sh` (read-only drift check), `deploy.sh` (the one production deploy path), installers |
| [`_continuity/`](_continuity/) | Shared cross-surface board (`CONTINUITY.md`), archived board cycles (`log/`), handoffs (`handoffs/`) |

## Architecture, build, run

- Architecture overview: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Operator-facing rules and runbook: [`CLAUDE.md`](CLAUDE.md)
- Per-workspace deep dives: each subdirectory's own `CLAUDE.md`
- Brand + offerings + revenue playbook: [`Trevor Robey Intelligence Network Citations/`](Trevor%20Robey%20Intelligence%20Network%20Citations/)
- Where the business stands right now: [`STATUS.md`](STATUS.md)

## Submodules

- `Trevor Robey Intelligence Network Citations/vendor/tooluniverse` → [mims-harvard/ToolUniverse](https://github.com/mims-harvard/ToolUniverse) (Apache-2.0, ~2,116 biomedical tools)

Vendored fork (no submodule, see [`UPSTREAM.md`](Copilot-Everything/repos/obsidian-copilot-mcp-v4/UPSTREAM.md)):
- `Copilot-Everything/repos/obsidian-copilot-mcp-v4` → fork of [logancyang/obsidian-copilot](https://github.com/logancyang/obsidian-copilot) at upstream `4.0.0` (SHA `a78b69b`) + the MCP module (the 3.3.3 fork at SHA `df61538` was retired 2026-10-21)

## Single-repo invariant

This repo is the **single source of truth**. Do not re-create separate sub-repos for `Claude/`, `Copilot-Everything/`, or `Trevor Robey Intelligence Network Citations/` — they live here. TR suite components that once had their own repos (Origin Nest, Wiki Definitions, trinc-content) were absorbed with history on 2026-10-21; their old repos sit in `~/Code/_retired-absorbed-into-monorepo/`. The retired GitHub remote `https://github.com/trevoralexanderrobey/trevor-robey-inc-agents` is archived as the rollback anchor (tag `pre-monorepo-consolidation-2026-05-07`).

## Posture

- **Research artifacts only** — not validated for clinical decision support.
- **No PHI** hosted or processed. Sources are public biomedical databases (PubMed, ClinicalTrials.gov, ChEMBL, OpenTargets, NPI, ICD-10).
- **Manual-only external actions** — no autonomous publish/post/login/transact.
- **Citation traceability enforced** as a quality gate — every row in every citation index carries a real PMID, NCT, ChEMBL CID, or DOI.

Full disclaimers: [`Trevor Robey Intelligence Network Citations/NOTICE.md`](Trevor%20Robey%20Intelligence%20Network%20Citations/NOTICE.md).

## Legal entity

| | |
|---|---|
| Legal name | **Trevor Robey Intelligence Network Citations LLC** |
| Brand wordmark | **Trevor Robey, INC.** |
| Formation | California — filed 2026-05-06 — **CA SOS Entity No. B20260217250** |
| Status | ✅ **APPROVED 2026-06-18** (confirmed by certified SOS copy, Certificate No. 457169837) |
| Domain | trevorobeyinc.com |
| Contact | trevor@trevorobeyinc.com |

Filing record: [`Trevor Robey Intelligence Network Citations/00-business-formation/llc/certificate-of-formation.md`](Trevor%20Robey%20Intelligence%20Network%20Citations/00-business-formation/llc/certificate-of-formation.md)
