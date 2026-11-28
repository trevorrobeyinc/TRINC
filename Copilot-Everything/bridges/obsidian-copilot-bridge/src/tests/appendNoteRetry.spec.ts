import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Duplex, PassThrough } from "node:stream";
import { afterAll, describe, expect, it } from "vitest";
import { appendNoteTool } from "../server/tools/appendNote";
import { BackendSelector } from "../backends/backendSelector";
import { LauncherIpcBackend, REQUIRED_LAUNCHER_METHODS, type LauncherIpcRequester } from "../backends/launcherIpcBackend";
import { LauncherIpcClient, LauncherIpcError } from "../server/launcherIpc";
import { IdempotencyLedger } from "../idempotency/ledger";
import { Metrics } from "../observability/metrics";
import { createWriteLocker, ReadAfterWritePins } from "../server/context";
import { AppError } from "../server/errors";
import { ERROR_CODES } from "../server/errorCodes";

// A same-key retry of obsidian_append_note after a failed first attempt, with nothing mocked between the tool and
// the pipe: the real selector, LauncherIpcBackend, LauncherIpcClient where the pipe matters, and the durable SQLite
// ledger. Until 2026-11-27 a first attempt that failed before writing (NO_CAPABLE_BACKEND in the cold-start window,
// a stale epoch, a closed pipe) left its key STARTED, and every later call with that key ended
// AMBIGUOUS_WRITE_REQUIRES_DECISION, retryable false, for good. A failure that may have written must still never
// write twice.

const root = fs.mkdtempSync(path.join(os.tmpdir(), "append-retry-"));

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

let ledgers = 0;
function ledgerFile(): string {
  ledgers += 1;
  return path.join(root, `ledger-${ledgers}.sqlite`);
}

const NOTE = "Inbox/log.md";
const INFO = { vault: "V", version: "0.2.0", methods: ["vault.info", ...REQUIRED_LAUNCHER_METHODS] };

function callWith(key: string) {
  return { vault: "V", vaultRoot: root, path: NOTE, content: "one line", idempotencyKey: key };
}

function runtimeFor(requester: LauncherIpcRequester, ledger: IdempotencyLedger, refreshIntervalMs = 60_000) {
  const selector = new BackendSelector({ launcherIpc: new LauncherIpcBackend(requester) }, { refreshIntervalMs });
  const runtime = {
    config: {
      readOnlyMode: false,
      allowedVaultRoots: [root],
      timeouts: { openVaultMs: 25_000, createNoteMs: 20_000, appendNoteMs: 20_000, readNoteMs: 15_000, searchNotesMs: 20_000 },
      logging: { slowThresholdMs: { append_note: 60_000, read_note: 60_000 } },
    },
    selector,
    ledger,
    metrics: new Metrics(),
    logger: { warn: () => undefined, info: () => undefined },
    withWriteLock: createWriteLocker(),
    readPins: new ReadAfterWritePins(),
  } as never;
  return { runtime, selector };
}

type Notes = Map<string, string>;
type Params = { path: string; content: string; tailChars?: number };

/** What obsidian-bridge-launcher's vaultIpc.ts answers, over an in-memory vault. */
function serve(method: string, p: Params, notes: Notes): unknown {
  switch (method) {
    case "vault.info":
      return INFO;
    case "vault.append":
      notes.set(p.path, (notes.get(p.path) ?? "") + p.content);
      return { path: p.path, created: false };
    case "vault.read": {
      const content = notes.get(p.path);
      if (content === undefined) throw new LauncherIpcError(`note not found: ${p.path}`, "not_found");
      return { path: p.path, content: p.tailChars ? content.slice(-p.tailChars) : content };
    }
    default:
      throw new LauncherIpcError(`unknown launcher IPC method: ${method}`);
  }
}

/** A launcher over `notes`; `script` replaces a method's answer (it may still write through `notes`). */
function fakeLauncher(script: Record<string, (p: Params, notes: Notes) => unknown> = {}, notes: Notes = new Map()) {
  const methods: string[] = [];
  const requester: LauncherIpcRequester = {
    async request<T>(method: string, params: unknown): Promise<T> {
      methods.push(method);
      const p = params as Params;
      const override = script[method];
      return (override ? override(p, notes) : serve(method, p, notes)) as T;
    },
  };
  return { requester, notes, methods };
}

/**
 * A real LauncherIpcClient over a stream pair standing in for fd 3. The launcher's side serves `notes`; with
 * `dieInsideAppend` it applies an append and then closes the pipe without answering (Obsidian quitting mid-call).
 */
