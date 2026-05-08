# TrevClaw-Obsidianodus

Single-repo monorepo for the **Trevor Robey, INC.** biomedical research intelligence stack. As of 2026-05-07 this is the canonical source of truth — three previously separate sub-trees (`Claude/`, `Copilot-Everything/`, `trevor-robey-inc-agents/`) plus the brand canon at `trevor-robey-inc/` are all first-class members of this repo.

GitHub: [trevoralexanderrobey/TrevClaw-Obsidianodus](https://github.com/trevoralexanderrobey/TrevClaw-Obsidianodus) (private).

## Repo Topology

| Path | Role | Deep Dive |
|------|------|-----------|
| `Claude/` | Central hub: Medical Zettelkasten MCP, Command Center plugin, Trevor Robey Inc Research Memory MCP, Obsidian-bridge launcher, vault-zettelkasten plugin | `Claude/CLAUDE.md` |
| `Copilot-Everything/` | Obsidian integration: plugin fork (vendored at `repos/obsidian-copilot-mcp/`), MCP bridge (:8798), Miyo TLS proxy (:8743) | `Copilot-Everything/CLAUDE.md` |
| `trevor-robey-inc-agents/` | Citation-traced biomedical due diligence engine (powered by OpenClaw). Six workflow templates feed concrete commercial offerings: Investor Pre-Mortem (primary, $9,950–$19,950) and Failed Trial Archaeology (flanking, $14,950) drive premium revenue; Conference Synthesis Brief, Trial Design Benchmark Pack, Cross-Silo Connector Report, Plain-Language Patient Brief, and Pharmacovigilance Pack serve tactical demand. Role-routed LLM providers (Claude Code primary, LM Studio fallback, mock for CI), ToolUniverse subprocess (~2,116 tools, pinned at v1.1.10), eight project MCP servers. Runs as on-demand subprocess via `node scripts/run-workflow.js` — no persistent gateway. | `trevor-robey-inc-agents/CLAUDE.md` |
| `trevor-robey-inc/` | Brand canon, LLC formation paperwork, six-SKU offering ladder, launch playbook, REVENUE_PLAYBOOK, NOTICE, dossier | `trevor-robey-inc/README.md` |

### Submodule

- `trevor-robey-inc-agents/vendor/tooluniverse` → [mims-harvard/ToolUniverse](https://github.com/mims-harvard/ToolUniverse) pinned at SHA `3833b0e` (v1.1.10, Apache-2.0)

### Vendored fork (no submodule)

- `Copilot-Everything/repos/obsidian-copilot-mcp/` → SHA `df61538` of [logancyang/obsidian-copilot](https://github.com/logancyang/obsidian-copilot) on branch `codex/post-validated-mcp-baseline` — see `Copilot-Everything/repos/obsidian-copilot-mcp/UPSTREAM.md` for re-sync instructions.

### Predecessor repos

- `https://github.com/trevoralexanderrobey/trevor-robey-inc-agents` was archived 2026-05-07 with rollback tag `pre-monorepo-consolidation-2026-05-07` pointing at SHA `8e782a0` (the last pre-consolidation HEAD before the snapshot commit).

## Multi-Operator Topology

Three independent operators share this stack. None is subordinate to the others.

```
Claude Desktop (heavy-lift code/file operator)
  ├── [MCP stdio] → claude-code CLI
  ├── [MCP stdio] → obsidian-bridge adapter → [HTTPS :8798] → Canonical MCP Bridge
  ├── [MCP stdio] → chrome-devtools
  └── [MCP stdio] → filesystem server

Command Center plugin (workflow dispatch + monitoring, Obsidian plugin at obsidian-openclaw-command-center/)
  ├── [child_process.spawn()] → trevor-robey-inc-agents/scripts/run-workflow.js
  │                              ├── role-routed LLM providers (Claude Code primary, LM Studio fallback, mock for CI; Ollama slot disabled)
  │                              ├── ToolUniverse subprocess (vendor/tooluniverse, ~2,116 tools)
  │                              └── 8 project MCP servers (chembl, clinicaltrials-gov, pubmed, huggingface metadata-only, npi, icd10, owkin, gdrive)
  ├── [child_process.spawn()] → trevorobeyinc-research-memory CLI (auto-ingest pack to Qdrant)
  ├── [MCP stdio] → Medical Zettelkasten MCP (post-workflow graph analysis)
  ├── [HTTP :8742] → Miyo semantic search
  └── [HTTP :8799] → Own additive MCP bridge (biomedical workflow tools)

Biomedical Workflow Observability Stack (optional, Docker Compose)
  ├── Traefik :11480/:11481 → Ollama :11434 / LM Studio :1234 (failover)
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
| 6333 | Qdrant Vector DB | HTTP | external | External process |
| 1234 | LM Studio (fallback LLM provider; qwen2.5-coder-7b-instruct) | HTTP | external | LM Studio app |
| 11434 | Ollama (LLM provider slot — currently DISABLED in config/llm-providers.json) | HTTP | external | Ollama app |
| 11480 | Traefik scout proxy (optional) | HTTP | trevor-robey-inc-agents | Docker Compose |
| 11481 | Traefik analyst proxy (optional) | HTTP | trevor-robey-inc-agents | Docker Compose |
| 9090 | Prometheus (optional) | HTTP | trevor-robey-inc-agents | Docker Compose |
| 3001 | Grafana (optional) | HTTP | trevor-robey-inc-agents | Docker Compose |

> **:8798 vs :8799 disambiguation**: `:8798` is the **canonical** Obsidian MCP bridge — every operator (Claude Desktop, Cowork, the Command Center plugin) reads/writes the vault through it. As of 2026-05-03, ownership migrated from PM2 to the `obsidian-bridge-launcher` Obsidian plugin (`Claude/obsidian-bridge-launcher/`), which spawns the bridge as a child process tied to Obsidian's lifecycle: bridge dies when Obsidian quits. `:8799` is the **additive** Command Center bridge owned by the Obsidian plugin lifecycle — it exposes biomedical-workflow tools to the plugin's own UI and only exists while Obsidian is running. Different scopes (canonical vault access vs. workflow tools), but both now share Obsidian's lifecycle. Trade-off: vault is unreachable to Claude Desktop / Cowork / Raycast when Obsidian is closed (acceptable for "Obsidian is always open" workflows).

## TLS Configuration

All HTTPS services use mkcert certificates at `~/.local/share/mkcert/localhost.pem`. CA root at `~/Library/Application Support/mkcert/rootCA.pem` (installed in macOS System Keychain). All Node.js processes require `NODE_EXTRA_CA_CERTS` pointing to the CA root. Cert valid for localhost and 127.0.0.1, expires 2028-07-07.

## Startup Order

> **Notes**:
> - backend-emulator (:8789) was retired 2026-04-11 — ZettelkastenService now runs in-process inside the `vault-zettelkasten` Obsidian plugin.
> - The biomedical research engine (`/Users/trevorrobey/Code/trevor-robey-inc-agents/`) runs as on-demand subprocess via `node scripts/run-workflow.js` — there is no persistent gateway service. The previous launchd entry on :18789 was for the unrelated homebrew `openclaw` (a consumer "Personal AI assistant" from openclaw.ai, different product entirely; removed 2026-04-27).

1. **Obsidian** — opening Obsidian loads two bridge-owning plugins:
   - `obsidian-bridge-launcher` spawns the canonical MCP bridge child process on :8798 (HTTPS).
   - `openclaw-command-center` starts the additive bridge on :8799 (HTTPS) and dispatches workflow runs that spawn `trevor-robey-inc-agents/scripts/run-workflow.js` on demand.
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
cd /Users/trevorrobey/TrevClaw-Obsidianodus/trevor-robey-inc-agents && bash scripts/verify-phase29-policy.sh | tail -1
```

## Key Integration Points

- **Canonical vault access**: All operators connect through the MCP bridge at :8798. The bridge must be running first.
- **Post-workflow visualization**: None automatic. After workflow completion the Command Center plugin generates vault notes and runs Zettelkasten analysis; visualization is on-demand only (Obsidian's native Graph view, opened by the user). InfraNodus is fully out of the stack as of 2026-05-06 — no local clone, no webview handoff, no MCP server. The "Open Pipeline" ribbon icon opens only the pipeline status sidebar.
- **Medical Zettelkasten MCP**: Runs local algorithmic analysis (gaps, clusters, diversity, cross-domain connections) on synthesizer output and writes Zettelkasten-linked notes to vault.
- **Zettelkasten disambiguation**: Copilot-Everything has an LLM-driven ZettelkastenService that runs in-process inside the `vault-zettelkasten` Obsidian plugin (formerly hosted by the now-retired backend emulator on :8789). Claude Hub has the algorithmic Medical Zettelkasten MCP. They are complementary, not duplicates.
- **Obsidian vault**: `/Volumes/ExtraCurricular/My Digital Garden` (ExtraCurricular volume must be mounted).

## Trevor Robey Inc Agents Product Stack (summary)

Authoritative narrative lives in `trevor-robey-inc-agents/{NOTICE.md,TREVOR_ROBEY_INC_AGENTS_DOSSIER.md,REVENUE_PLAYBOOK.md,README.md}`. Quick reference here:

**Brand hierarchy.** Current legal status (verified 2026-05-06): California LLC formation **filed at bizfileOnline 2026-05-06** (receipt B20260217250); CA SOS approval pending (2-3 business days). Upon approval, the legal entity is **Trevor Robey Intelligence Network Citations LLC**, a California limited liability company. The brand wordmark is **"Trevor Robey, INC."** where **INC = Intelligence Network Citations** (a backronym, not a corporate suffix). Customer-facing materials pair the wordmark with the disclosure: *"Trevor Robey, INC. is the wordmark of Trevor Robey Intelligence Network Citations LLC, a California limited liability company."* Commercial brand slug: `trevor-robey-inc` (unchanged — not a regulated entity name). Domain `trevorobeyinc.com` and email `trevor@trevorobeyinc.com` unchanged. Engine credit: "Powered by OpenClaw" — the open-source agent framework, not a brand owned by the operator. The retired homebrew `openclaw.ai` consumer "Personal AI assistant" is unrelated and remains disambiguated where it appears. **Compliance note**: Cal. Corp. Code §17701.08(e) bars "Inc." inside LLC names — that's why the legal name spells the words out. Cal. Bus. & Prof. Code §17910.5(a) restricts "Inc." in fictitious business names to incorporated entities — the wordmark+disclosure pattern handles this by making the entity status explicit. Filing record: [`trevor-robey-inc/00-business-formation/llc/certificate-of-formation.md`](trevor-robey-inc/00-business-formation/llc/certificate-of-formation.md).

**Tagline**: *Every claim, sourced. Every risk, named. In days, not weeks.*
**Elevator**: *Citation-traced biomedical due diligence for biotech investors and pharma BD. Five days. Zero hallucinations. Audit trail included.*

**LLM provider stack** (per `trevor-robey-inc-agents/config/llm-providers.json`):

| Provider | Role | Status |
|---|---|---|
| Claude Code CLI (`claude-sonnet-4-6`) | Primary | Active; default for all production tiers |
| LM Studio (`qwen2.5-coder-7b-instruct`, alt `mistral-nemo-12b`) | Fallback | Active on `localhost:1234` |
| Mock provider | CI / deterministic tests | Active |
| Ollama | — | Configured, **disabled** |

ToolUniverse subprocess (Apache-2.0, Harvard MIMS / Zitnik Lab; `vendor/tooluniverse/`) provides ~2,116 biomedical tools. Eight project MCP servers under `openclaw-bridge/mcp/` cover ChEMBL, ClinicalTrials.gov, PubMed, HuggingFace Hub (metadata-only — no model weights downloaded), NPI Registry, ICD-10, Owkin pathology, Google Drive.

**Pricing tiers (2026-04-30)**: Investor Pre-Mortem $9,950 anchor / $14,950 standard / $19,950 custom (with KOL primary research) · Failed Trial Archaeology $14,950 · tactical SKUs $4,950 (Conference Synthesis Brief, Trial Design Benchmark Pack) · Cross-Silo Connector Report $9,950–$24,950 · Plain-Language Patient Brief $2,500. Pharmacovigilance Pack retained as tactical SKU (existing marketplace listings preserved). Full breakdown in `REVENUE_PLAYBOOK.md` §2.

**Posture**: research artifacts only (not validated for clinical decision support); no PHI hosted or processed (sources are public biomedical databases); manual-only external actions (no autonomous publish/post/login/transact); citation traceability enforced as a quality gate (every row in every citation index carries a real PMID, NCT, ChEMBL CID, or DOI). Full disclaimers in `NOTICE.md`.

**Out of stack** (named in early planning, NOT shipped): Qwen2.5-7B-Instruct, OpenBioLLM-Llama3-8B, any HF-downloaded model weights, the homebrew `openclaw` / `openclaw-cli` (those are unrelated openclaw.ai consumer products).

## Process Management

```bash
pm2 status
pm2 logs
pm2 restart all
```

Logs: `~/.pm2/logs/` (PM2-managed mcp-bridge). Per-workflow biomedical-pipeline subprocess logs land under `trevor-robey-inc-agents/workspace/audit/`. The legacy `~/Claude/.logs/openclaw-bridge-*.log` files (from the now-removed homebrew gateway) are stale and safe to ignore.

## Workspace-Specific References

| Topic | Where |
|-------|-------|
| Plugin runtime modes, Obsidian CLI, MCP bridge contract, Zettelkasten endpoints | `Copilot-Everything/CLAUDE.md` |
| Web app cloning toolkit, workspace conventions | `Claude/CLAUDE.md` |
| Research workflows, phase system, commercial operations, dataset pipelines | `trevor-robey-inc-agents/CLAUDE.md` |
| LLM provider config, code patterns, git conventions, token efficiency | `trevor-robey-inc-agents/CLAUDE.md` |
| Subprojects (Medical Zettelkasten MCP, Command Center) | `Claude/CLAUDE.md` |

## Rules

- Each workspace's CLAUDE.md is authoritative for its own domain.
- Port assignments are coordinated here; do not reassign without updating this file.
- The MCP bridge at :8798 is the canonical vault access point. Do not create alternative vault bridges.
- Session artifacts go to `.archive/` directories, not workspace roots.
- **Single-repo invariant (2026-05-07)**: this monorepo at [`trevoralexanderrobey/TrevClaw-Obsidianodus`](https://github.com/trevoralexanderrobey/TrevClaw-Obsidianodus) is the single source of truth. Do NOT re-create separate sub-repos for `Claude/`, `Copilot-Everything/`, or `trevor-robey-inc-agents/` — they live here. The retired GitHub remote `https://github.com/trevoralexanderrobey/trevor-robey-inc-agents` is the rollback anchor (tag `pre-monorepo-consolidation-2026-05-07` at SHA `8e782a0`).
- **Submodule discipline**: only `trevor-robey-inc-agents/vendor/tooluniverse` is a submodule (third-party Apache-2.0). Do not introduce new submodules without an explicit upstream-tracking justification; vendor instead and document with an `UPSTREAM.md`.

## HTTPS-only invariant (non-negotiable, monorepo-wide)

Every network-facing TCP listener owned by code in this monorepo MUST be HTTPS. There are zero permitted plaintext-fallback paths — no env-var escape hatches, no "try TLS then degrade to http", no `tls ? https : http` ternaries, no silent `null`-on-cert-read returns.

**When a TLS cert or key fails to load (any reason at all):** REFACTOR THE CONFIG. Debug what's broken — regenerate the mkcert pair (`mkcert -install && mkcert localhost 127.0.0.1`), fix env-var propagation (e.g. `process.env.HOME` not inherited by Obsidian's plugin host), point the loader at the right paths, fix file permissions. The required behavior on cert failure is to **throw with a useful error and refuse to listen**. Reintroducing an `http.createServer` code path as a "fallback" is the exact regression this rule exists to forbid.

**Forbidden shapes** (caught by `scripts/lint-transport-monorepo.sh`):
- `http.createServer(` in any source file that binds a TCP host:port. (UDS / Windows-pipe transports binding to a filesystem path are explicitly exempt — see the script's `LEGITIMATE_NON_TCP` allowlist.)
- `OPENCLAW_BRIDGE_TLS_DISABLE === "1"` or any equivalent env-gated TLS-disable check.
- `tlsDisable ? http : https` style ternaries, or `if (!tls) return null;` shapes that let a missing cert silently demote to plaintext.

**Canonical HTTPS-required pattern** (copy this when writing a new bridge): see [Copilot-Everything/bridges/obsidian-copilot-bridge/src/server/httpTransport.ts](Copilot-Everything/bridges/obsidian-copilot-bridge/src/server/httpTransport.ts) — it throws if `transport.tls` is unset, reads the mkcert pair, calls `https.createServer`, and asserts `instanceof https.Server` post-construction.

**Per-package guards:** `npm run lint:transport` exists in `Copilot-Everything/bridges/obsidian-copilot-bridge`, `Copilot-Everything/bridges/raycast-obsidian-mcp`, and `Claude/obsidian-openclaw-command-center`. Run it before any commit that touches a bridge file.

**Monorepo-wide guard:** `bash scripts/lint-transport-monorepo.sh --strict` walks all source files across the three workspaces and exits non-zero on any forbidden pattern. Run as part of pre-commit / CI.

**Out of scope** (the user has explicitly accepted these as plain HTTP loopback): third-party services bound to 127.0.0.1 that this repo does not own — LM Studio :1234, Qdrant :6333, Ollama :11434. Do not "fix" them by introducing a TLS-terminating proxy unless the user asks; they're not foot-guns, they're the only thing those external apps speak.

**Wrapped in HTTPS by an in-monorepo proxy (2026-05-07):** Miyo. The user opted out of the loopback-HTTP carve-out for Miyo on 2026-05-07 and asked for HTTPS as a defense-in-depth posture against advancing localhost-targeting attack classes (DNS rebinding, browser-based localhost probing, malicious npm postinstall scripts). Miyo's bundled Node server inside `/Applications/Miyo.app/Contents/Resources/bin/service/server.js` is hardcoded to plain HTTP with no TLS knob and the binary is code-signed (so patching it is off the table). Solution: a small TLS-terminating proxy at [Copilot-Everything/scripts/miyo-tls-proxy.mjs](Copilot-Everything/scripts/miyo-tls-proxy.mjs) listening on `https://127.0.0.1:8743`, forwarding to `http://127.0.0.1:8742`, owned by launchd unit `~/Library/LaunchAgents/com.trevorrobey.miyo-tls-proxy.plist`. All monorepo consumers (Copilot plugin's `MiyoServiceDiscovery`, Command Center's `miyo-client.ts`) now point at `:8743`. Miyo's plaintext :8742 is still listening — we can't make it stop — but the documented architecture no longer routes through it. If you want stricter isolation on top of this, the next step is a `pf` rule restricting :8742 inbound to the proxy's UID.

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
- `Claude/qdrant-tls-proxy/` — second-pass deletion 2026-05-08. The proxy was built but never wired in: both clients (`trevorobeyinc-research-memory-mcp` and `obsidian-vault-zettelkasten` plugin) hardcode `http://127.0.0.1:6333` and bypass the proxy. Per the loopback-HTTP carve-out below, Qdrant on `:6333` plaintext stays accepted (loopback-only bind, third-party app we don't own) — no defense-in-depth wrap needed, unlike Miyo. If we ever want to revisit, the next step is a `pf` rule restricting `:6333` inbound to specific UIDs.
