# GOOSE_GUIDE.md — TrevClaw-Obsidianodus (Goose Project Guide)

> Goose reads this file at session start. This is the project's authoritative brain — all rules, constraints, topology, and behavioral guidelines live here. This is the Goose-flavor equivalent of Claude's `CLAUDE.md`.

Single-repo monorepo for the **Trevor Robey, INC.** biomedical research intelligence stack. As of 2026-05-07 this is the canonical source of truth — three previously separate sub-trees (`Claude/`, `Copilot-Everything/`, `trevor-robey-inc-agents/`) plus the brand canon at `trevor-robey-inc/` are all first-class members of this repo.

Hosting: **local-only as of 2026-05-26.** The private GitHub remote `trevoralexanderrobey/TrevClaw-Obsidianodus` was **deleted** on 2026-05-26; the monorepo now lives only on this machine with **no git remotes**. Durable backup is a verified `git bundle --all` in **`~/Documents/`** (current: `TrevClaw-Obsidianodus-FULL-backup-20260806-2047.bundle`, HEAD `6e1319e`, SHA-256 `ab362a67…`, verified-matching copy at `/Volumes/ExtraCurricular/Backups/`). Do not re-add a remote or push without an explicit decision to reverse this local-only posture.

## 📌 Shared Continuity Board — read this first

> **Before substantive work in this repo, read [`_continuity/CONTINUITY.md`](_continuity/CONTINUITY.md).**
> It is the ONE living board all AI surfaces share — so every surface knows what's being worked on and what changed, and can adjust/add/cooperate. Read **Current focus** + the top few **Log** entries at session start; append a Log entry on meaningful progress or handoff. Protocol, reachability, and external-volume write-safety: [`_continuity/README.md`](_continuity/README.md).

## 🧠 Business memory — use `perseus-business`, not the global vault

> **Two Perseus vaults are reachable from this repo. Business facts go in the repo-scoped one.**
>
> | server | vault | scope |
> |---|---|---|
> | **`mcp__perseus-business__*`** | `~/.perseus-vault/data/business-vault.db` | **Trevor Robey, INC. only.** Declared in this repo's [`.mcp.json`](.mcp.json), so it exists ONLY when working here. |
> | `mcp__perseus-vault__*` | `~/.perseus-vault/data/perseus-vault.db` | machine-global (YubiKey gates, Falcon, browser lanes, host tooling). Registered in `~/.claude.json`, so it is reachable everywhere and is NOT business memory. |
>
> Each has its **own AES key** (`business.key` vs `secret.key`) and its own embeddings. The five business entities were migrated out of the global vault on 2026-07-26 and archived there, so there is exactly one source of truth — **do not write business facts to `perseus-vault`**, or the two will silently diverge.
>
> The DB deliberately lives outside the repo: `/Volumes/ExtraCurricular` has documented write hangs, and the FTS5 index stores every memory in **plaintext**, which must never sit inside a git working tree.
>
> **This does not replace [`_continuity/CONTINUITY.md`](_continuity/CONTINUITY.md).** The board is the chronological narrative; the vault is a similarity-queried fact store with no ordering and active decay.

## 🔌 Plugin bindings — read before using any plugin skill

> **The installed plugins are templates.** Their skills refer to tools generically (`~~project tracker`, `~~CRM`, `~~literature`, `~~data warehouse`) — **203 such placeholders** across the installed set — and each deployment is expected to say which real tool fills each slot.
>
> **[`Trevor Robey Intelligence Network Citations/PLUGIN-BINDINGS.md`](Trevor%20Robey%20Intelligence%20Network%20Citations/PLUGIN-BINDINGS.md)** is that answer for this business.
>
> **The rule that matters: an unbound category means SAY SO — never invent one.** About twenty categories resolve to *nothing* here (no Jira, no Slack, no HubSpot, no Snowflake, no Figma, no CI), because this is a single-operator, pre-revenue, local-only business. A template-following skill handed a missing tool will manufacture a plausible substitute — a ticket key, a deal stage, a traffic number.

