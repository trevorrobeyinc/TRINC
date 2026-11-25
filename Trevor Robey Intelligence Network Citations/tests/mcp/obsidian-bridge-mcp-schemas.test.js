"use strict";

// Every request the obsidian-bridge-mcp adapter sends, run through the vault bridge's REAL schemas.
//
// Why this file exists (2026-11-25): the bridge's note tools (read_note, create_note, append_note)
// parse their input with zod schemas that require vaultRoot, and append_note also refuses a call
// without an idempotencyKey. The adapter sent neither, so the bridge answered every note call with
// INTERNAL_ERROR (HTTP 400) before any backend ran, and readNote read ''. The adapter's unit tests
// could not see it, because their fake bridge accepts any body.
//
// So this file keeps no copy of a schema. It reads each one from the bridge's TypeScript source in
// this checkout (Copilot-Everything/bridges/obsidian-copilot-bridge/src), builds it with the engine's
// own zod (the bridge depends on zod ^4.6.7 and the engine pins 4.6.7, so parsing behaves the same),
// and parses the exact body the adapter wrote: the dispatcher's request envelope, then the input
// schema of the handler the dispatcher routes that body's tool to. A schema the bridge changes is
// checked as it stands. A schema this file cannot build fails the test; nothing here skips.
//
// How a schema is built: the text of a module-level `const <name> = <expression>;` is evaluated in a
// fresh vm context that holds `z`, the Node globals a refine may call (Buffer, TextEncoder,
// TextDecoder, URL, URLSearchParams), what the file imports from node: modules, and the numeric
// constants the expression names. Each constant is resolved from the same file or from the relative
// module it is imported from, and accepted only as plain arithmetic. Before any source is read as
// code, comments and the literal parts of strings, templates and regex literals are blanked (a
// template's `${…}` stays code), so a word, bracket, quote or slash inside them changes nothing. The
// scanner knows no more JavaScript than that: a shape it cannot follow is most likely to fail the
// test, and the fixture tests at the end pin the cases it must get right. Everything read and run
// here is this repository's own source.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { z } = require("zod");

const { createObsidianBridgeMcp } = require("../../openclaw-bridge/mcp/obsidian-bridge-mcp/index.js");

const BRIDGE_SRC = path.resolve(__dirname, "..", "..", "..", "Copilot-Everything", "bridges", "obsidian-copilot-bridge", "src");
const VAULT = "My Digital Garden";
const VAULT_ROOT = "/vaults/My Digital Garden";

// Tripwire, as in obsidian-bridge-mcp.test.js: nothing here may read a real bridge config (it holds
// the live token). Every adapter below gets its token and vault root injected, so none should try.
const realConfigReads = [];
const unguardedReadFileSync = fs.readFileSync;
fs.readFileSync = function guardedReadFileSync(p, ...rest) {
  const file = String(p);
  if (file.endsWith("obsidian-cli-mcp.local.json") && !file.startsWith(os.tmpdir())) {
    realConfigReads.push(file);
    throw new Error(`test tripwire: refused to read a real bridge config: ${file}`);
  }
  return unguardedReadFileSync.call(this, p, ...rest);
};

function readSource(file) {
  assert.ok(fs.existsSync(file), `bridge source missing: ${file} (this test reads the real schemas and never skips)`);
  return fs.readFileSync(file, "utf8");
}

/**
 * `text` with every comment, and the literal part of every string, template and regex literal,
 * blanked to spaces (newlines kept), so positions still line up with `text` but nothing in them can
 * read as code. A template's `${…}` substitutions stay code, scanned by these same rules, so a
 * constant named only there is still seen and a brace inside a string there does not end it.
 */
function codeOnly(text) {
  return scanCode(text, 0, false).out;
}

const blank = (s) => s.replace(/[^\n]/g, " ");

/**
 * A `/` here starts a regex literal, not a division: it comes where an expression may begin, after
 * an operator, an opening bracket, a comma, a colon, a semicolon or a keyword such as `return`.
 */
function regexMayStart(out) {
  let k = out.length - 1;
  while (k >= 0 && /\s/.test(out[k])) k -= 1;
  if (k < 0 || "(,=:[!&|?{};+-*%<>~^".includes(out[k])) return true;
  return /(?:^|[^\w$])(?:return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await)$/.test(out.slice(Math.max(0, k - 7), k + 1));
}

