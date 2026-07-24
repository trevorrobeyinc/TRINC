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
| `~~knowledge base` | Obsidian vault `My Digital Garden` via the `:8798` bridge | vault |
| `~~email` | Gmail — `trevor@trevorobeyinc.com` | business |
| `~~calendar` · `~~office suite` | Google Calendar · Google Workspace | business |
| `~~data enrichment` | vpai (vibe-prospecting) — the only enrichment surface | business |
| `~~monitoring` | CrowdStrike Falcon (propose-only); optional Prometheus/Grafana | security |
| `~~source control` | local git, **no remote** (local-only since 2026-05-26) | infra |

**Connected but awaiting operator OAuth** — treat as unavailable until authorized:
`~~journal access` (Wiley) · `~~data repository` (Synapse) · `~~AI research` (Owkin) ·
`~~scientific illustration` (BioRender)

**Unbound — this business has none. Say so; do not invent.**

`~~chat` · `~~project tracker` · `~~ITSM` · `~~incident management` · `~~CI/CD` ·
`~~data warehouse` · `~~notebook` · `~~product analytics` · `~~user feedback` · `~~CRM` ·
`~~sales engagement` · `~~conversation intelligence` · `~~meeting transcription` · `~~design` ·
`~~design tool` · `~~SEO` · `~~marketing analytics` · `~~marketing automation` ·
`~~email marketing` · `~~procurement` · `~~lab platform` · `~~genomics platform`

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
- Open risk **R1**: the AWS root account email is still the operator's `.edu` address

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
- Verify every citation with `scholar-sidekick` (`verifyCitation`, `checkRetraction`) before it
  ships. A resolvable DOI paired with an invented title is the dominant fabrication pattern and
  `resolveIdentifier` alone will not catch it.

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
| `desktop-commander` v0.2.0 | Overlaps stack surfaces this repo already owns (terminal, vault, knowledge base) via the `:8798` bridge and `term-bridge`. Binding it would create a second, ungoverned path to the vault. |
| `cowork-plugin-management` v0.2.2 | Plugin-authoring tooling. Its `cowork-plugin-customizer` skill **cannot run on this surface** — it requires Cowork's `mnt/.local-plugins` mounts, absent in CLI Claude Code. That limitation is exactly why these bindings are repo-owned rather than stamped into the plugin packages. |

---

## Operator remainder

Roughly 30 plugin MCP servers are connected but **unauthenticated**. Their *skills* work today —
only the MCP servers need OAuth, which must be completed by the operator in claude.ai connector
settings or via `/mcp` in an interactive session. Claude cannot run those flows non-interactively.

Worth authorizing first, in business-value order:

1. **Wiley** (`~~journal access`) — unlocks paywalled full text for deliverables
2. **BioRender** (`~~scientific illustration`) — figures for the $9,950+ reports
3. **Synapse** (`~~data repository`) and **Owkin** (`~~AI research`)

The rest (HubSpot, Snowflake, Figma, Jira, Slack, Amplitude, …) correspond to tools this business
does not use. **Leave them unauthenticated** — that is the correct end state, not a gap.
