# MCP Error Codes (Phase 4)

## Mutation Control
- `MUTATION_DISABLED`
- `MUTATION_KILL_SWITCH_ACTIVE`
- `MUTATION_PENDING_NOT_FOUND`
- `MUTATION_PENDING_INVALID_PREPARE_STATE`
- `MUTATION_ALREADY_PENDING`
- `MUTATION_ALREADY_COMMITTED`
- `MUTATION_RETRY_DISALLOWED`
- `MUTATION_RETRY_LIMIT_REACHED`
- `MUTATION_UNCERTAIN_RECONCILE_REQUIRED`
- `MUTATION_RECONCILE_ACTION_INVALID`
- `MUTATION_RECONCILE_STATE_INVALID`

## Operator Authorization
- `OPERATOR_TOKEN_REQUIRED`
- `OPERATOR_TOKEN_INVALID`
- `OPERATOR_TOKEN_SCOPE_INVALID`
- `OPERATOR_TOKEN_REUSED`
- `MUTATION_ROLE_DENIED`

## Governance (Mutation)
- `API_GOVERNANCE_MUTATION_ATTEMPT_REQUIRED`
- `API_GOVERNANCE_MUTATION_HOURLY_PUBLISHES_EXCEEDED`
- `API_GOVERNANCE_MUTATION_DAILY_PUBLISHES_EXCEEDED`
- `API_GOVERNANCE_MUTATION_DAILY_WRITE_TOKENS_EXCEEDED`
- `API_GOVERNANCE_MUTATION_CONTROL_TOGGLES_EXCEEDED`

## Egress / TLS
- `EGRESS_METHOD_REQUIRED`
- `EGRESS_METHOD_DENIED`
- `MUTATION_EGRESS_POLICY_MISSING`
- `MUTATION_TLS_ENV_OVERRIDE_FORBIDDEN`
- `MUTATION_OUTBOUND_TIMEOUT`
- `MUTATION_OUTBOUND_FAILED`

## Payload / Integrity
- `MUTATION_PAYLOAD_TOO_LARGE`
- `MUTATION_HTML_TOO_LARGE`
- `MUTATION_EXTERNAL_LINKS_EXCEEDED`
- `MUTATION_EMBEDDED_IMAGES_EXCEEDED`
- `MUTATION_LOG_CHAIN_INVALID`

## Citation Integrity
Emitted by the report-level citation gate run in `workflow-engine.executeMissionStep`,
which cross-checks every identifier cited in the assembled report against the union of
identifiers actually retrieved at runtime by tool-prefetch (citations are grounded in the
source records retrieved at runtime, plus DOI retraction-screening via Crossref). The gate
engages only when there is fetched ground truth.
- `PHASE30_CITATION_UNVERIFIED` — the grounded ratio (cited identifiers present in fetched
  evidence ÷ total cited) fell below `minGroundedCitationRatio` (agent-config default `0.34`);
  the report refuses to ship. Surviving ungrounded cites are annotated inline `[UNVERIFIED]`
  and a `citation-verification.json` / `report-annotated.md` pair is written to the workflow dir.
- `PHASE30_CITATION_RETRACTED` — a cited DOI was found retracted via Crossref `/works/{DOI}`
  (`relation.is-retracted-by` or an `update-to` of type `retraction`); the report hard-stops.
  Fail-soft: a Crossref error yields no retractions, so a network blip can never wrongly block
  a report.
