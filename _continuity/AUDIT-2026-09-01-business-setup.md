# Business setup audit — 2026-09-01

> One organized picture of where the Trevor Robey, INC. stack and business stand as of
> **2026-09-01**, built from live probes, git, the continuity board, the 08-20 and 08-21
> handoffs, project memory, the `perseus-business` vault, and the Claude "TR-INC Biz" session
> group. Every claim below names its evidence. "Unverified" means exactly that — not "done".
>
> **Start with §6 (the prioritized plan).** Everything else is the evidence behind it.

- Repo: `/Users/myhome/TrevClaw-Obsidianodus` · branch `main` · HEAD before this session `5765310`
- Predecessor handoff: `/Users/myhome/.claude/handoffs/20260821T114320Z__confident-varahamihira-8e2a58__openclaw-engine-restoration-agent-surface.md`
  (note: `~/.claude/handoffs/LATEST.md` is now the **08-31 security** handoff, not this one)
- Companion: `/Users/myhome/.claude/handoffs/20260820T102849Z__TrevClaw-Obsidianodus__google-workspace-aws-setup.md`

---

## 1 · Since the 08-21 handoff (d5a6399 → 5765310)

Seven signed commits landed on `main` between the handoff and this audit:

| Commit | What |
|---|---|
| `3fdfd16` → `5fdcdc2` → `1a0a024` | `scholar-sidekick` MCP joined the workspace, then **retired everywhere** after its key leaked into a transcript (08-27); registry tombstone + agent guidance repointed |
| `73624bf` | Raycast video + AI summarize dispatch Super-Summarize first, legacy fallback |
| `4820c0f` | Video pipeline sweeps orphaned Copilot contract notes at end of run |
| `e257878` | Stdio proxy retries `tools/list` past the bridge bind window; summary frontmatter normalized |
| `5765310` | Proxy pinned to canonical nvm node (homebrew node dyld-broken); CA path via homedir |

Board entries 08-27/08-28 record Viz Studio growing to **12 tools** (`viz_diagram`, `viz_stat_tiles`,
`viz_mockup`, `viz_interactive`) and 08-29 the video-pipeline one-note invariant.

**What the audit found uncommitted (now resolved — §2):**
- **`Claude/obsidian-viz-studio/` — the whole plugin source (46 files) was never added to git**, despite
  being deployed live on `:8800` since 2026-08-16 and appearing as "shipped" in four board entries.
- `Claude/obsidian-copilot-terminal-relay/` (the type-only term-bridge replacement) — untracked.
- The ACP-MCP wiring (`acpMcpServers.{ts,test.ts}`, `catalog.test.ts`) flagged in the handoff as
  "another session's in-flight work" — tests pass 23/23; committed.
- The AGENTS.md refresh (root, `Claude/`, `Copilot-Everything/`) — committed.
- **Deploy staging mirror lagged the live build**: `deploy/obsidian/plugins/copilot/main.js` was the
  08-18 build (`42f3dc22…`) while the vault ran the 08-27 build (`80171157…`). Re-synced + committed.
- Doc drift: root `CLAUDE.md`, `Claude/CLAUDE.md`, and the vault `AGENTS.md` still said 7/8 viz tools
  and "4 + 6" Copilot tool ids; corrected to 12 / "23 + 12".

**The handoff's three undecided items, as of today:**

| Item | Status |
|---|---|
| Commit the AGENTS.md doc refresh | ✅ done this session (§2, commit 3) |
| Finish or drop the `viz-bridge-mcp` consumer | ❌ **still zero consumers** — `grep vizBridge openclaw-bridge/` finds only the registration; the adapter grew to 12 tools (08-28) but no deliverable renderer calls it |
| Expose `obsidian_openclaw_*` in the stdio adapter for Claude Code / Raycast | ❌ not done — `grep obsidian_openclaw bridges/obsidian-stdio-adapter/` = 0 hits (Raycast profile carries video tools only) |

---

## 2 · Commits made this session (all YubiKey-signed, `sig=G`)

