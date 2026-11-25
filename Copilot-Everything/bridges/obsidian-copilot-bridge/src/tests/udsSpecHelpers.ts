import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import type http from "node:http";
import path from "node:path";
import { expect } from "vitest";
import { requestOverSocket, UdsListenerError } from "../server/udsListener";

// Shared by the socket specs. Not a spec itself (vitest collects src/**/*.spec.ts only). Like every file
// under src/, it must not contain a server constructor or a listen call: the bridge's lint:transport
// allows those only in udsListener.ts and windowsPipeTransport.ts. Child processes are therefore a
// fixture outside src/ (test/fixtures/uds-child.mjs).

const FIXTURE = path.resolve(__dirname, "..", "..", "test", "fixtures", "uds-child.mjs");
const HELPER_SOURCE = path.resolve(__dirname, "..", "server", "udsListener.ts");

/**
 * A short temp home. macOS socket paths hold 103 bytes, and the helper also binds a hidden name 22
 * bytes longer than the published one, so homes come from /tmp/uds-*: never os.tmpdir() (59-byte
 * homes are refused) and never the scratchpad.
 */
export function makeShortHome(): string {
  return fs.mkdtempSync("/tmp/uds-");
}

/** Create <home>/.local/state/trinc/run by hand, every level 0700. */
export function makeRunDirChain(home: string): string {
  let current = home;
  for (const level of [".local", "state", "trinc", "run"]) {
    current = path.join(current, level);
    if (!fs.existsSync(current)) {
      fs.mkdirSync(current);
    }
    fs.chmodSync(current, 0o700);
  }
  return current;
}

export function modeOf(p: string): number {
  return fs.lstatSync(p).mode & 0o7777;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function waitFor(condition: () => boolean, timeoutMs: number): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (condition()) {
      return true;
    }
    await sleep(10);
  }
  return condition();
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface Reply {
  status: number;
  body: string;
  json: Record<string, unknown> | undefined;
}

export function readReply(req: http.ClientRequest): Promise<Reply> {
  return new Promise((resolve, reject) => {
    req.on("response", (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("error", reject);
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        let json: Record<string, unknown> | undefined;
        try {
          json = JSON.parse(body) as Record<string, unknown>;
        } catch {
          json = undefined;
        }
        resolve({ status: res.statusCode ?? 0, body, json });
      });
    });
    req.on("timeout", () => req.destroy(new Error("request over the socket timed out")));
    req.on("error", reject);
    req.end();
  });
}

/** GET through the helper's client rules: trust check on the exact path, then a request pinned to the socket. */
export function getOverSocket(
  socketPath: string,
  expectedName: string,
  home: string,
  reqPath = "/healthz",
  headers: http.OutgoingHttpHeaders = {}
): Promise<Reply> {
  return readReply(requestOverSocket(socketPath, expectedName, { method: "GET", path: reqPath, timeout: 2000, headers }, home));
}

export function expectUdsCode(fn: () => unknown, code: string): UdsListenerError {
  let caught: unknown = null;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(UdsListenerError);
  expect((caught as UdsListenerError).code).toBe(code);
  return caught as UdsListenerError;
}

export async function expectUdsRejection(promise: Promise<unknown>, code: string): Promise<UdsListenerError> {
  let caught: unknown = null;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(UdsListenerError);
  expect((caught as UdsListenerError).code).toBe(code);
  return caught as UdsListenerError;
}

/** Copy the helper for child processes: Node loads it as an ES module only under an .mts name here. */
export function copyHelperForChildren(dir: string): string {
  const dest = path.join(dir, "udsListener.mts");
  fs.copyFileSync(HELPER_SOURCE, dest);
  return dest;
}

export interface ChildReport {
  event: "up" | "refused";
  pid?: number;
  code?: string;
}

export interface SocketChild {
  child: ChildProcess;
  report: Promise<ChildReport>;
  exited: Promise<void>;
}

/** Start test/fixtures/uds-child.mjs, which serves `name` in `home` through the helper copy. */
export function spawnSocketChild(helperCopy: string, home: string, name: string, startAt?: number): SocketChild {
  const args = ["--experimental-strip-types", "--no-warnings", FIXTURE, helperCopy, home, name];
  if (startAt !== undefined) {
    args.push(String(startAt));
  }
  const child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"] });
  const exited = new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
  });
  const report = new Promise<ChildReport>((resolve, reject) => {
    let out = "";
    let err = "";
    const timer = setTimeout(() => reject(new Error(`socket child sent no report within 10 s: ${out} ${err}`)), 10_000);
    child.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
      const nl = out.indexOf("\n");
      if (nl >= 0) {
        clearTimeout(timer);
        try {
          resolve(JSON.parse(out.slice(0, nl)) as ChildReport);
        } catch (error) {
          reject(error);
        }
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      err += chunk.toString("utf8");
    });
    // "close", not "exit": "exit" can arrive before the last stdout bytes are read.
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      reject(new Error(`socket child closed before reporting: code ${code} signal ${signal} ${err}`));
    });
  });
  return { child, report, exited };
}

export function killChild(child: ChildProcess): void {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
  }
}
