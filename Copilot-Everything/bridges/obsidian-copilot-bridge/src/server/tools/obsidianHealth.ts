import type { RuntimeContext } from "../context";
import type { BackendCapabilities } from "../../backends/backend";
import type { ToolResult } from "../../types";

/**
 * obsidian_health — diagnostic tool.
 *
 * Forces a fresh probe of the launcher IPC backend (the fd-3 pipe to obsidian-bridge-launcher, the only
 * backend since 2026-11-25) and returns a structured report. When the backend is unavailable, the report
 * holds a triaged failure mode and concrete suggested fixes. There is no silent fallback — this is the
 * canonical place to look when Obsidian operations start failing.
 *
 * Returned shape (always ok=true so the structured body always reaches the caller; the body's `status`
 * field is "healthy" | "degraded" | "down"):
 *
 *   {
 *     status: "healthy" | "degraded" | "down",
 *     launcherIpc: { available, channel, supportedOps, p95MsByOp, lastErrorAt, constraints, diagnostics },
 *     diagnosis?: {                    // present when status != "healthy"
 *       category: "config" | "connectivity" | "plugin" | "unknown",
 *       summary: string,
 *       suggestedFixes: string[],
 *       rawConstraints: string[],
 *     },
 *     security: { transportMode, corsDisabled, replayGuardEnabled, tokenEntropyBits },
 *     metrics: { ... },
 *     routing: { epochId, refreshedAt, operationMap, reasons },
 *   }
 */
export async function obsidianHealthTool(
  runtime: RuntimeContext,
  requestId: string
): Promise<ToolResult<Record<string, unknown>>> {
  const snapshot = await runtime.selector.refresh(true);
  const launcherIpc = snapshot.capabilities.launcherIpc;

  const status = computeStatus(launcherIpc);
  const diagnosis = status === "healthy" ? undefined : diagnose(launcherIpc);

  return {
    ok: true,
    data: {
      status,
      launcherIpc: summarizeBackend(launcherIpc),
      ...(diagnosis ? { diagnosis } : {}),
      security: {
        // The transport actually serving: "uds" (vault-bridge.sock) on macOS/Linux, "pipe" on
        // Windows. The loader refuses the removed TCP transport, so nothing else can render here.
        transportMode: runtime.config.transport.mode,
        corsDisabled: true,
        replayGuardEnabled: true,
        tokenEntropyBits: runtime.tokenEntropyBits,
      },
      metrics: {
        ...runtime.metrics.snapshot(),
        queue: runtime.scheduler.snapshot(),
      },
      routing: {
        epochId: snapshot.epochId,
        refreshedAt: snapshot.refreshedAt,
        operationMap: snapshot.operationMap,
        reasons: snapshot.reasons,
      },
    },
    meta: {
      requestId,
      durationMs: 0,
      epochId: snapshot.epochId,
      consistencyHint: "n/a",
    },
  };
}

function computeStatus(cap: BackendCapabilities | undefined): "healthy" | "degraded" | "down" {
  if (!cap) return "down";
  if (cap.available && cap.supportedOps.length > 0) return "healthy";
  return "down";
}

function summarizeBackend(cap: BackendCapabilities | undefined): Record<string, unknown> {
  if (!cap) {
    return {
      available: false,
      reason: "launcherIpc backend not registered",
    };
  }
  return {
    available: cap.available,
    channel: "fd-3 pipe to obsidian-bridge-launcher (no TCP port)",
    supportedOps: cap.supportedOps,
    reliabilityScore: cap.reliabilityScore,
    p95MsByOp: cap.p95MsByOp,
    lastErrorAt: cap.lastErrorAt,
    constraints: cap.constraints,
    diagnostics: cap.diagnostics,
  };
}

interface Diagnosis {
  category: "config" | "connectivity" | "plugin" | "unknown";
  summary: string;
  suggestedFixes: string[];
  rawConstraints: string[];
}

