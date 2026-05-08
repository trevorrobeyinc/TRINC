"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const {
  canonicalize,
  canonicalJson,
  sha256,
  safeString
} = require("../../workflows/governance-automation/common.js");

const PHASE24_REQUEST_SNAPSHOT_SCHEMA = "phase24-operator-request-snapshot-v1";
const PHASE24_SANITIZED_PAYLOAD_SCHEMA = "phase24-operator-sanitized-payload-v1";
const PHASE24_BRIEFING_MANIFEST_SCHEMA = "phase24-operator-briefing-manifest-v1";

const PROVIDER_CONFIG = Object.freeze({
  newsletter: Object.freeze({
    prepareScope: "mutation.newsletter.prepare",
    heading: "Newsletter Operator Briefing",
    summaryLabel: "Beehiiv post preparation",
    toolSlug: "newsletter-publisher-mcp"
  }),
  notion: Object.freeze({
    prepareScope: "mutation.notion.prepare",
    heading: "Notion Operator Briefing",
    summaryLabel: "Notion page preparation",
    toolSlug: "notion-sync-mcp"
  })
});

function makeError(code, message, details) {
  const error = new Error(String(message || "Phase 24 operator briefing error"));
  error.code = String(code || "PHASE24_OPERATOR_BRIEFING_ERROR");
  if (typeof details !== "undefined") {
    error.details = details;
  }
  return error;
}

function normalizeProvider(value) {
  return safeString(value).toLowerCase();
}

function normalizeRole(value) {
  return safeString(value).toLowerCase();
}

function assertOperatorContext(context = {}) {
  if (normalizeRole(context.role) !== "operator") {
    throw makeError("MUTATION_ROLE_DENIED", "Mutation methods require operator role");
  }
}

function assertProviderSupported(provider) {
  if (!Object.prototype.hasOwnProperty.call(PROVIDER_CONFIG, provider)) {
    throw makeError("PHASE24_PROVIDER_UNSUPPORTED", `Unsupported Phase 24 provider '${provider}'`);
  }
}

function assertSequence(sequence) {
  const normalized = Number(sequence);
  if (!Number.isInteger(normalized) || normalized < 1) {
    throw makeError("PHASE24_SEQUENCE_INVALID", "Phase 24 sequence must be an integer >= 1");
  }
  return normalized;
}

function sanitizeOperatorInput(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  const clone = { ...input };
  delete clone.approvalToken;
  return canonicalize(clone);
}

function padSequence(sequence) {
  return String(assertSequence(sequence)).padStart(6, "0");
}

function parseRequestUrl(url) {
  try {
    return new URL(String(url || ""));
  } catch {
    throw makeError("PHASE24_REQUEST_URL_INVALID", "Phase 24 request URL must be a valid absolute URL", {
      url: safeString(url)
    });
  }
}

function buildRequestSnapshot(input = {}) {
  const provider = normalizeProvider(input.provider);
  assertProviderSupported(provider);
  const config = PROVIDER_CONFIG[provider];
  const sequence = assertSequence(input.sequence);
  const requestUrl = parseRequestUrl(input.url);

  return canonicalize({
    schema_version: PHASE24_REQUEST_SNAPSHOT_SCHEMA,
    provider,
    sequence,
    prepared_at: safeString(input.preparedAt),
    correlation_id: safeString(input.correlationId),
    tool_slug: config.toolSlug,
    request: {
      method: safeString(input.method || "POST").toUpperCase(),
      url: requestUrl.toString(),
      host: safeString(requestUrl.hostname).toLowerCase(),
      pathname: safeString(requestUrl.pathname)
    },
    approval_scopes: {
      prepare: config.prepareScope,
      commit: "mutation.commit",
      retry: "mutation.commit",
      reconcile: "mutation.reconcile"
    },
    research_interfaces: {
      "research.search": "disabled",
      "research.getPaper": "disabled"
    },
    lifecycle: ["prepare", "commit", "retry", "reconcile"],
    payload_hash: safeString(input.payloadHash),
    idempotency_key: safeString(input.idempotencyKey),
    operator_input: sanitizeOperatorInput(input.operatorInput)
  });
}

function buildSanitizedPayloadArtifact(input = {}) {
  const provider = normalizeProvider(input.provider);
  assertProviderSupported(provider);

  return canonicalize({
    schema_version: PHASE24_SANITIZED_PAYLOAD_SCHEMA,
    provider,
    sequence: assertSequence(input.sequence),
    payload_hash: safeString(input.payloadHash),
    sanitized_payload: canonicalize(input.sanitizedPayload && typeof input.sanitizedPayload === "object" ? input.sanitizedPayload : {})
  });
}

