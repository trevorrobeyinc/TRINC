# TrevClaw-Obsidianodus — opencode instructions

> **opencode mirror (created 2026-08-09).** This is the opencode counterpart to the `CLAUDE.md`
> next to it: same rules, worded for opencode. Claude surfaces read `CLAUDE.md`; opencode reads
> this file. opencode also auto-loads CLAUDE.md files it encounters — if both twins are in your
> context, treat them as ONE description of the same stack (do not double-count), and let this
> file's wording govern opencode behavior. When you change a rule, update both twins.

Single-repo monorepo for the **Trevor Robey, INC.** biomedical research intelligence stack. As of 2026-05-07 this is the canonical source of truth — three previously separate sub-trees (`Claude/`, `Copilot-Everything/`, `trevor-robey-inc-agents/`) plus the brand canon at `trevor-robey-inc/` are all first-class members of this repo.

Hosting: **local-only as of 2026-05-26.** The private GitHub remote `trevoralexanderrobey/TrevClaw-Obsidianodus` was **deleted** on 2026-05-26; the monorepo now lives only on this machine with **no git remotes**. Durable backup is a verified `git bundle --all` in **`~/Documents/`** (current: `TrevClaw-Obsidianodus-FULL-backup-20260811-1754.bundle`, HEAD `175571b`, SHA-256 `ca90a6e9…`, verified-matching copy at `/Volumes/ExtraCurricular/Backups/`). Cut a fresh bundle after any substantial batch of commits; a bundle carries no gitignored files, so local configs/tokens are NOT in it. Do not re-add a remote or push without an explicit decision to reverse this local-only posture.

## 📌 Shared Continuity Board — read this first

> **Before substantive work in this repo, read [`_continuity/CONTINUITY.md`](_continuity/CONTINUITY.md).**
> It is the ONE living board all surfaces share — the four Claude surfaces (**CLI Claude Code,
> Desktop Claude Code, Cowork, and Claude Chat (Desktop)**) **and opencode** — so every surface
> knows what's being worked on and what changed, and can adjust/add/cooperate. Read **Current
> focus** + the top few **Log** entries at session start; prepend a Log entry on meaningful
> progress or handoff, identified as surface **opencode**. Protocol, reachability, and
> external-volume write-safety: [`_continuity/README.md`](_continuity/README.md). (The repo skill
> `.claude/skills/continuity-board/` is the Claude-side auto-trigger; opencode follows this rule
> directly.)

## 🧠 Business memory — use `perseus-business`, not the global vault (2026-07-26)

> **Two Perseus vaults exist on this machine. Business facts go in the repo-scoped one.**
>
> | server | vault | scope |
> |---|---|---|
> | **`mcp__perseus-business__*`** | `~/.perseus-vault/data/business-vault.db` | **Trevor Robey, INC. only.** Declared in this repo's [`.mcp.json`](.mcp.json) (a Claude-surface registration). |
> | `mcp__perseus-vault__*` | `~/.perseus-vault/data/perseus-vault.db` | machine-global (YubiKey gates, Falcon, browser lanes, host tooling). Registered in `~/.claude.json`; NOT business memory. |
>
> Each has its **own AES key** (`business.key` vs `secret.key`) and its own embeddings. The five
> business entities were migrated out of the global vault on 2026-07-26 and archived there, so
> there is exactly one source of truth — **do not write business facts to `perseus-vault`**, or the
> two will silently diverge.
>
> The DB deliberately lives outside the repo: `/Volumes/ExtraCurricular` has documented write
> hangs, and the FTS5 index stores every memory in **plaintext**, which must never sit inside a git
> working tree. Repo-scoping comes from the registration, not the file location.
>
> **opencode note (2026-08-09):** neither Perseus server is registered in opencode's MCP config at
> present. If opencode ever gains a registration, the same split binds: business facts →
> `perseus-business` only, and every usage rule in the global opencode instructions
> (`~/.config/opencode/AGENTS.md`, §"Memory systems") applies.
>
> **This does not replace [`_continuity/CONTINUITY.md`](_continuity/CONTINUITY.md).** The board is
> the chronological narrative ("what are we working on right now"); the vault is a similarity-queried
> fact store with no ordering and active decay. Board = running story, vault = reference book.
> Nightly hygiene + embedding auto-repair for BOTH vaults runs from
> `~/.local/bin/perseus-vault-maintain.py` (launchd, 03:15).

