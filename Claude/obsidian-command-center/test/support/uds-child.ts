// Child process for test/uds-listener.test.ts, run as `node --experimental-strip-types uds-child.ts <mode> <home> <name>`.
// The socket path is derived from the home in code (socketPathFor), so no path under the run directory is ever on
// a command line. Every line it writes to stdout ends in "\n".
//   serve  listen with the helper, write "ready <pid>", stay up until stdin ends (then close and exit) or a kill.
//   race   write "armed", wait for "go <epoch ms>" on stdin, spin until that instant, then try to listen and write
//          "won" or "lost <code>"; stay up until stdin ends (then close and exit).
// Every response body is {"ok":true,"pid":<pid>}, so the parent can tell which process serves the path.
import * as fs from "node:fs";
import type * as http from "node:http";
import { listenHttpOnSocket, socketPathFor, type UdsListener } from "../../src/bridge/uds-listener.ts";

const [mode, home, name] = process.argv.slice(2);
const socketPath = socketPathFor(name, home);
let listener: UdsListener | null = null;

/** Synchronous: stdout is an asynchronous pipe on macOS, and the parent waits for whole lines. */
function say(line: string): void {
  fs.writeSync(1, `${line}\n`);
}

const handler: http.RequestListener = (_req, res) => {
  const body = JSON.stringify({ ok: true, pid: process.pid });
  res.writeHead(200, { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) });
  res.end(body);
};

async function listen(): Promise<void> {
  listener = await listenHttpOnSocket(handler, { socketPath, home, watchIntervalMs: 0 });
}

async function race(at: number): Promise<void> {
  while (Date.now() < at) {
    // spin, so both racers leave this loop within microseconds of each other
  }
  try {
    await listen();
    say("won");
  } catch (err) {
    say(`lost ${(err as { code?: string }).code ?? String(err)}`);
  }
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
  input += chunk;
  const go = /^go (\d+)\n/.exec(input);
  if (go !== null && mode === "race") {
    input = "";
    void race(Number(go[1]));
  }
});
process.stdin.on("end", () => {
  void (async () => {
    await listener?.close();
    process.exit(0);
  })();
});

if (mode === "serve") {
  listen().then(
    () => say(`ready ${process.pid}`),
    (err: { code?: string }) => {
      say(`error ${err.code ?? String(err)}`);
      process.exit(1);
    }
  );
} else if (mode === "race") {
  say("armed");
} else {
  say(`error unknown mode ${String(mode)}`);
  process.exit(2);
}