| # | Hash | Scope |
|---|---|---|
| 1 | `10f6dcd` | **copilot fork:** ACP sessions receive `command-center` + `viz-studio` as per-session MCP servers (`acpMcpServers.ts` + `mcp/http` capability gate), 4 new viz catalog entries (45 total), deploy scripts stage `openclaw-stdio-proxy.mjs`, `lib.sh` → v4 fork, `sync-upstream.sh` flagged STALE, deploy mirror re-synced to the live 08-27 build, `OPENCODE-AGENT-HANDOFF.md` |
| 2 | `ad31f56` | **viz-studio:** the `trinc-viz-studio` plugin source (46 files) + `obsidian-copilot-terminal-relay`; engine `viz-bridge-mcp` adapter exposes the 12-tool surface (12/12 tests); doc counts corrected |
| 3 | *(this commit)* | **docs:** AGENTS.md refresh ×3, `business-identity-map.md` franchise-tax annotation, this audit, board entry |

**Deliberately NOT committed** (operator call — both are deletions):
- `_probe.js` … `_probe5.js` at the repo root — Aug-12 scratch scripts (engine doc probes). Delete.
- `.claude/worktrees/priceless-tesla-c90ab5/` — a clean, detached worktree parked at `3fdfd16`, the
  commit that ADDED `scholar-sidekick`; its `.mcp.json` is the **only on-disk registration of the
  retired server left on this machine** and the likely reason it still shows as a "connecting" server
  in Desktop Code sessions. `git worktree remove` it.

Tree after commit 3: only the five `_probe*.js` remain.

---

## 3 · Copilot Agent Chat ⇄ research engine — verified from live state

| Check | Method | Result |
|---|---|---|
| Bridges listening | `lsof -iTCP:8798,8799,8800 -sTCP:LISTEN` | ✅ all three (Obsidian pid 986 owns :8799/:8800; node 1012 owns :8798) |
| :8799 tool surface | `python3 urllib` GET `/healthz` + bearer | ✅ **30 tools**, names identical to the vault `AGENTS.md` list (7 vault + 14 `obsidian_openclaw_*` + 7 `zk_*` + 2 `video_pipeline_*`) |
| :8800 tool surface | same | ✅ **12 `viz_*`** |
| :8798 | `/healthz` | ✅ ok — REST surface, no `tools/list`; deliberately NOT attached to ACP sessions |
| Vault `copilot/main.js` == fork build | sha256 | ✅ `80171157…` both (mtime 08-27 19:51) |
| Vault `command-center/main.js` == repo build | sha256 | ✅ `ddfbd231…` both (unchanged since handoff) |
| Vault has `openclaw-stdio-proxy.mjs` | `ls` | ✅ present (Sep 1 05:39, executable) |
| Quick-Chat lane config (`copilot/data.json`, read-only) | structure only | `command-center` 23 enabled (the 14 engine + 7 zk + 2 video; vault tools come via `local-obsidian-mcp` 8) · `viz-studio` 12 · `local-obsidian-mcp` 8 |
| ACP lane wiring | `acpMcpServers.test.ts` + `catalog.test.ts` | ✅ 23/23; `ACP_MCP_CAPABLE_SERVER_IDS = {command-center, viz-studio}`; servers attach per session, never to opencode's global config |
| Fork catalog | `grep -c toolName:` | 45 entries; `catalog.test.ts` green |
| Vault `AGENTS.md` role file | read | said "8 viz tools" → **corrected to 12 today** (vault file, outside the repo) |
| Engine test suite | `npm test` | ✅ **1070 / 1070 / 0 fail** (handoff: 1068) |
| HTTPS-only transport lint | `scripts/lint-transport-monorepo.sh --strict` | ✅ 0 violations |
| Connector audit | `node scripts/audit-connector-coverage.js` | ✅ 17 bound · 0 unbound-drift · 6 unbound-by-design · 13 plugins bound, 0 ⚠ · 3 tombstones (`scrape`, `tavily`, `scholar-sidekick`) |
| **End-to-end gated smoke run** | — | ❌ **NOT RUN.** Still the only unproven link. No successful real run since **2026-07-31**; the Research Memory ingest lane has **never fired** (Qdrant collection `trevorobeyinc-packs` not checked this session — treat as absent until a run creates it) |

**Verdict:** the integration is wired, deployed, hash-verified and component-tested on both lanes
(Quick-Chat + Agent Mode). What is missing is one gated real run through the chat to prove the chain
`run_workflow → status → vault notes → Miyo → Zettelkasten → Research Memory → research_arrived`.

