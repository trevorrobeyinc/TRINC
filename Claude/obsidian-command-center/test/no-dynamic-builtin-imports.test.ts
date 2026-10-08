// Guard: no dynamic import() of a Node builtin anywhere in the plugin source. Run: npm test
//
// esbuild (format cjs, platform node) turns a STATIC `import { spawn } from "child_process"` into require(), but it
// leaves a DYNAMIC `await import("child_process")` as a real import(). Obsidian's renderer cannot resolve a bare
// builtin specifier that way and throws "Failed to resolve module specifier 'child_process'". That is exactly how the
// plugin's research-memory stage failed in the first passing run (2026-10-08): Node's test runner resolves the same
// call happily, so no ordinary unit test can see it. This test reads the source instead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BUILTINS = new Set(builtinModules);

/** Specifiers of every `import("...")` call in `source` that names a Node builtin (with or without `node:`). */
export function findDynamicBuiltinImports(source: string): string[] {
  const found: string[] = [];
  for (const m of source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) {
    const spec = m[1];
    if (BUILTINS.has(spec.replace(/^node:/, ""))) found.push(spec);
  }
  return found;
}

function* tsFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* tsFiles(p);
    else if (p.endsWith(".ts")) yield p;
  }
}

test("the detector catches the exact lines that broke the research-memory stage", () => {
  const broken = [
    'const { spawn } = await import("child_process");',
    'const { tmpdir } = await import("os");',
    "const { writeFileSync } = await import('fs');",
    'const x = await import( "node:path" );',
  ].join("\n");
  assert.deepEqual(findDynamicBuiltinImports(broken), ["child_process", "os", "fs", "node:path"]);
});

test("the detector leaves ordinary code alone (static imports, non-builtin dynamic imports, strings without a call)", () => {
  const fine = [
    'import { spawn } from "child_process";',
    'const lazy = await import("./some-local-module");',
    'const label = "import(child_process)";',
    'const x = await import("obsidian");',
  ].join("\n");
  assert.deepEqual(findDynamicBuiltinImports(fine), []);
});

test("no file under src/ dynamically imports a Node builtin", () => {
  const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
  const offenders: string[] = [];
  let scanned = 0;
  for (const file of tsFiles(srcDir)) {
    scanned += 1;
    const hits = findDynamicBuiltinImports(readFileSync(file, "utf8"));
    for (const h of hits) offenders.push(`${file.slice(srcDir.length + 1)}: import("${h}")`);
  }
  assert.ok(scanned > 10, `the scan must actually see the source tree (saw ${scanned} files)`);
  assert.deepEqual(offenders, [], "use a static import; esbuild turns it into require(), a dynamic import() fails in Obsidian's renderer");
});
