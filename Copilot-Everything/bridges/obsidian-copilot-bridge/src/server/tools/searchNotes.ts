import { z } from "zod";
import type { RuntimeContext } from "../context";
import type { BackendId, ToolResult } from "../../types";
import { executeBackendOperation, parseJsonOutput } from "./common";
import { validateSchema, searchResultSchema } from "../../parsing/schemas";

const schema = z.object({
  vault: z.string().min(1),
  query: z.string().min(1),
  path: z.string().optional(),
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
        path: payload.path,
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
