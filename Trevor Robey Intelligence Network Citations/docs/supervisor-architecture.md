# Supervisor Architecture (Cline)

## Scope and Authority
- Cline (Plan/Act) is a recommended outer operator workflow for this repository.
- The canonical runtime supervisor/governance authority remains in-repo.
- No runtime dependency on Cline is required.
- GitHub Actions is the primary enforcement path for policy/test gates; local git hooks are optional convenience only.
- Supervisor is orchestration/approval-facing only and is not a privileged mutation executor.
- Supervisor direct tool execution remains blocked.
- Supervisor cannot bypass operator authorization, approval token scopes, governance transaction controls, or kill-switch protections.

## Mandatory Security Invariants
1. No autonomous external submission.
2. No automated login, credential, or browser submission flows.
3. No bypass of operator approval for protected mutations.
4. No bypass of governance transaction wrappers.
5. No bypass or weakening of kill-switch behavior.
6. No supervisor direct-mutation privilege escalation.
7. No dynamic endpoint/domain expansion.
8. No nondeterministic policy checks.
9. CI policy gates are release-blocking.
10. Backward compatibility of existing phase controls is preserved.
11. Phase 20 dataset commercialization gates are fail-closed.
12. Phase 21 publisher adapter contracts and release approvals are fail-closed.
13. Phase 22 post-export submission evidence ledgers are append-only and fail-closed.
14. Phase 23 commercialization decision support remains read-only and fails closed on missing or malformed evidence indexes.
15. Phase 24 operator sync and briefing remains operator-only, approval-scoped, and local-artifact-backed.
16. Phase 25 credential brokering remains local-only, in-memory, and approval-scoped.
17. Phase 26A bridge auth and principal lane separation remains fail-closed.
18. Phase 27 Hatchify integration remains read-only and manual-only for Sider handoff/re-entry.
19. Phase 28 direct-delivery evidence ledgers are append-only and fail-closed.

## Protected Mutation Contract
- Protected mutations require operator role, scoped approval token, governance transaction wrapper, and kill-switch-open state.
- Mutation calls must continue using operator-scoped pathways and token consumption enforcement.
- Any attempt to execute protected mutations from supervisor context is denied.

## Manual-Only Boundary
- External submission, platform login, attestation, and final submission actions are manual-only.
- Cline supervision may prepare artifacts, but final external actions remain human-operated.

## Phase 20 Dataset Gate
- Phase 20 dataset commercialization gates are fail-closed.
- A dataset build is commercialization-ready only when validation passes, quality passes, provenance is present, and license review resolves to `allowed`.
- `review_required` dataset builds remain explicit-selection/manual-review artifacts only.
- Unknown rights state is blocked and cannot silently pass into packaging defaults.

## Phase 21 Publisher Adapter Gate
- Phase 21 publisher adapter contracts are fail-closed for runtime construction and release approval.
- Runtime requires one adapter registration per configured platform target and rejects unknown/missing/duplicate mappings.
- Adapter outputs are confined to `submission/<platform>/...`, remain `manual_only`, and must satisfy required placeholders.
- Phase 21 approvals are versioned and validated (`phase21-release-approval-v1`) before export is allowed.

## Phase 22 Submission Evidence Gate
- Phase 22 evidence capture is local-only post-export governance and does not automate external publishing.
- Authoritative stores are append-only and chain-hashed:
  - `submission-evidence/export-events.json`
  - `submission-evidence/ledger.json`
- Evidence recording for platform target `X` requires:
  - validated approved release
  - export event coverage for `X`
- Initial state for `X` is derived as `ready_for_manual_submission` from export history; no synthetic evidence initialization event is created.
- Evidence events enforce fail-closed state transitions, idempotency keys, attachment path confinement, and no-rewrite history policy.
- Derived snapshots/index are rebuildable convenience views only and are never authoritative.
- Phase 22 verification integrity status is separate from release approval validity and release bundle hash validity.

## Phase 23 Portfolio Intelligence Gate
- Phase 23 portfolio intelligence is read-only and builds deterministic commercialization decisions from approved release state plus:
  - `submission-evidence-index.json`
  - `delivery-evidence-index.json`
- Phase 23 validates approved bundle hashes and approved target coverage before reporting.
- Missing or malformed evidence indexes fail closed instead of inferring success.
- Output artifacts under `audit/evidence/phase23/` are advisory-only and do not mutate release approval, evidence ledgers, or export state.
- Phase 23 does not add browser automation, login automation, external submission, delivery automation, or new outbound hosts.

