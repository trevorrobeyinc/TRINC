# TRINC — Architecture

**Verified against live code, configuration and listening processes: 2026-10-23.**
(Previous full verification: 2026-07-23. Renamed from `TrevClaw-Obsidianodus` the same day; the folder is
now `/Users/myhome/TRINC`.)

This is the **technical record of the stack as it is**. Every claim below was checked against source, a
config file, or a running process on that date; anything that could not be checked says so. Things that
were removed are listed under [Retired](#retired--do-not-reintroduce) instead of disappearing, so a
stale memory of "we had X" can be settled quickly. For the plain-language story of how the business
works, read [`HOW-IT-WORKS.md`](HOW-IT-WORKS.md); for what may be claimed to customers,
[`SYSTEM-REALITY.md`](Trevor%20Robey%20Intelligence%20Network%20Citations/SYSTEM-REALITY.md); for what is in
flight, [`_continuity/CONTINUITY.md`](_continuity/CONTINUITY.md).

> **Brand note.** This is the stack behind **Trevor Robey, INC.**, the wordmark of **Trevor Robey
> Intelligence Network Citations LLC**, a California limited liability company (CA SOS Entity No.
> B20260217250, approved 2026-06-18). "OpenClaw" is the open-source agent framework the engine is built
> on; it is not a brand the operator owns, and the homebrew `openclaw.ai` consumer assistant is unrelated.

> **Repository.** One monorepo at `/Users/myhome/TRINC`, pushed to the **private** GitHub repo
> `trevorrobeyinc/TRINC` over `ssh.github.com:443`. Pushes are operator-run in a real terminal: the only
> key is a PIN-protected YubiKey FIDO2 credential, which an agent shell cannot unlock. Offline backup is a
> verified `git bundle --all` in `~/Documents/`. One submodule:
> `Trevor Robey Intelligence Network Citations/vendor/tooluniverse` (mims-harvard/ToolUniverse, `f2006162`,
> v1.5.7, Apache-2.0; its venv is built from `security/tooluniverse-venv.lock.txt`). One vendored fork: `Copilot-Everything/repos/obsidian-copilot-mcp-v4/` (upstream
> obsidian-copilot 4.0.0 plus an MCP client module; manifest pinned to `99.4.0` so Obsidian never
> auto-updates over it).

---

## 1. What this stack is

- **The engine** (`Trevor Robey Intelligence Network Citations/`) turns one research question into a
  sealed, citation-audited deliverable bundle. It has **two lanes that share one citation gate**:
  biomedical (seven templates) and business (three templates, built and unit-tested, never run live).
- **Obsidian** is the operator's console. Its plugins dispatch runs, receive the results as vault notes,
  render visuals, and provide semantic search and graph analysis over the vault.
- **Claude reaches Obsidian through one door**, the stdio adapter's `openclaw` profile (server
  `openclaw-obsidian`). Copilot and Raycast keep their own doors.
- **Models.** The engine is **100% Claude**. Obsidian's Copilot chat defaults to hosted
  `copilot-plus-flash`; its agent mode runs on an opencode backend. Ollama is running behind its HTTPS
  proxy but **has no model installed** (see §7).

---

## 2. Live component map

Ports and owners as read with `lsof` on 2026-10-23, with Obsidian open.

```
Obsidian — owns four HTTPS bridges; all of them die when Obsidian quits
├── obsidian-bridge-launcher ─spawns─> canonical vault bridge        :8798  (node child process)
│       Local REST API plugin underneath                              :27124 (the vault engine)
│       routes /healthz /metrics /mcp/events POST /mcp/tool; bearer token + replay guard
├── command-center ──────────────────> Command Center bridge         :8799  32 tools
│       7 vault + 16 obsidian_openclaw_* + 7 zk_* + 2 video_pipeline_*; 0600 token file
│       └─spawns─> node scripts/run-workflow.js   (the engine, on demand)
├── trinc-viz-studio ────────────────> Viz Studio bridge             :8800  12 viz_* tools
│       every render is written under Visualizations/
├── trinc-security-bridge ───────────> Security Bridge               :8801  (owned by ~/Security Everything)
├── copilot (vendored fork)
│       chat: hosted copilot-plus-flash; MCP client for TOOLS only -> :8798, :8799, :8800
│       agent mode: opencode backend (ACP); `opencode serve` on :4096 is password-locked;
│       openclaw-stdio-proxy.mjs carries the agent's tool calls to :8799 and :8800
├── vault-zettelkasten ── in-process ZettelkastenService (LLM linking, scheduled vault scans)
└── personal plugins (sources outside this repo, in ~/Code): origin-nest,
    contextual-wiki-definitions, claude-console-mirror

Claude's one door (Claude Code, repo .mcp.json "openclaw-obsidian")
└── stdio adapter, profile openclaw ──> :8799 and :8800   (never loads the :8798 token)
Raycast chat's door
└── stdio adapter, profile raycast  ──> :8798 vault tools + :8799 video tools

Third-party loopback services, each wrapped by an in-repo HTTPS proxy (launchd)
├── Miyo     :8743 -> :8742    semantic search over the vault
├── Qdrant   :6433 -> :6333    vector store (Miyo's child process)
├── SearXNG  :8891 -> :8890    private metasearch
└── Ollama   :11435 -> :11434  running, no model installed
```

