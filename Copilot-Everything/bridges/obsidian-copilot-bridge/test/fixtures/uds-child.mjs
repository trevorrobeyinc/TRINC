// Child process for the bridge's Unix-socket specs (src/tests/udsListener.spec.ts).
//
// It lives outside src/ so the bridge's lint:transport never scans it, and under test/ so the monorepo
// transport lint skips it as well. It serves through the shared helper itself, from the .mts copy the
// spec passes in: this package is CommonJS, so Node loads the TypeScript helper as an ES module only
// under an .mts name, with --experimental-strip-types. Every path comes in on argv; nothing is derived
// from this process's own home directory.
//
// argv: <helper .mts copy> <home> <socket name> [<start instant, epoch ms>]
// stdout, one JSON line:
//   {"event":"up","pid":N}             it serves on the published name, until it is killed
//   {"event":"refused","code":"..."}   the helper refused; the process then exits 3
import * as fs from "node:fs";
import { pathToFileURL } from "node:url";

const [helperPath, home, name, startAt] = process.argv.slice(2);
const helper = await import(pathToFileURL(helperPath).href);

function report(message) {
  fs.writeSync(1, `${JSON.stringify(message)}\n`); // synchronous: stdout is an asynchronous pipe on macOS
}

if (startAt !== undefined) {
  // Racers start at one wall-clock instant: sleep most of the way, then spin the last milliseconds.
  const at = Number(startAt);
  const sleepMs = at - Date.now() - 20;
  if (sleepMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, sleepMs));
  }
  while (Date.now() < at) {
    // spin
  }
}

try {
  await helper.listenHttpOnSocket(
    (_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, tag: "child", pid: process.pid }));
    },
    { socketPath: helper.socketPathFor(name, home), home, watchIntervalMs: 0 }
  );
  report({ event: "up", pid: process.pid });
} catch (err) {
  report({ event: "refused", code: err !== null && typeof err === "object" ? err.code : String(err) });
  process.exit(3);
}
