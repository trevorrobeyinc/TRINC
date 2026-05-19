# Credential Broker Boundary (Phase 25)

Trust boundary:

`[Agent/Container] -> opaque credential handle -> [Credential Broker] -> secret injection -> [External API]`

## Isolation baseline
1. Broker runs under separate process/service identity.
2. Broker does not share writable workspace with role agents.
3. Broker accepts only token-handle requests, not raw key write operations.
4. Broker emits structured access logs with request ID and principal hash.
5. Broker never writes plaintext secrets to repo-tracked files.

## Phase 25 governance additions
1. Governed handle issuance requires operator confirmation and `governance.credential.handle.issue`.
2. Delegated connector session issuance requires operator confirmation and `governance.connector.session.issue`.
3. Delegated sessions are scoped to one connector plus an explicit allowed-operation list.
4. Delegated session validity depends on both broker-handle TTL and approval-token validity.
5. Secrets remain in memory only within the broker; no repo-tracked broker/session store is introduced.
6. No OAuth, browser login, external KMS, or remote secret-manager dependency is added in this phase.
