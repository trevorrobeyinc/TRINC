import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Append-only security AUDIT sink (distinct from the operational StructuredLogger).
 *
 * Emits one JSON object per line describing security-relevant events (tool calls,
 * subprocess spawns, auth/allowlist denials) so the native OSSEC/Falcon detection
 * plane can tail it. Written to the INTERNAL disk (NOT the external repo volume,
 * which disksleeps and would create blind spots in the audit trail). Never throws.
 */

export type AuditEventType =
  | "TOOL_CALLED"
  | "TOOL_COMPLETED"
  | "TOOL_FAILED"
  | "EXEC_START"
  | "EXEC_EXIT"
  | "READ_ONLY_DENY"
  | "ALLOWLIST_DENY"
  | "AUTH_FAIL"
  | "REPLAY_REJECT"
  | "BROWSER_REJECT"
  // bridges-uds (2026-11-24): the daemon's socket. SOCKET_LOST: the published vault-bridge.sock was
  // removed or replaced while the daemon served it (it then exits 1). SOCKET_REFUSED: the listener
  // refused to start; errorCode is the UdsListenerError code (ALREADY_SERVED, RUN_DIR_MODE, ...).
  | "SOCKET_LOST"
  | "SOCKET_REFUSED";

export interface AuditEvent {
  eventType: AuditEventType;
  requestId?: string;
  correlationId?: string;
  tool?: string;
  operation?: string;
  result?: "success" | "failure";
  errorCode?: string;
  source?: string;
  durationMs?: number;
  [key: string]: unknown;
}

const SENSITIVE = /token|secret|password|api[_-]?key|authorization|bearer|credential/i;

function redact(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = SENSITIVE.test(k) ? "[redacted]" : v;
  }
  return out;
}

export function defaultAuditPath(): string {
  const override = process.env.TREVCLAW_AUDIT_LOG;
  if (override && override.trim()) {
    return path.resolve(override.trim());
  }
  return path.join(os.homedir(), "Library", "Logs", "trevclaw", "audit.jsonl");
}

export class AuditLogger {
  private readonly filePath: string;

  constructor(filePath: string = defaultAuditPath()) {
    this.filePath = filePath;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    } catch {
      // mkdir failure is non-fatal; emit() will fall back to stderr.
    }
  }

  emit(event: AuditEvent): void {
    const entry = {
      ts: new Date().toISOString(),
      kind: "trevclaw_audit",
      ...redact(event as Record<string, unknown>),
    };
    const line = `${JSON.stringify(entry)}\n`;
    try {
      fs.appendFileSync(this.filePath, line);
    } catch (err) {
      try {
        process.stderr.write(`[audit] appendFileSync failed for ${this.filePath}: ${(err as Error).message}\n`);
        process.stderr.write(line);
      } catch {
        // last-resort: never throw out of emit()
      }
    }
  }
}

/** Process-wide singleton sink (cross-cutting; configured via TREVCLAW_AUDIT_LOG). */
export const auditLog = new AuditLogger();