---

## 4 · MCP servers + plugins

**Registrations (structure only, no secrets read):**

| File | Servers |
|---|---|
| repo `.mcp.json` | `opencode`, `perseus-business`, `searxng-search` |
| `~/.claude.json` (CLI + Desktop Code) | `alphaxiv`, `courtlistener`, `falcon`, `firewalla`, `github`, `gmail`, `opencode`, `perseus-vault`, `phone-gate`, `searxng-search`, `sudo-gate`, `zoho-trinc` |
| `claude_desktop_config.json` (Chat + Cowork) | `FilesystemPlus`, `miyo`, `opencode`, `perseus-business`, `perseus-vault`, `searxng-search` |

Findings:
- **`scholar-sidekick` is correctly absent from all three registries** (matches the 08-27 retirement).
  Its only remaining on-disk registration is the stale worktree's `.mcp.json` (§2) — remove the
  worktree, then confirm it no longer appears in a fresh session's server list. The
  `trinc-bioresearch/ad-hoc-research` skill still mentions it — verify the wording is the tombstone
  ("never call"), not a live instruction.
- **`github` MCP failed to connect at session start** (`CONNECTION_CLOSED`). Expected: it is
  user-initiated (`gh` gate), not auto-armed. Not a fault.
- **Needs OAuth (operator-only):** `alphaxiv`, `courtlistener`, `bio-research:{biorender, owkin,
  synapse, wiley}`, `data:{amplitude, amplitude-eu, atlassian, bigquery, definite, hex}`. Recorded
  decisions stand: authorize **BioRender only**; Synapse conditional; Wiley/Owkin do-not-authorize;
  `data:*` unbound by design (no warehouse) — leave unauthorized.
- **`zoho-trinc`** still registered although Zoho became archive-only on 07-22. Keep until the Zoho
  Mail Lite downgrade decision, then retire it.
- **`gmail`** (local gated stdio, `~/.claude/mcp/gmail-mcp-launch.sh`) — which Google identity it is
  bound to (personal vs `trevor@`) was **not verified** this session.
- Plugins: 13 bound / 0 ⚠ (audit); `trinc-local` marketplace 9 plugins / 22 skills; Obsidian
  `community-plugins.json` enables all five suite plugins (`command-center`, `vault-zettelkasten`,
  `obsidian-bridge-launcher`, `contextual-wiki-definitions`, `trinc-viz-studio`) + `copilot`.
- Perseus: both vaults answer; `perseus-business` returned 14 relevant entities for the audit query.

---

## 5 · Go-to-market status

### 5a · Google Workspace — LIVE; what "up and running" still needs is hygiene, not build-out

**Live (verified in the 07-22/23 sessions, recorded in `03-platforms/google-workspace/`):**
super-admin `trevor@trevorobeyinc.com`; domain verified; Gmail is the primary host (MX →
`smtp.google.com`, SPF dual-include, DKIM signing ON, DMARC `p=none`); 1,251/1,251 messages migrated
from Zoho; 12 filters / 11 labels (`gmail-filters.xml`); send-as ×3 (`trevor@`, `aws@`, `support@`);
2SV enforced with both YubiKeys; Strayer→Gmail forwarding verified; statutory deadlines on Calendar;
`TRINC/` monorepo mirror moved onto the **business** Drive (08-19, xattr-verified).

**Open — all operator-side:**

| Item | Why it matters | Source |
|---|---|---|
| Business Starter **trial ended ~08-05** — is the paid plan active? | mailbox continuity | `google-workspace.md` §1 — **unverified** |
| **AWS root email is still `Trevor.Robey@my.strayer.edu`** (risk R1, HIGH) | listing outcomes + payout failures route to a school address that ends at graduation | `business-identity-map.md`; vault `aws-root-email-is-still-the-strayer-edu-address` |
| Zoho Mail Lite downgrade (~$1/mo) | safe since migration verified | 08-20 handoff |
| SPF tighten to Google-only; remove `zoho._domainkey`; DMARC `p=none` → `quarantine` | the "2 clean weeks" wait elapsed in early August | `google-workspace.md` §4 |
| Revoke the one-time Entri↔Cloudflare OAuth grant | hygiene; scoped token covers all DNS work | same |
| GAM7 install (2 OAuth screens) | optional — makes Workspace admin scriptable | `setup-runbook.md` §4.2 |
| `workspace-operations.md:53` — "India PE notice pending" (AWS/Tax row) | tax-class item that gets buried | flag only |