## 🔗 opencode ↔ Goose delegation bridge

> Goose can delegate cheap mechanical + biomedical research to opencode's **free** models at $0.
> **Every file of this setup — where it lives and why — is mapped in ONE place:**
> **[`_opencode-bridge/README.md`](_opencode-bridge/README.md).** The operational files live *outside* this repo on purpose. The only in-repo piece is the `opencode` server stanza in [`.mcp.json`](.mcp.json). Security model: a read-only + public-data + no-exfil **allowlist** for the free worker.

## Repo Topology

| Path | Role | Deep Dive |
|------|------|-----------|
| `Claude/` | Central hub: Medical Zettelkasten MCP, Command Center plugin, Research Memory MCP, Obsidian-bridge launcher, vault-zettelkasten plugin | `Claude/GOOSE_GUIDE.md` |
| `Copilot-Everything/` | Obsidian integration: plugin fork, MCP bridge (:8798), Miyo TLS proxy (:8743) | `Copilot-Everything/GOOSE_GUIDE.md` |
| `Trevor Robey Intelligence Network Citations/` | **Single merged business folder.** Contains BOTH the citation-traced biomedical due-diligence **engine** (powered by OpenClaw) AND the **brand canon** (LLC formation paperwork, six-SKU offering ladder). | `Trevor Robey Intelligence Network Citations/GOOSE_GUIDE.md` |

### Submodule

