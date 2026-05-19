# Credential Broker Threat Model (Phase 25)

## Threats
- Credential exfiltration through logs.
- Handle forgery and replay.
- Unauthorized broker access.
- Delegated connector session reuse outside approved connector/operation scope.
- Approval-token revocation drift leaving a delegated session active after access should be denied.

## Phase 25 controls
- Handle-only request interface.
- Connector-scoped delegated sessions with explicit allowed-operation lists.
- Governed issuance paths backed by `governance.credential.handle.issue` and `governance.connector.session.issue`.
- approval-token validity rechecked during delegated session validation.
- No plaintext secret persistence in tracked files or audit artifacts.
- No external secret manager, OAuth, browser login, or background credential refresh loop.
