import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  LauncherIpcBackend,
  MAX_IPC_WAIT_MS,
  REQUIRED_LAUNCHER_METHODS,
  type LauncherIpcRequester,
} from "../backends/launcherIpcBackend";
import { LauncherIpcError } from "../server/launcherIpc";
import { AppError } from "../server/errors";
import { ERROR_CODES } from "../server/errorCodes";
import type { ExecutionContext, Operation } from "../types";

interface Call {
  method: string;
  params: unknown;
  timeoutMs?: number;
}

/** A fake pipe: answers by method, records every call, throws what a handler throws. */
function fakeIpc(handlers: Record<string, (params: unknown) => unknown>): LauncherIpcRequester & { calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    async request<T>(method: string, params: unknown, timeoutMs?: number): Promise<T> {
      calls.push({ method, params, timeoutMs });
      const handler = handlers[method];
      if (!handler) throw new LauncherIpcError(`unknown launcher IPC method: ${method}`);
      return (await handler(params)) as T;
    },
  };
}

const INFO = () => ({ vault: "My Digital Garden", version: "0.2.0", methods: ["vault.info", ...REQUIRED_LAUNCHER_METHODS] });
const ctx: ExecutionContext = { requestId: "req-1", now: 0, epochId: 1, timeoutMs: 12_345 };
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

async function codeOf(promise: Promise<unknown>): Promise<{ code: string; retryable: boolean }> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return { code: (error as AppError).code, retryable: (error as AppError).retryable };
  }
  throw new Error("expected a rejection");
}

