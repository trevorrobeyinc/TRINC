import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Guard against the defect found on 2026-08-15: `summaryOutputFolder` was declared on
 * `VideoCommandPreferences` / `PdfCommandPreferences` and read at runtime, but was never
 * declared in package.json — so Raycast never surfaced a field for it, `getPreferenceValues()`
 * always returned `undefined` for it, and the code silently fell through to a hardcoded
 * constant. TypeScript cannot catch this: the hand-written interface type-checks fine on its
 * own, and nothing cross-references it against the manifest Raycast actually reads.
 *
 * A preference that reaches code through `getPreferenceValues<T>()` is only real if it is
 * declared either at the extension level or on the command that consumes it.
 */

// `process.cwd()` rather than `import.meta.url`: this package's tsconfig is `"module":
// "commonjs"`, under which `import.meta` is a hard tsc error (TS1343) — and `ray build`
// gates on `tsc --noEmit`, so using it here blocked EVERY production build of the
// extension, not just this test. Vitest runs with the package root as cwd.
const repoRoot = process.cwd();

interface ManifestPreference {
  name: string;
}

interface Manifest {
  preferences?: ManifestPreference[];
  commands?: { name: string; preferences?: ManifestPreference[] }[];
}

const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf-8")) as Manifest;

const extensionLevel = new Set((manifest.preferences ?? []).map((p) => p.name));
const commandLevel = new Map<string, Set<string>>(
  (manifest.commands ?? []).map((c) => [c.name, new Set((c.preferences ?? []).map((p) => p.name))])
);

/** Field names of a single `export interface <name> { ... }` block in a source file. */
function interfaceFields(relativeSourcePath: string, interfaceName: string): string[] {
  const source = fs.readFileSync(path.join(repoRoot, relativeSourcePath), "utf-8");
  const start = source.indexOf(`export interface ${interfaceName} {`);
  expect(start, `${interfaceName} not found in ${relativeSourcePath}`).toBeGreaterThan(-1);
  const body = source.slice(start, source.indexOf("\n}", start));
  return [...body.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]);
}

/** Each preferences interface, and the command whose `getPreferenceValues` it types. */
const CONSUMERS = [
  {
    interfaceName: "VideoCommandPreferences",
    sourcePath: "src/tools/videoTranscribeFlow.ts",
    command: "videoTranscribeRunnerCommand",
  },
  {
    interfaceName: "PdfCommandPreferences",
    sourcePath: "src/tools/pdfSummarizeFlow.ts",
    command: "pdfSummarizeCommand",
  },
] as const;

describe("preference manifest coverage", () => {
  for (const { interfaceName, sourcePath, command } of CONSUMERS) {
    describe(interfaceName, () => {
      const fields = interfaceFields(sourcePath, interfaceName);

      it("declares at least one field", () => {
        expect(fields.length).toBeGreaterThan(0);
      });

      it.each(fields)("`%s` is declared in package.json, so it is never permanently undefined", (field) => {
        const declared = extensionLevel.has(field) || (commandLevel.get(command)?.has(field) ?? false);
        expect(
          declared,
          `${interfaceName}.${field} is read via getPreferenceValues() but is declared neither as an ` +
            `extension preference nor on command "${command}". Raycast will never populate it, so it is ` +
            `permanently undefined and the code silently uses its hardcoded fallback. Add it to package.json.`
        ).toBe(true);
      });
    });
  }

  it("keeps the summary output folder configurable (regression: it was undeclared until 2026-08-15)", () => {
    const pref = (manifest.preferences ?? []).find((p) => p.name === "summaryOutputFolder") as
      | (ManifestPreference & { type?: string; default?: string })
      | undefined;
    expect(pref).toBeDefined();
    expect(pref?.type).toBe("textfield");
    expect(pref?.default).toBe("Copilot Summaries");
  });
});