There is **no persistent engine service**: the engine is a subprocess started per run.

---

## 3. The research engine

### 3.1 Invocation

```bash
node scripts/run-workflow.js --template <template_id> --inputs '<json>' [--operator-approve] --confirm
```

- `--confirm` is mandatory; the runner exits 1 without it.
- Any non-mock run needs `--operator-approve`, honoured only against a fresh one-shot token minted by
  `operator-approve-gate arm` (YubiKey PIN plus a physical touch, 300 s, consumed before anything spawns).
  A `--provider mock` run is ungated because it cannot spend model capacity.
- The script re-execs itself once with `NODE_EXTRA_CA_CERTS` set to the mkcert root CA so the HTTPS
  loopback proxies validate.
- From Claude Code, start runs through the door instead (`obsidian_openclaw_run_workflow`): a
  plugin-dispatched run also gets the post-run chain (§3.7). `status.post_run_done` is the only reliable
  "everything finished" signal; the engine reports `completed` before that chain runs.

### 3.2 Ten templates, one pipeline

`config/workflow-templates/*.json`. All ten declare the same pipeline:

```
research (mission) → quality_check (quality_audit) → build_dataset (dataset)
                   → package (offer) → approve → export
```

| Template | Lane |
|---|---|
| `drug-discovery-full`, `pharmacovigilance-report`, `clinical-trial-landscape`, `target-validation-pack`, `rare-disease-brief`, `general-research-pack`, `trial-design-benchmark` | biomedical |
| `business-research-pack`, `cost-reduction-analysis`, `market-landscape` | business (`research_profile: business`) |

### 3.3 Model routing — 100% Claude

`config/role-provider-map.json` (`phase34-role-provider-map-v1`) is authoritative:

| Role | Provider | Model | Fallback |
|---|---|---|---|
| `scout`, `analyst`, `synthesizer` | `claude-code` | `claude-opus-4-8` | `""` |
| `default` (every other role) | `claude-code` | `claude-sonnet-4-6` | `""` |

Every fallback is empty on purpose: a failure surfaces the real error instead of chasing a backend that no
longer exists. Billing is the flat Claude Max subscription, not per-token API use.

**How Claude is called** (`openclaw-bridge/core/llm-adapter.js`): the `claude` CLI as a child process,
prompt on stdin, tools off, and **isolated from the operator's own setup** —
`claude -p --output-format json --model <id> --allowedTools "" --strict-mcp-config --mcp-config
config/claude-code-print-mcp.json --setting-sources "" --no-session-persistence` with
`CLAUDE_CODE_DISABLE_CLAUDE_MDS=1` in the environment. Without that isolation every role call booted every
MCP server and loaded the operator's instruction files (found and fixed 2026-09-22). Re-probe it after any
Claude CLI upgrade; the probe is in the engine's `CLAUDE.md`.

**Agent identity.** `scout`, `analyst` and `synthesizer` each own `config/agents/<role>/{SOUL.md,
AGENTS.md, sessions/}`; the business lane adds `SOUL.business.md`. These `AGENTS.md` files are role
identities read by the engine, not opencode instructions.

### 3.4 Citation integrity — the product's core

Hard gates in `openclaw-bridge/core/workflow-engine.js`; logic in `citation-gate.js` and `section-gate.js`.

