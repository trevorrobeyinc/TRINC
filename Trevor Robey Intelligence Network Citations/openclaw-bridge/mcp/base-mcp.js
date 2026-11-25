"use strict";

const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const tls = require("node:tls");

const { z } = require("zod");

const { nowIso, nowMs } = require("../core/time-provider.js");
const { createPromptSanitizer } = require("../../security/prompt-sanitizer.js");
const { createApiGovernance } = require("../../security/api-governance.js");
const { createCircuitBreaker } = require("../supervisor/circuit-breaker.js");
const {
  validateEgressPolicy,
  preparePinnedEgressTarget,
  logOutboundAttempt
} = require("../execution/egress-policy.js");

const MCP_ERROR_CODES = Object.freeze({
  INPUT_SCHEMA_INVALID: "MCP_INPUT_SCHEMA_INVALID",
  OUTPUT_SCHEMA_INVALID: "MCP_OUTPUT_SCHEMA_INVALID",
  QUERY_TOO_LARGE: "MCP_QUERY_TOO_LARGE",
  OUTBOUND_POLICY_MISSING: "MCP_OUTBOUND_POLICY_MISSING",
  OUTBOUND_REQUEST_FAILED: "MCP_OUTBOUND_REQUEST_FAILED",
  OUTBOUND_TIMEOUT: "MCP_OUTBOUND_TIMEOUT",
  CIRCUIT_OPEN: "MCP_CIRCUIT_OPEN",
  HASH_MISMATCH: "MCP_HASH_MISMATCH",
  TLS_OVERRIDE_FORBIDDEN: "MCP_TLS_OVERRIDE_FORBIDDEN",
  NOT_IMPLEMENTED: "MCP_NOT_IMPLEMENTED"
});

const TLS_OVERRIDE_FIELDS = Object.freeze([
  "rejectUnauthorized",
  "ca",
  "cert",
  "key",
  "agent",
  "checkServerIdentity",
  "servername",
  "insecureSkipTlsVerify",
  "tlsOptions",
  "tls"
]);

const CanonicalResearchRecordSchema = z
  .object({
    source: z.string().min(1).max(64),
    paper_id: z.string().min(1).max(256),
    title: z.string().min(1).max(2000),
    abstract: z.string().max(20000),
    authors: z.array(z.string().min(1).max(256)).max(200),
    citation_velocity: z.number().int().min(0).max(10_000_000),
    published_at: z.string().min(1).max(64),
    retrieved_at: z.string().min(1).max(64),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    sequence: z.number().int().min(1)
  })
  .strict();

const CanonicalResearchRecordWithoutHashSchema = CanonicalResearchRecordSchema.omit({ hash: true, sequence: true });

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value, maxLen) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (typeof maxLen === "number" && maxLen > 0 && text.length > maxLen) {
    return text.slice(0, maxLen);
  }
  return text;
}

function normalizeAuthors(authors) {
  if (!Array.isArray(authors)) {
    return [];
  }
  return authors
    .map((item) => {
      if (typeof item === "string") {
        return normalizeText(item, 256);
      }
      if (isPlainObject(item) && typeof item.name === "string") {
        return normalizeText(item.name, 256);
      }
      return "";
    })
    .filter(Boolean)
    .slice(0, 200);
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = canonicalize(value[key]);
  }
  return out;
}

function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value));
}

function createMcpError(code, message, details) {
  const error = new Error(String(message || "MCP error"));
  error.code = String(code || "MCP_ERROR");
  if (typeof details !== "undefined") {
    error.details = details;
  }
  return error;
}

function computeResearchRecordHash(recordWithoutHash) {
  const parsed = CanonicalResearchRecordWithoutHashSchema.parse(recordWithoutHash);
  const canonicalPayload = canonicalStringify(parsed);
  const seed = `research-record-v1|${parsed.source}|${canonicalPayload}`;
  return crypto.createHash("sha256").update(seed).digest("hex");
}

function verifyResearchRecordHash(record) {
  const parsed = CanonicalResearchRecordSchema.parse(record);
  const expected = computeResearchRecordHash({
    source: parsed.source,
    paper_id: parsed.paper_id,
    title: parsed.title,
    abstract: parsed.abstract,
    authors: parsed.authors,
    citation_velocity: parsed.citation_velocity,
    published_at: parsed.published_at,
    retrieved_at: parsed.retrieved_at
  });
  if (expected !== parsed.hash) {
    const error = createMcpError(MCP_ERROR_CODES.HASH_MISMATCH, "Research record hash mismatch", {
      expected,
      actual: parsed.hash,
      paper_id: parsed.paper_id
    });
    throw error;
  }
  return true;
}

