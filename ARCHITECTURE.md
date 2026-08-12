# TrevClaw-Obsidianodus — Architecture

**Rewritten and verified against live code and running processes: 2026-07-23.**

This document describes the stack **as it actually is**. Every claim below was checked against
source or a running process on that date. Retired components are listed in
[Retired](#retired--do-not-reintroduce) rather than silently deleted, so a stale memory of
"we had X" can be resolved quickly.

> **Brand note.** This describes the technical stack powering **Trevor Robey, INC.** — the brand
> wordmark of **Trevor Robey Intelligence Network Citations LLC**, a California limited liability
> company (CA SOS Entity No. B20260217250, approved 2026-06-18). "OpenClaw" appears as the
> open-source agent framework the stack uses; it is not a brand owned by the operator, and the
> retired homebrew `openclaw.ai` consumer assistant is unrelated.

> **Repo topology.** Single **local-only** monorepo at `/Users/myhome/TrevClaw-Obsidianodus`
> with **no git remotes** (the private GitHub remote was deleted 2026-05-26; durable backup is a
> verified `git bundle --all`). Only submodule: `Trevor Robey Intelligence Network Citations/vendor/tooluniverse`.
> Vendored fork (not a submodule): `Copilot-Everything/repos/obsidian-copilot-mcp/`.

Companions: [`CLAUDE.md`](CLAUDE.md) (rules, ports, invariants) ·
[`SYSTEM-REALITY.md`](Trevor%20Robey%20Intelligence%20Network%20Citations/SYSTEM-REALITY.md)
(what the business can honestly claim) · [`_continuity/CONTINUITY.md`](_continuity/CONTINUITY.md)
(what is in flight right now).

---

## 1. What this stack is

A **citation-traced biomedical due-diligence engine** plus the Obsidian workspace that drives it.

- The **engine** turns a research question into a sealed, citation-audited deliverable bundle.
- **Obsidian** is the operator's console: it dispatches workflows, receives results as linked
  notes, and provides semantic search and graph analysis over the vault.
- **Claude is the only reasoning model in the engine.** The only model on the Obsidian side is
  hosted `copilot-plus-flash`. **No local model runtime exists on this machine.**

---

## 2. Live component map

```
Obsidian (the console — owns two bridge lifecycles)
├── obsidian-bridge-launcher ──spawn──> canonical MCP bridge      HTTPS :8798
│      routes: /healthz · /metrics · /mcp/events · POST /mcp/tool
│      auth: bearer token + replay guard (X-MCP-Nonce, X-MCP-Timestamp, X-MCP-Body-Sha256)
├── command-center ──────────> Command Center bridge (additive)   HTTPS :8799
│      11 tools (7 vault + 4 workflow); 32-byte token in a 0600 file,
│      SHA-256 + timingSafeEqual; TLS mandatory, fail-closed
│      └──spawn──> node scripts/run-workflow.js        (the engine, on demand)
├── copilot (vendored MCP fork) ── MCP *client* ──> :8798 and :8799
│      chat model: hosted copilot-plus-flash; MCP supplies TOOLS, never the model
├── vault-zettelkasten ── in-process ZettelkastenService (graph analysis)
└── contextual-wiki-definitions ── wiki-link definition writer

Third-party loopback services, each wrapped by an in-monorepo HTTPS proxy
├── Miyo    :8743 ──> :8742     semantic search over the vault
├── Qdrant  :6433 ──> :6333     vector store (Miyo-bundled child)
└── SearXNG :8891 ──> :8890     private metasearch (citation gate + web search)
```

All of the above were confirmed listening on 2026-07-23. There is **no persistent engine
service** — the engine is an on-demand subprocess.

---

## 3. The research engine

Location: `Trevor Robey Intelligence Network Citations/` — a single flat-merged folder since
2026-05-19. The former sibling directories `trevor-robey-inc-agents/` and `trevor-robey-inc/`
**no longer exist on disk**.

### 3.1 Invocation

```bash
node scripts/run-workflow.js --template <template_id> --inputs '<json>' \
     [--operator-id <id>] [--operator-approve] --confirm
```

- `--confirm` is **mandatory** — the runner exits 1 without it (fail-closed).
- `--operator-approve` satisfies the Phase-15 autonomy gate (`role-router` requires
  `context.operatorApproved === true` for every research role). It is **YubiKey-gated**: honoured
  only against a fresh one-shot token minted by `operator-approve-gate arm` (pinentry PIN +
  physical touch), verified and consumed before anything spawns.
- The script **re-execs itself once** with `NODE_EXTRA_CA_CERTS` set to the mkcert root CA
  (sentinel `__OPENCLAW_CA_REEXEC` prevents a loop) so the HTTPS loopback proxies validate.
- Flow: `withSidecar()` (scrape-sidecar lifecycle) → `buildWorkflowRuntime()` →
  `loadWorkflowTemplate()` → `workflowEngine.executeWorkflow()` → `runtime.shutdown()` (tears down
  the ToolUniverse subprocess). Result JSON on stdout; exit 0 on `result.ok`, else 1.

### 3.2 Six templates, one pipeline

`config/workflow-templates/*.json` — schema `phase30-workflow-v1`. All six declare the **same
six-step pipeline**; only `mission_template_id`, `product_line` and the input schema differ:

| Template | Product |
|---|---|
| `drug-discovery-full` | Drug Discovery Full Pipeline |
| `pharmacovigilance-report` | Pharmacovigilance Safety Report |
| `clinical-trial-landscape` | Clinical Trial Landscape Intelligence |
| `target-validation-pack` | Target Validation Intelligence Pack |
| `rare-disease-brief` | Rare Disease Landscape Brief |
| `general-research-pack` | General Research Pack |

```
research (mission) → quality_check (quality_audit) → build_dataset (dataset)
                   → package (offer) → approve → export (zip)
```

Each step declares `depends_on`, so this is a dependency graph, not a fixed script.

### 3.3 Model routing — 100% Claude

`config/role-provider-map.json` (schema `phase34-role-provider-map-v1`) is authoritative:

| Role | Provider | Model | Fallback |
|---|---|---|---|
| `scout`, `analyst`, `synthesizer` | `claude-code` | `claude-opus-4-8` | `""` |
| `default` (every other role) | `claude-code` | `claude-sonnet-4-6` | `""` |

`config/agent-topology.json` declares twelve roles (orchestrator, supervisor, scout, analyst,
synthesizer, operator, literature_reviewer, safety_signal_detector, molecular_profiler,
competitive_intel_analyst, quality_auditor, report_generator); those without an explicit entry
resolve through `default`.

**Resolution is two-layer:** `role-provider-router.resolveRoute(role, ctx)` applies precedence
`roles[role]` → `ctx` → `default` → hard `claude-code`; `role-router.dispatch` then merges the
result into the enriched context passed to the role's handler.

**Every fallback is `""` deliberately** — a primary failure surfaces the real error instead of
silently chasing a backend that no longer exists.

**How Claude is invoked** (`openclaw-bridge/core/llm-adapter.js`): the `claude` CLI is spawned as
a child process —

```
claude -p --output-format json --model <id> --allowedTools ''
```

— with the prompt piped via **stdin** (never argv, to avoid arg-length limits) and tools disabled
to force a direct text response. Billing is the **flat Claude Max 20× subscription**, not
per-token API usage.

**Persistent agent identity/memory:** `scout`, `analyst` and `synthesizer` each own
`config/agents/<role>/{SOUL.md, AGENTS.md, sessions/}`. `agent-context-loader` injects SOUL
(≤6000 chars) + AGENTS (≤4000 chars) + a digest of the last six sessions; `agent-session-recorder`
writes the session back after each run.

### 3.4 Quality and citation integrity

This is what makes the product defensible. Hard gates live in
`openclaw-bridge/core/workflow-engine.js`, with logic in `citation-gate.js` / `section-gate.js`.

**Blocking codes** (`PHASE30_*`): `WORKFLOW_APPROVAL_REQUIRED` · `CITATION_RETRACTED` ·
`CITATION_UNRESOLVED` · `CITATION_INSUFFICIENT_EVIDENCE` · `CITATION_NONE` ·
`CITATION_UNVERIFIED` · `QUALITY_BELOW_THRESHOLD`.

- **Runtime grounding.** The agent engine records `fetched_citation_ids` as it works. The gate
  extracts every citation-shaped id from the assembled report and marks it grounded **only** if it
  appears in the union of ids actually fetched during that run.
- **`minGroundedCitationRatio = 0.75`**, read **fail-closed** from `config/agent-config.json` — a
  missing or malformed value falls back to the same strict 0.75, never anything looser.
- **Three-state verdict:** `PASS` / `UNVERIFIED` / `INSUFFICIENT_EVIDENCE` / `NO_CITATIONS`.
  Zero-evidence is **not** a silent pass — it is recorded as non-shippable.
- **Retraction screening** against **Crossref** and **PubMed**; any retracted cited work blocks.
  Both screens are fail-soft on network error (reporting `checked:false` rather than a false
  negative).
- **Scaffolding-leak fence.** The engine injects a "LIVE DATABASE CONTEXT" instruction; in live
  runs that instruction's own phrasing and internal workflow headings bled into section text and
  were being fed to the SearXNG coverage search as subject terms. A `STOPWORDS` group plus a
  `PROCESS_PHRASE` regex in `section-gate.js` strip that meta-prompt junk before querying.

There are **no `PHASE29_*` error codes** — Phase 29 (ToolUniverse MCP) is a label, and its
integrity check is warn-only.

### 3.5 Deliverables

`openclaw-bridge/monetization/deliverable-packager.js` → `writeDeliverables()`:

| Deliverable | Nature |
|---|---|
| `report.md`, `evidence-appendix.md`, `tables.csv`, `sample-preview.md` | LLM-assembled |
| `citation-integrity.md` | **Deterministic, no LLM** — grades A/B/C/D from the grounded ratio (0.9 / 0.75 / 0.5); **F + BLOCKED** on any retraction; N/A if nothing cited |
| `graveyard-memo.md` | **Deterministic, no LLM** — NCT-traced terminated/withdrawn/suspended programs, each with the sponsor's own stated stop reason or an explicit "(none stated)"; fail-soft, never blocks a passing report |
| `search-coverage.md` | **Deterministic, no LLM** — per-source ledger separating **honest zero-result** searches from **failed/unreachable** sources |
| `reproducibility-manifest.{json,md}` | **Deterministic** — from the live re-resolution pass |

Outputs land in `workspace/workflows/<workflowId>/` (run state, `citation-verification.json`, seed
input, interaction log) and `workspace/releases/offer-<offerId>/` (the shippable bundle:
`deliverables/`, `offer.json`, `metadata.json`, `release-approval.json`, `submission/`, plus
`manifest.json` and `checksums.txt` sealing every file with a SHA-256).

### 3.6 Data and tooling

**ToolUniverse** — a **Python subprocess**, not an import. The Node adapter spawns
`uv run --directory vendor/tooluniverse tooluniverse-smcp-stdio --compact-mode` and speaks
line-delimited JSON-RPC (MCP `2025-06-18`) over stdio, with health checks, up to 3 auto-restarts
and a 60 s spawn timeout. Vendored as the repo's only git submodule (mims-harvard/ToolUniverse,
SHA `3833b0e`, v1.1.10, Apache-2.0); ~2,116 tools across 500 data files.

