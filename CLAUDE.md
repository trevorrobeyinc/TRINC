# TrevClaw-Obsidianodus

Single-repo monorepo for the **Trevor Robey, INC.** biomedical research intelligence stack. As of 2026-05-07 this is the canonical source of truth — three previously separate sub-trees (`Claude/`, `Copilot-Everything/`, `trevor-robey-inc-agents/`) plus the brand canon at `trevor-robey-inc/` are all first-class members of this repo.

Hosting: **local-only as of 2026-05-26.** The private GitHub remote `trevoralexanderrobey/TrevClaw-Obsidianodus` was **deleted** on 2026-05-26; the monorepo now lives only on this machine with **no git remotes**. Durable backup is a verified `git bundle --all` in `~/Downloads/` (e.g. `TrevClaw-Obsidianodus-FULL-backup-20260526-2255.bundle`) — keep an off-device copy. Do not re-add a remote or push without an explicit decision to reverse this local-only posture.

## 📌 Shared Continuity Board — read this first

> **Before substantive work in this repo, read [`_continuity/CONTINUITY.md`](_continuity/CONTINUITY.md).**
> It is the ONE living board all four Claude surfaces share — **CLI Claude Code, Desktop Claude
> Code, Cowork, and Claude Chat (Desktop)** — so every surface knows what's being worked on and
> what changed, and can adjust/add/cooperate. Read **Current focus** + the top few **Log** entries
> at session start; append a Log entry on meaningful progress or handoff. Protocol, reachability,
> and external-volume write-safety: [`_continuity/README.md`](_continuity/README.md). The Code
> surfaces also auto-trigger via the repo skill `.claude/skills/continuity-board/`.

## Repo Topology

> **Folder consolidation (2026-05-19).** The two former sibling folders
> `trevor-robey-inc/` (brand canon) and `trevor-robey-inc-agents/` (engine) were
> **flat-merged** into a single directory named with the official business name:
> **`Trevor Robey Intelligence Network Citations/`**. History was preserved via
> `git mv` (1,195 tracked renames). The git submodule path auto-updated in
> `.gitmodules`; `~/Code/trevor-robey-inc-agents` was re-pointed (symlink) to the
> merged folder so the Command Center plugin still resolves
> `scripts/run-workflow.js`; `scripts/lint-transport-monorepo.sh` walk-root was
> updated to the new (space-containing, quoted) path. The brand folder's
> `README.md` was renamed `README.brand.md` to resolve the only filename
> collision. Rollback anchor: tag `pre-flat-merge-2026-05-19` (= `main` @
> `20ea572`). Older references below to `trevor-robey-inc/` and
> `trevor-robey-inc-agents/` in *historical* sections (deletion log, predecessor
> repos, single-repo invariant) are retained as accurate descriptions of past
> state and intentionally not rewritten.

| Path | Role | Deep Dive |
|------|------|-----------|
| `Claude/` | Central hub: Medical Zettelkasten MCP, Command Center plugin, Trevor Robey Inc Research Memory MCP, Obsidian-bridge launcher, vault-zettelkasten plugin | `Claude/CLAUDE.md` |
| `Copilot-Everything/` | Obsidian integration: plugin fork (vendored at `repos/obsidian-copilot-mcp/`), MCP bridge (:8798), Miyo TLS proxy (:8743) | `Copilot-Everything/CLAUDE.md` |
| `Trevor Robey Intelligence Network Citations/` | **Single merged business folder.** Contains BOTH (a) the citation-traced biomedical due-diligence **engine** (powered by OpenClaw; six workflow templates → Investor Pre-Mortem $9,950–$19,950, Failed Trial Archaeology $14,950, tactical SKUs; role-routed LLM providers, ToolUniverse subprocess ~2,116 tools v1.1.10 at `vendor/tooluniverse`, seven project MCP servers, `node scripts/run-workflow.js`) AND (b) the **brand canon** (LLC formation paperwork, six-SKU offering ladder, `trevor-robey-inc Commercial Launch Playbook.md`, `OFFERINGS.md`, `REVENUE_PLAYBOOK.md`, `NOTICE.md`, dossier). Engine deep-dive: `Trevor Robey Intelligence Network Citations/CLAUDE.md`; brand entry: `README.brand.md`. | `Trevor Robey Intelligence Network Citations/CLAUDE.md` |

### Submodule

