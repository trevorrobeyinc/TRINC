import type { ChildProcess } from "child_process";
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
      if (!deps.evalEnabled()) {
        throw new Error(
          "obsidian_dev_console_eval is disabled by launcher settings (devConsoleEvalEnabled=false). Enable it in 'Obsidian Bridge Launcher' settings."
        );
      }
      const p = (params ?? {}) as { code?: string; timeoutMs?: number };
      if (typeof p.code !== "string" || p.code.length === 0) {
        throw new Error("console.eval requires non-empty 'code' string");
      }
      return runEval(p.code, p.timeoutMs ?? 5000, deps.app);
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
