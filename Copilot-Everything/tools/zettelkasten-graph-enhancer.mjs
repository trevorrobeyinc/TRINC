/**
 * Zettelkasten Graph Enhancement Module
 *
 * Spawns the Medical Zettelkasten MCP as a stdio subprocess to provide
 * algorithmic graph analysis as an optional enhancement layer for the
 * existing Zettelkasten commands.
 *
 * This module is standalone — it does NOT modify any existing Copilot code.
 * It can be called independently or integrated by the ZettelkastenService
 * in the future.
 *
 * @module zettelkasten-graph-enhancer
 */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  zettelkastenMcpServerPath: "/Users/trevorrobey/Claude/Medical-Zettelkasten-MCP/src/server.js",
  nodePath: process.execPath,
  timeoutMs: 30000
});

export function loadConfig() {
  try {
    const configPath = resolve(__dirname, "../configs/zettelkasten-graph-enhancer.json");
    const raw = JSON.parse(readFileSync(configPath, "utf8"));
    return { ...DEFAULT_CONFIG, ...raw };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Spawn the Zettelkasten MCP, perform handshake, call a tool, shut down.
 * Short-lived — one subprocess per call. Acceptable for graph analysis
 * which runs in <100ms.
 */
async function callMcpTool(toolName, args, config) {
  const { nodePath, zettelkastenMcpServerPath, timeoutMs } = config;

  return new Promise((resolveP, rejectP) => {
    const child = spawn(nodePath, [zettelkastenMcpServerPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env }
    });

    let lineBuffer = "";
    let nextId = 1;
    const pending = new Map();

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      rejectP(new Error(`Zettelkasten MCP timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    function sendRequest(method, params) {
      return new Promise((res, rej) => {
        const id = String(nextId++);
        pending.set(id, { resolve: res, reject: rej });
        const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
        child.stdin.write(msg);
      });
    }

    function sendNotification(method, params) {
      const msg = JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n";
      try { child.stdin.write(msg); } catch { /* best effort */ }
    }

    child.stdout.on("data", (data) => {
      lineBuffer += data.toString("utf8");
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let parsed;
        try { parsed = JSON.parse(trimmed); } catch { continue; }
        if (parsed.method && !parsed.id) continue; // notification
        const id = String(parsed.id);
        const p = pending.get(id);
        if (!p) continue;
        pending.delete(id);
        if (parsed.error) {
          p.reject(new Error(parsed.error.message || "MCP error"));
        } else {
          p.resolve(parsed.result);
        }
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      rejectP(err);
    });

    child.on("exit", () => {
      clearTimeout(timer);
      for (const [, p] of pending) {
        p.reject(new Error("Process exited"));
      }
    });

    // Handshake then call
    sendRequest("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "copilot-graph-enhancer", version: "1.0.0" }
    }).then(() => {
      sendNotification("notifications/initialized", {});
      return sendRequest("tools/call", { name: toolName, arguments: args });
    }).then((result) => {
      clearTimeout(timer);
      child.kill("SIGTERM");
      // Unwrap MCP content
      if (result && Array.isArray(result.content)) {
        const text = result.content
          .filter((c) => c && c.type === "text")
          .map((c) => c.text)
          .join("");
        try { resolveP(JSON.parse(text)); } catch { resolveP(text); }
      } else {
        resolveP(result);
      }
    }).catch((err) => {
      clearTimeout(timer);
      try { child.kill("SIGTERM"); } catch { /* already dead */ }
      rejectP(err);
    });
  });
}

/**
 * Enhance text with graph analysis from the Medical Zettelkasten MCP.
 *
 * @param {string} text - Input text to analyze
 * @param {string} [command="full_zettelkasten_analysis"] - Tool to run
 * @param {object} [options] - { config, inputType }
 * @returns {Promise<object|null>} Analysis result or null if disabled
 */
export async function enhanceWithGraph(text, command, options) {
  const opts = options || {};
  const config = opts.config || loadConfig();

  if (!config.enabled) return null;
  if (!text || typeof text !== "string" || text.trim().length === 0) return null;

  const toolName = command || "full_zettelkasten_analysis";
  const inputType = opts.inputType || "text";

  return callMcpTool(toolName, { text, input_type: inputType }, config);
}

export { DEFAULT_CONFIG };