### 5b · AWS Marketplace / Data Exchange — cleared for PAID since 07-22; zero products published

**Ready to publish (`workspace/aws-marketplace-listing/trial-graveyard-feed/`):** Trial Graveyard Feed —
6 therapeutic areas, **1,921 paid rows, every TA census-complete (07-30)**, 5-row free samples,
`product-description.md`, `offers.md`, `UPLOAD-RUNBOOK.md`, data dictionary. Blockers, both operator:
1. **Price `[DECIDE]`** — never invented in-repo; `offers.md` argues for LOW to win the first transactions.
2. **DSA** — the custom DSA is stamped "do not publish until counsel has reviewed"; **AWS StandardDSA
   removes that dependency**. Refund policy is DRAFT.

The **free** offer needs neither — it can publish today and creates the first ADX transaction record.

**Second package:** Pharmacovigilance Sample Pack (free) — `MANIFEST.md` still says "ready when
qualification arrives" (last prepared 05-06; qualification is long done). The 07-23 blockers (MD→PDF
conversion, MANIFEST byte/file-count mismatch) are **unverified** as resolved.

**Account hygiene:** the AWS "Legal business name" field still reads the wordmark — the fix needs the
**EIN** + stamped Articles via a Support case (`ein-confirmation.md`).

**New-product candidates — grounded in what is already built (all prices = operator decisions):**

