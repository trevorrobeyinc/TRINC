# Trevor Robey, INC. — Shared Continuity Board

> **ONE living board, shared by all four Claude surfaces plus opencode.** This is the single
> source of truth for *what is being worked on right now* across the whole `TRINC`
> business stack. Every surface — **CLI Claude Code**, **Desktop Claude Code**, **Cowork**,
> **Claude Chat (Desktop)**, and **opencode** (via `~/.config/opencode/AGENTS.md`) — reads this
> file at the start of a session and appends to it when it makes meaningful progress or hands off.
>
> **Read this top-to-bottom before you touch anything.** How the system works, how each
> surface reaches this file, and the write-safety rules are in **[`README.md`](README.md)**.

- **Canonical path:** `/Users/myhome/TRINC/_continuity/CONTINUITY.md`
- **Repo-canonical, single file** — there is no mirror and no copy. All four surfaces edit *this* file on disk.
- **Business canon (do not duplicate here — point to it):** repo `CLAUDE.md`,
  `HOW-IT-WORKS.md` (the plain-language story) and `Trevor Robey Intelligence Network Citations/SYSTEM-REALITY.md`.

---

## 🧭 30-second protocol

1. **On start** → read **Current focus** + the top 3–5 **Log** entries. That is the live state.
2. **On meaningful progress or handoff** → **prepend** a Log entry (newest at top) using the
   template at the bottom. Keep it short and factual.
