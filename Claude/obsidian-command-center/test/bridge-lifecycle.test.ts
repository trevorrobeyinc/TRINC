// Guard: the bridge's Unix-socket wiring and its plugin lifecycle (bridges-uds D3 and D5, 2026-11-24). Run: npm test
//
// The bridge and main.ts import `obsidian`, so node --test cannot load them; like browser-guard.test.ts, this reads
// the source. Obsidian 1.15.1's unload is synchronous and never awaits, and it runs a queued layout-ready callback
// without checking that its plugin is still loaded, so the order of a few statements is the whole guarantee:
// disposed first, the bridge closed before anything else is torn down, a start that lands late closes what it
// opened, and the close is registered with the plugin so Obsidian runs it even before onunload.
//
// The Start and Stop races are run, not read: the last tests compile the bridge's own lifecycle methods from the
// source and drive them against the real helper on a short /tmp/uds-* home (see lifecycleBridge below).
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import type * as http from "node:http";
import { stripTypeScriptTypes } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as vm from "node:vm";
import {
  listenHttpOnSocket,
  requestOverSocket,
  runDir,
  SOCKET_NAMES,
  socketPathFor,
  type UdsListenOptions,
  type UdsListener,
} from "../src/bridge/uds-listener.ts";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const read = (rel: string): string => readFileSync(join(SRC, rel), "utf8");
const BRIDGE = read("bridge/mcp-bridge-server.ts");
const MAIN = read("main.ts");

/** The body of a method, from its signature line to the closing brace at the class's indentation. */
function methodBody(source: string, signature: string): string {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `no ${signature}`);
  const end = source.indexOf("\n  }\n", start);
  assert.ok(end > start, `no end for ${signature}`);
  return source.slice(start + signature.length, end);
}

