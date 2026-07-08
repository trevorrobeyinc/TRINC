"use strict";

const { z } = require("zod");
const crypto = require("node:crypto");
const timeProviderModule = require("../core/time-provider.js");
const { extractCitations, deduplicateCitations, countByType, roleLabel } = require("../core/citation-extractor.js");

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const SubmitWorkflowSchema = z.object({
  template_id: z.string().min(1).max(128).regex(/^[a-z0-9][a-z0-9_-]*$/),
  inputs: z.record(z.string(), z.unknown()).default({}),
  webhook_url: z.string().url().max(2048).optional(),
  output_format: z.enum(["zip", "jsonl"]).default("zip")
});

const PaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0)
});

const ALLOWED_PRINCIPALS = Object.freeze(["api_client", "operator"]);

// ---------------------------------------------------------------------------
// Rate limiter — sliding window per api_key
// ---------------------------------------------------------------------------

function createRateLimiter(config) {
  const windowMs = (config && config.windowMs) || 60000;
  const maxRequests = (config && config.maxRequests) || 10;
  const buckets = new Map(); // api_key -> [timestamps]

  function allow(apiKey) {
    const now = timeProviderModule.nowMs();
    const cutoff = now - windowMs;

    let timestamps = buckets.get(apiKey);
    if (!timestamps) {
      timestamps = [];
      buckets.set(apiKey, timestamps);
    }

    // Prune expired entries
    while (timestamps.length > 0 && timestamps[0] <= cutoff) {
      timestamps.shift();
    }

    if (timestamps.length >= maxRequests) {
      return false;
    }

    timestamps.push(now);
    return true;
  }

  return { allow };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(status, body) {
  return { status, body: Object.assign({ ok: status >= 200 && status < 300 }, body) };
}

function errorResponse(status, code, message) {
  return jsonResponse(status, { ok: false, error: { code, message } });
}

function generateRequestId() {
  return crypto.randomBytes(8).toString("hex");
}

// ---------------------------------------------------------------------------
// Route patterns
// ---------------------------------------------------------------------------

const ROUTE_BASE = "/api/v1/research";

const ROUTE_PATTERNS = [
  { name: "submit",   method: "POST", pattern: /^\/api\/v1\/research\/?$/ },
  { name: "list",     method: "GET",  pattern: /^\/api\/v1\/research\/?$/ },
  { name: "status",   method: "GET",  pattern: /^\/api\/v1\/research\/([^/]+)\/?$/ },
  { name: "results",  method: "GET",  pattern: /^\/api\/v1\/research\/([^/]+)\/results\/?$/ },
  { name: "download", method: "GET",  pattern: /^\/api\/v1\/research\/([^/]+)\/download\/?$/ }
];

function matchRoute(method, pathname) {
  const upperMethod = String(method).toUpperCase();
  const normalizedPath = String(pathname || "").replace(/\?.*$/, "");

  for (const route of ROUTE_PATTERNS) {
    if (route.method !== upperMethod) continue;
    const m = normalizedPath.match(route.pattern);
    if (m) {
      return { name: route.name, params: m.slice(1) };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// API factory
// ---------------------------------------------------------------------------

function createResearchApi(options) {
  const workflowEngine = options && options.workflowEngine ? options.workflowEngine : null;
  const templateLoader = options && typeof options.templateLoader === "function" ? options.templateLoader : null;
  const logger = (options && options.logger && typeof options.logger === "object")
    ? options.logger
    : { info() {}, warn() {}, error() {} };
  const timeProvider = (options && options.timeProvider) || timeProviderModule;
  const rateLimiter = createRateLimiter(options && options.rateLimitConfig);

  // In-memory workflow registry (submitted via this API)
  const workflows = new Map();

  // -------------------------------------------------------------------
  // Auth check
  // -------------------------------------------------------------------

  function checkAuth(authContext) {
    if (!authContext || !authContext.principal) {
      return errorResponse(401, "AUTH_REQUIRED", "Authentication required");
    }
    if (!ALLOWED_PRINCIPALS.includes(authContext.principal)) {
      return errorResponse(403, "FORBIDDEN", `Principal "${authContext.principal}" is not allowed`);
    }
    return null;
  }

  // -------------------------------------------------------------------
  // POST /api/v1/research — submit workflow
  // -------------------------------------------------------------------

  function handleSubmit(body, authContext) {
    const parsed = SubmitWorkflowSchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
      return errorResponse(400, "VALIDATION_ERROR", issues);
    }

    const { template_id, inputs, webhook_url, output_format } = parsed.data;
    const requestId = generateRequestId();
    const now = timeProvider.nowIso();

    if (!workflowEngine || typeof workflowEngine.executeWorkflow !== "function") {
      return errorResponse(503, "ENGINE_NOT_READY", "Workflow engine is not initialized");
    }

    let workflowDef;
    if (templateLoader) {
      try {
        workflowDef = templateLoader(template_id);
      } catch (loadErr) {
        return errorResponse(404, "TEMPLATE_NOT_FOUND", String(loadErr && loadErr.message ? loadErr.message : loadErr));
      }
    } else {
      return errorResponse(503, "TEMPLATE_LOADER_MISSING", "No template loader configured");
    }

    const idSeed = `workflow-${template_id}-${now}-${requestId}`;
    const workflowId = `workflow-${crypto.createHash("sha256").update(idSeed).digest("hex").slice(0, 24)}`;

    const record = {
      workflow_id: workflowId,
      template_id,
      inputs,
      status: "running",
      submitted_at: now,
      completed_at: null,
      error: null,
      export_path: null,
      export_format: output_format,
      webhook_url: webhook_url || null,
      artifacts: []
    };
    workflows.set(workflowId, record);

    workflowEngine.executeWorkflow(workflowDef, { inputs, operatorId: "api-client" })
      .then(res => {
        record.status = (res && res.status) || "completed";
        record.completed_at = timeProvider.nowIso();
        record.workflow_id = (res && res.workflow_id) || workflowId;
        if (res && res.artifacts) {
          if (res.artifacts.export_path) {
            record.export_path = res.artifacts.export_path;
          }
          if (Array.isArray(res.artifacts.subtask_results)) {
            record.artifacts = res.artifacts.subtask_results;
          }
        }
        fireWebhook(record.webhook_url, record);
      }).catch(err => {
        record.status = "failed";
        record.completed_at = timeProvider.nowIso();
        record.error = String(err && err.message ? err.message : err);
        logger.error({ event: "phase31_workflow_api_failed", workflow_id: workflowId, error: record.error });
      });

    logger.info(`Workflow submitted: ${workflowId} (template=${template_id})`);
    return jsonResponse(201, { workflow_id: workflowId, status: "running" });
  }

  // -------------------------------------------------------------------
  // GET /api/v1/research — list workflows
  // -------------------------------------------------------------------

  function handleList(body) {
    const parsed = PaginationSchema.safeParse(body || {});
    const { limit, offset } = parsed.success ? parsed.data : { limit: 20, offset: 0 };

    const all = Array.from(workflows.values());
    all.sort((a, b) => (b.submitted_at || "").localeCompare(a.submitted_at || ""));

    const total = all.length;
    const page = all.slice(offset, offset + limit);

    return jsonResponse(200, { workflows: page, total, limit, offset });
  }

  // -------------------------------------------------------------------
  // GET /api/v1/research/:id — workflow status
  // -------------------------------------------------------------------

  function handleStatus(workflowId) {
    // Check local map first
    let record = workflows.get(workflowId);

    // Fall back to workflowEngine status if available
    if (!record && typeof workflowEngine.getWorkflowStatus === "function") {
      const engineStatus = workflowEngine.getWorkflowStatus(workflowId);
      if (engineStatus) {
        record = engineStatus;
      }
    }

    if (!record) {
      return errorResponse(404, "NOT_FOUND", `Workflow "${workflowId}" not found`);
    }

    return jsonResponse(200, { workflow: record });
  }

  // -------------------------------------------------------------------
  // GET /api/v1/research/:id/download — export path
  // -------------------------------------------------------------------

  function handleDownload(workflowId) {
    const record = workflows.get(workflowId);
    if (!record) {
      return errorResponse(404, "NOT_FOUND", `Workflow "${workflowId}" not found`);
    }
    if (record.status !== "completed" && record.status !== "delivered") {
      return errorResponse(409, "NOT_READY", `Workflow "${workflowId}" is not yet complete (status: ${record.status})`);
    }
    if (!record.export_path) {
      return errorResponse(404, "NO_EXPORT", `Workflow "${workflowId}" has no export artifact`);
    }

    return jsonResponse(200, {
      export_path: record.export_path,
      format: record.export_format || "json"
    });
  }

  // -------------------------------------------------------------------
  // GET /api/v1/research/:id/results — structured JSON results
  // -------------------------------------------------------------------

  function buildStructuredResults(record) {
    const artifacts = Array.isArray(record.artifacts) ? record.artifacts : [];
    const findings = [];
    const allText = [];

    for (let i = 0; i < artifacts.length; i++) {
      const artifact = artifacts[i];
      const content = artifact.output_full || artifact.output_excerpt || "";
      allText.push(content);
      const citations = deduplicateCitations(extractCitations(content));
      findings.push({
        section_id: `section-${i + 1}`,
        role: roleLabel(artifact.task_id),
        task_id: artifact.task_id || null,
        content,
        citations
      });
    }

    const combinedText = allText.join("\n");
    const allCitations = deduplicateCitations(extractCitations(combinedText));
    const byType = countByType(allCitations);

    return {
      workflow_id: record.workflow_id || null,
      template_id: record.template_id || null,
      status: record.status || null,
      completed_at: record.completed_at || null,
      findings,
      citations_summary: {
        total: allCitations.length,
        by_type: byType,
        unique_identifiers: allCitations.map((c) => `${c.type}:${c.id}`)
      },
      confidence: {
        overall_score: combinedText.length > 0
          ? Math.min(1, allCitations.length / Math.max(1, combinedText.length / 1000) * 0.1)
          : 0,
        citation_density: combinedText.length > 0
          ? allCitations.length / Math.max(1, combinedText.length / 1000)
          : 0,
        pass: allCitations.length >= 5
      }
    };
  }

  function handleResults(workflowId) {
    let record = workflows.get(workflowId);

    if (!record && typeof workflowEngine.getWorkflowStatus === "function") {
      const engineStatus = workflowEngine.getWorkflowStatus(workflowId);
      if (engineStatus) {
        record = engineStatus;
      }
    }

    if (!record) {
      return errorResponse(404, "NOT_FOUND", `Workflow "${workflowId}" not found`);
    }
    if (record.status !== "completed" && record.status !== "delivered") {
      return errorResponse(409, "NOT_READY", `Workflow "${workflowId}" is not yet complete (status: ${record.status})`);
    }

    return jsonResponse(200, { results: buildStructuredResults(record) });
  }

  // -------------------------------------------------------------------
  // JSONL export
  // -------------------------------------------------------------------

  function buildJsonlExport(record) {
    const structured = buildStructuredResults(record);
    const lines = [];

    lines.push(JSON.stringify({
      record_type: "metadata",
      workflow_id: structured.workflow_id,
      template_id: structured.template_id,
      completed_at: structured.completed_at,
      citations_summary: structured.citations_summary,
      confidence: structured.confidence
    }));

    for (const finding of structured.findings) {
      lines.push(JSON.stringify({
        record_type: "finding",
        section_id: finding.section_id,
        role: finding.role,
        task_id: finding.task_id,
        content: finding.content,
        citations: finding.citations
      }));
    }

    lines.push(JSON.stringify({
      record_type: "summary",
      total_findings: structured.findings.length,
      total_citations: structured.citations_summary.total,
      confidence_pass: structured.confidence.pass
    }));

    return lines.join("\n") + "\n";
  }

  // -------------------------------------------------------------------
  // Webhook callback (fire-and-forget)
  // -------------------------------------------------------------------

  // Security (audit F-N1): SSRF guard for the caller-supplied webhook target.
  // https-only; reject loopback/private/link-local/metadata + literal IPv6.
  function isWebhookTargetAllowed(u) {
    if (u.protocol !== "https:") return false;
    const host = String(u.hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
    if (!host) return false;
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return false;
    const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (m) {
      const o = m.slice(1).map(Number);
      if (o.some((x) => x > 255)) return false;
      const a = o[0], b = o[1];
      if (a === 127 || a === 10 || a === 0) return false;
      if (a === 169 && b === 254) return false;
      if (a === 192 && b === 168) return false;
      if (a === 172 && b >= 16 && b <= 31) return false;
      if (a >= 224) return false;
      return true;
    }
    if (host.includes(":")) return false;
    return true;
  }

  function fireWebhook(webhookUrl, record) {
    if (!webhookUrl) return;
    let parsedHook;
    try {
      parsedHook = new URL(webhookUrl);
    } catch {
      logger.error({ event: "phase31_webhook_blocked", workflow_id: record.workflow_id, reason: "invalid_url" });
      return;
    }
    if (!isWebhookTargetAllowed(parsedHook)) {
      logger.error({ event: "phase31_webhook_blocked", workflow_id: record.workflow_id, reason: "ssrf_guard" });
      return;
    }

    const payload = JSON.stringify({
      event: "workflow.completed",
      workflow_id: record.workflow_id,
      template_id: record.template_id,
      status: record.status,
      completed_at: record.completed_at,
      results_url: `/api/v1/research/${encodeURIComponent(record.workflow_id)}/results`
    });

    const hmac = crypto.createHmac("sha256", "openclaw-webhook-v1").update(payload).digest("hex");

    logger.info({ event: "phase31_webhook_fire", workflow_id: record.workflow_id, url: webhookUrl });

    try {
      const mod = require("node:https");
      const req = mod.request(parsedHook, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-OpenClaw-Signature": `sha256=${hmac}`,
          "X-OpenClaw-Event": "workflow.completed"
        },
        timeout: 5000
      });
      req.on("error", (err) => {
        logger.error({ event: "phase31_webhook_error", workflow_id: record.workflow_id, error: String(err.message || err) });
      });
      req.write(payload);
      req.end();
    } catch (err) {
      logger.error({ event: "phase31_webhook_error", workflow_id: record.workflow_id, error: String(err.message || err) });
    }
  }

  // -------------------------------------------------------------------
  // Main dispatcher
  // -------------------------------------------------------------------

  function handleRequest(method, pathStr, body, authContext) {
    // Auth gate
    const authErr = checkAuth(authContext);
    if (authErr) return authErr;

    // Rate limit gate
    const apiKey = (authContext && authContext.api_key) || (authContext && authContext.principal) || "anonymous";
    if (!rateLimiter.allow(apiKey)) {
      return errorResponse(429, "RATE_LIMITED", "Too many requests — try again later");
    }

    // Route matching
    const route = matchRoute(method, pathStr);
    if (!route) {
      return errorResponse(404, "NOT_FOUND", `No route for ${method} ${pathStr}`);
    }

    switch (route.name) {
      case "submit":
        return handleSubmit(body, authContext);
      case "list":
        return handleList(body);
      case "status":
        return handleStatus(decodeURIComponent(route.params[0]));
      case "results":
        return handleResults(decodeURIComponent(route.params[0]));
      case "download":
        return handleDownload(decodeURIComponent(route.params[0]));
      default:
        return errorResponse(404, "NOT_FOUND", `Unknown route "${route.name}"`);
    }
  }

  return Object.freeze({ buildJsonlExport, buildStructuredResults, handleRequest });
}

module.exports = { createResearchApi };
