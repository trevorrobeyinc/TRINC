# Trevor Robey, INC. — Shared Continuity Board

> **ONE living board, shared by all four Claude surfaces.** This is the single source of
> truth for *what is being worked on right now* across the whole `TrevClaw-Obsidianodus`
> business stack. Every surface — **CLI Claude Code**, **Desktop Claude Code**, **Cowork**,
> and **Claude Chat (Desktop)** — reads this file at the start of a session and appends to it
> when it makes meaningful progress or hands off.
>
> **Read this top-to-bottom before you touch anything.** How the system works, how each
> surface reaches this file, and the write-safety rules are in **[`README.md`](README.md)**.

- **Canonical path:** `/Volumes/ExtraCurricular/TrevClaw-Obsidianodus/_continuity/CONTINUITY.md`
- **Repo-canonical, single file** — there is no mirror and no copy. All four surfaces edit *this* file on disk.
- **Business canon (do not duplicate here — point to it):** repo `CLAUDE.md`,
  `Trevor Robey Intelligence Network Citations/{THE-WHOLE-SYSTEM.md, SYSTEM-REALITY.md}`.

---

## 🧭 30-second protocol

1. **On start** → read **Current focus** + the top 3–5 **Log** entries. That is the live state.
2. **On meaningful progress or handoff** → **prepend** a Log entry (newest at top) using the
   template at the bottom. Keep it short and factual.