/** Scans code from `start`; inside a template substitution, stops at the `}` that closes it. */
function scanCode(text, start, inSubstitution) {
  let out = "";
  let depth = 0;
  let i = start;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "/" && text[i + 1] === "/") {
      let end = text.indexOf("\n", i);
      if (end < 0) end = text.length;
      out += blank(text.slice(i, end));
      i = end;
    } else if (ch === "/" && text[i + 1] === "*") {
      const close = text.indexOf("*/", i + 2);
      const end = close < 0 ? text.length : close + 2;
      out += blank(text.slice(i, end));
      i = end;
    } else if (ch === '"' || ch === "'") {
      // A quoted string never spans a line in JS, so a stray quote can hide at most the rest of one.
      let j = i + 1;
      while (j < text.length && text[j] !== ch && text[j] !== "\n") j += text[j] === "\\" ? 2 : 1;
      const stop = Math.min(j, text.length);
      const closed = text[stop] === ch;
      out += ch + blank(text.slice(i + 1, stop)) + (closed ? ch : "");
      i = closed ? stop + 1 : stop;
    } else if (ch === "`") {
      out += ch;
      let j = i + 1;
      while (j < text.length && text[j] !== "`") {
        if (text[j] === "\\") {
          out += blank(text.slice(j, j + 2));
          j += 2;
        } else if (text[j] === "$" && text[j + 1] === "{") {
          const substitution = scanCode(text, j + 2, true);
          out += "${" + substitution.out;
          j = substitution.end;
          if (j < text.length) {
            out += "}";
            j += 1;
          }
        } else {
          out += text[j] === "\n" ? "\n" : " ";
          j += 1;
        }
      }
      if (j < text.length) {
        out += "`";
        j += 1;
      }
      i = Math.min(j, text.length);
    } else if (ch === "/" && regexMayStart(out)) {
      let j = i + 1;
      let inClass = false;
      while (j < text.length && text[j] !== "\n") {
        if (text[j] === "\\") {
          j += 2;
          continue;
        }
        if (inClass) inClass = text[j] !== "]";
        else if (text[j] === "[") inClass = true;
        else if (text[j] === "/") break;
        j += 1;
      }
      if (text[j] === "/") {
        out += "/" + blank(text.slice(i + 1, j)) + "/";
        i = j + 1;
      } else {
        out += ch; // no closing slash on this line: a division after all
        i += 1;
      }
    } else {
      if (inSubstitution && ch === "{") depth += 1;
      else if (inSubstitution && ch === "}") {
        if (depth === 0) return { out, end: i };
        depth -= 1;
      }
      out += ch;
      i += 1;
    }
  }
  return { out, end: i };
}

// Node globals a schema's refine may call: a fresh vm context holds only the JavaScript built-ins.
const NODE_GLOBALS = { Buffer, TextEncoder, TextDecoder, URL, URLSearchParams };

/** A module-level `const <name> =`, at the start of a line, never a nested declaration. */
function declaration(name) {
  return new RegExp(`(?:^|\\n)(?:export[ \\t]+)?const[ \\t]+${name}\\b[ \\t]*(?::[^=\\n]+)?=[ \\t]*`);
}

/** The source text after a module-level `const <name> =`, up to the `;` that ends it at depth 0. */
function constExpression(source, name, file) {
  const code = codeOnly(source);
  const m = declaration(name).exec(code);
  assert.ok(m, `${file} declares no module-level const ${name}`);
  const start = m.index + m[0].length;
  let depth = 0;
  for (let i = start; i < code.length; i += 1) {
    const ch = code[i];
    if ("([{".includes(ch)) depth += 1;
    else if (")]}".includes(ch)) depth -= 1;
    else if (ch === ";" && depth === 0) return source.slice(start, i);
  }
  assert.fail(`${file}: const ${name} has no terminating semicolon`);
}

// All-capital globals a schema may name that are not constants of the bridge.
const ALL_CAPS_GLOBALS = new Set(["JSON", "URL"]);

/** UPPER_SNAKE identifiers an expression uses as code: not in a comment or string, not after a dot. */
function constantNames(expression) {
  const names = codeOnly(expression).match(/(?<![\w$.])[A-Z][A-Z0-9_]+\b/g) || [];
  return [...new Set(names)].filter((name) => !ALL_CAPS_GLOBALS.has(name));
}

/**
 * Every value import in code (not in a comment, not `import type`): its specifier and its
 * [imported, local] bindings, where imported is "default" or "*" for those two forms.
 */
