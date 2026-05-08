import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { URL } from "node:url";
import { StateStore } from "./state-store";
import { TaskSubmission, BridgePrincipalKind, JobExecutionContext } from "./types";
import { JobWorker } from "./worker";
import { createExecutionRouter } from "../src/core/execution-router";
import { loadRuntimeConfig } from "../core/runtime-config.js";
import { nowIso, nowMs } from "../core/time-provider.js";
import { randomToken } from "../core/entropy-provider.js";
import { createLogger } from "../../logging/logger.js";
import { RUNTIME_POLICY } from "../../security/runtime-policy.js";
const { createMcpService } = require("../mcp/mcp-service.js");
const {
  MCP_MAX_BODY_BYTES,
  MCP_METHOD_ALLOWLIST,
  MCP_OPERATOR_METHOD_ALLOWLIST,
  normalizeMcpMessage,
  assertMcpContentLength
} = require("./mcp-transport.js");
const { parseBridgeRoute, BRIDGE_ROUTE_TYPES } = require("./bridge-routing.js");
const { createResearchApi } = require("./research-api.js");
const {
  createBridgePrincipalResolver,
  principalToMcpRole,
  getMcpAllowlistForPrincipal,
  BRIDGE_PRINCIPALS
} = require("./bridge-auth.js");
const { createWorkflowScheduler } = require("../core/workflow-scheduler.js");
const { createUsageMeter } = require("../core/usage-meter.js");

interface ErrorPayload {
  error: string;
  code?: string;
}

interface SseSession {
  id: string;
  res: http.ServerResponse;
  keepAliveTimer: NodeJS.Timeout;
  createdAtMs: number;
  principal: string;
}

const logger = createLogger("bridge-server");

function isOriginAllowed(originHeader?: string): boolean {
  const origin = String(originHeader || "").trim();
  if (!origin) {
    return true;
  }
  return RUNTIME_POLICY.gateway.corsAllowlist.includes(origin);
}

function sendJson(req: http.IncomingMessage, res: http.ServerResponse, statusCode: number, payload: unknown): void {
  const origin = String(req.headers.origin || "").trim();
  const allowedOrigin = isOriginAllowed(origin) ? (origin || RUNTIME_POLICY.gateway.corsAllowlist[0]) : "";
  const body = JSON.stringify(payload, null, 2);

  const headers: Record<string, string | number> = {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  };

  if (allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = allowedOrigin;
  }

  res.writeHead(statusCode, headers);
  res.end(body);
}

function sendError(req: http.IncomingMessage, res: http.ServerResponse, statusCode: number, error: string, code?: string): void {
  sendJson(req, res, statusCode, { error, code } satisfies ErrorPayload);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

async function readBody(req: http.IncomingMessage, maxBytes = MCP_MAX_BODY_BYTES): Promise<unknown> {
  const chunks: Buffer[] = [];
  let seen = 0;
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    seen += part.length;
    if (seen > maxBytes) {
      throw new Error(`Request body exceeds limit (${maxBytes} bytes)`);
    }
    chunks.push(part);
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf-8");
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Invalid JSON body");
  }
}

function normalizeClientIp(rawIp: string): string {
  const ip = String(rawIp || "").trim();
  if (ip.startsWith("::ffff:")) {
    return ip.slice("::ffff:".length);
  }
  return ip || "unknown";
}

function normalizeTaskSubmission(rawBody: unknown): TaskSubmission {
  const record = asRecord(rawBody);
  if (!record) {
    throw new Error("Request body must be a JSON object");
  }

  const instruction = String(record.instruction || "").trim();
  if (!instruction) {
    throw new Error("instruction is required");
  }

  const requesterRaw = String(record.requester || "codex").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/i.test(requesterRaw)) {
    throw new Error("Invalid requester; expected /[a-z0-9][a-z0-9_-]{0,31}/");
  }

  const contextUrlsRaw = Array.isArray(record.context_urls) ? record.context_urls : [];
  const context_urls = contextUrlsRaw.map((item) => String(item || "").trim()).filter(Boolean);

  return {
    instruction,
    requester: requesterRaw,
    initiative_id: String(record.initiative_id || "").trim() || undefined,
    session_id: String(record.session_id || "").trim() || undefined,
    context_urls: context_urls.length > 0 ? context_urls : undefined,
    model: String(record.model || "").trim() || undefined,
    hints: String(record.hints || "").trim() || undefined,
  };
}

