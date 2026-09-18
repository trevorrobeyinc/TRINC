"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");
const { ToolUniverseJsonRpcResponseSchema } = require("./tu-schema.js");

const MAX_RESTARTS = 3;
const HEALTH_INTERVAL_MS = 30_000;
const SPAWN_TIMEOUT_MS = 60_000;
const MCP_PROTOCOL_VERSION = "2025-06-18";

function createMcpError(code, message, details) {
  const error = new Error(String(message || "ToolUniverse process error"));
  error.code = String(code || "TU_PROCESS_ERROR");
  if (typeof details !== "undefined") {
    error.details = details;
  }
  return error;
}

/**
 * Extract the payload from an MCP tools/call result.
 * MCP wraps tool results as {content: [{type: "text", text: "..."}]}.
 * This function unwraps that to return the parsed JSON data.
 */
function unwrapMcpToolResult(result) {
  if (!result || typeof result !== "object") return result;

  // MCP tools/call result format: { content: [{ type: "text", text: "..." }] }
  if (Array.isArray(result.content)) {
    const textParts = result.content
      .filter((c) => c && c.type === "text" && typeof c.text === "string")
      .map((c) => c.text);

    if (textParts.length === 0) return result;

    const joined = textParts.join("");
    try {
      return JSON.parse(joined);
    } catch {
      // Not JSON — return as-is (could be plain text output)
      return joined;
    }
  }

  // Not an MCP-wrapped result, return as-is
  return result;
}

