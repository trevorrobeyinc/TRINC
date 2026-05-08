import { describe, it, expect } from "vitest";
import { canonicalize, hashPack, sha256Hex } from "../src/hash.js";

describe("hash", () => {
  it("produces stable sha256 for same content", () => {
    const md = "# Title\n\nBody.\n";
    expect(hashPack(md)).toBe(hashPack(md));
  });

  it("ignores Windows vs Unix line endings", () => {
    const a = "# Title\r\n\r\nBody.\r\n";
    const b = "# Title\n\nBody.\n";
    expect(hashPack(a)).toBe(hashPack(b));
  });

  it("ignores trailing whitespace per line", () => {
    const a = "# Title   \n\nBody  \n";
    const b = "# Title\n\nBody\n";
    expect(hashPack(a)).toBe(hashPack(b));
  });

  it("collapses 3+ blank lines to 2", () => {
    const a = "# T\n\n\n\nbody\n";
    const b = "# T\n\nbody\n";
    expect(hashPack(a)).toBe(hashPack(b));
  });

  it("strips YAML front-matter timestamps", () => {
    const a = "---\ntitle: T\ndate: 2026-04-26\n---\n# T\n\nbody";
    const b = "---\ntitle: T\ndate: 2026-04-27\n---\n# T\n\nbody";
    expect(hashPack(a)).toBe(hashPack(b));
  });

  it("preserves non-timestamp front-matter differences", () => {
    const a = "---\ntitle: A\n---\n# T\n\nbody";
    const b = "---\ntitle: B\n---\n# T\n\nbody";
    expect(hashPack(a)).not.toBe(hashPack(b));
  });

  it("canonicalize is idempotent", () => {
    const md = "# T\n\n  body  \n\n\n\n";
    expect(canonicalize(canonicalize(md))).toBe(canonicalize(md));
  });

  it("sha256Hex returns 64 hex chars", () => {
    expect(sha256Hex("hello")).toMatch(/^[0-9a-f]{64}$/);
  });
});