function importsOf(source) {
  const code = codeOnly(source);
  const imports = [];
  for (const m of code.matchAll(/(?:^|\n)[ \t]*import[ \t]+(?!type[ \t{])([^;\s][^;]*?)[ \t\n]*from[ \t]*(["'])([^"'\n]*)\2/g)) {
    const specifierStart = m.index + m[0].length - 1 - m[3].length;
    const specifier = source.slice(specifierStart, specifierStart + m[3].length);
    const names = [];
    let rest = m[1];
    const braces = rest.match(/\{([^}]*)\}/);
    if (braces) {
      for (const item of braces[1].split(",").map((s) => s.trim()).filter(Boolean)) {
        if (/^type\s/.test(item)) continue;
        const [imported, local = imported] = item.split(/\s+as\s+/);
        names.push([imported, local]);
      }
      rest = rest.replace(braces[0], "");
    }
    for (const part of rest.split(",").map((s) => s.trim()).filter(Boolean)) {
      const namespace = part.match(/^\*\s+as\s+([\w$]+)$/);
      if (namespace) names.push(["*", namespace[1]]);
      else if (/^[\w$]+$/.test(part)) names.push(["default", part]);
    }
    imports.push({ names, specifier });
  }
  return imports;
}

const relativeImports = (source) => importsOf(source).filter(({ specifier }) => specifier.startsWith("."));

/** What a file imports from Node's own modules (`node:…`), by local name, for its schemas' refines. */
function nodeImports(source) {
  const scope = {};
  for (const { names, specifier } of importsOf(source)) {
    if (!specifier.startsWith("node:")) continue;
    const mod = require(specifier);
    for (const [imported, local] of names) scope[local] = imported === "default" || imported === "*" ? mod : mod[imported];
  }
  return scope;
}

/** A numeric constant a schema names: declared in its file, or exported by the relative module it is imported from. */
function resolveConstant(name, file, source) {
  if (declaration(name).test(codeOnly(source))) {
    const expression = codeOnly(constExpression(source, name, file)).trim();
    assert.match(expression, /^[0-9_\s+\-*/%().A-Z]+$/, `${file}: ${name} = ${expression} is not plain arithmetic`);
    const scope = {};
    for (const dep of constantNames(expression)) scope[dep] = resolveConstant(dep, file, source);
    const value = vm.runInNewContext(expression, scope, { filename: file });
    assert.ok(Number.isFinite(value), `${file}: ${name} is not a finite number`);
    return value;
  }
  for (const { names, specifier } of relativeImports(source)) {
    const hit = names.find(([, local]) => local === name);
    if (!hit) continue;
    const base = path.resolve(path.dirname(file), specifier);
    const target = [`${base}.ts`, path.join(base, "index.ts")].find((candidate) => fs.existsSync(candidate));
    assert.ok(target, `${file}: the module ${specifier} that ${name} comes from is missing`);
    return resolveConstant(hit[0], target, readSource(target));
  }
  assert.fail(`${file}: its schema names ${name}, which it neither declares nor imports from a relative module`);
}

/** Builds the module-level `const <name>` of TypeScript source `source` (from `file`) with the engine's zod. */
function buildSchema(source, name, file) {
  const expression = constExpression(source, name, file);
  const scope = { ...NODE_GLOBALS, ...nodeImports(source), z };
  for (const constant of constantNames(expression)) scope[constant] = resolveConstant(constant, file, source);
  const schema = vm.runInNewContext(expression, scope, { filename: file });
  assert.ok(schema instanceof z.ZodType, `${file}: const ${name} did not build a zod schema`);
  return schema;
}

/** Builds the module-level `const <name>` of a bridge source file. */
function loadSchema(relFile, name = "schema") {
  const file = path.join(BRIDGE_SRC, relFile);
  return buildSchema(readSource(file), name, file);
}

/** The source file of the handler the dispatcher routes `tool` to (its handlers table, then its imports). */
function handlerFile(tool) {
  const file = path.join(BRIDGE_SRC, "server", "dispatcher.ts");
  const source = readSource(file);
  const table = codeOnly(constExpression(source, "handlers", file));
  const entry = new RegExp(`(?:^|[\\s{,])${tool}\\s*:\\s*([A-Za-z_$][\\w$]*)`).exec(table);
  assert.ok(entry, `dispatcher.ts routes no handler for ${tool}`);
  const imported = relativeImports(source).find(({ names }) => names.some(([, local]) => local === entry[1]));
  assert.ok(imported, `dispatcher.ts imports no ${entry[1]}`);
  return path.relative(BRIDGE_SRC, `${path.resolve(path.dirname(file), imported.specifier)}.ts`);
}

/** The keys of `input` that a z.object schema does not declare (zod would drop them in silence). */
function droppedKeys(schema, input) {
  assert.ok(schema.shape && typeof schema.shape === "object", "expected a z.object schema");
  return Object.keys(input).filter((key) => !Object.prototype.hasOwnProperty.call(schema.shape, key));
}

/** Every body the adapter writes while `run` drives it, through a transport that answers like a healthy bridge. */
async function bodiesFrom(run) {
  const bodies = [];
  const bridgeTransport = async (request) => {
    bodies.push(JSON.parse(request.body));
    return { status: 200, json: { ok: true, data: { matches: [], results: [], content: "" } } };
  };
  const mcp = createObsidianBridgeMcp({ bridgeTransport, authToken: "t", vaultRoot: VAULT_ROOT, allowWrites: true });
  await run(mcp);
  return bodies;
}

function assertParses(schema, input, label) {
  const result = schema.safeParse(input);
  assert.ok(result.success, `${label}: the bridge's schema refuses the adapter's input: ${result.success ? "" : JSON.stringify(result.error.issues)}`);
  return result.data;
}

test("the schema builder reads the bridge's real files (dispatcher envelope, five routed handlers)", () => {
  const envelope = loadSchema("server/dispatcher.ts", "requestSchema");
  for (const key of ["tool", "operation", "input"]) {
    assert.ok(Object.prototype.hasOwnProperty.call(envelope.shape, key), `requestSchema declares ${key}`);
  }
  assert.deepEqual(
    ["obsidian_read_note", "obsidian_create_note", "obsidian_append_note", "obsidian_search_notes", "miyo_search_context"].map(handlerFile),
    [
      path.join("server", "tools", "readNote.ts"),
      path.join("server", "tools", "createNote.ts"),
      path.join("server", "tools", "appendNote.ts"),
      path.join("server", "tools", "searchNotes.ts"),
      path.join("server", "tools", "miyoSearchContext.ts"),
    ]
  );
});

test("every envelope the adapter sends passes the dispatcher's request schema, and each tool has a handler", async () => {
  const envelope = loadSchema("server/dispatcher.ts", "requestSchema");
  const bodies = await bodiesFrom(async (mcp) => {
    await mcp.health();
    await mcp.searchNotes({ query: "aspirin", limit: 3 });
    await mcp.miyoSearchContext({ query: "aspirin", limit: 3 });
    await mcp.readNote({ notePath: "OpenClaw/x/Overview.md" });
    await mcp.createNote({ notePath: "OpenClaw/x/New.md", content: "body" });
    await mcp.appendNote({ notePath: "OpenClaw/x/Log.md", content: "one more line" });
  });
  assert.deepEqual(
    bodies.map((b) => [b.tool, b.operation]),
    [
      ["obsidian_health", "read_note"],
      ["obsidian_search_notes", "search_notes"],
      ["miyo_search_context", "search_notes"],
      ["obsidian_read_note", "read_note"],
      ["obsidian_create_note", "create_note"],
      ["obsidian_append_note", "append_note"],
    ]
  );
  for (const body of bodies) {
    assertParses(envelope, body, `${body.tool} envelope`);
    assert.deepEqual(droppedKeys(envelope, body), [], `${body.tool}: the envelope carries a key the dispatcher drops`);
    // obsidian_health is answered by the dispatcher itself before any handler is looked up.
    if (body.tool !== "obsidian_health") assert.ok(handlerFile(body.tool));
  }
});

test("read_note: the adapter's input passes the real schema; the input it sent before 2026-11-25 is refused", async () => {
  const [body] = await bodiesFrom((mcp) => mcp.readNote({ notePath: "OpenClaw/x/Overview.md" }));
  assert.deepEqual([body.tool, body.operation], ["obsidian_read_note", "read_note"]);
  const schema = loadSchema(handlerFile(body.tool));
  const parsed = assertParses(schema, body.input, "read_note");
  assert.deepEqual(parsed, { vault: VAULT, vaultRoot: VAULT_ROOT, path: "OpenClaw/x/Overview.md" });
  assert.deepEqual(droppedKeys(schema, body.input), []);

  const before = schema.safeParse({ vault: VAULT, path: "OpenClaw/x/Overview.md" });
  assert.equal(before.success, false, "the old input must fail, or this test is not reading the real requirement");
  assert.ok(before.error.issues.some((issue) => issue.path.join(".") === "vaultRoot"));
});

test("create_note: the input passes the real schema; mode is the one key the bridge drops", async () => {
  const [body] = await bodiesFrom((mcp) => mcp.createNote({ notePath: "OpenClaw/x/New.md", content: "body" }));
  assert.deepEqual([body.tool, body.operation], ["obsidian_create_note", "create_note"]);
  const schema = loadSchema(handlerFile(body.tool));
  const parsed = assertParses(schema, body.input, "create_note");
  assert.deepEqual(parsed, { vault: VAULT, vaultRoot: VAULT_ROOT, path: "OpenClaw/x/New.md", content: "body" });
  // Known and left as it was: the adapter's `mode` ("create") was never a bridge field (the bridge's
  // flag is `overwrite`), so zod drops it and every create refuses an existing note. A follow-up
  // decides whether the engine may overwrite at all; until then this pins the one dropped key.
  assert.deepEqual(droppedKeys(schema, body.input), ["mode"]);
  assert.equal(schema.safeParse({ vault: VAULT, path: "OpenClaw/x/New.md", content: "body" }).success, false);
});

test("append_note: the input passes the real schema and carries the idempotencyKey the tool requires", async () => {
  const [body] = await bodiesFrom((mcp) => mcp.appendNote({ notePath: "OpenClaw/x/Log.md", content: "one more line" }));
  assert.deepEqual([body.tool, body.operation], ["obsidian_append_note", "append_note"]);
  const relFile = handlerFile(body.tool);
  const schema = loadSchema(relFile);
  // The schema marks idempotencyKey optional, but the tool refuses an append without one.
  assert.match(readSource(path.join(BRIDGE_SRC, relFile)), /IDEMPOTENCY_KEY_REQUIRED_FOR_RETRY/);
  const parsed = assertParses(schema, body.input, "append_note");
  const { idempotencyKey, ...rest } = parsed;
  assert.deepEqual(rest, { vault: VAULT, vaultRoot: VAULT_ROOT, path: "OpenClaw/x/Log.md", content: "one more line" });
  assert.match(idempotencyKey, /^engine-append-v1:[0-9a-f]{64}$/);
  assert.deepEqual(droppedKeys(schema, body.input), []);
  assert.equal(schema.safeParse({ vault: VAULT, path: "OpenClaw/x/Log.md", content: "one more line" }).success, false);
});

test("search_notes and miyo_search_context: the inputs pass their schemas unchanged, with no vaultRoot", async () => {
  const bodies = await bodiesFrom(async (mcp) => {
    await mcp.searchNotes({ query: "aspirin", limit: 3 });
    await mcp.miyoSearchContext({ query: "aspirin", limit: 3 });
  });
  for (const body of bodies) {
    const schema = loadSchema(handlerFile(body.tool));
    assertParses(schema, body.input, body.tool);
    assert.deepEqual(droppedKeys(schema, body.input), [], `${body.tool}: a key its schema drops`);
    assert.equal("vaultRoot" in body.input, false);
  }
});

test("the source scanner reads code only: comments and strings cannot end, hide or add to an expression", () => {
  // Measured against the shapes the bridge's own files use: a comment with capitals, apostrophes in two
  // comments, a semicolon and brackets inside strings, member access, and a nested const of the same name.
  const source = [
    'import { LIMIT as CAP } from "./limits";',
    "function nested() {",
    "  const schema = z.object({ wrong: z.string() });",
    "}",
    "const schema = z.object({",
    "  // Content MUST be non-empty: the launcher's cap, less room for the marker.",
    '  path: z.string().min(1).describe("a; path (with) [brackets]"),',
    "  /* zod's object STRIPS unknown keys */",
    "  content: z.string().max(CAP - ROOM).optional(),",
    "  size: z.number().max(process.env.MAX_SIZE ? 1 : 2),",
    "});",
  ].join("\n");
  const expression = constExpression(source, "schema", "fixture.ts");
  assert.ok(expression.startsWith("z.object({\n  // Content MUST"), "the module-level declaration, not the nested one");
  assert.ok(expression.trimEnd().endsWith("})"), "the semicolon inside a string did not end it");
  assert.deepEqual(constantNames(expression), ["CAP", "ROOM"]);
  assert.deepEqual(relativeImports(source), [{ names: [["LIMIT", "CAP"]], specifier: "./limits" }]);

  // The shapes the vault-ipc re-back's schemas added: a refine calling Buffer, a constant named only
  // inside a template substitution, and imports from Node's own modules (with an `import type`).
  const refine = "z.string().refine((s) => Buffer.byteLength(s, \"utf8\") <= MAX_BYTES, { message: `over ${LIMIT_TEXT} bytes` })";
  assert.deepEqual(constantNames(refine), ["MAX_BYTES", "LIMIT_TEXT"]);
  const imports = [
    'import fs from "node:fs";',
    'import * as p from "node:path";',
    'import { createHash as hash } from "node:crypto";',
    'import type { T } from "./types";',
  ].join("\n");
  assert.deepEqual(importsOf(imports), [
    { names: [["default", "fs"]], specifier: "node:fs" },
    { names: [["*", "p"]], specifier: "node:path" },
    { names: [["createHash", "hash"]], specifier: "node:crypto" },
  ]);
  assert.deepEqual(nodeImports(imports), { fs: require("node:fs"), p: require("node:path"), hash: require("node:crypto").createHash });
});

test("the scanner is not thrown by brackets, quotes, slashes or capitals inside literals", () => {
  // Every case would change an assertion below if the scanner misread it: a string with an unbalanced
  // bracket, escaped quotes, template text with an escaped backtick, braces and a "}" string inside
  // substitutions, a regex literal holding quotes, a bracket and "/*", a division whose divisor is a
  // constant, a regex literal after `return`, an import inside a comment, and a single-quoted import.
  const source = [
    "const schema = z.object({",
    '  a: z.string().describe("MAX_IN_STRING (open"),',
    '  b: z.string().describe("say \\"STOP_WORD\\" (now"),',
    "  c: z.string().describe(`TEMPLATE_TEXT (open ${REAL_ONE} \\` ESCAPED_TICK`),",
    '  d: z.string().describe(`${ {k: 1}.k + REAL_TWO } and ${ "}" + REAL_THREE }`),',
    "  e: z.string().regex(/[\"'(]NOT_A_CONST\\/[/*]/),",
    "  f: z.number().max(REAL_FOUR / REAL_FIVE / 2),",
    '  g: z.string().refine((s) => { return /QUOTE_IN_REGEX"/.test(s); }),',
    "});",
    '/* import { FAKE } from "./fake"; */',
    "import { REAL_ONE } from './one';",
  ].join("\n");
  const newlines = (s) => s.split("").flatMap((c, i) => (c === "\n" ? [i] : []));
  assert.equal(codeOnly(source).length, source.length, "codeOnly keeps every position");
  assert.deepEqual(newlines(codeOnly(source)), newlines(source));
  const expression = constExpression(source, "schema", "tricky.ts");
  assert.equal(expression.split("\n").length, 9, "the expression is exactly the schema's nine lines");
  assert.deepEqual(constantNames(expression), ["REAL_ONE", "REAL_TWO", "REAL_THREE", "REAL_FOUR", "REAL_FIVE"]);
  assert.deepEqual(importsOf(source), [{ names: [["REAL_ONE", "REAL_ONE"]], specifier: "./one" }]);
});

test("a schema whose refine uses Buffer, a node: import and a local constant builds and behaves", () => {
  const fixture = [
    'import { createHash } from "node:crypto";',
    "const MAX_BYTES = 8;",
    "const schema = z.object({",
    "  // Bytes, not characters: the launcher's limit.",
    '  content: z.string().refine((s) => Buffer.byteLength(s, "utf8") <= MAX_BYTES, { message: `over ${MAX_BYTES} bytes` }),',
    '  digest: z.string().refine((s) => s !== createHash("sha256").update("").digest("hex")),',
    "});",
  ].join("\n");
  const schema = buildSchema(fixture, "schema", "fixture.ts");
  assert.equal(schema.safeParse({ content: "12345678", digest: "x" }).success, true);
  assert.equal(schema.safeParse({ content: "123456789", digest: "x" }).success, false, "MAX_BYTES reached the refine");
  assert.equal(schema.safeParse({ content: "é".repeat(5), digest: "x" }).success, false, "Buffer counts UTF-8 bytes (10), not characters (5)");
  const emptyDigest = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  assert.equal(schema.safeParse({ content: "x", digest: emptyDigest }).success, false, "createHash came from node:crypto");
});

test("tripwire: no test in this file read a real bridge config", () => {
  assert.deepEqual(realConfigReads, []);
});