- **Runtime grounding.** Every identifier cited in the report must appear among the identifiers actually
  retrieved during that run. `minGroundedCitationRatio` is **0.75**, read fail-closed from
  `config/agent-config.json`.
- **Verdicts:** `PASS` ships; `UNVERIFIED`, `INSUFFICIENT_EVIDENCE` (nothing retrieved) and `NO_CITATIONS`
  block.
- **Retraction screen:** cited DOIs against Crossref, cited PMIDs against PubMed, and every DOI
  reverse-resolved to a PMID and cross-checked. Any retracted work blocks (`PHASE30_CITATION_RETRACTED`).
- **Re-resolution at delivery:** every PMID, NCT and DOI is re-resolved against its issuing registry
  (`openclaw-bridge/mcp/citation-reresolver/`). Each is stamped VERIFIED / UNRESOLVED / UNCHECKED in the
  reproducibility manifest; any UNRESOLVED id blocks. This proves an identifier resolves to a real record,
  not that the source's conclusions are right.
- **Business lane ids:** `WEB:` (a stored snapshot of the exact page text read; re-resolution re-hashes the
  snapshot), `SEC:`, `WB:`, `BLS:`, `EUROSTAT:` (and `CENSUS:` / `EIA:`, dormant until free keys exist),
  plus OpenAlex DOIs. The gate judges model-written text only; the deterministic Evidence Brief that
  replaces the business scout is not graded.

Blocking codes are all `PHASE30_*`. There are no `PHASE29_*` codes; Phase 29 is a label.

### 3.5 Deliverables

`openclaw-bridge/monetization/deliverable-packager.js` writes the bundle into
`workspace/releases/offer-<offerId>/`, sealed by `manifest.json` and `checksums.txt` (SHA-256 per file).

| Deliverable | How it is made |
|---|---|
| `report.md`, `evidence-appendix.md`, `tables.csv`, `sample-preview.md` | Claude-written, then gated |
| `citation-integrity.md` | deterministic — grade A/B/C/D from the grounded ratio, F + BLOCKED on any retraction |
| `graveyard-memo.md` | deterministic — terminated/withdrawn/suspended programs in the indication, NCT-traced, with the sponsor's own stop reason or "(none stated)". Its amendment-risk band reads "Not available" while ClinicalTrials.gov's history endpoint refuses the fetcher (HTTP 403 since 2026-10-08) |
| `search-coverage.md` | deterministic — every search and what it returned, honest zero results kept apart from failed sources |
| `reproducibility-manifest.{json,md}` | deterministic — from the re-resolution pass |
| `design-benchmark.{md,csv}` | deterministic — the trial-design-benchmark comparison matrix |

Run state (citation verification, seed input, interaction log) stays in `workspace/workflows/<workflowId>/`.

### 3.6 Data sources and tooling

- **ToolUniverse:** a Python subprocess (`uv run --no-sync --directory vendor/tooluniverse tooluniverse-smcp-stdio
  --compact-mode`), JSON-RPC over stdio, 2,719 tools (v1.5.7).
- **Adapters** in `openclaw-bridge/mcp/`: ChEMBL, ClinicalTrials.gov, PubMed, Europe PMC preprints, NIH
  RePORTER, NPI, ICD-10, HuggingFace (metadata only), Owkin (needs `OWKIN_API_KEY`), arXiv, Semantic
  Scholar, Open Targets (GraphQL), SEC EDGAR, SearXNG, the business sources (`business-sources/`: web
  evidence, OpenAlex, SEC filings, World Bank, BLS, Eurostat, Census, EIA), the citation re-resolver, the
  Crossref and PubMed retraction screens, and `ctgov-supplemental` (stop reasons and change history).
- **Context-only lanes:** vault read-back (`obsidian-bridge-mcp`, Miyo over `:8743`) and research-memory
  priors (`research-memory-mcp`) are rendered with identifiers withheld and never count as citations.
- **The registry:** `config/connector-registry.json` is the source of truth for every connector; run
  `npm run audit:connectors` after any change.

### 3.7 After a run: the engine writes the vault itself

