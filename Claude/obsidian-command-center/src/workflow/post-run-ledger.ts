/**
 * Post-run stage ledger (added 2026-10-07).
 *
 * Why this exists. `obsidian_openclaw_status` used to be unable to say whether a run's chain was
 * finished: the engine's workflow.json goes terminal BEFORE the plugin's enrichment stages (vault
 * note rehydrate, chat bubble, Miyo index, Zettelkasten linking, research-memory ingest, open note)
 * run, and those stages only wrote to the console. A caller that polled `status` and saw
 * "completed" could not tell "the chain is done" from "the chain has not started". An external
 * agent (Claude Code, dispatching through this bridge) needs that answer before it starts the next
 * run or reports success.
 *
 * Pure module: no Obsidian imports, no I/O, no timers. The clock is injectable so the unit tests
 * (test/post-run-ledger.test.ts) are deterministic. Keep the syntax erasable (no enums, no
 * namespaces, no parameter properties) so Node's --experimental-strip-types can run it directly.
 */

export const STAGE_NAMES = ["notes", "notify", "miyo", "zk", "memory", "open"] as const;
export type StageName = (typeof STAGE_NAMES)[number];
export type StageState = "pending" | "running" | "ok" | "skipped" | "failed";

export interface StageEntry {
  state: StageState;
  /** Short human reason. Bounded and control-character-free: it is returned to remote callers. */
  detail?: string;
  /** ISO-8601 time of the last transition. */
  at: string;
}

export interface PostRunLedger {
  workflowId: string;
  stages: Record<StageName, StageEntry>;
}

export interface LedgerSummary {
  workflow_id: string;
  /** True only when every stage is terminal (ok, skipped or failed). */
  done: boolean;
  /** The first stage still pending or running, or null when done. */
  current: StageName | null;
  stages: Record<StageName, { state: StageState; detail?: string; at: string }>;
}

const MAX_DETAIL = 200;

function isoNow(): string {
  return new Date().toISOString();
}

function isTerminal(state: StageState): boolean {
  return state === "ok" || state === "skipped" || state === "failed";
}

function cleanDetail(detail: string | undefined): string | undefined {
  if (detail === undefined) return undefined;
  // eslint-disable-next-line no-control-regex
  const flat = detail.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  if (flat === "") return undefined;
  return flat.length > MAX_DETAIL ? `${flat.slice(0, MAX_DETAIL - 1)}…` : flat;
}

export function createLedger(workflowId: string, now: () => string = isoNow): PostRunLedger {
  const at = now();
  const stages = {} as Record<StageName, StageEntry>;
  for (const name of STAGE_NAMES) stages[name] = { state: "pending", at };
  return { workflowId, stages };
}

/** Record a stage transition in place. A terminal stage is never reopened. */
export function markStage(
  ledger: PostRunLedger,
  stage: StageName,
  state: StageState,
  detail?: string,
  now: () => string = isoNow
): void {
  const entry = ledger.stages[stage];
  if (isTerminal(entry.state)) return;
  const cleaned = cleanDetail(detail);
  entry.state = state;
  entry.at = now();
  if (cleaned === undefined) delete entry.detail;
  else entry.detail = cleaned;
}

/**
 * Close every stage that never started. Called when the completion handler itself throws: without it
 * those stages would sit at "pending" forever and `done` would never become true. Stages that are
 * already "running" are left alone, because the research-memory ingest is deliberately fire-and-forget
 * and settles its own entry when its promise resolves.
 */
export function abortPending(ledger: PostRunLedger, reason: string, now: () => string = isoNow): void {
  for (const name of STAGE_NAMES) {
    if (ledger.stages[name].state === "pending") markStage(ledger, name, "failed", reason, now);
  }
}

export function isDone(ledger: PostRunLedger): boolean {
  return STAGE_NAMES.every((name) => isTerminal(ledger.stages[name].state));
}

export function summarizeLedger(ledger: PostRunLedger): LedgerSummary {
  const stages = {} as LedgerSummary["stages"];
  let current: StageName | null = null;
  for (const name of STAGE_NAMES) {
    const entry = ledger.stages[name];
    stages[name] = entry.detail === undefined
      ? { state: entry.state, at: entry.at }
      : { state: entry.state, detail: entry.detail, at: entry.at };
    if (current === null && !isTerminal(entry.state)) current = name;
  }
  return { workflow_id: ledger.workflowId, done: current === null, current, stages };
}
