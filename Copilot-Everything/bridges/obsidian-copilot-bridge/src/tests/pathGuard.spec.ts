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

  // Windows may refuse to create links without a privilege; there the test is reported as skipped, never as a
  // silent pass. Everywhere else a failed symlinkSync fails the test.
  it.skipIf(process.platform === "win32")(
    "rejects a link inside the vault that points into one of its hidden folders, such as .obsidian",
    () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "cpbh-path-"));
      try {
        fs.mkdirSync(path.join(root, ".obsidian", "plugins"), { recursive: true });
        fs.mkdirSync(path.join(root, "Notes"));
        fs.symlinkSync(path.join(root, ".obsidian"), path.join(root, "settings"), "dir");
        fs.symlinkSync(path.join(root, "Notes"), path.join(root, "notes-link"), "dir");
        expect(() => guardVaultRelativePath(root, "settings/plugins/evil/main.js")).toThrow(/hidden folder/);
        expect(() => guardVaultRelativePath(root, "settings")).toThrow(/hidden folder/);
        // A link to an ordinary folder inside the vault still works.
        expect(guardVaultRelativePath(root, "notes-link/today.md").relativePath).toBe("notes-link/today.md");
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  );
});