On a completed, citation-PASS, non-mock run, `run-workflow.js` writes the notes into
`My Digital Garden/OpenClaw/<template>/<date> <inputs>/` through `openclaw-bridge/vault/workflow-vault-publisher.js`
(path-guarded, headless, `config/vault-publish.json` `enabled: true`), adds a deterministic
`Graph Analysis.md` (Medical Zettelkasten in-process), and ingests the run into research memory
(`researchMemory.enabled: true`, offline embedder). The Command Center plugin then **rehydrates** from
`artifacts.vault_notes` and adds only its enrichment: the chat bubble, Miyo indexing and Zettelkasten
linking. No visuals are produced automatically.

---

## 4. Obsidian side

**Plugin IDs are frozen**: `command-center`, `vault-zettelkasten`, `obsidian-bridge-launcher`,
`trinc-viz-studio`, `contextual-wiki-definitions`. Copilot's MCP tool ids, server ids, the 0600 token paths
and the folders under `.obsidian/plugins/` all key on them. Display names are free to change.

| Plugin | Source | Role |
|---|---|---|
| `obsidian-bridge-launcher` | `Claude/obsidian-bridge-launcher` | spawns the `:8798` bridge; owns the fd-3 IPC used for console capture and the gated eval tool (off by default) |
| `command-center` | `Claude/obsidian-command-center` | dispatches runs, owns `:8799`, runs the post-run enrichment |
| `trinc-viz-studio` | `Claude/obsidian-viz-studio` | owns `:8800`; diagrams, charts, canvases, explainer cards, stat tiles, mockups, interactive HTML |
| `vault-zettelkasten` | `Claude/obsidian-vault-zettelkasten` | in-process Zettelkasten analyses on hosted `copilot-plus-flash` |
| `copilot` | `Copilot-Everything/repos/obsidian-copilot-mcp-v4` | chat + agent mode; MCP client for tools only |
| `trinc-security-bridge` | `~/Security Everything/obsidian-security-bridge` | owns `:8801`; security control plane, no vault access |
| `origin-nest`, `contextual-wiki-definitions`, `claude-console-mirror` | `~/Code/<name>` (personal) | vault tooling, deployed copies |

Production deploys go through `ops/tr-suite/deploy.sh` only (registry `ops/tr-suite/manifest.json`);
`ops/tr-suite/verify.sh` checks for drift. Every new `main.js` in a protected plugin raises a critical
`obsidianwatch` finding until the operator blesses it.

**Claude's door in detail** (`Copilot-Everything/bridges/obsidian-stdio-adapter/`, profile `openclaw`,
v0.4.0, 27 tools): run dispatch, status, results, history, artifacts, cancel, citation integrity, delivery
evidence, memory search, engine health and a restricted vault publish on `:8799`; read-only
`obsidian_search_notes` / `obsidian_read_note`; the 12 `viz_*` renders on `:8800`, with `folder`,
`targetNote`, `targetCanvas`, `useActiveTab`, `useActiveNote` and `overwrite` stripped and refused so
renders land only in `Visualizations/`. No create, append or command execution. Regression guard:
`npm run test:profiles` (52 checks).

---

## 5. Security invariants

- **HTTPS-only.** Every TCP listener owned by repo code is HTTPS and refuses to start on a certificate
  failure; no plaintext fallback of any kind. `bash scripts/lint-transport-monorepo.sh --strict` enforces
  it. Plaintext `:11434` and `:1234` stay in the lint's forbidden list.
- **Bridge auth.** `:8798` uses a bearer token plus replay protection (nonce, timestamp, body SHA-256);
  `:8799` and `:8800` use 32-byte tokens in 0600 files outside the vault.