function launcherOverPipe(notes: Notes, dieInsideAppend = false) {
  const toClient = new PassThrough();
  const fromClient = new PassThrough();
  const channel = Duplex.from({ readable: toClient, writable: fromClient });
  const methods: string[] = [];
  let pending = "";
  fromClient.on("data", (chunk: Buffer) => {
    pending += chunk.toString("utf8");
    let nl: number;
    while ((nl = pending.indexOf("\n")) >= 0) {
      const frame = JSON.parse(pending.slice(0, nl)) as { id: string; method: string; params: Params };
      pending = pending.slice(nl + 1);
      methods.push(frame.method);
      let answer: Record<string, unknown>;
      try {
        answer = { result: serve(frame.method, frame.params, notes) };
      } catch (error) {
        const e = error as LauncherIpcError;
        answer = { error: { message: e.message, ...(e.reason ? { reason: e.reason } : {}) } };
      }
      if (frame.method === "vault.append" && dieInsideAppend) {
        channel.destroy();
        return;
      }
      toClient.write(`${JSON.stringify({ jsonrpc: "2.0", id: frame.id, ...answer })}\n`);
    }
  });
  const closed = new Promise<void>((resolve) => channel.once("close", () => resolve()));
  return { client: new LauncherIpcClient(channel), channel, methods, closed };
}

const count = (text: string | undefined, part: string): number => (text ?? "").split(part).length - 1;
const appendsIn = (methods: string[]): number => methods.filter((m) => m === "vault.append").length;

/** A call's result, or what it threw as { thrown: { code, retryable } }, so every outcome compares as data. */
async function outcome(run: Promise<unknown>): Promise<unknown> {
  try {
    return await run;
  } catch (error) {
    if (error instanceof AppError) return { thrown: { code: error.code, retryable: error.retryable } };
    throw error;
  }
}

describe("a same-key append retry after a first attempt that wrote nothing", () => {
  it("writes once after the cold-start NO_CAPABLE_BACKEND, instead of reconciling a write that never happened", async () => {
    let probes = 0;
    const launcher = fakeLauncher({
      // The first probe goes unanswered (the renderer is still loading), so the selector routes nothing.
      "vault.info": () => {
        probes += 1;
        if (probes === 1) throw new LauncherIpcError("launcher IPC timeout: method=vault.info timeoutMs=3000", "timeout");
        return INFO;
      },
    });
    const ledger = new IdempotencyLedger(ledgerFile());
    const { runtime } = runtimeFor(launcher.requester, ledger, 0);
    const call = callWith("engine-append-v1:cold-start");

    expect(await outcome(appendNoteTool(runtime, "req-1", undefined, undefined, call))).toMatchObject({
      ok: false,
      error: { code: ERROR_CODES.NO_CAPABLE_BACKEND, retryable: true },
    });
    expect(appendsIn(launcher.methods)).toBe(0);

    expect(await outcome(appendNoteTool(runtime, "req-2", undefined, undefined, call))).toMatchObject({
      ok: true,
      data: { appended: true, path: NOTE, idempotencyState: "COMMITTED" },
    });
    expect(appendsIn(launcher.methods)).toBe(1);
    expect(count(launcher.notes.get(NOTE), "one line")).toBe(1);
    expect(ledger.get("append_note", call.idempotencyKey)?.state).toBe("COMMITTED");
  });

  it("writes once after a stale routing epoch, which the selector refuses before any backend runs", async () => {
    const launcher = fakeLauncher();
    const ledger = new IdempotencyLedger(ledgerFile());
    const { runtime, selector } = runtimeFor(launcher.requester, ledger);
    const { epochId } = await selector.refresh(true);
    const call = callWith("engine-append-v1:stale-epoch");

    expect(await outcome(appendNoteTool(runtime, "req-1", epochId - 1, undefined, call))).toMatchObject({
      ok: false,
      error: { code: ERROR_CODES.BACKEND_SELECTION_STALE, retryable: true },
    });
    expect(await outcome(appendNoteTool(runtime, "req-2", epochId, undefined, call))).toMatchObject({
      ok: true,
      data: { idempotencyState: "COMMITTED" },
    });
    expect(appendsIn(launcher.methods)).toBe(1);
    expect(count(launcher.notes.get(NOTE), "one line")).toBe(1);
  });

  it("writes once, in the next bridge, after the pipe had closed before the request went out", async () => {
    const file = ledgerFile();
    const call = callWith("engine-append-v1:closed-before-send");
    const pipe = launcherOverPipe(new Map());
    const first = new IdempotencyLedger(file);
    const { runtime: before, selector } = runtimeFor(pipe.client, first);
    await selector.refresh(true); // the probe is answered, so the routing snapshot says the pipe is up
    pipe.channel.destroy(); // Obsidian quits
    await pipe.closed;

    expect(await outcome(appendNoteTool(before, "req-1", undefined, undefined, call))).toMatchObject({
      ok: false,
      error: { code: ERROR_CODES.LAUNCHER_IPC_UNAVAILABLE, retryable: false, diagnostics: { requestSent: false } },
    });
    expect(pipe.methods).toEqual(["vault.info"]);
    first.close();

    // The launcher spawns a new bridge on the same durable ledger.
    const launcher = fakeLauncher();
    const { runtime: after } = runtimeFor(launcher.requester, new IdempotencyLedger(file));
    expect(await outcome(appendNoteTool(after, "req-2", undefined, undefined, call))).toMatchObject({
      ok: true,
      data: { idempotencyState: "COMMITTED" },
    });
    expect(appendsIn(launcher.methods)).toBe(1);
    expect(count(launcher.notes.get(NOTE), "one line")).toBe(1);
  });

  it("writes once after the launcher refused the path until Obsidian had indexed the note", async () => {
    let refused = false;
    const launcher = fakeLauncher({
      // locateNote's refusal for a file on disk in another letter case that is not in the index yet: it clears
      // once Obsidian indexes the file.
      "vault.append": (p, notes) => {
        if (!refused) {
          refused = true;
          throw new LauncherIpcError(
            `a file named like ${p.path} in another letter case is on disk but not in Obsidian's index yet; give its exact path`,
            "path_refused"
          );
        }
        return serve("vault.append", p, notes);
      },
    });
    const ledger = new IdempotencyLedger(ledgerFile());
    const { runtime } = runtimeFor(launcher.requester, ledger);
    const call = callWith("engine-append-v1:not-indexed-yet");

    expect(await outcome(appendNoteTool(runtime, "req-1", undefined, undefined, call))).toMatchObject({
      ok: false,
      error: { code: ERROR_CODES.PATH_INVALID, diagnostics: { launcherReason: "path_refused" } },
    });
    expect(ledger.get("append_note", call.idempotencyKey)).toBeNull();
    expect(await outcome(appendNoteTool(runtime, "req-2", undefined, undefined, call))).toMatchObject({
      ok: true,
      data: { idempotencyState: "COMMITTED" },
    });
    expect(appendsIn(launcher.methods)).toBe(2);
    expect(count(launcher.notes.get(NOTE), "one line")).toBe(1);
  });
});