function buildBriefingMarkdown(input = {}) {
  const provider = normalizeProvider(input.provider);
  assertProviderSupported(provider);
  const config = PROVIDER_CONFIG[provider];
  const requestUrl = parseRequestUrl(input.url);
  const method = safeString(input.method || "POST").toUpperCase();
  const sequence = assertSequence(input.sequence);

  const lines = [
    `# ${config.heading}`,
    "",
    `Prepared sequence: ${sequence}`,
    `Prepared at: ${safeString(input.preparedAt)}`,
    `Provider: ${provider}`,
    `Summary: ${config.summaryLabel}`,
    `Endpoint: ${method} ${requestUrl.toString()}`,
    `Payload hash: ${safeString(input.payloadHash)}`,
    `Idempotency key: ${safeString(input.idempotencyKey)}`,
    "",
    "## Operator Lifecycle",
    "1. Review `request-snapshot.json` for the canonical operator request and scope bindings.",
    "2. Review `sanitized-payload.json` for the exact payload that will be published if commit is approved.",
    "3. Use `mutation.commitPublication` with `mutation.commit` scope to attempt the outbound write.",
    "4. Use `mutation.retryPublication` after uncertain outcomes or `mutation.reconcilePublication` to confirm/abandon manually verified outcomes.",
    "",
    "## Guardrails",
    "- `research.search` and `research.getPaper` remain disabled for newsletter and notion providers.",
    "- No browser automation, login automation, background sync, or autonomous publish loop is introduced.",
    "- No new outbound host or credential/session broker surface is introduced in Phase 24.",
    ""
  ];

  return `${lines.join("\n")}\n`;
}

function buildPreparedPublicationArtifacts(input = {}) {
  const requestSnapshot = buildRequestSnapshot(input);
  const sanitizedPayload = buildSanitizedPayloadArtifact(input);
  const markdown = buildBriefingMarkdown(input);

  const files = {
    "operator-briefing.md": markdown,
    "request-snapshot.json": canonicalJson(requestSnapshot),
    "sanitized-payload.json": canonicalJson(sanitizedPayload)
  };

  const manifestEntries = Object.entries(files)
    .map(([file, body]) => ({
      file,
      sha256: sha256(body)
    }))
    .sort((left, right) => left.file.localeCompare(right.file));

  files["hash-manifest.json"] = canonicalJson({
    schema_version: PHASE24_BRIEFING_MANIFEST_SCHEMA,
    provider: normalizeProvider(input.provider),
    sequence: assertSequence(input.sequence),
    prepared_at: safeString(input.preparedAt),
    files: manifestEntries
  });

  return Object.freeze({
    files: Object.freeze(files),
    manifestEntries
  });
}

function createPhase24OperatorBriefingWriter(options = {}) {
  const rootOutDir = path.resolve(options.outDir || path.join(process.cwd(), "audit", "evidence", "phase24"));

  async function writePreparedPublicationArtifacts(input = {}) {
    const provider = normalizeProvider(input.provider);
    const sequence = assertSequence(input.sequence);
    assertProviderSupported(provider);

    const outDir = path.resolve(
      input.outDir || path.join(rootOutDir, provider, `sequence-${padSequence(sequence)}`)
    );
    const built = buildPreparedPublicationArtifacts(input);

    await fs.mkdir(outDir, { recursive: true });
    for (const [fileName, body] of Object.entries(built.files)) {
      await fs.writeFile(path.join(outDir, fileName), body, "utf8");
    }

    return canonicalize({
      ok: true,
      provider,
      sequence,
      out_dir: outDir,
      files: Object.keys(built.files).sort()
    });
  }

  return Object.freeze({
    buildPreparedPublicationArtifacts,
    writePreparedPublicationArtifacts
  });
}

module.exports = {
  PHASE24_REQUEST_SNAPSHOT_SCHEMA,
  PHASE24_SANITIZED_PAYLOAD_SCHEMA,
  PHASE24_BRIEFING_MANIFEST_SCHEMA,
  PROVIDER_CONFIG,
  assertOperatorContext,
  buildPreparedPublicationArtifacts,
  createPhase24OperatorBriefingWriter,
  sanitizeOperatorInput
};
