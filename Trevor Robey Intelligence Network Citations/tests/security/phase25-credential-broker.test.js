"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createCredentialBroker } = require("../../openclaw-bridge/security/credential-broker.js");
const { setupPhase13Harness, issueToken } = require("./_phase13-helpers.js");

function createBroker(harness, options = {}) {
  return createCredentialBroker({
    ttlMs: 15 * 60 * 1000,
    sessionTtlMs: 5 * 60 * 1000,
    nowMs: () => harness.timeProvider.nowMs(),
    tokenManager: harness.tokenManager,
    roleRegistry: harness.roleRegistry,
    scopeRegistry: harness.scopeRegistry,
    ...options
  });
}

async function issuePhase25ApprovalToken(harness, scopes) {
  return issueToken(harness, {
    role: "operator_admin",
    scopes,
    requester: "phase25-test",
    correlationId: "phase25-approval-token"
  });
}

test("phase25 credential broker issues governed handle and delegated session for scoped connector access", async () => {
  const harness = await setupPhase13Harness();
  const approval = await issuePhase25ApprovalToken(harness, [
    "governance.credential.handle.issue",
    "governance.connector.session.issue"
  ]);
  const broker = createBroker(harness);

  const governedHandle = broker.issueGovernedHandle("secret-value", {
    principal: "integration-hatchify",
    purpose: "notion prepare publish",
    connector: "notion-sync",
    allowed_operations: ["commit_publish", "prepare_publish"]
  }, {
    role: "operator",
    requester: "tester",
    confirm: true,
    approvalTokenId: approval.token_record.token_id
  });

  assert.equal(governedHandle.handle_record.connector, "notion-sync");
  assert.equal(governedHandle.handle_record.approval_scope, "governance.credential.handle.issue");

  const delegated = broker.issueDelegatedSession(governedHandle.handle_record.handle_id, {
    delegated_principal: "integration-hatchify",
    connector: "notion-sync",
    allowed_operations: ["prepare_publish"]
  }, {
    role: "operator",
    requester: "tester",
    confirm: true,
    approvalTokenId: approval.token_record.token_id
  });

  const validation = broker.validateDelegatedSession(delegated.session_record.session_id, {
    connector: "notion-sync",
    operation: "prepare_publish"
  });
  assert.equal(validation.valid, true);

  const resolved = broker.resolveDelegatedSession(delegated.session_record.session_id, {
    connector: "notion-sync",
    operation: "prepare_publish"
  });
  assert.equal(resolved.value, "secret-value");
  assert.equal(resolved.metadata.connector, "notion-sync");
  assert.equal(resolved.metadata.delegated_principal, "integration-hatchify");
  assert.deepEqual(resolved.metadata.allowed_operations, ["prepare_publish"]);
});

test("phase25 delegated session becomes invalid when the approval token is revoked", async () => {
  const harness = await setupPhase13Harness();
  const approval = await issuePhase25ApprovalToken(harness, [
    "governance.credential.handle.issue",
    "governance.connector.session.issue"
  ]);
  const broker = createBroker(harness);

  const governedHandle = broker.issueGovernedHandle("secret-value", {
    principal: "integration-hatchify",
    purpose: "notion prepare publish",
    connector: "notion-sync",
    allowed_operations: ["prepare_publish"]
  }, {
    role: "operator",
    requester: "tester",
    confirm: true,
    approvalTokenId: approval.token_record.token_id
  });

  const delegated = broker.issueDelegatedSession(governedHandle.handle_record.handle_id, {
    delegated_principal: "integration-hatchify",
    connector: "notion-sync",
    allowed_operations: ["prepare_publish"]
  }, {
    role: "operator",
    requester: "tester",
    confirm: true,
    approvalTokenId: approval.token_record.token_id
  });

  await harness.tokenManager.revokeToken(approval.token_record.token_id, "operator_cleanup", {
    role: "operator",
    requester: "tester",
    confirm: true,
    correlationId: "phase25-approval-revoke"
  });

  const validation = broker.validateDelegatedSession(delegated.session_record.session_id, {
    connector: "notion-sync",
    operation: "prepare_publish"
  });
  assert.equal(validation.valid, false);
  assert.equal(validation.reason, "approval_token_invalid");

  assert.throws(
    () => broker.resolveDelegatedSession(delegated.session_record.session_id, {
      connector: "notion-sync",
      operation: "prepare_publish"
    }),
    (error) => error && error.code === "BROKER_SESSION_APPROVAL_INVALID"
  );
});

test("phase25 delegated session denies connector and operation drift", async () => {
  const harness = await setupPhase13Harness();
  const approval = await issuePhase25ApprovalToken(harness, [
    "governance.credential.handle.issue",
    "governance.connector.session.issue"
  ]);
  const broker = createBroker(harness);

  const governedHandle = broker.issueGovernedHandle("secret-value", {
    principal: "integration-hatchify",
    purpose: "notion prepare publish",
    connector: "notion-sync",
    allowed_operations: ["prepare_publish"]
  }, {
    role: "operator",
    requester: "tester",
    confirm: true,
    approvalTokenId: approval.token_record.token_id
  });

  const delegated = broker.issueDelegatedSession(governedHandle.handle_record.handle_id, {
    delegated_principal: "integration-hatchify",
    connector: "notion-sync",
    allowed_operations: ["prepare_publish"]
  }, {
    role: "operator",
    requester: "tester",
    confirm: true,
    approvalTokenId: approval.token_record.token_id
  });

  const connectorMismatch = broker.validateDelegatedSession(delegated.session_record.session_id, {
    connector: "newsletter-publisher",
    operation: "prepare_publish"
  });
  assert.equal(connectorMismatch.valid, false);
  assert.equal(connectorMismatch.reason, "connector_mismatch");

  assert.throws(
    () => broker.resolveDelegatedSession(delegated.session_record.session_id, {
      connector: "notion-sync",
      operation: "retry_publish"
    }),
    (error) => error && error.code === "BROKER_OPERATION_NOT_ALLOWED"
  );
});

test("phase25 governed issuance fails closed when the approval token lacks session scope", async () => {
  const harness = await setupPhase13Harness();
  const approval = await issuePhase25ApprovalToken(harness, [
    "governance.credential.handle.issue"
  ]);
  const broker = createBroker(harness);

  const governedHandle = broker.issueGovernedHandle("secret-value", {
    principal: "integration-hatchify",
    purpose: "notion prepare publish",
    connector: "notion-sync",
    allowed_operations: ["prepare_publish"]
  }, {
    role: "operator",
    requester: "tester",
    confirm: true,
    approvalTokenId: approval.token_record.token_id
  });

  assert.throws(
    () => broker.issueDelegatedSession(governedHandle.handle_record.handle_id, {
      delegated_principal: "integration-hatchify",
      connector: "notion-sync",
      allowed_operations: ["prepare_publish"]
    }, {
      role: "operator",
      requester: "tester",
      confirm: true,
      approvalTokenId: approval.token_record.token_id
    }),
    (error) => error && error.code === "BROKER_APPROVAL_SCOPE_DENIED"
  );
});