- `trevor-robey-inc-agents/vendor/tooluniverse` → [mims-harvard/ToolUniverse](https://github.com/mims-harvard/ToolUniverse) pinned at SHA `3833b0e` (v1.1.10, Apache-2.0)

## Unified Port Map

| Port | Service | Protocol | Owner Workspace |
|------|---------|----------|-----------------|
| 8798 | Obsidian MCP Bridge (canonical) | HTTPS | Copilot-Everything |
| 8799 | Command Center Bridge (additive) | HTTPS | Claude (Obsidian plugin) |
| 8743 | Miyo TLS proxy | HTTPS | Copilot-Everything |
| 8742 | Miyo Semantic Search (plaintext upstream) | HTTP | external |
| 6433 | Qdrant TLS proxy | HTTPS | Copilot-Everything |
| 6333 | Qdrant Vector DB (plaintext upstream) | HTTP | external |
| 8891 | SearXNG TLS proxy | HTTPS | Copilot-Everything |
| 8890 | SearXNG (private metasearch) | HTTP | Claude |

## TLS Configuration

All HTTPS services use mkcert certificates at `~/.local/share/mkcert/localhost.pem`. CA root at `~/Library/Application Support/mkcert/rootCA.pem` (installed in macOS System Keychain). All Node.js processes require `NODE_EXTRA_CA_CERTS` pointing to the CA root.

## Health Checks

```bash
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:8798/healthz
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:8743/v0/health
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:6433/collections/miyo
```

## Trevor Robey Inc Agents Product Stack

**Brand hierarchy.** Current legal status: California LLC formation **APPROVED 2026-06-18** — **CA SOS Entity No. B20260217250**. The legal entity is **Trevor Robey Intelligence Network Citations LLC**, a California limited liability company. The brand wordmark is **"Trevor Robey, INC."** where **INC = Intelligence Network Citations** (a backronym, not a corporate suffix).

**Tagline**: *Every claim, sourced. Every risk, named. In days, not weeks.*

**LLM provider stack** — stateful per-role routing via `config/role-provider-map.json`:
- **Claude Code CLI** for scout, analyst, synthesizer + default (flat Claude Max 20× subscription). Engine is 100% Claude — no local runtimes remain.
- **Ollama** — FULLY REMOVED 2026-07-23
- **LM Studio** — DECOMMISSIONED 2026-07-16

ToolUniverse subprocess provides ~2,116 biomedical tools. Seven project MCP servers under `openclaw-bridge/mcp/` cover ChEMBL, ClinicalTrials.gov, PubMed, HuggingFace Hub, NPI Registry, ICD-10, Owkin pathology.

**Pricing tiers**: Investor Pre-Mortem $9,950–$19,950 · Failed Trial Archaeology $14,950 · tactical SKUs $4,950 · Cross-Silo Connector Report $9,950–$24,950.

## Rules

- Each workspace's GOOSE_GUIDE.md is authoritative for its own domain.
- Port assignments are coordinated here; do not reassign without updating this file.
- The MCP bridge at :8798 is the canonical vault access point. Do not create alternative vault bridges.
- Session artifacts go to `.archive/` directories, not workspace roots.
- **Single-repo invariant**: this monorepo is the single source of truth and lives **only on this machine**. Do NOT re-create separate sub-repos.
- **Submodule discipline**: only `trevor-robey-inc-agents/vendor/tooluniverse` is a submodule.

## Security Orchestration

Security of this stack is handled by the global `security-orchestration` skill. Any security-related work here engages **CrowdStrike Falcon (MCP/API)** as one coordinated unit.

CrowdStrike/Falcon reference docs are mirrored offline at `~/Security Everything/crowdstrike-docs/`. Consult before hitting the network.

- **Read-only recon first**, then cross-correlate, then **strict propose-only**: every console-mutating Falcon action is surfaced for an explicitly typed, per-item authorization before apply. "Go" never authorizes a mutation.
- Never weaken Falcon Custom-IOA rule 1. Infra-security only — no PHI is hosted or processed.

## HTTPS-only invariant (non-negotiable, monorepo-wide)

Every network-facing TCP listener owned by code in this monorepo MUST be HTTPS. There are zero permitted plaintext-fallback paths.

**When a TLS cert or key fails to load:** REFACTOR THE CONFIG. Debug what's broken. The required behavior on cert failure is to **throw with a useful error and refuse to listen**.

**Forbidden shapes**:
- `http.createServer(` in any source file that binds a TCP host:port
- Any env-gated TLS-disable check
- `tlsDisable ? http : https` style ternaries

**Out of scope** (the only remaining plain HTTP carve-out): MCP browser-automation tools (the built-in Browser pane and Claude in Chrome) that talk to local browser instances over plaintext loopback.

**Wrapped in HTTPS by in-monorepo proxies:** Miyo (:8742→:8743), Qdrant (:6333→:6433), SearXNG (:8890→:8891). All use the same canonical pattern — a single `.mjs` file owned by a dedicated launchd unit, throwing on cert load failure with no plaintext fallback path.

## Browser Session History

> Every Goose session that uses a browser MCP non-trivially appends a structured summary block below. Newest entries at the top.
> Entry format: `- YYYY-MM-DD · <surface> · <task in a phrase> · <outcome / gotcha>`

*(Full browser session history preserved from CLAUDE.md — entries from 2026-07-02 through 2026-07-30 remain in the same format)*

## Feynman breakdown at the end of summaries

After completing any non-trivial piece of work — a change made, a bug fixed, a question researched, something built or configured — **end the response with a short "Feynman breakdown"**: teach back what was done and why as if to a curious non-expert, in everyday words.

Label the block **"Feynman breakdown:"** — keep it brief and human: *what* was done, *why* it matters, and any gotcha. A few sentences, not an essay.

**Skip it for trivial conversational turns** (a one-line answer, a yes/no, a quick lookup) where there is no real "task" to recap.

---
*This GOOSE_GUIDE.md was generated from the existing Claude CLAUDE.md to provide Goose with the same persistent project context and behavioral guidelines that Claude uses. Infrastructure rules (Falcon, YubiKey gates, sudo-gate, HTTPS-only invariant) remain unchanged as they are the operator's actual security posture, not AI-platform-specific.*