test("the bridge serves command-center.sock through the helper, with no TLS and no TCP", () => {
  assert.ok(BRIDGE.includes("listenHttpOnSocket((req, res) => this.handleRequest(req, res), {"));
  assert.ok(BRIDGE.includes("socketPath: socketPathFor(SOCKET_NAMES.commandCenter),"));
  for (const gone of ['from "https"', "https.", "createServer(", "OPENCLAW_BRIDGE_TLS", "localhost-key.pem", "bridgePort"]) {
    assert.equal(BRIDGE.includes(gone), false, `mcp-bridge-server.ts still has ${gone}`);
  }
  assert.equal(/\.listen\(/.test(BRIDGE), false, "only uds-listener.ts listens");
  // The kernel keeps the hidden name the helper bound first, so the log line names listener.socketPath.
  assert.ok(BRIDGE.includes("MCP bridge started on unix:${listener.socketPath}"));
  assert.equal(BRIDGE.includes(".address()"), false, "never server.address(): it is the hidden bind name");
  assert.ok(BRIDGE.includes('new URL(req.url || "/", "http://localhost")'), "the URL base no longer names a port");
});

test("a start that lands after a stop or the unload closes what it opened; a served one is registered with the plugin", () => {
  const open = methodBody(BRIDGE, "private async openListener(): Promise<UdsListener | null> {");
  const guard = open.indexOf("if (this.stopRequested || this.owner?.isDisposed()) {");
  const closeLate = open.indexOf("void listener.close().catch(", guard);
  const serve = open.indexOf("this.listener = listener;");
  const register = open.indexOf("this.owner?.register(() => void listener.close().catch(");
  assert.ok(guard > open.indexOf("await listenHttpOnSocket("), "the check runs after the await");
  assert.ok(closeLate > guard && closeLate < serve, "a late start closes its listener and serves nothing");
  assert.ok(register > serve, "the close is registered right after a successful start");

  const stop = methodBody(BRIDGE, "async stop(): Promise<void> {");
  assert.ok(stop.indexOf("this.stopRequested = true;") < stop.indexOf("const starting = this.starting;"));
  assert.ok(stop.includes("return l?.close();"), "a stop during a start chains the close onto it");
  const firstAwait = stop.indexOf("await l.close();");
  assert.ok(firstAwait > 0 && !stop.slice(stop.indexOf("const l = this.listener;"), firstAwait).includes("await"));

  const lost = methodBody(BRIDGE, "private onSocketLost(reason: string): void {");
  assert.ok(lost.includes("const l = this.listener;\n    this.listener = null;\n    void l?.close().catch("));
  assert.ok(lost.includes("new Notice(`Bridge stopped: ${reason}`);"));

  // A close() nothing awaits rejects when the published name cannot be moved aside; each one logs which it was.
  assert.equal(/void [\w?.]*close\(\)(?!\.catch\()/.test(BRIDGE), false, "a close() nothing awaits has no .catch");
  assert.equal(BRIDGE.split(".close().catch(warnCloseFailed(").length - 1, 3, "the three such closes name themselves");
});

test("onunload sets disposed first and closes the bridge before the runner, the tracker and the video run", () => {
  const unload = methodBody(MAIN, "onunload(): void {");
  const statements = unload.split("\n").map((line) => line.trim()).filter((line) => line !== "" && !line.startsWith("//"));
  assert.equal(statements[0], "this.disposed = true;");
  const stop = unload.indexOf("this.bridgeServer?.stop()");
  assert.ok(stop > 0, "onunload stops the bridge");
  for (const later of ["this.runner.cancel();", "this.tracker?.stop();", "this.videoPipeline.abort("]) {
    assert.ok(unload.indexOf(later) > stop, `the bridge closes before ${later}`);
  }
  assert.ok(MAIN.includes("this.app.workspace.onLayoutReady(() => {\n      if (this.disposed) return;"));
  assert.ok(MAIN.includes("isDisposed: () => this.disposed,"));
  assert.ok(MAIN.includes("register: (cb) => this.register(cb),"));
});

test("settings show the socket instead of a port, and bridgePort is no longer a setting", () => {
  const settings = read("settings.ts");
  assert.ok(settings.includes("Running on unix:${this.plugin.bridgeSocketPath}"));
  assert.equal(settings.includes("settings.bridgePort"), false, "no port field and no rebind");
  for (const rel of ["types.ts", "constants.ts"]) {
    assert.equal(/^\s*bridgePort\s*:/m.test(read(rel)), false, `${rel} still declares bridgePort`);
  }
});

// ─── The lifecycle, run: the source's start(), openListener(), stop() and onSocketLost() on a real socket ─────────
//
// The methods are taken from the source with methodBody, stripped of their types by the stripper node --test runs this
// file with, and compiled into a class that also has the bridge's own fields and warnCloseFailed. They serve <home>'s
// command-center.sock through the real helper. The rest is a stand-in: the token (the real one is a file under
// ~/.config, never read here), the vault name, Notice, console, and a request handler that answers GET /healthz.

const NAME = SOCKET_NAMES.commandCenter;
const LIFECYCLE = [
  "get isRunning(): boolean {",
  "get socketPath(): string | null {",
  "start(): Promise<UdsListener | null> {",
  "private async openListener(): Promise<UdsListener | null> {",
  "async stop(): Promise<void> {",
  "private onSocketLost(reason: string): void {",
];

/** The class's fields, from its opening line to the constructor: their initial values are part of the lifecycle. */
function classFields(source: string): string {
  const head = "export class McpBridgeServer {";
  const start = source.indexOf(head);
  const end = source.indexOf("\n  constructor(", start);
  assert.ok(start >= 0 && end > start, "no McpBridgeServer fields");
  return source.slice(start + head.length, end);
}

/** A top-level function, from `function <name>(` to its closing brace in the first column. */
function topLevelFunction(source: string, name: string): string {
  const start = source.indexOf(`\nfunction ${name}(`);
  assert.ok(start >= 0, `no function ${name}`);
  const end = source.indexOf("\n}\n", start);
  assert.ok(end > start, `no end for function ${name}`);
  return source.slice(start + 1, end + 2);
}

interface LifecycleDeps {
  listenHttpOnSocket(handler: http.RequestListener, opts: UdsListenOptions): Promise<UdsListener>;
  socketPathFor(name: string): string;
  SOCKET_NAMES: typeof SOCKET_NAMES;
  loadOrCreateBridgeToken(): string;
  Notice: new (message: string) => unknown;
  console: Pick<Console, "log" | "warn" | "error">;
  handleRequest: http.RequestListener;
}

/** What the tests use of a compiled bridge: members of the source's class, unchanged. */
interface LifecycleBridge {
  readonly isRunning: boolean;
  readonly socketPath: string | null;
  starting: Promise<UdsListener | null> | null;
  start(): Promise<UdsListener | null>;
  stop(): Promise<void>;
  onSocketLost(reason: string): void;
}

let compiled: ((deps: LifecycleDeps) => new () => LifecycleBridge) | null = null;

function lifecycleClass(): (deps: LifecycleDeps) => new () => LifecycleBridge {
  if (compiled !== null) return compiled;
  const ts = [
    topLevelFunction(BRIDGE, "warnCloseFailed"),
    "class LifecycleBridge {",
    classFields(BRIDGE),
    '  app = { vault: { getName: () => "Test vault" } };',
    "  handleRequest(req, res) { deps.handleRequest(req, res); }",
    "  handleHealth() { return { tools: [] }; }",
    ...LIFECYCLE.map((signature) => `  ${signature}${methodBody(BRIDGE, signature)}\n  }`),
    "}",
  ].join("\n");
  const wrapped =
    "(function (deps) {\n" +
    "const { listenHttpOnSocket, socketPathFor, SOCKET_NAMES, loadOrCreateBridgeToken, Notice, console } = deps;\n" +
    `${stripTypeScriptTypes(ts)}\nreturn LifecycleBridge;\n})`;
  compiled = vm.runInThisContext(wrapped, { filename: "mcp-bridge-server.ts (lifecycle methods)" });
  return compiled!;
}

const homes: string[] = [];
const bridges: LifecycleBridge[] = [];

afterEach(async () => {
  await Promise.allSettled(bridges.splice(0).map((b) => b.stop()));
  for (const h of homes.splice(0)) rmSync(h, { recursive: true, force: true });
});

/** macOS sun_path holds 104 bytes, so homes are short: /tmp/uds-XXXXXX, never os.tmpdir(). */
function makeHome(): string {
  const home = mkdtempSync("/tmp/uds-");
  homes.push(home);
  return home;
}

/** handleRequest's stand-in: 200 and {"status":"ok"} on GET /healthz, 404 on anything else. */
function answerHealthz(req: http.IncomingMessage, res: http.ServerResponse): void {
  const ok = req.method === "GET" && req.url === "/healthz";
  const body = JSON.stringify(ok ? { status: "ok" } : { error: "Not found" });
  res.writeHead(ok ? 200 : 404, { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) });
  res.end(body);
}

/** A bridge made of the source's lifecycle methods on <home>; `said` collects its console lines and notices. */
function lifecycleBridge(home: string): { bridge: LifecycleBridge; said: string[] } {
  const said: string[] = [];
  const line = (kind: string) => (...parts: unknown[]) => {
    said.push(`${kind}: ${parts.map(String).join(" ")}`);
  };
  const Bridge = lifecycleClass()({
    listenHttpOnSocket: (handler, opts) => listenHttpOnSocket(handler, { ...opts, home, watchIntervalMs: 0 }),
    socketPathFor: (name) => socketPathFor(name, home),
    SOCKET_NAMES,
    loadOrCreateBridgeToken: () => "f".repeat(64), // the shape of a bridge token, not a real one
    Notice: class {
      constructor(message: string) {
        said.push(`notice: ${message}`);
      }
    },
    console: { log: line("log"), warn: line("warn"), error: line("error") },
    handleRequest: answerHealthz,
  });
  const bridge = new Bridge();
  bridges.push(bridge);
  return { bridge, said };
}

/** GET /healthz the way the bridge's clients ask: requestOverSocket to <home>'s command-center.sock. */
function healthzStatus(home: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = requestOverSocket(socketPathFor(NAME, home), NAME, { method: "GET", path: "/healthz", timeout: 2000 }, home);
    req.on("timeout", () => req.destroy(new Error("GET /healthz timed out")));
    req.on("error", reject);
    req.on("response", (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode ?? 0));
    });
    req.end();
  });
}