function trackMcpRateLimit(
  mcpPerIpMinute: Map<string, { minuteEpoch: number; count: number }>,
  clientIp: string,
  perMinuteLimit: number
): boolean {
  const minuteEpoch = Math.floor(nowMs() / 60000);
  const existingRate = mcpPerIpMinute.get(clientIp);
  if (existingRate && existingRate.minuteEpoch === minuteEpoch && existingRate.count >= perMinuteLimit) {
    return false;
  }
  if (!existingRate || existingRate.minuteEpoch !== minuteEpoch) {
    mcpPerIpMinute.set(clientIp, { minuteEpoch, count: 1 });
  } else {
    existingRate.count += 1;
    mcpPerIpMinute.set(clientIp, existingRate);
  }
  return true;
}

function resolveBridgeAuthError(code: string): string {
  if (code === "BRIDGE_AUTH_REQUIRED") return "Authorization bearer token is required";
  if (code === "BRIDGE_AUTH_INVALID") return "Authorization bearer token is invalid";
  if (code === "BRIDGE_AUTH_TOKEN_REVOKED") return "Authorization token is revoked";
  if (code === "BRIDGE_AUTH_TOKEN_EXPIRED") return "Authorization token is expired";
  if (code === "BRIDGE_PRINCIPAL_UNMAPPED") return "Token role/scope does not map to a bridge principal";
  if (code === "BRIDGE_PRINCIPAL_FORBIDDEN") return "Principal is not allowed for this route";
  return "Authorization failed";
}

async function handleMcpJsonRpc(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  mcpService: { handle: (method: string, params: Record<string, unknown>, context: Record<string, unknown>) => Promise<unknown> },
  allowlist: string[],
  requesterPrincipal: string
): Promise<void> {
  try {
    assertMcpContentLength(req.headers["content-length"]);
  } catch (error) {
    const contentCode = error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code || "MCP_CONTENT_LENGTH_REQUIRED")
      : "MCP_CONTENT_LENGTH_REQUIRED";
    const messageText = error instanceof Error ? error.message : "Invalid content length";
    const status = contentCode === "MCP_PAYLOAD_TOO_LARGE" ? 413 : 400;
    sendError(req, res, status, messageText, contentCode);
    return;
  }

  const body = await readBody(req, MCP_MAX_BODY_BYTES);
  let message: { id: string; method: string; params: Record<string, unknown> };
  try {
    message = normalizeMcpMessage(body, { allowlist });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code || "MCP_REQUEST_INVALID")
      : "MCP_REQUEST_INVALID";
    const messageText = error instanceof Error ? error.message : "MCP request failed";
    sendError(req, res, 400, messageText, code);
    return;
  }

  try {
    const role = principalToMcpRole(requesterPrincipal);
    const result = await mcpService.handle(message.method, message.params, {
      correlationId: message.id,
      requester: requesterPrincipal,
      role,
    });
    sendJson(req, res, 200, {
      jsonrpc: "2.0",
      id: message.id,
      result,
    });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code || "MCP_REQUEST_FAILED")
      : "MCP_REQUEST_FAILED";
    const messageText = error instanceof Error ? error.message : "MCP request failed";
    sendJson(req, res, 200, {
      jsonrpc: "2.0",
      id: message.id,
      error: {
        code,
        message: messageText,
      },
    });
  }
}

