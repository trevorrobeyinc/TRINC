# claudeco_project.md — Claude Cowork Cubicle Anchor

> Structural anchor for the **Claude Cowork** operator working inside the
> Trevor Robey, INC. biomedical research intelligence stack. This is a thin
> index that **points to canon — it does not duplicate or fork it.** Respects
> the single-repo invariant in `README.md`.

| | |
|---|---|
| Scope | **Claude Cowork operator only** |
| Anchored at | `/Volumes/ExtraCurricular/TrevClaw-Obsidianodus` |
| Legal entity | Trevor Robey Intelligence Network Citations LLC (brand: **Trevor Robey, INC.**) |
| Created | 2026-07-01 |
| Purpose | Multi-step biomedical research/citation engine — cubicle bootstrap |

## 📌 Shared Continuity Board — read first, every session

Before Cowork work, read the cross-surface board at
[`_continuity/CONTINUITY.md`](_continuity/CONTINUITY.md) — the ONE living file **CLI Claude Code,
Desktop Claude Code, Cowork, and Claude Chat** all share so everyone knows what's in flight and can
cooperate. Read **Current focus** + the top few **Log** entries at start; **append a Log entry**
(name your surface `Cowork`) on meaningful progress or handoff. Protocol + write-safety:
[`_continuity/README.md`](_continuity/README.md). This is separate from — and complements — this
Cowork-only anchor: the anchor scopes *your cubicle*, the board coordinates *across surfaces*.

## Scope isolation (Cowork-only)

- This cubicle **is Claude Cowork**. Do **not** blend it with Claude Code
  (the Desktop Code tab) or standalone Claude Chat. Treat it as an isolated
  branch of the multi-operator topology described in `CLAUDE.md`.
- Vault reads/writes route through the canonical Obsidian MCP bridge (`:8798`)
  when Obsidian is open (see `CLAUDE.md` → Multi-Operator Topology / Port Map).

## Canonical docs — read these, don't rewrite them

- Operator rules + runbook: `CLAUDE.md`
- Architecture: `ARCHITECTURE.md`
- Repo overview: `README.md`
- Engine deep dive: `Trevor Robey Intelligence Network Citations/CLAUDE.md`
- Brand / offerings / revenue: `Trevor Robey Intelligence Network Citations/`
  (`README.brand.md`, `OFFERINGS.md`, `REVENUE_PLAYBOOK.md`, `NOTICE.md`)

## Operating posture (inherited — enforce in every Cowork task)

- **Research artifacts only** — not validated for clinical decision support.
- **No PHI** — public biomedical sources only.
- **Manual-only external actions** — no autonomous publish/post/login/transact.
- **Citation traceability gate** — every citation row carries a real
  PMID / NCT / ChEMBL ID / DOI. No unsourced claims.

## Connector audit — 2026-07-01 (this Cowork session)

**Live now (schemas loadable in-session):** PubMed · bioRxiv/medRxiv ·
ClinicalTrials.gov · ChEMBL · Open Targets · Consensus (semantic search) ·
NPI registry · ICD-10 (CM + PCS) · Hugging Face Hub · Gmail.

**Needs authorization (OAuth — must be done in an interactive session, not here):**
Wiley Scholar Gateway · Synapse · BioRender · (data plugins: Amplitude,
Atlassian, Hex).

**Not surfaced this session — verify:** Owkin · Google Drive.

### Required-architecture coverage

| Layer | Connector | Status |
|-------|-----------|--------|
| Scientific grounding | PubMed | ✅ live |
| Scientific grounding | medRxiv / bioRxiv | ✅ live |
| Scientific grounding | ClinicalTrials.gov | ✅ live |
| Genomic/compound | Open Targets | ✅ live |
| Genomic/compound | ChEMBL | ✅ live |
| Citation validation | Wiley Scholar Gateway | ⚠️ needs authorization |
| Local knowledge base | This vault (`/Volumes/.../TrevClaw-Obsidianodus`) | ✅ connected this session |

## Next

- **Full monorepo orientation → [`claudeco_vault-index.md`](claudeco_vault-index.md)**
  (topology, engine state, 16 workstreams, open threads, connector setup).
- [ ] Authorize Wiley (+ Owkin/Synapse if needed) in an interactive session.
- [ ] Complete machine bring-up (Homebrew, mkcert, `claude` CLI/SSO, ToolUniverse Python) — see index §7.
- [ ] Point the engine at a first project (client / therapeutic area / SKU).
