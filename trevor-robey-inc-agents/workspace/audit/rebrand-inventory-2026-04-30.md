# trevor-robey-inc Rebrand — Monorepo Inventory (2026-04-30)

Snapshot of brand-prose hits across the monorepo identified during Gate 1 (planning). Captured here for future-session reuse so the inventory work doesn't have to be redone.

**Scope**: `/Users/trevorrobey/TrevClaw-Obsidianodus/` and its three symlink targets (Claude/, Copilot-Everything/, trevor-robey-inc-agents/) plus the local trevor-robey-inc/ commercial collateral subfolder.

**Excluded**: node_modules/, .git/, .archive/, dist/, build/, .pm2/, vendor/tooluniverse/, tests/, *.test.js, *.spec.ts, .learnings/, workspace/audit/.

## Total Hits: 26 (across 11 files)

| Classification | Count | Notes |
|---|---|---|
| STALE_BRAND_NAME | 4 | "OpenClaw Research Intelligence" et al. as if it were the company |
| STALE_OFFERING | 7 | Generic "research report" framing |
| STALE_TAGLINE_OR_POSITIONING | 1 | "we produce" verb framing |
| TECHNICAL_KEEP_AS_IS | 6 | Component names, ICP definitions, architecture refs (kept) |
| AMBIGUOUS_REVIEW | 5 | Context-handoff files, ARCHITECTURE.md "formerly" reference |
| STALE_PRICING | 0 | All pricing was concrete; updated in REVENUE_PLAYBOOK + DOSSIER + CLAUDE.md edits |

## Files Touched in Phase 5

### A. Top-level monorepo (4 files)
- `TrevClaw-Obsidianodus/CLAUDE.md` — pricing line, workspace-map row, brand-stack note (3 edits)
- `TrevClaw-Obsidianodus/ARCHITECTURE.md` — preamble brand-note banner (1 edit)
- `TrevClaw-Obsidianodus/context-handoff-trevorrobey-inc-launch-prep.md` — supersession banner
- `TrevClaw-Obsidianodus/context-handoff-biomedical-research-stack-architecture.md` — supersession banner

### B. Commercial collateral (8 surfaces)
- `trevor-robey-inc/README.md` — 7 edits (brand line, playbook reference, status note, folder map, source-of-truth pointers)
- `trevor-robey-inc/OpenClaw Commercial Launch Playbook.md` → **renamed** to `trevor-robey-inc Commercial Launch Playbook.md`. Top banner + Section 1 bottom-line + Section 3 intro/synthesis rewritten.
- `trevor-robey-inc/02-product-packs/product-catalog.md` — full rewrite with new SKU table
- `trevor-robey-inc/02-product-packs/pharmacovigilance/samples/pharmacovigilance-sample-deliverable.md` — header replace_all + engagement-options block rewrite
- `trevor-robey-inc/03-platforms/gumroad/products/pharmacovigilance-standard/sample-full-deliverable.md` — same as above (mirror)
- `trevor-robey-inc/07-outbound/linkedin-openers/linkedin-connection-templates.md` — 4 edits (Persona 2, 4 connection requests + Persona 2, 4 follow-ups)
- `trevor-robey-inc/07-outbound/prospect-targeting-guide.md` — 3 edits (ChatGPT objection, pilot objection, three-tier pricing note)
- **NEW**: `trevor-robey-inc/OFFERINGS.md` — canonical SKU table

### C. trevor-robey-inc-agents (6 files)
- `README.md` — hero opening + pricing pointer (2 edits)
- `NOTICE.md` — OpenClaw clean-room derivative line (1 edit)
- `REVENUE_PLAYBOOK.md` — §0 Hero Positioning (rewritten), §2 Pricing Guidance table (rewritten), §7 First listing recommendation (rewritten), §10 Pricing in Outbound Materials (rewritten)
- `TREVOR_ROBEY_INC_AGENTS_DOSSIER.md` — What This Project Is (rewritten), Provenance OpenClaw line, target buyers + pricing tiers tables (rewritten), Skill Policy clarification
- `CLAUDE.md` — Naming disambiguation (1 line), Multi-tier pricing line, Pricing Tiers table (rewritten)
- `package.json` — description field

### D. Plugin (3 files at /Users/trevorrobey/Code/Claude/obsidian-openclaw-command-center/)
- `manifest.json` — `name` + `description` + `authorUrl`
- `src/views/workflow-sidebar.ts` — `replace_all` of "OpenClaw Pipeline" → "trevor-robey-inc Pipeline" (3 occurrences)
- `README.md` — first paragraph + brand framing (engine-credit note added), GitHub repo link in Requirements row, Settings paths section

## Intentionally NOT changed
- `config/workflow-templates/*.json` (6 files) — technical descriptions of engine mechanics, not customer-facing
- Plugin `id` field (`openclaw-command-center`) — would invalidate existing installations
- Source class names: `OpenClawPlugin`, `OpenClawRunner`, `openclaw-bridge/`, `cleanRoomDerivative: true` — engine references
- Plugin ribbon icon label — already "Open Pipeline" (neutral, no change needed)
- REVENUE_PLAYBOOK.md §1, §3 (Mission templates), §4–§6, §8, §11–§14 — operational/licensing mechanics
- NOTICE.md disclaimer paragraph — preservation invariant
- ARCHITECTURE.md technical body — only preamble brand-note banner added

## Out of Scope (require separate user authorization)
1. HuggingFace dataset rename `openclaw-pharmacovigilance-teaser` → `trevorrobeyinc-pharmacovigilance-teaser`
2. AWS Data Exchange listing copy update
3. Datarade listing copy update
4. GitHub Pages landing copy at trevorrobeyinc.github.io
5. Cloudflare Workers landing deploy (`/Users/trevorrobey/openclaw-landing-deploy/` directory rename)
6. DrugBank commercial license / ChEMBL CC BY-SA legal review