const startedLines = (said: string[]): string[] => said.filter((l) => l.startsWith("log: [OpenClaw] MCP bridge started on unix:"));

test("Start, Stop, Start while the first start is in flight: the bridge serves, on exactly one published socket", async () => {
  const home = makeHome();
  const { bridge, said } = lifecycleBridge(home);
  const first = bridge.start();
  const stopped = bridge.stop();
  const second = bridge.start();
  assert.ok((await first) === null, "the Stop doomed the first start");
  await stopped;
  assert.ok((await second) !== null, "the second Start came last, so it serves");
  assert.equal(bridge.isRunning, true);
  assert.equal(bridge.socketPath, socketPathFor(NAME, home));
  assert.equal(await healthzStatus(home), 200);
  assert.deepEqual(readdirSync(runDir(home)), [NAME], "one published socket and no hidden name");
  assert.equal(startedLines(said).length, 1, said.join(" | "));
});

// This one guards the stopCalls half of the fix, not the race itself: the start() of before review round 2 also ends
// stopped here (it joined the doomed start). A start() that always retried after a doomed start would serve instead.
test("Start, Stop, Start, Stop in one burst: the bridge ends stopped, with no socket left", async () => {
  const home = makeHome();
  const { bridge, said } = lifecycleBridge(home);
  const [first, , second] = await Promise.all([bridge.start(), bridge.stop(), bridge.start(), bridge.stop()]);
  assert.ok(first === null, "the Stop doomed the first start");
  assert.ok(second === null, "the Stop after the second Start cancelled it before it began");
  assert.equal(bridge.isRunning, false);
  assert.equal(bridge.starting, null, "nothing is left starting");
  assert.deepEqual(readdirSync(runDir(home)), []);
  assert.deepEqual(startedLines(said), []);
});

