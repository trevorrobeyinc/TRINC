# TRINC

> Renamed 2026-10-23 from `TrevClaw-Obsidianodus` (TRINC = Trevor Robey Intelligence Network Citations).

The monorepo for **Trevor Robey, INC.**: the citation-traced research engine, the business canon, and the
Obsidian tooling that runs them.

> *"Trevor Robey, INC."* is the wordmark of **Trevor Robey Intelligence Network Citations LLC**, a California
> limited liability company (filed 2026-05-06, **approved 2026-06-18, CA SOS Entity No. B20260217250**).
> **INC = Intelligence Network Citations**, a backronym, not a corporate suffix.

*Every claim, sourced. Every risk, named. In days, not weeks.*

Citation-traced biomedical due diligence for biotech investors and pharma BD. Five days. Every citation
grounded and retraction-screened. Audit trail included. Powered by OpenClaw (open-source agent framework).

## Start here

| If you want to know… | Read |
|---|---|
| How the business works, in plain language | [`HOW-IT-WORKS.md`](HOW-IT-WORKS.md) |
| Where the business stands and what moves it next | [`STATUS.md`](STATUS.md) |
| What is for sale, and at what price | [`OFFERINGS.md`](Trevor%20Robey%20Intelligence%20Network%20Citations/OFFERINGS.md) |
| What may honestly be claimed to customers | [`SYSTEM-REALITY.md`](Trevor%20Robey%20Intelligence%20Network%20Citations/SYSTEM-REALITY.md) |
| How the stack is built (verified record) | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| What is being worked on right now | [`_continuity/CONTINUITY.md`](_continuity/CONTINUITY.md) |
| The rules every agent follows here | [`CLAUDE.md`](CLAUDE.md) |

## Where everything lives

| Folder | What is in it |
|---|---|
| [`Trevor Robey Intelligence Network Citations/`](Trevor%20Robey%20Intelligence%20Network%20Citations/) | **The business, in one folder.** The research engine (`openclaw-bridge/` code, `config/` templates and routing, `scripts/` including `run-workflow.js`, `tests/`, `vendor/tooluniverse`), the business canon (numbered folders `00-` legal formation through `15-` first-sale risk, `OFFERINGS.md`, `REVENUE_PLAYBOOK.md`, `NOTICE.md`, the Commercial Launch Playbook), and run output and the first product's package under `workspace/`. |
| [`Claude/`](Claude/) | The Obsidian plugins and MCP servers built here: Command Center (`:8799`), Bridge Launcher, Viz Studio (`:8800`), Vault Zettelkasten, the Medical Zettelkasten MCP, Research Memory MCP, `searxng-search` and `trinc-content`. |
| [`Copilot-Everything/`](Copilot-Everything/) | The vendored Copilot plugin fork (`repos/obsidian-copilot-mcp-v4`), the canonical vault bridge (`bridges/obsidian-copilot-bridge`, `:8798`), the stdio adapter that is Claude's one door (`bridges/obsidian-stdio-adapter`), the Copilot agent's proxy (`bridges/openclaw-stdio-proxy`), and the HTTPS proxies for Miyo, Qdrant, SearXNG and Ollama (`scripts/`). |
| [`ops/`](ops/) | `tr-suite/`: the component registry, `verify.sh` (drift check) and `deploy.sh` (the only production deploy path). `reorg/`: the record of the 2026-10 reorganization. |
| [`docs/history/`](docs/history/) | Retired and dated documents kept for the record (the June system map, the May dossier, the May speckit specs). |
| [`_continuity/`](_continuity/) | The shared board every Claude surface reads and writes, plus archived cycles and handoffs. |
| [`scripts/`](scripts/) | Repo-wide tools: the HTTPS-only lint and the backup script. |

Personal tooling that once lived here (the Raycast extension, Origin Nest, Wiki Definitions, the Claude
Console Mirror) moved to its own repos under `~/Code` on 2026-10-23; the installed copies keep working.

## Submodule and vendored fork

- `Trevor Robey Intelligence Network Citations/vendor/tooluniverse` → [mims-harvard/ToolUniverse](https://github.com/mims-harvard/ToolUniverse) (Apache-2.0, v1.5.7, ~2,719 biomedical tools). The only submodule.
- `Copilot-Everything/repos/obsidian-copilot-mcp-v4` → fork of [logancyang/obsidian-copilot](https://github.com/logancyang/obsidian-copilot) at upstream `4.0.0` (SHA `a78b69b`) plus the MCP module. Not a submodule; see its [`UPSTREAM.md`](Copilot-Everything/repos/obsidian-copilot-mcp-v4/UPSTREAM.md).

## One repo

This repo is the single source of truth for the business and its tooling; do not split it back into
separate repos. It is pushed to the private GitHub repo `trevorrobeyinc/TRINC` (pushes are the operator's,
with a YubiKey), and a verified `git bundle` in `~/Documents/` is the offline backup.

## Posture

- **Research artifacts only**, not validated for clinical decision support.
- **No PHI** hosted or processed. Sources are public databases (PubMed, ClinicalTrials.gov, ChEMBL, Open
  Targets, and others; see `NOTICE.md` for which ones current templates query).
- **Manual-only external actions**: no autonomous publishing, posting, logging in or purchasing.
- **Citation traceability is a hard gate**: every cited identifier must have been retrieved during the run,
  and is retraction-screened and re-resolved before delivery.

Full disclaimers: [`NOTICE.md`](Trevor%20Robey%20Intelligence%20Network%20Citations/NOTICE.md).

## Legal entity

| | |
|---|---|
| Legal name | **Trevor Robey Intelligence Network Citations LLC** |
| Brand wordmark | **Trevor Robey, INC.** |
| Formation | California, filed 2026-05-06, **CA SOS Entity No. B20260217250** |
| Status | **Approved 2026-06-18** (certified SOS copy, Certificate No. 457169837) |
| Domain | trevorobeyinc.com |
| Contact | trevor@trevorobeyinc.com |

Filing record: [`certificate-of-formation.md`](Trevor%20Robey%20Intelligence%20Network%20Citations/00-business-formation/llc/certificate-of-formation.md)