| Candidate | Why it's cheap | What's missing |
|---|---|---|
| **More indications for the Graveyard Feed** (NSCLC, breast, prostate, MASH/NASH, Parkinson's, MS…) | one `--condition` run each; the runbook says growth is by indication, not depth | run + new revision |
| **All-TA bundle** as a private offer | assets exist | offer config |
| **Trial Design Benchmark Register** (2nd ADX data product) | the CT.gov design-cohort fetcher shipped 07-30 for the $4,950 SKU — deterministic design tables per indication | a `build-*.js` mirroring `build-graveyard-feed.js` + data dictionary |
| **Protocol Amendment-Risk index** | change-history version counts are already computed for the memo | packaging as a column set / product |
| **Parquet tier** for paid subscribers | runbook item #3 | CSV→Parquet step, schema byte-identical |
| **Monthly refresh cadence** | makes the "refreshed monthly" claim true | launchd job or a dated monthly runbook step |

### 5c · Branding + marketing — the canon exists; the collateral is inverted toward the demoted SKU

**Exists:** `01-brand-system/` (brand-identity 07-29, brand-system, founder-lane spec, logos,
typography, color tokens, marketplace visuals, landing-page assets, google-business-profile dir,
personal-brand.md); `workspace/collateral/` (catalog — **now carries the current ladder**: $9,950 /
$14,950 / $19,950 present and both primary SKUs named, so the 07-29 "retired ladder" defect reads as
fixed by the 07-30 edit; one-pagers; samples; teasers; platform guides); `07-outbound/` (templates,
9-touch cadence, personas, triage); `workspace/collateral/landing-page/{index,intake}.html` (intake
gained the Trial Design Benchmark option 07-30, browser-verified).

**Gaps (each with where to fix it):**

| Gap | Where | Owner |
|---|---|---|
| **Primary SKU (Investor Pre-Mortem) and Failed Trial Archaeology have NO one-pager and NO sample**; only pharmacovigilance + target-validation do | `workspace/collateral/{one-pagers,samples}/` | Claude drafts from a shipped bundle in `workspace/releases/`, then `/brand-check` + `/deliverable-preflight` |
| Landing-copy deploy to worker `shy-grass-fccd` awaiting operator go since July; **deploy source location unconfirmed post-wipe** (`~/openclaw-landing-deploy` was on the wiped Mac) | `workspace/collateral/landing-page/` | operator (go + confirm source) |
| **NDA template names a non-existent entity** — line 35 `Trevor Robey Inc. d/b/a OpenClaw Research Intelligence` | `workspace/legal/nda-mutual-template.md:35` | Claude — must fix before any NDA goes out |
| "Refund-backed citation-audit SLA" advertised; refund policy is a placeholder | `OFFERINGS.md:33` vs `08-contracts-legal/` | operator/counsel |
| Outbound flags: "We do not generate AI content"; "I operate OpenClaw"; "1.0 confidence"; "AEMS"→"FAERS" typo | `07-outbound/cold-email-templates/` | Claude (soften/correct), operator approves |
| Doc drift: Playbook `:7` "Zero hallucinations" (retired wording); `REVENUE_PLAYBOOK.md:150` "any topic"; the Playbook tidy-up spec is ready | Playbook + `REVENUE_PLAYBOOK.md` | Claude (spec exists on the board) |
| Legal scaffolding is empty: `08-contracts-legal` **0/15**, `15-first-sale-risk-mitigation` **0/10**, `14-due-diligence-checklist` 1/5, `09-source-licenses` 4/11 (measured today) | those dirs | operator/counsel; Claude can draft |
| E1 citation-overclaim sweep: 10 `03-platforms/` dirs still unswept | board "Active workstreams" | Claude |
| Google Business Profile: a cover photo exists, no documented owning account | `01-brand-system/google-business-profile/` | operator |

### 5d · Compliance (operator-only; dates from `certificate-of-formation.md`, the file wins)

| Obligation | Status |
|---|---|
| **$800 CA Franchise Tax (FTB Form 3522) — due 2026-08-15** | **PAST DUE and UNVERIFIED** — no payment record anywhere in-repo (checked 08-20 and again today). Unverified ≠ unpaid; penalty + interest accrue if unpaid. |
| **Statement of Information (Form LLC-12, $20) — due within 90 days of 2026-06-18 ≈ 2026-09-16** | **15 days out.** Not filed as far as the repo knows. |
| IRS EIN | Not applied for. Gates the business bank account and the AWS legal-entity field. Free, instant. |
| Business bank account · Operating Agreement | Not started (`certificate-of-formation.md` next steps 7, 9). |

---

## 6 · Prioritized build-out plan

Owner key: **OP** = only the operator can do it · **CL** = Claude can do it on "go" · **CL→OP** = Claude prepares, operator executes/approves.

### P0 — this week (statutory clocks + the one unproven link)

| # | Action | Owner | Blocker |
|---|---|---|---|
| 1 | **File the Statement of Information** (LLC-12, $20) — due ≈ **09-16** | OP | none — Claude can pre-fill every field value from `compliance-calendar` |
| 2 | **Confirm the $800 franchise tax was paid; pay if not** (past due 08-15) | OP | none |
| 3 | **Apply for the EIN** (irs.gov, ~15 min) → save CP 575 into `ein-confirmation.md` | OP | none |
| 4 | **Gated smoke run**: arm `operator-approve-gate`, then in Copilot Agent Chat run `trial-design-benchmark` for one indication (e.g. NSCLC); assert the full chain and read `citation_integrity` for the verdict | OP arms · CL/agent watches | one YubiKey touch; 300 s one-shot |
| 5 | **Publish the FREE Graveyard Feed offer** (no price, no DSA gate) — first ADX transaction record | OP (AWS mutations are operator-only) | none |
| 6 | **Decide the paid-feed price + choose StandardDSA** → publish the paid offer | OP decides · CL fills `offers.md` | the two decisions |

### P1 — next two weeks (identity + trust surfaces before any buyer contact)

| # | Action | Owner | Blocker |
|---|---|---|---|
| 7 | **AWS root email → `aws@`** — as a Workspace **Group** (independently recoverable), not an alias | OP (root + MFA) | alias-vs-Group choice |
| 8 | Workspace hygiene: confirm paid plan; Zoho downgrade; SPF Google-only; DMARC `quarantine`; revoke Entri grant | CL proposes per-item (`cic` arm) · OP go | cic-gate arm |
| 9 | **Fix the NDA entity name** (`nda-mutual-template.md:35`, `:23`) to the entity of record | CL | none |
| 10 | Draft the **refund policy** behind the "refund-backed SLA" (counsel reviews) | CL→OP/counsel | counsel |
| 11 | **Investor Pre-Mortem + Failed Trial Archaeology one-pagers + one sample**, from a shipped `workspace/releases/` bundle; `/brand-check` + `/deliverable-preflight` | CL→OP | none |
| 12 | Correct the four outbound-template flags; apply the `REVENUE_PLAYBOOK` tidy-up spec; retire "Zero hallucinations" at Playbook `:7` | CL | none |
| 13 | Landing-copy deploy — confirm where `trevorobeyinc.com` deploys from, then deploy to `shy-grass-fccd` | OP | deploy-source location |
| 14 | Housekeeping: `git worktree remove .claude/worktrees/priceless-tesla-c90ab5`; delete `_probe*.js`; cut a fresh `git bundle --all` (HEAD is now 3 commits past the 08-17 bundle + 7 earlier) | OP go · CL runs | deletions need a go |

### P2 — product expansion (after the first ADX transaction exists)

| # | Action | Owner |
|---|---|---|
| 15 | Add 4–6 indications to the Graveyard Feed (census fetch per `--condition`) + an all-TA bundle private offer | CL builds · OP prices |
| 16 | **Trial Design Benchmark Register** as the 2nd ADX data product (build script mirroring `build-graveyard-feed.js`) | CL builds · OP prices |
| 17 | Parquet tier + monthly-refresh cadence (launchd or dated runbook step) | CL |
| 18 | Decide: expose `obsidian_openclaw_*` engine tools in the stdio adapter (`raycast` / `claude` profiles) so Claude Code + Raycast can drive the engine | OP decides · CL wires |
| 19 | Decide: wire `viz-bridge-mcp` into deliverable renderers (e.g. citation-integrity grade as a stat tile; graveyard memo chart) — or drop the registration | OP decides · CL |

### P3 — first-sale hardening

| # | Action | Owner |
|---|---|---|
| 20 | Fill `15-first-sale-risk-mitigation/` + `08-contracts-legal/` (contract structure, indemnification, E&O + cyber quotes) | OP/counsel · CL drafts |
| 21 | Counsel questions parked: ChEMBL share-alike; CA non-attorney FTO search (patent brief stays off-ladder) | OP |
| 22 | Expert network pick (Guidepoint **or** Third Bridge) — only on the first $19,950 deal | OP |
| 23 | Authorize **BioRender** (claude.ai connector settings); leave the rest | OP |
| 24 | E1 sweep of the 10 remaining `03-platforms/` dirs; document Google Business Profile ownership | CL · OP |

---

## 7 · Open questions (operator)

1. Was the $800 franchise tax paid on/before 08-15? (No record in-repo.)
2. Is the Workspace paid plan active post-trial?
3. Graveyard Feed paid price? StandardDSA vs custom DSA?
4. AWS root email target: `aws@` Group (recommended) or alias?
5. Keep `zoho-trinc` MCP registered after the Zoho downgrade?
6. OK to remove the stale `priceless-tesla` worktree and the five `_probe*.js`?
7. `viz-bridge-mcp`: finish the consumer or drop the registration?
8. Expose engine tools to Raycast / Claude Code via the stdio adapter?

---

## 8 · Method notes (so the next auditor can repeat this)

- **TR-INC Biz session group** (7 sessions; 6 business + 1 archived personal): *Google Workspace
  setup check* (08-20 → produced the Workspace/AWS handoff), *Move TRINC folder from Google Drive*
  (08-19, done + xattr-verified), *Adisinsight MCP connector setup* (08-12 — declined, recorded: no
  public API), *Business plugin configuration* (08-12 — plugin weave, closed), *TR-INC launch* (08-12
  — produced the identity map, risk R1, and the order "publish first paid listing → EIN → …"), *Miyo
  indexing and wiki link creation* (08-12 — vault side; calendar deadlines created). Their `local_*`
  ids do not resolve to JSONL files under `~/.claude/projects` (only 07-26 sidecar backups exist), so
  the transcripts were mined through `search_session_transcripts`. Every open item they surface is in §6.
- Live probes used `python3 urllib` against `/healthz` with the bearer token from
  `~/.config/openclaw-command-center/bridge-token` — no `curl`, per the download-hygiene convention.
- Nothing under `.obsidian/plugins/` or `copilot/data.json` was written (Obsidian was running);
  `data.json` was read for structure only. The vault `AGENTS.md` (a note, not a plugin file) was edited.
