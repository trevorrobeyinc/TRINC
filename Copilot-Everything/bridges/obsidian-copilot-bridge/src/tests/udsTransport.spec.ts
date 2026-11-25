import fs from "node:fs";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeContext } from "../server/context";

// The audit sink is a process singleton that reads TREVCLAW_AUDIT_LOG when its module loads. vi.hoisted
// runs before every import below, so the sink points at a temp file: tests must never write the real
// audit trail that OSSEC tails.
const { auditFile } = vi.hoisted(() => {
  const file = `${process.env.TMPDIR ?? "/tmp"}/uds-transport-audit-${process.pid}-${Date.now()}.jsonl`;
  process.env.TREVCLAW_AUDIT_LOG = file;
  return { auditFile: file };
});

import { EventBus } from "../server/eventBus";
import { DAEMON_CLOSE_GRACE_MS, PIDFILE_NAME, startUdsTransport, writePidfile } from "../server/udsTransport";
import { requestOverSocket, runDir, SOCKET_NAMES, socketPathFor, UdsListenerError, type UdsListener } from "../server/udsListener";
import { expectUdsRejection, getOverSocket, makeRunDirChain, makeShortHome, modeOf, readReply, sleep, waitFor } from "./udsSpecHelpers";

// bridges-uds D3/D4: the daemon's transport on vault-bridge.sock (closeGraceMs 2000, pidfile, SOCKET_LOST
// and SOCKET_REFUSED audit events, exit 1 when the name is lost). Every case passes a short temp home.

const NAME = SOCKET_NAMES.vaultBridge;
const TOKEN = "b7e1c9d2a4f60851e3b2c7d9a1f4e6b8c0d2e4f6a8b0c2d4";

type LogLine = [level: string, message: string, fields: Record<string, unknown>];

const homes: string[] = [];
const listeners: UdsListener[] = [];

