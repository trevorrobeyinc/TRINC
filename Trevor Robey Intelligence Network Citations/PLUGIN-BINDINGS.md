# Plugin Bindings — Trevor Robey, INC.

> **What this is.** The installed Claude plugins ship as *templates*. Their skills refer to tools
> generically — `~~project tracker`, `~~CRM`, `~~literature`, `~~data warehouse` — and expect
> someone to say which real tool fills each slot. **203 such placeholders** exist across the
> installed set. This file is that answer, for this business.
>
> **Why it lives in the repo.** The eleven business-domain plugins are materialized per-session
> under `~/Library/Application Support/Claude/local-agent-mode-sessions/<uuid>/<uuid>/rpm/plugin_*/`
> — session-scoped, cloud-synced, outside git. Editing those packages is neither durable nor
> reviewable, and the sanctioned `cowork-plugin-customizer` skill only runs in Cowork (it needs
> `mnt/.local-plugins`, absent in CLI Claude Code). So the bindings live here, where the repo
> `CLAUDE.md` pointer loads them into all four Claude surfaces.
>
> - **Machine-readable twin:** [`config/plugin-bindings.json`](config/plugin-bindings.json)
> - **Connector authority:** [`config/connector-registry.json`](config/connector-registry.json) —
>   lanes, prefetch binding, and the Phase-30 citation gate stay defined there. This file points at
>   it and never restates it.
> - **Audit:** `node scripts/audit-connector-coverage.js`

---

## The rule that matters most

**An unbound category means say so — never invent one.**

Roughly twenty of the categories these plugins expect resolve to *nothing*, because this is a
single-operator, pre-revenue, local-only business. There is no Jira, no Slack, no HubSpot, no
Snowflake, no Figma, no CI.

A template-following skill handed a missing tool will quietly manufacture a plausible substitute: a
ticket key, a deal stage, a traffic number, a sprint. For a business whose entire product is
*citation-traced due diligence* — whose tagline is **"Every claim, sourced. Every risk, named."** —
a fabricated pipeline number in an internal doc is the same failure mode it sells against, just
pointed inward.

So: when a skill reaches for an unbound category, it states that the business has no such tool and
uses the named fallback. That is the configuration.

---

## Categories at a glance

**Bound — real tools behind them**

| Category | Resolves to | Lane |
|---|---|---|
| `~~literature` | PubMed · Europe PMC · bioRxiv/medRxiv · Consensus | research |
| `~~clinical trials` | ClinicalTrials.gov v2 (+ `ctgov-supplemental` stop reasons) | research |
| `~~chemical database` | ChEMBL | research |
| `~~drug targets` | Open Targets (`open-targets-graphql`, shipped `134a5ad`) | research |
| `~~competitive intelligence` | searxng-search + ClinicalTrials.gov sponsor queries | research |
| `~~patent` | **PatSnap Patent & Literature Search** (OAuth 2026-07-30) — see the caveat below | research |
| `~~knowledge base` | Obsidian vault `My Digital Garden` via the `:8798` bridge | vault |
| `~~email` | Gmail — `trevor@trevorobeyinc.com` | business |
| `~~calendar` · `~~office suite` | Google Calendar · Google Workspace | business |
| `~~data enrichment` | vpai (vibe-prospecting) — the only enrichment surface | business |
| `~~CRM` | **`12-pipeline-tracking/`** — a manual four-stage funnel (**corrected 2026-07-29**, was wrongly recorded as NONE) | business |
| `~~monitoring` | CrowdStrike Falcon (propose-only); optional Prometheus/Grafana | security |
| `~~source control` | local git, **no remote** (local-only since 2026-05-26) | infra |

**Connected but awaiting operator OAuth** — treat as unavailable until authorized:
`~~data repository` (Synapse) · `~~AI research` (Owkin) · `~~scientific illustration` (BioRender)

> **`~~journal access` was corrected off this list 2026-07-29.** Wiley Scholar Gateway is the
> claude.ai connector **Scholar Gateway** and it is **already connected** — a live call returned
> full text of a **paywalled** Wiley article. Authorize **BioRender via claude.ai connector
> settings**, not via the bio-research plugin (byte-identical endpoint).

**Unbound — this business has none. Say so; do not invent.**

`~~chat` · `~~project tracker` · `~~ITSM` · `~~incident management` · `~~CI/CD` ·
`~~data warehouse` · `~~notebook` · `~~product analytics` · `~~user feedback` ·
`~~sales engagement` · `~~conversation intelligence` · `~~meeting transcription` · `~~design` ·
`~~design tool` · `~~SEO` · `~~marketing analytics` · `~~marketing automation` ·
`~~email marketing` · `~~procurement` · `~~lab platform` · `~~genomics platform`

---

## `~~patent` — a category no plugin asked for (added 2026-07-30)

Every other row above answers a placeholder some installed plugin actually ships. This one does
not: **no plugin in the installed set has a `~~patent` slot.** It is here because the *business*
acquired the capability, not because a template requested it. Its absence from the audit's
plugin-referenced category count is therefore expected, not drift.

PatSnap is the first intellectual-property source in this stack. Nothing else here holds a single
patent record — the 47 registered connectors cover literature, trials, chemistry, targets, coding,
and providers, and stop there. Verified live on 2026-07-30: a US · `A61K` · active · 2022-onward
GLP-1 query returned **50,447 hits**, each carrying assignee, inventor, IPC, legal status, all four
date fields, citation count, and full claim text.

**The caveat, which is load-bearing.** `openclaw-bridge/core/citation-extractor.js` recognizes
seven identifier types — PMID, PubChem CID, NCT, UniProt, ChEMBL, DrugBank, DOI. A patent
publication number such as `US12458612B2` matches **none** of them. So:

- A patent finding is **never extracted as a citation at all**, so it is not grounded against
  runtime-retrieved records and never retraction-screened.
- **Corrected 2026-07-30 — the mechanism is invisibility, not deflation.** An earlier revision of
  this section said feeding patent records into prefetch would make them count as *ungrounded* and
  deflate the ratio. Verified false: `citation-gate.js:106-108` builds the cited set solely from
  `extractCitations(reportText)`, so an identifier matching none of the seven patterns never reaches
  the grounded/ungrounded fork. Patent evidence neither raises nor lowers the grade.
- **The real customer risk is the opposite of deflation, and sharper.** The packager writes
  `citation-integrity.md` and any patent section into the same `deliverables/` folder, so a buyer
  sees an **A grade sitting beside an ungraded section** and reasonably concludes the patents were
  graded. Any bundle mixing the two needs an explicit grade-adjacency disclosure.
- `patsnap` stays out of `config/tool-prefetch-map.json` regardless — there is no engine
  fulfillment path, and the guardrail is cheap.
- Until a `PATENT` pattern and a runtime patent-id grounding source land **in the same change**,
  patent findings may inform operator judgement but must not be presented in a deliverable as
  citation-traced. The honest phrasing is *"patent evidence, outside the citation gate."* Adding
  the pattern **alone** is the ordering that genuinely deflates the ratio.
- Full fence language, the legal boundary (search/landscape only — never an FTO opinion), and the
  price band sit in [`01-brand-system/founder-lane-2026-07-29.md`](01-brand-system/founder-lane-2026-07-29.md).

Restated plainly: the **"Every claim, sourced"** guarantee does not yet cover patent assertions.
Selling an IP-flavoured deliverable before closing that is the never-overclaim doctrine pointed
inward — the same failure this whole bindings layer exists to prevent.

---

## Posture inherited by every plugin

From the repo `CLAUDE.md`, the continuity board, and `SYSTEM-REALITY.md`:

1. **Unbound means say so** — never fabricate a ticket, record, metric, channel, or pipeline.
2. **Never fabricate a citation** — real PMID / NCT / ChEMBL ID / DOI, or `[no verifiable citation found]`.
3. **Manual-only external actions** — skills draft; they never publish, post, send, log in, or transact.
4. **No PHI** — public biomedical sources only. There is no wet lab.
5. **Research artifacts only** — not validated for clinical decision support.
6. **Business lane stays out of research prefetch** — no plugin MCP server enters `config/tool-prefetch-map.json`.
7. **Security is propose-only** — hand off to `security-orchestration`; never weaken Falcon Custom-IOA rule 1.
8. **HTTPS-only** — any new TCP listener throws rather than falling back to plaintext.
9. **Local-only git** — no remote, no hosted CI, no PR flow. Commits are YubiKey-signed.
10. **Artifact placement** — `.archive/` for session artifacts, `workspace/audit/` for run artifacts,
    `~/Security Everything` for anything security.

---

# The plugins, one by one

## 1. productivity — `business` lane · v1.3.0

**Skills:** `start` · `task-management` · `update` · `memory-management`
**Connected:** Gmail, Google Calendar. **Needs auth:** Slack, Notion, Asana, Linear, Atlassian, Monday, ClickUp.

Runs on Gmail + Google Calendar + the Obsidian vault. There is **no project tracker and no chat**, so
the `start` skill must not try to bootstrap a task list by importing from one. Task state of record
is [`_continuity/CONTINUITY.md`](../_continuity/CONTINUITY.md); a `TASKS.md` is optional and seeds
from the board, not from a tracker.

**Guardrails**
- `memory-management` writes go to `~/.claude/projects/.../memory/`, never into the monorepo.
- No `#channel` references — there is no chat surface.

---

## 2. operations — `business` lane · v1.3.0

