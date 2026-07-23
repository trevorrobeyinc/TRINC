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
| [`Claude/`](Claude/) | Central hub: Medical Zettelkasten MCP, Command Center plugin, Trevor Robey Inc Research Memory MCP, Qdrant TLS proxy, Obsidian-bridge launcher |
| [`Copilot-Everything/`](Copilot-Everything/) | Obsidian integration: bridge daemons (`:8798` canonical, `:8743` Miyo TLS proxy), Raycast extension, vendored copilot-mcp fork |
| [`trevor-robey-inc-agents/`](trevor-robey-inc-agents/) | Citation-traced biomedical due diligence engine. Six workflow templates ([Investor Pre-Mortem](trevor-robey-inc-agents/REVENUE_PLAYBOOK.md), [Failed Trial Archaeology](trevor-robey-inc-agents/REVENUE_PLAYBOOK.md), Conference Synthesis Brief, Trial Design Benchmark Pack, Cross-Silo Connector Report, Plain-Language Patient Brief, Pharmacovigilance Pack). ToolUniverse subprocess (~2,116 biomedical tools). Eight project MCP servers. |
| [`trevor-robey-inc/`](trevor-robey-inc/) | Brand canon, LLC formation paperwork, launch playbook, OFFERINGS, REVENUE_PLAYBOOK, NOTICE, dossier |

## Architecture, build, run

- Architecture overview: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Operator-facing rules and runbook: [`CLAUDE.md`](CLAUDE.md)
- Per-workspace deep dives: each subdirectory's own `CLAUDE.md`
- Brand + offerings + revenue playbook: [`trevor-robey-inc/`](trevor-robey-inc/)

## Submodules

- `trevor-robey-inc-agents/vendor/tooluniverse` → [mims-harvard/ToolUniverse](https://github.com/mims-harvard/ToolUniverse) (Apache-2.0, ~2,116 biomedical tools)

Vendored fork (no submodule, see [`UPSTREAM.md`](Copilot-Everything/repos/obsidian-copilot-mcp/UPSTREAM.md)):
- `Copilot-Everything/repos/obsidian-copilot-mcp` → fork of [logancyang/obsidian-copilot](https://github.com/logancyang/obsidian-copilot) at SHA `df61538`

## Single-repo invariant

This repo is the **single source of truth**. Do not re-create separate sub-repos for `Claude/`, `Copilot-Everything/`, or `trevor-robey-inc-agents/` — they live here. The retired GitHub remote `https://github.com/trevoralexanderrobey/trevor-robey-inc-agents` is archived as the rollback anchor (tag `pre-monorepo-consolidation-2026-05-07`).

## Posture

- **Research artifacts only** — not validated for clinical decision support.
- **No PHI** hosted or processed. Sources are public biomedical databases (PubMed, ClinicalTrials.gov, ChEMBL, OpenTargets, NPI, ICD-10).
- **Manual-only external actions** — no autonomous publish/post/login/transact.
- **Citation traceability enforced** as a quality gate — every row in every citation index carries a real PMID, NCT, ChEMBL CID, or DOI.

Full disclaimers: [`trevor-robey-inc/NOTICE.md`](trevor-robey-inc/NOTICE.md).

## Legal entity

| | |
|---|---|
| Legal name | **Trevor Robey Intelligence Network Citations LLC** |
| Brand wordmark | **Trevor Robey, INC.** |
| Formation | California — filed 2026-05-06 — **CA SOS Entity No. B20260217250** |
| Status | ✅ **APPROVED 2026-06-18** (confirmed by certified SOS copy, Certificate No. 457169837) |
| Domain | trevorobeyinc.com |
| Contact | trevor@trevorobeyinc.com |

Filing record: [`trevor-robey-inc/00-business-formation/llc/certificate-of-formation.md`](trevor-robey-inc/00-business-formation/llc/certificate-of-formation.md)
