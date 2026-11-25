// research_notify over the vault bridge's Unix socket (bridges-uds, 2026-11-24).
//
// The post-run chain's chat bubble: Command Center tells the vault bridge (the canonical obsidian-copilot-bridge,
// :8798 until bridges-uds) that a run finished, and its emit-only research_notify tool renders a `research_arrived`
// bubble in the Copilot chat. This lives apart from openclaw-runner.ts so node --test can load it: it imports only
// node built-ins and the bridges' uds-listener.ts (with explicit .ts specifiers), never "obsidian".
//
// The request goes through requestOverSocket, the only way this package makes a bridge request. It checks the exact
// path it then uses (vault-bridge.sock directly in the private run directory, every level of the directory chain,
// the socket's owner and mode) and pins the connection to that socket. A trust refusal or a missing socket (code
// ENOENT: the bridge is not running) rejects before anything is sent. There is no TCP path, no retry and no CA:
// nothing on the socket uses TLS.
import { createHash, randomUUID } from "node:crypto";
import type { ClientRequest, IncomingMessage } from "node:http";
import { requestOverSocket, SOCKET_NAMES, socketPathFor } from "../bridge/uds-listener.ts";

/** How long research_notify waits for the vault bridge before it destroys the request and gives up. */
export const RESEARCH_NOTIFY_TIMEOUT_MS = 10_000;

export interface ResearchNotifyInput {
  /** Identifier for the event (a label; e.g. the workflow_id). */
  taskId: string;
  /** Human-readable bubble title. */
  title: string;
  /** Run outcome (added 2026-08-20 — failures now notify too, not just successes). */
  status?: "success" | "failure";
  /** Short error description when status is "failure" (clipped to 300 characters). */
  error?: string;
  /** Vault-relative path to the note the chat bubble should link to (optional). */
  mainNotePath?: string;
  /** Vault display name (optional). */
  vault?: string;
}

/** The request body: {tool: "research_notify", input}, each optional field present only when it is set. */
export function researchNotifyBody(input: ResearchNotifyInput): string {
  return JSON.stringify({
    tool: "research_notify",
    input: {
      taskId: input.taskId,
      title: input.title,
      ...(input.status ? { status: input.status } : {}),
      ...(input.error ? { error: input.error.slice(0, 300) } : {}),
      ...(input.mainNotePath ? { mainNotePath: input.mainNotePath } : {}),
      ...(input.vault ? { vault: input.vault } : {}),
    },
  });
}

/**
 * Content-Type and Content-Length, plus the five auth and replay headers the vault bridge checks: Authorization
 * (Bearer), x-mcp-token, x-mcp-timestamp, x-mcp-nonce and x-mcp-body-sha256 (of these exact body bytes).
 */
export function researchNotifyHeaders(
  body: string,
  token: string,
  now: number = Date.now(),
  nonce: string = randomUUID()
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Content-Length": String(Buffer.byteLength(body)),
    Authorization: `Bearer ${token}`,
    "x-mcp-token": token,
    "x-mcp-timestamp": String(now),
    "x-mcp-nonce": nonce,
    "x-mcp-body-sha256": createHash("sha256").update(body, "utf8").digest("hex"),
  };
}

export interface PostResearchNotifyOptions {
  /** Home that holds the run directory. Tests only (a short /tmp/uds-* home); callers leave it unset. */
  home?: string;
  /** Tests only; callers leave it unset and get RESEARCH_NOTIFY_TIMEOUT_MS. */
  timeoutMs?: number;
}

/**
 * POST `body` with `headers` to /mcp/tool on vault-bridge.sock. Resolves when the bridge answers 200 with
 * {ok: true}. Rejects on any other answer; on a trust refusal or a missing socket (a UdsListenerError, thrown
 * before anything is sent); on a connection error; and when no answer arrives within the timeout, in which case
 * the request is destroyed.
 */
export function postResearchNotify(
  body: string,
  headers: Record<string, string>,
  opts: PostResearchNotifyOptions = {}
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? RESEARCH_NOTIFY_TIMEOUT_MS;
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (err: Error | null): void => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve();
    };
    let req: ClientRequest;
    try {
      req = requestOverSocket(
        socketPathFor(SOCKET_NAMES.vaultBridge, opts.home),
        SOCKET_NAMES.vaultBridge,
        { method: "POST", path: "/mcp/tool", timeout: timeoutMs, headers },
        opts.home
      );
    } catch (err) {
      finish(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    // The helper's socket pin connects with { path, timeout }, so the request's `timeout` option alone arms the
    // socket's timer. req.setTimeout stays as belt and braces: it re-arms that same timer, and the request still
    // sees one 'timeout' event (measured on Node 22.13.1).
    req.setTimeout(timeoutMs);
    req.on("timeout", () => {
      req.destroy(new Error(`research_notify: no answer from the vault bridge within ${timeoutMs} ms`));
    });
    req.on("error", (err: Error) => finish(err));
    req.on("response", (res: IncomingMessage) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json: { ok?: boolean } | null = null;
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
        if ((res.statusCode || 0) === 200 && json?.ok === true) {
          finish(null);
        } else {
          finish(new Error(`research_notify failed (HTTP ${res.statusCode}): ${text.slice(0, 200)}`));
        }
      });
      res.on("close", () => {
        finish(new Error("research_notify: the vault bridge closed the connection before its answer ended"));
      });
    });
    req.on("close", () => {
      finish(new Error("research_notify: the connection closed before the vault bridge answered"));
    });
    req.end(body);
  });
}
