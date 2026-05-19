"use strict";

const { randomUuid } = require("../core/entropy-provider.js");
const { nowMs } = require("../core/time-provider.js");
const {
  isRoleAllowedForScope,
  normalizeScopes,
  roleAlias
} = require("../../workflows/access-control/access-control-common.js");

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((entry) => normalizeString(entry)).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right));
  }
  if (typeof value === "string") {
    return normalizeList(String(value).split(","));
  }
  return [];
}

function toPositiveMs(value, fallbackMs, minimumMs) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackMs;
  }
  return Math.max(minimumMs, parsed);
}

function makeError(code, message, details) {
  const error = new Error(String(message || "Credential broker error"));
  error.code = String(code || "BROKER_ERROR");
  if (typeof details !== "undefined") {
    error.details = details;
  }
  return error;
}

function normalizeHandleMetadata(metadata = {}) {
  return {
    principal: normalizeString(metadata.principal) || "unknown",
    purpose: normalizeString(metadata.purpose) || "runtime",
    connector: normalizeString(metadata.connector),
    allowed_operations: normalizeList(metadata.allowed_operations || metadata.allowedOperations),
    secret_kind: normalizeString(metadata.secret_kind || metadata.secretKind) || "opaque"
  };
}

function normalizeSessionRequest(request = {}, handleMetadata = {}, fallbackPrincipal = "") {
  const connector = normalizeString(request.connector) || normalizeString(handleMetadata.connector);
  const allowedOperations = normalizeList(request.allowed_operations || request.allowedOperations);
  const fallbackOperations = normalizeList(handleMetadata.allowed_operations || handleMetadata.allowedOperations);

  return {
    connector,
    delegated_principal: normalizeString(request.delegated_principal || request.delegatedPrincipal)
      || normalizeString(handleMetadata.principal)
      || normalizeString(fallbackPrincipal)
      || "unknown",
    purpose: normalizeString(request.purpose) || normalizeString(handleMetadata.purpose) || "runtime",
    allowed_operations: allowedOperations.length > 0 ? allowedOperations : fallbackOperations
  };
}

