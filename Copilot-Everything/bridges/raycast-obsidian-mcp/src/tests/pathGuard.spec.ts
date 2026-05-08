import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { guardVaultRelativePath } from "../fs/pathGuard";

describe("pathGuard", () => {
  it("accepts safe vault-relative paths", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cpbh-path-"));
    const guarded = guardVaultRelativePath(root, "folder/note.md");
    expect(guarded.relativePath).toBe("folder/note.md");
  });

  it("rejects traversal", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cpbh-path-"));
    expect(() => guardVaultRelativePath(root, "../escape.md")).toThrow();
  });

  it("rejects absolute input paths", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cpbh-path-"));
    expect(() => guardVaultRelativePath(root, "/tmp/escape.md")).toThrow();
  });

  it("rejects symlink escapes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cpbh-path-"));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "cpbh-out-"));
    const linkName = path.join(root, "escape");

    try {
      fs.symlinkSync(outside, linkName, "dir");
    } catch {
      // Some environments disallow symlink creation in tests.
      return;
    }

    expect(() => guardVaultRelativePath(root, "escape/note.md")).toThrow();
  });
});
