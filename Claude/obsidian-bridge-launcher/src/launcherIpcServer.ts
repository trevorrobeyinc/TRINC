import type { ChildProcess } from "child_process";
import { createHash } from "crypto";
import type { App } from "obsidian";
import type { ConsoleCapture } from "./consoleCapture";
import type { ConsoleLevel } from "./types";

const VALID_LEVELS: ReadonlySet<ConsoleLevel> = new Set([
  "log",
  "info",
  "warn",
  "error",
  "debug",
]);

interface JsonRpcRequest {
  jsonrpc?: "2.0";
  id?: string;
  method?: string;
  params?: unknown;
}

interface RpcDeps {
  app: App;
  capture: ConsoleCapture;
  evalEnabled: () => boolean;
  /**
   * Security audit sink (the launcher's JSONL feed into OSSEC/Falcon). Injected rather
   * than imported so this module stays unit-testable. `console.eval` is an arbitrary-code
   * primitive in renderer scope; before this existed it ran with NO trace anywhere.
   */
  audit: (event: Record<string, unknown>) => void;
}

/**
 * Listens on the bridge child process's fd 3 socket for line-delimited
 * JSON-RPC requests and serves them in renderer scope. This is the
 * non-CDP back channel that backs `obsidian_dev_console_*` tools.
 */
export function attachLauncherIpcServer(child: ChildProcess, deps: RpcDeps): () => void {
  const sock = child.stdio[3];
  if (!sock || typeof (sock as { write?: unknown }).write !== "function") {
    console.warn("[bridge-launcher] no fd-3 IPC channel; dev console tools will be unavailable");
    return () => undefined;
  }

  // child.stdio[3] is typed as Writable | Readable but the runtime object is
  // a net.Socket (Unix) or Duplex Pipe (Windows) — both support read+write.
  const duplex = sock as unknown as NodeJS.WritableStream & NodeJS.ReadableStream;
  let buffer = "";

  const onData = (chunk: Buffer | string) => {
    buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (!line.trim()) continue;
      void handleLine(line);
    }
  };

  const handleLine = async (line: string): Promise<void> => {
    let req: JsonRpcRequest;
    try {
      req = JSON.parse(line) as JsonRpcRequest;
    } catch {
      return;
    }
    if (!req.id || !req.method) return;

    try {
      const result = await dispatch(req.method, req.params, deps);
      respond({ id: req.id, result });
    } catch (err) {
      respond({
        id: req.id,
        error: { message: err instanceof Error ? err.message : String(err) },
      });
    }
  };

  const respond = (msg: { id: string; result?: unknown; error?: { message: string } }) => {
    try {
      duplex.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");
    } catch (e) {
      console.warn("[bridge-launcher] IPC write failed:", e);
    }
  };

  duplex.on("data", onData);

  return () => {
    try {
      (duplex as unknown as { off?: (event: string, fn: (chunk: Buffer | string) => void) => void }).off?.("data", onData);
    } catch {
      // ignore
    }
  };
}

async function dispatch(method: string, params: unknown, deps: RpcDeps): Promise<unknown> {
  switch (method) {
    case "console.logs": {
      const p = (params ?? {}) as { levels?: unknown; limit?: number; sinceMs?: number };
      const levels = Array.isArray(p.levels)
        ? (p.levels.filter((l): l is ConsoleLevel => typeof l === "string" && VALID_LEVELS.has(l as ConsoleLevel)))
        : undefined;
      return deps.capture.getLogs({
        levels,
        limit: p.limit,
        sinceMs: p.sinceMs,
      });
    }
    case "console.errors": {
      const p = (params ?? {}) as { limit?: number; sinceMs?: number };
      return deps.capture.getErrors({ limit: p.limit, sinceMs: p.sinceMs });
    }
    case "console.eval": {
      const p = (params ?? {}) as { code?: string; timeoutMs?: number };
      const code = typeof p.code === "string" ? p.code : "";
      // Fingerprint the payload for the audit trail: the sha256 makes repeat/replayed
      // payloads correlatable, the prefix makes a detection readable at a glance, and
      // truncating at 200 chars keeps an arbitrarily large payload from flooding the sink.
      const fingerprint = {
        codeLength: code.length,
        codeSha256: code ? createHash("sha256").update(code).digest("hex") : null,
        codePrefix: code.slice(0, 200),
      };

      if (!deps.evalEnabled()) {
        // A denial is the more security-interesting event of the two: nothing in normal
        // operation calls this, so an attempt while disabled means something is probing.
        deps.audit({ eventType: "DEV_CONSOLE_EVAL_DENIED", reason: "devConsoleEvalEnabled=false", ...fingerprint });
        throw new Error(
          "obsidian_dev_console_eval is disabled by launcher settings (devConsoleEvalEnabled=false). Enable it in 'Obsidian Bridge Launcher' settings."
        );
      }
      if (!code) {
        throw new Error("console.eval requires non-empty 'code' string");
      }

      const timeoutMs = p.timeoutMs ?? 5000;
      deps.audit({ eventType: "DEV_CONSOLE_EVAL", timeoutMs, ...fingerprint });
      try {
        const out = await runEval(code, timeoutMs, deps.app);
        deps.audit({ eventType: "DEV_CONSOLE_EVAL_RESULT", outcome: "ok", durationMs: out.durationMs, codeSha256: fingerprint.codeSha256 });
        return out;
      } catch (err) {
        deps.audit({
          eventType: "DEV_CONSOLE_EVAL_RESULT",
          outcome: "error",
          message: err instanceof Error ? err.message : String(err),
          codeSha256: fingerprint.codeSha256,
        });
        throw err;
      }
    }
    default:
      throw new Error(`unknown launcher IPC method: ${method}`);
  }
}

async function runEval(code: string, timeoutMs: number, app: App): Promise<{
  result: unknown;
  type: string;
  durationMs: number;
}> {
  const t0 = Date.now();
  // SECURITY NOTE — the timeout below bounds how long the CALLER waits, it does NOT stop the
  // code. Promise.race settles the returned promise, but `fn` keeps running to completion in
  // renderer scope; there is no way to abort a running `new Function` body in-process. So a
  // "timeout" is a reporting deadline, not containment. The real containment is the
  // devConsoleEvalEnabled gate (default OFF) plus the audit events emitted by the caller —
  // do not add a longer timeout under the impression that it limits blast radius.
  const fn = new Function("app", "window", "document", `"use strict"; return (async () => { ${code} })();`);
  const promise = Promise.resolve().then(() => fn(app, window, document));
  const result = await Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`eval timeout after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
  const durationMs = Date.now() - t0;
  let safe: unknown = result;
  try {
    safe = JSON.parse(JSON.stringify(result));
  } catch {
    safe = String(result);
  }
  return { result: safe, type: typeof result, durationMs };
}
