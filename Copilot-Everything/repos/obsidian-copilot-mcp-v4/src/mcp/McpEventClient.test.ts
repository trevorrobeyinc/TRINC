/**
 * @jest-environment node
 */
// A real Unix-socket "vault bridge" in a short /tmp/uds-* home, removed after each test.
import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { McpEventClient, type McpEvent } from "./McpEventClient";
import { BRIDGE_SOCKET_NAMES, setUdsClientDepsForTests, type BridgeSocket } from "./udsClient";

// The shared obsidian mock touches `window`, which this environment lacks.
jest.mock("obsidian", () => ({ Platform: { isDesktopApp: true, isMobile: false } }));
jest.mock("@/logger", () => ({ logInfo: jest.fn(), logWarn: jest.fn() }));

const RUN_SEGMENTS = [".local", "state", "trinc", "run"];

let home = "";
let socket: BridgeSocket;
let server: http.Server | undefined;
let client: McpEventClient | undefined;
const seen: http.IncomingMessage[] = [];

function makeRunDir(): void {
  home = fs.mkdtempSync("/tmp/uds-");
  let dir = home;
  for (const part of RUN_SEGMENTS) {
    dir = path.join(dir, part);
    fs.mkdirSync(dir, { mode: 0o700 });
  }
  socket = {
    socketPath: path.join(dir, BRIDGE_SOCKET_NAMES.vaultBridge),
    expectedName: BRIDGE_SOCKET_NAMES.vaultBridge,
  };
  setUdsClientDepsForTests({
    fs,
    path,
    os: { ...os, homedir: () => home },
    http,
    net,
    childProcess,
  });
}

/** Serve the socket; `onRequest` writes the stream for each subscription. */
async function serve(onRequest: (res: http.ServerResponse, index: number) => void): Promise<void> {
  const bridge = http.createServer((req, res) => {
    seen.push(req);
    onRequest(res, seen.length - 1);
  });
  server = bridge;
  await new Promise<void>((resolve, reject) => {
    bridge.once("error", reject);
    bridge.listen(socket.socketPath, () => resolve());
  });
  fs.chmodSync(socket.socketPath, 0o600);
}

async function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not met in time");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function startClient(options: { idleTimeoutMs?: number } = {}): McpEvent[] {
  const events: McpEvent[] = [];
  client = new McpEventClient({
    socket,
    authToken: "test-token",
    initialBackoffMs: 20,
    maxBackoffMs: 40,
    ...options,
  });
  client.subscribe((event) => events.push(event));
  client.start();
  return events;
}

beforeEach(() => {
  seen.length = 0;
  makeRunDir();
});

afterEach(async () => {
  client?.stop();
  client = undefined;
  const bridge = server;
  server = undefined;
  if (bridge) {
    (bridge as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
    await new Promise<void>((resolve) => bridge.close(() => resolve()));
  }
  setUdsClientDepsForTests(null);
  fs.rmSync(home, { recursive: true, force: true });
});

describe("McpEventClient", () => {
  describe("start()", () => {
    it("subscribes over the socket with the bearer token and hands research events to subscribers", async () => {
      await serve((res) => {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(": subscribed stream=research\n\n");
        res.write('data: {"type":"research_arrived","stream":"research","title":"Trial"}\n\n');
      });

      const events = startClient();
      await waitFor(() => events.length === 1);

      expect(events[0]).toMatchObject({ type: "research_arrived", title: "Trial" });
      expect(seen[0].url).toBe("/mcp/events?stream=research");
      expect(seen[0].headers).toMatchObject({
        authorization: "Bearer test-token",
        accept: "text/event-stream",
      });
      expect(seen[0].socket.localPort).toBeUndefined();
    });

    it("reconnects with backoff after the bridge ends the stream", async () => {
      await serve((res, index) => {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        if (index === 0) res.end();
      });

      startClient();
      await waitFor(() => seen.length === 2);
    });

    it("drops a stream that stays silent past the idle timeout and subscribes again", async () => {
      await serve((res) => {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(": subscribed\n\n");
      });

      startClient({ idleTimeoutMs: 100 });
      await waitFor(() => seen.length === 2);
    });

    it("keeps retrying while the socket is missing and subscribes once the bridge is up", async () => {
      const events = startClient();
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(seen).toHaveLength(0);

      await serve((res) => {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write('data: {"type":"research_arrived","stream":"research"}\n\n');
      });
      await waitFor(() => events.length === 1);
    });
  });

  describe("stop()", () => {
    it("closes the stream and never reconnects", async () => {
      let closed = false;
      await serve((res) => {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(": subscribed\n\n");
        res.on("close", () => {
          closed = true;
        });
      });

      startClient();
      await waitFor(() => seen.length === 1);
      client?.stop();
      await waitFor(() => closed);
      await new Promise((resolve) => setTimeout(resolve, 120));

      expect(seen).toHaveLength(1);
    });
  });
});