function parseDateOrFallback(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "1970-01-01T00:00:00.000Z";
  }
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) {
    return "1970-01-01T00:00:00.000Z";
  }
  return text;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function createNoopLogger() {
  return {
    info() {},
    warn() {},
    error() {}
  };
}

function assertNoTlsOverrides(target, code) {
  if (!isPlainObject(target)) {
    return;
  }
  for (const key of TLS_OVERRIDE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(target, key)) {
      throw createMcpError(code, `TLS option override is forbidden: '${key}'`);
    }
  }
}

class BaseMcp {
  constructor(options = {}) {
    this.mcpSlug = typeof options.mcpSlug === "string" ? options.mcpSlug.trim().toLowerCase() : "";
    this.source = typeof options.source === "string" ? options.source.trim().toLowerCase() : this.mcpSlug;
    this.inputSchema = options.inputSchema;
    this.maxInputChars = parsePositiveInt(options.maxInputChars, 512);
    this.retryMax = Math.min(2, parsePositiveInt(options.retryMax, 2));
    this.timeoutMs = Math.min(12_000, parsePositiveInt(options.timeoutMs, 8_000));
    this.maxAbstractChars = parsePositiveInt(options.maxAbstractChars, 20_000);
    this.logger = options.logger && typeof options.logger === "object" ? options.logger : createNoopLogger();
    this.promptSanitizer = options.promptSanitizer || createPromptSanitizer({ logger: this.logger, maxChars: this.maxInputChars });
    this.apiGovernance = options.apiGovernance || createApiGovernance({ logger: this.logger });
    this.egressPolicies = options.egressPolicies;
    this.resolver = options.resolver;
    this.timeProvider = options.timeProvider && typeof options.timeProvider === "object" ? options.timeProvider : { nowIso, nowMs };
    this.circuitBreaker = options.circuitBreaker || createCircuitBreaker({
      enabled: true,
      failureThreshold: 2,
      successThreshold: 1,
      timeout: 60_000
    });
    this.httpGet = typeof options.httpGet === "function" ? options.httpGet : this.#httpsGet.bind(this);

    if (!this.mcpSlug) {
      throw createMcpError("MCP_CONFIG_INVALID", "mcpSlug is required");
    }
    if (!this.inputSchema || typeof this.inputSchema.safeParse !== "function") {
      throw createMcpError("MCP_CONFIG_INVALID", "inputSchema (zod) is required");
    }
  }

  async run(input, context = {}) {
    const correlationId = typeof context.correlationId === "string" ? context.correlationId : "";

    const parsedInput = this.inputSchema.safeParse(input);
    if (!parsedInput.success) {
      throw createMcpError(MCP_ERROR_CODES.INPUT_SCHEMA_INVALID, "MCP input schema validation failed", {
        issues: parsedInput.error.issues
      });
    }

    const inputSize = Buffer.byteLength(canonicalStringify(parsedInput.data));
    if (inputSize > this.maxInputChars) {
      throw createMcpError(MCP_ERROR_CODES.QUERY_TOO_LARGE, `Input exceeds max size (${this.maxInputChars})`, {
        inputSize,
        maxInputChars: this.maxInputChars
      });
    }

    const sanitizedInput = await this.#sanitizeInput(parsedInput.data, { correlationId });
    const rawRecords = await this.#executeWithRetry(sanitizedInput, { ...context, correlationId });

    if (!Array.isArray(rawRecords)) {
      throw createMcpError(MCP_ERROR_CODES.OUTPUT_SCHEMA_INVALID, "MCP execution must return an array");
    }

    const normalizedWithoutSequence = rawRecords.map((record) => this.normalizeRecord(record, { ...context, correlationId }));
    const finalRecords = await this.apiGovernance.withGovernanceTransaction(async (tx) => {
      tx.applyUsage({
        mcp: this.mcpSlug,
        tokens: this.estimateTokens(sanitizedInput),
        correlationId
      });

      const committed = [];
      for (const normalized of normalizedWithoutSequence) {
        const sequence = tx.allocateSequence();
        const withSequence = {
          ...normalized,
          sequence
        };
        const parsedRecord = CanonicalResearchRecordSchema.parse(withSequence);
        verifyResearchRecordHash(parsedRecord);
        tx.appendResearchRecord(parsedRecord);
        committed.push(parsedRecord);
      }
      return committed;
    }, { correlationId });

    return {
      ok: true,
      records: finalRecords
    };
  }

