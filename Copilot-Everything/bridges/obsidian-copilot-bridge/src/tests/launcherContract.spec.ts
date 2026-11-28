import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  APPEND_CONFIRM_TAIL_CHARS,
  MAX_NOTE_BYTES,
  MAX_NOTE_CONTENT_CHARS,
  MAX_SEARCH_QUERY_CHARS,
  MAX_VAULT_PATH_CHARS,
  REASON_TO_CODE,
  REQUIRED_LAUNCHER_METHODS,
} from "../backends/launcherIpcBackend";
import { COMMAND_ID_SHAPE, MAX_COMMAND_ID_CHARS } from "../server/tools/executeCommand";
import { PRE_WRITE_LAUNCHER_REASONS } from "../server/tools/appendNote";

// The two halves of the pipe live in different packages, and the bridge cannot import the launcher's sources
// (rootDir is src). So the contract is checked as text: every method this bridge needs, every refusal reason it
// maps and every limit it mirrors must appear in obsidian-bridge-launcher's sources, and every id on the
// launcher's allow-list must pass this bridge's shape check (or the bridge would refuse it as malformed).

const LAUNCHER_SRC = path.resolve(__dirname, "..", "..", "..", "..", "..", "Claude", "obsidian-bridge-launcher", "src");
const read = (file: string) => fs.readFileSync(path.join(LAUNCHER_SRC, file), "utf8");

describe("the launcher's side of the fd-3 contract", () => {
  const vaultIpc = read("vaultIpc.ts");

  it("serves every method this bridge needs", () => {
    for (const method of REQUIRED_LAUNCHER_METHODS) {
      expect(vaultIpc).toContain(`"${method}"`);
    }
  });

  it("can send every refusal reason this bridge maps (timeout and closed are this bridge's own)", () => {
    for (const reason of Object.keys(REASON_TO_CODE).filter((r) => r !== "timeout" && r !== "closed")) {
      expect(vaultIpc).toContain(`| "${reason}"`);
    }
  });

  it("declares the same limit constants this bridge mirrors (the schemas' own refusals are tested per tool)", () => {
    expect(MAX_NOTE_CONTENT_CHARS).toBe(16 * 1024 * 1024);
    expect(vaultIpc).toContain("export const MAX_CONTENT_CHARS = 16 * 1024 * 1024;");
    expect(MAX_NOTE_BYTES).toBe(16 * 1024 * 1024);
    expect(vaultIpc).toContain("export const MAX_NOTE_BYTES = 16 * 1024 * 1024;");
    expect(MAX_SEARCH_QUERY_CHARS).toBe(1024);
    expect(vaultIpc).toContain("const MAX_QUERY_CHARS = 1024;");
    expect(MAX_VAULT_PATH_CHARS).toBe(1024);
    expect(vaultIpc).toContain("const MAX_PATH_CHARS = 1024;");
    expect(MAX_COMMAND_ID_CHARS).toBe(200);
    expect(vaultIpc).toContain("export const MAX_COMMAND_ID_CHARS = 200;");
    expect(APPEND_CONFIRM_TAIL_CHARS).toBeLessThanOrEqual(64 * 1024);
    expect(vaultIpc).toContain("export const MAX_TAIL_CHARS = 64 * 1024;");
  });

  it("reads a search folder's spelling with the same two rules as this bridge's guardSearchFolder", () => {
    const bridgeSearch = fs.readFileSync(path.resolve(__dirname, "..", "server", "tools", "searchNotes.ts"), "utf8");
    for (const rule of [".replace(/^(?:\\.?\\/+)+/, \"\")", ".replace(/(?:\\/\\.?)+$/, \"\")"]) {
      expect(vaultIpc, rule).toContain(rule);
      expect(bridgeSearch, rule).toContain(rule);
    }
  });

  it("reads every parameter this bridge sends and answers with every field it reads", () => {
    for (const param of ["path", "content", "contentSha256", "overwrite", "open", "newtab", "tailChars", "query", "limit", "paneType", "id"]) {
      expect(vaultIpc, `p.${param}`).toMatch(new RegExp(`\\bp\\.${param}\\b`));
    }
    for (const field of ["content", "created", "results", "executed", "opened", "basePath", "methods", "version"]) {
      expect(vaultIpc, field).toMatch(new RegExp(`[{,]\\s*${field}\\b[:,} ]`));
    }
  });

  it("answers an unknown method with the text the probe reads as 'launcher too old'", () => {
    expect(read("launcherIpcServer.ts")).toContain("unknown launcher IPC method: ${method}");
  });

  // append_note frees an idempotency key when the launcher refuses with one of PRE_WRITE_LAUNCHER_REASONS, because
  // vault.append raises them only before it writes (2026-11-27). These pin what makes that true: the method raises
  // nothing itself and calls no check but six, every note write is the last step on its path, and the checks write
  // no note and refuse with exactly those reasons. If one fails, re-read appendNote.ts's failedBeforeWriting first.
  describe("vault.append refuses only before it writes", () => {
    const block = /case "vault\.append": \{([\s\S]*?)\n {4}case "vault\.search"/.exec(vaultIpc)?.[1] ?? "";
    const code = block.replace(/\/\/.*$/gm, "");
    const CHECKS = ["ensureParentFolders", "guardPath", "locateNote", "refuseTooLargeToWrite", "requireString", "verifyContent"];
    const NOTE_WRITE = /\.(?:process|create|modify|write|append)\(/;
    const bodyOf = (name: string): string => {
      const start = vaultIpc.search(new RegExp(`\\n(?:export )?(?:async )?function ${name}\\(`));
      expect(start, `vaultIpc.ts has no function ${name}`).toBeGreaterThanOrEqual(0);
      const end = vaultIpc.indexOf("\n}\n", start);
      expect(end, `the end of ${name}`).toBeGreaterThan(start);
      return vaultIpc.slice(start, end);
    };

    it("raises no refusal itself and calls no check but the six", () => {
      expect(code).toContain("app.vault.process(");
      expect(code).not.toContain("VaultIpcError");
      const calls = new Set([...code.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\(/g)].map((m) => m[1]));
      expect([...calls].sort()).toEqual(CHECKS);
    });

    it("returns at once from every note write, so no check runs after one", () => {
      const lines = code.split("\n").filter((line) => line.trim() !== "");
      const writes = lines.map((line, i) => ({ line: line.trim(), next: (lines[i + 1] ?? "").trim() })).filter((w) => NOTE_WRITE.test(w.line));
      expect(writes).toHaveLength(5);
      for (const { line, next } of writes) {
        expect(next, line).toMatch(/^return\b/);
      }
    });

    it("writes no note inside its checks, which refuse with exactly the reasons append_note reads as nothing written", () => {
      const reasons = new Set<string>();
      for (const check of CHECKS) {
        const body = bodyOf(check);
        expect(NOTE_WRITE.test(body), `${check} writes a note`).toBe(false);
        for (const m of body.matchAll(/new VaultIpcError\(\s*"([a-z_]+)"/g)) reasons.add(m[1]);
      }
      expect([...reasons].sort()).toEqual([...PRE_WRITE_LAUNCHER_REASONS].sort());
    });
  });

  it("allows only ids that pass this bridge's command-id shape check", () => {
    const policy = read("commandPolicy.ts");
    const list = /new Set\(\[([\s\S]*?)\]\)/.exec(policy);
    expect(list).not.toBeNull();
    const ids = [...(list as RegExpExecArray)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(id).toMatch(COMMAND_ID_SHAPE);
    }
  });
});