describe("a same-key append retry after a first attempt that may have written", () => {
  it("never writes twice when the pipe closed with the append in flight and the write had landed", async () => {
    const file = ledgerFile();
    const notes: Notes = new Map();
    const call = callWith("engine-append-v1:closed-in-flight");
    const pipe = launcherOverPipe(notes, true);
    const first = new IdempotencyLedger(file);
    const { runtime: before, selector } = runtimeFor(pipe.client, first);
    await selector.refresh(true);

    expect(await outcome(appendNoteTool(before, "req-1", undefined, undefined, call))).toMatchObject({
      ok: false,
      error: { code: ERROR_CODES.LAUNCHER_IPC_UNAVAILABLE },
    });
    expect(appendsIn(pipe.methods)).toBe(1);
    expect(first.get("append_note", call.idempotencyKey)?.state).toBe("AMBIGUOUS");
    first.close();

    const launcher = fakeLauncher({}, notes);
    const { runtime: after } = runtimeFor(launcher.requester, new IdempotencyLedger(file));
    expect(await outcome(appendNoteTool(after, "req-2", undefined, undefined, call))).toMatchObject({
      ok: true,
      data: { idempotencyState: "RECONCILED" },
    });
    expect(appendsIn(launcher.methods)).toBe(0);
    expect(count(notes.get(NOTE), "one line")).toBe(1);
  });

  it("never writes twice when the write itself failed in the renderer (an error with no launcher reason)", async () => {
    const launcher = fakeLauncher({
      "vault.append": (p, notes) => {
        serve("vault.append", p, notes); // the text reached the file before the error
        throw new LauncherIpcError("EIO: i/o error, write");
      },
    });
    const ledger = new IdempotencyLedger(ledgerFile());
    const { runtime } = runtimeFor(launcher.requester, ledger);
    const call = callWith("engine-append-v1:renderer-error");

    expect(await outcome(appendNoteTool(runtime, "req-1", undefined, undefined, call))).toMatchObject({
      ok: false,
      error: { code: ERROR_CODES.INTERNAL_ERROR },
    });
    expect(ledger.get("append_note", call.idempotencyKey)?.state).toBe("AMBIGUOUS");
    expect(await outcome(appendNoteTool(runtime, "req-2", undefined, undefined, call))).toMatchObject({
      ok: true,
      data: { idempotencyState: "RECONCILED" },
    });
    expect(appendsIn(launcher.methods)).toBe(1);
    expect(count(launcher.notes.get(NOTE), "one line")).toBe(1);
  });

  it("never writes twice when the launcher's answer could not be read", async () => {
    const launcher = fakeLauncher({
      "vault.append": (p, notes) => {
        serve("vault.append", p, notes);
        return {};
      },
    });
    const ledger = new IdempotencyLedger(ledgerFile());
    const { runtime } = runtimeFor(launcher.requester, ledger);
    const call = callWith("engine-append-v1:malformed-answer");

    expect(await outcome(appendNoteTool(runtime, "req-1", undefined, undefined, call))).toMatchObject({
      ok: false,
      error: { code: ERROR_CODES.INTERNAL_ERROR },
    });
    expect(ledger.get("append_note", call.idempotencyKey)?.state).toBe("AMBIGUOUS");
    expect(await outcome(appendNoteTool(runtime, "req-2", undefined, undefined, call))).toMatchObject({
      ok: true,
      data: { idempotencyState: "RECONCILED" },
    });
    expect(appendsIn(launcher.methods)).toBe(1);
  });

  it("keeps a timed-out key ambiguous and reconciles the write that landed late", async () => {
    let late = "";
    const launcher = fakeLauncher({
      "vault.append": (p) => {
        late = p.content; // the renderer is still writing when the bridge stops waiting
        throw new LauncherIpcError("launcher IPC timeout: method=vault.append timeoutMs=15000", "timeout");
      },
    });
    const ledger = new IdempotencyLedger(ledgerFile());
    const { runtime } = runtimeFor(launcher.requester, ledger);
    const call = callWith("engine-append-v1:late-write");

    expect(await outcome(appendNoteTool(runtime, "req-1", undefined, undefined, call))).toMatchObject({
      ok: false,
      error: { code: ERROR_CODES.LAUNCHER_IPC_TIMEOUT, retryable: true },
    });
    expect(ledger.get("append_note", call.idempotencyKey)?.state).toBe("AMBIGUOUS");
    launcher.notes.set(NOTE, late);
    expect(await outcome(appendNoteTool(runtime, "req-2", undefined, undefined, call))).toMatchObject({
      ok: true,
      data: { idempotencyState: "RECONCILED" },
    });
    expect(appendsIn(launcher.methods)).toBe(1);
  });
});