  estimateTokens(input) {
    const source = canonicalStringify(input);
    return Math.max(1, Math.ceil(Buffer.byteLength(source) / 4));
  }

  async #sanitizeInput(parsedInput, context) {
    const out = { ...parsedInput };
    if (typeof out.query === "string") {
      const sanitized = this.promptSanitizer.sanitizeQuery(out.query, context);
      out.query = sanitized.query;
    }
    if (typeof out.paper_id === "string") {
      out.paper_id = normalizeText(out.paper_id, 256);
    }
    return out;
  }

  async #executeWithRetry(parsedInput, context) {
    const gate = this.circuitBreaker.checkBeforeRequest(this.mcpSlug);
    if (!gate.allowed) {
      throw createMcpError(MCP_ERROR_CODES.CIRCUIT_OPEN, "MCP circuit breaker is open", {
        mcp: this.mcpSlug
      });
    }

    let attempt = 0;
    let lastError = null;
    while (attempt <= this.retryMax) {
      attempt += 1;
      try {
        const records = await this.execute(parsedInput, context);
        this.circuitBreaker.recordSuccess(this.mcpSlug);
        return records;
      } catch (error) {
        lastError = error;
        this.circuitBreaker.recordFailure(this.mcpSlug);
        if (attempt > this.retryMax) {
          break;
        }
      }
    }

    throw createMcpError(
      MCP_ERROR_CODES.OUTBOUND_REQUEST_FAILED,
      lastError && lastError.message ? lastError.message : "MCP execution failed",
      {
        attemptCount: attempt,
        code: lastError && lastError.code ? lastError.code : "UNKNOWN"
      }
    );
  }

  async policyValidatedGet(url, context = {}) {
    assertNoTlsOverrides(context, MCP_ERROR_CODES.TLS_OVERRIDE_FORBIDDEN);

    const policyCheck = validateEgressPolicy(this.mcpSlug, this.egressPolicies, { allowDefault: false });
    if (!policyCheck.valid) {
      throw createMcpError(MCP_ERROR_CODES.OUTBOUND_POLICY_MISSING, policyCheck.errors.join("; "));
    }

    const started = this.timeProvider.nowMs();
    const correlationId = typeof context.correlationId === "string" ? context.correlationId : "";
    let domain = "";

    try {
      const pinned = await preparePinnedEgressTarget(url, policyCheck.policy, {
        resolver: this.resolver
      });
      domain = pinned.hostname;
      const result = await this.httpGet(pinned, {
        timeoutMs: this.timeoutMs,
        maxBodyBytes: parsePositiveInt(context.maxBodyBytes, 1024 * 1024)
      });
      logOutboundAttempt(this.logger, {
        domain,
        status: "success",
        latencyMs: this.timeProvider.nowMs() - started,
        correlationId,
        code: "OK"
      });
      return result;
    } catch (error) {
      logOutboundAttempt(this.logger, {
        domain,
        status: "blocked",
        latencyMs: this.timeProvider.nowMs() - started,
        correlationId,
        code: error && error.code ? error.code : "EGRESS_ERROR"
      });
      throw error;
    }
  }

  async policyValidatedGetJson(url, context = {}) {
    const response = await this.policyValidatedGet(url, context);
    try {
      return JSON.parse(response.body);
    } catch {
      throw createMcpError(MCP_ERROR_CODES.OUTBOUND_REQUEST_FAILED, "Expected JSON response body");
    }
  }

  async policyValidatedGetText(url, context = {}) {
    const response = await this.policyValidatedGet(url, context);
    return String(response.body || "");
  }

  async #httpsGet(pinnedTarget, options = {}) {
    assertNoTlsOverrides(options, MCP_ERROR_CODES.TLS_OVERRIDE_FORBIDDEN);

    const timeoutMs = parsePositiveInt(options.timeoutMs, 8000);
    const maxBodyBytes = parsePositiveInt(options.maxBodyBytes, 1024 * 1024);

    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          protocol: "https:",
          hostname: pinnedTarget.hostname,
          port: pinnedTarget.url.port ? Number(pinnedTarget.url.port) : 443,
          method: "GET",
          path: `${pinnedTarget.url.pathname}${pinnedTarget.url.search}`,
          lookup: pinnedTarget.lookup,
          servername: pinnedTarget.hostname,
          rejectUnauthorized: true,
          checkServerIdentity(_serverName, cert) {
            return tls.checkServerIdentity(pinnedTarget.hostname, cert);
          },
          agent: false,
          headers: {
            Accept: "application/json, text/plain, application/atom+xml"
          }
        },
        (res) => {
          const chunks = [];
          let seen = 0;

          res.on("data", (chunk) => {
            const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            seen += part.length;
            if (seen > maxBodyBytes) {
              req.destroy(createMcpError(MCP_ERROR_CODES.OUTBOUND_REQUEST_FAILED, "Outbound response too large", {
                maxBodyBytes
              }));
              return;
            }
            chunks.push(part);
          });

          res.on("end", () => {
            const statusCode = Number(res.statusCode || 0);
            const body = Buffer.concat(chunks).toString("utf8");
            if (statusCode < 200 || statusCode >= 300) {
              reject(
                createMcpError(MCP_ERROR_CODES.OUTBOUND_REQUEST_FAILED, `Outbound request failed with status ${statusCode}`, {
                  statusCode,
                  bodyPreview: body.slice(0, 200)
                })
              );
              return;
            }
            resolve({
              statusCode,
              headers: res.headers,
              body
            });
          });
        }
      );

      req.setTimeout(timeoutMs, () => {
        req.destroy(createMcpError(MCP_ERROR_CODES.OUTBOUND_TIMEOUT, `Outbound request timed out (${timeoutMs}ms)`));
      });

      req.on("error", (error) => {
        reject(error);
      });

      req.end();
    });
  }

  // eslint-disable-next-line class-methods-use-this
  execute() {
    throw createMcpError(MCP_ERROR_CODES.NOT_IMPLEMENTED, "execute() must be implemented by subclass");
  }

  normalizeRecord(rawRecord) {
    const source = this.source;
    const paperId = normalizeText(rawRecord && rawRecord.paper_id, 256) || normalizeText(rawRecord && rawRecord.paperId, 256);
    const title = normalizeText(rawRecord && rawRecord.title, 2000);
    const abstractStripped = stripHtml(rawRecord && rawRecord.abstract);
    if (abstractStripped.length > this.maxAbstractChars) {
      throw createMcpError(MCP_ERROR_CODES.OUTPUT_SCHEMA_INVALID, `abstract exceeds max length (${this.maxAbstractChars})`, {
        paper_id: paperId,
        length: abstractStripped.length
      });
    }
    const abstract = abstractStripped;
    const authors = normalizeAuthors(rawRecord && rawRecord.authors);
    const citationVelocity = Number.isFinite(Number(rawRecord && rawRecord.citation_velocity))
      ? Math.max(0, Math.floor(Number(rawRecord.citation_velocity)))
      : 0;
    const publishedAt = parseDateOrFallback(rawRecord && rawRecord.published_at);
    const retrievedAt = this.timeProvider.nowIso();

    const payloadWithoutHash = {
      source,
      paper_id: paperId,
      title,
      abstract,
      authors,
      citation_velocity: citationVelocity,
      published_at: publishedAt,
      retrieved_at: retrievedAt
    };

    const hash = computeResearchRecordHash(payloadWithoutHash);
    return {
      ...payloadWithoutHash,
      hash
    };
  }

  static verifyRecordHash(record) {
    return verifyResearchRecordHash(record);
  }

  static computeRecordHash(recordWithoutHash) {
    return computeResearchRecordHash(recordWithoutHash);
  }

  static canonicalStringify(value) {
    return canonicalStringify(value);
  }
}

