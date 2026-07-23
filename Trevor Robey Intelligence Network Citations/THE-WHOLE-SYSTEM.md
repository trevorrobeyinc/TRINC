# THE WHOLE SYSTEM — Trevor Robey, INC. (read this one file)

> **The single map of everything (2026-06-10).** What the business is, how the whole technical stack fits together, what is actually running, and what is not. Self-contained — you don't have to open anything else. Deeper dives are linked at the bottom. Verified by a live health check on 2026-06-10, not just by reading config.
>
> **Status legend:** 🟢 verified running now · 🟡 built & wired but unproven / not deployed · 🔴 not live · ⚪ removed.

---

## 0. Straight answer: is it running smoothly?

**Two different questions — and the answers differ:**

| | Verdict |
|---|---|
| **Is the technical plumbing up?** | 🟢 **Yes.** Obsidian, all the bridges, and the supporting services are running right now (verified). |
| **Does the research engine actually work end-to-end?** | 🟢 **Yes — FIXED & PROVEN 2026-06-10.** It was blocked at a human-approval gate; that's now wired through an opt-in `--operator-approve` flag. A real run completed all **5/5 pipeline steps**, produced a **196-row dataset with 219 citations** (NCT trials, ChEMBL, JAMA DOI, UniProt), and exported an **88 KB bundle** containing a 61 KB `report.md`. See "§0a." Citations are now **grounded in the source records actually retrieved at runtime + DOI retraction-screened (Crossref)** via the citation-integrity layer (§3a) — not re-resolved against live external databases (see §9). |
| **Is the business running smoothly?** | 🔴 **No — it's pre-launch.** $0 revenue, 0 live marketplace listings, 0 discovery calls, 0 signed deals. The tooling exists; the commercial motion hasn't started. |

**So the honest one-liner:** the engine now **demonstrably produces a complete citation-traced report** (first one ever, 2026-06-10) — but you still have **not sold anything**. The single most valuable next step is the business motion (revised 30-day plan, §8); the engine is no longer the blocker.

### §0a — Engine: blocked → FIXED (2026-06-10)

**What was wrong:** a real `general-research-pack` run died at `PHASE15_HUMAN_APPROVAL_REQUIRED` — `openclaw-bridge/core/role-router.js` requires `context.operatorApproved === true` for every research role's `execute_task`, and **no production path ever set it** (`operatorApproved:true` existed only in a unit test). The Phase-30 tests passed only because they mock the mission spawner, so they never hit the real gate. That's why zero reports existed.

**The fix (applied + tested):**
1. **`scripts/run-workflow.js`** — added an opt-in **`--operator-approve`** flag (default OFF / fail-closed). It threads `operatorApproved` through `executeWorkflow` → `executeMissionStep` → `spawnMission` → the dispatch context the gate reads. The gate itself is **unchanged**: without the flag, every run still blocks exactly as before (verified). Setting it is the explicit, audit-logged (`phase15_operator_approval_granted`) human approval that the operator typing the command provides.
   - **YubiKey consent gate (2026-06-11):** `--operator-approve` is now itself gated behind a YubiKey PIN+touch ceremony, mirroring `cdp-gate`/`gh-mcp`. The flag is only honored if a FRESH armed token exists; `run-workflow.js` verifies+consumes it via `openclaw-bridge/core/operator-approve-gate.js` (one-shot, TTL 300s, nonce-rotated, fail-closed). To authorize a run: `operator-approve-gate arm` (PIN via pinentry + touch) → then `run-workflow.js --operator-approve …`. Gate CLI: `~/Security Everything/openclaw-approve/bin/operator-approve-gate` (setup/arm/disarm/status); state in `~/.local/state/openclaw-approve/`; nonce sealed to the same YubiKey OpenPGP key as cdp-gate (`E7C4…`). Test/CI bypass: `OPENCLAW_APPROVE_GATE=0`.
