import { z } from "zod";
import type { RuntimeContext } from "../context";
import type { BackendId, ToolResult } from "../../types";
import { executeBackendOperation, parseJsonOutput } from "./common";
import { validateSchema, searchResultSchema } from "../../parsing/schemas";
import { MAX_SEARCH_QUERY_CHARS, MAX_VAULT_PATH_CHARS } from "../../backends/launcherIpcBackend";
import { guardVaultRelativePath } from "../../fs/pathGuard";

/**
 * The folder a search is narrowed to, checked by this bridge's guard before the launcher sees it: the guard
 * resolves links, so a link into a hidden folder is refused here, and a typo fails as PATH_INVALID instead of
 * reaching the launcher, whose refusal of a path is audited as a guard bypass. The spelling rules are the
 * launcher's (obsidian-bridge-launcher src/vaultIpc.ts, normalizeSearchFolder), kept identical:
 * launcherContract.spec.ts compares the two. undefined means the whole vault; whether the folder exists, in which
 * letter case, is the launcher's to say.
 */
export function guardSearchFolder(runtime: RuntimeContext, raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const folder = raw
    .trim()
    .replace(/^(?:\.?\/+)+/, "")
    .replace(/(?:\/\.?)+$/, "");
  if (folder === "" || folder === ".") return undefined;
  return guardVaultRelativePath(runtime.config.allowedVaultRoots[0], folder).relativePath;
}

const schema = z.object({
  vault: z.string().min(1),
  // The launcher refuses a blank or over-long query; refusing it here names the field.
  query: z
    .string()
    .min(1)
    .max(MAX_SEARCH_QUERY_CHARS)
    .refine((query) => query.trim().length > 0, { message: "query is blank" }),
  path: z.string().max(MAX_VAULT_PATH_CHARS).optional(),
  limit: z.number().int().positive().max(500).optional(),
  caseSensitive: z.boolean().optional(),
});

function normalizeSearchMatches(value: unknown): unknown {
  if (value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    return value;
  }
  return value.map((entry) => {
    if (typeof entry === "string") {
      return { path: entry };
    }
    return entry;
  });
}

function parseNoMatchesText(stdout: string): Array<{ path: string; line?: number; text?: string }> | null {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return null;
  }

  return /^No matches found\.?$/i.test(lines.at(-1) ?? "") ? [] : null;
}

export async function searchNotesTool(
  runtime: RuntimeContext,
  requestId: string,
  epochId: number | undefined,
  backendHint: BackendId | undefined,
  input: unknown
): Promise<ToolResult<{ query: string; matches: Array<{ path: string; line?: number; text?: string }> }>> {
  const payload = schema.parse(input);
  const folder = guardSearchFolder(runtime, payload.path);

  return await executeBackendOperation(
    runtime,
    {
      requestId,
      operation: "search_notes",
      epochId,
      backendHint,
      input: {
        vault: payload.vault,
        query: payload.query,
        path: folder,
        limit: payload.limit,
        case: payload.caseSensitive,
        format: "json",
      },
    },
    (stdout) => {
      const emptyMatches = parseNoMatchesText(stdout);
      if (emptyMatches) {
        return {
          query: payload.query,
          matches: emptyMatches,
        };
      }

      const parsed = parseJsonOutput<unknown>(stdout);
      const normalized = normalizeSearchMatches(parsed);
      const matches = validateSchema(searchResultSchema, normalized) as Array<{ path: string; line?: number; text?: string }>;
      return {
        query: payload.query,
        matches,
      };
    },
    "interactive"
  );
}
