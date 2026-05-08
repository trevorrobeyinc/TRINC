/**
 * Minimal Chrome DevTools Protocol client for evaluating JS in Obsidian.
 *
 * Connects to Obsidian's remote debugging port (8315) via WebSocket,
 * then executes JavaScript expressions using Runtime.evaluate.
 *
 * Designed for the MCP bridge to call window.__trevnodus_webviewer
 * methods from outside the Obsidian process.
 */

import { WebSocket } from "ws";

const CDP_HTTP_BASE = "http://127.0.0.1:8315";
const EVAL_TIMEOUT_MS = 60_000;

let _ws = null;
let _msgId = 1;
let _pending = new Map();
let _targetWsUrl = null;

async function _getTargetUrl() {
  if (_targetWsUrl) return _targetWsUrl;

  const resp = await fetch(`${CDP_HTTP_BASE}/json`, {
    signal: AbortSignal.timeout(5000),
  });
  const pages = await resp.json();

  // Find the main Obsidian page (not a webview or extension)
  const target =
    pages.find((p) => p.url?.startsWith("app://obsidian.md")) ||
    pages.find((p) => p.type === "page") ||
    pages[0];

  if (!target?.webSocketDebuggerUrl) {
    throw new Error("No CDP target found on port 8315");
  }

  _targetWsUrl = target.webSocketDebuggerUrl;
  return _targetWsUrl;
}

function _ensureConnection() {
  return new Promise(async (resolve, reject) => {
    if (_ws && _ws.readyState === WebSocket.OPEN) {
      return resolve(_ws);
    }

    // Clean up stale connection
    if (_ws) {
      try { _ws.close(); } catch (_) {}
      _ws = null;
      _targetWsUrl = null;
    }

    try {
      const wsUrl = await _getTargetUrl();
      const ws = new WebSocket(wsUrl);

      const connectTimeout = setTimeout(() => {
        ws.close();
        reject(new Error("CDP WebSocket connect timeout"));
      }, 10_000);

      ws.on("open", () => {
        clearTimeout(connectTimeout);
        _ws = ws;
        resolve(ws);
      });

      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.id && _pending.has(msg.id)) {
            const { resolve: res, reject: rej, timer } = _pending.get(msg.id);
            clearTimeout(timer);
            _pending.delete(msg.id);
            if (msg.error) {
              rej(new Error(msg.error.message || "CDP error"));
            } else {
              res(msg.result);
            }
          }
        } catch (_) {}
      });

      ws.on("close", () => {
        _ws = null;
        _targetWsUrl = null;
        // Reject all pending
        for (const [id, { reject: rej, timer }] of _pending) {
          clearTimeout(timer);
          rej(new Error("CDP connection closed"));
        }
        _pending.clear();
      });

      ws.on("error", (err) => {
        clearTimeout(connectTimeout);
        _ws = null;
        _targetWsUrl = null;
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}

function _sendCommand(method, params = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      const ws = await _ensureConnection();
      const id = _msgId++;

      const timer = setTimeout(() => {
        _pending.delete(id);
        reject(new Error(`CDP command timeout: ${method}`));
      }, EVAL_TIMEOUT_MS);

      _pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Evaluate a JavaScript expression in Obsidian's renderer process.
 * Supports async expressions (awaitPromise: true).
 *
 * @param {string} expression - JS expression to evaluate
 * @returns {Promise<any>} - Parsed JSON result
 */
export async function evaluateInObsidian(expression) {
  const result = await _sendCommand("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  if (result?.exceptionDetails) {
    const desc =
      result.exceptionDetails.exception?.description ||
      result.exceptionDetails.text ||
      "Evaluation error";
    throw new Error(desc);
  }

  return result?.result?.value;
}

/**
 * Check if CDP connection to Obsidian is available.
 */
export async function isCdpAvailable() {
  try {
    const resp = await fetch(`${CDP_HTTP_BASE}/json`, {
      signal: AbortSignal.timeout(3000),
    });
    const pages = await resp.json();
    return pages.some(
      (p) => p.url?.startsWith("app://obsidian.md") || p.type === "page"
    );
  } catch (_) {
    return false;
  }
}

/**
 * Close the CDP WebSocket connection.
 */
export function closeCdp() {
  if (_ws) {
    try { _ws.close(); } catch (_) {}
    _ws = null;
    _targetWsUrl = null;
  }
}