2. **`openclaw-bridge/monetization/deliverable-packager.js`** — fixed a second, pre-existing bug surfaced by the run: `commitBundle` used `rename()` from `$TMPDIR` (internal disk) into `workspace/releases` (external volume), which throws `EXDEV` across filesystems. Added a copy-fallback so packaging works wherever the repo is mounted.
3. **Regression tests** (`tests/core/phase30-operator-approve.test.js`, 5 cases): flag-off and explicit-false still throw `PHASE15_HUMAN_APPROVAL_REQUIRED`; flag-on passes; the flag is actually forwarded into `spawnMission`. All green; no existing tests regressed.

**Proof it works:** with `--operator-approve`, the workflow completed 5/5 steps — `claude -p` ran the scout/analyst/synthesizer (scout alone used ~263K tokens), built a 196-row dataset (219 citation hits), and exported `workspace/releases/offer-…-export.zip` (88 KB; `deliverables/report.md` is 61 KB, plus tables.csv, evidence appendix, store copy, and a Datarade submission pack). LM Studio/Ollama remained down throughout — irrelevant, since `claude` is the primary brain.

---

## 1. What the business is

| | |
|---|---|
| **Legal entity** | Trevor Robey Intelligence Network Citations LLC (California; filed 2026-05-06, receipt B20260217250) |
| **CA SOS approval** | recorded "pending" as of 2026-05-07 — **verify it's now approved** |
| **Brand wordmark** | **Trevor Robey, INC.** — "INC" = *Intelligence Network Citations* (backronym, not a corporate suffix) |
| **Domain / email** | trevorobeyinc.com · trevor@trevorobeyinc.com (**Google Workspace/Gmail since the 2026-07-22 MX cutover** — SPF/DKIM/DMARC live; Zoho retained as archive + secondary sender during transition; alias trevorrobeyinc@gmail.com; see `03-platforms/google-workspace/setup-runbook.md`) |
| **Tagline** | *Every claim, sourced. Every risk, named. In days, not weeks.* |
| **What you sell** | Citation-traced biomedical due-diligence reports — every claim resolves to a public identifier (PMID, NCT, ChEMBL, DOI). Niche = medical research; ambition = any vertical. |
| **Lead product** | Investor Pre-Mortem — $9,950 / $14,950 / $19,950. Flanking: Failed Trial Archaeology $14,950. Tactical SKUs $2,500–$9,950. (Canonical list: `OFFERINGS.md`.) |

---

## 2. The architecture in one diagram

```
        YOU type a research question in Obsidian Copilot chat
                              │
                              ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  OBSIDIAN (running 🟢, PID 15174)                              │
   │   • Copilot plugin (chat UI)                                   │
   │   • openclaw-command-center plugin → MCP bridge :8799 🟢       │
   │   • Local REST API :27124 🟢   • vault-zettelkasten plugin     │
   └─────────────────────────────────────────────────────────────┘
                              │ spawns
                              ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  OPENCLAW RESEARCH ENGINE                                      │
   │   scripts/run-workflow.js  (Phase 30; plain Node process)      │
   │   • 6 workflow templates, 6 agent roles                        │
   │   • LLM brain = claude-code CLI 🟢 (Opus 4.8) for ALL roles    │
   │     (all roles run on claude-code — no OSS helper/fallback)    │
   │   • ToolUniverse = 2,116 biomedical tools (vendored) 🟡        │
   │   • citation-extractor.js = regex pulls PMID/NCT/ChEMBL/DOI    │
   │   • citation-integrity layer 🟢 (§3a): runtime-grounding gate, │
   │       Crossref retraction screen, ctgov-supplemental fetcher   │
   └─────────────────────────────────────────────────────────────┘
                              │ writes
                              ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  OUTPUT → 6 linked notes per run into the vault                │
   │   /Volumes/ExtraCurricular/My Digital Garden/OpenClaw/...      │
   │   ⚠️ this folder does NOT exist yet → no report has landed     │
   │   then: Medical-Zettelkasten-MCP analyzes the note graph       │
   └─────────────────────────────────────────────────────────────┘

   SUPPORTING SERVICES (all 🟢 running now, loopback + TLS):
     obsidian-bridge :8798 ↔ REST :27124   Miyo search :8742   Qdrant :6333
     TLS proxies → Ollama :11435 · Miyo :8743 · Qdrant :6433
```

### Live runtime table (verified 2026-06-10)

