import { z } from "zod";
import type { RuntimeContext } from "../context";
import type { BackendId, ToolResult } from "../../types";

const schema = z.object({
  query: z.string().min(1),
  vault: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(20).default(5),
});

interface MiyoSearchResult {
  path?: string;
  score?: number;
  chunk_text?: string;
}

interface MiyoSearchResponse {
  results?: MiyoSearchResult[];
}

export async function miyoSearchContextTool(
  runtime: RuntimeContext,
  requestId: string,
  _epochId: number | undefined,
  _backendHint: BackendId | undefined,
  input: unknown
): Promise<ToolResult<MiyoSearchResponse>> {
  const startedAt = Date.now();

  try {
    const payload = schema.parse(input);
    const vault =
      payload.vault ||
      runtime.config.allowedVaultRoots[0]?.trim();
    if (!vault) {
      throw new Error(
        "Miyo search requires a vault value. Provide input.vault or configure allowedVaultRoots."
      );
    }

    const baseUrl = await resolveMiyoBaseUrl();
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    const miyoAuth = process.env.MIYO_AUTH?.trim();
    if (miyoAuth) {
      headers.Authorization = `Bearer ${miyoAuth}`;
      headers["X-API-Key"] = miyoAuth;
    }

    const response = await fetch(new URL("/v0/search", `${baseUrl}/`), {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: payload.query,
        vault,
        limit: payload.limit,
      }),
    });
    const text = await response.text();

    if (!response.ok) {
      return {
        ok: false,
        error: {
          code: "MIYO_REQUEST_FAILED",
          message: `Miyo search failed with status ${response.status}: ${text.slice(0, 500)}`,
          retryable: response.status >= 500,
        },
        meta: {
          requestId,
          durationMs: Date.now() - startedAt,
        },
      };
    }

    let data: MiyoSearchResponse = {};
    try {
      data = JSON.parse(text) as MiyoSearchResponse;
    } catch {
      data = { results: [] };
    }

    return {
      ok: true,
      data,
      meta: {
        requestId,
        durationMs: Date.now() - startedAt,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "MIYO_CONTEXT_TOOL_FAILED",
        message: error instanceof Error ? error.message : String(error),
        retryable: false,
      },
      meta: {
        requestId,
        durationMs: Date.now() - startedAt,
      },
    };
  }
}

async function resolveMiyoBaseUrl(): Promise<string> {
  // Default routes through the in-monorepo HTTPS proxy at :8743
  // (com.trevorrobey.miyo-tls-proxy launchd unit, see root CLAUDE.md
  // "Wrapped in HTTPS by in-monorepo proxies"). Do NOT default to
  // service.json + plaintext — that bypasses the proxy.
  const configured = process.env.MIYO_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  return "https://127.0.0.1:8743";
}
