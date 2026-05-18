<context_handoff>
  <meta>
    <source>Claude (Anthropic)</source>
    <date>2026-05-17</date>
    <turns>~14 user turns</turns>
    <topic>Spec Kit reverse-engineering pass on the TrevClaw-Obsidianodus monorepo: plan-writing, analyze, two remediation rounds, clarify, checklist, constitution amendment</topic>
  </meta>

  <summary>
    Reverse-engineered Spec Kit SDD artifacts onto an already-built monorepo. Started from four scaffolded spec.md files (001/002/003/004) with only spec 001 having a plan.md; ended with complete spec+plan pairs across all four, spec 001 fully release-gated via a 50-item checklist, and the project constitution amended v1.0.0 -> v1.1.0 to codify a [NEEDS CLARIFICATION] vs [DEFERRED] marker split. Everything is in the working tree, NOT committed. A late linter/user edit to the checklist introduced CHK051 referencing a not-yet-existing Const Principle I v2.0.0 and Spec FR-012 — a fresh forward-reference discrepancy that must be reconciled.
  </summary>

  <key_decisions>
    1. Skip /speckit-tasks and /speckit-implement entirely — this is reverse-engineering of already-built code, not greenfield. Reserve those for NEW features.
    2. /speckit-analyze run in adapted mode — no feature branch (on main) and no tasks.md (intentional). Ran detection passes A-E across all four spec+plan pairs against the constitution instead of one feature. 13 findings: 0 CRITICAL, 3 HIGH, 5 MEDIUM, 3 LOW.
    3. Remediation done in two scoped rounds (R1: I1/I2/A1; R2: C1/I4/U1/A2/C2 + 2 bonus stale-doc fixes), proposed-edits-for-review, no auto-commit, doc/spec edits only — never code.
    4. /speckit-clarify scoped strictly to spec 001's THREE original markers (intake flow, coverage %, Prometheus). The 5 NEW SKU-mapping markers from I1 were declared OFF-LIMITS (real business decision needing operator + brand-guardian, not a clarify-resolvable gap).
    5. All three clarify questions answered "defer." Introduced a [DEFERRED] marker distinct from [NEEDS CLARIFICATION]; every [DEFERRED] bullet must carry Current-state + Engineering-implication tripwire.
    6. /speckit-checklist deliberately diverged from stock "unit tests for English" semantics — operator wanted an operational release-readiness gate (operator-tickable pre-billing), not a requirements-quality meta-test. Divergence documented in the file itself.
    7. Constitution amended v1.0.0 -> v1.1.0: Governance-only addition (Open-Marker Semantics). No Core Principle changes => minor bump, not major.
    8. SKU->template_id mapping (finding I1): added a mapping TABLE to spec 001 Key Entities, did NOT rename templates (renaming touches code, out of scope). Most mappings honestly marked [NEEDS CLARIFICATION]; only Pharmacovigilance Pack -> pharmacovigilance-report is a canonical 1:1.
    9. Claude/CLAUDE.md staleness (I2): chose "replace Port Map with pointer to root CLAUDE.md" over full refresh — eliminates the staleness vector permanently.
    10. User Story 5 (obsidian-stdio-adapter) added as a SEPARATE story, NOT folded into Story 4 (claude-cli-bridge) — different bridges, transports, recursion models.
  </key_decisions>

  <technical_context>
    Repo: /Users/trevorrobey/TrevClaw-Obsidianodus/ (private monorepo, on branch main, ~239 pre-existing working-tree changes from parallel work).
    Spec Kit 0.8.10.dev0; dash-form skills under .claude/skills/speckit-*; artifacts under .specify/.
    Four features:
      - .specify/specs/001-trevor-robey-inc-agents/{spec.md, plan.md, checklists/release-readiness.md}
      - .specify/specs/002-claude-hub/{spec.md, plan.md}
      - .specify/specs/003-copilot-everything/{spec.md, plan.md}
      - .specify/specs/004-trevor-robey-inc-brand/{spec.md, plan.md}
    Constitution: .specify/memory/constitution.md — NOW v1.1.0 (5 Core Principles unchanged; added "### Open-Marker Semantics" under Governance).
    Plan format (8 sections mirrored from plan 001, +Verification added to all): Technical Context, Architecture, Port Map, Data Model, External Integrations, Constraints, Phase Status, Open Questions/NEEDS CLARIFICATION, Verification.
    Workflow templates confirmed on disk (trevor-robey-inc-agents/config/workflow-templates/): clinical-trial-landscape.json, drug-discovery-full.json, general-research-pack.json, pharmacovigilance-report.json, rare-disease-brief.json, target-validation-pack.json. No investor-pre-mortem or failed-trial-archaeology template exists — those are customer SKU names.
    Tracked file changed: Claude/CLAUDE.md (+52/-42). Everything under .specify/ is UNTRACKED (git status ?? .specify/).
    claude-cli-bridge heartbeat patch at Copilot-Everything/bridges/claude-cli-bridge/index.mjs (commit 9df72c0 lineage) is on disk but NOT live until Claude Desktop restart — blocks evaluation of spec 003 FR-009 / SC-005.
    Constitution Principle I = HTTPS-only invariant; enforced by /Users/trevorrobey/TrevClaw-Obsidianodus/scripts/lint-transport-monorepo.sh --strict.
  </technical_context>

  <action_items>
    1. [pending] DISCREPANCY introduced by late linter/user edit to release-readiness.md: CHK051 references "Const Principle I v2.0.0" and "Spec §FR-012" — NEITHER EXISTS. Constitution is v1.1.0 (not v2.0.0); spec 001 FRs stop at FR-010 (no FR-012). CHK051 text concerns an "extended outbound-HTTPS pattern set" and bans direct references to :8742/:6333/:1234/:11434 in monorepo source. Reconcile by either: (a) authoring Constitution Principle I v2.0.0 (outbound-HTTPS extension) + spec 001 FR-011/FR-012 to back CHK051, or (b) re-tagging CHK051 to existing sources. Owner: operator decision. This is the freshest open thread.
    2. [pending] Commit working tree. Suggested: commit 1 "feat(spec-kit): scaffold reverse-engineered SDD artifacts" (all of .specify/); commit 2 "docs(claude-hub): refresh CLAUDE.md to delegate topology to root" (tracked Claude/CLAUDE.md). Operator owns commits.
    3. [pending] Resolve 5 SKU<->template_id mappings (Investor Pre-Mortem, Failed Trial Archaeology, Trial Design Benchmark Pack, Cross-Silo Connector Report, Conference Synthesis Brief, Plain-Language Patient Brief) — operator + trevor-robey-inc-brand-guardian skill; codify via customer_sku field in template JSONs or a config/sku-template-mapping.json. These are CHK031-CHK036 shipment blockers.
    4. [pending] Three [DEFERRED] items in plan 001 Open Questions: customer intake flow, coverage % policy, Prometheus restoration. Each has a contributor guard tripwire (CHK037-CHK039).
    5. [pending] Brand-guardian routing: L1 (OpenClaw/ vault folder customer exposure, CHK040) and U2 (spec 004 SC-004 "relevant assets" enumeration, CHK041).
    6. [pending] Restart Claude Desktop to activate claude-cli-bridge heartbeat patch; then verify spec 003 FR-009/SC-005 with a >60s claude_run.
    7. [decided-not-done] /speckit-tasks, /speckit-implement — out of scope for reverse-engineering.
    8. [pending, optional] Release-readiness or domain checklists for specs 002/003/004 — not generated this round.
    9. [pending, optional] A separate requirements-quality.md checklist for spec 001 if the stock "unit tests for English" output is later wanted.
  </action_items>

  <constraints_and_preferences>
    - Proposed-edits-for-review workflow: apply edits to working tree, NEVER auto-commit; operator reviews via git diff and owns commit cadence.
    - Spec/doc edits ONLY in these rounds — zero code changes anywhere (reading code for verification is fine; writing is not).
    - Scope discipline is enforced and verified with grep after edits (e.g., grep -c "NEEDS CLARIFICATION"). The one Story-5-before-Story-4 ordering slip was caught this way.
    - Marker semantic split is now constitutional law (v1.1.0): [NEEDS CLARIFICATION] blocks implementation; [DEFERRED] does not, but every [DEFERRED] needs Current-state + Engineering-implication. Keep using it.
    - When a Spec Kit skill's stock behavior doesn't fit, adapt it but DOCUMENT the divergence in the artifact itself — don't pretend stock was run.
    - Full file paths in all output, never bare filenames (global CLAUDE.md rule).
    - Honest credit: Spec Kit tooling generated scaffolding; the decisions inside (defer-all-three, marker split, operational-checklist repurpose) were operator calls.
    - Defer brand/customer-facing copy authority to the trevor-robey-inc-brand-guardian skill; constitution governs engineering, brand-guardian governs copy.
    - "OpenClaw" in the codebase is the open-source engine framework (intentional credit), NOT brand drift. Retired openclaw.ai consumer product is unrelated.
    - User explicitly approved continuing the marker split and formalizing it via constitution amendment as the final move of the pass.
  </constraints_and_preferences>

  <conversation_arc>
    Began in plan mode: planned the work (write plans 002/003/004 + add Story 4 to spec 003), got approval, executed. Two Explore subagents thrashed on context; pivoted to reading the small files directly. Wrote three plans + spec 003 Story 4. User then ran /better-prompt asking for a recommended next move -> recommended /speckit-analyze. Ran /speckit-analyze (adapted, no branch/tasks) -> 13 findings. User approved Round 1 (I1/I2/A1) with precise per-finding guidance; executed. Round 2 (C1/I4/U1/A2/C2 + 2 bonus Claude/CLAUDE.md staleness fixes) approved and executed; caught and fixed a Story-5-before-Story-4 ordering bug mid-round. /speckit-clarify scoped to 3 original markers; user answered all "defer"; encoded as [DEFERRED] with the new semantics. /speckit-checklist produced a 50-item operational release gate (divergence from stock semantics documented). Constitution amended v1.0.0 -> v1.1.0. User ran /better-prompt for a session accomplishment breakdown. Finally requested this context-handoff — at which point a system-reminder revealed the checklist had been edited (by linter/user) to add CHK051 with forward-references to a non-existent Const Principle I v2.0.0 and Spec FR-012.
  </conversation_arc>

  <handoff_instructions>
    You are continuing a Spec Kit reverse-engineering pass on /Users/trevorrobey/TrevClaw-Obsidianodus/ started with Claude. All artifacts are in the working tree, uncommitted. The Spec Kit pass itself is functionally COMPLETE (4 spec+plan pairs, spec 001 checklist, constitution v1.1.0). Do NOT run /speckit-tasks or /speckit-implement (reverse-engineering, not greenfield). The single most urgent open item is action_item #1: the checklist file .specify/specs/001-trevor-robey-inc-agents/checklists/release-readiness.md was edited after generation to add CHK051, which traces to "Const Principle I v2.0.0" and "Spec §FR-012" — neither exists (constitution is v1.1.0, spec 001 FRs end at FR-010). Surface this to the operator and ask whether they want to (a) author the v2.0.0 outbound-HTTPS principle + spec FR-011/FR-012 to justify CHK051, or (b) retag CHK051 to existing sources. Maintain the proposed-edits-for-review workflow: working-tree edits only, no auto-commit, doc/spec only, no code. Use full file paths. Respect the [NEEDS CLARIFICATION] vs [DEFERRED] marker law from constitution v1.1.0. The 5 SKU-mapping markers in spec 001 remain a separate operator + brand-guardian workstream — do not resolve them unilaterally.
  </handoff_instructions>
</context_handoff>
