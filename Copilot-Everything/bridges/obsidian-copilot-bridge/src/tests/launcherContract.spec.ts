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
