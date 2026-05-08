import { describe, expect, it } from "vitest";
import { parseJsonFromNoisyStdout } from "../parsing/cliOutputParser";

describe("cliOutputParser", () => {
  it("parses plain JSON", () => {
    const parsed = parseJsonFromNoisyStdout('{"ok":true}');
    expect((parsed as { ok: boolean }).ok).toBe(true);
  });

  it("extracts json after warning lines", () => {
    const parsed = parseJsonFromNoisyStdout('warning: hello\\n{"x":1}');
    expect((parsed as { x: number }).x).toBe(1);
  });
});