## 🔌 Plugin bindings — read before using any plugin skill

> **The installed Claude plugins are templates.** Their skills refer to tools generically
> (`~~project tracker`, `~~CRM`, `~~literature`, `~~data warehouse`) — **203 such placeholders**
> across the installed set — and each deployment is expected to say which real tool fills each slot.
> **[`Trevor Robey Intelligence Network Citations/PLUGIN-BINDINGS.md`](Trevor%20Robey%20Intelligence%20Network%20Citations/PLUGIN-BINDINGS.md)**
> is that answer for this business; the machine-readable twin is
> [`config/plugin-bindings.json`](Trevor%20Robey%20Intelligence%20Network%20Citations/config/plugin-bindings.json).
>
> **The rule that matters: an unbound category means SAY SO — never invent one.** About twenty
> categories resolve to *nothing* here (no Jira, no Slack, no HubSpot, no Snowflake, no Figma, no
> CI), because this is a single-operator, pre-revenue, local-only business. A template-following
> skill handed a missing tool will manufacture a plausible substitute — a ticket key, a deal stage,
> a traffic number. For a business whose product is citation-traced due diligence, that is the exact
> failure mode it sells against, pointed inward. Hardest cases: `sales:forecast` /
> `sales:pipeline-review` (no CRM, pre-revenue — report that, do not model a pipeline),
> `marketing:performance-report` / `seo-audit` (no analytics, no SEO tool), and
> `product-management:metrics-review` (no product analytics).
>
> 13 plugins are bound; `desktop-commander` and `cowork-plugin-management` are installed and
> deliberately **not** bound. `bio-research`'s MCP servers are Claude-host **duplicates** of
> already-registered engine connectors — never double-register them or add them to
> `config/tool-prefetch-map.json`. Verify with `node scripts/audit-connector-coverage.js` from the
> business folder; the plugin section must show zero ⚠.

## 🔗 opencode ↔ Claude delegation bridge

> opencode is the **delegation target** in this setup: Claude can delegate cheap mechanical +
> biomedical research to opencode's **free** models at $0. **Every file of this setup — where it
> lives and why — is mapped in ONE place:
> [`_opencode-bridge/README.md`](_opencode-bridge/README.md).** The operational files live
> *outside* this repo on purpose (opencode's config discovery in `~/.config/opencode/`, the
> `~/Security Everything` artifact policy, machine-tooling-not-in-monorepo, no-secrets-in-git);
> that hub is the index, not a store. The only in-repo piece is the `opencode` server stanza in
> [.mcp.json](.mcp.json). Security model: a read-only + public-data + no-exfil **allowlist** for
> the free worker (full detail in `~/Security Everything/opencode-delegation-guard/README.md`) —
> that allowlist **binds opencode sessions**, delegated or not.

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
> `20ea572`). Older references to `trevor-robey-inc/` and
> `trevor-robey-inc-agents/` in *historical* sections (deletion log, predecessor
> repos, single-repo invariant) are retained as accurate descriptions of past
> state and intentionally not rewritten.

| Path | Role | Deep Dive |
|------|------|-----------|
| `Claude/` | Central hub: Medical Zettelkasten MCP, Command Center plugin, Trevor Robey Inc Research Memory MCP, Obsidian-bridge launcher, vault-zettelkasten plugin | `Claude/AGENTS.md` |
| `Copilot-Everything/` | Obsidian integration: plugin fork (vendored at `repos/obsidian-copilot-mcp/`), MCP bridge (:8798), Miyo TLS proxy (:8743) | `Copilot-Everything/AGENTS.md` |
| `Trevor Robey Intelligence Network Citations/` | **Single merged business folder.** Contains BOTH (a) the citation-traced biomedical due-diligence **engine** (powered by OpenClaw; six workflow templates → Investor Pre-Mortem $9,950–$19,950, Failed Trial Archaeology $14,950, tactical SKUs; role-routed LLM providers, ToolUniverse subprocess ~2,116 tools v1.1.10 at `vendor/tooluniverse`, seven project MCP servers, `node scripts/run-workflow.js`) AND (b) the **brand canon** (LLC formation paperwork, six-SKU offering ladder, `trevor-robey-inc Commercial Launch Playbook.md`, `OFFERINGS.md`, `REVENUE_PLAYBOOK.md`, `NOTICE.md`, dossier). Engine deep-dive: `Trevor Robey Intelligence Network Citations/AGENTS.md`; brand entry: `README.brand.md`. | `Trevor Robey Intelligence Network Citations/AGENTS.md` |