- `trevor-robey-inc-agents/vendor/tooluniverse` → [mims-harvard/ToolUniverse](https://github.com/mims-harvard/ToolUniverse) pinned at SHA `3833b0e` (v1.1.10, Apache-2.0)

### Vendored fork (no submodule)

- `Copilot-Everything/repos/obsidian-copilot-mcp/` → SHA `df61538` of [logancyang/obsidian-copilot](https://github.com/logancyang/obsidian-copilot) on branch `codex/post-validated-mcp-baseline` — see `Copilot-Everything/repos/obsidian-copilot-mcp/UPSTREAM.md` for re-sync instructions.

### Predecessor repos

- `https://github.com/trevoralexanderrobey/trevor-robey-inc-agents` was archived 2026-05-07 with rollback tag `pre-monorepo-consolidation-2026-05-07` pointing at SHA `8e782a0` (the last pre-consolidation HEAD before the snapshot commit).


> **Plugin display names vs IDs (2026-07-23).** The Obsidian plugins are display-branded as the
> **TR-Obsidian Intelligence Network Citations** suite (Command Center · Zettelkasten · Bridge
> Launcher · Wiki Definitions) so they group together in Obsidian's plugin list. Their **plugin IDs
> are FROZEN** (`command-center`, `vault-zettelkasten`, `obsidian-bridge-launcher`,
> `contextual-wiki-definitions`) and must never be renamed: Copilot's 4 `mcp_command-center_*` MCP
> tool ids and `mcp.servers[].id`, the wiki-definition plugin's `plugins['vault-zettelkasten']`
> api lookup (a **separate git repo**), Command Center's own lookup in `zettelkasten/linker.ts`,
> the 0600 token at `~/.config/openclaw-command-center/bridge-token`, and the on-disk directory
> names under `.obsidian/plugins/` all key on the IDs, not the names.

## Multi-Operator Topology

Three independent operators share this stack. None is subordinate to the others.

> **Four Claude *surfaces* reach this repo's filesystem directly (corrected 2026-07-01).** The
> MCP wiring below describes the *plumbing*; separately, the four human-facing Claude surfaces —
> **CLI Claude Code, Desktop Claude Code, Cowork, and Claude Chat (Desktop app)** — all read/write
> this repo on disk and coordinate through the shared board at `_continuity/CONTINUITY.md`.
> **Claude Chat (Desktop) is NOT limited to the `:8798` Obsidian bridge for local files:** it has a
> **Filesystem MCP connector with allowed roots `/Users/myhome` and `/Volumes/ExtraCurricular`**,
> so it reads/writes `/Volumes/ExtraCurricular/TrevClaw-Obsidianodus` (and sees `My Digital Garden`
> as a sibling dir) directly. `:8798` is an *additional* semantic path (Obsidian/Zettelkasten over
> `My Digital Garden`), not Chat's only route to disk. Caveat: Chat-side writes to the external
> volume have hung before — a Filesystem-MCP restart clears it; treat Chat writes as
> available-but-probe-first (see `_continuity/README.md`).

```
Claude Desktop (heavy-lift code/file operator)
  # Claude Code now runs via the native Claude Desktop Code tab (no custom subprocess orchestration).
  # The only MCP stdio servers Desktop needs are the obsidian-bridge adapter and the filesystem server.
  # (Retired 2026-05-31: INBOUND `claude mcp serve` + OUTBOUND claude-cli-bridge — see deletion log.)
  ├── [MCP stdio] → obsidian-bridge adapter → [HTTPS :8798] → Canonical MCP Bridge
  └── [MCP stdio] → filesystem server

Command Center plugin (workflow dispatch + monitoring, Obsidian plugin at obsidian-command-center/)
  ├── [child_process.spawn()] → Trevor Robey Intelligence Network Citations/scripts/run-workflow.js
  │                              ├── per-role LLM routing via config/role-provider-map.json (phase34; verified live 2026-07-16, see memory verify-live-files-not-claudemd): scout, analyst, synthesizer + default ALL run on claude-code (Claude Opus 4.8 for the three roles, Sonnet for default). As of 2026-07-16 (Option B) the engine is 100% Claude — the OSS helper pre-passes + local fallbacks were REMOVED; LM Studio was decommissioned 2026-07-16 and Ollama was FULLY REMOVED 2026-07-23 (binaries, LaunchAgents, :11435 proxy, 9.2GB models) — there are no local model runtimes on this machine at all; the Obsidian side now runs on the hosted copilot-plus-flash model. --operator-approve is YubiKey-gated. Per-role identity/memory under config/agents/<role>/{SOUL.md,AGENTS.md,sessions/}
  │                              ├── ToolUniverse subprocess (vendor/tooluniverse, ~2,116 tools)
  │                              └── 7 project MCP servers (chembl, clinicaltrials-gov, pubmed, huggingface metadata-only, npi, icd10, owkin)
  ├── [child_process.spawn()] → trevorobeyinc-research-memory CLI (auto-ingest pack to Qdrant)
  ├── [MCP stdio] → Medical Zettelkasten MCP (post-workflow graph analysis)
  ├── [HTTP :8742] → Miyo semantic search
  └── [HTTP :8799] → Own additive MCP bridge (biomedical workflow tools)

Biomedical Workflow Observability Stack (optional, Docker Compose)
  ├── Traefik :11480/:11481 → (former Ollama/LM Studio failover) — HISTORICAL / dead: both local runtimes removed (LM Studio 2026-07-16, Ollama 2026-07-23)
  ├── Prometheus :9090 → (no scrape target — biomedical workflow has no persistent gateway)
  └── Grafana :3001 → Prometheus datasource
```

## Unified Port Map

| Port | Service | Protocol | Owner Workspace | Managed By |
|------|---------|----------|-----------------|------------|
| 8798 | Obsidian MCP Bridge (canonical) | HTTPS | Copilot-Everything | obsidian-bridge-launcher plugin (Obsidian lifecycle) |
| 8799 | Command Center Bridge (additive) | HTTPS | Claude (Obsidian plugin) | Obsidian plugin lifecycle |
| 8743 | Miyo TLS proxy (HTTPS terminator → :8742) | HTTPS | Copilot-Everything | launchd `com.trevorrobey.miyo-tls-proxy` |
| 8742 | Miyo Semantic Search (plaintext upstream — only the proxy at :8743 should reach it) | HTTP | external | External process (`/Applications/Miyo.app`) |
| 6433 | Qdrant TLS proxy (HTTPS terminator → :6333) | HTTPS | Copilot-Everything | launchd `com.trevorrobey.qdrant-tls-proxy` |
| 6333 | Qdrant Vector DB (plaintext upstream — only the proxy at :6433 should reach it) | HTTP | external | External process (Miyo bundles Qdrant child) |
| ~~1235/1234~~ | ~~LM Studio TLS proxy / upstream~~ — **DECOMMISSIONED 2026-07-16** (proxy, launchd unit `com.trevorrobey.lm-studio-tls-proxy`, and engine config all removed) | — | — | — |
| 11480 | Traefik scout proxy (optional) | HTTP | trevor-robey-inc-agents | Docker Compose |
| 11481 | Traefik analyst proxy (optional) | HTTP | trevor-robey-inc-agents | Docker Compose |
| 9090 | Prometheus (optional) | HTTP | trevor-robey-inc-agents | Docker Compose |
| 3001 | Grafana (optional) | HTTP | trevor-robey-inc-agents | Docker Compose |
| 8891 | SearXNG TLS proxy (HTTPS terminator → :8890) | HTTPS | Copilot-Everything | launchd `com.trevorrobey.searxng-tls-proxy` |
| 8890 | SearXNG (private metasearch; plaintext upstream — only the proxy at :8891 should reach it. JSON API for the Tavily-style `searxng-search` MCP connector — Docker-free, third-party upstream like Miyo/Qdrant) | HTTP | Claude (`Claude/searxng-search-mcp`) | launchd `com.trevorrobey.searxng` |

> **:8798 vs :8799 disambiguation**: `:8798` is the **canonical** Obsidian MCP bridge — every operator (Claude Desktop, Cowork, the Command Center plugin) reads/writes the vault through it. As of 2026-05-03, ownership migrated from PM2 to the `obsidian-bridge-launcher` Obsidian plugin (`Claude/obsidian-bridge-launcher/`), which spawns the bridge as a child process tied to Obsidian's lifecycle: bridge dies when Obsidian quits. `:8799` is the **additive** Command Center bridge owned by the Obsidian plugin lifecycle — it exposes biomedical-workflow tools to the plugin's own UI and only exists while Obsidian is running. Different scopes (canonical vault access vs. workflow tools), but both now share Obsidian's lifecycle. Trade-off: vault is unreachable to Claude Desktop / Cowork / Raycast when Obsidian is closed (acceptable for "Obsidian is always open" workflows).

## TLS Configuration

All HTTPS services use mkcert certificates at `~/.local/share/mkcert/localhost.pem`. CA root at `~/Library/Application Support/mkcert/rootCA.pem` (installed in macOS System Keychain). All Node.js processes require `NODE_EXTRA_CA_CERTS` pointing to the CA root. Cert valid for localhost and 127.0.0.1, expires 2028-07-07.

## Startup Order

> **Notes**:
> - backend-emulator (:8789) was retired 2026-04-11 — ZettelkastenService now runs in-process inside the `vault-zettelkasten` Obsidian plugin.
> - The biomedical research engine (`/Volumes/ExtraCurricular/TrevClaw-Obsidianodus/Trevor Robey Intelligence Network Citations/`) runs as on-demand subprocess via `node scripts/run-workflow.js` — there is no persistent gateway service. The previous launchd entry on :18789 was for the unrelated homebrew `openclaw` (a consumer "Personal AI assistant" from openclaw.ai, different product entirely; removed 2026-04-27).

1. **Obsidian** — opening Obsidian loads two bridge-owning plugins:
   - `obsidian-bridge-launcher` spawns the canonical MCP bridge child process on :8798 (HTTPS).
   - `command-center` starts the additive bridge on :8799 (HTTPS) and dispatches workflow runs that spawn `Trevor Robey Intelligence Network Citations/scripts/run-workflow.js` on demand.
   Both bridges die when Obsidian quits.
2. **PM2 ecosystem** (no apps as of 2026-05-03 — `mcp-bridge` migrated to obsidian-bridge-launcher; the file is preserved for the canonical-pattern reference and `bridge-start.sh` is still usable for manual / dev invocation).
3. **launchd: `com.trevorrobey.miyo-tls-proxy`** (added 2026-05-07) — wraps Miyo's plaintext :8742 with HTTPS on :8743 using the existing mkcert pair. RunAtLoad + KeepAlive on crash. Logs to `~/.miyo-tls-proxy.log`. Reload after edits with `launchctl unload ~/Library/LaunchAgents/com.trevorrobey.miyo-tls-proxy.plist && launchctl load ~/Library/LaunchAgents/com.trevorrobey.miyo-tls-proxy.plist`.

## Health Checks

```bash
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:8798/healthz
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:8743/v0/health   # Miyo via TLS proxy
lsof -nP -iTCP:8742 -sTCP:LISTEN | grep -i miyo   # plaintext Miyo upstream (proxy backs onto this)
curl http://127.0.0.1:6333/collections/miyo
# Biomedical workflow runtime check (no persistent service — verify the subprocess path is wired):
cd "/Volumes/ExtraCurricular/TrevClaw-Obsidianodus/Trevor Robey Intelligence Network Citations" && bash scripts/verify-phase29-policy.sh | tail -1
```

## Key Integration Points

- **Canonical vault access**: All operators connect through the MCP bridge at :8798. The bridge must be running first.
- **Post-workflow visualization**: None automatic. After workflow completion the Command Center plugin generates vault notes and runs Zettelkasten analysis; visualization is on-demand only (Obsidian's native Graph view, opened by the user). InfraNodus is fully out of the stack as of 2026-05-06 — no local clone, no webview handoff, no MCP server. The "Open Pipeline" ribbon icon opens only the pipeline status sidebar.
- **Medical Zettelkasten MCP**: Runs local algorithmic analysis (gaps, clusters, diversity, cross-domain connections) on synthesizer output and writes Zettelkasten-linked notes to vault.
- **Zettelkasten disambiguation**: Copilot-Everything has an LLM-driven ZettelkastenService that runs in-process inside the `vault-zettelkasten` Obsidian plugin (formerly hosted by the now-retired backend emulator on :8789). Claude Hub has the algorithmic Medical Zettelkasten MCP. They are complementary, not duplicates.
- **Obsidian vault**: `/Volumes/ExtraCurricular/My Digital Garden` (ExtraCurricular volume must be mounted).
- **AWS account access (cloud; AI is read-only)**: The operator's AWS account `833390816446` — the business's Marketplace / AWS Data Exchange seller account — is reached via **IAM Identity Center SSO + a YubiKey FIDO2 key** (no long-lived keys on disk; root has MFA + no access keys). The **AWS API MCP Server** (Claude Desktop extension, available to every session) authenticates as **`ReadOnlyAccess`** — it can read AWS state to assist but **cannot mutate**; consequential seller work uses the operator-only **`AdministratorAccess`** role with explicit per-action approval. This is a security invariant of the same character as the HTTPS-only rule below. Canonical doc: [`Trevor Robey Intelligence Network Citations/03-platforms/aws-data-exchange/account-access.md`](Trevor%20Robey%20Intelligence%20Network%20Citations/03-platforms/aws-data-exchange/account-access.md).

## Trevor Robey Inc Agents Product Stack (summary)

Authoritative narrative lives in `Trevor Robey Intelligence Network Citations/{NOTICE.md,TREVOR_ROBEY_INC_AGENTS_DOSSIER.md,REVENUE_PLAYBOOK.md,README.md}`. Quick reference here:

**Brand hierarchy.** Current legal status (updated 2026-07-22): California LLC formation **filed at bizfileOnline 2026-05-06** and **APPROVED 2026-06-18** — **CA SOS Entity No. B20260217250** (confirmed by certified SOS copy, Certificate No. 457169837, issued 2026-05-12). The legal entity is **Trevor Robey Intelligence Network Citations LLC**, a California limited liability company. The brand wordmark is **"Trevor Robey, INC."** where **INC = Intelligence Network Citations** (a backronym, not a corporate suffix). Customer-facing materials pair the wordmark with the disclosure: *"Trevor Robey, INC. is the wordmark of Trevor Robey Intelligence Network Citations LLC, a California limited liability company."* Commercial brand slug: `trevor-robey-inc` (unchanged — not a regulated entity name). Domain `trevorobeyinc.com` and email `trevor@trevorobeyinc.com` unchanged. Engine credit: "Powered by OpenClaw" — the open-source agent framework, not a brand owned by the operator. The retired homebrew `openclaw.ai` consumer "Personal AI assistant" is unrelated and remains disambiguated where it appears. **Compliance note**: Cal. Corp. Code §17701.08(e) bars "Inc." inside LLC names — that's why the legal name spells the words out. Cal. Bus. & Prof. Code §17910.5(a) restricts "Inc." in fictitious business names to incorporated entities — the wordmark+disclosure pattern handles this by making the entity status explicit. Filing record: [`Trevor Robey Intelligence Network Citations/00-business-formation/llc/certificate-of-formation.md`](Trevor%20Robey%20Intelligence%20Network%20Citations/00-business-formation/llc/certificate-of-formation.md).

**Tagline**: *Every claim, sourced. Every risk, named. In days, not weeks.*
**Elevator**: *Citation-traced biomedical due diligence for biotech investors and pharma BD. Five days. Zero hallucinations. Audit trail included.*

**LLM provider stack** — stateful per-role routing via `config/role-provider-map.json` (updated 2026-06-11; precedence `roles[role]` → template `provider_preference` → `default` = claude-code; each non-claude route falls back to claude-code). Persistent per-role identity + session memory under `config/agents/<role>/{SOUL.md,AGENTS.md,sessions/}`:

| Provider | Role(s) | Status |
|---|---|---|
| Claude Code CLI (`claude-opus-4-8` for scout/analyst/synthesizer; `claude-sonnet-4-6` default) | **scout, analyst, synthesizer** + global default | Active; flat **Claude Max 20×** subscription (not per-token). **As of 2026-07-16 the engine is 100% Claude** — no OSS helpers/fallbacks. `--operator-approve` is YubiKey-gated (`operator-approve-gate arm`). |
| Ollama | — (removed) | **FULLY REMOVED 2026-07-23** — brew package, both LaunchAgents, the :11435 TLS proxy and 9.2GB of models all deleted. The Obsidian side (Copilot chat, vault-zettelkasten, wiki definitions) runs on hosted `copilot-plus-flash`. |
| LM Studio | — (removed) | **DECOMMISSIONED 2026-07-16** — proxy, launchd unit, and engine config all removed (Ollama followed 2026-07-23; no local runtimes remain) |
| Mock provider | CI / deterministic tests | Active |

ToolUniverse subprocess (Apache-2.0, Harvard MIMS / Zitnik Lab; `vendor/tooluniverse/`) provides ~2,116 biomedical tools. Seven project MCP servers under `openclaw-bridge/mcp/` cover ChEMBL, ClinicalTrials.gov, PubMed, HuggingFace Hub (metadata-only — no model weights downloaded), NPI Registry, ICD-10, Owkin pathology.

**Pricing tiers (2026-04-30)**: Investor Pre-Mortem $9,950 anchor / $14,950 standard / $19,950 custom (with KOL primary research) · Failed Trial Archaeology $14,950 · tactical SKUs $4,950 (Conference Synthesis Brief, Trial Design Benchmark Pack) · Cross-Silo Connector Report $9,950–$24,950 · Plain-Language Patient Brief $2,500. Pharmacovigilance Pack retained as tactical SKU (existing marketplace listings preserved). Full breakdown in `REVENUE_PLAYBOOK.md` §2.

**Mission-bundle deliverables (2026-06-12)**: every report bundle now ships three additional deterministically-rendered deliverables (registered in `manifest.json` + sealed in `checksums.txt`): `deliverables/citation-integrity.md` — a graded (A/B/C/D, F+"BLOCKED" if any retraction, N/A if nothing cited) provenance ledger derived from the runtime citation-verification record, and `deliverables/graveyard-memo.md` — an NCT-traced memo of prior terminated/withdrawn/suspended programs in the indication (each with the sponsor's stated stop reason or an explicit "(none stated by sponsor)" — never invented, plus protocol churn and a resolvable clinicaltrials.gov/study/<NCT> link) and a protocol amendment-risk band (LOW/MODERATE/HIGH). The graveyard data comes from a local ClinicalTrials.gov v2 stop-reason/change-history fetcher routed through role prefetch; the memos render from the fetched records with no LLM and are fully fail-soft (an absent fetcher / empty indication / fetch error simply omits them and never blocks a passing report). The third deliverable, `deliverables/search-coverage.md` (2026-07-10, Q5 — the never-hallucinate "honest-zero" artifact), is a deterministic no-LLM per-source ledger of every runtime search and exactly what it returned, with an explicit **zero-result (honest-negative)** section kept separate from **failed/unreachable** sources (a transport failure ≠ an honest zero); it is captured from tool-prefetch outcomes into each task's metadata sidecar (`search_coverage`), rendered by `openclaw-bridge/monetization/search-coverage-ledger.js`, and written to the workflow dir even on the `PHASE30_CITATION_INSUFFICIENT_EVIDENCE` block path so a zero-evidence run **ships** the honest-zero instead of only erroring. Engine deep-dive: `Trevor Robey Intelligence Network Citations/CLAUDE.md`.

**Posture**: research artifacts only (not validated for clinical decision support); no PHI hosted or processed (sources are public biomedical databases); manual-only external actions (no autonomous publish/post/login/transact); citation traceability enforced as a quality gate (every row in every citation index carries a real PMID, NCT, ChEMBL CID, or DOI). As of 2026-06-12 the post-research engine adds a runtime citation-integrity layer: every cited identifier is **grounded in the source records actually retrieved at runtime** (a report-level gate cross-checks each cited id against the union of runtime-fetched ids; below the `minGroundedCitationRatio` threshold the report hard-fails `PHASE30_CITATION_UNVERIFIED`), and every cited DOI is **retraction-screened against Crossref** (any retracted paper hard-stops `PHASE30_CITATION_RETRACTED`, fail-soft on Crossref errors). Grounding/retraction-screening is *not* per-citation external re-resolution against each live source database. Full disclaimers in `NOTICE.md`. Engine deep-dive: `Trevor Robey Intelligence Network Citations/CLAUDE.md`.

**Out of stack** (named in early planning, NOT shipped): Qwen2.5-7B-Instruct, OpenBioLLM-Llama3-8B, any HF-downloaded model weights, the homebrew `openclaw` / `openclaw-cli` (those are unrelated openclaw.ai consumer products).

## Process Management

```bash
pm2 status
pm2 logs
pm2 restart all
```

Logs: `~/.pm2/logs/` (PM2-managed mcp-bridge). Per-workflow biomedical-pipeline subprocess logs land under `Trevor Robey Intelligence Network Citations/workspace/audit/`. The legacy `~/Claude/.logs/openclaw-bridge-*.log` files (from the now-removed homebrew gateway) are stale and safe to ignore.

## Workspace-Specific References

| Topic | Where |
|-------|-------|
| Plugin runtime modes, Obsidian CLI, MCP bridge contract, Zettelkasten endpoints | `Copilot-Everything/CLAUDE.md` |
| Web app cloning toolkit, workspace conventions | `Claude/CLAUDE.md` |
| Research workflows, phase system, commercial operations, dataset pipelines | `Trevor Robey Intelligence Network Citations/CLAUDE.md` |
| LLM provider config, code patterns, git conventions, token efficiency | `Trevor Robey Intelligence Network Citations/CLAUDE.md` |
| Subprojects (Medical Zettelkasten MCP, Command Center) | `Claude/CLAUDE.md` |

## Rules

- Each workspace's CLAUDE.md is authoritative for its own domain.
- Port assignments are coordinated here; do not reassign without updating this file.
- The MCP bridge at :8798 is the canonical vault access point. Do not create alternative vault bridges.
- Session artifacts go to `.archive/` directories, not workspace roots.
- **Single-repo invariant (2026-05-07; now local-only as of 2026-05-26)**: this monorepo is the single source of truth and now lives **only on this machine** — the private GitHub remote `trevoralexanderrobey/TrevClaw-Obsidianodus` was **deleted 2026-05-26** and there are **no git remotes**. Do NOT re-create separate sub-repos for `Claude/`, `Copilot-Everything/`, or `trevor-robey-inc-agents/` — they live here. Do NOT re-add a remote or push without an explicit decision to reverse the local-only posture; durable backup is the verified `git bundle --all` in `~/Downloads/`. The predecessor repo `trevor-robey-inc-agents` (separate, archived 2026-05-07) remains the documented historical rollback anchor (tag `pre-monorepo-consolidation-2026-05-07` at SHA `8e782a0`).
- **Submodule discipline**: only `trevor-robey-inc-agents/vendor/tooluniverse` is a submodule (third-party Apache-2.0). Do not introduce new submodules without an explicit upstream-tracking justification; vendor instead and document with an `UPSTREAM.md`.

## Security Orchestration

Security of this stack is handled by the global `security-orchestration` skill
(the security reflex — see `~/.claude/CLAUDE.md`). Any security-related
work here engages **CrowdStrike Falcon (MCP/API)** as one coordinated unit, with
stack-specialized depth from
`~/.claude/skills/security-orchestration/references/trevclaw-stack-profile.md`.

CrowdStrike/Falcon reference docs are mirrored offline at `~/Security Everything/crowdstrike-docs/`
(README.md is the map). Consult before hitting the network.

- **Read-only recon first**, then cross-correlate, then **strict propose-only**:
  every console-mutating Falcon action is surfaced for an explicitly
  typed, per-item authorization before apply. "Go" never authorizes a mutation.
- The first hardening any review should produce is the one already named in the
  HTTPS-only section below as not-yet-implemented: restrict loopback
  :8742/:6333/:8890 to the proxy UIDs (Falcon `firewall` module is a
  candidate vehicle).
- Never weaken Falcon Custom-IOA rule 1. Infra-security only — no PHI is hosted
  or processed.

## HTTPS-only invariant (non-negotiable, monorepo-wide)

Every network-facing TCP listener owned by code in this monorepo MUST be HTTPS. There are zero permitted plaintext-fallback paths — no env-var escape hatches, no "try TLS then degrade to http", no `tls ? https : http` ternaries, no silent `null`-on-cert-read returns.

**When a TLS cert or key fails to load (any reason at all):** REFACTOR THE CONFIG. Debug what's broken — regenerate the mkcert pair (`mkcert -install && mkcert localhost 127.0.0.1`), fix env-var propagation (e.g. `process.env.HOME` not inherited by Obsidian's plugin host), point the loader at the right paths, fix file permissions. The required behavior on cert failure is to **throw with a useful error and refuse to listen**. Reintroducing an `http.createServer` code path as a "fallback" is the exact regression this rule exists to forbid.

**Forbidden shapes** (caught by `scripts/lint-transport-monorepo.sh`):
- `http.createServer(` in any source file that binds a TCP host:port. (UDS / Windows-pipe transports binding to a filesystem path are explicitly exempt — see the script's `LEGITIMATE_NON_TCP` allowlist.)
- `OPENCLAW_BRIDGE_TLS_DISABLE === "1"` or any equivalent env-gated TLS-disable check.
- `tlsDisable ? http : https` style ternaries, or `if (!tls) return null;` shapes that let a missing cert silently demote to plaintext.

**Canonical HTTPS-required pattern** (copy this when writing a new bridge): see [Copilot-Everything/bridges/obsidian-copilot-bridge/src/server/httpTransport.ts](Copilot-Everything/bridges/obsidian-copilot-bridge/src/server/httpTransport.ts) — it throws if `transport.tls` is unset, reads the mkcert pair, calls `https.createServer`, and asserts `instanceof https.Server` post-construction.

**Per-package guards:** `npm run lint:transport` exists in `Copilot-Everything/bridges/obsidian-copilot-bridge` and `Claude/obsidian-command-center`. Run it before any commit that touches a bridge file. (The `bridges/raycast-obsidian-mcp` package was deleted 2026-05-09 in the bridge consolidation.)

**Monorepo-wide guard:** `bash scripts/lint-transport-monorepo.sh --strict` walks all source files across the three workspaces and exits non-zero on any forbidden pattern. Run as part of pre-commit / CI.

**Out of scope** (the only remaining plain HTTP carve-out): MCP browser-automation tools (Playwright MCP `--isolated` and Claude in Chrome are the two surviving browser surfaces as of 2026-05-12 per `~/.local/share/browser-tools/CONTEXT-HANDOFF-browser-mcp-downsize.md`; claude-preview, computer-use, etc.) that talk to local browser instances over plaintext loopback. No other plaintext loopback is acceptable. The LM Studio and Ollama plaintext upstreams (:1234, :11434) were pulled OUT of this carve-out on 2026-05-11 and both runtimes have since been removed entirely (2026-07-16 / 2026-07-23) — the ports stay in the lint's forbidden list so neither can return silently.

**Wrapped in HTTPS by in-monorepo proxies:** Miyo (2026-05-07), Qdrant (2026-05-08), SearXNG (2026-07-06). (LM Studio and Ollama were also wrapped in 2026-05 but both were **DECOMMISSIONED** — LM Studio 2026-07-16, Ollama 2026-07-23 — proxies, launchd units and config all removed.) These three are third-party loopback services that the operator pulled OUT of the plaintext carve-out, citing the same defense-in-depth concerns: advancing localhost-targeting attack classes (DNS rebinding, browser-based localhost probing, malicious npm postinstall scripts). All four are wrapped using the same canonical pattern — a single `.mjs` file at the `Copilot-Everything/scripts/` level, owned by a dedicated launchd unit, throwing on cert load failure with no plaintext fallback path:

| Service | Plaintext upstream | HTTPS proxy | Proxy script | launchd unit |
|---|---|---|---|---|
| Miyo (`/Applications/Miyo.app` bundled Node server, code-signed) | `http://127.0.0.1:8742` | `https://127.0.0.1:8743` | [`Copilot-Everything/scripts/miyo-tls-proxy.mjs`](Copilot-Everything/scripts/miyo-tls-proxy.mjs) | `com.trevorrobey.miyo-tls-proxy` |
| Qdrant (Miyo-bundled child process, no TLS config exposed) | `http://127.0.0.1:6333` | `https://127.0.0.1:6433` | [`Copilot-Everything/scripts/qdrant-tls-proxy.mjs`](Copilot-Everything/scripts/qdrant-tls-proxy.mjs) | `com.trevorrobey.qdrant-tls-proxy` |
| SearXNG (`python -m searx.webapp` via werkzeug, no TLS config exposed) | `http://127.0.0.1:8890` | `https://127.0.0.1:8891` | [`Copilot-Everything/scripts/searxng-tls-proxy.mjs`](Copilot-Everything/scripts/searxng-tls-proxy.mjs) | `com.trevorrobey.searxng-tls-proxy` |

All monorepo consumers (Copilot plugin's `MiyoServiceDiscovery`, Command Center's `miyo-client.ts`, `trevorobeyinc-research-memory-mcp/src/qdrant.ts`, `obsidian-vault-zettelkasten/src/{constants,settings,adapters/{miyo-client,qdrant-client,model-gateway}}.ts`, and the `searxng-search` connector's `config.js` — consumed by both the Claude MCP surfaces and the openclaw-bridge engine adapter) now point at the HTTPS proxies. The plaintext upstream ports keep listening (we can't make Miyo, Qdrant, or SearXNG stop), but the documented architecture no longer routes through them. The next hardening step (not yet implemented) is `pf` rules restricting :8742, :6333, and :8890 inbound to the proxy UIDs only. (:1234 and :11434 no longer exist — LM Studio and Ollama were removed.)

> **launchd ↔ external-volume gotcha (2026-06-03).** This monorepo lives on `/Volumes/ExtraCurricular` (external). A launchd user-agent's TCC context **cannot read scripts on that volume**, so after the machine wipe all proxy units died at startup with `EPERM` opening their `.mjs` (an interactive shell *can* read it, which masks the problem). Fix: [`Copilot-Everything/scripts/install-tls-proxies.sh`](Copilot-Everything/scripts/install-tls-proxies.sh) stages the five proxy scripts to `~/.local/share/trevclaw-tls-proxies/` (internal volume) and repoints each plist's `ProgramArguments` there, then reloads via `launchctl bootout`/`bootstrap`. The repo copies under `Copilot-Everything/scripts/` remain source-of-truth — **re-run the installer after editing any `*-tls-proxy.mjs`** to re-sync the staged copy. This changes only *where launchd reads the proxy source from*; transport behavior (throw-on-cert-failure, no plaintext fallback) is unchanged.

Predecessor of qdrant-tls-proxy: a separate subproject at `Claude/qdrant-tls-proxy/` (with its own package.json + PM2 ownership) was deleted 2026-05-08 — wrong pattern, never wired in. The single-file launchd pattern above replaces it.

**Deletion log (2026-05-08 cleanup pass):** retired modules previously kept "as reference" were deleted from the monorepo. If you ever need to revive any of them, fetch from the rollback tag `pre-monorepo-consolidation-2026-05-07` on the archived predecessor repo and re-apply with the HTTPS-only invariant enforced (no `http.createServer`, no TLS-disable env vars).
- `Copilot-Everything/backend/copilot-backend-emulator/` — retired 2026-04-11; ZettelkastenService runs in-process inside the `vault-zettelkasten` Obsidian plugin.
- `Copilot-Everything/bridges/raycast-obsidian-extension/src/api/backend-emulator/` — Raycast extension's client for the now-deleted backend emulator.
- `Copilot-Everything/ecosystem.config.js` — empty (`apps: []`) after PM2 migrations completed; `bridge-start.sh` remains for manual/dev invocation.
- `trevor-robey-inc-agents/openclaw-bridge/github-pro-mcp/` — AI-Agent-BountyHunt + BionicLink + Burp bounty-hunter bridge (deprecated 2026-04-29).
- 4 stale `Claude/.logs/openclaw-bridge-*.log` files (homebrew gateway :18789, removed 2026-04-27).
- 17 historical CI validation gate run dirs (`Copilot-Everything/configs/validation/{cli,direct-cli}-stability-gate-20260321-*/`).
- 3 stale context-handoff `.md` files (one-time AI-to-AI session handoff payloads).
- `trevor-robey-inc-agents/docs/ei-integration-analysis-2026-04-23.md` — historical OCRA↔TrevGraph-Studio analysis memo, predates rebrand, no code mutations occurred.
- `trevor-robey-inc-agents/openclaw-bridge/mcp/adisinsight-mcp.bak.cleanup.1777186681/` and 2 other `*.bak` files.
- `Claude/qdrant-tls-proxy/` — second-pass deletion 2026-05-08, then **replaced 2026-05-08** by the canonical-pattern proxy at `Copilot-Everything/scripts/qdrant-tls-proxy.mjs` owned by launchd unit `com.trevorrobey.qdrant-tls-proxy`. The deleted subproject was the wrong pattern (own package.json + PM2 ownership, never wired in by any client). The replacement matches `miyo-tls-proxy.mjs` (single .mjs file, launchd-owned, throws on cert failure). Both clients now point at `https://127.0.0.1:6433`. See "Wrapped in HTTPS by in-monorepo proxies" above.
- `obsidian-devtools` MCP path retired 2026-05-08 — Claude Desktop's `obsidian-devtools` chrome-devtools-mcp entry (CDP on plain-HTTP `:8315`), `~/Library/LaunchAgents/com.trevorrobey.obsidian-debug.plist`, and `~/bin/launch-obsidian.sh` are all deleted. Replaced by three in-bridge tools that go through the canonical HTTPS bridge on `:8798` instead of CDP: `obsidian_dev_console_logs`, `obsidian_dev_console_errors` (read-only ring buffers, always on), and `obsidian_dev_console_eval` (gated by the `devConsoleEvalEnabled` setting on the obsidian-bridge-launcher plugin, default OFF). Wire: bridge child process ↔ launcher plugin via a new fd-3 line-delimited JSON-RPC channel (`stdio: ["ignore","pipe","pipe","pipe"]` + `BRIDGE_IPC_FD=3`); launcher captures `console.{log,info,warn,error,debug}` + `window.error` + `unhandledrejection` into ring buffers at plugin onload. The retired homebrew CDP path should not be reintroduced.
- `chrome-devtools-mcp` fully retired 2026-05-12 — process tree killed; caches, profile clone, npx cache, and `chrome-devtools-headless` entry in `claude_desktop_config.json` deleted; the `~/Code/chrome-devtools-mcp/` clone removed; **Playwright MCP (`--isolated`) + Claude in Chrome** are now the only two browser-control surfaces. The scrape-sidecar at `trevor-robey-inc-agents/scrape-sidecar/` was migrated off `seleniumbase` + `camoufox[geoip]` onto Playwright Firefox + Chromium (isolated profile per fetch) on the same day. See `~/.local/share/browser-tools/CONTEXT-HANDOFF-browser-mcp-downsize.md` for the full purge inventory and the new global `~/.claude/CLAUDE.md` "Browser MCP Strategy and Context Persistence" rule.
- `claude-cli-bridge` retired 2026-05-31 — superseded by the native Claude Desktop Code tab, which replaces BOTH the OUTBOUND `claude-cli-bridge` adapter AND the INBOUND `claude mcp serve` registration. Archived to `Claude/.archive/claude-cli-bridge/` (git history + `.learnings/LEARNINGS.md` preserved; `git log --follow` works). Do NOT reintroduce a custom `claude -p` subprocess bridge or a `claude mcp serve` wiring; drive Claude Code through the native Desktop Code tab instead.

## Browser Session History

> Per the global `~/.claude/CLAUDE.md` "Browser MCP Strategy and Context Persistence" rule, every Claude Code session that calls a browser MCP non-trivially appends a structured summary block below. Newest entries at the top. The two surviving browser surfaces are **Playwright MCP (`--isolated`)** and **Claude in Chrome**. See the global rule for the entry format, importance filter, and timing.

- 2026-07-23 · claude-in-chrome · AWS seller-account recon + Google Workspace tailored to business/AWS
  ops (logged-in AWS Marketplace Management Portal, AWS Billing, Gmail, Google Calendar, Strayer
  Outlook; work profile "Trevor Robey Intelligence Network Citations") · **AWS is now CLEARED FOR
  PAID** — operator added the disbursement method and Account status flipped to ✓ "Publish paid and
  free products", retiring the 2.5-month block (the §6 escalation letter is now moot — do not send).
  Built the Gmail ops layer: 12 filters/11 labels, send-as ×3, signature w/ LLC disclosure,
  reply-from-same-alias, plus 5 calendar deadlines (incl. $800 CA franchise tax 2026-08-15).
  Enabled + verified Strayer→Gmail forwarding. Gotchas: (1) **Gmail refuses a label named
  "Finance"** — reserved system label; a single bad label name makes the whole import report the
  misleading "fix the XML" error (XML was valid; diff the Filters tab against the file to find the
  culprit). (2) **Never match your own domain as a bare string in a filter** — `"trevorobeyinc.com"`
  matched nearly ALL inbound mail (it's in every To: header) and was labelling CrowdStrike/Google
  security alerts as "Prospects". (3) Gmail's **"Add another email address" opens a separate Chrome
  window that claude-in-chrome cannot reach** — structurally operator-only. (4) Calendar's
  `render?action=TEMPLATE` pre-fills fine but **the first Save click after load is swallowed** —
  click twice, verify on the month view. (5) A mail-routing test with subject `test`/profanity was
  **accepted-then-quarantined by Proofpoint** and never bounced — *absence of a bounce* proved the
  address was live; always test with a realistic business message. (6) AWS's "Email for custom
  notifications" is a **no-op for a direct data seller** (reseller/professional-services events
  only) — listing-review outcomes and payout failures still go to the ROOT email, which is still
  the operator's `.edu` address (risk R1, unresolved).
- 2026-07-22 · claude-in-chrome · Google Workspace stand-up + full Zoho→Gmail mail cutover for
  trevorobeyinc.com (logged-in Cloudflare, Google Admin console, Zoho Mail; new Chrome profile
  "Trevor Robey Intelligence Network Citations") · created a zone-scoped Cloudflare DNS token
  (Keychain-only), flipped Gmail DKIM signing on, ran the IMAP data import (1,251/1,251, 0 failed),
  added `support@`/`aws@` aliases, set Gmail dark theme. Gotchas: (1) Google's Entri auto-connect
  flow silently replaced the Zoho MX — the "verify domain only" plan was overtaken by a real
  cutover; (2) **this paid Zoho account's IMAP host is `imappro.zoho.com`, NOT `imap.zoho.com`** —
  the wrong host returns a generic `Invalid credentials` that mimics a bad password (cost ~1h;
  a raw `openssl s_client` IMAP probe with the Keychain-held app password is what diagnosed it);
  (3) Gmail's theme save works but the running page doesn't repaint until reload — it *looks* like
  the save failed; (4) GAM7 can't be driven from a non-interactive shell (reads stdin) and needs a
  prerequisite App-access-control trust for its Client ID.
- 2026-07-21 · claude-in-chrome · verify/redeem GitHub Copilot student benefit (logged-in github.com) ·
  nothing left to redeem — "GitHub Copilot Student" already active (SKU free_educational_quota, 200 AI
  credits/mo, overage $0-locked); gotcha: model picker is Auto-ONLY on this tier (every named model
  aria-disabled → needs Pro/Pro+), so VS Code "upgrade" nags are tier-accurate, not a config error
- 2026-07-19 · claude-in-chrome · remove TikTok Chrome-PWA + clear its data (Default profile, logged-in) ·
  logged the site out via tiktok.com/logout, then cleared all origin-reachable state through page JS
  (10 cookies, 69 localStorage keys, 6 IndexedDB DBs, 2 CacheStorage caches, service worker
  unregistered); app uninstall + HttpOnly-cookie purge handed to operator via staged
  chrome://app-settings/<id> and chrome://settings/content/all?searchSubpage=tiktok (the extension
  cannot touch chrome:// pages). Gotchas: deleting the shim .app alone ≠ uninstall — Chrome
  regenerates it while its registry entry lives; and a Falcon custom IOA process-BLOCKS zsh touching
  Chrome profile files (Preferences/Local State scrub died silently, 3× High/Prevention) — by
  design, don't bypass; drive Chrome's own UI instead. See memories
  `falcon-blocks-chrome-profile-shell-access` + `chrome-pwa-uninstall-registry-resurrection`.

- 2026-07-09 · claude-in-chrome · complete Parker Dewey Career Launcher profile (app.parkerdewey.com, logged-in)
  per the "Completing Your profile" onboarding email · added 239-char personal statement, GPA 4.0
  (from Strayer GPS dashboard PDF — President's List), and 3 experience entries sourced from the
  trevorrobeyinc.github.io portfolio (Trevor Robey Inc. founder 2025–, freelance digital marketer
  2020–, e-commerce 2016–2020); resume/location/affiliations were already set. Gotcha: profile-page
  read_page (interactive) silently omitted lower form controls — scroll + find() located them.
  07-10 follow-up: added LinkedIn URL (linkedin.com/in/trevor-robey) to Resume/CV page; Parker Dewey
  web session had expired → user signed in themselves (password entry stays hand-off).
- 2026-07-02 · claude-in-chrome · mirror docs.crowdstrike.com console docs (US-2 SSO) · Fluid
  Topics `/api/khub` mirror; captured the CrowdStrike APIs publication tree; full 3,120-pub crawl
  abandoned (rate-limit 403s + auto-mode flagged the page→localhost relay as exfil). Public corpus
  built separately under `crowdstrike-docs/`.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->
