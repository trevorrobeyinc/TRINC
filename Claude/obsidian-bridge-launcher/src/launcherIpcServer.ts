import type { ChildProcess } from "child_process";
import { createHash } from "crypto";
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
  capture: ConsoleCapture;
  /**
   * Security audit sink (the launcher's JSONL feed into OSSEC/Falcon). Injected rather
   * than imported so this module stays unit-testable. `console.eval` no longer executes
   * anything, but attempts are still recorded here: removing a capability must not also
   * remove the detection that something went looking for it.
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
      // The code-execution primitive was REMOVED (2026-08-11). There is no longer any
      // path from this method to execution — no `new Function`, no `eval`, no `vm`. The
      // method is kept as an explicit, audited denial rather than deleted outright so an
      // older bridge asking for it gets a clear answer instead of "unknown method".
      //
      // The audit event is deliberately RETAINED. Nothing in normal operation calls
      // console.eval, so an attempt is still the security-interesting signal — removing
      // the capability must not also remove the detection that something probed for it.
      // The sha256 keeps replayed payloads correlatable and the 200-char prefix keeps a
      // detection readable without letting a huge payload flood the sink.
      const p = (params ?? {}) as { code?: string };
      const code = typeof p.code === "string" ? p.code : "";
      deps.audit({
        eventType: "DEV_CONSOLE_EVAL_DENIED",
        reason: "eval-primitive-removed",
        codeLength: code.length,
        codeSha256: code ? createHash("sha256").update(code).digest("hex") : null,
        codePrefix: code.slice(0, 200),
      });
      throw new Error(
        "obsidian_dev_console_eval has been removed: the launcher no longer contains a " +
          "code-execution primitive. Read-only console.logs / console.errors remain available."
      );
    }
    default:
      throw new Error(`unknown launcher IPC method: ${method}`);
  }
}