| Component | Port | Status | Notes |
|---|---|---|---|
| Obsidian app | — | 🟢 PID 15174 | hosts Copilot + plugins |
| Command Center bridge | :8799 | 🟢 | where chat hands off to the engine |
| Obsidian Local REST API | :27124 | 🟢 | vault read/write (HTTPS) |
| obsidian-bridge (node) | :8798 | 🟢 PID 15186 | canonical vault bridge |
| Miyo semantic search | :8742 | 🟢 | + Qdrant vector DB :6333 🟢 |
| TLS proxies (3) | :11435 :8743 :6433 | 🟢 | HTTPS fronts for the local services |
| `claude` CLI (primary LLM) | — | 🟢 on PATH | the engine's actual brain |
| LM Studio | — | ⚪ decommissioned 2026-07-16 | removed from the stack — TLS proxy :1235, launchd unit, `llm-providers.json` entry, and the app all deleted; not an engine provider (restorable later, see §5) |
| Ollama upstream | :11434 | 🟢 Obsidian side only | via TLS proxy :11435; used by Obsidian Copilot + vault-zettelkasten (`qwen2.5:7b-instruct`) — NOT an engine provider/fallback |
| **Workflow engine output** | — | 🟡 **0 runs on disk** | `workspace/missions`, `workspace/research-output`, `state/runtime` all empty; vault `OpenClaw/` dir absent |

---

## 3. The research engine, in plain English

You ask a question in Obsidian → a plugin launches `run-workflow.js` → it runs one of six templates (drug-discovery, pharmacovigilance, clinical-trial-landscape, target-validation, rare-disease, general) → for each step it calls **Claude** (via the `claude -p` command — this does all the actual thinking; the old "Scout uses Ollama, Analyst uses LM Studio" story is retired) → it pulls biomedical data from **ToolUniverse** (2,116 tools) → it scans the text for citation IDs and writes the results into your Obsidian vault as linked notes → a graph tool analyzes them.