(Each deep-dive AGENTS.md has a Claude-side twin CLAUDE.md alongside it with identical substance.)

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

> **Five agent surfaces reach this repo's filesystem directly (2026-08-09).** The
> MCP wiring below describes the *plumbing*; separately, the four human-facing Claude surfaces —
> **CLI Claude Code, Desktop Claude Code, Cowork, and Claude Chat (Desktop app)** — plus
> **opencode** all read/write this repo on disk and coordinate through the shared board at
> `_continuity/CONTINUITY.md`.
> **Claude Chat (Desktop) is NOT limited to the `:8798` Obsidian bridge for local files:** it has a
> **Filesystem MCP connector with allowed roots `/Users/myhome` and `/Volumes/ExtraCurricular`**,
> so it reads/writes `/Users/myhome/TrevClaw-Obsidianodus` (and sees `My Digital Garden`
> as a sibling dir) directly. `:8798` is an *additional* semantic path (Obsidian/Zettelkasten over
> `My Digital Garden`), not Chat's only route to disk. Caveat: Chat-side writes to the external
> volume have hung before — a Filesystem-MCP restart clears it; treat Chat writes as
> available-but-probe-first (see `_continuity/README.md`). The same probe-first caution applies to
> any opencode writes on `/Volumes/ExtraCurricular`.

```
Claude Desktop (heavy-lift code/file operator)
  # Claude Code now runs via the native Claude Desktop Code tab (no custom subprocess orchestration).
  # The only MCP stdio servers Desktop needs are the obsidian-bridge adapter and the filesystem server.
  # (Retired 2026-05-31: INBOUND `claude mcp serve` + OUTBOUND claude-cli-bridge — see deletion log.)
  ├── [MCP stdio] → obsidian-bridge adapter → [HTTPS :8798] → Canonical MCP Bridge
  └── [MCP stdio] → filesystem server

opencode (delegated free-model worker + direct operator surface)
  # Reads/writes this repo with its own filesystem tools; no Obsidian-bridge wiring required.
  # Delegation lane from Claude: `opencode` server stanza in .mcp.json (see _opencode-bridge/README.md).
  └── bound by the read-only + public-data + no-exfil delegation-guard allowlist

Command Center plugin (workflow dispatch + monitoring, Obsidian plugin at obsidian-command-center/)
  ├── [child_process.spawn()] → Trevor Robey Intelligence Network Citations/scripts/run-workflow.js
  │                              ├── per-role LLM routing via config/role-provider-map.json (phase34; verified live 2026-07-16): scout, analyst, synthesizer + default ALL run on claude-code (Claude Opus 4.8 for the three roles, Sonnet for default). As of 2026-07-16 (Option B) the engine is 100% Claude — the OSS helper pre-passes + local fallbacks were REMOVED; LM Studio was decommissioned 2026-07-16 and Ollama was FULLY REMOVED 2026-07-23 (binaries, LaunchAgents, :11435 proxy, 9.2GB models) — there are no local model runtimes on this machine at all; the Obsidian side now runs on the hosted copilot-plus-flash model. --operator-approve is YubiKey-gated. Per-role identity/memory under config/agents/<role>/{SOUL.md,AGENTS.md,sessions/}
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
> - The biomedical research engine (`/Users/myhome/TrevClaw-Obsidianodus/Trevor Robey Intelligence Network Citations/`) runs as on-demand subprocess via `node scripts/run-workflow.js` — there is no persistent gateway service. The previous launchd entry on :18789 was for the unrelated homebrew `openclaw` (a consumer "Personal AI assistant" from openclaw.ai, different product entirely; removed 2026-04-27).

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
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:6433/collections/miyo   # Qdrant via TLS proxy
lsof -nP -iTCP:6333 -sTCP:LISTEN | grep -i qdrant   # plaintext Qdrant upstream (proxy backs onto this)
# Biomedical workflow runtime check (no persistent service — verify the subprocess path is wired):
cd "/Users/myhome/TrevClaw-Obsidianodus/Trevor Robey Intelligence Network Citations" && bash scripts/verify-phase29-policy.sh | tail -1
```