**Project MCP adapters** (`openclaw-bridge/mcp/`): ChEMBL · ClinicalTrials.gov · PubMed · NPI ·
ICD-10 · HuggingFace (metadata-only, no weights downloaded) · Owkin (gated behind `OWKIN_API_KEY`,
throws if unset) · arXiv · Semantic Scholar · whitelisted-host scraper · ToolUniverse bridge ·
SearXNG citation gate · citation re-resolver.

**Direct fetchers** in the integrity layer: `ctgov-supplemental.js` (ClinicalTrials.gov API v2 plus
the `int` change-history endpoint, for stop-reason archaeology) · `crossref-retraction.js` ·
`pubmed-retraction.js`. All dependency-injectable for deterministic tests.

**SearXNG's role in the gate:** the engine consumes the connector's already-cited output
(`results[].citations[]`, `source: url|metadata|text`), grades each result A–D, dedupes by
canonical URL/host, computes a coverage tier and issues a gate decision with one breadth
reformulation retry. It is fail-closed **only at zero results**, and is pure — no wall-clock or
RNG, per the engine's restricted-globals rule.

---

## 4. Obsidian side

> **Plugin display names vs IDs (2026-07-23).** The Obsidian plugins are display-branded as the
> **TR-Obsidian Intelligence Network Citations** suite (Command Center · Zettelkasten · Bridge
> Launcher · Wiki Definitions) so they group together in Obsidian's plugin list. Their **plugin IDs
> are FROZEN** (`command-center`, `vault-zettelkasten`, `obsidian-bridge-launcher`,
> `contextual-wiki-definitions`) and must never be renamed: Copilot's 4 `mcp_command-center_*` MCP
> tool ids and `mcp.servers[].id`, the wiki-definition plugin's `plugins['vault-zettelkasten']`
> api lookup (a **separate git repo**), Command Center's own lookup in `zettelkasten/linker.ts`,
> the 0600 token at `~/.config/openclaw-command-center/bridge-token`, and the on-disk directory
> names under `.obsidian/plugins/` all key on the IDs, not the names.

