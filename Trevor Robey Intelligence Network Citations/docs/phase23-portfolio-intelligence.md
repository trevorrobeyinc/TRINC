# Phase 23 Portfolio Intelligence and Submission Outcome Analysis

## Scope
- Phase 23 adds deterministic, read-only commercialization decision support on top of:
  - approved release bundles
  - Phase 22 submission evidence indexes
  - Phase 28 delivery evidence indexes
- Phase 23 does not mutate release state, approval state, submission evidence, or delivery evidence.

## Inputs
- `workspace/releases/<offerId>/offer.json`
- `workspace/releases/<offerId>/release-approval.json`
- `workspace/releases/index/submission-evidence-index.json`
- `workspace/releases/index/delivery-evidence-index.json`

## Outputs
- `audit/evidence/phase23/portfolio-evidence-summary.json`
- `audit/evidence/phase23/portfolio-evidence-snapshot.json`
- `audit/evidence/phase23/commercialization-decisions.json`
- `audit/evidence/phase23/phase23-portfolio-report.md`
- `audit/evidence/phase23/report-hash-manifest.json`

## Decision Model
- Phase 23 classifies each approved offer into one stable action bucket:
  - `continue`
  - `retry`
  - `refresh`
  - `retire`
  - `investigate`
- Decision support is derived only from local bundle + evidence state.
- Mixed success/failure signals remain fail-closed and classify as `investigate`.

## Fail-Closed Rules
- If approved offers exist, both repo indexes are required.
- Malformed indexes, missing offer rows, bundle-hash mismatches, or target-set drift are hard failures.
- Phase 23 never infers commercialization success from missing evidence.

## Manual-Only Boundary
- No browser automation.
- No login automation.
- No network submission or delivery execution.
- No automatic publishing, re-delivery, or marketplace interaction.
- Outputs are operator-facing decision support only.