function createCredentialBroker(options = {}) {
  const ttlMs = toPositiveMs(options.ttlMs, 5 * 60 * 1000, 1000);
  const sessionTtlMs = toPositiveMs(options.sessionTtlMs, ttlMs, 1000);
  const currentTimeMs = typeof options.nowMs === "function" ? options.nowMs : nowMs;
  const tokenManager = options.tokenManager && typeof options.tokenManager.validateToken === "function"
    ? options.tokenManager
    : null;
  const roleRegistry = options.roleRegistry && typeof options.roleRegistry.hasPermission === "function"
    ? options.roleRegistry
    : null;
  const scopeRegistry = options.scopeRegistry && typeof options.scopeRegistry.validateScope === "function"
    ? options.scopeRegistry
    : null;

  const credentialsByHandle = new Map();
  const sessionsById = new Map();

  function requireGovernance() {
    if (!tokenManager || !roleRegistry || !scopeRegistry) {
      throw makeError(
        "BROKER_GOVERNANCE_UNAVAILABLE",
        "Governed credential brokering requires tokenManager, roleRegistry, and scopeRegistry"
      );
    }
  }

  function purgeExpired() {
    const current = currentTimeMs();
    for (const [handle, entry] of credentialsByHandle.entries()) {
      if (current >= entry.expiresAt) {
        credentialsByHandle.delete(handle);
      }
    }
    for (const [sessionId, entry] of sessionsById.entries()) {
      if (current >= entry.expiresAt || !credentialsByHandle.has(entry.handle_id)) {
        sessionsById.delete(sessionId);
      }
    }
  }

  function sanitizeHandleRecord(handleId, entry) {
    return {
      handle_id: handleId,
      principal: entry.metadata.principal,
      purpose: entry.metadata.purpose,
      connector: entry.metadata.connector,
      allowed_operations: [...entry.metadata.allowed_operations],
      secret_kind: entry.metadata.secret_kind,
      created_at_ms: entry.createdAt,
      expires_at_ms: entry.expiresAt,
      approval_scope: entry.approval && entry.approval.scope_id ? entry.approval.scope_id : "",
      approval_token_id: entry.approval && entry.approval.token_id ? entry.approval.token_id : ""
    };
  }

  function sanitizeSessionRecord(sessionId, entry) {
    return {
      session_id: sessionId,
      handle_id: entry.handle_id,
      connector: entry.connector,
      delegated_principal: entry.delegated_principal,
      purpose: entry.purpose,
      allowed_operations: [...entry.allowed_operations],
      created_at_ms: entry.createdAt,
      expires_at_ms: entry.expiresAt,
      approval_scope: entry.approval && entry.approval.scope_id ? entry.approval.scope_id : "",
      approval_token_id: entry.approval && entry.approval.token_id ? entry.approval.token_id : ""
    };
  }

  function ensureOperatorContext(context = {}) {
    if (roleAlias(context.role) !== "operator_admin") {
      throw makeError("BROKER_OPERATOR_REQUIRED", "operator role is required for governed broker actions");
    }
    if (context.confirm !== true) {
      throw makeError("BROKER_CONFIRM_REQUIRED", "Governed broker actions require confirm=true");
    }
  }

  function validateApprovalScope(scopeId, context = {}) {
    requireGovernance();
    ensureOperatorContext(context);

    const tokenId = normalizeString(context.approvalTokenId || context.approval_token_id);
    if (!tokenId) {
      throw makeError("BROKER_APPROVAL_TOKEN_REQUIRED", "approvalTokenId is required for governed broker actions");
    }

    const scope = scopeRegistry.validateScope(scopeId);
    if (!scope.valid) {
      throw makeError("BROKER_SCOPE_UNKNOWN", `Unknown broker approval scope '${scopeId}'`);
    }

    const tokenStatus = tokenManager.validateToken(tokenId);
    if (!tokenStatus.role) {
      throw makeError("BROKER_APPROVAL_TOKEN_INVALID", "Approval token is unknown");
    }
    if (tokenStatus.revoked) {
      throw makeError("BROKER_APPROVAL_TOKEN_REVOKED", "Approval token is revoked");
    }
    if (tokenStatus.expired) {
      throw makeError("BROKER_APPROVAL_TOKEN_EXPIRED", "Approval token is expired");
    }
    if (!tokenStatus.valid) {
      throw makeError("BROKER_APPROVAL_TOKEN_INVALID", "Approval token is invalid");
    }

    const normalizedRole = roleAlias(tokenStatus.role);
    const grantedScopes = normalizeScopes(tokenStatus.scopes);
    if (!grantedScopes.includes(scopeId)) {
      throw makeError("BROKER_APPROVAL_SCOPE_DENIED", `Approval token does not grant scope '${scopeId}'`);
    }
    if (!isRoleAllowedForScope(scope, normalizedRole)) {
      throw makeError("BROKER_APPROVAL_SCOPE_DENIED", `Role '${normalizedRole}' cannot use scope '${scopeId}'`);
    }
    if (!roleRegistry.hasPermission(normalizedRole, scope.action, scope.resource)) {
      throw makeError("BROKER_APPROVAL_SCOPE_DENIED", `Role '${normalizedRole}' lacks permission for scope '${scopeId}'`);
    }

    return {
      token_id: tokenId,
      scope_id: scopeId,
      role: normalizedRole
    };
  }

  function issueHandle(secretValue, metadata = {}) {
    purgeExpired();
    const secret = normalizeString(secretValue);
    if (!secret) {
      throw makeError("BROKER_SECRET_REQUIRED", "Secret value is required");
    }

    const handle = `cred_${randomUuid()}`;
    const issuedAt = currentTimeMs();
    credentialsByHandle.set(handle, {
      value: secret,
      metadata: normalizeHandleMetadata(metadata),
      createdAt: issuedAt,
      expiresAt: issuedAt + ttlMs,
      approval: null
    });
    return handle;
  }

  function issueGovernedHandle(secretValue, metadata = {}, context = {}) {
    const normalizedMetadata = normalizeHandleMetadata(metadata);
    if (!normalizedMetadata.connector) {
      throw makeError("BROKER_CONNECTOR_REQUIRED", "Governed credential handles require a connector");
    }
    const approval = validateApprovalScope("governance.credential.handle.issue", context);
    const handle = issueHandle(secretValue, normalizedMetadata);
    const entry = credentialsByHandle.get(handle);
    entry.approval = approval;
    credentialsByHandle.set(handle, entry);
    return {
      handle_record: sanitizeHandleRecord(handle, entry)
    };
  }

  function resolveHandle(handle) {
    purgeExpired();
    const key = normalizeString(handle);
    if (!key || !credentialsByHandle.has(key)) {
      throw makeError("BROKER_HANDLE_NOT_FOUND", "Credential handle not found or expired");
    }
    const entry = credentialsByHandle.get(key);
    return {
      value: entry.value,
      metadata: {
        principal: entry.metadata.principal,
        purpose: entry.metadata.purpose,
        connector: entry.metadata.connector,
        allowed_operations: [...entry.metadata.allowed_operations],
        secret_kind: entry.metadata.secret_kind
      },
      expiresAt: entry.expiresAt
    };
  }

  function revokeHandle(handle) {
    const key = normalizeString(handle);
    if (!key) {
      return false;
    }
    const removed = credentialsByHandle.delete(key);
    if (removed) {
      for (const [sessionId, session] of sessionsById.entries()) {
        if (session.handle_id === key) {
          sessionsById.delete(sessionId);
        }
      }
    }
    return removed;
  }

  function issueDelegatedSession(handle, request = {}, context = {}) {
    purgeExpired();
    const key = normalizeString(handle);
    if (!key || !credentialsByHandle.has(key)) {
      throw makeError("BROKER_HANDLE_NOT_FOUND", "Credential handle not found or expired");
    }

    const approval = validateApprovalScope("governance.connector.session.issue", context);
    const handleEntry = credentialsByHandle.get(key);
    const sessionRequest = normalizeSessionRequest(request, handleEntry.metadata, context.requester);

    if (!sessionRequest.connector) {
      throw makeError("BROKER_CONNECTOR_REQUIRED", "Delegated sessions require a connector");
    }
    if (sessionRequest.allowed_operations.length === 0) {
      throw makeError("BROKER_ALLOWED_OPERATIONS_REQUIRED", "Delegated sessions require at least one allowed operation");
    }

    const sessionId = `ses_${randomUuid()}`;
    const issuedAt = currentTimeMs();
    const requestedTtlMs = toPositiveMs(request.ttlMs || request.ttl_ms, sessionTtlMs, 1000);
    const expiresAt = Math.min(issuedAt + requestedTtlMs, handleEntry.expiresAt);

    const entry = {
      handle_id: key,
      connector: sessionRequest.connector,
      delegated_principal: sessionRequest.delegated_principal,
      purpose: sessionRequest.purpose,
      allowed_operations: [...sessionRequest.allowed_operations],
      createdAt: issuedAt,
      expiresAt,
      approval
    };

    sessionsById.set(sessionId, entry);
    return {
      session_record: sanitizeSessionRecord(sessionId, entry)
    };
  }

  function validateDelegatedSession(sessionId, access = {}) {
    purgeExpired();
    const key = normalizeString(sessionId);
    const connector = normalizeString(access.connector);
    const operation = normalizeString(access.operation);

    const invalid = (reason) => ({
      valid: false,
      reason,
      expired: reason === "session_expired",
      approval_token_valid: reason !== "approval_token_invalid",
      handle_valid: reason !== "handle_missing_or_expired",
      connector_allowed: reason !== "connector_mismatch",
      operation_allowed: reason !== "operation_not_allowed",
      remaining_minutes: 0
    });

    if (!key || !sessionsById.has(key)) {
      return invalid("session_not_found");
    }

    const entry = sessionsById.get(key);
    const current = currentTimeMs();
    if (current >= entry.expiresAt) {
      sessionsById.delete(key);
      return invalid("session_expired");
    }

    if (!credentialsByHandle.has(entry.handle_id)) {
      sessionsById.delete(key);
      return invalid("handle_missing_or_expired");
    }

    if (connector && connector !== entry.connector) {
      return invalid("connector_mismatch");
    }

    if (operation && !entry.allowed_operations.includes(operation)) {
      return invalid("operation_not_allowed");
    }

    if (tokenManager && entry.approval && entry.approval.token_id) {
      const tokenStatus = tokenManager.validateToken(entry.approval.token_id);
      if (!tokenStatus.valid) {
        return invalid("approval_token_invalid");
      }
    }

    return {
      valid: true,
      reason: "allow",
      expired: false,
      approval_token_valid: true,
      handle_valid: true,
      connector_allowed: true,
      operation_allowed: true,
      remaining_minutes: Math.max(0, Math.floor((entry.expiresAt - current) / 60000)),
      session_record: sanitizeSessionRecord(key, entry)
    };
  }

  function resolveDelegatedSession(sessionId, access = {}) {
    const validation = validateDelegatedSession(sessionId, access);
    if (!validation.valid) {
      const codeByReason = {
        session_not_found: "BROKER_SESSION_NOT_FOUND",
        session_expired: "BROKER_SESSION_EXPIRED",
        handle_missing_or_expired: "BROKER_HANDLE_NOT_FOUND",
        connector_mismatch: "BROKER_CONNECTOR_MISMATCH",
        operation_not_allowed: "BROKER_OPERATION_NOT_ALLOWED",
        approval_token_invalid: "BROKER_SESSION_APPROVAL_INVALID"
      };
      throw makeError(
        codeByReason[validation.reason] || "BROKER_SESSION_INVALID",
        `Delegated session invalid: ${validation.reason}`,
        validation
      );
    }

    const sessionRecord = validation.session_record;
    const resolved = resolveHandle(sessionRecord.handle_id);
    return {
      value: resolved.value,
      metadata: {
        ...resolved.metadata,
        connector: sessionRecord.connector,
        delegated_principal: sessionRecord.delegated_principal,
        allowed_operations: [...sessionRecord.allowed_operations],
        approval_scope: sessionRecord.approval_scope
      },
      session_record: sessionRecord
    };
  }

  function revokeDelegatedSession(sessionId) {
    const key = normalizeString(sessionId);
    if (!key) {
      return false;
    }
    return sessionsById.delete(key);
  }

  function listActiveDelegatedSessions() {
    purgeExpired();
    const active = [];
    for (const [sessionId, entry] of sessionsById.entries()) {
      const validation = validateDelegatedSession(sessionId);
      if (validation.valid) {
        active.push(sanitizeSessionRecord(sessionId, entry));
      }
    }
    return active.sort((left, right) => left.session_id.localeCompare(right.session_id));
  }

  return {
    issueHandle,
    issueGovernedHandle,
    resolveHandle,
    revokeHandle,
    issueDelegatedSession,
    validateDelegatedSession,
    resolveDelegatedSession,
    revokeDelegatedSession,
    listActiveDelegatedSessions,
    purgeExpired,
    getActiveHandleCount() {
      purgeExpired();
      return credentialsByHandle.size;
    }
  };
}

module.exports = {
  createCredentialBroker
};