## Key Integration Points

- **Canonical vault access**: All operators connect through the MCP bridge at :8798. The bridge must be running first.
- **Post-workflow visualization**: None automatic. After workflow completion the Command Center plugin generates vault notes and runs Zettelkasten analysis; visualization is on-demand only (Obsidian's native Graph view, opened by the user). InfraNodus is fully out of the stack as of 2026-05-06 — no local clone, no webview handoff, no MCP server. The "Open Pipeline" ribbon icon opens only the pipeline status sidebar.
- **Medical Zettelkasten MCP**: Runs local algorithmic analysis (gaps, clusters, diversity, cross-domain connections) on synthesizer output and writes Zettelkasten-linked notes to vault.
- **Zettelkasten disambiguation**: Copilot-Everything has an LLM-driven ZettelkastenService that runs in-process inside the `vault-zettelkasten` Obsidian plugin (formerly hosted by the now-retired backend emulator on :8789). Claude Hub has the algorithmic Medical Zettelkasten MCP. They are complementary, not duplicates.
- **Obsidian vault**: `/Users/myhome/My Digital Garden` (ExtraCurricular volume must be mounted).
- **AWS account access (cloud; AI is read-only)**: The operator's AWS account `833390816446` — the business's Marketplace / AWS Data Exchange seller account — is reached via **IAM Identity Center SSO + a YubiKey FIDO2 key** (no long-lived keys on disk; root has MFA + no access keys). The **AWS API MCP Server** (Claude Desktop extension, available to every Claude session) authenticates as **`ReadOnlyAccess`** — it can read AWS state to assist but **cannot mutate**; consequential seller work uses the operator-only **`AdministratorAccess`** role with explicit per-action approval. This is a security invariant of the same character as the HTTPS-only rule below, and it binds opencode too: AI access to this account is read-only. Canonical doc: [`Trevor Robey Intelligence Network Citations/03-platforms/aws-data-exchange/account-access.md`](Trevor%20Robey%20Intelligence%20Network%20Citations/03-platforms/aws-data-exchange/account-access.md).

## Trevor Robey Inc Agents Product Stack (summary)

Authoritative narrative lives in `Trevor Robey Intelligence Network Citations/{NOTICE.md,TREVOR_ROBEY_INC_AGENTS_DOSSIER.md,REVENUE_PLAYBOOK.md,README.md}`. Quick reference here:

**Brand hierarchy.** Current legal status (updated 2026-07-22): California LLC formation **filed at bizfileOnline 2026-05-06** and **APPROVED 2026-06-18** — **CA SOS Entity No. B20260217250** (confirmed by certified SOS copy, Certificate No. 457169837, issued 2026-05-12). The legal entity is **Trevor Robey Intelligence Network Citations LLC**, a California limited liability company. The brand wordmark is **"Trevor Robey, INC."** where **INC = Intelligence Network Citations** (a backronym, not a corporate suffix). Customer-facing materials pair the wordmark with the disclosure: *"Trevor Robey, INC. is the wordmark of Trevor Robey Intelligence Network Citations LLC, a California limited liability company."* Commercial brand slug: `trevor-robey-inc` (unchanged — not a regulated entity name). Domain `trevorobeyinc.com` and email `trevor@trevorobeyinc.com` unchanged. Engine credit: "Powered by OpenClaw" — the open-source agent framework, not a brand owned by the operator. The retired homebrew `openclaw.ai` consumer "Personal AI assistant" is unrelated and remains disambiguated where it appears. **Compliance note**: Cal. Corp. Code §17701.08(e) bars "Inc." inside LLC names — that's why the legal name spells the words out. Cal. Bus. & Prof. Code §17910.5(a) restricts "Inc." in fictitious business names to incorporated entities — the wordmark+disclosure pattern handles this by making the entity status explicit. Filing record: [`Trevor Robey Intelligence Network Citations/00-business-formation/llc/certificate-of-formation.md`](Trevor%20Robey%20Intelligence%20Network%20Citations/00-business-formation/llc/certificate-of-formation.md).

**Tagline**: *Every claim, sourced. Every risk, named. In days, not weeks.*
**Elevator**: *Citation-traced biomedical due diligence for biotech investors and pharma BD. Five days. Zero hallucinations. Audit trail included.*

**LLM provider stack** — stateful per-role routing via `config/role-provider-map.json` (updated 2026-06-11; precedence `roles[role]` → template `provider_preference` → `default` = claude-code; each non-claude route falls back to claude-code). Persistent per-role identity + session memory under `config/agents/<role>/{SOUL.md,AGENTS.md,sessions/}` (those engine-role AGENTS.md files are the *engine's* role identities — distinct from this opencode instructions file):

| Provider | Role(s) | Status |
|---|---|---|
| Claude Code CLI (`claude-opus-4-8` for scout/analyst/synthesizer; `claude-sonnet-4-6` default) | **scout, analyst, synthesizer** + global default | Active; flat **Claude Max 20×** subscription (not per-token). **As of 2026-07-16 the engine is 100% Claude** — no OSS helpers/fallbacks. `--operator-approve` is YubiKey-gated (`operator-approve-gate arm`). |
| Ollama | — (removed) | **FULLY REMOVED 2026-07-23** — brew package, both LaunchAgents, the :11435 TLS proxy and 9.2GB of models all deleted. The Obsidian side (Copilot chat, vault-zettelkasten, wiki definitions) runs on hosted `copilot-plus-flash`. |
| LM Studio | — (removed) | **DECOMMISSIONED 2026-07-16** — proxy, launchd unit, and engine config all removed (Ollama followed 2026-07-23; no local runtimes remain) |
| Mock provider | CI / deterministic tests | Active |

ToolUniverse subprocess (Apache-2.0, Harvard MIMS / Zitnik Lab; `vendor/tooluniverse/`) provides ~2,116 biomedical tools. Seven project MCP servers under `openclaw-bridge/mcp/` cover ChEMBL, ClinicalTrials.gov, PubMed, HuggingFace Hub (metadata-only — no model weights downloaded), NPI Registry, ICD-10, Owkin pathology.

**Pricing tiers (2026-04-30)**: Investor Pre-Mortem $9,950 anchor / $14,950 standard / $19,950 custom (with KOL primary research) · Failed Trial Archaeology $14,950 · tactical SKUs $4,950 (Conference Synthesis Brief, Trial Design Benchmark Pack) · Cross-Silo Connector Report $9,950–$24,950 · Plain-Language Patient Brief $2,500. Pharmacovigilance Pack retained as tactical SKU (existing marketplace listings preserved). Full breakdown in `REVENUE_PLAYBOOK.md` §2.

**Mission-bundle deliverables (2026-06-12)**: every report bundle ships three additional deterministically-rendered deliverables (registered in `manifest.json` + sealed in `checksums.txt`): `deliverables/citation-integrity.md` (graded A/B/C/D, F+"BLOCKED" if any retraction, N/A if nothing cited provenance ledger), `deliverables/graveyard-memo.md` (NCT-traced memo of prior terminated/withdrawn/suspended programs in the indication, each with the sponsor's stated stop reason or an explicit "(none stated by sponsor)" — never invented, plus protocol churn, a resolvable clinicaltrials.gov/study/<NCT> link, and a LOW/MODERATE/HIGH amendment-risk band), and `deliverables/search-coverage.md` (the never-hallucinate "honest-zero" per-source ledger). The graveyard memo runs its own **census** (walks `nextPageToken` to the end) while the prompt path stays clamped at 50 and can never be handed a census — enforced by a size-aware cache key *and* a forced `census:false` at the local-fetcher seam. Engine deep-dive: `Trevor Robey Intelligence Network Citations/AGENTS.md`.

**Posture**: research artifacts only (not validated for clinical decision support); no PHI hosted or processed (sources are public biomedical databases); manual-only external actions (no autonomous publish/post/login/transact); citation traceability enforced as a quality gate (every row in every citation index carries a real PMID, NCT, ChEMBL CID, or DOI). As of 2026-06-12 the post-research engine adds a runtime citation-integrity layer: every cited identifier is **grounded in the source records actually retrieved at runtime**, and every cited DOI is **retraction-screened against Crossref**. Full disclaimers in `NOTICE.md`.

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
| Plugin runtime modes, Obsidian CLI, MCP bridge contract, Zettelkasten endpoints | `Copilot-Everything/AGENTS.md` |
| Web app cloning toolkit, workspace conventions | `Claude/AGENTS.md` |
| Research workflows, phase system, commercial operations, dataset pipelines | `Trevor Robey Intelligence Network Citations/AGENTS.md` |
| LLM provider config, code patterns, git conventions, token efficiency | `Trevor Robey Intelligence Network Citations/AGENTS.md` |
| Subprojects (Medical Zettelkasten MCP, Command Center) | `Claude/AGENTS.md` |

## Rules

- Each workspace's AGENTS.md is authoritative for its own domain (Claude-side twin: the CLAUDE.md alongside it — keep the two in sync).
- Port assignments are coordinated here; do not reassign without updating this file (and its CLAUDE.md twin).
- The MCP bridge at :8798 is the canonical vault access point. Do not create alternative vault bridges.
- Session artifacts go to `.archive/` directories, not workspace roots.
- **Single-repo invariant (2026-05-07; now local-only as of 2026-05-26)**: this monorepo is the single source of truth and now lives **only on this machine** — the private GitHub remote `trevoralexanderrobey/TrevClaw-Obsidianodus` was **deleted 2026-05-26** and there are **no git remotes**. Do NOT re-create separate sub-repos for `Claude/`, `Copilot-Everything/`, or `trevor-robey-inc-agents/` — they live here. Do NOT re-add a remote or push without an explicit decision to reverse the local-only posture; durable backup is the verified `git bundle --all` in `~/Documents/` (+ SHA-verified copy on `/Volumes/ExtraCurricular/Backups/`; see the Hosting note at the top of this file). The predecessor repo `trevor-robey-inc-agents` (separate, archived 2026-05-07) remains the documented historical rollback anchor (tag `pre-monorepo-consolidation-2026-05-07` at SHA `8e782a0`).
- **Submodule discipline**: only `trevor-robey-inc-agents/vendor/tooluniverse` is a submodule (third-party Apache-2.0). Do not introduce new submodules without an explicit upstream-tracking justification; vendor instead and document with an `UPSTREAM.md`.

## Security Orchestration

Security of this stack is handled by the shared `security-orchestration` skill (loaded into
opencode from `~/.claude/skills/security-orchestration/`) and the security reflex in the global
opencode instructions (`~/.config/opencode/AGENTS.md` — the opencode mirror of the global
`~/.claude/CLAUDE.md`). Any security-related work here engages **CrowdStrike Falcon (MCP/API)** as
one coordinated unit, with stack-specialized depth from
`~/.claude/skills/security-orchestration/references/trevclaw-stack-profile.md`.

CrowdStrike/Falcon reference docs are mirrored offline at `~/Security Everything/crowdstrike-docs/`
(README.md is the map). Consult before hitting the network.

- **Read-only recon first**, then cross-correlate, then **strict propose-only**:
  every console-mutating Falcon action is surfaced for an explicitly
  typed, per-item authorization before apply. "Go" never authorizes a mutation.
- The old "restrict loopback :8742/:6333/:8890 to the proxy UIDs" item is **CLOSED as unbuildable**
  (2026-07-10; do not re-propose pf/UID/Falcon-firewall vehicles for it — proxy, upstream, and threat
  all run as UID 501, pf skips `lo0`, and the firewall schema has no CommandLine field). The live
  compensating control is Falcon Custom-IOA group `117393db…` "Mac - Loopback Upstream Watch"
  (Monitor-only, on sensor since 2026-07-10; Detect-promotion pending its per-item token). Canonical
  record + P3 verdict: `~/Security Everything/pf/LOOPBACK-UPSTREAM-HARDENING-PROPOSAL.md`.
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

**Out of scope** (the only remaining plain HTTP carve-out): MCP browser-automation tools that talk to local browser instances over plaintext loopback. The two surviving browser surfaces **as of 2026-07-14** are Claude-surface tools (the **Claude Browser pane**, `cb` gate scope — isolated in-app Chromium clean room — and **Claude in Chrome**, `cic` gate scope — identity / logged-in work); **`computer-use` was removed from this carve-out on 2026-07-26** (disabled by the operator). No other plaintext loopback is acceptable. The LM Studio and Ollama plaintext upstreams (:1234, :11434) were pulled OUT of this carve-out on 2026-05-11 and both runtimes have since been removed entirely (2026-07-16 / 2026-07-23) — the ports stay in the lint's forbidden list so neither can return silently. If opencode ever gains a browser MCP, it inherits this carve-out only by explicit operator decision.

**Wrapped in HTTPS by in-monorepo proxies:** Miyo (2026-05-07), Qdrant (2026-05-08), SearXNG (2026-07-06) — third-party loopback services pulled OUT of the plaintext carve-out (defense-in-depth against DNS rebinding, browser-based localhost probing, malicious npm postinstall scripts). All wrapped with the same canonical pattern — a single `.mjs` file at the `Copilot-Everything/scripts/` level, owned by a dedicated launchd unit, throwing on cert load failure with no plaintext fallback path:

| Service | Plaintext upstream | HTTPS proxy | Proxy script | launchd unit |
|---|---|---|---|---|
| Miyo (`/Applications/Miyo.app` bundled Node server, code-signed) | `http://127.0.0.1:8742` | `https://127.0.0.1:8743` | [`Copilot-Everything/scripts/miyo-tls-proxy.mjs`](Copilot-Everything/scripts/miyo-tls-proxy.mjs) | `com.trevorrobey.miyo-tls-proxy` |
| Qdrant (Miyo-bundled child process, no TLS config exposed) | `http://127.0.0.1:6333` | `https://127.0.0.1:6433` | [`Copilot-Everything/scripts/qdrant-tls-proxy.mjs`](Copilot-Everything/scripts/qdrant-tls-proxy.mjs) | `com.trevorrobey.qdrant-tls-proxy` |
| SearXNG (`python -m searx.webapp` via werkzeug, no TLS config exposed) | `http://127.0.0.1:8890` | `https://127.0.0.1:8891` | [`Copilot-Everything/scripts/searxng-tls-proxy.mjs`](Copilot-Everything/scripts/searxng-tls-proxy.mjs) | `com.trevorrobey.searxng-tls-proxy` |

All monorepo consumers now point at the HTTPS proxies. The plaintext upstream ports keep listening (we can't make Miyo, Qdrant, or SearXNG stop), but the documented architecture no longer routes through them. The pf-per-UID idea for :8742/:6333/:8890 was **closed 2026-07-10 as unbuildable**; the live compensating control is the Monitor-only Falcon Custom-IOA "Mac - Loopback Upstream Watch" (group `117393db…`).

> **launchd ↔ external-volume gotcha (2026-06-03; superseded 2026-07-26).** This monorepo *used to live* on `/Volumes/ExtraCurricular` (external); it moved to `/Users/myhome/TrevClaw-Obsidianodus` on the internal FileVault disk on 2026-07-26, so the TCC wall no longer applies to this repo. The staging pattern is kept regardless, so launchd never depends on the repo's location: [`Copilot-Everything/scripts/install-tls-proxies.sh`](Copilot-Everything/scripts/install-tls-proxies.sh) stages the proxy scripts to `~/.local/share/trevclaw-tls-proxies/` (internal volume) and repoints each plist's `ProgramArguments` there. The repo copies under `Copilot-Everything/scripts/` remain source-of-truth — **re-run the installer after editing any `*-tls-proxy.mjs`** to re-sync the staged copy.

**Deletion log (2026-05-08 cleanup pass):** retired modules previously kept "as reference" were deleted from the monorepo. If you ever need to revive any of them, fetch from the rollback tag `pre-monorepo-consolidation-2026-05-07` on the archived predecessor repo and re-apply with the HTTPS-only invariant enforced (no `http.createServer`, no TLS-disable env vars). The full item-by-item log (backend emulator, raycast backend-emulator client, empty PM2 ecosystem, github-pro-mcp, stale logs/CI dirs/handoff files, qdrant-tls-proxy subproject, obsidian-devtools CDP path, chrome-devtools-mcp, claude-cli-bridge) is preserved in the CLAUDE.md twin of this file.

## Browser Session History

> Per the global opencode rule (`~/.config/opencode/AGENTS.md` §"Browser MCP strategy and context
> persistence"), every opencode session that uses a browser MCP non-trivially appends a structured
> summary block below — newest entries at the top, format
> `- YYYY-MM-DD · <surface> · <task in a phrase> · <outcome / gotcha>`. As of 2026-08-09 opencode
> has **no browser MCP registered**, so this section is empty; it exists so the first session that
> does lands correctly. The Claude surfaces' browser history lives in the CLAUDE.md twin.