test("Start, Stop, Start, Stop, Start in one burst: the last Start serves", async () => {
  const home = makeHome();
  const { bridge, said } = lifecycleBridge(home);
  const calls = [bridge.start(), bridge.stop(), bridge.start(), bridge.stop(), bridge.start()];
  const [first, , second, , third] = await Promise.all(calls);
  assert.ok(first === null, "the Stop doomed the first start");
  assert.ok(second === null, "the Stop after the second Start cancelled it");
  assert.ok(third !== null, "the third Start came last");
  assert.equal(await healthzStatus(home), 200);
  assert.deepEqual(readdirSync(runDir(home)), [NAME]);
  assert.equal(startedLines(said).length, 1, said.join(" | "));
});

test("a close() nothing awaits that fails is logged with which close it was, not left as an unhandled rejection", async () => {
  const home = makeHome();
  const { bridge, said } = lifecycleBridge(home);
  assert.notEqual(await bridge.start(), null);
  chmodSync(runDir(home), 0o500); // the published name can no longer be moved aside, so close() rejects
  try {
    bridge.onSocketLost(`${socketPathFor(NAME, home)} was removed`); // close() tries the move before this returns
  } finally {
    chmodSync(runDir(home), 0o700); // at once, so afterEach can remove the home even if this test fails
  }
  const until = Date.now() + 2000;
  while (!said.some((l) => l.startsWith("warn: [OpenClaw] Bridge close failed")) && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(bridge.isRunning, false);
  const failed = said.filter((l) => l.startsWith("warn: [OpenClaw] Bridge close failed"));
  assert.equal(failed.length, 1, said.join(" | "));
  assert.match(failed[0], /^warn: \[OpenClaw\] Bridge close failed \(after its socket name was lost\): EACCES/);
  assert.ok(said.includes(`notice: Bridge stopped: ${socketPathFor(NAME, home)} was removed`));
});