- **Browser guard (2026-10-24).** Before any route and before auth, all four bridges refuse what a web page
  could send: `:8798`, `:8799` and `:8800` answer 421 to a Host other than `127.0.0.1`/`localhost`/`[::1]`
  on the arrival port, and 403 to any `Origin`, any `Referer`, or a `Sec-Fetch-Site` other than `none`
  (`:8801` has its own, stricter version). They send no CORS headers. The helper is three byte-identical
  copies (`browserGuard.ts` / `browser-guard.ts`), compared by `ops/tr-suite/verify.sh`. It deliberately
  ignores `Sec-Fetch-Mode`/`-Dest`: Node's `fetch` sends `sec-fetch-mode: cors`, and Obsidian's `requestUrl`
  (Copilot's transport) may send `Sec-Fetch-Site: none`.
- **YubiKey gates.** Real engine runs, privileged commands, the browser pane and the gated MCP servers all
  need a physical touch; the touch is the consent and must never be removed. The session-gate hook bars
  sub-agents from Claude's door entirely, and bars run/cancel/publish during Ralph loops.
- **Secrets never live in plugin `data.json`.** Keys live in the Keychain or 0600 files.
- **Posture.** Research artifacts only, not validated for clinical decision support. No PHI. No autonomous
  publish, post, login or purchase.

---

## 6. Verification

```bash
bash /Users/myhome/TRINC/scripts/lint-transport-monorepo.sh --strict          # exit 0
bash /Users/myhome/TRINC/ops/tr-suite/verify.sh                               # 0 FAIL
cd "/Users/myhome/TRINC/Trevor Robey Intelligence Network Citations" && npm test   # 1331/1331 on 2026-10-23
cd "/Users/myhome/TRINC/Trevor Robey Intelligence Network Citations" && node scripts/audit-connector-coverage.js
cd /Users/myhome/TRINC/Copilot-Everything/bridges/obsidian-stdio-adapter && npm run test:profiles   # 52 PASS with Obsidian open
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:8798/healthz
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:8800/healthz
```

---

## 7. Found during the 2026-10-23 verification

- **Ollama has no model.** Ollama.app serves `:11434` behind the `:11435` proxy, but `ollama list` is
  empty and the model store holds no blobs. Older docs describe a `granite4.1:8b` BYOK lane for Copilot;
  it is not installed now. Either reinstall a model or retire the proxy: the operator's call.
- **The amendment-risk band is unavailable** while ClinicalTrials.gov's history endpoint answers HTTP 403
  (since 2026-10-08). The memo says so; sales copy that advertises the band needs checking.
- **The business lane has never run live.** It is built and unit-tested; the first run needs the
  operator's go and a freshly armed token.

---

## Retired — do not reintroduce

| Thing | Status |
|---|---|
| **Claude → opencode delegation worker** (`opencode-mcp`, `_opencode-bridge/`, the repo `AGENTS.md` mirrors) | Retired 2026-10-23. `~/.config/opencode/` stays: it is the Copilot agent's opencode configuration. |
| **Stdio adapter `claude` profile** and `Copilot-Everything/.mcp.json` `obsidian-bridge` | Retired 2026-10-23 (unused; was an ungated write lane). |
| **Engine `viz-bridge-mcp` adapter** | Retired 2026-10-23, never called. Registry tombstone `viz-bridge`. |
| **`:8798` `research_publish`**, `scripts/publish-to-vault.js`, `scripts/atlas-stub-creator.js` | Tombstoned 2026-09-22, removed 2026-10-23. The engine writes run notes itself. |
| **Raycast extension** and three personal plugins inside the repo | Moved to `~/Code` 2026-10-23; the installed builds still work. |
| **Copilot fork 3.3.3** (`repos/obsidian-copilot-mcp`) | Retired 2026-10-21; the live fork is the 4.0.0 port. |
| **term-bridge** (`mcp__term-bridge__*`, `tb-gate`) | Retired 2026-07-28. |
| **LM Studio** (`:1234`, proxy `:1235`) | Decommissioned 2026-07-16. |
| **scholar-sidekick, courtlistener, Tavily, Zoho** connectors | Removed 2026-08-27, 2026-09-15, 2026-07-04 (superseded by `searxng-search`), 2026-10-21 respectively. |
| **Traefik `:11480/:11481`, Prometheus `:9090`, Grafana `:3001`, PM2** | Dead; no scrape target or app ever existed. |
| **InfraNodus / TrevNodus** | Removed 2026-05-06. |
| **Backend emulator `:8789`** | Retired 2026-04-11; Zettelkasten runs in-process. |
| **`claude-cli-bridge` / `claude mcp serve`** | Retired 2026-05-31. The engine's own `claude -p` call (§3.3) is the supported path. |
| **chrome-devtools-mcp, sentinel-cdp-mcp** | Removed. The only browser surface is the Claude Browser pane. |
| **`trevor-robey-inc-agents/`, `trevor-robey-inc/`** | Flat-merged 2026-05-19 into `Trevor Robey Intelligence Network Citations/`. |
| **Persistent gateway `:18789`** | Removed 2026-04-27 (an unrelated homebrew product). |
