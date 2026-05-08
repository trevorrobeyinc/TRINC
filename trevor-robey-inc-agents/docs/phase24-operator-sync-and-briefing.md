# Phase 24 Operator Sync And Briefing

Phase 24 activates the existing governed Notion and newsletter mutation surfaces for operator-facing use without expanding the repository's manual-only external action boundary.

## Scope
- Promote the Notion and newsletter MCP contracts from `stub_only` scaffolds to operator-gated `prepare`, `commit`, `retry`, and `reconcile` lifecycle contracts.
- Keep `research.search` and `research.getPaper` unchanged: newsletter and notion remain unavailable there and still fail with `MCP_NOT_IMPLEMENTED`.
- Reuse the current approval scopes only:
  - `mutation.newsletter.prepare`
  - `mutation.notion.prepare`
  - `mutation.commit`
  - `mutation.reconcile`

## Deterministic Briefing Artifacts
Every successful `prepare` writes a local-only artifact bundle under `audit/evidence/phase24/<provider>/sequence-<NNNNNN>/`:
- `request-snapshot.json`
- `sanitized-payload.json`
- `operator-briefing.md`
- `hash-manifest.json`

These artifacts are deterministic for identical inputs and are intended for operator review before any commit/retry/reconcile action is attempted.

## Security Boundary
- No browser automation.
- No login automation.
- No background sync loop.
- No autonomous publication or scheduling loop.
- No new outbound hosts or methods beyond the existing mutation egress policy.
- No credential broker or delegated session governance changes; those remain deferred to Phase 25.

## Operator Workflow
1. Use `mutation.preparePublication` with an operator approval token scoped to the provider-specific `prepare` action.
2. Review the generated Phase 24 briefing artifacts locally.
3. Use `mutation.commitPublication` to attempt the outbound write when the operator is ready.
4. Use `mutation.retryPublication` only for uncertain outcomes.
5. Use `mutation.reconcilePublication` to confirm committed/not-committed state or abandon a stale pending mutation.

## Verification
- `npm run phase24:verify`
- `bash scripts/verify-phase24-policy.sh`