describe("LauncherIpcBackend probe", () => {
  it("is unavailable without a pipe (not spawned by the launcher)", async () => {
    const cap = await new LauncherIpcBackend(null).probe();
    expect(cap.available).toBe(false);
    expect(cap.constraints[0]).toMatch(/^launcher_ipc_missing/);
  });

  it("names a launcher that predates vault.info", async () => {
    const cap = await new LauncherIpcBackend(fakeIpc({})).probe();
    expect(cap.available).toBe(false);
    expect(cap.constraints[0]).toMatch(/^launcher_too_old/);
  });

  it("names the vault methods a launcher lacks", async () => {
    const ipc = fakeIpc({ "vault.info": () => ({ vault: "V", version: "0.1.9", methods: ["vault.info", "vault.read"] }) });
    const cap = await new LauncherIpcBackend(ipc).probe();
    expect(cap.available).toBe(false);
    expect(cap.constraints[0]).toMatch(/lacks vault\.create, vault\.append/);
    expect(cap.diagnostics).toEqual({ vault: "V", launcherVersion: "0.1.9" });
  });

  it("serves all six operations when the launcher has every method, probing with a short timeout", async () => {
    const ipc = fakeIpc({ "vault.info": INFO });
    const cap = await new LauncherIpcBackend(ipc).probe();
    expect(cap.available).toBe(true);
    expect(cap.supportedOps).toHaveLength(6);
    expect(cap.diagnostics).toEqual({ vault: "My Digital Garden", launcherVersion: "0.2.0" });
    expect(ipc.calls[0]).toEqual({ method: "vault.info", params: {}, timeoutMs: 3_000 });
  });

  it("accepts its own vault reached by a link, in NFD or in another letter case, and refuses another vault or none", async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "vault-match-"));
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "vault-other-"));
    const name = `Caf${String.fromCodePoint(0xe9)} Garden`;
    const vault = path.join(base, name);
    fs.mkdirSync(vault);
    const link = path.join(base, "link-to-vault");
    fs.symlinkSync(vault, link, "dir");
    const at = (basePath: string | undefined) =>
      new LauncherIpcBackend(fakeIpc({ "vault.info": () => ({ ...INFO(), basePath }) }), { vaultRoot: vault });
    try {
      expect((await at(vault).probe()).available).toBe(true);
      expect((await at(link).probe()).available).toBe(true);
      expect((await at(path.join(base, name.normalize("NFD"))).probe()).available).toBe(true);
      if (process.platform === "darwin") {
        expect((await at(path.join(base, name.toUpperCase())).probe()).available).toBe(true);
      }
      const wrong = await at(other).probe();
      expect(wrong.available).toBe(false);
      expect(wrong.constraints[0]).toMatch(/^vault_mismatch: the launcher serves the vault at /);
      const unverified = await at(undefined).probe();
      expect(unverified.available).toBe(false);
      expect(unverified.constraints[0]).toMatch(/^vault_unverified: /);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
      fs.rmSync(other, { recursive: true, force: true });
    }
  });

  it("says why there is no pipe, and which bridge process is answering", async () => {
    const outside = await new LauncherIpcBackend(null, { missingReason: "BRIDGE_IPC_FD is not set" }).probe();
    expect(outside.constraints[0]).toBe(
      `launcher_ipc_missing: BRIDGE_IPC_FD is not set, so this bridge was not spawned by obsidian-bridge-launcher (bridge pid ${process.pid})`
    );
    const unusable = await new LauncherIpcBackend(null, { missingReason: "fd 7 from BRIDGE_IPC_FD could not be opened" }).probe();
    expect(unusable.constraints[0]).toBe(
      `launcher_ipc_missing: fd 7 from BRIDGE_IPC_FD could not be opened, so the launcher's pipe cannot be used (bridge pid ${process.pid})`
    );
  });

  it("reports a pipe that does not answer, as worth retrying", async () => {
    const ipc = fakeIpc({
      "vault.info": () => {
        throw new LauncherIpcError("launcher IPC timeout: method=vault.info timeoutMs=3000", "timeout");
      },
    });
    const cap = await new LauncherIpcBackend(ipc).probe();
    expect(cap.available).toBe(false);
    expect(cap.constraints[0]).toMatch(/^probe_failed:launcher IPC timeout/);
    expect(cap.permanent).toBeUndefined();
  });

  it("marks as permanent what cannot recover in this process: no pipe, a closed pipe, an old launcher, another vault", async () => {
    const closed = fakeIpc({
      "vault.info": () => {
        throw new LauncherIpcError("launcher IPC socket closed", "closed");
      },
    });
    const old = fakeIpc({ "vault.info": () => ({ vault: "V", version: "0.1.9", methods: ["vault.info"] }) });
    const elsewhere = fakeIpc({ "vault.info": () => ({ ...INFO(), basePath: "/vaults/Other" }) });
    expect((await new LauncherIpcBackend(null).probe()).permanent).toBe(true);
    expect((await new LauncherIpcBackend(closed).probe()).permanent).toBe(true);
    expect((await new LauncherIpcBackend(fakeIpc({})).probe()).permanent).toBe(true);
    expect((await new LauncherIpcBackend(old).probe()).permanent).toBe(true);
    expect((await new LauncherIpcBackend(elsewhere, { vaultRoot: "/vaults/Mine" }).probe()).permanent).toBe(true);
    expect((await new LauncherIpcBackend(fakeIpc({ "vault.info": INFO })).probe()).permanent).toBeUndefined();
  });

  it("compares spellings of a vault folder that does not exist the way the path guard does (NFC, letter case)", async () => {
    const base = fs.realpathSync.native(os.tmpdir());
    const missing = path.join(base, `Missing Caf${String.fromCodePoint(0xe9)} ${process.pid}`);
    const at = (basePath: string) =>
      new LauncherIpcBackend(fakeIpc({ "vault.info": () => ({ ...INFO(), basePath }) }), { vaultRoot: missing });
    expect((await at(missing.normalize("NFD")).probe()).available).toBe(true);
    const upper = missing.toUpperCase();
    expect((await at(upper).probe()).available).toBe(process.platform === "darwin" || process.platform === "win32");
  });
});