| Plugin | Role |
|---|---|
| `obsidian-bridge-launcher` | Spawns the canonical `:8798` bridge as a child tied to Obsidian's lifecycle. Owns the fd-3 JSON-RPC IPC channel used for renderer console capture and **gated** eval (`devConsoleEvalEnabled`, default **off**). |
| `command-center` | Dispatches workflows, generates vault notes, owns the additive `:8799` bridge. |
| `copilot` (vendored MCP fork) | Chat + agent mode. Its MCP is a **client, for tools only** — tools become LangChain `StructuredTool`s bound onto the selected chat model via `bindTools()`. It can never *be* the model. |
| `vault-zettelkasten` | In-process graph analysis (semantic linker, cross-domain, serendipity, echo chamber, orphan rescue). Consumes Miyo `:8743` and Qdrant `:6433`. |
| `contextual-wiki-definitions` | Writes a definition note when a wiki link is followed — including from the Local Graph. Source lives **outside this repo** at `/Users/myhome/Code/obsidian-auto-wiki-summarize` (own git repo, symlinked into the vault, no build step — `main.js` *is* the source). |

All Obsidian-side model calls go to hosted **`copilot-plus-flash`**. The wiki-definition plugin
passes its model **per call** to `vault-zettelkasten` (`resolveModel()` honours `request.model`),
so the licence key lives in exactly one 0600 file and is never duplicated into a second config.