// ── Local IPC to the canonical vault bridge (bridges-uds, 2026-11-24) ──────────────────────────
//
// LOCAL IPC ONLY, OUTSIDE THE EGRESS POLICY. Everything above is the governed egress wrapper:
// policyValidatedGet runs validateEgressPolicy, preparePinnedEgressTarget and logOutboundAttempt,
// and run() commits through the governance transaction. bridgeSocketRequest below does none of that,
// on purpose: it is one HTTP/1.1 request over a Unix domain socket to the vault bridge that the
// obsidian-bridge-launcher plugin runs, at <home>/.local/state/trinc/run/vault-bridge.sock (run
// directory 0700, socket 0600). There is no host, port, DNS or TLS, and nothing leaves the machine,
// so there is no egress to police. It sits in this file because scripts/verify-mcp-policy.sh lets
// only base-mcp.js hold a direct network call under openclaw-bridge/mcp; keeping it here keeps that
// gate whole instead of carving an exception into an adapter. A non-egress transport inside the
// egress wrapper is an operator-approval item in the bridges-uds decision record
// (ops/security/bridges-uds-2026-11-24.md).
//
// The block derives the path from os.homedir() at call time (never from config, a socket-path
// variable or the caller), checks the whole directory chain and the socket before any byte is
// written, and pins the connection to the socket, so no option a caller passes can turn the request
// into TCP. The caller builds the headers: the adapter's replay timestamp and nonce still come from
// core/time-provider and core/entropy-provider.
//
// Never edit the block below in this file alone: its first lines say why.

