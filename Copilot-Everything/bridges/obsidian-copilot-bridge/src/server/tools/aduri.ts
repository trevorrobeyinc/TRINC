/**
 * Advanced URI parity tools.
 *
 * These give every Advanced URI capability an HMAC-authenticated equivalent
 * routed through the bridge → InprocPluginBackend → claude-mcp-inproc plugin
 * chain. The Advanced URI plugin's obsidian:// URL handler remains
 * un-authenticated by design (URL schemes can't carry auth), so callers MUST
 * use these tools instead — never fire raw obsidian://advanced-uri?... URLs.
 *
 * Routing trick: each tool calls executeBackendOperation with operation
 * "execute_command" so it reuses the existing routing/queue/lock machinery,
 * but injects input.__pluginTool which InprocPluginBackend honors as an
 * override for the plugin-side tool name. The plugin's dispatch switch sees
 * tool="obsidian_aduri_*" and routes to the matching dispatchAduri* method.
 *
 * INTENTIONALLY NOT exposed: handleEval (arbitrary JS in renderer = RCE),
 * handleBookmarks, handleCanvas, handleCopyFileURI, handleOpenSettings,
 * handlePluginManagement, handleUpdatePlugins (admin/destructive — out of
 * scope for the read/write workflow auth surface).
 */

import { z } from "zod";
import type { RuntimeContext } from "../context";
import type { BackendId, ToolResult } from "../../types";
import { executeBackendOperation, parseJsonOutput } from "./common";

function aduriCall<T>(
  runtime: RuntimeContext,
  requestId: string,
  epochId: number | undefined,
  backendHint: BackendId | undefined,
  pluginTool: string,
  payload: Record<string, unknown>,
  lane: "interactive" | "mutating"
): Promise<ToolResult<T>> {
  return executeBackendOperation<T>(
    runtime,
    {
      requestId,
      operation: "execute_command",
      epochId,
      backendHint,
      input: { ...payload, __pluginTool: pluginTool },
    },
    (stdout) => parseJsonOutput<T>(stdout),
    lane
  );
}

// ---- open ----

const openSchema = z.object({
  vault: z.string().min(1).optional(),
  filepath: z.string().min(1),
  heading: z.string().optional(),
  block: z.string().optional(),
  line: z.number().int().nonnegative().optional(),
  column: z.number().int().nonnegative().optional(),
  mode: z.enum(["replace", "newPane", "newpane", "tab"]).optional(),
});

export async function aduriOpenTool(
  runtime: RuntimeContext, requestId: string, epochId: number | undefined,
  backendHint: BackendId | undefined, input: unknown
): Promise<ToolResult<{ opened: boolean; filepath: string; positioned: boolean }>> {
  const p = openSchema.parse(input);
  return aduriCall(runtime, requestId, epochId, backendHint, "obsidian_aduri_open", { ...p }, "interactive");
}

// ---- write (modes: overwrite | append | prepend | new) ----

const writeSchema = z.object({
  vault: z.string().min(1).optional(),
  filepath: z.string().min(1),
  data: z.string().default(""),
  mode: z.enum(["overwrite", "append", "prepend", "new"]).default("overwrite"),
});

export async function aduriWriteTool(
  runtime: RuntimeContext, requestId: string, epochId: number | undefined,
  backendHint: BackendId | undefined, input: unknown
): Promise<ToolResult<{ written: boolean; filepath: string; mode: string }>> {
  if (runtime.config.readOnlyMode) {
    return {
      ok: false,
      error: { code: "NO_CAPABLE_BACKEND", message: "Server is in read-only mode.", retryable: false },
      meta: { requestId, durationMs: 0 },
    };
  }
  const p = writeSchema.parse(input);
  return aduriCall(runtime, requestId, epochId, backendHint, "obsidian_aduri_write", { ...p }, "mutating");
}

// ---- frontmatter get / set ----

