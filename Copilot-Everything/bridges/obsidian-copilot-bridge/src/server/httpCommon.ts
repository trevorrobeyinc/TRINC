import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { dispatchToolRequest } from "./dispatcher";
import { verifyAuthToken } from "./auth";
import { ReplayGuard } from "./replayGuard";
import { CompositeRateLimiter } from "./rateLimit";
import type { RuntimeContext } from "./context";
import { buildFailure } from "./errors";
import { AppError } from "./errors";
import { ERROR_CODES } from "./errorCodes";
import { buildMetricsSnapshot } from "./httpMetricsEndpoint";

function getToken(req: IncomingMessage): string | undefined {
  const headerToken = req.headers["x-mcp-token"];
  if (typeof headerToken === "string") {
    return headerToken;
  }
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7);
  }
  return undefined;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function json(res: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
}

export function createRequestListener(runtime: RuntimeContext): (req: IncomingMessage, res: ServerResponse) => void {
  const replayGuard = new ReplayGuard(runtime.config.security.replayWindowSeconds, runtime.config.security.nonceTtlSeconds);
  const limiter = new CompositeRateLimiter(
    runtime.config.security.rateLimitPerMinute,
    runtime.config.security.globalRateLimitPerMinute
  );
  // Pre-auth flood guard (audit AR-3): a generous, coarse cap applied BEFORE auth so a
  // flood of unauthenticated requests cannot reach the per-client budget below. Set to
  // the global limit so it never affects a legitimate client under normal load.
  const preAuthLimiter = new CompositeRateLimiter(
    runtime.config.security.globalRateLimitPerMinute,
    runtime.config.security.globalRateLimitPerMinute
  );

  return async (req, res) => {
    if (req.method === "OPTIONS") {
      json(res, 405, buildFailure(new AppError(ERROR_CODES.AUTH_INVALID, "CORS preflight is disabled.")));
      return;
    }

    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/healthz") {
      json(res, 200, { ok: true, status: "ready", ts: new Date().toISOString() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/metrics") {
      try {
        verifyAuthToken(runtime.config.security.authToken, getToken(req));
      } catch (error) {
        json(res, 401, buildFailure(error));
        return;
      }
      json(res, 200, buildMetricsSnapshot(runtime));
      return;
    }

    if (req.method === "GET" && url.pathname === "/mcp/events") {
      try {
        verifyAuthToken(runtime.config.security.authToken, getToken(req));
      } catch (error) {
        json(res, 401, buildFailure(error));
        return;
      }
      const stream = url.searchParams.get("stream") || "default";
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-store, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.write(`: subscribed stream=${stream} ts=${new Date().toISOString()}\n\n`);
      runtime.eventBus.subscribe(stream, res);
      runtime.metrics.increment("sse_subscribers_total", { stream });
      runtime.logger.info("sse_subscribed", { stream, remote: req.socket.remoteAddress ?? "unknown" });
      // Do NOT res.end() — we hold the connection open until the client disconnects.
      return;
    }

    if (req.method !== "POST" || url.pathname !== "/mcp/tool") {
      json(res, 404, buildFailure(new AppError(ERROR_CODES.INTERNAL_ERROR, "Not found")));
      return;
    }

    const remote = req.socket.remoteAddress ?? "unknown";
    // Pre-auth flood guard only — does NOT consume the per-client budget.
    if (!preAuthLimiter.allow(remote)) {
      runtime.metrics.increment("rate_limit_rejections_total", { client: "preauth" });
      json(
        res,
        429,
        buildFailure(new AppError(ERROR_CODES.RATE_LIMIT_EXCEEDED, "Rate limit exceeded.", true, { retryAfterMs: 1000 }))
      );
      return;
    }

    try {
      const token = getToken(req);
      verifyAuthToken(runtime.config.security.authToken, token);
      // Per-client budget keyed on the authenticated token, NOT the shared loopback IP,
      // so an unauthenticated caller can never consume the legit client's budget (AR-3).
      const clientKey = createHash("sha256").update(token ?? "").digest("hex");
      if (!limiter.allow(clientKey)) {
        runtime.metrics.increment("rate_limit_rejections_total", { client: "token" });
        json(
          res,
          429,
          buildFailure(new AppError(ERROR_CODES.RATE_LIMIT_EXCEEDED, "Rate limit exceeded.", true, { retryAfterMs: 1000 }))
        );
        return;
      }
      const body = await readBody(req);
      replayGuard.verify(
        req.headers["x-mcp-timestamp"] as string | undefined,
        req.headers["x-mcp-nonce"] as string | undefined,
        body,
        req.headers["x-mcp-body-sha256"] as string | undefined
      );

      const response = await dispatchToolRequest(runtime, body);
      json(res, response.ok ? 200 : 400, response);
    } catch (error) {
      json(res, 401, buildFailure(error));
    }
  };
}

export function bodyHash(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}