// BEGIN bridges-uds client v1
// Byte-identical in four files; ops/tr-suite/verify.sh compares the text between the BEGIN and END lines:
//   Copilot-Everything/bridges/openclaw-stdio-proxy/index.mjs
//   Copilot-Everything/bridges/obsidian-stdio-adapter/index.mjs
//   Trevor Robey Intelligence Network Citations/openclaw-bridge/mcp/base-mcp.js
//   Copilot-Everything/scripts/mcp-health-check.js
// Same rules as assertSocketTrust/requestOverSocket in the bridges' uds-listener.ts. The socket must be exactly
// <home>/.local/state/trinc/run/<expectedName>. Every level from home down is a real directory owned by this uid that
// group and others cannot write, the run directory and the socket grant them nothing, and no level carries an ACL
// allow entry (an ls that fails is a refusal too). A missing home, directory or socket is refused with code ENOENT,
// without connecting. Requests are pinned to the socket with createConnection and never use an agent: Node turns an
// empty socketPath into TCP to localhost:80, and agent:false ignores a createConnection pin. Node calls the pin with
// the request's options, timeout included, but the pin connects to the checked path on its own, so it passes the
// timeout on itself (a pin that dropped it left the timeout option unarmed; with no timeout set, the connect options
// are exactly { path }); the 'timeout' event only reports, and the caller destroys. No globals besides JavaScript
// built-ins: every Node module comes in through deps = { fs, path, os, http, net, childProcess, Buffer }.
const BRIDGES_UDS_MAX_PATH_BYTES = 103;
const BRIDGES_UDS_HIDDEN_NAME_EXTRA_BYTES = 22;
const BRIDGES_UDS_ACL_SEEN = new Set();

function bridgesUdsError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function bridgesUdsRunDir(deps) {
  return deps.path.join(deps.os.homedir(), ".local", "state", "trinc", "run");
}

function bridgesUdsSocketPath(deps, name) {
  return deps.path.join(bridgesUdsRunDir(deps), name);
}

function bridgesUdsAssertNoAllowAcl(deps, p, key) {
  if (deps.os.platform() !== "darwin" || BRIDGES_UDS_ACL_SEEN.has(key)) return;
  let out;
  try {
    out = deps.childProcess.execFileSync("/bin/ls", ["-lde", p], { encoding: "utf8", timeout: 2000 });
  } catch (err) {
    const why = err && err.code ? err.code : `ls exit ${String(err && err.status)}`;
    throw bridgesUdsError("SOCKET_UNTRUSTED", `could not read the ACL of ${p} (${why}); refusing`);
  }
  if (out.split("\n").slice(1).some((line) => / allow /.test(line))) {
    throw bridgesUdsError("SOCKET_UNTRUSTED", `${p} carries an ACL entry that grants access`);
  }
  BRIDGES_UDS_ACL_SEEN.add(key);
}