**Skills:** `capacity-plan` · `change-request` · `compliance-tracking` · `process-doc` ·
`process-optimization` · `risk-assessment` · `runbook` · `status-report` · `vendor-review`
**Connected:** Gmail, Google Calendar. **Needs auth:** Slack, Notion, Atlassian, Asana.

The highest-value plugin in the set right now, because `compliance-tracking` and `risk-assessment`
have genuine subject matter waiting for them:

- CA LLC **B20260217250** (approved 2026-06-18), certified SOS copy No. 457169837
- **$800 CA franchise tax due 2026-08-15** (already on the business calendar)
- AWS Data Exchange seller obligations, now cleared for paid products
- The open legal gate: the custom DSA says *do not publish until counsel has reviewed* —
  switching to AWS's StandardDSA removes the dependency
- Risk **R1** (AWS root email on the operator's `.edu` address) — **closed 2026-10-21**; root = `aws@trevorobeyinc.com`, a Workspace group

**Guardrails**
- `capacity-plan`: the team is **one person**. Do not model headcount or team utilization.
- `change-request`: there is no CAB — the approver is the operator, and console-mutating security
  changes stay propose-only.
- Runbooks live beside what they operate; security runbooks go to `~/Security Everything`.

---

## 3. engineering — `business` lane · v1.2.0

**Skills:** `architecture` · `code-review` · `debug` · `deploy-checklist` · `documentation` ·
`incident-response` · `standup` · `system-design` · `tech-debt` · `testing-strategy`
**Connected:** Gmail, Google Calendar. **Needs auth:** GitHub, Datadog, PagerDuty, Slack, Linear, Asana, Atlassian, Notion.

Targets this monorepo. **Source control is local git with no remote** — no PRs, no branch protection,
no hosted CI, no on-call rotation. The real gates are local:

```bash
bash scripts/lint-transport-monorepo.sh --strict
```

plus `npm run lint:transport` per bridge package, the engine unit suite (985/985 green as of
2026-07-22), and `bash scripts/verify-phase29-policy.sh`.

**Guardrails**
- `deploy-checklist` must not assume a remote or a pipeline. The actual deploy surfaces are the
  Obsidian plugin lifecycle, launchd units, and the Cloudflare worker `shy-grass-fccd`.
- Every design that binds a TCP host:port is **HTTPS-only, throw on cert failure, no plaintext fallback**.
- The `github` MCP stays exactly as-is behind its own YubiKey arm — never fold it into an automated flow.
- `standup` for a one-person team is a continuity-board entry, not a ceremony.

---

## 4. data — `business` lane · v1.1.0

**Skills:** `analyze` · `build-dashboard` · `create-viz` · `data-context-extractor` ·
`data-visualization` · `explore-data` · `sql-queries` · `statistical-analysis` · `validate-data` · `write-query`
**Needs auth:** *all of them* — Snowflake, Databricks, BigQuery, Hex, Definite, Amplitude, Atlassian.

**No warehouse is connected.** Every MCP server this plugin ships is unauthenticated, so the
warehouse-shaped skills have nothing to point at. What this business actually has:

- the **Trial Graveyard Feed** — 300 NCT-traced rows across 6 indications, ~90% carrying a
  sponsor-stated stop reason — at
  `workspace/aws-marketplace-listing/trial-graveyard-feed/data/<indication>/paid/register.csv`
  (6 × 50 rows; `free/` holds the 5-row samples). **Not** `workspace/datasets/` — that holds
  unrelated `retrieval_qa` builds, several `license_state: blocked` and none of them the product.
- the **Qdrant** vector store behind the TLS proxy on `:6433`
- run artifacts under `workspace/audit/`

`validate-data` and `statistical-analysis` are immediately useful against the Graveyard Feed —
worth running before the first paid AWS listing ships.

**Guardrails**
- Never write SQL against a warehouse that isn't connected. Say none exists; offer the local dataset.
- Charts follow the `dataviz` skill. No fabricated series.

---

## 5. product-management — `business` lane · v1.2.0

**Skills:** `competitive-brief` · `metrics-review` · `product-brainstorming` · `roadmap-update` ·
`sprint-planning` · `stakeholder-update` · `synthesize-research` · `write-spec`
**Connected:** Gmail, Google Calendar. **Needs auth:** Figma, Amplitude, Pendo, Intercom, Fireflies, Similarweb, Linear, Asana, Monday, ClickUp, Atlassian, Notion, Slack.

The "product" is the six-SKU offering ladder in [`OFFERINGS.md`](OFFERINGS.md) /
[`REVENUE_PLAYBOOK.md`](REVENUE_PLAYBOOK.md) plus the AWS Data Exchange feeds. The roadmap of
record is the **Current focus** block on the continuity board.

**Guardrails**
- `metrics-review` has **no analytics source**. It must refuse to produce engagement metrics — the
  only real numbers will be AWS seller reports, and they are not flowing yet.
- `sprint-planning` degrades to a prioritized next-actions list for a team of one.
- `stakeholder-update` drafts; the operator sends.

---

## 6. sales — `business` lane · v1.3.0

**Skills:** `account-research` · `call-prep` · `call-summary` · `competitive-intelligence` ·
`create-an-asset` · `daily-briefing` · `draft-outreach` · `forecast` · `pipeline-review`
**Connected:** Gmail, Google Calendar. **Needs auth:** HubSpot, Close, Clay, ZoomInfo, Apollo, Outreach, Monday, Fireflies, Similarweb, Atlassian, Notion, Slack.

**No CRM exists, and the business is pre-revenue as of 2026-07-24.** Enrichment runs through
**vpai** — the one enrichment surface actually available. ICP: biotech investors and pharma BD.
Pricing comes from `REVENUE_PLAYBOOK.md` §2 and is never invented.

**Guardrails**
- `forecast` and `pipeline-review` **must report "no CRM, no closed deals"** rather than modelling a
  pipeline. This is the single most important guardrail in the file: a fabricated forecast is
  precisely the failure this business sells against.
- `draft-outreach` drafts into Gmail and stops. No sequences, no automated sends.
- Any biomedical claim in an outbound asset carries a real PMID/NCT/DOI or gets cut.

---

## 7. marketing — `business` lane · v1.2.0

**Skills:** `brand-review` · `campaign-plan` · `competitive-brief` · `content-creation` ·
`draft-content` · `email-sequence` · `performance-report` · `seo-audit`
**Connected:** Gmail, Google Calendar. **Needs auth:** Canva, Figma, HubSpot, Ahrefs, Klaviyo, Supermetrics, Similarweb, Amplitude, Notion, Slack.

`brand-review` is the load-bearing skill, and unlike most of this plugin it has a real, strict canon:

- Wordmark **"Trevor Robey, INC."** where **INC = Intelligence Network Citations** (a backronym, not
  a corporate suffix)
- **Required disclosure**, every customer-facing use: *"Trevor Robey, INC. is the wordmark of Trevor
  Robey Intelligence Network Citations LLC, a California limited liability company."*
  Cal. Bus. & Prof. Code §17910.5(a) is why this is not optional.
- Tagline: *Every claim, sourced. Every risk, named. In days, not weeks.*

**Guardrails**
- `performance-report` and `seo-audit` have **no data source**. Do not estimate traffic, rankings, or
  keyword volume — those require tools this business does not have.
- `email-sequence` produces copy only; the manual-only posture forbids scheduled sends.
- Do not soften the citation re-resolution claims in landing copy — see the `SYSTEM-REALITY.md`
  copy-sweep warning.

---

## 8. design — `business` lane · v1.2.0

**Skills:** `accessibility-review` · `design-critique` · `design-handoff` · `design-system` ·
`research-synthesis` · `user-research` · `ux-copy`
**Connected:** Gmail, Google Calendar. **Needs auth:** Figma, Intercom, Linear, Asana, Atlassian, Notion, Slack.

**No Figma.** The real design surfaces are the landing page in
`workspace/collateral/landing-page/`, the four Obsidian plugin UIs (Command Center · Zettelkasten ·
Bridge Launcher · Wiki Definitions), and the rendered report deliverables. `accessibility-review`
and `ux-copy` apply to those directly; `design-handoff` has no recipient — there is no designer to
hand off to.

**Guardrails**
- `user-research` has no users and no feedback tool. Do not synthesize interviews that never happened.
- Plugin **display names** are branded, but plugin **IDs are frozen**: never rename
  `command-center`, `vault-zettelkasten`, `obsidian-bridge-launcher`, `contextual-wiki-definitions`.

---

## 9. bio-research — `research` lane · v1.2.0

**Skills:** `start` · `instrument-data-to-allotrope` · `nextflow-development` ·
`scientific-problem-selection` · `scvi-tools` · `single-cell-rna-qc`
**Connected:** PubMed, ChEMBL, ClinicalTrials.gov, bioRxiv, Consensus, Open Targets.
**Needs auth:** Wiley, Synapse, Owkin, BioRender, Benchling.

The only plugin whose MCP servers overlap the research lane — and that overlap needs care.

Its `pubmed` / `chembl` / `c-trials` / `biorxiv` / `consensus` / `ot` servers are **Claude-host
duplicates** of connectors already registered and role-bound in `config/connector-registry.json`.
They are for interactive, chat-side orientation. The engine keeps using its own subprocess adapters
under `openclaw-bridge/mcp/`. **Do not double-register them, and do not add them to
`config/tool-prefetch-map.json`** — doing so would dilute the grounded-citation ratio the Phase-30
gate computes and inflate a token budget already near 300K per template.

**Guardrails**
- **Duplicate-aware:** a claim destined for a paid deliverable must come through the *engine's*
  registered connectors so the grounding gate can see it.
- **No wet lab:** `nextflow-development`, `scvi-tools`, `single-cell-rna-qc`, and
  `instrument-data-to-allotrope` are reference / public-data only (GEO, SRA). Never imply in-house
  sequencing, instruments, or sample handling.
- **No PHI.**
- Verify every citation before it ships. `scholar-sidekick` was **retired everywhere 2026-08-27**
  (operator-directed after its API key leaked; do not call it and do not reinstall it — tombstone in
  `config/connector-registry.json`, canonical record in
  `~/Security Everything/docs/scholar-sidekick-removal-2026-08-27.md`). The check it performed is
  now manual: resolve the identifier at its source and compare the claimed title against the record
  it actually resolves to (PMIDs → this plugin's `pubmed` `get_article_metadata` /
  `lookup_article_by_citation`; DOIs → Crossref/OpenAlex via `searxng-search` topic `science`).
  A resolvable DOI paired with an invented title is the dominant fabrication pattern, and
  resolution alone will not catch it. Retraction status: PubMed pubtype `Retracted Publication`
  chat-side; engine-bound claims are already screened by `crossref-retraction.js` +
  `pubmed-retraction.js`.

---

## 10. pdf-viewer — `infra` lane · v0.2.0

**Skills:** `view-pdf` · `open` · `annotate` · `fill-form` · `sign` — **no placeholders, no auth needed.**

Ready to use as-is, with real documents waiting: the CA SOS certified LLC copy (Certificate No.
457169837), the AWS StandardDSA vs. custom DSA comparison that currently gates the first paid
listing, vendor contracts, and the Strayer GPS dashboard PDF.

**Guardrails**
- `sign` places a signature *image*. Executing a binding agreement is an operator act — propose the
  placement and let the operator confirm before the file is treated as executed.
- For extraction or summarization use native `Read` / the `pdf` skill; this plugin is for visual
  collaboration.

---

## 11. vpai (vibe-prospecting) — `business` lane · v0.1.107

**Skills:** `vibe-prospecting` · `skip_sample`

The business's only prospecting/enrichment capability, and therefore the resolution of
`~~data enrichment` for the sales plugin. Feeds `sales:account-research` and `sales:draft-outreach`.

**Guardrails**
- **Sample-first stays on.** Only run `vpai:skip_sample` on an explicit operator request — full-scale
  enrichment is costly and hard to undo.
- Prospect data is third-party **personal data**: keep it out of the vault and out of git.
  Session-scope only.
- Enrichment output is **not citable evidence** and never enters a research deliverable.

---

## 12. frontend-design — `infra` lane · CLI marketplace

**Skill:** `frontend-design` · enabled in `~/.claude/settings.json` → `enabledPlugins`

Installed through the CLI marketplace (`claude-plugins-official`), not the desktop plugin system.
It resolves `~~design` / `~~design tool` for the design and marketing plugins, since there is no
Figma. Applies to the landing page and the four Obsidian plugin UIs.

**Guardrails**
- Visual direction only — it does not override the brand canon.
- Any UI it produces that talks to a local service uses the HTTPS proxies (`:8798`, `:8743`, `:6433`,
  `:8891`), never a plaintext port.

---

## 13. ralph-loop — `infra` lane · v1.0.0 · CLI marketplace

**Commands:** `ralph-loop` · `cancel-ralph` · `help` · ships a **Stop hook** that re-drives the
session until the loop is cancelled.

An autonomous iteration harness. Legitimate targets are bounded, verifiable, *local* loops: driving
the engine unit suite to green, working down `.learnings/FEATURE_REQUESTS.md` drift tickets, or
grinding a dataset-validation pass over the Trial Graveyard Feed.

**Guardrails — the strictest in this file**
- **Never point a Ralph loop at anything that triggers a YubiKey ceremony** — `sudo-gate`, the
  `cic`/`ccu`/`cb`/`tb` gates, `--operator-approve`, or signed commits. Every iteration would demand
  a physical touch, and sub-agents must never trigger these at all.
- **Never loop an outward-facing action** — publish, send, post, deploy, or an AWS listing change.
- Define the exit condition *before* starting, and confirm `cancel-ralph` works. The Stop hook keeps
  the session alive by design.
- Loop work stays on a branch or a throwaway worktree; leave commits for the operator to sign.

---

## Installed but deliberately not bound

| Plugin | Why not |
|---|---|
| ~~`desktop-commander` v0.2.0~~ | **UNINSTALLED 2026-07-28** — superseded by FilesystemPlus. See the section below; the "ungoverned path to the vault" concern turned out to be live, not hypothetical. |
| `cowork-plugin-management` v0.2.2 | Plugin-authoring tooling. Its `cowork-plugin-customizer` skill **cannot run on this surface** — it requires Cowork's `mnt/.local-plugins` mounts, absent in CLI Claude Code. That limitation is exactly why these bindings are repo-owned rather than stamped into the plugin packages. |

---

## ⚠️ A plugin package is a THIRD MCP registration surface (learned 2026-07-28)

There are **three** places an MCP server can be registered on this machine, and cleaning two of
them does not clean the third:

| # | Surface | Managed via |
|---|---|---|
| 1 | `~/.claude.json` | `claude mcp`, CLI + Desktop Code tab |
| 2 | `claude_desktop_config.json` | Desktop Chat connector settings |
| 3 | **the plugin package itself** | **Claude Desktop plugin UI only** |

A plugin usually declares its servers in a sibling `.mcp.json`. But it may also declare them
**inline** under `mcpServers` in `.claude-plugin/plugin.json` — and then the plugin re-registers
that server from inside its own package, independent of surfaces 1 and 2.

**The case that taught this** (resolved — `desktop-commander` was uninstalled 2026-07-28). The
operator had removed it from *both* host configs and replaced it with `FilesystemPlus` — correctly,
and that stuck. But the plugin was still installed, and it declared inline:

```json
"mcpServers": { "desktop-commander": { "command": "npx", "args": ["-y", "@wonderwhy-er/desktop-commander@latest"] } }
```

So it kept coming back: 26 `mcp__plugin_desktop-commander_*` tools loaded in a session on
2026-07-28, and `@wonderwhy-er/desktop-commander-0.2.46.tgz` sits in the npm cache — it had
fetched and executed. An unpinned `@latest` third-party package providing terminal execution,
process management, and filesystem access, entirely outside the sudo-gate / YubiKey model.

It is also the reason the 2026-07-24 record was wrong: the original enumeration read only
`.mcp.json`, so it logged this plugin as having **zero** MCP servers.

**Now enforced — two tripwires.** `scripts/audit-connector-coverage.js` scans every plugin package
for inline `mcpServers` declarations, and separately re-checks that every tombstoned plugin is
still absent from disk. Both were negative-tested against a simulated reinstall. Run it after
installing any plugin:

```bash
node scripts/audit-connector-coverage.js
```

**Removal is operator-only.** `claude plugin` manages only `~/.claude/plugins/` (the CLI
marketplace) and cannot see rpm plugins; the rpm `manifest.json` is cloud-synced and must not be
hand-edited. Uninstall in the Claude Desktop plugin UI, then fully quit and reopen the app.

**Verified removal, 2026-07-28** — six independent checks, all green:

| # | Check | Result |
|---|---|---|
| 1 | Package dir on disk | gone |
| 2 | Any package named `desktop-commander` | none (12 remain) |
| 3 | Entry in rpm `manifest.json` | absent (13 → 12) |
| 4 | Inline-MCP detector | 0 across 12 packages |
| 5 | Both host configs | still clean, no re-add |
| 6 | Running process | none |

---

## ✅ FINAL SWEEP — the last four plugins (2026-07-31)

### `ralph-loop` — **KEEP AS-IS**, guardrail now concrete

Genuinely well-engineered, verified by reading `hooks/stop-hook.sh`: a **hard iteration cap** that
deletes the state file and exits cleanly at the limit; **session isolation** via `session_id`, so
another session's loop cannot block yours; numeric-field validation on the state file; state is
project-scoped at `.claude/ralph-loop.local.md`. No loop active in this repo. Nothing to tailor.

**But its guardrail stopped being theoretical today.** Commit `0bc4654` put the operator ceremony on
**every model-reaching CLI**, so a Ralph loop pointed at any of these would demand a **YubiKey touch
per iteration**:

`run-workflow.js` · `run-research-task.js` · `run-dataset-mission.js` ·
`run-live-llm-verification.js` · `test-llm-connection.js`

Combined with the standing rule that sub-agents must never trigger a ceremony, the guardrail is now:
**never point a Ralph loop at an engine run.** Safe targets remain bounded local loops — driving the
unit suite to green, working down `.learnings/FEATURE_REQUESTS.md`, grinding a dataset-validation
pass. Always define the exit condition first and confirm `cancel-ralph` works.

### `pdf-viewer` — **KEEP AS-IS**

Zero placeholders, authenticated, 9 live tools, and it scopes itself honestly: *"Not for
summarization or text extraction (use native Read instead)"* — genuinely complementary to the global
`pdf` skill (merge/split/OCR) and to native `Read`. `sign` carries its own correct caveat: *"for
legally binding e-signatures, use a dedicated signing service."* Uses `npx -y
@modelcontextprotocol/server-pdf` (v1.7.5, cached) — the same unpinned pattern as others, but from
the official MCP org. Real documents waiting: the CA SOS certified copy, the AWS StandardDSA
comparison, `CommonPaper-Mutual-NDA-v2.pdf`.

### `vpai` — **KEEP AS-IS, dormant**

The only plugin with real substance (37 business refs, 21 MCP-tool refs) and the only enrichment
surface, resolving `~~data enrichment`. **Zero value to the research engine** — B2B firmographics
carry no PMID/NCT/ChEMBL/DOI, so nothing it returns can pass the citation gate.

> ⚠️ **Before first use:** in Claude Code its primary path is a CLI it instructs Claude to install
> **globally at the start of every workflow** — `npm install -g @vibeprospecting/vpai@latest`, with
> the doc insisting *"always run this install… never skip because the CLI is already on PATH."* Same
> unpinned auto-updating shape as Desktop Commander, though lower severity (data-fetch tools, not
> shell; requires an explicit Bash call). **Currently inert** — not installed, not authenticated. If
> activated, **pin the version** rather than following that instruction.

### `frontend-design` — **KEEP AS-IS** (collision fixed, see its section above)

---

## 🗑️ PENDING OPERATOR UNINSTALL — nine rpm plugins (2026-08-11)

All verdicts are final and every replacement is installed. The nine dropped Desktop/Cowork plugins
**cannot be uninstalled from the CLI** — re-verified 2026-08-11 (`claude plugin uninstall
product-management` → *"not found in installed plugins"*; the CLI manages only the marketplace and
`trinc-local` sets). The rpm `manifest.json` is cloud-synced and must never be hand-edited.

**✅ DONE 2026-08-12 — the operator uninstalled seven:**

`productivity` · `operations` · `engineering` · `product-management` · `sales` · `marketing` · `design`

**KEPT — and the two DROP verdicts are REVERSED (see the correction below):** `bio-research`, `data`,
plus `pdf-viewer`, `vibe-prospecting` (vpai), `cowork-plugin-management`.

> ### 🔄 CORRECTION 2026-08-12 — `bio-research` and `data` stay, and the doctrine was the bug
>
> Both were assessed against ONE question — *"does this add a capability the citation-gated engine
> doesn't have?"* — and both correctly answered no. **That was the wrong question**, and the reason it
> got asked is a gap in this file's own doctrine: it named a **research lane** and a **business lane**
> and had no name for the work the operator does most — ad-hoc analyst work in a Claude session
> (pre-sale scoping, feasibility, founder conversations, questions matching no template). Every tool
> serving that lane scored zero because the lane was not in the model.
>
> **Fixed:** `posture.rules` now carries `THREE-LANES-NOT-TWO` and `ANALYST-LANE-PROMOTION-RULE`.
>
> Two concrete errors this produced:
>
> | Plugin | What I got wrong |
> |---|---|
> | `bio-research` | I called all six skills wet-lab DO-NOT-USE. **Only four are.** `scientific-problem-selection` — which I never opened — implements Fischbach & Walsh, *Cell* 2024, with nine reference files, and is aimed exactly at the founder lane's buyer: someone deciding what to pursue. Its five "duplicate" servers are redundant *to the engine* and useful *in the analyst lane*, where the engine isn't running. |
> | `data` | Correct that there is no warehouse (sql-queries/write-query/build-dashboard have no referent). **Wrong** that the plugin is therefore valueless — the Trial Graveyard Feed is a real tabular product: **1,921 paid rows, 6 indications, 13 columns**, and `analyze`/`explore-data`/`validate-data`/`create-viz` all accept a **file**, not only a warehouse table. |
>
> **Unchanged, and load-bearing:** the four wet-lab skills stay DO-NOT-USE — that is a liability
> boundary (no QMS, no method validation, outside the citation guarantee), and a founder buyer who
> owns a lab makes it *more* important, not less. No plugin MCP server enters `tool-prefetch-map.json`.
>
> **Companions built:** `trinc-bioresearch` (problem-selection · ad-hoc-research) and `trinc-data`
> (feed-analytics · deliverable-data).

Nothing breaks either way: none of the nine's MCP servers is authorized, and the replacements are
live. **After uninstalling, say so** — the nine get tombstoned in the binding files and the audit's
resurrection check starts verifying they stay gone (the desktop-commander pattern). Tombstones are
deliberately NOT added before the uninstall, because the audit would fire nine standing warnings
for a known pending action — the alarm-fatigue failure this stack avoids on principle.

---

## Operator remainder

The plugins' *skills* work today with no authentication at all — only the MCP servers need OAuth,
which the operator must complete in claude.ai connector settings or via `/mcp` in an interactive
session. Claude cannot run those flows non-interactively.

> **Counting caveat.** The 13 plugins reference **97 server slots but only 46 unique servers** —
> `slack`, `notion`, `atlassian`, `gmail`, and `google calendar` each appear in 7 plugins. The
> per-plugin `mcp_connected` / `mcp_needs_auth` numbers in the registry are *slot* counts; never sum
> them into a server total.

**Authorize ONE thing — corrected 2026-08-11, per the 2026-07-30 live Scholar Gateway verification:**

| # | Server | Where | Why |
|---|---|---|---|
| 1 | **BioRender** | **claude.ai → Settings → Connectors** (NOT via the bio-research plugin — byte-identical endpoint) | figures for deliverables and SBIR/STTR applications — the one genuine capability gain left |
| 2 | Synapse | bio-research plugin | **conditional** — only if its datasets are wanted; it is the sole reason not to uninstall the plugin |

~~Wiley~~ — **do not authorize; you already have it.** The plugin's `wiley` is byte-identical to the
**connected, working** `claude.ai Scholar Gateway` connector (live call returned full text of a
paywalled Wiley article). ~~Owkin~~ — do not authorize; duplicates both the engine's `owkin-mcp`
adapter and the claude.ai Owkin connector.

**Do NOT authorize `plugin:engineering:github` — security. Contained 2026-07-28.** See the section
below for why a redirect to the gated server is impossible and what was done instead.

**Leave the remaining ~26 unauthenticated.** Slack, Notion, Atlassian, Asana, Linear, Monday,
ClickUp, HubSpot, Close, Apollo, Outreach, Clay, ZoomInfo, Amplitude, Pendo, Intercom, Figma,
Canva, Ahrefs, Similarweb, Klaviyo, Supermetrics, Snowflake, Databricks, BigQuery, Hex, Definite,
Datadog, PagerDuty, Benchling, Fireflies — every one maps to a category that resolves to an
explicit **NONE**. That is the correct end state, not a gap.

Already working, no auth needed: `pubmed`, `chembl`, `c-trials`, `biorxiv`, `consensus`, `ot`,
`pdf`, `gmail`, `google calendar`.

---

## 📋 FINAL VERDICT ON ALL 13 PLUGINS (2026-07-29)

The `engineering` test — *do the skills reference any MCP tool? do they mention this business? do
they duplicate an existing local skill? do their bundled servers bind to anything real?* — was
applied to every remaining plugin. Measured across all `.md` files in each package:

| Plugin | skills | MCP srv | business refs | MCP-tool refs | Verdict |
|---|---:|---:|---:|---:|---|
| **vpai** | 1+1 | 0 | **37** | **21** | **KEEP AS-IS** — the only plugin with real substance; genuinely functional, resolves `~~data enrichment` |
| **pdf-viewer** | 1+4 | 1 | 0 | 0 | **KEEP AS-IS** — placeholder-free, authenticated, real documents (SOS certified copy, DSA comparison) |
| productivity | 4 | 9 | 0 | 0 | **TAILORED → `trinc-productivity`** (2026-07-29) — see below |
| operations | 9 | 6 | 0 | 0 | **TAILORED → `trinc-operations`** (2026-07-29); `compliance-tracking` went to `trinc-business:compliance-calendar` — see below |
| marketing | 8 | 13 | 0 | 0 | **TAILORED → `trinc-marketing`** (2026-07-29); brand voice already went to `trinc-business:brand-check` — see below |
| data | 10 | 8 | 0 | 0 | **DROPPED** (2026-07-29) — tailored, then removed; see below |
| design | 7 | 9 | 0 | 0 | **TAILORED → `trinc-design`** (2026-07-29) — see below |
| product-management | 8 | 16 | 2* | 0 | **DROP — assessed 2026-07-31.** All 8 skills dead or covered: `metrics-review` (no analytics), `sprint-planning` (team of one), `roadmap-update`/`stakeholder-update` (the roadmap IS the continuity board → `orient`/`triage`), `synthesize-research` (no users), `competitive-brief` (citable path is CT.gov `search_by_sponsor`), `write-spec`/`product-brainstorming` (native). 14 of 16 servers need auth and map to NONE. |
| sales | 9 | 14 | 2* | 0 | **DROP as a plugin** (2026-07-29) — but the `~~CRM` binding was CORRECTED; see below |
| bio-research | 6 | 11 | 6* | 0 | **KEEP — DROP REVERSED 2026-08-12** (see correction; the engine-only test was the wrong question). Superseded detail: (2026-07-29→31): skills DO-NOT-USE; five servers duplicate engine adapters; Wiley = the already-connected Scholar Gateway; BioRender/Owkin = independent claude.ai connectors. Unique value = **Synapse only** (unauthenticated). Uninstall pending operator — see below |
| engineering | 10 | 10 | 0 | 0 | **DROPPED** → replaced by `trinc-engineering` |
| cowork-plugin-management | 2 | 0 | — | — | installed, not bound (its customizer cannot run in CLI) |
| desktop-commander | — | — | — | — | **REMOVED 2026-07-28** (tombstoned) |

\* Incidental, not tailoring — the matches are generic phrases like "biomedical literature",
"investor materials", "sales enablement". Verified by reading them in context.

**Eight generic templates, one signature: zero business references, zero MCP-tool references.**
Exactly what `engineering` looked like. Their bundled servers map overwhelmingly to categories
that resolve to an explicit NONE here.

### Tailored #1: `productivity` → `trinc-productivity` v1.0.0 (2026-07-29) — 3 skills, 0 MCP servers

Taken one-by-one at the operator's direction, starting with the first plugin they named. Upstream
premise — a generic `TASKS.md` plus a two-tier CLAUDE.md/memory scheme, syncing from a project
tracker — is wrong here twice over: there is no tracker, and this stack has **four** memory systems
with strict routing rules, not two tiers.

| Upstream skill | Verdict |
|---|---|
| `start` | **rewritten** as `orient` — reads real board state, colour-coded blockers first, plus the standing rules that bite immediately |
| `update` | **rewritten** as `triage` — audit the board against reality; the real failure here is a focus block that quietly stopped being true |
| `memory-management` | **rewritten** as `memory-route` — four systems, and the silent-corruption traps of each |
| `task-management` | **dropped** — `.claude/skills/continuity-board/` already owns board mechanics; duplicating it would collide |

**Verified facts encoded** (read first-hand, not from CLAUDE.md): both Perseus vaults exist with
**separate DBs and separate keys** (`business-vault.db`/`business.key` vs
`perseus-vault.db`/`secret.key`); file memory holds **30 files + a 31-line `MEMORY.md`**; the board
carries **8 live Current-focus blocks**; and commit signing changed 2026-07-28 — `gpg-agent` no
longer autostarts, so *"no gpg-agent running"* is the **correct loud failure**, recovered with
`yk-aqua-preflight`, never `--no-gpg-sign`.

**The traps `memory-route` exists to prevent**, each of which fails *silently*: `perseus_vault_embed`
on an encrypted vault poisons semantic search with confident noise; a keyless server on an encrypted
DB returns ciphertext **as content** with no error; a Perseus CLI `maintain`/`reindex` replaces the
search index with ciphertext and exits 0; `recall_when` can never match (no such column);
`importance` actually writes `decay_score`, so low values archive *sooner*; and no secret may enter
a vault because the FTS5 index is a plaintext copy.

By design it **routes to** `continuity-board` for board writes rather than restating the protocol.

### Tailored #2: `design` → `trinc-design` v1.0.0 (2026-07-29) — 2 skills, 0 MCP servers

Upstream shipped 7 skills built on Figma, user interviews, and a designer to hand off to — none of
which exist here. But two design surfaces genuinely matter, and reviewing them turned up a real
product defect.

| Upstream skill | Verdict |
|---|---|
| `accessibility-review`, `ux-copy`, `design-critique` | **merged** → `web-surface` |
| — (new) | `report-readability` — the deliverable as a designed artifact; nothing covered this |
| `design-handoff` | **dropped** — no recipient; solo operator |
| `user-research`, `research-synthesis` | **dropped** — no users, no feedback tool; do not synthesize interviews that never happened |
| `design-system` | **dropped** — the aesthetic is fixed canon, and `frontend-design` owns visual direction |

#### 🔴 Product defect found while building it — customer-facing report ships internal scaffolding

Verified in the real bundle `offer-2af242bc1548229c102fee55`, `deliverables/report.md`:

- **4 `# ` H1s in one document** (lines 1, 25, 97, 140) — agent outputs pasted in with their own
  titles, so the outline breaks and heading levels reset.
- **The table of contents is meaningless** — all three entries read `[Research Output]`.
- **Internal pipeline vocabulary as section headings** — `## 1. Research Output` ×3.
- **An agent-to-agent note shipped to the buyer** — `## Handoff to analyst` (line 79).
- **First-person agent narration** (line 88): *"Plain-language recap: I acted as the 'scout' — the
  agent whose only job is to go find real, verifiable sources … and hand a clean list to the next
  analyst…"* — telling a client paying $9,950–$24,950 that the report is assembled by agents named
  scout and analyst, narrating its own process.
- `evidence-appendix.md` is **8 lines** against a 221-line report.

**Preserve the honesty in that passage, move it.** It records that a named source lane returned
nothing and was marked `[no verifiable citation found]` rather than faked — a selling point. The
defect is placement and voice, not the disclosure.

#### Measured a11y baseline (2026-07-29)

| | `index.html` (708 ln) | `intake.html` (977 ln) |
|---|---|---|
| `lang` | ✅ `en` | ✅ `en` |
| inputs / labels | 0 / 0 | ✅ **22 / 22** |
| `aria-*` | 2 | **0** |

Every intake field is labelled — genuinely well built. **The gap is `aria-` on the intake form:
zero**, on the page that *is* the revenue path, so validation errors and required state are likely
announced to nobody.

> **Authoring gotcha caught here:** a `: ` (colon-space) inside an unquoted YAML `description:`
> makes the frontmatter fail to parse, and the skill then **loads with all metadata silently
> dropped** — `claude plugin install` still succeeds. Always run
> `claude plugin validate <dir>` after authoring; all four local plugins now pass.

### Tailored #3: `marketing` → `trinc-marketing` v1.0.0 (2026-07-29) — 2 skills, 0 MCP servers

| Upstream skill | Verdict |
|---|---|
| `brand-review` | **already covered** by `trinc-business:brand-check` — routed, not duplicated |
| `email-sequence`, `draft-content`, `content-creation` | **merged** → `outbound-draft` |
| — (new) | `collateral-audit` — pricing-drift detection; nothing covered this |
| `performance-report`, `seo-audit` | **dropped** — no analytics, no SEO tool, no data source at all |
| `campaign-plan` | **dropped** — no automation, no channel to run a campaign on |
| `competitive-brief` | **dropped** — competitor pipeline intel is citable research via `search_by_sponsor`, not marketing |

#### 🔴 Commercially significant defect found while building it

**`workspace/collateral/catalog/product-catalog.md` is selling an explicitly RETIRED price list.**
Verified 2026-07-29:

- It prices **every** product at `$2,500 (standard) | $4,950 (premium)`, with tiers to
  `$15,000 / $35,000 / $60,000 / $120,000`.
- `REVENUE_PLAYBOOK.md:179` describes exactly that structure as **retired**: *"The retired
  Standard / Premium / Custom / Enterprise ARR ladder ($2,500 / $4,950–$14,950 / $15K–$35K /
  $60K–$120K+) is no longer…"*
- The catalog contains **zero** mentions of "Investor Pre-Mortem", "Failed Trial Archaeology",
  `$9,950`, or `$19,950` — i.e. the entire **primary** offering is absent.
- Its six products are named after **engine workflow templates** (`drug-discovery-full`,
  `pharmacovigilance-report`, …) — internal pipeline ids used as commercial product names.

Net effect: the customer-facing catalog sells the engine's template list at roughly **a quarter**
of the primary SKU's price.

**Collateral coverage is inverted.** One-pagers and samples cover **pharmacovigilance** (the
*demoted* SKU) and target-validation; the **primary** Investor Pre-Mortem and flanking Failed Trial
Archaeology have **no one-pager and no sample** — so outbound for the primary ask has no artifact
to attach.

**Outbound itself is fine.** `07-outbound/` holds four personas, a 9-touch cadence, LinkedIn
openers, a targeting guide, response triage and an SDR brief — and its templates quote the
**current** ladder. Only the catalog drifted.

> **Doc correction needed:** the repo `CLAUDE.md` "Collateral Directory" table points outbound at
> `workspace/collateral/outbound/`, **which does not exist**. The real location is `07-outbound/`.

### ❌ `data` — tailored, then DROPPED the same day (2026-07-29)

`trinc-data` was built (2 skills: `feed-qa`, `dataset-map`) and then **uninstalled and deleted at
the operator's direction**, because it added **nothing to the research engine**.

**The reasoning, which generalises to every plugin here.** A plugin of skills is markdown — it
changes how Claude behaves, not what `run-workflow.js` does. `trinc-data` contained two `.md` files
and a manifest, zero code, and zero references from `openclaw-bridge/` or `scripts/`. Every genuine
engine improvement this session came from **investigating** the engine, not from installing a
plugin — e.g. the `search_coverage` allowlist fix that resurrected a deliverable which had never
once been written (`2458c22`).

**Upstream `data` remains dropped on its own merits**: `sql-queries`/`write-query` target a
warehouse that does not exist; `create-viz`/`data-visualization`/`build-dashboard` duplicate the
global **`dataviz`** skill, which is better.

**Knowledge preserved — nothing was lost with the plugin:**
- cross-indication duplicate `NCT04541875`, and the free-tier filenames
  (`register-sample.csv` / `citation-index-sample.csv`) → `trinc-engineering:feed-refresh`
- the three decoy paths (`workspace/datasets/` license-blocked scratch; the stale 12-row
  `workspace/distribution/graveyard-feed/glioblastoma-2026-06-20/` at the build script's default
  `--out`; retired `/Volumes/ExtraCurricular` export paths) → recorded in this file
- Qdrant reachable at `https://127.0.0.1:6433` (HTTP 200, verified 2026-07-29) → recorded here

**Open, unfixed engine bug found during this work** — `renderDataDictionary()`
(`openclaw-bridge/monetization/graveyard-feed.js:117`) is **not tier-aware**: it hardcodes
`## register.csv` / `## citation-index.csv`, and `build-graveyard-feed.js:60` writes that same
string into `free/`. Verified byte-identical paid/free dictionaries, while the free files are named
`*-sample.csv`. A free-tier subscriber gets documentation naming two files not in their download.

**A claim I withdrew.** I began arguing that `maxHistory: 5` (default at
`ctgov-supplemental.js:36`, unset by `_workflow-runtime.js:92`) degraded the graveyard memo. On
reading the code, `buildAmendmentRisk` **filters** to trials with version history and the memo
states *"Across N comparable stopped trial(s) with version history"* — so it is honest about its
sample. With `pageSize: 6` it samples 5 of 6. Marginal, **not a defect**; do not re-raise it as one.

### ❌ `sales` — assessed, NO plugin built (2026-07-29)

Deliberately not tailored. Applying the test that governs this whole set — *does a skill encode
facts you would otherwise get wrong?* — `sales` fails it, because the funnel already documents
itself. Two plugins were built and deleted the same day earlier; this one was stopped **before**
building.

| Upstream skill | Why no skill |
|---|---|
| `draft-outreach`, `account-research` | covered by `trinc-marketing:outbound-draft` + vpai |
| `daily-briefing` | covered by `trinc-productivity:orient` |
| `create-an-asset` | covered by `collateral-audit` + `brand-check` |
| `competitive-intelligence` | the citable path is CT.gov `search_by_sponsor` — research, not sales |
| `forecast`, `pipeline-review` | with 0 deals the correct output is the actual zeros, already stated in the files |
| `call-prep`, `call-summary` | marginal — the target list is in `discovery-calls.md`, written by the operator |

#### 🔧 What the assessment DID produce — a corrected binding

**`~~CRM` was recorded as NONE. That was wrong.** There is no SaaS CRM, but there IS a maintained
manual funnel at **`12-pipeline-tracking/`**:

```
discovery-calls.md -> nda-pipeline.md -> signed-deals.md -> kpis-end-of-month.md
```

It is a better expression of the never-fabricate doctrine than most of the code: every file opens
with an explicit **`Zero baseline (2026-06-10)`** and states its zeros outright (`_none yet_`, 0,
`$0`) rather than leaving blanks that invite invention. Each stage names its downstream. SKUs
reference `OFFERINGS.md` canonically. First-wave targets are named per persona (P1 pharma CI:
AstraZeneca/GSK/AbbVie · P2 quant alt-data: Point72/Citadel/RA Capital · P3 target discovery:
Iambic/Recursion/Isomorphic · P4 academic/boutique: ClearView/Trinity/Clarivate).

**It is current, not stale** — the KPI monthly log carries a `2026-07 (update 07-22)` row recording
the AWS paid-selling clearance.

Still true, and unchanged by the correction: **never invent a deal stage, ARR, or a weighted
forecast.** With 0 deals the honest output is the zeros, read from these files.

#### 🟡 Open business gap surfaced (not a code defect)

**The primary SKU has no sample.** `workspace/collateral/samples/` holds only pharmacovigilance
material — the *demoted* tactical SKU. The **Investor Pre-Mortem** ($9,950–$19,950) and **Failed
Trial Archaeology** ($14,950) have no one-pager and no sample, so a discovery call on the flagship
has no artifact to attach. Tracked also under the `marketing` entry.

### Tailored #4: `operations` → `trinc-operations` v1.0.0 (2026-07-29) — 1 skill, 0 MCP servers

Eight of nine upstream skills dropped (`capacity-plan` models a team of one; `change-request` has
no CAB; `process-doc`/`process-optimization`/`runbook`/`status-report`/`vendor-review` are generic;
`compliance-tracking` was already extracted to `trinc-business:compliance-calendar`). One skill
replaces them, and it is arguably the highest-value skill in the whole set — it is what stands
between this business and revenue.

#### 🔴 The finding: the business-ops scaffolding is mostly empty

Measured 2026-07-29 — **a directory of well-named files is not a completed checklist**:

| Directory | Files | Placeholders | With content |
|---|---:|---:|---:|
| `15-first-sale-risk-mitigation/` | 10 | **10** | **0** |
| `08-contracts-legal/` | 15 | **15** | **0** |
| `14-due-diligence-checklist/` | 5 | 4 | 1 |
| `09-source-licenses/` | 11 | 7 | **4** |

`08-contracts-legal/` lists `common-paper/`, `indemnification-clause.md`, `ip-license-structure.md`,
`data-residency-clause.md`, `attorney-engagement.md` — **all fifteen are 3-line placeholders.**
So the business is otherwise positioned to sell (AWS cleared for paid 2026-07-22, 300-row feed
ready, outbound sequences current, funnel built) with **no contract, no NDA, no payment terms, no
refund policy, no indemnification clause and no insurance written down**.

**Item 6 is the sharpest:** `REVENUE_PLAYBOOK.md` advertises a *"refund-backed citation-audit SLA"*
on the primary SKU, while the refund policy that would define it is a placeholder — a
customer-facing promise with no written policy behind it.

**Done and verified:** entity setup — CA Entity **B20260217250**, approved 2026-06-18, certified
copy 457169837.

#### Source licensing — one area genuinely worked through, one open

**DrugBank is handled properly**: no commercial licence, so no `DB#####` accessions or
DrugBank-derived fields may ship — enforced **mechanically** by a `DB\d{5}` build gate, with a
documented licence-free substitute stack.

**ChEMBL is open**: flagged CC BY-SA 3.0 **share-alike with counsel pending**, and that file is
itself a placeholder. ChEMBL is a bound connector and the citation gate accepts `CHEMBL` ids, so
ChEMBL content *can* reach a paid deliverable, and unlike DrugBank there is **no mechanical gate**.
Scoped accurately: **no shipped bundle currently contains a ChEMBL identifier** — the three in
`workspace/releases/` cite NCT/PMID/DOI only. The exposure is **latent, not realized**, and whether
share-alike propagates is a counsel question that must not be answered in-repo.

### ✅ `frontend-design` — KEEP AS-IS, now composed correctly (assessed 2026-07-29)

Anthropic's CLI-marketplace skill (55 lines). Genuinely good and **complementary, not redundant** —
it brings craft process this stack had nowhere else: a compact token system (4–6 named hex, 2+ type
roles, layout concept, signature element), a two-pass *plan → critique → build* discipline, CSS
specificity traps, and a quality floor (responsive, visible keyboard focus, reduced motion).

**Division of labour:** `frontend-design` = *how to design well* (new UI, visual rethink) ·
`trinc-design` = *what to check in what exists* (report bundle, the two web pages, measured a11y
baseline). Neither replaces the other.

#### ⚠️ The collision that needed fixing

`frontend-design` names three looks it treats as **AI defaults to avoid**. This brand is **two of
them**:

> *(2) a near-black background with a single bright accent* · *(3) …zero border-radius, and dense
> newspaper-like columns*

Verified against the live `index.html` (2026-07-29): background family `#0a0a0f`/`#12121a`/`#1e1e2a`,
single blue accent `#4a90d9` (hover `#5da0e9`), **0 occurrences of `border-radius`**, **0 gradients**,
two type roles via `--font-body` / `--font-data`. That is defaults #2 and #3 combined.

Invoked without context, `frontend-design` would read the brand identity as a templated default and
revise it away. **It resolves itself if given the brief** — its own rule is *"Where the brief pins
down a visual direction, follow it exactly — the brief's own words always win, including when it
asks for one of these looks."*

**Fix applied:** `trinc-design:web-surface` now states the aesthetic as an explicit **pinned brief**
with the measured token table, and warns about the two-default collision, so the skills compose
instead of fighting. No change to `frontend-design` itself.

### ⚖️ `bio-research` — SPLIT VERDICT: keep the servers, do not use the skills (2026-07-29)

The only plugin whose domain touches the research engine, and the only one where keep-vs-drop
splits down the middle. Recording it because a naive future reading goes wrong in **both**
directions — uninstalling loses Wiley/BioRender, following its skills overstates capability.

#### 🔴 Skills — DO NOT USE (4 of 6 assume capability this business lacks)

| Skill | Assumes |
|---|---|
| `nextflow-development` | running nf-core `rnaseq`/`sarek`/`atacseq` on **sequencing data** |
| `instrument-data-to-allotrope` | **lab instrument** output files to convert (PDF/CSV/Excel → ASM) |
| `scvi-tools` | **single-cell** datasets for deep-learning integration |
| `single-cell-rna-qc` | single-cell `.h5ad` / `.h5` files to QC |

**There is no wet lab, no instruments, and no sequencing here.** This is a desk-research business
over public biomedical databases. Following any of these produces work implying in-house capability
that does not exist — for a company selling citation-traced biomedical rigor, that is the failure
mode it sells against.

They remain usable *only* as reference against public data (GEO/SRA), and even then must never
imply in-house sequencing, instruments, or sample handling. `scientific-problem-selection` and
`start` are generic and marginal.

#### ✅ Servers — KEEP, because four of them exist nowhere else

Verified against `config/connector-registry.json`:

| bio-research server | Registry entry | Surface | Verdict |
|---|---|---|---|
| `pubmed` | `pubmed` | `subprocess-mcp` | duplicate of an engine adapter |
| `chembl` | `chembl` | `subprocess-mcp` | duplicate |
| `c-trials` | `clinicaltrials-gov` | `subprocess-mcp` | duplicate |
| `ot` | `open-targets-graphql` | `subprocess-mcp` | duplicate |
| `owkin` | `owkin` | `subprocess-mcp` | duplicate |
| `biorxiv` | `biorxiv-medrxiv` | `claude-host-mcp` | registered, host-only either way |
| `consensus` | `consensus` | `claude-host-mcp` | registered, host-only either way |
| **`wiley`** | — | — | **not registered — only path to paywalled full text** |
| **`synapse`** | — | — | **not registered — only path** |
| **`biorender`** | — | — | **not registered — only path to figures** |
| `benchling` | — | — | not registered; lab platform, not needed |

**Uninstalling forfeits Wiley and BioRender** — the two ranked highest for authorization. That is
the whole reason this plugin stays.

The five duplicates stay **out of `config/tool-prefetch-map.json`**: the engine has its own
subprocess adapters, and double-registering would dilute the grounded-citation ratio the Phase-30
gate computes.

> **OAuth ranking corrected:** Owkin was previously listed among the four worth authorizing. It
> **duplicates an existing `subprocess-mcp` engine adapter**, so it ranks below the three that
> exist nowhere else. Revised order: **Wiley → BioRender → Synapse**, then Owkin only if the
> chat-side surface is genuinely wanted alongside the engine's.

### 🌉 Founder Lane bridge — `trinc-founder` v1.0.0 (2026-07-29) — 1 skill, 0 MCP servers

A concurrent session opened the **Founder Lane** (`01-brand-system/founder-lane-2026-07-29.md`,
296 lines, designed by an 11-agent workflow whose adversarial lenses returned **13 blocking
defects**). It adds medical-startup founders as a **second buyer**; the investor ladder is unchanged.
`trinc-founder:founder-fit` is the operating summary that bridges it to installed capability.

**The governing finding, theirs:** *the founder SKUs that are FUNDABLE and the ones that are
FULFILLABLE did not intersect.* Exactly **one** is transactable —
**Failed Trial Archaeology $14,950**, which runs as `clinical-trial-landscape`, sold against the
**Phase II** TABA line ($50,000) because it is 2.3× the **Phase I** cap ($6,500). The other four
(Trial Design Benchmark, Conference Synthesis, Plain-Language Patient Brief, Founder Patent
Landscape) are fundable but have **no engine path**. The Phase I tier stays closed.

**The timing inversion:** NIH **NOT-OD-26-075** requires the **vendor's name in the budget
justification**, so *the sale closes BEFORE the grant is submitted* — inverting all four existing
personas, which sell post-decision.

#### 🔴 What the bridge adds: the wet-lab boundary breaks under a founder buyer

The standing DO-NOT-USE rule on `bio-research`'s four lab skills was worded *"there is no wet lab
here."* **A founder buyer makes that reasoning misleading** — a biotech founder plausibly *does* have
FASTQs, instruments and single-cell data, so a session could conclude the skills now apply.

**They do not.** The boundary is not whether the *client* has a lab; it is what this business sells.
This is desk research over public databases — **not a CRO, not a bioinformatics provider**. Running a
founder's pipelines would carry no wet-lab QMS, no method validation, and would sit **entirely
outside the citation-integrity guarantee** the product rests on.

#### ✅ What DOES serve a founder — the concrete plugin-to-lane link

| `bio-research` server | Founder use | Status |
|---|---|---|
| **Wiley** | paywalled full text for prior-work sections | OAuth — **authorize 1st** |
| **BioRender** | figures for the SBIR/STTR application itself | OAuth — **authorize 2nd** |
| Synapse | public dataset access | OAuth — 3rd |

This independently reinforces the authorize order already recorded, and gives BioRender a concrete
recurring use it previously lacked.

#### 🔬 LIVE VERIFICATION — tools CALLED, 2026-07-29

The keep-verdict was tested by invoking the servers, not by reading config.

| Server | Result |
|---|---|
| `pubmed` | ✅ real PMIDs (42530074, 42512343), 2,870 hits |
| `chembl` | ✅ `CHEMBL810` temozolomide, approved 1999, full properties |
| `c-trials` | ✅ 275 TERMINATED glioblastoma trials, real NCT ids |
| `consensus` | ✅ works, but **capped at 3 results** without a free account |
| `biorxiv` | ✅ tool schemas present |
| `ot` | ⚠️ **`Rate limit exceeded for client: global`** — throttled at the shared-client level |
| **`wiley`** | ❌ **zero tools exposed** — unauthenticated |
| **`biorender`** | ❌ **zero tools exposed** — unauthenticated |
| **`synapse`** | ❌ **zero tools exposed** — unauthenticated |
| `benchling` | ❌ zero tools exposed |

**An unauthenticated server exposes no tools at all** — a ToolSearch for wiley/biorender/synapse
returns nothing.

#### ⚖️ What this does to the verdict

**The five that work all duplicate existing `subprocess-mcp` engine adapters**, so they add nothing
the engine does not already have. **The three that justify keeping the plugin contribute nothing
today**, because they are unauthenticated.

> **So KEEP stands as a bet on future OAuth, not as current value.** As of today this plugin adds
> **no capability** the stack lacks. If the operator does not intend to authorize
> Wiley → BioRender → Synapse, the correct action is to **drop it** — reinstalling later is trivial,
> it is a marketplace plugin. Do not describe bio-research as adding capability today.

#### Verified against the code, not taken on trust

`citation-extractor.js` recognizes exactly **seven** identifier types — PMID, PubChem CID, NCT,
UniProt, ChEMBL, DrugBank, DOI. **No patent pattern**, so patent findings are never extracted, never
grounded, never retraction-screened — **invisible** to the gate, neither raising nor lowering the
grade. The lane's claim is accurate, and the Zero-Fabrication Guarantee does not extend to patent
evidence. `patsnap` is registered (47 connectors) as `claude-host-mcp`, `adapter_status: missing`,
and stays out of prefetch.

Patent work is **designed, priced nowhere, and blocked twice**: legally (a non-attorney may sell a
search/landscape but not an FTO opinion — *Sperry v. Florida*; **Cal. Bus. & Prof. Code § 6125**;
the direct-to-company question is open and goes to California counsel) and technically (no engine
path).

### Replacement: `trinc-business` v1.0.0 — 3 skills, 0 MCP servers

Built from **verified** filing and pricing records, not from the plugins' generic text:

| Skill | Real content |
|---|---|
| **`compliance-calendar`** | Entity No. **B20260217250**, bizfile ref **B4657-4800**, certified copy **457169837** (2026-05-12); **$800 CA franchise tax due 2026-08-15** (Form 3522); **LLC-12** ($20) within 90 days of the 2026-06-18 approval; the AWS paid-listing gates (risk R1, the root email, closed 2026-10-21). |
| **`brand-check`** | The statutorily-required disclosure verbatim, with **Cal. Bus. & Prof. Code §17910.5(a)** and **Cal. Corp. Code §17701.08(e)** as the reason it is not optional; fixed tagline/elevator; and a standing instruction not to reproduce the three recorded overclaims. |
| **`offer-quote`** | Both price families and the documented mistake of crossing them — bespoke SKUs have real figures ($2,500–$24,950); the Trial Graveyard Feed's price is **`[DECIDE]`, not set**. Never invent one. |

**Operator remainder:** uninstall the nine dropped plugins in the Claude Desktop plugin UI
(`productivity`, `operations`, `marketing`, `data`, `design`, `product-management`, `sales`,
`bio-research`, `engineering`). Keep `vpai` and `pdf-viewer`. Nothing breaks either way — the
replacements are already installed and none of the dropped plugins' MCP servers is authorized.

---

## ✅ REPLACED — `trinc-engineering`, written for this stack (2026-07-28)

The upstream `engineering` plugin was dropped (below) because it was a generic template. It was
then **replaced by a purpose-built one**: `trinc-engineering@trinc-local` v1.0.0 at
`~/.claude/local-plugins/trinc-engineering/` — **3 skills, 0 MCP servers, ~630 always-on tokens**
(upstream: 10 shallow skills, 10 MCP servers, ~871 tokens).

| Skill | What it does that the generic one couldn't |
|---|---|
| **`invariant-check`** | Runs this repo's *actual* gates (`lint-transport-monorepo.sh --strict`, `npm test` @ 1013 baseline, `globals:lint`, `audit:connectors`, `secrets:verify`, the phase verifies, both bridge `lint:transport`) then checks the rules no gate can see — HTTPS-only with no plaintext fallback, restricted globals in `openclaw-bridge/`, the 0.75 citation floor, the four frozen plugin IDs, the coordinated port map, never `--no-gpg-sign`. |
| **`deploy-surface`** | Where an artifact actually has to go, and the three ways a deploy silently fails here: TLS proxies run from a **staged copy** (`install-tls-proxies.sh`) so editing the repo file changes nothing; the live worker is **`shy-grass-fccd`**, not the folder name `openclaw-landing-deploy`; and both bridges die with Obsidian. |
| **`stack-decision`** | Records a decision — especially a *declined* one — where the machinery will collide with it, with the tombstone convention this repo already uses. Written because the expensive failure here is a good decision nobody wrote down, which a later session rediscovers as a gap and reverses. |

**Security is deliberately out of scope.** Every skill hands security work to
**`security-orchestration`**, which keeps read-only-recon-then-propose-only. `incident-response`
was cut for this reason, not merely trimmed.

**Roster decision, upstream → here:**

| Upstream skill | Verdict |
|---|---|
| `debug` | **cut — duplicate.** Local `~/.claude/skills/debug` is 187 lines + a `references/` playbook set; upstream was 95 generic lines and would name-collide. |
| `incident-response` | **cut — security.** Owned by `security-orchestration`; no on-call, no PagerDuty. |
| `standup` | **cut — inapplicable.** Team of one; `_continuity/CONTINUITY.md` is the standup. |
| `documentation` | **cut — generic.** No repo-specific value over Claude's native ability. |
| `system-design`, `tech-debt`, `testing-strategy`, `code-review` | **merged** into `invariant-check` (42/32/33/118 generic lines → one grounded skill). |
| `architecture` | **rewritten** as `stack-decision`. |
| `deploy-checklist` | **rewritten** as `deploy-surface`. |

**Verified:** every command the skills emit was executed here — transport lint ✓, `globals:lint`
exit 0 ✓, `audit:connectors` exit 0 ✓, `secrets:verify` exit 0 ✓, both bridge `lint:transport`
report OK ✓.

```bash
claude plugin details trinc-engineering    # Skills (3), MCP servers (0)
```

---

## ❌ SUPERSEDED — upstream `engineering` DROPPED entirely (2026-07-28)

> The sanitize-don't-guard work below was correct and its machinery is retained, but the plugin
> itself was then **dropped**. Once the operator saw what the skills actually were, the honest
> verdict was that they add nothing here. Evidence:
>
> - **Zero business references.** `grep -i` for trevor / robey / biomedical / citation / obsidian /
>   zettelkasten / openclaw across all ten skills returns **nothing**. It is a pure generic template;
>   the operator had assumed it was tailored.
> - **It duplicates a deeper local skill, and collides with its name.** `engineering:debug` is
>   95 lines; the local `~/.claude/skills/debug` is **187 lines with a `references/` playbook set**,
>   purpose-built for this stack. Same for `refactor`.
> - **Shallow where it is unique.** tech-debt 32 lines, testing-strategy 33, system-design 42,
>   documentation 49 — and its genuinely distinct skills (standup, deploy-checklist,
>   incident-response) assume Jira / Slack / PagerDuty / CI, none of which exist here.
> - **It was not free.** ~871 tokens always-on in every session.
>
> **Actions taken:** the sanitized build was uninstalled (`claude plugin uninstall engineering`).
> The package and the `trinc-local` marketplace remain **on disk** at
> `~/.claude/local-plugins/`, so reinstating it is one command
> (`claude plugin install engineering@trinc-local`). The operator still uninstalls the upstream
> marketplace copy via the Claude Desktop plugin UI.
>
> **Retained deliberately:** the `permissions.deny` rules at both scopes and the gate-shadow audit
> check. They no longer guard this plugin — they guard the **next** one.

---

## ✅ SANITIZE, DON'T GUARD — the pattern (from the `engineering` case, 2026-07-28)

**The problem was framed wrong for several rounds.** The question kept being treated as *"how do we
contain the plugin's insecure GitHub server?"* — producing deny rules, audit checks, and a rejected
network block. The right question was *"why is that server here at all?"*

**It isn't needed. None of the ten engineering skills reference any MCP tool** — they use only
`~~placeholder` categories (`~~source control` ×4, `~~project tracker` ×4, `~~monitoring` ×3,
`~~knowledge base`, `~~chat`, `~~incident management`), every one already resolved by this file. The
plugin's entire 10-server MCP surface is dead weight in this deployment: no Slack, no Jira, no
Datadog, no PagerDuty, and a **local-only git repo with no remote**, so even a *working* GitHub
server would do little.

**So the server was removed rather than guarded.** A sanitized local build now lives at
`~/.claude/local-plugins/engineering/`, served by a local marketplace `trinc-local`:

| | Upstream `engineering@…-official` | `engineering@trinc-local` |
|---|---|---|
| Skills | 10 | **10 — byte-identical (`diff -r` clean)** |
| MCP servers | 10, incl. ungated `github` | **0** |
| Version | 1.2.0 | 1.2.0-trinc.1 |

Verified by `claude plugin details engineering`: **`Skills (10) … MCP servers (0)`**. The only
difference from upstream is the deleted `.mcp.json` — `diff` of the package shows exactly one
removed file and no content drift.

```bash
claude plugin details engineering      # must report: Skills (10), MCP servers (0)
```

**Remaining operator step:** uninstall the marketplace `engineering` plugin from the Claude Desktop
plugin UI. Until then both exist — harmless (the sanitized build has no MCP surface, and the
upstream server stays unauthenticated *and* denied at two scopes), but the duplicate should go.

The deny rules and the gate-shadow audit below stay in place regardless: they are what catches this
class of problem **next time**, for a plugin nobody has sanitized yet.

---

## 🔒 GitHub: why the plugin's server can't be redirected, and what was done (2026-07-28)

**The question:** can the `engineering` plugin use the YubiKey-gated host GitHub MCP instead of the
one it ships?

**The answer: no, and the reason is structural.** Plugin MCP servers are namespaced
`mcp__plugin_<plugin>_<server>__*`; host servers are `mcp__<server>__*`. A host server **never
shadows** a same-named plugin server — they coexist as two separate surfaces. There is no alias,
redirect, or override. And the plugin's `.mcp.json` can't simply be edited: the package is
session-scoped and cloud-synced (same reason these bindings are repo-owned).

**What the two paths actually are:**

| | Host `github` | Plugin `engineering/github` |
|---|---|---|
| Transport | stdio → `github-mcp-keychain-wrapper.sh` | HTTP → `api.githubcopilot.com/mcp/` |
| Credential | PAT sealed as `pat.gpg` to the YubiKey OpenPGP applet | OAuth grant |
| Per-use ceremony | **PIN + physical touch** on every unseal | none |
| Default state | **fail-closed** — refuses without a deliberate `arm`; never calls gpg | connects once authorized |
| Scope | `--read-only` server **and** a read-only fine-grained PAT | whatever the OAuth grant carries |
| Tamper-evidence | requires VALIDSIG from the operator's own key | none |
| Monitoring | Falcon "Mac – GitHub Comms Hardening" FIMs the wrapper + binary | none |

`claude mcp list` reporting host `github` as `✘ Failed to connect` is that gate **working** — the
wrapper is fail-closed and refuses until armed.

**What was done instead — four layers:**

1. **Leave it unauthenticated.** An unauthorized MCP server is inert; Claude Code never contacts it.
2. **Deny its tools at the user scope** (`~/.claude/settings.json`), blocking it even if someone
   authorizes it later:
   ```json
   { "permissions": { "deny": ["mcp__plugin_engineering_github__*"] } }
   ```
3. **Deny it again at the repo scope** (`.claude/settings.json`). Deny rules are cumulative, and
   this copy is **version-controlled** — `~/.claude/settings.json` sits outside the repo, so no
   commit can protect it. A global settings reset cannot silently drop the containment.
4. **Audit both scopes.** `audit-connector-coverage.js` flags any plugin shipping a **reachable**
   MCP server whose name collides with a host-registered one, reports which scopes carry the deny,
   and nags if only the user-global copy exists. Negative-tested three ways: removing the repo copy
   drops it to `1 scope(s)` plus an advisory; removing both flips it to `⚠ GATE SHADOW UNCONTAINED`.

**Rejected, with reasons** — so these are not re-litigated later:

| Candidate | Verdict |
|---|---|
| Point the plugin at the host server | **Impossible** — separate namespaces, no alias/override mechanism |
| Edit the plugin's `.mcp.json` | **Not durable** — package is session-scoped and cloud-synced |
| Block `api.githubcopilot.com` at the network layer | **Disproportionate** — resolves via `glb-…github.com` → `140.82.113.22`, GitHub's shared load balancer; would risk collateral damage to other GitHub services and to VS Code Copilot, to contain a server already inert and denied |
| Uninstall the engineering plugin | **Rejected** — costs all ten skills, which are the plugin's actual value |
| Extend the PreToolUse session-gate hook | **Available, proposed not applied** — see below |

**Open proposal — the PreToolUse sub-agent bar.** `~/Security Everything/session-gate/hook/pretooluse-gate.py`
already bars sub-agents from `zoho-mail`/`zoho-trinc` with a rationale that fits this case exactly:
*"NO in-process YubiKey gate (remote OAuth connector), so barring sub-agents is the PRIMARY control
here."* Adding `mcp__plugin_engineering_github__` to `MATCHER` plus the sub-agent policy path would
give a fourth layer in a **different mechanism, owned by a different file**, surviving removal of
both deny rules. It is not applied because (a) it touches security-critical infrastructure that this
stack keeps strictly propose-only, (b) `MATCHER` must stay in lockstep with `scope_for()` and be
re-installed via `bin/install-hook` with `--self-check` passing, and (c) its marginal gain is narrow —
it only matters if both deny rules are removed *and* the server is authorized. Operator's call.

**Nothing is lost.** This monorepo is local-only with **no git remote**, so a GitHub MCP does little
here regardless; the engineering plugin's value is its *skills*, which need no MCP server at all.
Real GitHub work goes through the host wrapper, gated.

> **Inert placeholders, not findings.** Seven further name-collisions exist (`gmail`,
> `google calendar` across most plugins) but every one is declared `{"type":"http","url":""}` — an
> unfilled template placeholder that cannot connect. The audit counts them quietly rather than
> raising seven false alarms. If a plugin update ever fills one in, it becomes reachable and the
> check escalates it.