**The one real product gap:** the engine *extracts* citation IDs and links them, but **nothing turns `PMID:12345678` into a clickable, verified PubMed link**, and the "Reproducibility Manifest" your marketing promises is **not confirmed to be wired**. This is your highest-value engineering investment because citation-traceability *is* the product. (Spec'd, not built.)

### §3a — Citation-integrity layer (shipped 2026-06-12)

A zero-fabrication citation layer now sits in the pipeline. Plain version:

- **Grounding gate.** `agent-engine.js` records the identifiers actually retrieved at runtime (`fetched_citation_ids`) plus a per-task `citation_verification` block; `buildPrompt` carries an ABSOLUTE-RULE "ZERO FABRICATION" clause (never invent a PMID/NCT/DOI — say `[no verifiable citation found]` instead). At report level, `workflow-engine.executeMissionStep` cross-checks every cited identifier against the union of runtime-fetched IDs (`core/citation-gate.js` → `verifyReportCitations`). A cite is **"grounded"** if it was in the fetched evidence, else **"ungrounded"** (likely model-introduced). Per the never-hallucinate doctrine (operator ruling 2026-07-10), `verifyReportCitations` returns a **multi-state verdict**, not a silent pass: **PASS** (grounded ratio ≥ `minGroundedCitationRatio` — the only shippable state); **UNVERIFIED** (`PHASE30_CITATION_UNVERIFIED`, ratio below the floor); **INSUFFICIENT_EVIDENCE** (`PHASE30_CITATION_INSUFFICIENT_EVIDENCE` — **zero** runtime evidence was fetched, a recorded honest-zero that now **BLOCKS**, closing the doctrine hole where zero-evidence runs silently auto-passed); and **NO_CITATIONS** (`PHASE30_CITATION_NONE` — evidence fetched but the report cited nothing). Retraction remains `PHASE30_CITATION_RETRACTED`. **Only PASS ships.** The floor `minGroundedCitationRatio` is a **required** value in `config/agent-config.json` = **0.75** (the B-grade floor), read fail-closed (missing/invalid → strict 0.75 default + a warning; one exported `DEFAULT_MIN_GROUNDED_RATIO` replacing the old hardcoded 0.34 and a dead 0.5). The gate writes `citation-verification.json` + `report-annotated.md` and annotates surviving ungrounded cites inline `[UNVERIFIED]`.
  - **Honest scope:** citations are grounded in the source records actually retrieved at runtime — *not* independently re-resolved against a live external database at delivery time. Grounded ≠ re-resolved (still §9).
- **Retraction screen.** `mcp/crossref-retraction/crossref-retraction.js` checks each cited DOI against Crossref `/works/{DOI}`; a report citing any retracted paper hard-stops (`PHASE30_CITATION_RETRACTED`). Fail-soft: a Crossref network blip yields no retractions, so it can never wrongly block a report.
- **DOI extraction fix.** `core/citation-extractor.js` now stops the DOI regex at non-DOI terminators and strips trailing sentence punctuation, so `]]`/`;`/`.` are no longer captured (this had deflated the grounded ratio and duplicated DOIs).
- **Stop-reason corpora.** `mcp/ctgov-supplemental/ctgov-supplemental.js` is a local fetcher (tool `ctgov_stopped_trials`, wired through a new `localFetchers` seam in `tool-prefetch.js`) that pulls TERMINATED/WITHDRAWN/SUSPENDED trials for a condition — each trial's `whyStopped` text plus protocol change-history (version count + most-amended modules). Every record is NCT-traced (a grounded cite).
- **New deliverables in every mission bundle** (registered in `manifest.json`, sealed in `checksums.txt`): `deliverables/citation-integrity.md` — a graded provenance ledger (`monetization/integrity-rating.js`; grade A/B/C/D from the grounded ratio, F/"BLOCKED" on any retraction, N/A if nothing cited) — and `deliverables/graveyard-memo.md` — a memo of prior terminated/withdrawn/suspended programs in the indication, each NCT-traced with the sponsor's stated stop reason (or an explicit "(none stated by sponsor)" — never invented), protocol churn, and a resolvable `clinicaltrials.gov/study/<NCT>` link, plus a protocol amendment-risk band (LOW/MODERATE/HIGH) (`monetization/graveyard-memo.js`). The graveyard/amendment memos are rendered **deterministically from the fetched records (no LLM)**, and are fully fail-soft (an absent fetcher / empty indication / fetch error simply omits them and never blocks a passing report).

Live-verified on an armed heart-failure run: 6/6 steps, grounded ratio 1.0, 8 stopped trials retrieved, integrity grade A, both new deliverables sealed in the bundle. Unit tests 316/316.

---

## 4. Connectors — the part that confuses everyone

There are **three layers**, and only two of them feed your reports:

| Layer | Reaches the engine? | Examples |
|---|---|---|
| **Subprocess MCP (12) + ToolUniverse tools (4)** | ✅ **Yes — these build your reports** | pubmed, clinicaltrials-gov, chembl, faers, scholar-gateway, europepmc, opentargets, arxiv, npi, icd10, owkin… |
| **claude.ai-level connectors (23)** | ❌ **No — chat only** | the PubMed/ChEMBL/etc. you see in Claude chat, plus Figma, Gmail, Synthesize Bio… richer, but invisible to the automated engine (Tavily is a superseded tombstone) |
| **Infra / ops (in `~/.claude.json`)** | n/a (not product) | falcon (security), github, cdp-pipe (browser), zoho-mail (**archive-reader since the 2026-07-22 Gmail cutover** — live mailbox is Google Workspace Gmail; see `03-platforms/google-workspace/google-workspace.md`) |

No rogue or broken connectors were found — the only issue was that nothing documented this split. Six claude.ai connectors are unauthenticated (Owkin host-side, BioRender, Synapse, Wiley, alphaXiv, CourtListener; Synthesize Bio is now authenticated) → authenticate the useful ones or stop listing them. Full detail: `CONNECTOR-ALIGNMENT.md`.

---

## 5. Built but NOT live (don't mistake these for working features)

| Capability | State |
|---|---|
| Phase 31 — Research REST API, scheduled workflows, usage metering | 🟡 code + 34/34 tests, **not deployed**, serves no one |
| Phase 24 — Notion sync / newsletter publishing | 🟡 implemented, **disabled** |
| Phase 25 — credential broker | 🟡 implemented, not active |
| Container-execution governance (`openclaw-bridge/execution/`) | 🟡 scaffold, **never invoked** (workflows are plain Node) |
| Multi-agent routing (role identities + per-role backend) | 🟢 **LIVE** — role-based SOUL.md/AGENTS.md/sessions under `config/agents/`. **Updated 2026-06-22: scout + analyst + synthesizer all run on `claude-code` / Claude Opus 4.8** (`claude-opus-4-8`, 1M context by default — no `[1m]` suffix). As of 2026-07-16 (Option B) the engine is 100% Claude — the OSS helper pre-passes and per-role local fallbacks were REMOVED (`agent-engine.runHelperPrePass` and the `local` fallback routes are gone; every role's `fallback` is now `""`, so a primary claude-code failure surfaces the real error instead of chasing a local backend). LM Studio was decommissioned; Ollama (`qwen2.5:7b-instruct`, :11434/:11435) is retained for the Obsidian side only, not the engine. The local-helper capability is removable-but-restorable — to re-add it, restore a `helper` block, set the role's `fallback` to `local`, and set `providers.local.enabled=true`. Per-role map in `config/role-provider-map.json`. Verified end-to-end through the YubiKey gate: scout `provider=claude-code`, SOUL prepended, session recorded, contract intact, clean exit. Billing: claude-code = Claude Max 20× subscription (flat; extra-usage metered beyond plan limits). **Env:** runs need `NODE_EXTRA_CA_CERTS=~/Library/Application Support/mkcert/rootCA.pem` — use the `scripts/run-workflow.sh` wrapper. **Obsidian launch is gated**: the plugin now spawns `--operator-approve` + the CA env (rebuilt + deployed; reload the plugin in Obsidian), so Obsidian runs require `operator-approve-gate arm` first — resolves the plugin-vs-gate escrow. 16GB note: the engine no longer loads any local models (all roles are claude-code), so the earlier scout+analyst co-residency / LM-Studio-manual-start caveat no longer applies. |
| TrevNodus / InfraNodus graph viz | ⚪ removed 2026-05-06 |

---

## 6. Data sources & licensing

Public-domain / open sources only: FDA AEMS/OpenFDA, ClinicalTrials.gov, PubMed, RxNorm, PubChem (public domain); ChEMBL (CC-BY-SA, cited by version); UniProt (CC-BY). **No PHI.** 🚩 **DrugBank: no commercial license held → STOP-SHIP.** No DrugBank data may ship and no "DrugBank-licensed pack" may be advertised until licensed (`09-source-licenses/drugbank-stop-ship-unless-licensed.md`).

---

## 7. Brand & security context

Brand is internally consistent (legal name / wordmark / domain / email / tagline all aligned). The host also runs a substantial security stack (CrowdStrike Falcon, Wazuh, etc.) that protects this machine but is **separate from the business product** — it's infrastructure, not something you sell.

---

## 8. Business / go-to-market state (the real scoreboard)

| Channel | State (2026-06-10) |
|---|---|
| Datarade | submitted 2026-05-11 → **DECLINED 2026-05-20** ("business not yet established"); re-apply after you have closed deals |
| AWS Data Exchange | ✅ **CLEARED FOR PAID (2026-07-22)** — disbursement method added; account status now **"Publish paid and free products."** Full chain complete (seller registered · tax/DAC7 · bank ACH ending 262 · disbursement · profile verified). *(History: rejected 2026-05-03 → approved → disbursement blocked ~2.5 mo → cleared; §6 escalation letter now moot.)* Remaining before revenue is **product-side**: publish a paid listing (AWS product review). Account access set up (SSO + 2 YubiKeys). |
| HuggingFace | 🟡 **publish-ready** (I prepared the bundle) — not yet uploaded; fastest path to a live artifact |
| Snowflake (free) | not done | 
| Gumroad | parked |

**Revenue $0 · live listings 0 · discovery calls/NDAs/deals 0.**

**The plan (revised 30-day, in the Launch Playbook):** Week 1 publish the HuggingFace free sample + **publish the first paid AWS listing (account cleared for paid 2026-07-22)** → Week 2 direct outbound to your 12 named accounts → Week 3 close a deal (that's the "establishment" Datarade wants) → Week 4 re-approach the marketplaces with proof.

---

## 9. The honest gap list

1. ✅ **Engine unblocked — DONE (2026-06-10).** `--operator-approve` wire + EXDEV packager fix shipped & tested; first complete 5/5 report produced (§0a). Engine is no longer the blocker.
2. **Citations now grounded in live data — FIXED & VERIFIED (2026-06-11, operator-authorized).** (a) ✅ Prefetch fires on the `topic` (scout `doc_count` 0→3, analyst 3, synthesizer 1). (b) ✅ **Result parsing fixed:** ToolUniverse returns records under `result.data` (PubMed) / `result.data.studies` (ClinicalTrials) — `#normalizeResult` now extracts them, and `tu-record-normalizer.js` preserves the real identifiers (pmid, `NCT ID`→nctId, doi, pmcid, journal, year, phase, status, chembl). **Verified:** the regenerated report cites the actual fetched records (e.g. "PMID: 42238436 · doi:10.64898/… · medRxiv 2026" — the ASPREE SAP preprint), 77 references to fetched items, and the "composed from training knowledge" disclaimer is **gone**. Regression tests: `tests/core/tu-record-normalizer-payload.test.js`. (c) ✅ **Report-level grounding gate shipped (2026-06-12, §3a):** every cited identifier is now cross-checked against the IDs actually retrieved at runtime; a low grounded ratio hard-fails (`PHASE30_CITATION_UNVERIFIED`), cited DOIs are Crossref retraction-screened (`PHASE30_CITATION_RETRACTED`), and a graded provenance ledger (`citation-integrity.md`) ships in the bundle. (d) ⚠️ **Remaining honest caveat (unchanged):** citations are *grounded in the source records actually retrieved at runtime + DOI retraction-screened*, but there is still no separate post-hoc pass that **independently re-resolves every ID against its live external database** at delivery time (the "Reproducibility Manifest"). So: grounded ✅, independently re-resolved ❌. Building that re-resolver is the remaining citation task — lower urgency now that cites are runtime-grounded and gated.
3. **Publish the HuggingFace sample** — get one live artifact (bundle is ready).
4. ✅ **AWS cleared — DONE (2026-07-22).** Disbursement method added; account status = "Publish paid and free products." The §6 escalation letter is moot (do not send). Next AWS step is product-side: publish a paid listing (AWS product review).
5. **Make a first sale** — direct outbound is the only motion that produces revenue *and* the track record the gated marketplaces demand.
6. ✅ **Teardown hang — FIXED (2026-06-11).** `run-workflow.js` used to complete the workflow but **never exit**, because the ToolUniverse SMCP server (`tooluniverse-smcp-stdio`) and its 30-second health-check `setInterval` were never shut down — so the node process lingered forever and orphaned servers piled up (two runs were stuck 1.5–2.5h). Fix: the runtime now exposes `shutdown()` (calls the existing-but-unwired `ToolUniverseMcp.shutdown()`), `run-workflow.js` calls it in a `finally`, and `main()` forces a clean `process.exit(code)`. Verified: a run now exits with code 0, logs `workflow_runtime_shutdown`, leaves zero orphaned servers, and **the completion notification fires** (runs report back instead of hanging silently).

---

## 10. Where everything lives (file index)

| For… | Open |
|---|---|
| **This master map** | `THE-WHOLE-SYSTEM.md` (you are here) |
| Ground-truth engine detail | `SYSTEM-REALITY.md` |
| Connector→function detail | `CONNECTOR-ALIGNMENT.md` |
| The full audit + change log | `audit/business-reality-2026-06/` |
| What to do next (30-day plan) | `trevor-robey-inc Commercial Launch Playbook.md` |
| Product prices | `OFFERINGS.md` |
| Strategy / legal / attribution | `REVENUE_PLAYBOOK.md` |
| HuggingFace publish (ready) | `03-platforms/huggingface/PUBLISH-STEPS.md` |
| Scoreboard | `12-pipeline-tracking/kpis-end-of-month.md` |
| Engine internals (historical design) | `../ARCHITECTURE.md` (read its correction banner first) |