describe("LauncherIpcBackend execute", () => {
  it("reads a note through vault.read with the operation's own timeout", async () => {
    const ipc = fakeIpc({ "vault.read": () => ({ path: "A/b.md", content: "hello" }) });
    const result = await new LauncherIpcBackend(ipc).execute("read_note", { vault: "V", path: "A/b.md", file: "A/b.md" }, ctx);
    expect(result.stdout).toBe("hello");
    expect(ipc.calls[0]).toEqual({ method: "vault.read", params: { path: "A/b.md" }, timeoutMs: 12_345 });
  });

  it("caps the wait at MAX_IPC_WAIT_MS whatever the operation's configured timeout", async () => {
    const ipc = fakeIpc({ "workspace.open": () => ({ opened: true }) });
    await new LauncherIpcBackend(ipc).execute("open_vault", { vault: "V", path: "A.md" }, { ...ctx, timeoutMs: 25_000 });
    expect(ipc.calls[0].timeoutMs).toBe(MAX_IPC_WAIT_MS);
  });

  it("creates a note with explicit booleans, empty content by default, and the content's sha256", async () => {
    const ipc = fakeIpc({ "vault.create": () => ({ path: "N.md", created: true }) });
    await new LauncherIpcBackend(ipc).execute("create_note", { path: "N.md", overwrite: true }, ctx);
    expect(ipc.calls[0].params).toEqual({
      path: "N.md",
      content: "",
      contentSha256: sha256(""),
      overwrite: true,
      open: false,
      newtab: false,
    });
  });

  it("appends through vault.append with the content's sha256, passing no inline flag", async () => {
    const ipc = fakeIpc({ "vault.append": () => ({ path: "N.md", created: false }) });
    const content = `caf${String.fromCodePoint(0xe9)} ${String.fromCodePoint(0x2014)} x`;
    await new LauncherIpcBackend(ipc).execute("append_note", { path: "N.md", content, inline: true }, ctx);
    expect(ipc.calls[0].params).toEqual({ path: "N.md", content, contentSha256: sha256(content) });
  });

  it("searches with the query and the narrowing the caller gave, and prints the results as JSON", async () => {
    const results = [{ path: "A.md", text: "...match..." }, { path: "B.md" }];
    const ipc = fakeIpc({ "vault.search": () => ({ results, total: 7 }) });
    const result = await new LauncherIpcBackend(ipc).execute("search_notes", { query: "q", path: "Research", limit: 2, case: true, format: "json" }, ctx);
    expect(ipc.calls[0].params).toEqual({ query: "q", path: "Research", limit: 2 });
    expect(JSON.parse(result.stdout)).toEqual(results);
  });

  it("reports whether a command ran", async () => {
    const ipc = fakeIpc({ "commands.execute": () => ({ executed: false, id: "x:y" }) });
    const result = await new LauncherIpcBackend(ipc).execute("execute_command", { id: "x:y" }, ctx);
    expect(JSON.parse(result.stdout)).toEqual({ executed: false });
  });

  it("opens a note in the asked pane type, and sends nothing for a bare open", async () => {
    const ipc = fakeIpc({ "workspace.open": () => ({ opened: true }) });
    const backend = new LauncherIpcBackend(ipc);
    await backend.execute("open_vault", { vault: "V", path: "A.md", paneType: "tab" }, ctx);
    await backend.execute("open_vault", { vault: "V" }, ctx);
    expect(ipc.calls.map((c) => c.params)).toEqual([{ path: "A.md", paneType: "tab" }, {}]);
  });

  it("maps the launcher's refusal reasons to the bridge's error codes", async () => {
    const refusing = (reason: string) =>
      new LauncherIpcBackend(
        fakeIpc({
          "vault.read": () => {
            throw new LauncherIpcError(`refused: ${reason}`, reason);
          },
        })
      ).execute("read_note", { path: "A.md" }, ctx);
    expect(await codeOf(refusing("not_found"))).toEqual({ code: ERROR_CODES.NOTE_NOT_FOUND, retryable: false });
    expect(await codeOf(refusing("path_refused"))).toEqual({ code: ERROR_CODES.PATH_INVALID, retryable: false });
    expect(await codeOf(refusing("already_exists"))).toEqual({ code: ERROR_CODES.ALREADY_EXISTS, retryable: false });
    expect(await codeOf(refusing("command_refused"))).toEqual({ code: ERROR_CODES.COMMAND_NOT_ALLOWED, retryable: false });
    expect(await codeOf(refusing("too_large"))).toEqual({ code: ERROR_CODES.PAYLOAD_TOO_LARGE, retryable: false });
    expect(await codeOf(refusing("timeout"))).toEqual({ code: ERROR_CODES.LAUNCHER_IPC_TIMEOUT, retryable: true });
    expect(await codeOf(refusing("closed"))).toEqual({ code: ERROR_CODES.LAUNCHER_IPC_UNAVAILABLE, retryable: false });
    expect(await codeOf(refusing("unavailable"))).toEqual({ code: ERROR_CODES.LAUNCHER_IPC_UNAVAILABLE, retryable: false });
    expect(await codeOf(refusing("invalid_params"))).toEqual({ code: ERROR_CODES.INTERNAL_ERROR, retryable: false });
  });

  it("carries the launcher's method and reason in the error's diagnostics (execute_command's audit reads launcherReason)", async () => {
    const backend = new LauncherIpcBackend(
      fakeIpc({
        "commands.execute": () => {
          throw new LauncherIpcError("not on the allow-list", "command_refused");
        },
      })
    );
    try {
      await backend.execute("execute_command", { id: "x:y" }, ctx);
      throw new Error("expected a rejection");
    } catch (error) {
      expect((error as AppError).diagnostics).toEqual({ launcherMethod: "commands.execute", launcherReason: "command_refused" });
    }
  });

  it("calls a timeout retryable only where repeating is safe: reads, searches, opens and appends", async () => {
    const timingOut = (operation: Operation, method: string, input: Record<string, unknown>) =>
      new LauncherIpcBackend(
        fakeIpc({
          [method]: () => {
            throw new LauncherIpcError("launcher IPC timeout", "timeout");
          },
        })
      ).execute(operation, input, ctx);
    const retryable = async (operation: Operation, method: string, input: Record<string, unknown>) =>
      (await codeOf(timingOut(operation, method, input))).retryable;
    expect(await retryable("read_note", "vault.read", { path: "A.md" })).toBe(true);
    expect(await retryable("search_notes", "vault.search", { query: "q" })).toBe(true);
    expect(await retryable("open_vault", "workspace.open", { path: "A.md" })).toBe(true);
    expect(await retryable("append_note", "vault.append", { path: "A.md", content: "x" })).toBe(true);
    expect(await retryable("create_note", "vault.create", { path: "A.md", content: "x" })).toBe(false);
    expect(await retryable("execute_command", "commands.execute", { id: "x:y" })).toBe(false);
  });

  it("fails loudly on an answer without the fields it reads, instead of reporting success", async () => {
    const answering = (method: string, answer: unknown) => fakeIpc({ [method]: () => answer });
    const cases: Array<[Operation, string, Record<string, unknown>]> = [
      ["search_notes", "vault.search", { query: "q" }],
      ["execute_command", "commands.execute", { id: "x:y" }],
      ["create_note", "vault.create", { path: "A.md" }],
      ["append_note", "vault.append", { path: "A.md", content: "x" }],
      ["open_vault", "workspace.open", { path: "A.md" }],
      ["read_note", "vault.read", { path: "A.md" }],
    ];
    for (const [operation, method, input] of cases) {
      const failure = await codeOf(new LauncherIpcBackend(answering(method, { unexpected: true })).execute(operation, input, ctx));
      expect(failure, operation).toEqual({ code: ERROR_CODES.INTERNAL_ERROR, retryable: false });
    }
    // Each half of the path-and-created check counts on its own.
    for (const [operation, method, input] of cases.filter(([op]) => op === "create_note" || op === "append_note")) {
      for (const answer of [{ path: "A.md" }, { created: true }]) {
        const failure = await codeOf(new LauncherIpcBackend(answering(method, answer)).execute(operation, input, ctx));
        expect(failure, `${operation} ${JSON.stringify(answer)}`).toEqual({ code: ERROR_CODES.INTERNAL_ERROR, retryable: false });
      }
    }
  });

  it("refuses a note body that is not a string instead of writing an empty note", async () => {
    const ipc = fakeIpc({
      "vault.append": () => ({ path: "A.md", created: false }),
      "vault.create": () => ({ path: "A.md", created: true }),
    });
    for (const operation of ["append_note", "create_note"] as const) {
      expect(await codeOf(new LauncherIpcBackend(ipc).execute(operation, { path: "A.md", content: 42 }, ctx))).toEqual({
        code: ERROR_CODES.INTERNAL_ERROR,
        retryable: false,
      });
    }
    expect(ipc.calls).toEqual([]);
  });

  it("forwards append_note's tail read hint, and only when it is given", async () => {
    const ipc = fakeIpc({ "vault.read": () => ({ path: "A.md", content: "tail" }) });
    const backend = new LauncherIpcBackend(ipc);
    await backend.execute("read_note", { path: "A.md", tailChars: 16_384 }, ctx);
    await backend.execute("read_note", { path: "A.md" }, ctx);
    expect(ipc.calls.map((c) => c.params)).toEqual([{ path: "A.md", tailChars: 16_384 }, { path: "A.md" }]);
  });

  it("fails without a pipe instead of pretending", async () => {
    expect(await codeOf(new LauncherIpcBackend(null).execute("read_note", { path: "A.md" }, ctx))).toEqual({
      code: ERROR_CODES.LAUNCHER_IPC_UNAVAILABLE,
      retryable: false,
    });
  });
});