function bridgesUdsAssertTrust(deps, socketPath, expectedName) {
  const { fs, path, os } = deps;
  const uid = os.userInfo().uid;
  const home = os.homedir();
  const dir = bridgesUdsRunDir(deps);
  if (typeof socketPath !== "string" || socketPath === "" || !path.isAbsolute(socketPath) || path.resolve(socketPath) !== socketPath) {
    throw bridgesUdsError("SOCKET_UNTRUSTED", `socket path must be absolute and normalized: ${String(socketPath)}`);
  }
  if (path.dirname(socketPath) !== dir || path.basename(socketPath) !== expectedName) {
    throw bridgesUdsError("SOCKET_UNTRUSTED", `socket must be ${path.join(dir, String(expectedName))}: ${socketPath}`);
  }
  const hiddenBytes = deps.Buffer.byteLength(dir) + 1 + deps.Buffer.byteLength(expectedName) + BRIDGES_UDS_HIDDEN_NAME_EXTRA_BYTES;
  if (Math.max(deps.Buffer.byteLength(socketPath), hiddenBytes) > BRIDGES_UDS_MAX_PATH_BYTES) {
    throw bridgesUdsError("SOCKET_PATH_TOO_LONG", `socket path is too long for macOS: ${socketPath}`);
  }
  const levels = [home];
  for (const part of [".local", "state", "trinc", "run"]) levels.push(path.join(levels[levels.length - 1], part));
  for (let i = 0; i < levels.length; i++) {
    const p = levels[i];
    let st;
    try {
      st = fs.lstatSync(p);
    } catch (err) {
      if (err && err.code === "ENOENT") throw bridgesUdsError("ENOENT", `${p} does not exist (bridge not running)`);
      throw err;
    }
    if (st.isSymbolicLink() || !st.isDirectory() || st.uid !== uid) {
      throw bridgesUdsError("SOCKET_UNTRUSTED", `${p} is not a real directory owned by uid ${uid}`);
    }
    const forbidden = i === levels.length - 1 ? 0o077 : 0o022;
    if ((st.mode & forbidden) !== 0) {
      throw bridgesUdsError("SOCKET_UNTRUSTED", `${p} has mode ${(st.mode & 0o7777).toString(8)}`);
    }
    bridgesUdsAssertNoAllowAcl(deps, p, `${st.dev}:${st.ino}`);
  }
  let sock;
  try {
    sock = fs.lstatSync(socketPath);
  } catch (err) {
    if (err && err.code === "ENOENT") throw bridgesUdsError("ENOENT", `${socketPath} does not exist (bridge not running)`);
    throw err;
  }
  if (!sock.isSocket() || sock.uid !== uid || (sock.mode & 0o077) !== 0) {
    throw bridgesUdsError("SOCKET_UNTRUSTED", `${socketPath} is not a private socket owned by uid ${uid}`);
  }
  bridgesUdsAssertNoAllowAcl(deps, socketPath, `${sock.dev}:${sock.ino}`);
}

function bridgesUdsRequest(deps, socketPath, expectedName, options) {
  bridgesUdsAssertTrust(deps, socketPath, expectedName);
  const opts = Object.assign({}, options);
  delete opts.agent;
  delete opts.host;
  delete opts.hostname;
  delete opts.port;
  delete opts.createConnection;
  delete opts.socketPath;
  const timeout = opts.timeout;
  const connectOptions = () => (timeout === undefined ? { path: socketPath } : { path: socketPath, timeout });
  return deps.http.request(Object.assign(opts, { socketPath, createConnection: () => deps.net.connect(connectOptions()) }));
}
// END bridges-uds client v1

// Node built-ins handed to the block; nothing else reaches the socket.
const BRIDGES_UDS_DEPS = Object.freeze({ fs, path, os, http, net, childProcess, Buffer });

// The one socket the engine may reach. Command Center and Viz Studio are not engine dependencies,
// so this module has no way to address their sockets.
const VAULT_BRIDGE_SOCKET_NAME = "vault-bridge.sock";

/** Absolute path of the vault bridge's socket, derived from os.homedir() at call time. */
function bridgeSocketPath() {
  return bridgesUdsSocketPath(BRIDGES_UDS_DEPS, VAULT_BRIDGE_SOCKET_NAME);
}

/**
 * Open one request to the vault bridge over its Unix socket and return the http.ClientRequest; the
 * caller writes the body and reads the response. Throws before any connection is attempted when the
 * socket or its directory is missing (err.code "ENOENT") or fails the trust check
 * ("SOCKET_UNTRUSTED", "SOCKET_PATH_TOO_LONG"). Any agent, host, hostname, port, socketPath or
 * createConnection in `options` is dropped.
 */
function bridgeSocketRequest(options) {
  return bridgesUdsRequest(BRIDGES_UDS_DEPS, bridgeSocketPath(), VAULT_BRIDGE_SOCKET_NAME, options);
}

module.exports = {
  BaseMcp,
  MCP_ERROR_CODES,
  CanonicalResearchRecordSchema,
  CanonicalResearchRecordWithoutHashSchema,
  normalizeAuthors,
  normalizeText,
  stripHtml,
  verifyResearchRecordHash,
  computeResearchRecordHash,
  // Local IPC to the vault bridge (see the bridges-uds section above); not an egress path.
  VAULT_BRIDGE_SOCKET_NAME,
  bridgeSocketPath,
  bridgeSocketRequest
};
