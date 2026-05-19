# Phase 25 Credential Broker And Delegated Session Governance

Phase 25 formalizes local-only credential brokering and approval-backed delegated connector sessions for future integrations without weakening the repository's manual-only external boundary.

## Scope
- Extend `openclaw-bridge/security/credential-broker.js` with governed handle issuance.
- Add delegated connector sessions that are scoped to:
  - one connector
  - explicit allowed operations
  - the validity window of the underlying approval token
- Keep secrets local-only and in-memory.
- Reuse the existing Phase 13 token/scope governance model instead of introducing a new identity provider.

## Approval Scopes
- `governance.credential.handle.issue`
- `governance.connector.session.issue`

## Stop Condition
- Governed handle issuance requires operator role, explicit confirmation, and `governance.credential.handle.issue`.
- Delegated session issuance requires operator role, explicit confirmation, and `governance.connector.session.issue`.
- Delegated sessions fail closed when:
  - the broker handle expires or is revoked
  - the approval token expires or is revoked
  - the requested connector does not match
  - the requested operation is not on the approved allowlist
- Policy docs, tests, and CI wiring pass.

## Non-goals
- No browser automation.
- No login automation.
- No OAuth, LDAP, SAML, or external identity provider.
- No external KMS or remote secret manager.
- No background credential refresh or autonomous session extension.

## Operator Workflow
1. Issue or hold an operator-approved token containing the needed Phase 25 scope.
2. Create a governed handle for a connector-scoped secret.
3. Issue a delegated session for the exact connector operations that need temporary access.
4. Resolve the delegated session only for those approved operations.
5. Reissue rather than silently extend when the handle or approval token expires.

## Verification
- `npm run phase25:verify`
- `bash scripts/verify-phase25-policy.sh`