function createToolUniverseProcessManager(options = {}) {
  const logger = options.logger && typeof options.logger === "object" ? options.logger : { info() {}, warn() {}, error() {} };
  const pythonPath = typeof options.pythonPath === "string" ? options.pythonPath : "uv";
  const toolUniverseDir = typeof options.toolUniverseDir === "string"
    ? options.toolUniverseDir
    : path.resolve(process.cwd(), "vendor", "tooluniverse");
  const executionTimeoutMs = Math.min(120_000, Math.max(5_000, Number(options.executionTimeoutMs) || 60_000));

  let proc = null;
  let ready = false;
  let initialized = false;
  let restartCount = 0;
  let nextId = 1;
  let healthTimer = null;
  let pendingRequests = new Map();
  let lineBuffer = "";

  function isUvBinary(binPath) {
    const base = binPath.split("/").pop() || "";
    return base === "uv" || base.startsWith("uv.");
  }

  function buildArgs() {
    if (isUvBinary(pythonPath)) {
      return [
        "run",
        // --no-sync: run against the existing pinned .venv, never re-resolve dependencies at
        // spawn time. Without it, `uv run` revalidates the lock on every spawn and a purely
        // UPSTREAM registry change can kill the engine: verified live 2026-08-12 — resolution
        // of the pinned v1.1.10 pyproject started failing on `fitz>=0.0.1.dev2` for the
        // python-3.10 marker split (submodule clean vs HEAD, venv imports fine) and every
        // ToolUniverse prefetch died with "Process exited before ready (code=1)". The venv is
        // the build artifact of the pinned SHA; syncing belongs to setup, not to run start.
        "--no-sync",
        "--directory", toolUniverseDir,
        "tooluniverse-smcp-stdio",
        "--compact-mode"
      ];
    }
    // Fallback for direct python invocation
    return ["-m", "tooluniverse.smcp_server", "--compact-mode", "--transport", "stdio"];
  }

  function handleStdoutLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return;

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      logger.warn({ event: "tu_stdout_non_json", preview: trimmed.slice(0, 200) });
      return;
    }

    // MCP notifications from server (no id) — log and skip
    if (parsed.method && !parsed.id) {
      logger.info({ event: "tu_server_notification", method: parsed.method });
      return;
    }

    const validated = ToolUniverseJsonRpcResponseSchema.safeParse(parsed);
    if (!validated.success) {
      logger.warn({ event: "tu_stdout_invalid_jsonrpc", preview: trimmed.slice(0, 200) });
      return;
    }

    const response = validated.data;
    const requestId = String(response.id);
    const pending = pendingRequests.get(requestId);
    if (!pending) {
      logger.warn({ event: "tu_orphan_response", id: requestId });
      return;
    }

    pendingRequests.delete(requestId);
    clearTimeout(pending.timer);

    if (response.error) {
      pending.reject(createMcpError("TU_TOOL_ERROR", response.error.message, {
        code: response.error.code,
        data: response.error.data
      }));
    } else {
      // For tools/call responses, unwrap the MCP content wrapper
      const result = pending.method === "tools/call"
        ? unwrapMcpToolResult(response.result)
        : response.result;
      pending.resolve(result);
    }
  }

  function handleStdout(data) {
    lineBuffer += data.toString("utf8");
    const lines = lineBuffer.split("\n");
    lineBuffer = lines.pop() || "";
    for (const line of lines) {
      handleStdoutLine(line);
    }
  }

  function handleStderr(data) {
    const text = data.toString("utf8").trim();
    if (text) {
      logger.warn({ event: "tu_stderr", text: text.slice(0, 500) });
    }
  }

  function rejectAllPending(reason) {
    for (const [id, pending] of pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(createMcpError("TU_PROCESS_DIED", reason, { requestId: id }));
    }
    pendingRequests = new Map();
  }

  function handleExit(code, signal) {
    ready = false;
    initialized = false;
    proc = null;
    rejectAllPending(`Process exited (code=${code}, signal=${signal})`);
    logger.error({ event: "tu_process_exit", code, signal, restartCount });

    if (healthTimer) {
      clearInterval(healthTimer);
      healthTimer = null;
    }
  }

  /**
   * Write a raw JSON-RPC message to the process stdin.
   * Returns a promise that resolves with the response result.
   */
  function writeRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!proc || !proc.stdin.writable) {
        reject(createMcpError("TU_NOT_RUNNING", "ToolUniverse process is not running"));
        return;
      }

      const id = String(nextId++);
      const request = {
        jsonrpc: "2.0",
        id,
        method,
        params
      };

      const timer = setTimeout(() => {
        pendingRequests.delete(id);
        reject(createMcpError("TU_REQUEST_TIMEOUT", `Request ${method} timed out (${executionTimeoutMs}ms)`));
      }, executionTimeoutMs);

      pendingRequests.set(id, { resolve, reject, timer, method });

      try {
        proc.stdin.write(JSON.stringify(request) + "\n");
      } catch (err) {
        pendingRequests.delete(id);
        clearTimeout(timer);
        reject(createMcpError("TU_WRITE_ERROR", `Failed to write to process: ${err.message}`));
      }
    });
  }

  /**
   * Send a JSON-RPC notification (no id, no response expected).
   */
  function writeNotification(method, params = {}) {
    if (!proc || !proc.stdin.writable) return;
    const notification = { jsonrpc: "2.0", method, params };
    try {
      proc.stdin.write(JSON.stringify(notification) + "\n");
    } catch {
      // Best-effort notification
    }
  }

  /**
   * Perform MCP handshake: initialize -> initialized notification.
   */
  async function performHandshake() {
    logger.info({ event: "tu_mcp_handshake_start" });

    const initResult = await writeRequest("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: "openclaw-tooluniverse-bridge",
        version: "2.0.0"
      }
    });

    logger.info({
      event: "tu_mcp_handshake_initialized",
      serverInfo: initResult && initResult.serverInfo,
      protocolVersion: initResult && initResult.protocolVersion
    });

    // Send initialized notification to signal handshake completion
    writeNotification("notifications/initialized", {});
    initialized = true;

    return initResult;
  }

  async function spawnProcess() {
    if (proc) return;

    if (restartCount >= MAX_RESTARTS) {
      throw createMcpError("TU_MAX_RESTARTS", `ToolUniverse process exceeded max restarts (${MAX_RESTARTS})`);
    }

    const args = buildArgs();
    logger.info({ event: "tu_spawn", command: pythonPath, args });

    return new Promise((resolve, reject) => {
      // Hardening (audit gdrive-oauth / F-SUB2): don't propagate the high-value
      // Google refresh token / client secret into the tool subprocess.
      // No browser automation on this host (operator decision 2026-09-18): ToolUniverse's url_tool
      // must never download a browser, even if a future sync reinstalls its library.
      const childEnv = { ...process.env, PYTHONUNBUFFERED: "1", PLAYWRIGHT_SKIP_BROWSER_INSTALL: "1" };
      for (const k of Object.keys(childEnv)) {
        if (/^GOOGLE_DRIVE_|^GOOGLE_CLIENT_SECRET$/i.test(k)) delete childEnv[k];
      }
      const child = spawn(pythonPath, args, {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: toolUniverseDir,
        env: childEnv
      });

      const spawnTimer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(createMcpError("TU_SPAWN_TIMEOUT", `ToolUniverse process did not start within ${SPAWN_TIMEOUT_MS}ms`));
      }, SPAWN_TIMEOUT_MS);

      child.stdout.on("data", handleStdout);
      child.stderr.on("data", handleStderr);

      child.on("error", (err) => {
        clearTimeout(spawnTimer);
        reject(createMcpError("TU_SPAWN_ERROR", err.message));
      });

      child.on("exit", (code, signal) => {
        clearTimeout(spawnTimer);
        handleExit(code, signal);
        if (!ready) {
          reject(createMcpError("TU_SPAWN_EXIT", `Process exited before ready (code=${code})`));
        }
      });

      // MCP stdio servers are ready immediately — they wait for the
      // initialize request. Set up the process and perform handshake.
      proc = child;
      restartCount += 1;
      clearTimeout(spawnTimer);

      performHandshake()
        .then(() => {
          ready = true;
          restartCount = 0; // a healthy handshake resets the consecutive-restart budget

          healthTimer = setInterval(() => {
            sendRequest("list_tools", {}).catch((err) => {
              logger.warn({ event: "tu_health_check_failed", error: err.message });
            });
          }, HEALTH_INTERVAL_MS);

          resolve();
        })
        .catch((err) => {
          logger.error({ event: "tu_handshake_failed", error: err.message });
          try { child.kill("SIGTERM"); } catch { /* already dead */ }
          proc = null;
          reject(createMcpError("TU_HANDSHAKE_FAILED", `MCP handshake failed: ${err.message}`));
        });
    });
  }

  async function ensureProcess() {
    if (proc && ready && initialized) return;
    await spawnProcess();
  }

  /**
   * Send a tool call via MCP tools/call protocol.
   * Wraps the method name and params in the MCP envelope.
   */
  function sendRequest(method, params = {}) {
    // Wrap in MCP tools/call envelope
    return writeRequest("tools/call", {
      name: method,
      arguments: params
    });
  }

  async function call(method, params = {}) {
    await ensureProcess();
    return sendRequest(method, params);
  }

  function shutdown() {
    if (healthTimer) {
      clearInterval(healthTimer);
      healthTimer = null;
    }
    rejectAllPending("shutdown");
    if (proc) {
      try {
        proc.kill("SIGTERM");
      } catch {
        // already dead
      }
      proc = null;
      ready = false;
      initialized = false;
    }
  }

  function isRunning() {
    return Boolean(proc && ready && initialized);
  }

  return Object.freeze({
    call,
    shutdown,
    isRunning,
    ensureProcess
  });
}

module.exports = {
  createToolUniverseProcessManager,
  unwrapMcpToolResult,
  MAX_RESTARTS,
  HEALTH_INTERVAL_MS,
  SPAWN_TIMEOUT_MS,
  MCP_PROTOCOL_VERSION
};