## Phase 24 Operator Sync And Briefing Gate
- Phase 24 keeps newsletter and notion unavailable in `research.search` and `research.getPaper`.
- Operator-facing mutation entry remains limited to governed `prepare`, `commit`, `retry`, and `reconcile` lifecycles.
- Successful `prepare` calls emit deterministic local-only briefing artifacts under `audit/evidence/phase24/`.
- Approval scopes remain unchanged:
  - `mutation.newsletter.prepare`
  - `mutation.notion.prepare`
  - `mutation.commit`
  - `mutation.reconcile`
- Outbound host and method allowlists remain unchanged for Beehiiv and Notion mutation targets.
- Phase 24 does not add browser automation, login automation, background sync, autonomous publish loops, or credential/session broker expansion.

## Phase 25 Credential Broker And Delegated Session Gate
- Phase 25 keeps brokered secrets in memory only; no repo-tracked credential/session store is added.
- Governed credential-handle issuance requires:
  - operator role
  - explicit confirmation
  - `governance.credential.handle.issue`
- Delegated connector session issuance requires:
  - operator role
  - explicit confirmation
  - `governance.connector.session.issue`
- Delegated sessions remain fail-closed:
  - one connector per session
  - explicit allowed-operation list
  - session validity depends on underlying approval-token validity
- Phase 25 does not add browser automation, login automation, OAuth, external secret managers, or background credential refresh loops.

## Phase 26A Bridge Prerequisite Gate
- Phase 26A is a minimal prerequisite slice for future integration phases and is not full Phase 26 consolidation.
- Bridge auth and principal resolution are shared across:
  - `/mcp`
  - `/mcp/sse`
  - `/mcp/events`
  - `/mcp/messages`
  - `/operator/mcp/messages`
  - `/jobs*`
- `/health` remains unauthenticated.
- `integration_hatchify` lane is read-only and must not enter operator mutation routes.
- Phase 26A does not add Sider export/re-entry, browser/login automation, background sync, bidirectional integration, or mutation access for Hatchify.

## Phase 27 Sider + Hatchify Gate
- Hatchify credentials are issued via existing Phase 13 token flow using `integration_hatchify` role + `integration.hatchify.readonly` scope.
- Server-side enforcement remains authoritative; client-side tool filters are convenience only.
- Sider content flow is redacted-only and manual:
  - export deterministic brief artifacts
  - manual operator review
  - deterministic manual re-entry artifacts with source export hash linkage
- Phase 27 does not add browser automation, login automation, background sync, bidirectional integration, or mutation access for Hatchify.

## Phase 28 Direct-Delivery Evidence Gate
- Phase 28 direct-delivery capture is local-only post-export governance and does not automate external delivery.
- Authoritative stores are append-only and chain-hashed:
  - `delivery-evidence/export-events.json`
  - `delivery-evidence/ledger.json`
- Delivery evidence recording for `delivery_target = X` requires:
  - validated approved release
  - export event coverage for `X`
- Initial state for `X` is derived as `ready_for_manual_delivery` from export history; no synthetic initialization event is created.
- Delivery events enforce fail-closed state transitions, idempotency keys, attachment path confinement, and no-rewrite history policy.
- Derived snapshots/index are rebuildable convenience views only and are never authoritative.
- Phase 28 verification integrity status is separate from release approval validity and release bundle hash validity.

## Trust Boundaries
- Supervisor boundary: Cline orchestrates and requests approvals but does not obtain privileged mutation authority.
- Operator boundary: Operator role is the only role allowed to execute protected mutation methods.
- Governance boundary: All protected writes run within `apiGovernance.withGovernanceTransaction(...)`.
- Runtime boundary: Kill-switch gates mutation pathways and fails closed when active.

## Threat Model Summary
- Elevation of privilege attempt by supervisor role.
- Unauthorized mutation attempts without operator scope/token.
- Policy drift that weakens kill-switch or governance wrappers.
- Misconfigured local developer environment that omits Cline policy artifacts.
- CI misconfiguration that silently skips required policy gates.

## Denial Paths
- Supervisor mutation attempts are denied at role checks and supervisor execution boundaries.
- Missing or invalid scoped approval tokens are denied before mutation writes.
- Kill-switch active state denies prepare/commit mutation paths.
- Policy contradiction or missing Cline contract artifacts fails CI.

## Failure Mode Behavior
- Missing Cline supervisor contract/config files: fail closed in `scripts/verify-cline-supervisor-policy.sh`.
- Contradictory supervisor/mutation language in docs/rules: fail closed in policy gate.
- Missing required verification scripts in CI: hard error and pipeline failure.
- Cross-repo parity path unavailable: classification is `UNAVAILABLE_NON_BLOCKING` and does not block certification.