describe("the reconcile read of an ambiguous append", () => {
  function timedOutAppend(read: (p: Params, notes: Notes) => unknown) {
    return fakeLauncher({
      "vault.append": () => {
        throw new LauncherIpcError("launcher IPC timeout: method=vault.append timeoutMs=15000", "timeout");
      },
      "vault.read": read,
    });
  }

  it("answers retryable false, as for a note without the marker, when the note does not exist", async () => {
    const launcher = timedOutAppend((p, notes) => serve("vault.read", p, notes));
    const { runtime } = runtimeFor(launcher.requester, new IdempotencyLedger(ledgerFile()));
    const call = callWith("engine-append-v1:no-such-note");
    await appendNoteTool(runtime, "req-1", undefined, undefined, call);

    expect(await outcome(appendNoteTool(runtime, "req-2", undefined, undefined, call))).toEqual({
      thrown: { code: ERROR_CODES.AMBIGUOUS_WRITE_REQUIRES_DECISION, retryable: false },
    });
  });

  it("still answers retryable true when the note could not be read", async () => {
    const launcher = timedOutAppend(() => {
      throw new LauncherIpcError("launcher IPC timeout: method=vault.read timeoutMs=15000", "timeout");
    });
    const { runtime } = runtimeFor(launcher.requester, new IdempotencyLedger(ledgerFile()));
    const call = callWith("engine-append-v1:unreadable-note");
    await appendNoteTool(runtime, "req-1", undefined, undefined, call);

    expect(await outcome(appendNoteTool(runtime, "req-2", undefined, undefined, call))).toEqual({
      thrown: { code: ERROR_CODES.AMBIGUOUS_WRITE_REQUIRES_DECISION, retryable: true },
    });
  });
});
