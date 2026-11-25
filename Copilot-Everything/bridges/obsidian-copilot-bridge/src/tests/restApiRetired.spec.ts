import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The Local REST API backend was retired on 2026-11-25 (ops/security/vault-ipc-2026-11-25.md). This keeps it from
// coming back unnoticed: no source outside the tests may read the plugin's key, base URL or certificate variables,
// or import the deleted backend or the .env.local loader.

const SRC = path.resolve(__dirname, "..");

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "tests" ? [] : sources(full);
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

describe("the Local REST API backend stays retired", () => {
  const files = sources(SRC);

  it("scans the bridge's sources", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("no source reads the plugin's key, base URL or certificate variables", () => {
    for (const file of files) {
      expect(fs.readFileSync(file, "utf8"), path.relative(SRC, file)).not.toMatch(/OBSIDIAN_REST_API_/);
    }
  });

  it("no source imports the deleted backend or the .env.local loader, and neither file is back", () => {
    for (const file of files) {
      expect(fs.readFileSync(file, "utf8"), path.relative(SRC, file)).not.toMatch(
        /from\s+["'][^"']*(restApiBackend|envLocal)["']/
      );
    }
    expect(fs.existsSync(path.join(SRC, "backends", "restApiBackend.ts"))).toBe(false);
    expect(fs.existsSync(path.join(SRC, "config", "envLocal.ts"))).toBe(false);
  });
});
