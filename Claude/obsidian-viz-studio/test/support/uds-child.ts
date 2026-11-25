// Child process for test/uds-listener.test.ts: serves one bridge socket through the helper, the way this
// plugin in a second Obsidian window would. HOME is the test's /tmp/uds-* home, so the socket path comes
// from os.homedir() exactly as it does in the plugin.
//
//   node --experimental-strip-types --no-warnings test/support/uds-child.ts <socket name> [<start at, epoch ms>]
//
// Waits until the start time (so two children can start at the same instant), then prints
// "ready <pid>" once it serves, or "refused <code>" and exits 3. It answers every request with
// {"tag":"child-<pid>"}, and closes its listener and exits 0 when its stdin ends.
import { listenHttpOnSocket, socketPathFor, UdsListenerError } from "../../src/bridge/uds-listener.ts";

const name = process.argv[2] ?? "";
const startAt = Number(process.argv[3] ?? "0");
const tag = `child-${process.pid}`;

const wait = startAt - Date.now();
if (wait > 0) await new Promise<void>((resolve) => setTimeout(resolve, wait));

try {
  const listener = await listenHttpOnSocket(
    (_req, res) => {
      const body = JSON.stringify({ tag });
      res.writeHead(200, { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) });
      res.end(body);
    },
    { socketPath: socketPathFor(name), watchIntervalMs: 0 }
  );
  process.stdin.on("end", () => {
    void listener.close().then(() => process.exit(0));
  });
  process.stdin.resume();
  process.stdout.write(`ready ${process.pid}\n`);
} catch (err) {
  const code = err instanceof UdsListenerError ? err.code : String(err);
  process.stdout.write(`refused ${code}\n`, () => process.exit(3));
}
