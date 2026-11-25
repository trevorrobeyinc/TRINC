import type { RuntimeContext } from "../context";
import type { BackendCapabilities } from "../../backends/backend";
import type { ToolResult } from "../../types";

/**
 * obsidian_health — diagnostic tool.
 *
 * Forces a fresh probe of the REST API backend and returns a structured
 * report. When REST API is unavailable, the report contains a triaged
 * failure mode and concrete suggested fixes so the underlying issue can
 * be debugged. There is no silent CLI fallback — this is the canonical
 * place to look when Obsidian operations start failing.
 *
 * Returned shape (always ok=true so the structured body always reaches
 * the caller; the body's `status` field is "healthy" | "degraded" | "down"):
 *
 *   {
 *     status: "healthy" | "degraded" | "down",
 *     restApi: { available, endpoint, supportedOps, p95MsByOp, lastErrorAt, constraints },
 *     diagnosis?: {                    // present when status != "healthy"
 *       category: "config" | "auth" | "connectivity" | "plugin" | "unknown",
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
  const restApi = snapshot.capabilities.restApi;

  const status = computeStatus(restApi);
  const diagnosis = status === "healthy" ? undefined : diagnose(restApi);

  return {
    ok: true,
    data: {
      status,
      restApi: summarizeBackend(restApi),
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
      reason: "restApi backend not registered",
    };
  }
  return {
    available: cap.available,
    endpoint: process.env.OBSIDIAN_REST_API_BASE ?? "https://127.0.0.1:27124",
    supportedOps: cap.supportedOps,
    reliabilityScore: cap.reliabilityScore,
    p95MsByOp: cap.p95MsByOp,
    lastErrorAt: cap.lastErrorAt,
    constraints: cap.constraints,
    diagnostics: cap.diagnostics,
  };
}

interface Diagnosis {
  category: "config" | "auth" | "connectivity" | "plugin" | "unknown";
  summary: string;
  suggestedFixes: string[];
  rawConstraints: string[];
}

function diagnose(cap: BackendCapabilities | undefined): Diagnosis {
  const constraints = cap?.constraints ?? ["restApi backend not registered"];
  const joined = constraints.join(" | ");

  // Config errors — env vars not set.
  if (/config_invalid/i.test(joined)) {
    if (/OBSIDIAN_REST_API_KEY/i.test(joined)) {
      return {
        category: "config",
        summary: "OBSIDIAN_REST_API_KEY is not set in the daemon environment.",
        suggestedFixes: [
          "Confirm bridges/obsidian-copilot-bridge/.env.local contains OBSIDIAN_REST_API_KEY=<your-key> (mode 0600).",
          "If the daemon is spawned by the obsidian-bridge-launcher Obsidian plugin, ensure the plugin loads .env.local from the bridge directory before spawn.",
          "Restart Obsidian to respawn the daemon with the loaded env.",
        ],
        rawConstraints: constraints,
      };
    }
    if (/OBSIDIAN_REST_API_CERT_PATH/i.test(joined)) {
      return {
        category: "config",
        summary: "REST API certificate path is missing or unreadable.",
        suggestedFixes: [
          "Confirm bridges/obsidian-copilot-bridge/config/obsidian-local-rest-api.crt exists and is mode 0644.",
          "If the cert was rotated, re-export it from the Local REST API plugin's settings tab and replace the file.",
          "Update OBSIDIAN_REST_API_CERT_PATH in .env.local if the cert lives elsewhere.",
        ],
        rawConstraints: constraints,
      };
    }
    return {
      category: "config",
      summary: "Daemon REST API config is invalid (key, cert, or base URL).",
      suggestedFixes: [
        "Inspect bridges/obsidian-copilot-bridge/.env.local for missing variables.",
      ],
      rawConstraints: constraints,
    };
  }

  // Connection refused / network error.
  if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|request timeout/i.test(joined)) {
    return {
      category: "connectivity",
      summary: "Cannot reach the Local REST API plugin at https://127.0.0.1:27124.",
      suggestedFixes: [
        "Open Obsidian.app — the Local REST API plugin only runs while Obsidian is running.",
        "Settings → Community plugins → confirm 'Local REST API' is enabled.",
        "Settings → Community plugins → Local REST API → confirm HTTPS server is enabled on port 27124.",
        "Try: curl -k https://127.0.0.1:27124/ — non-zero exit means the listener is down.",
      ],
      rawConstraints: constraints,
    };
  }

  // Auth failure (401/403 or authenticated:false).
  if (/probe_status:(401|403)|authenticated:false/i.test(joined)) {
    return {
      category: "auth",
      summary: "REST API plugin rejected the API key.",
      suggestedFixes: [
        "Open Obsidian → Settings → Community plugins → Local REST API → API Key — copy the current key.",
        "Update OBSIDIAN_REST_API_KEY in bridges/obsidian-copilot-bridge/.env.local with the copied value.",
        "Restart Obsidian (and therefore the bridge daemon) to reload the env.",
      ],
      rawConstraints: constraints,
    };
  }

  // Other non-2xx HTTP statuses.
  const statusMatch = joined.match(/probe_status:(\d{3})/i);
  if (statusMatch) {
    return {
      category: "plugin",
      summary: `REST API plugin returned HTTP ${statusMatch[1]} on the probe endpoint.`,
      suggestedFixes: [
        "Check Obsidian's developer console (Cmd+Opt+I) for plugin errors.",
        "Settings → Community plugins → toggle Local REST API off then on to reset its listener.",
        "If the issue persists, update the plugin to the latest version.",
      ],
      rawConstraints: constraints,
    };
  }

  // Self-signed cert mismatch (NODE_EXTRA_CA_CERTS not set or cert rotated).
  if (/self.signed|UNABLE_TO_VERIFY|CERT_/i.test(joined)) {
    return {
      category: "config",
      summary: "TLS handshake failed — the daemon does not trust the REST API plugin's self-signed cert.",
      suggestedFixes: [
        "Re-export the cert from the Local REST API plugin's settings tab.",
        "Replace bridges/obsidian-copilot-bridge/config/obsidian-local-rest-api.crt with the new file.",
        "Confirm OBSIDIAN_REST_API_CERT_PATH in .env.local points at the file.",
        "Restart Obsidian to respawn the daemon with the new cert.",
      ],
      rawConstraints: constraints,
    };
  }

  // Unknown failure mode — surface raw constraints.
  return {
    category: "unknown",
    summary: "REST API backend is unavailable for an unrecognized reason.",
    suggestedFixes: [
      "Inspect rawConstraints for the underlying error.",
      "Check the bridge daemon log for context — see config.logging.file in obsidian-cli-mcp.local.json.",
      "Quit and reopen Obsidian to respawn the daemon.",
    ],
    rawConstraints: constraints,
  };
}