const RESTART_BRIDGE = "In Obsidian, run the Bridge Launcher's 'Restart bridge' command.";
const RELAUNCH_OBSIDIAN = "If that does not help, quit Obsidian and open it again from the Dock or Finder.";

function diagnose(cap: BackendCapabilities | undefined): Diagnosis {
  const constraints = cap?.constraints ?? ["launcherIpc backend not registered"];
  const joined = constraints.join(" | ");

  // No usable launcher pipe. Most often the bridge was started outside Obsidian (bridge-start.sh): the launcher
  // replaces such a bridge once its parent has gone (one bridge-restart.sh started), but refuses one whose
  // terminal is still open, so that one has to be stopped first. A pipe that is set but unusable needs a restart.
  if (/launcher_ipc_missing/i.test(joined)) {
    const outside = /BRIDGE_IPC_FD is not set/.test(joined);
    return {
      category: "config",
      summary: outside
        ? "This bridge was not started by obsidian-bridge-launcher, so it has no fd-3 pipe (BRIDGE_IPC_FD is not set)."
        : "This bridge's fd-3 pipe from obsidian-bridge-launcher cannot be used (BRIDGE_IPC_FD is set but unusable).",
      suggestedFixes: outside
        ? [
            `If this bridge (pid ${process.pid}) runs in a terminal (bridge-start.sh), stop it there first with Ctrl-C: the launcher refuses to replace a bridge whose terminal is still open. One that bridge-restart.sh started is replaced by 'Restart bridge' directly.`,
            RESTART_BRIDGE,
          ]
        : [RESTART_BRIDGE, RELAUNCH_OBSIDIAN],
      rawConstraints: constraints,
    };
  }

  // A launcher older than 0.2.0 serves the console methods but not the vault methods. The fix is the
  // operator's to make (a deploy changes a protected plugin), so it is worded for them, naming no command
  // for whichever agent reads this report.
  if (/launcher_too_old/i.test(joined)) {
    return {
      category: "plugin",
      summary: "obsidian-bridge-launcher predates the vault operations, so it cannot serve them.",
      suggestedFixes: [
        "Operator step: deploy obsidian-bridge-launcher 0.2.0 or later and re-bless it in obsidianwatch, as the vault-ipc decision record (2026-11-25) describes.",
        "Then quit Obsidian and open it again from the Dock, so the new launcher spawns the bridge.",
      ],
      rawConstraints: constraints,
    };
  }

  // The launcher answering this bridge's pipe runs in a different vault from the one this bridge guards, or
  // did not say which vault it serves.
  if (/vault_mismatch|vault_unverified/i.test(joined)) {
    return {
      category: "config",
      summary: "obsidian-bridge-launcher serves a different vault from this bridge's allowedVaultRoots[0], or did not name its vault.",
      suggestedFixes: [
        "Enable obsidian-bridge-launcher only in the vault named in the bridge config's allowedVaultRoots, or correct that config.",
        RESTART_BRIDGE,
      ],
      rawConstraints: constraints,
    };
  }

  // The pipe exists but the launcher did not answer, or the pipe closed.
  if (/probe_failed|timeout|closed/i.test(joined)) {
    return {
      category: "connectivity",
      summary: "The launcher did not answer on the fd-3 pipe.",
      suggestedFixes: [RESTART_BRIDGE, RELAUNCH_OBSIDIAN],
      rawConstraints: constraints,
    };
  }

  // Unknown failure mode — surface raw constraints.
  return {
    category: "unknown",
    summary: "The launcher IPC backend is unavailable for an unrecognized reason.",
    suggestedFixes: [
      "Inspect rawConstraints for the underlying error.",
      "Check the bridge daemon log for context — see config.logging.file in obsidian-cli-mcp.local.json.",
      RELAUNCH_OBSIDIAN,
    ],
    rawConstraints: constraints,
  };
}