afterEach(async () => {
  await Promise.allSettled(listeners.splice(0).map((listener) => listener.close()));
  for (const home of homes.splice(0)) {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

afterAll(() => {
  fs.rmSync(auditFile, { force: true });
});

function home(): string {
  const dir = makeShortHome();
  homes.push(dir);
  return dir;
}

function fakeRuntime(dir: string, logs: LogLine[]): RuntimeContext {
  const log = (level: string) => (message: string, fields?: Record<string, unknown>) => {
    logs.push([level, message, fields ?? {}]);
  };
  return {
    config: {
      transport: { mode: "uds", udsPath: socketPathFor(NAME, dir), pipeName: "obsidian-mcp-bridge" },
      security: {
        replayWindowSeconds: 60,
        nonceTtlSeconds: 120,
        rateLimitPerMinute: 600,
        globalRateLimitPerMinute: 600,
        authToken: TOKEN,
        executeCommandAllowlist: [],
      },
    },
    metrics: { increment: () => undefined },
    logger: { info: log("info"), warn: log("warn"), error: log("error") },
    eventBus: new EventBus(),
  } as unknown as RuntimeContext;
}

async function startTransport(runtime: RuntimeContext, dir: string, extra: Parameters<typeof startUdsTransport>[1] = {}) {
  const listener = await startUdsTransport(runtime, { home: dir, ...extra });
  listeners.push(listener);
  return listener;
}

function auditEvents(): Array<Record<string, unknown>> {
  if (!fs.existsSync(auditFile)) {
    return [];
  }
  return fs
    .readFileSync(auditFile, "utf8")
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function pidfileTemps(dir: string): string[] {
  return fs.readdirSync(runDir(dir)).filter((entry) => entry.startsWith(`${PIDFILE_NAME}.`));
}

describe("udsTransport: the vault bridge on vault-bridge.sock", () => {
  it("serves the bridge's request listener over the socket and logs the published path", async () => {
    const dir = home();
    const logs: LogLine[] = [];
    const listener = await startTransport(fakeRuntime(dir, logs), dir);
    expect(listener.socketPath).toBe(socketPathFor(NAME, dir));

    const reply = await getOverSocket(listener.socketPath, NAME, dir);
    expect(reply.status).toBe(200);
    expect(reply.json).toMatchObject({ ok: true, status: "ready" });

    const started = logs.find(([, message]) => message === "uds_transport_started");
    expect(started?.[2].socketPath).toBe(listener.socketPath); // never server.address(), the hidden bind name
    expect(String(listener.server.address())).not.toBe(listener.socketPath);
  });

  it("logs a server 'error' after listen as uds_server_error instead of throwing it, and keeps serving", async () => {
    const dir = home();
    const logs: LogLine[] = [];
    const listener = await startTransport(fakeRuntime(dir, logs), dir);

    // The helper drops its once("error") as soon as the server listens. With no listener of the transport's own,
    // this emit throws (in the daemon: an uncaught exception from a failed accept, EMFILE or ENOBUFS, ends it).
    expect(() => listener.server.emit("error", new Error("accept failed"))).not.toThrow();
    const logged = logs.find(([, message]) => message === "uds_server_error");
    expect(logged?.[0]).toBe("error");
    expect(logged?.[2]).toEqual({ socketPath: listener.socketPath, error: "accept failed" }); // no token, no header
    expect(JSON.stringify(logs)).not.toContain(TOKEN);

    const reply = await getOverSocket(listener.socketPath, NAME, dir);
    expect(reply.status).toBe(200);
  });

  it("still refuses browser headers (403) and unauthenticated tool calls (401) over the socket; audits remote as unknown", async () => {
    const dir = home();
    const listener = await startTransport(fakeRuntime(dir, []), dir);

    const browser = await getOverSocket(listener.socketPath, NAME, dir, "/healthz", { Origin: "https://evil.example" });
    expect(browser.status).toBe(403);
    expect(auditEvents().at(-1)).toMatchObject({ eventType: "BROWSER_REJECT", remote: "unknown" });

    const unauthenticated = await readReply(
      requestOverSocket(listener.socketPath, NAME, { method: "POST", path: "/mcp/tool", headers: { "content-type": "application/json" } }, dir)
    );
    expect(unauthenticated.status).toBe(401);
    expect(auditEvents().at(-1)).toMatchObject({ eventType: "AUTH_FAIL", remote: "unknown" });
  });

  it("writes the pidfile <pid>\\n 0600 after publishing, and keeps it after close()", async () => {
    const dir = home();
    const listener = await startTransport(fakeRuntime(dir, []), dir);
    const pidfile = path.join(runDir(dir), PIDFILE_NAME);
    const st = fs.lstatSync(pidfile);
    expect(st.isFile() && !st.isSymbolicLink()).toBe(true);
    expect(modeOf(pidfile)).toBe(0o600);
    expect(fs.readFileSync(pidfile, "utf8")).toBe(`${process.pid}\n`);
    expect(pidfileTemps(dir)).toEqual([]);

    await listener.close();
    expect(fs.existsSync(listener.socketPath)).toBe(false);
    expect(fs.readFileSync(pidfile, "utf8")).toBe(`${process.pid}\n`); // never deleted
  });

  it("rewrites the pidfile by rename and never follows a planted temp-name symlink", () => {
    const dir = home();
    const run = makeRunDirChain(dir);
    const pidfile = path.join(run, PIDFILE_NAME);
    fs.writeFileSync(pidfile, "4242\n", { mode: 0o600 });
    const before = fs.lstatSync(pidfile).ino;
    const outside = path.join(dir, "outside.txt");
    fs.writeFileSync(outside, "keep");
    fs.symlinkSync(outside, path.join(run, `${PIDFILE_NAME}.31337.tmp`));

    expect(writePidfile(run, 31337)).toBe(pidfile);
    expect(fs.readFileSync(pidfile, "utf8")).toBe("31337\n");
    expect(fs.lstatSync(pidfile).ino).not.toBe(before);
    expect(modeOf(pidfile)).toBe(0o600);
    expect(fs.readFileSync(outside, "utf8")).toBe("keep");
    expect(pidfileTemps(dir)).toEqual([]);
  });

  it("gives open connections the daemon's 2 s grace on close()", async () => {
    expect(DAEMON_CLOSE_GRACE_MS).toBe(2_000);
    const dir = home();
    const listener = await startTransport(fakeRuntime(dir, []), dir);
    const req = requestOverSocket(
      listener.socketPath,
      NAME,
      { method: "GET", path: "/mcp/events?stream=research", headers: { Authorization: `Bearer ${TOKEN}` } },
      dir
    );
    const subscribed = new Promise<void>((resolve, reject) => {
      req.on("response", (res) => {
        res.on("error", () => undefined);
        res.once("data", () => resolve());
      });
      req.on("error", () => undefined);
      setTimeout(() => reject(new Error("no SSE frame within 2 s")), 2_000);
    });
    req.end();
    await subscribed;

    let closed = false;
    const closing = listener.close().then(() => {
      closed = true;
    });
    await sleep(1_500); // past the helper's 1 s default
    expect(closed).toBe(false);
    req.destroy(); // the client leaves: close() finishes at once
    await closing;
    expect(fs.existsSync(listener.socketPath)).toBe(false);
  });
});

describe("udsTransport: refusals and a lost socket", () => {
  it.each([
    ["a regular file at the socket path", "NOT_A_SOCKET"],
    ["a run directory with mode 0755", "RUN_DIR_MODE"],
  ])("audits SOCKET_REFUSED for %s and rethrows (%s); the pidfile is left alone", async (_what, code) => {
    const dir = home();
    const run = makeRunDirChain(dir);
    const pidfile = path.join(run, PIDFILE_NAME);
    fs.writeFileSync(pidfile, "4242\n", { mode: 0o600 });
    if (code === "NOT_A_SOCKET") {
      fs.writeFileSync(socketPathFor(NAME, dir), "not a socket");
    } else {
      fs.chmodSync(run, 0o755);
    }
    const logs: LogLine[] = [];

    const error = await expectUdsRejection(startUdsTransport(fakeRuntime(dir, logs), { home: dir }), code);
    expect(error).toBeInstanceOf(UdsListenerError);
    expect(auditEvents().at(-1)).toMatchObject({
      eventType: "SOCKET_REFUSED",
      errorCode: code,
      source: "obsidian-copilot-bridge",
      socketPath: socketPathFor(NAME, dir),
    });
    expect(logs.find(([, message]) => message === "uds_socket_refused")?.[2].errorCode).toBe(code);
    expect(fs.readFileSync(pidfile, "utf8")).toBe("4242\n"); // a refused start must not overwrite the holder's pid
    fs.chmodSync(run, 0o700);
  });

  it("audits SOCKET_LOST and exits 1 when vault-bridge.sock is removed while it serves", async () => {
    const dir = home();
    const logs: LogLine[] = [];
    const exits: number[] = [];
    const listener = await startTransport(fakeRuntime(dir, logs), dir, { watchIntervalMs: 50, exit: (code) => exits.push(code) });

    fs.unlinkSync(listener.socketPath);
    expect(await waitFor(() => exits.length > 0, 2_000)).toBe(true);
    await sleep(150);
    expect(exits).toEqual([1]);
    const lost = auditEvents().at(-1);
    expect(lost).toMatchObject({ eventType: "SOCKET_LOST", source: "obsidian-copilot-bridge", socketPath: listener.socketPath });
    expect(String(lost?.reason)).toMatch(/was removed/);
    expect(logs.some(([level, message]) => level === "error" && message === "uds_socket_lost")).toBe(true);
  });
});