const frontmatterGetSchema = z.object({
  vault: z.string().min(1).optional(),
  filepath: z.string().min(1),
  key: z.string().min(1).optional(),
});

export async function aduriFrontmatterGetTool(
  runtime: RuntimeContext, requestId: string, epochId: number | undefined,
  backendHint: BackendId | undefined, input: unknown
): Promise<ToolResult<{ filepath: string; key?: string; value?: unknown; frontmatter?: Record<string, unknown> }>> {
  const p = frontmatterGetSchema.parse(input);
  return aduriCall(runtime, requestId, epochId, backendHint, "obsidian_aduri_frontmatter_get", { ...p }, "interactive");
}

const frontmatterSetSchema = z.object({
  vault: z.string().min(1).optional(),
  filepath: z.string().min(1),
  key: z.string().min(1),
  value: z.unknown().optional(),
  remove: z.boolean().optional(),
});

export async function aduriFrontmatterSetTool(
  runtime: RuntimeContext, requestId: string, epochId: number | undefined,
  backendHint: BackendId | undefined, input: unknown
): Promise<ToolResult<{ filepath: string; key: string; mutated: boolean }>> {
  if (runtime.config.readOnlyMode) {
    return {
      ok: false,
      error: { code: "NO_CAPABLE_BACKEND", message: "Server is in read-only mode.", retryable: false },
      meta: { requestId, durationMs: 0 },
    };
  }
  const p = frontmatterSetSchema.parse(input);
  return aduriCall(runtime, requestId, epochId, backendHint, "obsidian_aduri_frontmatter_set", { ...p }, "mutating");
}

// ---- file_exists ----

const fileExistsSchema = z.object({
  vault: z.string().min(1).optional(),
  filepath: z.string().min(1),
});

export async function aduriFileExistsTool(
  runtime: RuntimeContext, requestId: string, epochId: number | undefined,
  backendHint: BackendId | undefined, input: unknown
): Promise<ToolResult<{ filepath: string; exists: boolean; isFile: boolean; isFolder: boolean }>> {
  const p = fileExistsSchema.parse(input);
  return aduriCall(runtime, requestId, epochId, backendHint, "obsidian_aduri_file_exists", { ...p }, "interactive");
}

// ---- workspace switch / save ----

const workspaceSchema = z.object({
  vault: z.string().min(1).optional(),
  workspace: z.string().min(1),
  save: z.boolean().optional(),
});

export async function aduriWorkspaceTool(
  runtime: RuntimeContext, requestId: string, epochId: number | undefined,
  backendHint: BackendId | undefined, input: unknown
): Promise<ToolResult<{ workspace: string; loaded?: boolean; saved?: boolean }>> {
  const p = workspaceSchema.parse(input);
  // workspace mutate (save) vs read (load) — both are interactive enough; treat as interactive.
  return aduriCall(runtime, requestId, epochId, backendHint, "obsidian_aduri_workspace", { ...p }, "interactive");
}

// ---- search and replace ----

const searchReplaceSchema = z.object({
  vault: z.string().min(1).optional(),
  filepath: z.string().min(1),
  search: z.string().min(1),
  replace: z.string().default(""),
  regex: z.boolean().optional(),
});

export async function aduriSearchReplaceTool(
  runtime: RuntimeContext, requestId: string, epochId: number | undefined,
  backendHint: BackendId | undefined, input: unknown
): Promise<ToolResult<{ filepath: string; replacements: number; regex: boolean }>> {
  if (runtime.config.readOnlyMode) {
    return {
      ok: false,
      error: { code: "NO_CAPABLE_BACKEND", message: "Server is in read-only mode.", retryable: false },
      meta: { requestId, durationMs: 0 },
    };
  }
  const p = searchReplaceSchema.parse(input);
  return aduriCall(runtime, requestId, epochId, backendHint, "obsidian_aduri_search_replace", { ...p }, "mutating");
}