---

## 5. Security invariants

- **HTTPS-only.** Every network-facing TCP listener owned by monorepo code must be HTTPS. No
  plaintext-fallback paths, no TLS-disable env vars, no `tls ? https : http` ternaries. On cert
  failure the required behaviour is to **throw and refuse to listen**. Enforced by
  `scripts/lint-transport-monorepo.sh --strict` (currently **exit 0**).
- `:11434` and `:1234` stay in the lint's **forbidden** port list even though both runtimes are
  gone, so neither can return silently.
- **Bridge auth.** `:8798` uses a bearer token plus replay protection (nonce + timestamp + body
  SHA-256); `:8799` auto-generates a 32-byte token into a 0600 file outside the vault and compares
  with SHA-256 + `timingSafeEqual`.
- **YubiKey gates.** `--operator-approve` and the agentic surfaces are armed by a physical touch
  ceremony; the touch *is* the consent mechanism and must never be removed.
- **Secrets never live in plugin `data.json`.** Obsidian persists those files and auto-creates
  backups, which has leaked a credential in this stack before. Keys live in the OS keychain or a
  0600 file (`~/.config/trevclaw/brevilabs-key`, `~/.config/openclaw-command-center/bridge-token`).
- **Posture.** Research artifacts only, not validated for clinical decision support. **No PHI** —
  sources are public biomedical databases. No autonomous publish/post/login/transact.

---

## 6. Verification

```bash
# Transport invariant (must exit 0)
bash scripts/lint-transport-monorepo.sh --strict

# Engine unit suite — 939 tests passing as of 2026-07-23
cd "Trevor Robey Intelligence Network Citations" && npm test

# Engine policy gate
cd "Trevor Robey Intelligence Network Citations" && bash scripts/verify-phase29-policy.sh | tail -1

# Live services
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:8798/healthz
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:8743/v0/health
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:6433/collections/miyo
```

---

## Retired — do not reintroduce

| Thing | Status |
|---|---|
| **Ollama** (`:11434`, proxy `:11435`) | **Removed 2026-07-23** — brew package, both LaunchAgents, TLS proxy and 9.2 GB of models deleted. |
| **LM Studio** (`:1234`, proxy `:1235`) | Decommissioned 2026-07-16. |
| **Traefik** `:11480`/`:11481` failover | Dead — never in the live path. |
| **Prometheus `:9090` / Grafana `:3001` / docker-compose** | Dead. No scrape target ever existed: the engine has no persistent gateway. |
| **PM2 / `ecosystem.config.js`** | Dead — zero apps since the bridge moved to the launcher plugin. |
| **TrevNodus / InfraNodus** | Fully removed 2026-05-06. Graph viz is Obsidian's native view, on demand. |
| **Backend emulator `:8789`** | Retired 2026-04-11 — `ZettelkastenService` runs in-process in the plugin. |
| **`trevor-robey-inc-agents/` + `trevor-robey-inc/`** | Flat-merged 2026-05-19 into `Trevor Robey Intelligence Network Citations/`. These directories do not exist. |
| **Persistent OpenClaw gateway `:18789`** | Removed 2026-04-27 (unrelated homebrew consumer product). |
| **`claude-cli-bridge` / `claude mcp serve`** | Retired 2026-05-31, archived at `Claude/.archive/claude-cli-bridge/`. Do **not** reintroduce a custom `claude -p` subprocess bridge *for delegation*. (Distinct from the engine's own `claude -p` provider call in §3.3, which is the supported path.) |
| **chrome-devtools-mcp / sentinel-cdp-mcp / Playwright MCP** | See root `CLAUDE.md` "Browser MCP Strategy" for the current surface model. |