3. **Keep "Current focus" true to *now*** — update it (don't just append) so it always answers
   "what are we working on this minute?"
4. **Append, don't rewrite** other surfaces' Log entries. History is the point.
5. **Concurrency write caveat (updated 2026-07-26):** this file now lives on the **internal,
   FileVault-protected disk** — the old external-SSD hazards (disksleep `EPERM`, Chat-side writes
   wedging the Filesystem MCP) are gone. The remaining hazard is *four surfaces sharing one file*:
   **probe-first, prefer prepending one self-contained entry, verify-after** — full procedure in
   [`README.md`](README.md#write-safety-external-volume). If a surface is still reading this board
   from `/Volumes/ExtraCurricular`, it is on the **stale pre-migration copy** — repoint it.

> **Scope gate — business only:** write to this board **only when the work relates to the Trevor
> Robey, INC. business** — the citation engine, offerings/revenue/brand/legal, or this repo's own
> infra/topology (the `:8798` bridge, the vault, connectors, plugins). Unrelated work (home
> network, Security Everything, personal) belongs elsewhere, **not here.**

---

## 🖥️ Surfaces sharing this board

| Surface | How it reaches this file | Auto-discovers the board via |
|---|---|---|
| **CLI Claude Code** (`claude` in Terminal) | direct filesystem | repo `CLAUDE.md` pointer + repo skill `continuity-board` |
| **Desktop Claude Code** (Desktop Code tab) | direct filesystem (Filesystem MCP) | repo `CLAUDE.md` pointer + repo skill `continuity-board` |
| **Cowork** | direct filesystem | repo `CLAUDE.md` board pointer (top of file) |
| **Claude Chat (Desktop app)** | direct filesystem — Filesystem MCP connector, allowed roots `/Users/myhome` + `/Volumes/ExtraCurricular` | user points it here; see `README.md` |
| **opencode** (app + CLI; incl. the Claude→opencode delegation lane) | direct filesystem (built-in read/write; interactive sessions have full toolset, the delegated worker is guardrail-scoped) | global `~/.config/opencode/AGENTS.md` pointer (auto-loaded every session) |

> Not the web version of Chat — the **Desktop** app, which has the Filesystem MCP connector.
> `:8798` (Obsidian bridge → `My Digital Garden`) is an *additional* semantic path, **not**
> Chat's only route to disk.

---

## 🧠 Two vaults — which one to write to (2026-07-26)

Every surface now sees **two** Perseus memory servers. They are not interchangeable:

| Write this | …to this server | Vault |
|---|---|---|
| Trevor Robey, INC. business facts | **`perseus-business`** | `~/.perseus-vault/data/business-vault.db` |
| Machine-wide facts (YubiKey gates, Falcon, browser lanes, host tooling) | `perseus-vault` | `~/.perseus-vault/data/perseus-vault.db` |

**Never write a business fact to the global vault.** Both are live here, so a stray write creates a
second copy that silently diverges the moment either is edited — the exact fragmentation this board
exists to prevent. The five business entities were migrated out of the global vault on 2026-07-26
and archived there; there is one source of truth per fact.

**This board is not replaced by either vault.** The board is the chronological narrative — Current
focus, workstreams, and a dated Log. A vault is a similarity-ranked fact store with no ordering and
active decay scoring, so it structurally cannot answer *"what are we working on right now."*
Board = the running story. Vault = the reference book. Keep writing both.

Reachability: `perseus-business` is registered in the repo's `.mcp.json` (Claude Code) **and** in
`claude_desktop_config.json` (Chat **and** Cowork — one file, same app). Its DB deliberately lives
outside the repo: `/Volumes/ExtraCurricular` has documented write hangs, and the FTS index stores
every memory in **plaintext**, which must never sit inside a git working tree.

### Three systems, three jobs — why they cannot overwrite each other

| System | Storage | Answers | Write style |
|---|---|---|---|
| **This board** | one markdown file, in git | *"what are we working on right now"* — ordered, dated, narrative | append/prepend; **overwrite only Current focus** |
| **`perseus-business`** | `business-vault.db` (+ own AES key) | *"what do we know about the business"* | idempotent per `category+key` |
| **`perseus-vault`** | `perseus-vault.db` (+ own AES key) | *"what do we know about this machine"* | idempotent per `category+key` |

They physically **cannot** overwrite one another — three separate stores, two of them separate
SQLite files with separate encryption keys, the third a git-tracked text file. The only real risks
are *logical*, and each has a guard:

- **Same fact in both vaults** → checked nightly by `~/.local/bin/perseus-vault-drift-check.py`,
  which fails **CRITICAL** on a `category+key` active in both, on a business topic sitting in the
  global vault (or vice-versa), and on the same summary copied under a renamed key. It **reports
  and refuses to fix** — choosing which vault owns a fact is a judgment call, and guessing deletes
  the copy someone wanted.
- **Two surfaces editing this board at once** → follow `README.md`'s safe-write pattern: probe with
  a read, prepend one self-contained entry rather than rewriting, verify after.
- **Board and vault duplicating content** → the board's standing rule: *point to canon, don't fork
  it.* Put the fact in a vault; put the pointer and the story here.

> **"Server disconnected" in the MCP logs is NOT a fault.** A Perseus stdio server self-exits after
> 600s idle — `no client activity for 600s — exiting idle stdio server (orphan-leak guard, #57228)`
> — and the app logs a red *Server disconnected*. By design; it is what keeps the process count
> bounded, and tools respawn on the next call. Do not "fix" it by setting
> `MIMIR_IDLE_TIMEOUT_SECS=0` — that reinstates the orphan leak.

---

## 🔒 Operating posture (inherited — enforce every task, all surfaces)

- **Research artifacts only** — not validated for clinical decision support.
- **No PHI** — public biomedical sources only.
- **Manual-only external actions** — no autonomous publish / post / login / transact.
- **Citation-traceability gate** — every citation resolves to a real PMID / NCT / ChEMBL ID /
  DOI. **Never fabricate a citation**; if none exists, say `[no verifiable citation found]`.
- Canon for the above: repo `CLAUDE.md` → "Rules" + "Security Orchestration";
  `Trevor Robey Intelligence Network Citations/SYSTEM-REALITY.md`.

---

## 🔴 Current focus

> The single source of "what are we working on right now." Overwrite this to keep it true.
> If nothing is in flight, leave the placeholder so the next surface knows the board is idle.

**🔴 2026-11-04 — REVENUE FIRST. START HERE: [`../STATUS.md`](../STATUS.md), rewritten today as an 8-step money
plan** (operator's instruction: "the sole goal right now is make as much money from this research engine as
possible"). Hub session: Desktop "Research engine AWS Data Exchange setup" (`local_1ad8daa7…`); the 26 older
TR-INC Biz sessions were folded into it and archived. Step 1 is the operator's: restore Google Workspace billing
(suspension date 11-02 passed, nothing records a fix). The 2026-10-21 notes below still hold where STATUS.md does not
supersede them.

**(previous) 2026-10-21 — START HERE: [`../STATUS.md`](../STATUS.md)** (one page: where the business stands + the
operator queue) and the last full handoff, [`handoffs/HANDOFF-2026-10-21.md`](handoffs/HANDOFF-2026-10-21.md).
The previous Current focus (written 2026-07-22 → 2026-09-01) is preserved verbatim in
[`log/CONTINUITY-2026-10-21.md`](log/CONTINUITY-2026-10-21.md); every item still open from it is carried
forward below.

- **Revenue $0; compliance BEHIND (operator-confirmed 2026-10-21).** EIN not applied for; LLC-12 (due
  2026-09-16) and $800 FTB 3522 (due 2026-08-15) not done — two are past due. Order and steps:
  [`…/00-business-formation/compliance/compliance-calendar.md`](../Trevor%20Robey%20Intelligence%20Network%20Citations/00-business-formation/compliance/compliance-calendar.md).
- **First product = Trial Graveyard Feed on AWS.** Refreshed 2026-10-21 into STAGING only
  (`…/trial-graveyard-feed/refresh-2026-10-21/`, uncommitted): 12 areas, 7,373 stopped trials, ~90% with a
  sponsor-stated reason; **breast cancer hit a 2,000-record cap — not a complete census.** Operator:
  review → price (`offers.md` `[DECIDE]`) → StandardDSA → move the AWS root email off `.edu` → publish.
- **Business-research lane** (`6ca9d78`) is built and unit-tested, **never run live**. One gated run is
  needed before any custom sale. Its five tiers were **priced and approved 2026-10-23** (`OFFERINGS.md` →
  "Business research (any field)"); booking waits for that first run.
- **Repo is ONE production source (2026-10-21).** trinc-content absorbed with history (`e485565`); the v3
  Copilot fork, its sync scripts and the committed build snapshot retired; vault plugin folders are
  deployed copies (no symlinks out, no `.git`); `ops/tr-suite/deploy.sh` is the one deploy path and
  `ops/tr-suite/verify.sh` enforces the model (0 FAIL). **obsidianwatch bless pending** (operator, Obsidian
  open): `contextual-wiki-definitions` (symlink→folder, same bytes) plus pre-existing `copilot` and
  `obsidian-local-rest-api`.
- **Infra freeze** — no new infrastructure until the first AWS product ships (2026-10-20 audit).

**Standing rules (still true):**
- **Never click "Update" on `command-center` in Obsidian** — its frozen id collides with the community
  plugin `scrunchds/Command-Center`; ours is pinned `9.9.9`; do not renumber it down.
- **Commits are YubiKey-signed.** "no gpg-agent running" → `yk-aqua-preflight`; never `--no-gpg-sign`.
  `git subtree` ignores `commit.gpgsign` — pass `-S`.
- **Pushes are operator-run in a real terminal** (the FIDO2 key's PIN prompt cannot render from an agent).

**Carried forward — open, NOT re-verified on 2026-10-21 (full text in the archive):**
- California counsel on selling an FTO *search* direct to a company (`Sperry v. Florida`, Cal. B&P 6125) —
  the patent brief stays off the ladder until cleared.
- Copy drift: Launch Playbook `:7` still says "Zero hallucinations" (retired from `OFFERINGS.md`
  2026-07-13); `REVENUE_PLAYBOOK.md:154` "research artifacts on any topic" (the business lane now exists
  but has never run live).
- Refund policy is a placeholder (`08-contracts-legal/refund-policy-boilerplate.md`), yet `OFFERINGS.md`
  promises a refund-backed SLA.
- Revoke InfraNodus key ids `19229`, `20381`, `20415` at the provider.
- Discard the 10 orphaned "TR-INC Biz" session transcripts? (operator call; **never delete by project
  directory** — those keys hold ~57 sessions).
- Landing-copy deploy to worker `shy-grass-fccd` awaits operator go; where `trevorobeyinc.com` deploys
  from post-wipe (`~/openclaw-landing-deploy/`) is unconfirmed.
- Connector OAuth for the needs-auth plugin servers (owkin, biorender, synapse, wiley, …).
- **Backup is current (2026-10-24):** `TRINC-FULL-backup-20261024-0304.bundle` (HEAD `039ba03`) in `~/Documents`
  and on ExtraCurricular, plus an offsite copy of the same commit in the business Drive; GitHub at the same
  commit. Cut a fresh one after the next substantial batch of commits.

---

## 🟢 Active workstreams

> Named threads currently open, with a one-line status each. Move finished ones to the Log.

- **Citation-overclaim sweep (E1)** — _mostly done._ All collateral surfaces reframed + verified (see newest Log entry). **Remaining:** the 10 un-swept `03-platforms/` dirs — `databricks-marketplace`, `gumroad`, `kaggle-seo-breadcrumb`, `ocean-protocol`, `snowflake-marketplace`, `substack-patreon`, `tier1-aggregators-{marketresearch-com,reportlinker,research-and-markets}`, `rejected-channels`.
- **`REVENUE_PLAYBOOK.md` reality-alignment** — _blocked (drive stall)._ Tidy-up spec is ready (routing table → Opus 4.8; tools 700+ → ~2,116; §3 template names → canonical six; Phase 31 API → built-not-deployed; stale plans → current Commercial Launch Playbook). Apply via **CLI / Desktop Code** (bypasses the wedging connector) or copy to `/Users/myhome`, edit, copy back.

---

## ⚪ Parking lot / open threads

> Ideas, blocked items, and "someday" work — not active, but don't lose them.

**✅ DONE 2026-07-24 — see the Log entry. The adapter is BUILT, WIRED and VERIFIED** (`openclaw-bridge/mcp/obsidian-bridge-mcp/index.js`, exposed to scout prefetch as `obsidian_prior_research`; registry `adapter_status: wired`). The original queued brief is kept below for context.

**🗄️ (COMPLETED) NEXT TASK (queued 2026-07-23, operator-requested): give the research engine live Obsidian access during a run.**
> Operator saw Claude drive Obsidian's Local REST API for the live wiki-definition test and wants the
> OpenClaw research pipeline to use the vault the same way — "untangle it and propose a plan unless it
> already is." **Survey result: the WRITE half already exists; the READ half does not.**
> - **Already built:** `scripts/publish-to-vault.js` pushes a completed task into the vault
>   (`Research-Output/<date>/<task-id>/output.md` + `OpenClaw/atlas/**` wikilink stubs + an SSE
>   `research_arrived` event) — and it correctly goes through the **canonical `:8798` bridge**
>   (`research_publish`), with `x-mcp-token` + replay headers, **not** `:27124`. The bridge already
>   ships `researchPublish.ts`, `researchNotify.ts`, `searchNotes.ts`, `readNote.ts` and
>   `miyoSearchContext.ts`. It is a **manual CLI, deliberately not auto-called**: Command Center's
>   `autoGenerateNotes` already writes notes after every run, so auto-calling it would DOUBLE-write
>   (this is exactly why the emit-only `research_notify` tool was built instead).
> - **The real gap:** the engine has **no vault-READ path**. Agent roles cannot consult prior research
>   in the vault mid-run; Miyo/Qdrant are Obsidian-side only today.
> - **Constraint that decides the design — root `CLAUDE.md:213`: "The MCP bridge at :8798 is the
>   canonical vault access point. Do not create alternative vault bridges."** So the engine must NOT be
>   wired to `:27124`; it should reuse the `:8798` path `publish-to-vault.js` already proves works.
> - **Proposed shape:** an `obsidian-mcp` adapter under `openclaw-bridge/mcp/` following the existing
>   adapter registration/invocation seam, exposing read-first tools (`search_notes`, `read_note`,
>   `miyo_search_context`) to roles via `tool-prefetch-map.json`, **fail-soft when Obsidian is closed**
>   (the bridge dies with Obsidian, and the engine can also run standalone from a terminal). Publish
>   stays opt-in behind a flag to avoid the double-write.
> - **Three refinements from the full survey (read these before starting):**
>   1. **The connector is already registered, only the adapter is missing.** `config/connector-registry.json`
>      already carries an **`obsidian-bridge`** entry with **`adapter_status: "missing"`** and
>      documentation-only `bound_workflow_steps`. So this is "build the missing adapter to match a
>      declared intent", not "add a new connector" — and it should keep parity with that entry.
>   2. ~~**⚠️ Stale comments misdescribe the data path.**~~ ✅ **FIXED 2026-07-23** (comment-only, verified
>      every changed line sits inside a block comment; both scripts still load and print usage).
>      `scripts/publish-to-vault.js` and
>      `scripts/atlas-stub-creator.js` both claimed `:8798 → RestApiBackend → Local REST API :27124 → vault`.
>      That is **wrong for this tool**: the bridge-side handler `researchPublish.ts` writes **directly to the
>      vault filesystem** via `fs.writeFileSync`, guarded by `guardVaultRelativePath` + an `allowedVaultRoots`
>      allow-list — it never touches `:27124`. Worth correcting those comments so nobody designs against a
>      path that doesn't exist. (Consequence: `research_publish` needs the bridge process alive, but not
>      Obsidian's UI — the bridge can be started standalone via `Copilot-Everything/scripts/bridge-start.sh`.)
>   3. **`Research-Output/` is a dormant target.** The vault scheme that is actually live is Command Center's
>      **`OpenClaw/<template_id>/<date> <input-label>/`**. Any publish wiring must pick one scheme
>      deliberately rather than quietly creating a second parallel tree.
>   Also confirmed dormant: `atlas-stub-creator.js` is self-documented as a DEBUG/FALLBACK batch tool with
>   **zero callers**; and `research_notify` is called only from the Command Center plugin
>   (`main.ts:360` → `openclaw-runner.ts`), never from the engine.

**Operator items (only the operator can resolve):**
- ~~**AWS Data Exchange true status**~~ — ✅ **RESOLVED 2026-07-22.** Definitively **APPROVED and cleared for paid selling** (disbursement method added; Marketplace status "Publish paid and free products"). Every doc that disagreed has been reconciled to this (see the 2026-07-23 Log entry). Remaining gap is product-side (publish a paid listing), not status.
- ~~**CA LLC SOS entity number**~~ — ✅ **RESOLVED 2026-07-22 — and the old claim here was WRONG.** A **certified CA SOS copy** (Certificate No. 457169837, issued 2026-05-12, certified by Secretary of State Shirley N. Weber) labels **B20260217250** as the **"Entity No."** — it is NOT "just the filing receipt." Entity **APPROVED 2026-06-18**. All ground-truth docs reconciled; record: `00-business-formation/llc/certificate-of-formation.md`.
- **Live-site deploy source** — `~/openclaw-landing-deploy/` was on the wiped Mac, not the current machine. Confirm where `trevorobeyinc.com` deploys from now. The landing-page + HF-card citation fixes are **repo copies, not live-published** — they need a redeploy/push.

**Non-citation flags surfaced during the sweep (NOT fixed — operator's call):**
- 3 of 4 cold emails link `https://trevorrobeyinc.github.io` (dead) instead of `trevorobeyinc.com`.
- `email-target-discovery` "We do not generate AI content" contradicts the AI-assisted-synthesis reality (Opus 4.8).
- `email-quant-analyst` "I operate OpenClaw" misstates the OSS-upstream relationship; "absolute mathematical proof…for every signal" overstates the SHA-256 ledger.
- "1.0 confidence" / "1.0 Quality Confidence Score" perfect-score claims (`email-ci-director`, `email-target-discovery`) — verify or soften.
- `email-academic-researcher` Day-3 typo "formerly AEMS" → "formerly FAERS."
- `product-catalog.md` names the engine `trevor-robey-inc-agents` (stale folder alias, or an intentional engine name — confirm).

---

## 📋 Log — newest first

> Prepend new entries here. One entry per meaningful chunk of work or handoff.

### 2026-11-04T22:48Z · Desktop Claude Code (hub) · **Misattribution root cause fixed: the model now sees each paper's real authors (uncommitted)**
- **Did:** on the operator's "yes, fix the root cause":
  - the normalizer keeps a row's genuine author list as `author_names` (+ an honest count; placeholders dropped);
  - `tool-prefetch.js` prints `**Authors:** …`;
  - the business-lane OpenAlex fetcher keeps authorships;
  - the ZERO FABRICATION prompt clause and the literature_reviewer / report_generator role prompts say to name authors only from that line;
  - prior-run context has its bylines withheld;
  - the attribution check reads the Vancouver list form.
- **Verified:**
  - Live re-render of run #7's four mis-credited PMIDs: before, no author line; now Calvo…(21), Yin…(8), Benatar…, Uysal…(10).
  - Tests 1,394 → 1,412, 0 fail; phase 18/19/29/30 gates and the lint pass.
  - Two-lens adversarial review: no false Authors: line from any tool; its should-fixes applied.
  - Live attribution check unchanged: 6 works, run #7 only, no false alarm.
- **Next:** the next real Benchmark run shows whether bylines come out right. Optional operator decision: correct or supersede run #7's vault notes and research-memory pack (still wrong as data, now withheld from prompts). Operator commits.
- **Touches:** normalizer, `tool-prefetch.js`, `agent-engine.js`, `business-sources/openalex.js`, `citation-attribution.js`, `config/role-prompts.json`, three test files, engine `CLAUDE.md` / `CHANGELOG.md`, `STATUS.md`, this board.

### 2026-11-04T14:12Z · Desktop Claude Code (hub) · **Attribution check built: author/year beside each DOI/PMID vs the registry (uncommitted)**
- **Did:** on the operator's "yes, add the check" and choice "flag + mark inline":
  - new `openclaw-bridge/core/citation-attribution.js`;
  - `citation-reresolver.js` `checkAttributions` (PMID docsum reused; one Crossref `/works` call per DOI with an author beside it);
  - manifest `attribution_mismatch` → `DELIVER_WITH_FLAGS`, plus an "Attribution check" section;
  - inline `[ATTRIBUTION MISMATCH: registry lists …]` in the shipped sections;
  - packager sentence and `report.md` Citation Summary;
  - `SYSTEM-REALITY.md` §3, the engine `CLAUDE.md` and `CHANGELOG.md`.
- **Verified:**
  - Tests 1,360 → 1,394, 0 fail, including an end-to-end test into a sealed bundle. Policy gates 18/19/29/30 and the lint pass.
  - Adversarial review: no regression and no path to a block. Every false-alarm probe it raised (Merck Sharp & Dohme, journal and regimen pairs, nearby years, wiki-links, Jr, collective authors, particles, links) is fixed and pinned.
  - Live over the 7 real reports: 151 DOI/PMID, 17 checkable, 7 match, 10 mismatch = **6 misattributed works, all in run #7** (Feldman→"Chio", Brown & Al-Chalabi→"Paganoni", Calvo→"Rissanen", Yin→"Mazzini", Benatar→"Al-Chalabi", Uysal→"Basiri").
- **Next:** root-cause fix: `renderRecord` should print literature `authors` (the normalizer keeps them) so the model stops writing names from memory. Operator commits.
- **Touches:** the files above, two new test files, three test files extended, `STATUS.md`, this board.

### 2026-11-04T13:35Z · Desktop Claude Code (hub) · **Benchmark sample rebuilt from run #7 (ALS); two author misattributions confirmed in its report**
- **Did:** on the operator's "yes, rebuild it", a build → two reviewers → fix workflow wrote
  `workspace/collateral/samples/trial-design-benchmark-sample-als.md` and updated
  `workspace/collateral/one-pagers/trial-design-benchmark-pack.md` (13 findings applied). The run #6 sample went to
  `.archive/superseded-samples-2026-11-04/`, and the vendor checklist was repointed.
- **Checked by script:** all 30 NCTs trace to run #7; 0 table rows lack their registry sponsor; $4,950 verbatim;
  disclosure present; SAMPLE mark ×6. Open `[DECIDE]`s: turnaround, client-data reuse, buyer-ZIP contents, memo
  generator wording.
- **Found:** run #7's model-written `report.md` still has errors the gate cannot see:
  - two confirmed author misattributions (`:146-147`): Crossref says `10.1016/s0140-6736(22)01272-7` is Feldman et al.,
    and NCBI says `10.1056/NEJMra1603471` (PMID 28700839) is Brown & Al-Chalabi;
  - an ALSFRS-R count of 14 where the registry shows 9;
  - a recruiting trial called "completed-accrual";
  - internal markup.

  The gate proves an identifier was retrieved, and re-resolution that it exists; neither checks the author/year written
  beside it.
- **Next:** proposed engine guard: author and year cross-check at re-resolution. Operator decides the `[DECIDE]`s and
  commits.

### 2026-11-04T12:56Z · Desktop Claude Code (hub) · **Run #7 (ALS Trial Design Benchmark): DELIVER, and the narrative now matches the registry**
- **Did:** on the operator's "yes, set it up", through the door:
  - preflight → dry run → `operator-approved-gate arm openclaw` (operator's PIN + touch);
  - `trial-design-benchmark` with `{"indication":"amyotrophic lateral sclerosis"}` → `workflow-e5947dccdce0e06fde1884b5` (12:48–12:55Z);
  - `post_run_done:true`, every stage `ok`; token consumed, nothing armed.
- **Verified:**
  - citation gate PASS 38/38 grounded, retraction screen clean; delivery 38/38 VERIFIED (20 NCT / 7 PMID / 11 DOI); DELIVER.
  - Checked by script against `design-benchmark.csv`: the narrative names all 20 sponsors correctly and states "20 of 64" with no "20 of 20". The phase split (9/11) and sponsor classes (13 INDUSTRY / 7 OTHER) are correct, NCT by NCT. It says "not retrieved" 7×, "not reported" 0×.
  - First Benchmark PASS outside NSCLC. Bundle: `workspace/releases/offer-6e024a207af1d5e62c6a15ef/`; vault: `OpenClaw/trial-design-benchmark/2026-11-04 amyotrophic lateral sclerosis/`.
- **Next:** Claude rebuilds the Benchmark sample from run #7, with the buyer ZIP built from deliverable files only (the bundle again carries `store-copy.md` and a Datarade approval). Operator commits the batch.
- **Touches:** engine `CHANGELOG.md` (proof line), `STATUS.md`, this board.

### 2026-11-04T12:46Z · Desktop Claude Code (hub) · **Benchmark analyst now sees the registry fields and N of M (run #6's sponsor guessing fixed; uncommitted)**
- **Did:** on the operator's "yes, fix it":
  - `openclaw-bridge/core/tool-prefetch.js` renders the design-benchmark fields `renderRecord` used to drop: sponsor and class, design, enrollment, interventions, primary outcomes (capped), and typed dates. It adds a cohort "N of M" line and an honest "not retrieved ≠ not reported" note, tied to `ctgov_design_benchmark` only.
  - `ctgov-design-benchmark.js` fetches interventions in the same call, keeps the date types, and reports a null count or empty arm list as not reported (was 0).
  - `config/mission-templates.json`: the analyst gets a column spec; the synthesizer depends on steps 1 and 2 and defines M as registered trials.
- **Verified:** engine suite baseline 1,355 → 1,360, 0 fail. Phase 18, 19 and 29 policy gates and the restricted-globals lint pass. A two-lens adversarial review found no regression in any other source; its should-fixes are applied. Live read-only render for ALS: 20 of 64 eligible, 20/20 with sponsor and enrollment.
- **Next (operator):** open Obsidian, `operator-approved-gate arm openclaw`, then Claude dispatches `trial-design-benchmark` with `{"indication":"amyotrophic lateral sclerosis"}` through the door (dry run first). Claude then rebuilds the Benchmark sample from that run. Commit the batch with your YubiKey.
- **Open, stated in `CHANGELOG.md`:** cohort tallies are still model arithmetic, and there is no post-assembly narrative-vs-csv check. Local-fetcher docs are labelled "ToolUniverse SMCP". `role-prompts.json` asks this analyst for ChEMBL ids, which conflicts with the paper's ChEMBL exclusion; that's the operator's decision.
- **Touches:** the three engine files, two test files, the engine `CHANGELOG.md` and `CLAUDE.md`, `STATUS.md`, this board.

### 2026-11-04T12:25Z · Desktop Claude Code (hub) · **Sales samples and contract paper drafted (not committed); four product gaps found**
- **Did:** finished the operator's pull locally: fast-forward to `0d0baa8`; the hub edits were stashed and restored, and
  the board conflict was resolved with both sides kept. Recorded the operator's paper decisions in `STATUS.md` step 3:
  California law; refunds fix-first (30 days / 15 business days / cap = fee, sole remedy); Net 30 after delivery;
  counsel deferred for budget. Two workflows (build → two reviewers → fix) wrote:
  - samples: `workspace/collateral/samples/{trial-design-benchmark-sample-nsclc,failed-trial-archaeology-sample-heart-failure}.md`
  - offer sheets: `workspace/collateral/one-pagers/{trial-design-benchmark-pack,failed-trial-archaeology}.md`
  - paper: `08-contracts-legal/common-paper/{mutual-nda,sow-template}.md`, `08-contracts-legal/{refund-policy-boilerplate,payment-terms}.md`
  - `11-financial-ops/vendor-onboarding-checklist.md`, `03-platforms/aws-data-exchange/legal-name-change-request.md`
  - `workspace/legal/nda-mutual-template.md` → superseded pointer

  Checked by hand: 0 banned terms, canon prices only, the disclosure in all 11 files.
- **Found:**
  1. Run #6's narrative never saw the cohort's registry fields (`tool-prefetch.js:140` `renderRecord` drops sponsor,
     allocation, masking, enrollment, endpoints). It inferred sponsors from drug names (NCT07388524 "Roche"; the
     registry says NCI) and contradicts its own `design-benchmark.csv`.
  2. Failed Trial Archaeology as described in OFFERINGS has no engine path: no phase or mechanism filter, no matrix, no
     template.
  3. Vault publish and research memory run on every run, so client work is not isolated.
  4. The proof-run ZIPs include `store-copy.md` (overclaims) and Datarade packs.

  Also: two old NSCLC benchmark bundles (`offer-3dec35…`, `offer-7e373e…`) contain ChEMBL ids, so the first-sale-gate
  skill's "no shipped bundle contains a ChEMBL id" is stale.
- **Next:** the operator's steps 1–2 (Workspace, filings) are unchanged. Claude: fix `renderRecord` with a test, then the
  operator arms one Benchmark re-run (ALS or IPF); boil the open `[DECIDE]`s into one decision sheet; a customer-run
  isolation switch; a buyer-ZIP builder.
- **Touches:** the 11 files above, `STATUS.md`, this board.

### 2026-11-04T11:35Z · Desktop Claude Code (hub "Research engine AWS Data Exchange setup") · **Sessions consolidated; STATUS.md rewritten as a verified money-first plan**
- **Asked:** fold the TR-INC Biz session nest ("TRINC monorepo cleanup continuation", "TrevClaw-Obsidianodus monorepo
  consolidation", their 23 side sessions, and the predecessor "cleanup and organization plan") into one session,
  archive them, research what would make the engine's ADX datasets sellable, and start making money.
- **Consolidated:** all 26 tails were read; all 26 sessions are archived (reversible from the Archived list). None holds uncommitted TRINC work. Both worktree branches
  (`eloquent-thompson`, `wonderful-banach`) are merged, and the `festive-bun` worktree was already gone. Every business
  item still live is now in `STATUS.md`. Four security items were open only in transcripts: the unanswered OpenCode
  AP-read question, the SE backup 130 commits behind, the Zoho leftovers, and the pending LST/AGCA authorizations.
  They went to the Security Everything board (uncommitted there).
- **Found:**
  - **The paid feed's live columns are all free in AACT and the CT.gov API.** 5 paid columns are empty or UNKNOWN on
    all 7,373 rows (history 403).
  - `workspace/legal/CommonPaper-Mutual-NDA-v2.pdf` is a saved 404 HTML page. No signable paper and no direct-sale
    rail exist (no bank account, invoicing placeholders). AWS payout (ACH 262) is the only working rail.
  - The Benchmark Pack fills a 20-of-M cohort in 13 indications, but has passed the gate only in NSCLC.
  - The `workflow-21d82407` and `workflow-72f0c288` memos print amendment bands (HIGH and MODERATE), so samples come
    from run #6 or are redacted.
  - CT.gov v2 returns sponsor class, dates, enrollment type, interventions and references in the existing call.
  - A 12-rule stop-reason draft covers 78.8% of the 6,623 reasoned rows.
  - External, read 11-04: Ozmosi BEAM (ticker-mapped CT.gov data) lists at $8,500/month on ADX. AWS professional
    services need one public product first (fee 0.5%, or 0% in an offer set). Partner Central moved into the AWS
    console 2025-11-30. Notes in memory `adx-market-research-2026-11`.
- **Did:** `STATUS.md` rewritten: 8 ordered steps, owners, "not doing", housekeeping, every old open item kept. This
  Current focus line. Memory `adx-market-research-2026-11`. Workflow evidence (plan, verdicts) is in this session's
  transcript; nothing was built, committed or published.
- **Next:** operator, step 1 (Workspace billing) today, step 2 (EIN → FTB 3522 → LLC-12 → bank) tomorrow. Claude,
  steps 3–4 (paper and samples, files only) on the operator's go. Feed v1.1 (step 7) waits on the operator lifting the
  10-21 deferral.
- **Touches:** `STATUS.md`, this board; outside the repo, memory and the Security Everything board.

### 2026-11-02T00:57Z · Claude Code on the web (cloud session) · **research-memory re-embedded (PASS); transformers port merged to `main`**
- **Did:** the operator ran `npm run parity -- --reembed` from the worktree. 6 / 6 packs re-embedded; the
  after-check gave min 0.999999, mean 1.000000: PASS. Old vectors are backed up at
  `~/.local/share/trinc-rollback/research-memory-vectors-2026-11-02T00-55-51-606Z.json`. The port is merged
  to `main` (fast-forward).
- **State:** the store and the code agree, but the real folder still runs the old `dist/` until it is
  rebuilt.
- **Next (operator, on the Mac):**
  - pull, then `npm ci --ignore-scripts && npm run build` in research-memory (`npm ci` is now safe);
  - `npm test` with Qdrant, then `npm run parity`;
  - remove the worktree and cut a fresh backup bundle;
  - dismiss the 12 no-fix alerts on GitHub.
  - Keep the vector backup until a real run has used the new embedder.
- **SCOPE NOTE:** repo infra (dependency hygiene); "Current focus" untouched.

### 2026-11-02T00:52Z · Claude Code on the web (cloud session) · **research-memory parity: 0.4% drift (int8 arithmetic); reversible re-embed added, port still off `main`**
- **Did:**
  - The operator's Mac parity run compared 6 of 6 packs: cosine 0.993–0.998 (FAIL at 0.999). Same model
    file and same 8192-token limit in both versions, so the cause is int8 arithmetic (onnxruntime 1.14 →
    1.30), not truncation.
  - Added `npm run parity -- --reembed`: backup of the old vectors to `~/.local/share/trinc-rollback/`
    first, then vectors only, then a re-check. Added `--restore <file>` to undo it. Unit tests 26 / 26.
- **State:** on `claude/compassionate-tesla-9n57ew` only; `main` unchanged (`90ba460`).
- **Next (operator):**
  1. Update the worktree, rebuild, and run `--reembed`.
  2. On an after-PASS, Claude merges the port, and the operator runs pull, `npm ci`, build and the
     integration test.
  3. Don't start a research run between the re-embed and that rebuild.
- **SCOPE NOTE:** repo infra (dependency hygiene); "Current focus" untouched.

### 2026-11-01T12:40Z · Claude Code on the web (cloud session) · **Last 18 Dependabot alerts: fork fixed on `main`; research-memory port waits on a Mac parity check**
- **Did:**
  - The operator's GitHub page showed 28 open: research-memory 14, fork 5, and 9 stale alerts for
    `scrape-sidecar/uv.lock`, a folder deleted in `a148d9e` on 2026-09-18 that the dependency graph kept.
  - Fork, on `main`: sucrase 3.35.1 in range (drops glob) and a `moment` 2.31.0 override. `main.js` is
    byte-identical, lint is identical, Jest 5,831 / 5,831.
  - research-memory, **on the branch only**: `@huggingface/transformers` 4.3.2 (audit 14 → 0), `dtype: "q8"`
    (same model file), model cache moved to `~/.cache/trevorobeyinc-research-memory/`, and a new read-only
    `npm run parity` comparing re-embedded sources with the stored Qdrant vectors.
- **State:** the fork fix and the docs are on `main`. The research-memory port is the last commit on
  `claude/compassionate-tesla-9n57ew`, not merged.
- **Next (operator, on the Mac):**
  1. Copy the model cache, then run `npm run parity` from a git worktree of the branch. Steps are in
     Claude's reply and in `ops/security/dependency-audit-2026-10.md`, "Clearing the last 18".
  2. On PASS: Claude merges the port, and the operator runs `npm ci` + build + the integration test.
  3. On GitHub: dismiss the 9 scrape-sidecar alerts ("inaccurate"), `diff` ("not used"), and `minimatch` and
     `deepmerge` ("risk tolerable"; no fixed release exists).
- **SCOPE NOTE:** repo infra (dependency hygiene); "Current focus" untouched.

### 2026-11-01T12:05Z · Claude Code on the web (cloud session) · **Engine zod 4.6.7 applied with the operator as reviewer; merged to `main` (24 advisories left)**
- **Did:** on the operator's go, with "Trevor Robey (operator)" as the named reviewer, applied the engine
  flip: lockfile, LOCKED cache, cache lock, known-good manifest, `dependency-review.md`. It matches the
  rehearsal hash for hash. All engine gates pass, `npm test` 1352 / 1355 as before, engine audit 0. Merged
  the branch to `main` (fast-forward).
- **State:** on `main`; nothing on the Mac is reinstalled, rebuilt or deployed yet.
- **Next (operator):** the ordered list in `ops/security/dependency-audit-2026-10.md`, "On the Mac, in this
  order". Pull first, then reinstall each runtime tree before it builds or runs; research-memory uses
  `npm install`, not `npm ci`.
- **SCOPE NOTE:** repo infra (dependency hygiene); "Current focus" untouched.

### 2026-11-01T11:47Z · Claude Code on the web (cloud session) · **Dependency advisories 89 → 25 (zod 4, hono 2, esbuild 0.28, fork dev majors)**
- **Did:**
  - A fresh audit found 89, not 81: a new `@hono/node-server` advisory with no 1.x fix, plus two in the
    fork's dev tree.
  - hono 2.1.5 in six trees.
  - zod 4 in the bridge (and so the adapter), searxng, Medical-Zettelkasten, research-memory and
    vault-zettelkasten. The trap was `.default({})` on objects, which drops inner defaults; now
    `.prefault({})`, pinned by a new bridge test.
  - esbuild 0.28 in Command Center and Viz Studio.
  - Fork: dev Electron 45 and `eslint-plugin-boundaries` 7.4 (57 → 5). `main.js` is byte-identical to
    HEAD's build, lint is identical, Jest 5,831 / 5,831.
  - Engine: schemas made zod-4-ready and tested on both versions (1352 / 1355 each).
- **State:** on branch `claude/compassionate-tesla-9n57ew`, not merged, nothing deployed.
- **Next (operator, on the Mac):**
  - Engine zod flip: recipe in `ops/security/dependency-audit-2026-10.md`, "2026-11-01 follow-up". Needs
    your `Reviewer` line and the known-good update, so it was not committed for you.
  - Re-run the searxng and trinc-content installers.
  - Rebuild the bridge.
  - research-memory: run the integration test against Qdrant; the transformers port clears its 14.
  - Dismiss locutus (×5) and the fork's `diff` advisory as "vulnerable code not used".
  - Then one `deploy.sh --build --apply command-center trinc-viz-studio copilot` and the bless.
- **Touches:** nine lockfiles; `package.json` in eight packages; bridge `src/config/loader.ts` and
  `src/tests/configLoader.spec.ts`; vault-zettelkasten `src/types/zettelkasten.ts`; seven engine schema
  files and its `CHANGELOG.md`; Medical-Zettelkasten `CLAUDE.md`; the audit record.
- **For whoever's next:** vault-zettelkasten's `main.js` never contained zod (it imports only types), so its
  zod change needs no deploy or bless.
- **SCOPE NOTE:** repo infra (dependency hygiene); "Current focus" untouched.

### 2026-10-24T22:44Z · Desktop Claude Code (side session) · **Copilot fork: lockfile-only refresh (158 → 54 advisories), not yet deployed**
- **Did:** on the operator's go, an in-range `npm audit fix` of `Copilot-Everything/repos/obsidian-copilot-mcp-v4`
  (no source, `package.json` or manifest change). 72 → 1 advisories reach the runtime bundle; repo-wide 185 → 81.
  Held `@hono/node-server` on 1.19.x and `@langchain/openai` 1.5.8 / `@langchain/classic` 1.0.43 so every
  OpenAI-compatible provider stays on OpenAI SDK v6 (npm's pick, SDK v7, broke a Jest suite). Jest 5,831/5,831,
  lint and `review:obsidian` unchanged, build and mobile-load smoke pass.
- **State:** committed, not pushed, **not deployed** (repo-side `main.js` restored, so Obsidian is unchanged).
- **Next:** operator: push; then, with Obsidian open, `ops/tr-suite/deploy.sh --build --apply copilot` and the
  obsidianwatch bless. Then the zod 4 migration, one package at a time.
- **Touches:** the fork's `package-lock.json`, `ops/security/dependency-audit-2026-10.md`.
- **For whoever's next:** `/private/tmp/claude-501` is a small cap (~4 GB) shared by every Claude session, so
  ENOSPC there is not a full disk: keep big caches and clones in `~/.npm` or `~/.local/share/trinc-rollback/`.
- **SCOPE NOTE:** repo infra (dependency hygiene, Copilot fork); "Current focus" untouched.

### 2026-10-24T12:22Z · Desktop Claude Code · **Bridges refuse browser traffic before auth (:8798, :8799, :8800)**
- **Did:** on the operator's go, a browser guard (like the `:8801` Security Bridge's) runs first in all three
  TRINC bridges: a Host other than `127.0.0.1`/`localhost`/`[::1]` on the arrival port gets 421, and any
  `Origin`, `Referer` or `Sec-Fetch-Site` other than `none` gets 403, before any route or auth. `:8799` and
  `:8800` no longer send `Access-Control-Allow-Origin: *` or answer preflights. The rule was tuned to clients
  measured live: Node's `fetch` sends `sec-fetch-mode: cors` and Obsidian's `requestUrl` (Copilot) may send
  `Sec-Fetch-Site: none`, so a verbatim copy of `:8801`'s stricter rule would have cut them off. Tests in all
  three packages; `verify.sh` now fails if the three guard copies drift. Built the `:8798` bridge; deployed
  Command Center + Viz Studio in one `deploy.sh` run (backup `~/.claude/backups/tr-suite/20261024T122101Z/`).
- **State:** done and verified live (12:26–12:30Z, Obsidian open, obsidianwatch blessed by the operator):
  `ops/tr-suite/bridge-guard-live-check.mjs` 18/18 on all three bridges (program, Electron-style and Node-fetch
  clients 200; browser and preflight 403; rebinding Host 421), adapter `test:profiles` 52/52, and Copilot's MCP
  Diagnostics probe (its real `requestUrl` path) answered by all three. The audit log holds only the deliberate
  probes' refusals; no real client was refused.
- **Next:** Security Everything could add an OSSEC rule for the new `BROWSER_REJECT` audit event (today the
  silent parent rule ingests it). Re-run the live check after any bridge redeploy.
- **SCOPE NOTE:** repo infra (bridge security); Current focus untouched.

### 2026-10-24T11:49Z · Desktop Claude Code (side session) · **OpenAlex and DOAJ rows reach the prompt as real records**
- **Did:** closed the follow-up below. ToolUniverse's `execute_tool` wraps a tool's bare row list as
  `{result: [...]}`; the adapter now sends that list down the same row path as every other list, and the
  normalizer maps the two tools' rows from a live dump (`venue` is the journal, OpenAlex's resolver-URL DOI is
  carried bare, placeholders the tool flags false in `data_quality` such as "Abstract not available" are dropped).
  Exact A/B on envelopes captured live (metformin / type 2 diabetes): OpenAlex 1 → 8 records, DOAJ 1 → 6, DOI ids
  5 → the same 5 and 0 → 6; the other 22 ToolUniverse entries render byte-identical prompt content. 10 tests
  added. Engine 1355/1355, phase29 58/58.
- **State:** done, committed on top of `156f85b`; not merged, not pushed.
- **Next:** operator: merge and push, together with the entry below.
- **Touches:** `openclaw-bridge/mcp/tooluniverse-mcp/` (adapter + normalizer), its test, the audit report's
  "Found on the way".
- **SCOPE NOTE:** engine evidence honesty (the ToolUniverse lane); "Current focus" untouched.

### 2026-10-24T11:32Z · Desktop Claude Code (side session) · **ToolUniverse result gaps: an upstream error is a failed search; OpenTargets hits reach the prompt**
- **Did:** two of the three gaps the v1.5.7 A/B found, fixed in the adapter + normalizer with 9 tests. An
  upstream error (EuropePMC's 503 "Error" row inside a success envelope, Semantic Scholar's 429 error envelope)
  is now a `failed` search with nothing rendered, where it used to be a record counted "returned" in
  `search-coverage.md`. OpenTargets' drug lookup now yields its `data.search.hits` (metformin: 5 records with
  descriptions and ChEMBL ids, was one empty record). Live A/B over all 24 ToolUniverse prefetch entries: exactly
  those 7 change, the other 17 are identical. Engine 1345/1345, phase29 58/58.
- **State:** done, committed on `claude/eloquent-thompson-7830d1`; not merged, not pushed.
- **Next:** operator: decide on a Semantic Scholar API key (the option is in
  `ops/security/dependency-audit-2026-10.md`, decision 5; without one its calls draw 429 intermittently and now
  count as failed). Then merge and push. Open follow-up: OpenAlex and DOAJ arrive as `{result: [...]}` and render
  as one JSON blob (same report, "Found on the way").
- **Touches:** `openclaw-bridge/mcp/tooluniverse-mcp/` (adapter + normalizer), its test, the engine `CLAUDE.md`
  Scholar Gateway note, the audit report.
- **SCOPE NOTE:** engine evidence honesty (the ToolUniverse lane); "Current focus" untouched.

### 2026-10-24T10:57Z · Desktop Claude Code (side session) · **ToolUniverse v1.1.10 → v1.5.7; venv from a repo-owned lock (252 known vulns → 0)**
- **Did:** on the operator's go ("v1.5.7 + own lock; Playwright only if it truly must"): moved the submodule pin
  `3833b0e` → `f2006162` (no file in it edited) and rebuilt its venv from the new hashed
  `security/tooluniverse-venv.lock.txt` (core deps only, wheels only) via the updated
  `scripts/setup-tooluniverse.sh`. 2,719 tools load (was 2,173); OSV finds 0 known vulnerabilities in 107
  packages (was 252 in 214). Playwright is NOT installed: it is an optional extra; ToolUniverse works without
  it; its one browser tool answers HTML pages with a clear error, and the stack's non-browser scraper is
  searxng-search `extract`. A live before/after of the 14 engine tools found two upstream output changes, both
  fixed engine-side with tests: PubMed abstracts are now opt-in (`include_abstract: true` in the three PubMed
  prefetch entries) and FAERS moved its rows to a top-level `reports` array (adapter + normalizer). Engine
  1336/1336, phase29 58/58. Internal docs updated (the old count and pin).
- **State:** done, committed, not pushed.
- **Next:** operator: push. Customer-facing `workspace/collateral/landing-page/intake.html` still says "~2,116
  tools" (now an undercount): your brand-check. Delete the parked old venv
  (`~/.local/share/trinc-rollback/tooluniverse-venv-v1.1.10`) after the next real run passes.
- **Touches:** the submodule pointer, `security/tooluniverse-venv.lock.txt`, `scripts/setup-tooluniverse.sh`,
  `config/tool-prefetch-map.json`, `openclaw-bridge/mcp/tooluniverse-mcp/`, its test, docs, the audit report.
- **For whoever's next:** never `uv sync` in `vendor/tooluniverse` (upstream's lock is stale; it would rewrite
  it). The old venv loaded ToolUniverse through the `TrevClaw-Obsidianodus` compat symlink; the new one does
  not, so that symlink's removal no longer breaks the engine.
- **SCOPE NOTE:** repo infra (dependency hygiene, the engine's ToolUniverse lane); "Current focus" untouched.

### 2026-10-24T10:17Z · Desktop Claude Code (side session) · **Dependency audit: the "do now" batch done (vitest 5, readability 0.6, staged copies re-installed)**
- **Did:** on the operator's go (majors approved): vitest 5.0.5 in the `:8798` bridge and research-memory,
  `@mozilla/readability` 0.6.0 in searxng, the stdio adapter's SDK floor `^1.32.2`, then both
  `install-connector.sh` re-run (staged searxng and trinc-content now on MCP SDK 1.32.2). Local alerts 207 → 185;
  outside the Copilot fork 49 → 27. Every test and gate as before (engine 1331/1331).
- **State:** done, committed, not pushed.
- **Next:** operator: push; dismiss the `locutus`/`phpmorphy-locutus` alerts on GitHub as "vulnerable code not
  used"; reconnect sessions that use searxng-search or trinc-content (old processes keep old code). Then the
  planned changes, one each: tooluniverse submodule bump, zod 4, the transformers port.
- **Touches:** `Claude/searxng-search-mcp`, `Claude/trevorobeyinc-research-memory-mcp`, the bridge (+ new
  `vitest.config.ts`), the adapter's `package.json`, `ops/security/dependency-audit-2026-10.md`.
- **For whoever's next:** vitest 4+ no longer excludes `dist/`; the bridge's new config keeps the compiled
  test copies out.
- **SCOPE NOTE:** repo infra (dependency hygiene); "Current focus" untouched.

### 2026-10-24T10:40Z · Desktop Claude Code · **TRINC reorganization: Phase 8 close-out done (backup current in all three places)**
- **Did:** the `trevclaw` sweep (`ac5ca0d`: what still needs the old path, which runtime names stay on
  purpose); gates re-run against the 2026-10-23 baseline (all pass; engine 1331/1331); fresh bundle
  `TRINC-FULL-backup-20261024-0304` (HEAD `039ba03`, sha256 `b8e9678f…a5af`) cut, verified, mirrored
  byte-identical to ExtraCurricular; the Drive offsite copy refreshed from `03b0496` to `039ba03` in
  `TRINC/Monorepo-039ba03/` (file-by-file identical) with a rewritten restore README; Hosting pointer,
  STATUS rows and memory updated.
- **State:** done, except steps that are the operator's (below). GitHub is at `039ba03` too.
- **Next (operator):** ~~OK to Trash the superseded bundles~~ (done on the operator's OK the same day: both
  generations, both locations, now in `~/.Trash`); trash the old Drive `Monorepo/` in the web UI so the new
  folder can be renamed; fix the Desktop
  folder preset; the dependency audit's 11 decisions; start the proposed Falcon-rule session; the compat
  symlink comes out no earlier than 2026-11-06, once the Raycast path, the preset and the Falcon rule are
  cleared. **Workspace payment (suspends 2026-11-02) also puts the Drive offsite leg at risk.**
- **SCOPE NOTE:** repo infra (backups, rename close-out); Current focus's backup line refreshed.

### 2026-10-24T10:00Z · Desktop Claude Code (side session) · **Dependabot alerts triaged; nine lockfiles refreshed in range**
- **Did:** rebuilt GitHub's 497 alerts locally (`npm audit` over the 11 lockfiles: 489) and fixed what needed no
  major: nine lockfiles refreshed in range (MCP SDK → 1.32.2 everywhere, express/hono/fast-uri/qs chain,
  transitive majors held on patched lines). 489 → 207 locally; outside the untouched Copilot fork, 331 → 49. No
  `package.json`, source, `main.js` or `dist/` changed; the engine's lockfile and locked cache untouched. Report:
  `ops/security/dependency-audit-2026-10.md`.
- **State:** done, committed, not pushed.
- **Next:** operator: `git -C /Users/myhome/TRINC push origin main`; then decide the 11 items in the report's
  "Decisions for the operator" (zod 4, vitest 5, the transformers port, the fork, the submodule, the staged-copy
  installers); run `npm run test:profiles` in the adapter once with Obsidian open.
- **Touches:** nine `package-lock.json` files under `Claude/` and `Copilot-Everything/bridges/`, `ops/security/`.
- **For whoever's next:** `obsidian-stdio-adapter/node_modules` is a tracked symlink to the bridge's
  `node_modules`, so the bridge's lockfile is the live door's lockfile. `searxng-search` and `trinc-content`
  keep their old dependencies until their `install-connector.sh` re-runs.
- **SCOPE NOTE:** repo infra (dependency hygiene); "Current focus" untouched.

### 2026-10-24T09:40Z · Desktop Claude Code · **Datarade deferred; "verified citations" overclaim cleared from collateral**
- **Decided (operator, 2026-10-24):** Datarade is deferred "until the business is actually up and running".
  Datarade declined the application on 2026-05-20 ("business not yet established"). The files are parked,
  not deleted: a DEFERRED banner with the reason, the parked stale content and how to reverse is on
  `03-platforms/datarade/go-live-checklist.md`, short banners are on `vendor-application.md` and both setup
  guides, and STATUS.md lists it under "Not doing right now". The `datarade` platform target stays (inert,
  manual-only).
- **Did:** "verified citations" counts relabelled "cited identifiers" on the landing-page source (four stat
  labels, the sample block, and its "Verified Output" heading → "Sample Output"), both one-pagers and three
  outbound templates. The demo script no longer pitches Snowflake/BigQuery delivery. collateral-audit and
  brand-check skills updated (1.0.3).
- **State:** committed. **The live site is unchanged until the operator deploys the landing page**
  (Cloudflare worker `shy-grass-fccd`).
- **Touches:** STATUS.md, `03-platforms/datarade/`, `07-outbound/`, `workspace/collateral/`, this board.

### 2026-10-24T09:10Z · Desktop Claude Code · **Samples and platform guides: delivery overclaims and retired tiers removed**
- **Did:** on the operator's go. Sample deliverable: the Delivery Options table (retired tier names, the
  undeployed `/api/v1/research` API, webhooks, Snowflake/BigQuery) and the unbuilt "Enterprise Delivery
  Schema" (with its Snowflake data-masking claim) replaced by what a bundle really is (one sealed ZIP:
  Markdown, CSV, the integrity files, `checksums.txt`, handed over manually; AWS Data Exchange "planned, not
  yet available"). "Verified citations: 41" → "cited identifiers" in both samples, with a note that the
  sample predates the gate and re-resolution. The licensed-pack offer for the unlicensed drug database and a
  leftover "DB identifiers" row removed. AWS setup guide (canonical `03-platforms/` copy and its collateral
  twin) and the Datarade collateral guide: retired Standard/Premium/Custom/Enterprise pricing replaced by
  "price from `OFFERINGS.md`, verbatim"; Snowflake delivery removed; Datarade copy's "Trevor Robey Inc."
  replaced by the legal name and wordmark.
- **State:** done; no retired-ladder figure left in `workspace/collateral/` or `07-outbound/`.
- **Still open:** `03-platforms/datarade/vendor-application.md` still describes Standard/Custom/Enterprise
  tiers with Snowflake/BigQuery/API delivery; the canonical Datarade guide lacks the Scoped Research Pack.
- **Touches:** the two samples, three platform guides, this board.

### 2026-10-24T08:41Z · Desktop Claude Code · **Pharmacovigilance samples: retired price ladder replaced with OFFERINGS.md**
- **Did:** on the operator's go, both customer-facing samples (`workspace/collateral/samples/`) lost the
  retired Standard / Premium / Custom / Enterprise-ARR ladder; the full deliverable now carries the
  `OFFERINGS.md` ladder table verbatim, the 2-page teaser a compact Tier · SKU · Price version, both with the
  posture line and the statutory LLC disclosure (missing before; the teaser's footer also said "Trevor Robey
  Inc."). `offers.md` no longer says the any-field prices are on hold. The trinc-business and trinc-marketing
  skills (outside the repo) were brought to canon and updated to 1.0.1.
- **State:** done; every price in both samples traces to `OFFERINGS.md`.
- **Still open in the same samples (operator's call):** the deliverable's "Delivery Options" table names the
  retired tiers and offers an undeployed API, webhooks and Snowflake/BigQuery delivery; "41 verified
  citations"; the license register offers a separately licensed drug-database pack that is not on the
  ladder. The two platform guides still carry the retired tiers.
- **Touches:** the two samples, `offers.md`, this board.

### 2026-10-24T06:42Z · Desktop Claude Code · **TRINC reorganization: Phase 7 done (learn-and-pitch pack; business tiers priced, booking gated)**
- **Did:** on the operator's "approve prices, gated", the five business-research tiers (Quick Brief $1,500 →
  Enterprise Program, custom) went into `OFFERINGS.md` → "Business research (any field)", marked "booking
  after the first live business-lane run", with the guarantee scope for `WEB:`/`SEC:`/`WB:`/`BLS:`/`EUROSTAT:`/DOI
  stated. Every "prices on hold" line for those tiers updated (feed prices stay on hold). The Copilot
  business-context renderer now copies that section too. New `docs/learn-and-pitch/` (parts 00–10 + a generated
  combined file, `scripts/build-learn-and-pitch-pack.py`): a study deck for the operator, an 8-slide
  biotech-investor pitch and a 10-slide all-buyers pitch, both leading with run #6 as proof of method, and
  three animation storyboards. brand-check and collateral-audit applied (fixed: the pack named the unlicensed
  drug database; three captions overstated re-resolution or completeness; one storyboard showed a template id).
- **State:** done. Found, not changed: **Investor Pre-Mortem (the lead SKU) and Cross-Silo have no documented
  fulfilment path**; Conference Synthesis Brief and Plain-Language Patient Brief have no code; the ICP table's
  market statistics have no sources on this machine. All flagged in the pack (`02` §C, `07`).
- **Next:** operator: push; run `node scripts/render-business-context.js --apply` (the vault note is now
  behind by the new tiers); read pack `03`, then write `docs/learn-and-pitch/00-in-my-own-words.md`; confirm
  how Pre-Mortem is fulfilled before the investor pitch goes out. Then Phase 8 (close-out).
- **Touches:** `OFFERINGS.md`, `STATUS.md`, `HOW-IT-WORKS.md`, the root and engine `CLAUDE.md`,
  `SYSTEM-REALITY.md`, `REVENUE_PLAYBOOK.md`, `WORKFLOW_CATALOG.md`, the tier-ladder draft, the renderer + test,
  `docs/learn-and-pitch/`, `scripts/`, the reorg manifest, "Current focus" (business-lane line), memory.
- **For whoever's next:** the brand-check, collateral-audit and offer-quote skills carry stale facts (the
  "Zero hallucinations" elevator, a 50-row feed cap, the retired catalog defect) and their `$` prices get
  mangled if invoked with args; take prices from `OFFERINGS.md` only.

### 2026-10-24T05:44Z · Desktop Claude Code · **TRINC reorganization: Phase 6 done (one clear doc set; opencode delegation lane retired)**
- **Did:** new root `HOW-IT-WORKS.md` (the plain-language story); `ARCHITECTURE.md` re-verified against live
  code and processes and rewritten as the record; README map, root `CLAUDE.md` (89K → ~21K, current only),
  `Claude/` and `Copilot-Everything/` `CLAUDE.md` rewritten; the engine `CLAUDE.md`, `docs/WORKFLOW_CATALOG.md` and
  `REVENUE_PLAYBOOK.md` brought current (incl. two run commands missing `--operator-approve` and a refused
  `run-dataset-mission.js` example). The June system map, the May dossier, the deletion log and the browser
  history moved to `docs/history/`. "Zero hallucinations" replaced with the `OFFERINGS.md` elevator everywhere
  live, including the vault's Copilot business-context note. On the operator's instruction, the Claude →
  opencode delegation lane is retired (three registrations, the server, its guardrail, `_opencode-bridge/`,
  the six repo `AGENTS.md` mirrors); `~/.config/opencode/` stays because the Copilot agent's opencode loads it.
- **State:** done. Engine 1331/1331, `verify.sh` 0 FAIL, lints, secrets, globals, phase29/23, connector audit,
  business-context `--check` OK, `test:profiles` 52.
- **Next:** operator: push; decide Ollama (no model installed: reinstall one or retire the proxy); review the
  price conflicts listed in `ops/reorg/2026-10-cleanup-manifest.md` Phase 6. Then Phase 7 (the Claude.ai
  learn-and-pitch pack).
- **Touches:** `HOW-IT-WORKS.md`, `ARCHITECTURE.md`, `README.md`, the `CLAUDE.md` files, `docs/history/`,
  `.mcp.json`, `ops/`, the engine's registry, catalog and revenue playbook; outside the repo `~/.claude.json`,
  `claude_desktop_config.json`, `~/.config/opencode/AGENTS.md`, the vault note, memory.
- **SCOPE NOTE:** repo docs and infra; "Current focus" untouched.
- **For whoever's next:** new browser-session entries go in `docs/history/browser-sessions.md`, not
  `CLAUDE.md`. Security Everything still names the opencode lane (hook matcher, `opencode-delegation-guard/`,
  se_parity); harmless until tidied there.

### 2026-10-24T04:33Z · Desktop Claude Code · **TRINC reorganization: Phase 4 closed, Phase 5 done (Claude's one Obsidian door)**
- **Did:** Phase 4 closed: operator renamed the GitHub repo to `trevorrobeyinc/TRINC` and pushed; live checks with
  Obsidian open all passed; obsidianwatch blessed (21:06 PDT, clean). Phase 5, after three operator decisions (keep
  the video tools, Raycast keeps its own door, Viz stays open in Ralph loops): the stdio adapter's `openclaw` profile
  (0.4.0, `openclaw-obsidian`) is now Claude's one door: runs + read-only vault search/read on `:8799` and the 12 Viz
  renders on `:8800`, written only into `Visualizations/`. Retired: the adapter's `claude` profile and its ungated
  `Copilot-Everything/.mcp.json` entry, the never-called engine `viz-bridge-mcp`, and the `:8798` bridge's tombstoned
  `research_publish` (+ two engine scripts). Declined again: one-plugin-one-port and the daemon merge.
- **State:** done, gates green: `test:profiles` 52/52 incl. live `:8799`/`:8800`, engine 1331/1331 (was 1343; the 12
  removed tests went with the adapter), bridge 27/27, `verify.sh` 0 FAIL, transport lints, globals, secrets,
  phase29/23. One live render landed: `Visualizations/trinc-one-door-check-2026-10-23.md`.
- **Next:** operator: run `node scripts/render-business-context.js --apply` (the Copilot business-context note is
  stale: 58 vs 66 connectors since the 10-21 Evidence Desk, plus `viz-bridge` now retired). New sessions see the
  27 tools after a restart. Then Phase 6 (one clear doc set).
- **Touches:** `Copilot-Everything/bridges/obsidian-stdio-adapter/{index.mjs,scripts/test-profiles.mjs,README.md}`,
  bridge dispatcher, `connector-registry.json`, `ops/reorg/2026-10-cleanup-manifest.md` (Phase 4 + 5 record), docs.
- **SCOPE NOTE:** repo infra (Obsidian bridges + adapter); "Current focus" untouched.
- **For whoever's next:** the running `:8798` bridge still holds the removed `research_publish` until Obsidian restarts
  it. Raycast's MCP registration still names the old path (via the symlink); re-register it before the symlink goes.

### 2026-10-24T03:48Z · Desktop Claude Code · **TRINC reorganization: Phase 4 rename done on disk (`/Users/myhome/TRINC`); GitHub rename next**
- **Did:** the operator ran `rename_to_trinc.py --apply` (folder moved, compat symlink at the old path, 109 Desktop/vault
  paths repointed, memory copied to the `-Users-myhome-TRINC` project key). Part 2, this session: every functional
  in-repo path (`.mcp.json` ×2, engine defaults, Command Center + Bridge Launcher sources, `ops/tr-suite`, CE scripts,
  2 tests); backup script → `scripts/trinc-backup.sh` (prefix `TRINC-FULL-backup-`); Command Center and Bridge Launcher
  rebuilt + deployed via `deploy.sh` (sha-verified); trinc-content re-staged; 27 live docs renamed with dated history
  protected; outside the repo: `~/.claude/settings.json` trust lines (operator OK'd), memory files, global `CLAUDE.md`,
  `SHARED-AGENT-RULES.md`, opencode `AGENTS.md`, skills, trinc-engineering 2.1.2 + trinc-productivity 1.0.1, and the
  recall hook (`FORMER_NAMES`: a TRINC session also searches "TrevClaw").
- **State:** engine suite 1343/1343 (twice), `verify.sh` 0 FAIL, transport lint clean, phase29/23 pass, connector-audit
  plugin section clean. Left verbatim on purpose: logs, handoffs, `docs/history/`, `audit/evidence/`, dated bundle
  names, and `state/runtime/state.json` run records (nothing reads those paths back).
- **Next:** (1) operator: open Obsidian, then `obsidianwatch.py --bless` / `--bless --confirm` (expect
  `protected_plugin_changed` for command-center + obsidian-bridge-launcher plus `data_json_changed` for both);
  (2) operator: rename the repo to `TRINC` in GitHub settings, then `remote set-url` + push; (3) live checks with
  Obsidian open (`obsidian_health`, `:8798`/`:8800` healthz, `test:profiles`); then Phase 5.
- **Touches:** this entry; the paths above; plan `~/.claude/plans/go-through-and-make-delightful-catmull.md`.
- **For whoever's next:** Claude.app re-wrote `ccd-session-presets.json` from memory on relaunch, so the preset named
  "TrevClaw-Obsidianodus" still starts at the old path (works through the symlink); fix it in the app's preset UI.
  The Raycast build (`~/.config/raycast/extensions/obsidian-bridge-fork`) and Security Everything (recall-hook source
  `perseus-vault/bin/`, `obsidian-security-bridge/test/build.mjs`, 24 docs) still name the old path. Both must be fixed
  before the symlink comes out.

### 2026-10-24T03:20Z · Desktop Claude Code · **TRINC reorganization: Phases 0–3 done (cleanup + personal tooling moved out); rename next**
- **Did:** operator approved a multi-session plan to make the repo business-only, rename it TRINC, give Claude one
  Obsidian door, and build a Claude.ai "learn and pitch" pack (`~/.claude/plans/go-through-and-make-delightful-catmull.md`).
  14 decisions answered (record: `ops/reorg/2026-10-cleanup-manifest.md`). Safety net: signed tag
  `pre-trinc-reorg-2026-10-23` + bundle `~/Documents/TrevClaw-Obsidianodus-FULL-backup-20261023-1950.bundle` (mirrored to
  ExtraCurricular). 132 MB of junk → `~/.Trash/trinc-reorg-2026-10-23/`; 105 retired files removed (`7dfac59`, `8b4c7f8`);
  Raycast extension + 3 personal plugins moved to their own `~/Code` repos; speckit KEPT (operator will use it for the
  business), old specs → `docs/history/`.
- **State:** Phase 3 staged, **commit pending one YubiKey touch** (signing timed out three times this session). Engine
  suite 1343/1343, `verify.sh` 0 FAIL, transport lint clean.
- **Next:** Phase 4 rename to `/Users/myhome/TRINC` (operator present: quit Obsidian + Claude.app, GitHub rename, push).
- **Touches:** this entry; root/Claude/Copilot-Everything/engine `CLAUDE.md`+`AGENTS.md` doc pointers; `ops/tr-suite/*`.
- **For whoever's next:** looks-stale-but-load-bearing files are listed in the manifest — `ARCHITECTURAL_BLUEPRINT.md`,
  `.github/`, `.githooks/`, engine `tasks/`, `workspace/comms/` (hash-chained ledger), every `workspace/missions/` dir.
  `npm run phase2:gates` stops at `verify-phase-workflow-policy.sh` from an agent shell: its dry run needs `git fetch
  origin` and the YubiKey PIN prompt (pre-existing since the remote returned 08-12).

### 2026-10-22T03:35Z · Desktop Claude Code (side sessions "business lane live" + "evidence-desk") · **Evidence Desk built; the business lane is ready for its first live run**
- **Did:** the Evidence Desk the first business run was parked for is committed as `a110f07` (signed, on `8a0f5c5`).
  New citable ids `BLS:` and `EUROSTAT:` (keyless), plus `CENSUS:` and `EIA:` (built, dormant until the operator registers
  free keys), each re-resolved at delivery. Also: an industry → NAICS → series map
  (`config/business-series-map.json`), an extractive passage condenser, and a deterministic scout brief replacing
  the scout's model call on the business lane. Operator decisions (2026-10-21): Brave Search API **later**; brief
  **replaces** the scout; the gate judges **model-written text only** (stricter); the business section gate uses
  SearXNG `science` until Brave is in. The build caught a blocker: the section gate searched the Bing-only `general`
  category and would have thrown `PHASE30_CITATION_COVERAGE_ZERO` after every role call was paid for.
- **State:** engine suite 1343/1343 (as the build session reported); **no live run yet**; `8a0f5c5` + `a110f07` not pushed.
  Recommended first run: `cost-reduction-analysis`, the 3PL warehouse question, `industry` "warehousing and logistics",
  `country` US (engine `docs/business-research-lane.md` § "Recommended first run").
- **Next:** operator pushes; blesses obsidianwatch (6 CRITICAL, command-center from this lane's deploy); opens Obsidian,
  arms `operator-approve`, dispatches the first run through Command Center. Small copy follow-ups: the brief is labelled
  "Literature Review" in the packager, and the search-coverage ledger says "biomedical database" on business runs.
- **Touches:** this entry, `STATUS.md` (Engine row, item 9). Build record:
  `~/Library/Application Support/Claude/side-session-notes/local_4b6dec9b-8f52-4386-8d5b-edb98b7d8fc4/RESULT-evidence-desk-p1-2026-10-21.md`.

### 2026-10-22T00:36Z · Desktop Claude Code (side session "business lane live") · **Business lane: first live run parked; pre-flight fixes in; "Evidence Desk" proposed**
- **Did:** pre-flight for the first live business-lane run (operator decision 2026-10-21: one engine, two lanes,
  same gate). SEC EDGAR (declared org + contact User-Agent), World Bank, OpenAlex, Crossref, SearXNG `:8891` and
  Miyo all answer. But **general web search is broken**: only Bing answers in SearXNG's `general` category, and it
  answers each multi-word query for one word (dictionary pages for "can", Culver City rentals for "warehouse").
  Also found: the templates sent the operator's question verbatim as the search query (OpenAlex: 0 works). Fixed
  with tests: keyword shaping (`business-sources/search-terms.js`) and a relevance guard (`web-evidence.js`
  `isOnTopic`, drops pages that mention under half the subject's words; all six junk pages seen live dropped).
  Command Center template list now carries `researchProfile` + `optionalInputs` and the run hint covers the
  business templates (built, **not deployed**). Lane documented in the engine `CLAUDE.md`, `SYSTEM-REALITY.md`,
  `THE-WHOLE-SYSTEM.md`, `README.md` and `docs/business-research-lane.md` (no prices: tiers on hold).
- **State:** **run PARKED by the operator** until a specialized evidence back end exists; inputs to be chosen after.
  Proposal: `~/Library/Application Support/Claude/side-session-notes/local_b7efebe5-050c-45cb-8e9d-41902f7f5132/PROPOSAL-evidence-desk-business-lane-2026-10-21.md`
  (official-statistics series ids BLS/Eurostat keyless + Census/EIA free keys; SearXNG `braveapi` = card-on-file
  service; extractive passage condenser; scout offload — run #6 measured 174K tokens, ~95% input).
- **Next:** operator answers the proposal's four decisions; a separate session builds P1; then the first run.
- **Touches:** this entry, `STATUS.md`; engine `openclaw-bridge/mcp/business-sources/{search-terms,web-evidence,openalex}.js`,
  `tests/core/business-research-lane.test.js` (30/30), the five docs above; `Claude/obsidian-command-center/src/{types.ts,
  util/template-loader.ts,util/template-summary.ts,bridge/mcp-bridge-server.ts}` + `test/template-summaries.test.ts` (32/32).

### 2026-10-21T23:53Z · Desktop Claude Code (hub) · **Four stale August sessions replaced by siblings; the business picture is one page again**
- **Did:** The operator asked to bring "Google Workspace setup check", "Google Workspace AWS setup handoff",
  "Business plugin configuration" and "TR-INC launch" (Aug 12–20, outside the session nest) in as siblings and
  finish their work. Four sibling sessions took them over with disjoint file ownership (no commits, no shared-file
  edits) and reported back; the hub folded their deltas into `../STATUS.md`. Findings that matter: **Google
  Workspace payment FAILED — suspension 2026-11-02 would take business mail and the AWS root email (`aws@`) down**;
  agency-mail search of `trevor@` = zero hits (notices come by post; the Zoho-era mailbox was not searched); LLC-12
  now needs bizfile "User Access"; FTB Web Pay entity ID is `20260217250`; Graveyard Feed refresh reviewed with 0
  problems and listing files finalized (not uploaded; price back on hold); plugin bindings + connector registry
  reconciled (6 bound, 8 tombstoned, 62 connectors, plugin audit clean); Zoho DNS confirmed clean; GAM7 declined.
- **State:** done and committed (signed batch, operator's go). The two tested sibling patches — the
  feed-generator copy fix (from `claude/festive-bun-087452`) and the connector-audit fix — were applied on the
  operator's go (feed tests 13/13, audit clean). The remaining listing/generator follow-ups are DEFERRED by the
  operator until the business-engine work is set up (list in `../STATUS.md`).
- **Next:** operator queue in `../STATUS.md`, Workspace payment first.
- **Touches:** `STATUS.md`, root `CLAUDE.md` (plugin count), `Claude/CLAUDE.md` + `ops/tr-suite/manifest.json`
  (trinc-content now gated); siblings: `03-platforms/{google-workspace,aws-data-exchange,business-identity-map.md}`,
  `00-business-formation/**` (+ new `filing-walkthrough-2026-10.md`), `PLUGIN-BINDINGS.md`,
  `config/{plugin-bindings,connector-registry}.json`, `CONNECTOR-ALIGNMENT.md`, `product-strategy/`,
  `workspace/aws-marketplace-listing/trial-graveyard-feed/*`; outside the repo: two entries in
  `~/Security Everything/docs/browser-session-history/2026-10.md` + `INDEX.md` (uncommitted there).
- **For whoever's next:** the four August originals may be deleted — their work lives in the siblings
  ("workspace-setup", "aws-obligations", "plugin-config", "first-listing"). The Claude Browser pane is per
  conversation: a sibling's sign-in does not carry over.

### 2026-10-21T10:45Z · Desktop Claude Code (side session) · **Zoho retired by operator decision; everything moves to Google Workspace**
- **Decided (operator, 2026-10-21):** retire Zoho completely, and strip both Zoho MCP servers from every security-gate list (no
  fail-safe deny). Never register `zoho-trinc` or `zoho-mail` again: a new registration would be ungated.
- **Done:** the AWS root email is `aws@trevorobeyinc.com`, a Workspace group (R1 closed, `77bfc27`); the nightly security digest is
  file-only (it had failed on Zoho SMTP every morning since 07-22; SE `33d0ad1`); business records updated (connector registry +
  plugin bindings mark Zoho retired, CONNECTOR-ALIGNMENT, SYSTEM-REALITY, THE-WHOLE-SYSTEM, business-identity-map, STATUS).
- **Waiting on the operator:** the Security Everything gate release that gates `trinc-content` and unregisters/strips Zoho
  (validated; signing touch + one sudo-gate touch). Patch + script `/Users/myhome/.claude/plans/trinc-zoho-release/`.
- **In progress elsewhere:** Zoho account shutdown, DNS clean-up (SPF `include:zoho.com`, `zoho._domainkey`, verification TXT) and the
  phone apps in a console session; Falcon rule 219's exclusion narrowing (propose-only).
- **Plan of record:** side-session notes `PLAN-zoho-to-google-workspace-2026-10-21.md` (folder `side-session-notes/local_b7efebe5-…`).

### 2026-10-21T07:38Z · Desktop Claude Code · **Handoff continued: monorepo made one production source; compliance recorded; feed refreshed; board rolled over**
- **Did:** Picked up `handoffs/HANDOFF-2026-10-21.md` (now housed in the repo). (1) **trinc-content absorbed**
  with history → `Claude/trinc-content-mcp/` (signed `e485565`, `git subtree -S`) + `install-connector.sh`.
  (2) **v3 Copilot fork retired** (`repos/obsidian-copilot-mcp`, 636 files), with `sync-copilot-fork.sh`,
  `copilot-update-watcher.sh` (LaunchAgent not installed) and the committed dev-lane build snapshot
  `deploy/obsidian/plugins/copilot` (now untracked, kept on disk). **Found + fixed:** the live v4 fork's
  `src/state/` and `src/modelManagement/state/` were never tracked — the `state/` ignore rule's
  re-include named only v3, so a fresh clone could not build the production plugin. (3) **Vault = deployed
  copies only:** `contextual-wiki-definitions` was a symlink into `~/Code/obsidian-auto-wiki-summarize` →
  now a real folder (same bytes, `data.json` kept); `origin-nest`'s and the trinc-content runtime's dev
  `.git` moved out; the old repos sit in `~/Code/_retired-absorbed-into-monorepo/` (nothing deleted).
  (4) **`ops/tr-suite/deploy.sh`** — the one production deploy path (dry-run default; backup, sha verify,
  symlink→folder, refuses a `.git` target; apply paths tested on a scratch vault). `verify.sh` now FAILs a
  deploy target that links outside the repo or holds a `.git`, and checks staged MCP copies (57 PASS,
  0 FAIL). (5) Docs: v3 → v4 across live-guidance docs; root `README.md` stale `trevor-robey-inc*` paths
  fixed; `CLAUDE.md`/`AGENTS.md` submodule path (the audited "CLAUDE.md:148") + template count (10);
  `Copilot-Everything/CLAUDE.md` `Code/` section superseded for TR plugins; amendment-risk band marked
  **paused** (not deleted) in OFFERINGS / REVENUE_PLAYBOOK / Launch Playbook. (6) **Compliance recorded**
  (`00-business-formation/compliance/compliance-calendar.md`). (7) **Graveyard Feed refreshed** into
  staging. (8) `STATUS.md` created; `pva-loan-closet/` (personal) moved to `~/Code`; this rollover.
- **State:** done — everything after `e485565` is **uncommitted** pending the operator's go (signed commits).
- **Next:** operator queue in `../STATUS.md`; obsidianwatch `--bless` for `contextual-wiki-definitions`
  with Obsidian open; CI decision (no GitHub Actions — free/local options offered, nothing built).
- **Touches:** `Claude/trinc-content-mcp/`, `Copilot-Everything/{.gitignore,repos,scripts,deploy,docs,CLAUDE.md,AGENTS.md}`,
  `ops/tr-suite/{deploy.sh,verify.sh,manifest.json,absorb-external-plugins.sh}`, `scripts/lint-transport-monorepo.sh`,
  root `README.md`/`CLAUDE.md`/`AGENTS.md`/`ARCHITECTURE.md`/`STATUS.md`, `Claude/CLAUDE.md`, business
  `OFFERINGS.md`/`REVENUE_PLAYBOOK.md`/Launch Playbook/`00-business-formation/`, `_continuity/{handoffs,log}/`;
  outside the repo: vault `.obsidian/plugins/{contextual-wiki-definitions,origin-nest}`,
  `~/.claude/mcp-servers/trinc-content/.git`, `~/Code/{_retired-absorbed-into-monorepo,pva-loan-closet}`.
- **For whoever's next:** the feed-refresh skill's "`--pageSize` defaults to 20" landmine is **obsolete** —
  `build-graveyard-feed.js` runs a full census since 2026-07-30 and ignores `--pageSize`. And the engine
  `CLAUDE.md`'s "CI: GitHub Actions" line describes a workflow file GitHub never runs (it is not at the repo
  root).

### 2026-10-21T04:10Z · Claude (project thread "Business monorepo audit") · Business research lane added to the engine
- **Did:** Added a `research_profile: "business"` lane inside the same engine so non-biomedical reports pass the same citation gate: new citable ids `WEB:` (content-hashed page snapshot), `SEC:` (EDGAR accession), `WB:` (World Bank indicator) plus OpenAlex DOIs; 3 templates (`business-research-pack`, `cost-reduction-analysis`, `market-landscape`); business wording + `deliverables/sources/` in the packager. Biomedical paths unchanged.
- **State:** done — committed (signed by Trevor) and pushed to `trevorrobeyinc/TrevClaw-Obsidianodus` main on 2026-10-21; first live run still pending. 23 new tests pass; full suite shows the same 90 pre-existing failures as before the change; restricted-globals and transport lints pass.
- **Next:** Trevor runs one live `cost-reduction-analysis` run on the Mac (command in `Trevor Robey Intelligence Network Citations/docs/business-research-lane.md`), then commits.
- **Touches:** see `docs/business-research-lane.md` "Where it lives".
- **For whoever's next:** a WEB citation proves "exactly what was read, from this URL, at this time", never that the page is live or correct — keep the guarantee copy scoped to that.

### 2026-10-19T01:55Z · opencode · **Fixed: stale hardcoded Copilot Plus model list made `kimi-k2.7-code` (and 3 others) 400 against the brevilabs relay.**
- **SCOPE NOTE:** repo code in the Copilot fork (`repos/obsidian-copilot-mcp-v4`) + a production-vault plugin runtime deploy; "Current focus" untouched.
- **Root cause:** the plugin keeps a hardcoded snapshot of the brevilabs relay catalog (`COPILOT_PLUS_MODELS` in `src/modelManagement/setup/copilotPlusSync.ts` + the `ChatModels` enum in `src/constants.ts`). The relay retired `kimi-k2.6`, `kimi-k2.7-code`, `mimo-v2.5`, `minimax-m2.7` and added `glm-5.3-flash`, `deepseek-v4.1-flash`, `mimo-v2.6-flash`, `minimax-m3`. Sending a retired id to `models.brevilabs.com/v1` returns `400 {"detail":{"error":{"message":"LLM model kimi-k2.7-code not supported","type":"invalid_model"}}}`.
- **Did:** reconciled both files to the live relay catalog (verified by hitting `https://models.brevilabs.com/v1/models`). 8 models, 6 default-enabled (flash, glm-5.2, glm-5.3-flash, deepseek-v4-pro, deepseek-v4.1-flash, minimax-m3); mimo-v2.6-flash and deepseek-v4-flash-0731 ship off. Updated 3 tests (`copilotPlusSync.test.ts`, `chatModelManager.bridge.test.ts`, `descriptor.test.ts`); left the generic `kimi-2.6`/`provider:"moon"` mock in `AgentSession.test.ts` alone (not a relay id). Typecheck clean, 31/31 affected tests pass, `npm run build` succeeded.
- **Deployed:** `scripts/deploy-mcp-runtime-to-official-plugin.sh` copied the new `main.js` into `~/My Digital Garden/.obsidian/plugins/copilot/main.js` (verified: 4 new ids present, 0 old ids, mtime 01:53); backup at `deploy/backups/20261019-015335-copilot-official-runtime-pre-mcp-overlay/`. **The script's `plugin:reload` step restarted this Copilot agent chat twice (the plugin IS the host of this session), so the reload was NOT run by the agent. Operator must reload the `copilot` plugin (or restart Obsidian) to load the new runtime.**
- **Immediate workaround for the user (pre-reload):** pick GLM-5.2, DeepSeek V4 Pro, DeepSeek V4.1 Flash, GLM-5.3-Flash, MiniMax M3, or Copilot Plus Flash in the model picker — any of those routes through the live relay. `kimi-k2.7-code` is dead on the relay and no client change resurrects it.
- **Rollback:** `cp <backup>/main.js "/Users/myhome/My Digital Garden/.obsidian/plugins/copilot/main.js"` + reload.
- **Not done:** the staged `deploy/obsidian/plugins/copilot/main.js` is still the Sep 1 build (the deploy script reads from `PLUGIN_REPO/main.js`, not the staged copy, so this is cosmetic; `dev-build.sh` would refresh it if wanted).

### 2026-10-19T00:13Z · opencode · **Fixed: the `guided-learning` skill's invalid frontmatter (it was being silently skipped).**
- **SCOPE NOTE:** vault skill file (`~/My Digital Garden/copilot/skills/guided-learning/SKILL.md`), not repo code; "Current focus" untouched. Follows the 2026-10-18T23:44Z entry (same investigation).
- **Did:** the `description:` value was an unquoted plain scalar containing a colon-space (`…where they are working: appended…`), which YAML rejects → the plugin logged `[skills] Skipping copilot/skills/guided-learning/SKILL.md` and the skill never loaded. Rewrote it as a YAML block scalar (`description: >-` + indented value); the value is byte-identical (932 chars).
- **Verified live:** reloaded the `copilot` plugin twice. The "Skipping" warning is gone (0 hits); `[skills] Discovered … managed skill(s)` went **18 → 19** (18 canonical + 1 opencode project skill `compaction`); the per-agent symlinks `.claude`/`.agents`/`.opencode/skills/guided-learning` now resolve to `name: guided-learning`.
- **One transient, benign:** on the first post-fix load the manager logged `[skills] Gave up waiting for vault events on: .claude/.agents/.opencode/skills/guided-learning` — its 10 s safety timer firing because the vault events confirming the newly-created symlinks had not arrived during the reload. It did **not** recur on the second load, and the manager's reconcile re-discovered cleanly.
- **Touches:** `~/My Digital Garden/copilot/skills/guided-learning/SKILL.md` only.

### 2026-10-18T23:44Z · opencode · **Copilot Agent Chat failure is the Copilot Plus plan's token limit, not the video-pipeline/whisper change.**
- **SCOPE NOTE:** repo infra/troubleshooting inside the monorepo (Obsidian Copilot + the Raycast video pipeline); "Current focus" untouched. Diagnostic only — no code changed.
- **Question:** the operator's agent chat stopped responding after the 2026-10-17/18 whisper-fallback work on the video pipeline. Checked whether the dev console points at that change.
- **Verdict:** it does not. The change is confined to `bridges/raycast-obsidian-extension/` (`videoTranscribeFlow.ts`, `package.json`, `raycast-env.d.ts`, spec) — the Parakeet-lane/whisper-fallback split — and it WORKS: today's runs (`2026-10-18T10:47Z`, `11:19Z`) both logged `RUN SUCCESS` with `transcriber = engine=parakeet-mlx …`. The chat failure is Copilot-side.
- **What the dev console shows** (via the canonical bridge `:8798` dev-console tools): the plugin's model gateway (`models.brevilabs.com`, plan `believer`) returns `token_limit_error`, so the chat renders *"You've reached your usage cap… purchase credits on your usage dashboard: https://www.obsidiancopilot.com/en/dashboard/token-usage"*; the agent lane separately throws `Stream error: Connection error.` (`$n.makeRequest`, `plugin:copilot:598:4457`). The agent transcript `copilot/copilot-conversations/agent__use_video_pipeline_runner…@20261018_160530.md` is EMPTY (`usedTokens:0 inputTokens:0 outputTokens:0`), while the 10-13 and 10-07 transcripts are full (99,966 / 164,881 tokens).
- **Reachability verified:** the Local REST API `:27124` is itself a streamable-HTTP MCP server (Bearer token in the bridge `.env.local`) — `initialize` + `tools/list` succeed, but it exposes only `vault_list/read/read_binary/write`, NOT the dev console; the dev-console tools live on `:8798`.
- **Next (operator):** check `https://www.obsidiancopilot.com/en/dashboard/token-usage` / add credits; the whisper change needs no action.
- **Touches:** this entry only.

### 2026-10-15T12:03Z · Desktop Claude Code · **Video Pipeline Runner: the run log names the transcriber that actually ran; tests stop writing the live log.**
- **SCOPE NOTE:** bridge/plugin infra inside the repo; "Current focus" untouched. Follows the 11:30Z and 10:30Z entries; all three were committed together as three commits at the operator's request.
- **Why:** the Copilot agent reported "Whisper transcribed the audio (task=translate model=medium)". In fact the "Whisper Path" is `~/.local/bin/whisper-parakeet-shim`, which runs parakeet-mlx and discards `--model` and `--task`, since parakeet only transcribes. The log line the agent quoted recorded the REQUEST. Separately, `vitest run` appended fixture lines to the LIVE run log (205 since August), and `video_pipeline_status` showed those as the latest line of a real run.
- **Did:**
  - The shim (outside the repo) writes one `TRANSCRIBER engine=… model=… task=… hub=offline ignored=…` line to stderr.
  - `parseTranscriberReport` reads that line; the run log now carries `transcription requested: …` and `transcription engine: …`, and the wording is engine-neutral ("audio transcription").
  - `runLogPath` honours `VIDEO_PIPELINE_RUN_LOG`, which `vitest.config.ts` sets to a temp file.
  - The vault skill `copilot/skills/video-pipeline/SKILL.md` (outside the repo) now tells the agent to name the engine from that line only.
  - Earlier the same day the shim was made offline (pinned snapshot, `HF_HUB_OFFLINE`), because its Hugging Face revalidation tripped Falcon Custom-IOA rule 244 on every run.
- **State:** done and deployed (`npm run build`; live bundle verified by grep). `tsc` clean; `vitest run` 427 passed / 6 skipped (4 new); a full test run leaves the live log's line count unchanged.
- **Next:** a separate session is adding a `transcriber` field to command-center's `video_pipeline_status` and replacing its "subtitles or Whisper" wording.
- **Touches:** `Copilot-Everything/bridges/raycast-obsidian-extension/` `src/tools/videoTranscribeFlow.ts`, `src/tests/videoTranscribeFlow.spec.ts`, `vitest.config.ts`.
- **For whoever's next:** the `TRANSCRIBER ` stderr line is a contract between the shim and `parseTranscriberReport`; keep its prefix and key=value shape. Tests no longer need `HOME` pointed at a scratch dir to protect the run log.

### 2026-10-15T11:30Z · Desktop Claude Code · **Video Pipeline Runner: one run at a time, a cookie-free last resort, run ids in the log.**
- **SCOPE NOTE:** bridge/plugin infra inside the repo; "Current focus" untouched. Builds on the 10:30Z opencode entry (its uncommitted whisper-only change is in the same file and stays).
- **Why:** at 10:37Z the operator got a YubiKey PIN + touch they could not account for, then a "Downie failed" toast. Cause: the 10:25Z re-dispatch did NOT kill the 10:19Z run parked in Downie's UGE wait; both watched `~/Downloads`, the OLD run took the file and logged RUN SUCCESS, and the starved NEW run hit its 12-min timeout and fell into the last resort, which unsealed `sealed-cookies.txt.gpg` (a whole-browser Chrome export, July 6) for a yt-dlp attempt that failed ("No video formats found"). yt-dlp never once produced a download in 89 logged runs.
- **Did (operator go, "apply the full fix"):** (1) each run claims `~/.local/share/raycast-obsidian/current-run` at RUN START and a run the marker no longer names stands down at its next 4 s poll (`RUN SUPERSEDED`, quiet exit, no fallback); (2) the yt-dlp last resort is cookie-free: unseal code, the `--cookies-from-browser` six-browser loop and the three `ytDlpCookies*` prefs removed, `assertYtDlpArgsCookieFree` refuses a re-added flag, login-gated hosts stop at Downie with an actionable error; (3) every run-log line carries `[run <id>]` (AsyncLocalStorage, not a module variable); (4) `scripts/seal-yt-cookies.sh` removed.
- **State:** done and deployed. `tsc --noEmit` clean, `vitest run` 423 passed / 6 skipped (11 new; 3 fewer manifest cases from the removed prefs), the stand-down regression test proven to FAIL with the check removed; `npm run build` succeeded and the live bundle was verified. NOT committed (neither this nor the 10:30Z change).
- **Next:** operator deletes the sealed jar (`~/.local/share/raycast-obsidian/sealed-cookies.txt.gpg`) now that nothing reads it; the next real LinkedIn run should show `[run …]` prefixes and no unseal line.
- **Touches:** `Copilot-Everything/bridges/raycast-obsidian-extension/` `src/tools/videoTranscribeFlow.ts`, `src/videoTranscribeRunnerCommand.tsx`, `src/tests/videoTranscribeFlow.spec.ts`, `src/tests/live/raycast-operator.live.spec.ts`, `package.json`, `INTEGRATION_README.md`, `scripts/seal-yt-cookies.sh` (deleted).
- **For whoever's next:** run this package's tests with `HOME` pointed at a scratch dir: several tests write the REAL run log through `os.homedir()`, and the new marker tests take an injected path so they never touch the live `current-run`. Never put the Chrome keychain item's name on a command line: a verify grep carrying it was blocked by Falcon at ~11:27Z.

### 2026-10-15T10:30Z · opencode (Obsidian Copilot agent) · **Video Pipeline Runner: added a `transcriptSource` preference, defaulting to Whisper-only.**
- **SCOPE NOTE:** bridge/plugin infra inside the repo; "Current focus" untouched.
- **Did:** the Raycast "Video Pipeline Runner" (`bridges/raycast-obsidian-extension`) preferred the video's subtitle sidecar and only fell back to Whisper, and every LinkedIn Learning run hit the fallback (missing sidecar, or a non-Latin sidecar rejected by the `isLatinScriptTranscript` guard). Added a `transcriptSource` preference (`whisper` | `auto`) that defaults to `whisper`, so a run now skips the sidecar probe entirely and always transcribes the audio. `auto` restores the original sidecar-first behaviour.
- **State:** done — `npm run build` (build IS deploy) succeeded; `npx vitest run` 415 passed / 6 skipped.
- **Next:** none required — the default already applies. If a future host needs sidecar-first, flip the pref to `auto` in the command's Raycast preferences.
- **Touches:** `src/tools/videoTranscribeFlow.ts` (pref type, `resolveTranscriptSource`, the transcript-lane branch ~line 1707, whisper-only log line), `package.json` (command preference), `src/tests/videoTranscribeFlow.spec.ts` (3 new tests); deployed to `~/.config/raycast/extensions/obsidian-bridge-fork/`.
- **For whoever's next:** the live extension is NOT a symlink — it is the built output, so a source edit alone changes nothing until `npm run build`. `whisperTask` still defaults to `translate`; that is a separate knob.

### 2026-10-13T13:55Z · Desktop Claude Code · **The Copilot Plus relay adds hidden text to three models; recorded, not a security finding.**
- **SCOPE NOTE:** machine tooling, outside the repo. "Current focus" untouched. Follows the 13:30Z entry.
- **Why it came up:** while the operator was testing reasoning in Raycast, a model's visible thinking mentioned an instruction to call itself Obsidian Copilot, which looked like an injection.
- **Measured:** a bare "hi" sent straight to the relay costs 79 prompt tokens on `copilot-plus-flash`, 84 on `deepseek-v4-flash-0731` and 177 on `minimax-m2.7`, against 5 to 13 on `deepseek-v4-pro`, `kimi-k2.6`, `glm-5.2` and `mimo-v2.5`. Flash calls itself Obsidian Copilot even under a "You are Raycast AI" system message; `deepseek-v4-pro` says Raycast AI. Sending `reasoning_effort: high` adds exactly 26 tokens on Flash and Pro, which is how those two are switched into thinking.
- **Verdict:** the only instruction seen concerns identity, and the vendor already receives every prompt, so nothing new is exposed. The full text was deliberately not extracted, and the other two models were not asked who they are.
- **Operator note:** pasting a thinking model's quote of that instruction into a Claude chat trips the app's injection filter; save it to a file instead.
- **Touches:** this entry; `Copilot-Everything/docs/RAYCAST_COPILOT_PLUS_PROVIDER.md` ("Hidden text the relay adds to some models") and `Copilot-Everything/CLAUDE.md`. The live `providers.yaml` was not changed.

### 2026-10-13T13:30Z · Desktop Claude Code · **Raycast's Copilot Plus models now reason, defaulting to high.**
- **SCOPE NOTE:** machine tooling, outside the repo. "Current focus" untouched. This continues the 07:54Z entry; that session hit its usage limit partway through this question.
- **What:** in `~/.config/raycast/ai/providers.yaml`, all 7 models now declare `reasoning_effort: supported: true`, and the provider sets `additional_parameters: {reasoning_effort: high}` (operator's choice). A 0600 backup of the earlier file sits beside it as `providers.yaml.bak-pre-reasoning-20261013`. The key was never printed.
- **Verified:** the relay accepts `reasoning_effort` on all 7 models and checks the value: anything outside `none|minimal|low|medium|high|xhigh|max` gets a 422. Thinking streams as `reasoning_content`. `copilot-plus-flash` and `deepseek-v4-pro` produce **zero** reasoning tokens unless the parameter is sent, so the `high` default is what turns their thinking on. The smoke test (now sends the provider's `additional_parameters`, `max_tokens` 1500) passed: 7/7 chat, tool call, image.
- **Open:** Raycast does not document whether a level picked in its picker overrides `additional_parameters`.
- **Drive copy:** the 07:54Z session ran with its cwd in the Google Drive offsite copy (`TRINC/Monorepo/…`), but every write went to the real repo or `~/.config`. Only its memory note was misfiled; it is now copied to this repo's project memory.
- **Touches:** this entry; the template, the doc ("Reasoning: what the relay does"), the smoke test, and `Copilot-Everything/CLAUDE.md`.

### 2026-10-13T07:54Z · Desktop Claude Code · **Raycast AI now runs on the Copilot Plus relay, the model behind Obsidian's opencode agent.**
- **SCOPE NOTE:** machine tooling, outside the repo. "Current focus" untouched.
- **What:** `~/.config/raycast/ai/providers.yaml` (0600, not in git or Drive) adds a custom provider, `copilot-plus`, with base `https://models.brevilabs.com/v1`. That is the same endpoint and credential Copilot injects into `opencode acp` at spawn (`OpencodeBackend.ts` `buildOpencodeConfig()`), so Raycast works while its own credits are at zero. The operator pasted the Copilot Plus **license key** in; Brevilabs issues no per-app key, so this key now lives in two places, and **a rotation must update both**.
- **Verified:** 7 models answered a streamed chat (`copilot-plus-flash`, `kimi-k2.6`, `glm-5.2`, `deepseek-v4-pro`, `deepseek-v4-flash-0731`, `mimo-v2.5`, `minimax-m2.7`). Flash also passed a tool-call test and an image test. **`kimi-k2.7-code` was removed**: the relay answers HTTP 400 `invalid_model` even though Copilot's Plus provider lists it.
- **Open:** Brevilabs' terms on using the key outside the plugin are unverified (the operator accepted that risk); Raycast and Obsidian share one Plus quota. Fallback if the relay is lost: OpenCode Zen's free zero-retention models via `https://opencode.ai/inference/v1`, verified live the same day. Nothing in `~/.config/opencode/` or the Copilot plugin changed.
- **Touches:** this entry; new `Copilot-Everything/docs/RAYCAST_COPILOT_PLUS_PROVIDER.md` (full doc and rebuild steps); `Copilot-Everything/configs/raycast/providers.copilot-plus.template.yaml` (copy with a placeholder key; the live file stays out of git); `Copilot-Everything/scripts/raycast-relay-smoke.py` (prints no key); `Copilot-Everything/CLAUDE.md` (Scripts list plus a "Raycast AI custom provider" subsection).

_Older entries (234, 2026-10-08 and earlier) archived to [`log/CONTINUITY-2026-10-21.md`](log/CONTINUITY-2026-10-21.md)._

---

## ➕ Entry template (copy me)

```markdown
### <UTC timestamp, e.g. 2026-07-01T11:09Z> · <surface> · <short title>
- **Did:** <what changed — decisions + actions, not just "worked on X">
- **State:** working | blocked | handed-off | done
- **Next:** <the concrete next action, with file:line where it helps>
- **Touches:** <key files / paths>
- **For whoever's next:** <the one thing the next surface must know — gotcha, constraint, or nothing>
```

*Surfaces:* `CLI Claude Code` · `Desktop Claude Code` · `Cowork` · `Claude Chat`.
*Timestamps:* UTC, `date -u +%Y-%m-%dT%H:%MZ` (Chat: use the current UTC time).