3. **Keep "Current focus" true to *now*** — update it (don't just append) so it always answers
   "what are we working on this minute?"
4. **Append, don't rewrite** other surfaces' Log entries. History is the point.
5. **External-volume write caveat (especially Claude Chat):** this file lives on the
   `/Volumes/ExtraCurricular` external SSD. Writes can hang or `EPERM` (disksleep / a wedged
   Filesystem MCP). **Probe-first, verify-after, and if a write hangs restart the Filesystem
   MCP connector** — full procedure in [`README.md`](README.md#write-safety-external-volume).

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

> Not the web version of Chat — the **Desktop** app, which has the Filesystem MCP connector.
> `:8798` (Obsidian bridge → `My Digital Garden`) is an *additional* semantic path, **not**
> Chat's only route to disk.

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

**Cowork — business-repo cubicle setup + connector management (2026-07-01).** Cowork stood up its cubicle in this repo — `claudeco_project.md` (scope anchor), `claudeco_vault-index.md` (monorepo orientation), `claudeco_connector-setup.md` (connector authorization checklist) — audited the MCP connector surface (**PubMed + ClinicalTrials.gov live-verified**), and at operator request **fully removed the Google Drive engine connector** (registry + credential block + `openclaw-bridge/mcp/gdrive-mcp/` adapter + doc refs; the `GOOGLE_DRIVE_*` security env-strip guards were intentionally kept), confirming **Owkin** stays engine-wired. Connector scope set from repo evidence: **BigQuery** matches the enterprise-delivery model; **Amplitude / Atlassian / Definite / Hex** have no repo footprint (skip); **Wiley ≠** the engine's Semantic-Scholar "scholar-gateway" (Wiley is separate, license-gated, Cowork-only). **Next (this thread):** operator authorizes the remaining connectors interactively — Owkin, Wiley (if licensed), BigQuery — since OAuth can't run in Cowork; then optionally draft engine-side Wiley/BigQuery adapters or kick off a first research project. **Still open on other surfaces (see Active workstreams):** the E1 citation-overclaim sweep (10 `03-platforms/` dirs left) and the drive-stall-blocked `REVENUE_PLAYBOOK.md` tidy-up.

---

## 🟢 Active workstreams

> Named threads currently open, with a one-line status each. Move finished ones to the Log.

- **Citation-overclaim sweep (E1)** — _mostly done._ All collateral surfaces reframed + verified (see newest Log entry). **Remaining:** the 10 un-swept `03-platforms/` dirs — `databricks-marketplace`, `gumroad`, `kaggle-seo-breadcrumb`, `ocean-protocol`, `snowflake-marketplace`, `substack-patreon`, `tier1-aggregators-{marketresearch-com,reportlinker,research-and-markets}`, `rejected-channels`.
- **`REVENUE_PLAYBOOK.md` reality-alignment** — _blocked (drive stall)._ Tidy-up spec is ready (routing table → Opus 4.8; tools 700+ → ~2,116; §3 template names → canonical six; Phase 31 API → built-not-deployed; stale plans → current Commercial Launch Playbook). Apply via **CLI / Desktop Code** (bypasses the wedging connector) or copy to `/Users/myhome`, edit, copy back.

---

## ⚪ Parking lot / open threads

> Ideas, blocked items, and "someday" work — not active, but don't lose them.

**3 operator items (only the operator can resolve):**
- **AWS Data Exchange true status** — `SYSTEM-REALITY.md` says "approved, blocked at disbursement"; `REVENUE_PLAYBOOK.md` says "rejected 2026-05-03." The AWS files lean approved-but-blocked (`03-platforms/aws-data-exchange/public-seller-profile.md` = "pending" 2026-05-26; `product-creation.md` = nothing uploaded, payouts blocked). **Authoritative answer is likely in `03-platforms/aws-data-exchange/correspondence-2026-05.md` (unread).**
- **CA LLC SOS entity number** — filed 2026-05-06; docs still say "pending"/"populated upon approval." The landing-page footer "Entity No. B20260217250" is the **filing receipt**, not the real SOS entity #; fix once the real number is confirmed.
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
> Copy the **Entry template** at the bottom.

### 2026-07-01T11:37Z · Cowork · Cubicle setup, monorepo index, connector triage + full gdrive removal
- **Did:**
  - **Stood up the Cowork cubicle:** `claudeco_project.md` (scope anchor → points to canon), `claudeco_vault-index.md` (monorepo orientation — topology, engine state, 16 workstreams, open threads, connector coverage), `claudeco_connector-setup.md` (per-connector authorization checklist).
  - **Connector audit:** live-verified **PubMed** (2,845 hits, glioblastoma+temozolomide+resistance) and **ClinicalTrials.gov** (275 TERMINATED glioblastoma trials) return real data; catalogued live vs needs-auth vs engine-internal.
  - **Removed Google Drive end-to-end (operator request):** deleted both gdrive entries (`gdrive-subprocess` + `gdrive-host`) from `config/connector-registry.json`; removed the `google_drive` block from `config/data-source-credentials.json`; deleted the `openclaw-bridge/mcp/gdrive-mcp/` adapter dir; scrubbed doc refs in README / DOSSIER / NOTICE / CONNECTOR-ALIGNMENT + root `CLAUDE.md` ("8 project MCP servers" → 7); **annotated** the dated `audit/business-reality-2026-06/00-audit-report.md` rather than rewrite history. **Kept** the `GOOGLE_DRIVE_*` / `GOOGLE_CLIENT_SECRET` env-strip guards in `llm-adapter.js` / `scrape-sidecar-lifecycle.js` / `tu-process-manager.js` (protective, not gdrive functionality). Both JSON configs re-validated.
  - **Owkin:** confirmed already engine-wired (`owkin-mcp` + `OWKIN_API_KEY`) — left intact.
  - **Connector scope from repo evidence:** **BigQuery** matches the enterprise-delivery model (REVENUE_PLAYBOOK, product catalog, platform listings) → set up; **Amplitude / Atlassian / Definite / Hex** have zero repo footprint → skip; corrected the **Wiley = scholar-gateway** conflation (engine `scholar-gateway` is **Semantic Scholar**; Wiley is a separate license-gated Cowork-only connector with no engine adapter).
  - **Did NOT fabricate** engine registry/credential entries for connectors without adapters (Wiley / Synapse / BioRender / BigQuery) — that would create the exact connector-drift the 2026-06-10 audit warns about.
- **State:** done for the Cowork pass · connector OAuth authorizations are operator-only (interactive) and pending.
- **Next:** operator authorizes Owkin + Wiley (if licensed) + BigQuery via **claude.ai → Settings → Connectors** or `/mcp`; then optionally (a) draft engine-side `wiley-mcp` / `bigquery-mcp` adapters, or (b) point the engine at a first research project. Full steps: `claudeco_connector-setup.md`.
- **Touches:** `claudeco_project.md`, `claudeco_vault-index.md`, `claudeco_connector-setup.md`; `Trevor Robey Intelligence Network Citations/config/{connector-registry.json, data-source-credentials.json}`, `.../openclaw-bridge/mcp/gdrive-mcp/` (deleted), `.../{README.md, TREVOR_ROBEY_INC_AGENTS_DOSSIER.md, NOTICE.md, CONNECTOR-ALIGNMENT.md}`, `audit/business-reality-2026-06/00-audit-report.md`, root `CLAUDE.md`.
- **For whoever's next:** gdrive is fully gone **but the `GOOGLE_DRIVE_*` env-strip guards in the 3 subprocess spawners are intentionally kept — don't "tidy" them away.** Of the connectors the operator installed, **only Owkin is wired into the engine**; the rest are Cowork/operator-side until adapters are built. OAuth can't be completed from Cowork — those steps are operator-only.

### 2026-07-01T11:26Z · CLI Claude Code · Security-verified the `:8798` Obsidian bridge
- **Did:** Live-verified the canonical Obsidian MCP bridge on `127.0.0.1:8798` is serving **and** hardened. **Serving:** `GET /healthz` → `200 {"ok":true,"status":"ready"}`, valid mkcert cert (SAN `localhost`+`127.0.0.1`, expires 2028-09). **Safe:** binds **loopback-only** (config-load *throws* unless `OBSIDIAN_BRIDGE_ALLOW_NONLOOPBACK=1` — audit TB-1); plaintext HTTP refused; mkcert keys locked (`localhost-key.pem` 600, `rootCA-key.pem` 400). **Protected:** every real route requires a strong bearer/`x-mcp-token` — proved live: `POST /mcp/tool` no-token & wrong-token → **401**, `GET /metrics` & `/mcp/events` no-token → **401**, `OPTIONS` → **405 (CORS disabled)**. Also present in src: replay guard (ts+nonce+body-sha256), dual rate-limit (pre-auth + per-token), path guard, audit log of AUTH_FAIL/REPLAY_REJECT.
- **State:** done — bridge is serving, loopback-only, TLS-enforced, token-gated. No issues found.
- **Next:** none required. Bridge dies when Obsidian quits (by design); the continuity board does **not** depend on it (all four surfaces reach the repo on disk).
- **Touches:** read-only — `Copilot-Everything/bridges/obsidian-copilot-bridge/src/server/httpCommon.ts`, `config/loader.ts`; no mutations.
- **For whoever's next:** the mkcert root is a machine-trusted CA (System Keychain), so a system-trust TLS client validates the bridge cert *by design* — that's mkcert working, not missing verification. The one standing mkcert caveat: guard `~/Library/Application Support/mkcert/rootCA-key.pem` (already 400) — whoever holds it can mint trusted certs for this host.

### 2026-07-01T11:22Z · Claude Chat · Doc reality-alignment: citation-overclaim sweep + stale-path fixes
- **Did:** Reality-aligned the customer-facing + internal business docs against `SYSTEM-REALITY.md` + `README.md`.
  - **E1 citation-overclaim sweep (done + verified):** reframed "per-citation external re-resolution / Reproducibility Manifest / resolved / zero-hallucination" → the true capability (**grounded against the source records retrieved at runtime + Crossref DOI retraction-screen + graded A/B/C/D citation-integrity ledger; ungrounded flagged `[UNVERIFIED]`; NOT per-citation external re-resolution**) across: `OFFERINGS.md`; `03-platforms/datarade/vendor-application.md`; landing-page HTML in **both** copies (`01-brand-system/landing-page/index.html` + `workspace/collateral/landing-page/index.html`); `07-outbound/cold-email-templates/` (4 `email-*.md`; the 4 `persona-*.md` are empty); `02-product-packs/product-catalog.md` (only the Product-7 straggler; the rest was already honest); `03-platforms/aws-data-exchange/` (`listing/product-description.md` provider line + `product-creation.md` ×3 "resolves in source DB" — `refund-policy.md` was already correctly framed); `03-platforms/huggingface/gated-teaser/README.md` (the big one — production "hundreds of resolved citations + per-delivery Reproducibility Manifest" → grounded+retraction-screened+graded ledger). **Left as defensible:** the static 29-row curated-sample claims on the AWS/HF cards (they ship resolution URLs — checkable, and invite buyer verification, not an engine re-resolution claim).
  - **Earlier this session (before this board existed):** verified the `obsidian-command-center` plugin rename (source-side; `constants.ts` DEFAULT_SETTINGS paths fixed; deployed manifest id `command-center`); reconciled root + Hub `CLAUDE.md` folder pointers to `Trevor Robey Intelligence Network Citations/`; ran the A2/A3 stale-path/dead-folder sweep (`README.md`, `OFFERINGS.md`, `README.brand.md` [Cloudflare deploy pointers flagged stale], `REVENUE_PLAYBOOK.md` §0); produced a severity-tiered business-doc audit.
- **State:** working (E1 collateral sweep complete) · `REVENUE_PLAYBOOK.md` tidy-up **blocked** (drive stall).
- **Next:** (1) **`REVENUE_PLAYBOOK.md` tidy-up spec** — §1 routing table "Ollama-as-scout" → scout/analyst/synthesizer all **Opus 4.8 via claude-code** (OSS `qwen2.5:7b` / `qwen3.5-9b` = helper pre-pass + fallback); tools "700+" → **"~2,116"**; §3 template names → canonical six (`drug-discovery-full, pharmacovigilance-report, clinical-trial-landscape, target-validation-pack, rare-disease-brief, general-research-pack`); §8/§9 Phase 31 REST API → "built + tested, **not deployed**" (not a live revenue channel); stale April/May 30-day plans → point to `trevor-robey-inc Commercial Launch Playbook.md` (REVISED 30-DAY PLAN 2026-06-10→07-10). (2) Sweep the 10 remaining `03-platforms/` dirs (Active workstreams). (3) Operator items + non-citation flags (Parking lot).
- **Touches:** `OFFERINGS.md`, `03-platforms/datarade/vendor-application.md`, `01-brand-system/landing-page/index.html`, `workspace/collateral/landing-page/index.html`, `07-outbound/cold-email-templates/email-*.md`, `02-product-packs/product-catalog.md`, `03-platforms/aws-data-exchange/{listing/product-description.md, product-creation.md}`, `03-platforms/huggingface/gated-teaser/README.md`; earlier: `Claude/obsidian-command-center/src/constants.ts`, `CLAUDE.md`, `Claude/CLAUDE.md`, `README.md`, `README.brand.md`, `REVENUE_PLAYBOOK.md`.
- **For whoever's next:** **`REVENUE_PLAYBOOK.md` (40 KB) repeatedly wedges the Filesystem MCP on read/copy off the external SSD** (metadata + smaller files are fine — one large sequential read blocks the single-threaded server). Do that file via **CLI / Desktop Code** (native FS, bypasses the connector) or copy it to `/Users/myhome`, edit, copy back. Also: the landing-page + HF-card fixes are **repo copies, not the live site** — they need a redeploy/push once the deploy source (Parking lot) is settled.

### 2026-07-01T11:09Z · CLI Claude Code · Continuity system created
- **Did:** Built this shared continuity file system in `_continuity/` (board + `README.md` +
  `log/` archive) and wired discovery pointers into repo `CLAUDE.md`, `claudeco_project.md`,
  and `Claude/CLAUDE.md`; added the repo-scoped `continuity-board` skill for the Code surfaces;
  corrected the `CLAUDE.md` Multi-Operator Topology to record Chat's Filesystem MCP connector
  (roots `/Users/myhome` + `/Volumes/ExtraCurricular`).
- **State:** working — system is live and empty, ready for real work.
- **Next:** First real workstream. Whoever picks up business work sets **Current focus** and
  logs here.
- **Touches:** `_continuity/*`, `CLAUDE.md`, `claudeco_project.md`, `Claude/CLAUDE.md`,
  `.claude/skills/continuity-board/SKILL.md`.
- **For whoever's next:** This board replaces "each surface guesses what the others did."
  Read it first, update **Current focus**, and leave a Log entry before you stop.

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
