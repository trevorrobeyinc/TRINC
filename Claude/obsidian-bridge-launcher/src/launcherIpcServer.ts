import type { ChildProcess } from "child_process";
import { createHash } from "crypto";
import { StringDecoder } from "string_decoder";
import type { App } from "obsidian";
import type { ConsoleCapture } from "./consoleCapture";
import type { ConsoleLevel } from "./types";
import { isVaultMethod, serveVaultMethod, VaultIpcError, type ObsidianRuntime } from "./vaultIpc.ts";

/**
 * A frame longer than this without a newline is dropped, and the drop is audited and answered (too_large). It
 * bounds what the child can make the renderer buffer. A note body at the 16 MiB limit fits for any real text:
 * JSON escapes quotes and backslashes to two characters, but only control characters other than tab and newline
 * (and lone surrogates) to six, so only a body made mostly of those can produce a frame past it, and that body
 * is then refused with too_large rather than written.
 */
export const MAX_FRAME_CHARS = 64 * 1024 * 1024;

/** How much of a frame's start is kept to find its id: the bridge writes {"jsonrpc":"2.0","id":"<uuid>",... */
const FRAME_HEAD_CHARS = 160;

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
  /** The Obsidian app, for the vault bridge's vault operations (vaultIpc.ts). */
  app: App;
  /** The 'obsidian' functions the vault operations call (passed in so the tests can stand them in). */
  obsidian: ObsidianRuntime;
  /** This plugin's manifest version, reported by vault.info. */
  version: string;
  /** The frame cap; MAX_FRAME_CHARS unless a test needs a small one. */
  maxFrameChars?: number;
}

export interface FrameReaderOptions {
  maxFrameChars: number;
  onFrame: (line: string) => void;
  /** A frame grew past maxFrameChars before its newline. The rest of it, up to that newline, is discarded unread. */
  onOversize: (head: string, chars: number) => void;
}

/**
 * Splits the pipe's byte stream into newline-terminated frames.
 *
 * One StringDecoder decodes the whole stream, so a UTF-8 sequence that a read cut short is held back until
 * its remaining bytes arrive. Decoding each read on its own, as this reader did until 2026-11-25, turns such a
 * split character into U+FFFD, and the damaged text still parses as JSON: a note body written through
 * vault.create or vault.append would have been stored damaged. Each read is searched for newlines only in its
 * own text, and the pieces of a frame are joined once, so a long frame costs time in proportion to its length
 * rather than to its square.
 */
export function createFrameReader(options: FrameReaderOptions): (chunk: Buffer | string) => void {
  const decoder = new StringDecoder("utf8");
  let pieces: string[] = [];
  let chars = 0;
  let head = "";
  let discarding = false;

  const remember = (piece: string): void => {
    if (head.length < FRAME_HEAD_CHARS) head += piece.slice(0, FRAME_HEAD_CHARS - head.length);
  };
  const reset = (): void => {
    pieces = [];
    chars = 0;
    head = "";
  };

  return (chunk) => {
    const text = typeof chunk === "string" ? chunk : decoder.write(chunk);
    let start = 0;
    let nl = text.indexOf("\n", start);
    while (nl >= 0) {
      const piece = text.slice(start, nl);
      start = nl + 1;
      if (discarding) {
        discarding = false;
      } else if (chars + piece.length > options.maxFrameChars) {
        remember(piece);
        options.onOversize(head, chars + piece.length);
      } else {
        pieces.push(piece);
        const line = pieces.join("");
        if (line.trim()) options.onFrame(line);
      }
      reset();
      nl = text.indexOf("\n", start);
    }
    const rest = text.slice(start);
    if (discarding || !rest) return;
    remember(rest);
    pieces.push(rest);
    chars += rest.length;
    if (chars > options.maxFrameChars) {
      options.onOversize(head, chars);
      reset();
      discarding = true;
    }
  };
}

/** The request id in a frame's head, to answer a frame that cannot be parsed instead of leaving it to time out. */
function frameIdOf(head: string): string | null {
  const match = /"id"\s*:\s*"([^"\\]{1,100})"/.exec(head);
  return match ? match[1] : null;
}

/**
 * Listens on the bridge child process's fd 3 socket for line-delimited
 * JSON-RPC requests and serves them in renderer scope. This is the
 * non-CDP back channel that backs `obsidian_dev_console_*` tools and, since
 * 2026-11-25, the bridge's vault operations (vaultIpc.ts), which replaced the
 * Local REST API plugin on :27124. It is a private pipe, not a listener.
 */
export function attachLauncherIpcServer(child: ChildProcess, deps: RpcDeps): () => void {
  const sock = child.stdio[3];
  if (!sock || typeof (sock as { write?: unknown }).write !== "function") {
    console.warn("[bridge-launcher] no fd-3 IPC channel: the bridge's vault operations and dev console tools will be unavailable");
    return () => undefined;
  }

  // child.stdio[3] is typed as Writable | Readable but the runtime object is
  // a net.Socket (Unix) or Duplex Pipe (Windows) — both support read+write.
  const duplex = sock as unknown as NodeJS.WritableStream & NodeJS.ReadableStream;

  const respond = (msg: { id: string; result?: unknown; error?: { message: string; reason?: string } }) => {
    try {
      duplex.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");
    } catch (e) {
      console.warn("[bridge-launcher] IPC write failed:", e);
    }
  };

  const handleLine = async (line: string): Promise<void> => {
    let req: JsonRpcRequest;
    try {
      req = JSON.parse(line) as JsonRpcRequest;
    } catch {
      const id = frameIdOf(line.slice(0, FRAME_HEAD_CHARS));
      if (id) respond({ id, error: { message: "request is not valid JSON", reason: "invalid_params" } });
      return;
    }
    if (!req.id || !req.method) return;

    try {
      const result = await dispatch(req.method, req.params, deps);
      respond({ id: req.id, result });
    } catch (err) {
      respond({
        id: req.id,
        error: {
          message: err instanceof Error ? err.message : String(err),
          // A vault method says why it refused, so the bridge can map it to its own error codes.
          ...(err instanceof VaultIpcError ? { reason: err.reason } : {}),
        },
      });
    }
  };

  const maxFrameChars = deps.maxFrameChars ?? MAX_FRAME_CHARS;
  const onData = createFrameReader({
    maxFrameChars,
    onFrame: (line) => void handleLine(line),
    onOversize: (head, chars) => {
      deps.audit({ eventType: "LAUNCHER_IPC_FRAME_DROPPED", chars, maxChars: maxFrameChars });
      // Answered at once when the head names the request, so the bridge fails the call instead of timing out.
      const id = frameIdOf(head);
      if (id) {
        respond({
          id,
          error: { message: `request larger than ${maxFrameChars} characters; dropped unread`, reason: "too_large" },
        });
      }
    },
  });

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
      if (isVaultMethod(method)) {
        return await serveVaultMethod(method, params, {
          app: deps.app,
          obsidian: deps.obsidian,
          audit: deps.audit,
          version: deps.version,
        });
      }
      throw new Error(`unknown launcher IPC method: ${method}`);
  }
}
