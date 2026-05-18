/**
 * BackendEmulatorService — RETIRED 2026-05-09.
 *
 * The Copilot Backend Emulator at http://127.0.0.1:8789 was retired Phase D
 * (2026-04-11). The Raycast AI-summarize and PDF-summarize flows that
 * depended on it (`aiSummarizeFlow.ts`, `pdfSummarizeFlow.ts`) have not yet
 * been migrated to a replacement LLM provider (Raycast's built-in `AI`,
 * Anthropic API direct, etc.).
 *
 * This stub exists ONLY to keep the Raycast extension's TypeScript build
 * compiling so the migrated commands (Append Task, Append to Daily Note,
 * Open in New Pane, etc.) can be packaged. Any code path that constructs
 * this class and calls a method will throw with a clear retirement message.
 *
 * To restore aiSummarize / pdfSummarize functionality:
 *   - Rewrite the flows to use `AI.ask(...)` from `@raycast/api`, OR
 *   - Point at Anthropic's API directly via `fetch`, OR
 *   - Use the canonical bridge's `obsidian_execute_command` to trigger the
 *     Copilot plugin's in-vault summarize command (which is already done
 *     by `aiSummarizeCommandFlow.ts`).
 */

const RETIRED_MESSAGE =
  "BackendEmulatorService was retired 2026-05-09 along with the Copilot Backend Emulator at :8789. " +
  "The Raycast LLM-summarize flows have not been migrated to a replacement provider. " +
  "See src/api/backend-emulator/backendEmulator.service.ts header for migration options.";

export interface AgentTurnRequest {
  [key: string]: unknown;
}

export interface ParseDocResult {
  [key: string]: unknown;
}

export class BackendEmulatorService {
  // Return types are `any` because every method throws at runtime; callers'
  // dead-code branches (which would .trim() / index into the result) only
  // need to satisfy the type checker, not run.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async runAgentTurn(_req: AgentTurnRequest): Promise<any> {
    throw new Error(RETIRED_MESSAGE);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async parseDoc(_pdfPath: string): Promise<any> {
    throw new Error(RETIRED_MESSAGE);
  }
}