async function bootstrap(): Promise<void> {
  const config = loadRuntimeConfig(path.resolve(process.cwd()));
  const gatewayHost = config.gateway.host;
  const gatewayPort = Number(config.gateway.port);
  const workspaceRoot = path.resolve(process.cwd(), "../workspace");
  const mcpSseKeepAliveMs = 15_000;

  await fs.mkdir(workspaceRoot, { recursive: true });
  await fs.mkdir(path.join(workspaceRoot, "comms"), { recursive: true });

  const store = new StateStore(workspaceRoot);
  await store.init();

  const executionRouter = createExecutionRouter({
    workspaceRoot,
    supervisorMode: true,
  });

  const worker = new JobWorker({
    store,
    commsRoot: path.join(workspaceRoot, "comms"),
    executionRouter,
  });
  worker.enqueueQueuedJobs();
  const mcpService = createMcpService({ logger });
  await mcpService.initialize();
  const principalResolver = createBridgePrincipalResolver({
    tokenStorePath: path.resolve(process.cwd(), "security", "token-store.json")
  });

  let researchApi: { handleRequest: (method: string, path: string, body: unknown, auth: unknown) => { status: number; body: unknown } };
  try {
    const { buildWorkflowRuntime } = require("../../scripts/_workflow-runtime.js");
    const { loadWorkflowTemplate } = require("../../scripts/_workflow-runtime.js");
    const rootDir = path.resolve(process.cwd());
    const workflowRuntime = await buildWorkflowRuntime({ rootDir, logger });
    researchApi = createResearchApi({
      workflowEngine: workflowRuntime.workflowEngine,
      templateLoader: (templateId: string) => loadWorkflowTemplate(rootDir, templateId),
      logger
    });
    logger.info({ event: "phase31_research_api_initialized" });

    // Phase 31 — Workflow scheduler (cron-based recurring workflows)
    try {
      const schedulerConfigPath = path.resolve(rootDir, "config", "scheduled-workflows.json");
      const scheduler = createWorkflowScheduler({
        workflowEngine: workflowRuntime.workflowEngine,
        logger,
        configPath: schedulerConfigPath
      });
      scheduler.start();
      logger.info({ event: "phase31_workflow_scheduler_started" });

      process.on("SIGTERM", () => scheduler.stop());
      process.on("SIGINT", () => scheduler.stop());
    } catch (schedErr) {
      logger.warn({ event: "phase31_scheduler_init_failed", error: String(schedErr) });
    }

    // Phase 31 — Usage meter (append-only JSONL metering)
    try {
      const stateDir = path.resolve(rootDir, "state");
      const usageMeter = createUsageMeter({ stateDir, logger });
      logger.info({ event: "phase31_usage_meter_initialized" });
    } catch (meterErr) {
      logger.warn({ event: "phase31_usage_meter_init_failed", error: String(meterErr) });
    }
  } catch (apiErr) {
    logger.warn({ event: "phase31_research_api_init_failed", error: String(apiErr) });
    researchApi = createResearchApi({
      workflowEngine: null,
      templateLoader: null,
      logger
    });
  }

  const sseSessions = new Map<string, SseSession>();
  const mcpPerIpMinute = new Map<string, { minuteEpoch: number; count: number }>();
  const mcpPerIpLimitPerMinute = 120;

  // TLS is mandatory. The previous OPENCLAW_BRIDGE_TLS_DISABLE escape hatch
  // was removed: a stray env var must not be able to demote this listener to plain HTTP.
  if (process.env.OPENCLAW_BRIDGE_TLS_DISABLE) {
    throw new Error(
      "OPENCLAW_BRIDGE_TLS_DISABLE is no longer honored. The bridge is HTTPS-only. " +
      "Unset this variable and provide a valid mkcert cert/key pair via " +
      "OPENCLAW_BRIDGE_TLS_KEY / OPENCLAW_BRIDGE_TLS_CERT (or the default mkcert paths)."
    );
  }
  const tlsKeyPath = process.env.OPENCLAW_BRIDGE_TLS_KEY
    || `${process.env.HOME || ""}/.local/share/mkcert/localhost-key.pem`;
  const tlsCertPath = process.env.OPENCLAW_BRIDGE_TLS_CERT
    || `${process.env.HOME || ""}/.local/share/mkcert/localhost.pem`;

  const requestHandler = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const method = (req.method || "GET").toUpperCase();
    const origin = String(req.headers.origin || "").trim();
    const clientIp = normalizeClientIp(req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "");

    if (!isOriginAllowed(origin)) {
      sendError(req, res, 403, "Origin not allowed", "ORIGIN_NOT_ALLOWED");
      return;
    }

    if (method === "OPTIONS") {
      sendJson(req, res, 204, {});
      return;
    }

    const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
    const route = parseBridgeRoute(requestUrl.pathname);
    const auth = principalResolver.resolve({
      routeType: route.type,
      authorizationHeader: req.headers.authorization
    });
    if (!auth.ok) {
      sendError(req, res, auth.status || 401, resolveBridgeAuthError(auth.code || ""), auth.code || "BRIDGE_AUTH_FAILED");
      return;
    }
    const principal = String(auth.principal || BRIDGE_PRINCIPALS.ANONYMOUS);

    try {
      if (method === "GET" && route.type === BRIDGE_ROUTE_TYPES.MCP_STREAMABLE) {
        sendJson(req, res, 200, {
          transport: "streamable-http",
          endpoint: "/mcp",
          compatibility_routes: ["/mcp/sse", "/mcp/events", "/mcp/messages", "/operator/mcp/messages"],
          principal
        });
        return;
      }

      if (method === "POST" && route.type === BRIDGE_ROUTE_TYPES.MCP_STREAMABLE) {
        if (!trackMcpRateLimit(mcpPerIpMinute, clientIp, mcpPerIpLimitPerMinute)) {
          sendError(req, res, 429, "MCP request rate exceeded for source IP", "MCP_RATE_LIMIT_PER_IP");
          return;
        }

        const allowlist = getMcpAllowlistForPrincipal(principal, {
          readAllowlist: MCP_METHOD_ALLOWLIST,
          operatorAllowlist: MCP_OPERATOR_METHOD_ALLOWLIST
        });
        await handleMcpJsonRpc(req, res, mcpService, allowlist, principal);
        return;
      }

      if (method === "GET" && route.type === BRIDGE_ROUTE_TYPES.MCP_SSE) {
        if (!RUNTIME_POLICY.gateway.wsOriginAllowlist.includes(origin || RUNTIME_POLICY.gateway.wsOriginAllowlist[0])) {
          sendError(req, res, 403, "WebSocket/SSE origin not allowed", "WS_ORIGIN_NOT_ALLOWED");
          return;
        }

        const sessionId = `mcp-${nowMs()}-${randomToken(8)}`;
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": origin || RUNTIME_POLICY.gateway.corsAllowlist[0],
        });
        res.write(`event: endpoint\ndata: /mcp/messages?sessionId=${sessionId}\n\n`);

        const keepAliveTimer = setInterval(() => {
          try {
            res.write(`: keepalive ${nowMs()}\n\n`);
          } catch {
            // ignore
          }
        }, mcpSseKeepAliveMs);

        sseSessions.set(sessionId, {
          id: sessionId,
          res,
          keepAliveTimer,
          createdAtMs: nowMs(),
          principal
        });

        req.on("close", () => {
          const session = sseSessions.get(sessionId);
          if (!session) return;
          clearInterval(session.keepAliveTimer);
          sseSessions.delete(sessionId);
        });
        return;
      }

      if (method === "POST" && route.type === BRIDGE_ROUTE_TYPES.MCP_MESSAGES) {
        if (!trackMcpRateLimit(mcpPerIpMinute, clientIp, mcpPerIpLimitPerMinute)) {
          sendError(req, res, 429, "MCP request rate exceeded for source IP", "MCP_RATE_LIMIT_PER_IP");
          return;
        }

        const sessionId = String(requestUrl.searchParams.get("sessionId") || "").trim();
        if (!sessionId || !sseSessions.has(sessionId)) {
          sendError(req, res, 404, "MCP SSE session not found", "MCP_SESSION_NOT_FOUND");
          return;
        }
        const session = sseSessions.get(sessionId);
        if (!session || session.principal !== principal) {
          sendError(req, res, 403, "MCP session principal mismatch", "BRIDGE_SESSION_PRINCIPAL_MISMATCH");
          return;
        }

        await handleMcpJsonRpc(req, res, mcpService, MCP_METHOD_ALLOWLIST, principal);
        return;
      }

      if (method === "POST" && route.type === BRIDGE_ROUTE_TYPES.OPERATOR_MCP_MESSAGES) {
        if (!trackMcpRateLimit(mcpPerIpMinute, clientIp, mcpPerIpLimitPerMinute)) {
          sendError(req, res, 429, "MCP request rate exceeded for source IP", "MCP_RATE_LIMIT_PER_IP");
          return;
        }

        await handleMcpJsonRpc(req, res, mcpService, MCP_OPERATOR_METHOD_ALLOWLIST, BRIDGE_PRINCIPALS.OPERATOR);
        return;
      }

      if (method === "GET" && route.type === BRIDGE_ROUTE_TYPES.HEALTH) {
        const jobs = store.listJobs();
        const queuedCount = jobs.filter((job) => job.status === "queued").length;
        const runningCount = jobs.filter((job) => job.status === "running").length;
        sendJson(req, res, 200, {
          status: "ok",
          service: "openclaw-research-bridge",
          timestamp: nowIso(),
          uptime_seconds: Math.floor(process.uptime()),
          queued_jobs: queuedCount,
          running_jobs: runningCount,
          gateway_port: gatewayPort,
          queue_model: "lane_queue",
        });
        return;
      }

      if (method === "GET" && route.type === BRIDGE_ROUTE_TYPES.JOBS) {
        sendJson(req, res, 200, { jobs: store.listJobs() });
        return;
      }

      if (method === "POST" && route.type === BRIDGE_ROUTE_TYPES.JOBS) {
        const body = await readBody(req);
        const submission = normalizeTaskSubmission(body);
        const executionContext: JobExecutionContext = {
          principal: principal as BridgePrincipalKind,
          role: principalToMcpRole(principal),
          token_id: auth.tokenId || undefined,
          source: "http_api",
        };
        const job = await store.createJob(submission, executionContext);
        worker.enqueue(job.id);
        sendJson(req, res, 201, { job });
        return;
      }

      if (method === "GET" && route.type === BRIDGE_ROUTE_TYPES.JOB) {
        const job = store.getJob(route.jobId);
        if (!job) {
          sendError(req, res, 404, "Job not found", "JOB_NOT_FOUND");
          return;
        }
        sendJson(req, res, 200, { job });
        return;
      }

      if (method === "POST" && route.type === BRIDGE_ROUTE_TYPES.CANCEL) {
        const existing = store.getJob(route.jobId);
        if (!existing) {
          sendError(req, res, 404, "Job not found", "JOB_NOT_FOUND");
          return;
        }
        const updated = await store.updateStatus(route.jobId, "cancelled", {
          error_message: "Cancelled by operator request",
          summary: `Cancelled ${route.jobId}`,
        });
        sendJson(req, res, 200, { job: updated });
        return;
      }

      if (method === "POST" && route.type === BRIDGE_ROUTE_TYPES.EXECUTE_TOOL) {
        sendError(req, res, 403, "Tool execution is blocked at bridge boundary in Phase 3.", "TOOL_EXECUTION_BLOCKED");
        return;
      }

      const researchRouteTypes = [
        BRIDGE_ROUTE_TYPES.API_RESEARCH_LIST,
        BRIDGE_ROUTE_TYPES.API_RESEARCH_SUBMIT,
        BRIDGE_ROUTE_TYPES.API_RESEARCH_STATUS,
        BRIDGE_ROUTE_TYPES.API_RESEARCH_DOWNLOAD
      ];
      if (researchRouteTypes.includes(route.type)) {
        const body = method === "POST" ? await readBody(req) : {};
        const apiResponse = await researchApi.handleRequest(method, requestUrl.pathname, body, {
          principal,
          api_key: auth.tokenId || "anonymous"
        });
        sendJson(req, res, apiResponse.status || 200, apiResponse.body || apiResponse);
        return;
      }

      sendError(req, res, 404, "Not Found", "NOT_FOUND");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendError(req, res, 400, message, "INVALID_REQUEST");
    }
  };

  const server = https.createServer(
    {
      key: readFileSync(tlsKeyPath),
      cert: readFileSync(tlsCertPath)
    },
    requestHandler
  );

  server.listen(gatewayPort, gatewayHost, () => {
    logger.info({
      correlationId: "11111111-1111-1111-1111-111111111111",
      message: `OpenClaw Research Bridge listening on https://${gatewayHost}:${gatewayPort}`,
      event: "bridge_start"
    });
  });
}

bootstrap().catch((error) => {
  const message = error instanceof Error ? `${error.message}\n${error.stack || ""}` : String(error);
  logger.error({
    correlationId: "11111111-1111-1111-1111-111111111111",
    message,
    event: "bridge_start_failed"
  });
  process.exit(1);
});
