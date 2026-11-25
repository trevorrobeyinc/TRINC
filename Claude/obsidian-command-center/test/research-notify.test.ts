// Tests for src/subprocess/research-notify.ts: the post-run chain's research_notify request to the vault bridge over
// vault-bridge.sock (bridges-uds, 2026-11-24). Run: npm test
//
// openclaw-runner.ts cannot load under node --test (its imports are extensionless), so the request lives in a module
// of its own and the runner only reads the token and calls it; the last test reads the runner's source to keep it
// that way. A fake vault bridge is served with the bridges' helper on a short /tmp/uds-* home, and every call passes
// that home: nothing here touches the real run directory or reads a real token.
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import type * as http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  listenHttpOnSocket,
  SOCKET_NAMES,
  socketPathFor,
  UdsListenerError,
  type UdsListener,
} from "../src/bridge/uds-listener.ts";
import {
  postResearchNotify,
  RESEARCH_NOTIFY_TIMEOUT_MS,
  researchNotifyBody,
  researchNotifyHeaders,
} from "../src/subprocess/research-notify.ts";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const TOKEN = "f".repeat(64); // a stand-in with the shape of a bridge token, not a real one
const NONCE = "00000000-0000-4000-8000-000000000000";
const NOW = 1_764_000_000_000;

const homes: string[] = [];
const listeners: UdsListener[] = [];

afterEach(async () => {
  await Promise.allSettled(listeners.splice(0).map((l) => l.close()));
  for (const h of homes.splice(0)) fs.rmSync(h, { recursive: true, force: true });
});

function makeHome(): string {
  const home = fs.mkdtempSync("/tmp/uds-");
  homes.push(home);
  return home;
}

interface Received {
  method: string | undefined;
  url: string | undefined;
  headers: http.IncomingHttpHeaders;
  body: string;
  closed: boolean;
}

/** A fake vault bridge on <home>'s vault-bridge.sock. `answer` replies, or does nothing to never answer. */
async function fakeVaultBridge(
  home: string,
  answer: (res: http.ServerResponse) => void
): Promise<{ listener: UdsListener; received: Received[] }> {
  const received: Received[] = [];
  const listener = await listenHttpOnSocket(
    (req, res) => {
      const chunks: Buffer[] = [];
      const seen: Received = { method: req.method, url: req.url, headers: req.headers, body: "", closed: false };
      received.push(seen);
      res.on("close", () => {
        seen.closed = true;
      });
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        seen.body = Buffer.concat(chunks).toString("utf8");
        answer(res);
      });
    },
    { socketPath: socketPathFor(SOCKET_NAMES.vaultBridge, home), home, watchIntervalMs: 0, closeGraceMs: 100 }
  );
  listeners.push(listener);
  return { listener, received };
}

function reply(res: http.ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) });
  res.end(body);
}

const SUCCESS = {
  taskId: "wf-20261124-001",
  title: "trial-design-benchmark complete — 6 notes",
  status: "success" as const,
  mainNotePath: "OpenClaw/trial-design-benchmark/Overview.md",
  vault: "My Digital Garden",
};

test("the body is research_notify with only the fields that are set, and the error is clipped to 300 characters", () => {
  assert.equal(researchNotifyBody(SUCCESS), JSON.stringify({ tool: "research_notify", input: SUCCESS }));
  assert.deepEqual(JSON.parse(researchNotifyBody({ taskId: "wf", title: "Research" })), {
    tool: "research_notify",
    input: { taskId: "wf", title: "Research" },
  });
  const failure = JSON.parse(
    researchNotifyBody({ taskId: "wf", title: "Research FAILED", status: "failure", error: "e".repeat(500), vault: "V" })
  );
  assert.deepEqual(Object.keys(failure.input), ["taskId", "title", "status", "error", "vault"]);
  assert.equal(failure.input.error, "e".repeat(300));
});

test("the headers are Content-Type, Content-Length and the five auth and replay headers", () => {
  const body = researchNotifyBody(SUCCESS);
  assert.deepEqual(researchNotifyHeaders(body, TOKEN, NOW, NONCE), {
    "Content-Type": "application/json",
    "Content-Length": String(Buffer.byteLength(body)),
    Authorization: `Bearer ${TOKEN}`,
    "x-mcp-token": TOKEN,
    "x-mcp-timestamp": String(NOW),
    "x-mcp-nonce": NONCE,
    "x-mcp-body-sha256": createHash("sha256").update(body, "utf8").digest("hex"),
  });
  assert.notEqual(Buffer.byteLength(body), body.length, "the title's dash makes bytes and characters differ");
  const first = researchNotifyHeaders(body, TOKEN);
  const second = researchNotifyHeaders(body, TOKEN);
  assert.match(first["x-mcp-nonce"], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(first["x-mcp-nonce"], second["x-mcp-nonce"], "a fresh nonce per request");
  assert.ok(Math.abs(Number(first["x-mcp-timestamp"]) - Date.now()) < 60_000, "the timestamp is now, in ms");
});

test("postResearchNotify POSTs /mcp/tool on vault-bridge.sock with exactly that body and those headers", async () => {
  const home = makeHome();
  const { received } = await fakeVaultBridge(home, (res) => reply(res, 200, '{"ok":true}'));
  const body = researchNotifyBody(SUCCESS);
  const headers = researchNotifyHeaders(body, TOKEN, NOW, NONCE);
  await postResearchNotify(body, headers, { home });
  assert.equal(received.length, 1);
  const [got] = received;
  assert.equal(got.method, "POST");
  assert.equal(got.url, "/mcp/tool");
  assert.equal(got.body, body);
  for (const [name, value] of Object.entries(headers)) {
    assert.equal(got.headers[name.toLowerCase()], value, name);
  }
  assert.ok(got.headers.host === "localhost" || got.headers.host === "localhost:80", `Host was ${got.headers.host}`);
  assert.equal(RESEARCH_NOTIFY_TIMEOUT_MS, 10_000);
});

test("anything but 200 with ok:true is a failure, with the status and the start of the answer", async () => {
  const body = researchNotifyBody(SUCCESS);
  const headers = researchNotifyHeaders(body, TOKEN, NOW, NONCE);
  const answers: Array<[number, string, RegExp]> = [
    [401, '{"ok":false,"error":{"message":"bad token"}}', /^research_notify failed \(HTTP 401\): .*bad token/],
    [200, '{"ok":false}', /^research_notify failed \(HTTP 200\): \{"ok":false\}$/],
    [200, "not json", /^research_notify failed \(HTTP 200\): not json$/],
  ];
  for (const [status, text, expected] of answers) {
    const home = makeHome();
    await fakeVaultBridge(home, (res) => reply(res, status, text));
    await assert.rejects(postResearchNotify(body, headers, { home }), { message: expected });
  }
});

test("a missing socket is ENOENT and an untrusted socket is refused, both before anything is sent", async () => {
  const body = researchNotifyBody(SUCCESS);
  const headers = researchNotifyHeaders(body, TOKEN, NOW, NONCE);
  const empty = makeHome();
  await assert.rejects(postResearchNotify(body, headers, { home: empty }), (err: unknown) => {
    assert.ok(err instanceof UdsListenerError, "the helper's refusal, not a failed connect");
    assert.equal(err.code, "ENOENT");
    assert.match(err.message, /vault-bridge\.sock does not exist|run does not exist/);
    return true;
  });

  const home = makeHome();
  const { listener, received } = await fakeVaultBridge(home, (res) => reply(res, 200, '{"ok":true}'));
  fs.chmodSync(listener.socketPath, 0o666);
  await assert.rejects(postResearchNotify(body, headers, { home }), { code: "SOCKET_UNTRUSTED" });
  fs.chmodSync(listener.socketPath, 0o600);
  assert.equal(received.length, 0, "the token never reached a socket others could open");
  await postResearchNotify(body, headers, { home });
  assert.equal(received.length, 1);
});

test("a vault bridge that never answers is given up after the timeout, and the request is destroyed", async () => {
  const home = makeHome();
  const { received } = await fakeVaultBridge(home, () => {
    // never answers
  });
  const body = researchNotifyBody(SUCCESS);
  const t0 = Date.now();
  await assert.rejects(postResearchNotify(body, researchNotifyHeaders(body, TOKEN), { home, timeoutMs: 200 }), {
    message: "research_notify: no answer from the vault bridge within 200 ms",
  });
  const took = Date.now() - t0;
  assert.ok(took >= 150 && took < 5000, `gave up after ${took} ms`);
  const until = Date.now() + 2000;
  while (!(received[0]?.closed ?? false) && Date.now() < until) await new Promise((r) => setTimeout(r, 10));
  assert.equal(received.length, 1);
  assert.equal(received[0].closed, true, "the destroyed request closed the bridge's side too");
});

test("openclaw-runner.ts sends research_notify only through postResearchNotify: no https, no CA, no TCP address", () => {
  const runner = fs.readFileSync(join(SRC, "subprocess", "openclaw-runner.ts"), "utf8");
  assert.ok(runner.includes("await postResearchNotify(body, researchNotifyHeaders(body, token));"));
  for (const gone of ['from "https"', "httpsRequest", "rootCA.pem", "caCertPath", "127.0.0.1:8798", "DEFAULT_BRIDGE "]) {
    assert.equal(runner.includes(gone), false, `openclaw-runner.ts still has ${gone}`);
  }
  const notify = fs.readFileSync(join(SRC, "subprocess", "research-notify.ts"), "utf8");
  assert.equal(/from "(node:)?https"/.test(notify), false, "no https import");
  assert.equal(/\bhttps?\.(request|get)\(|\bnet\.connect\(/.test(notify), false, "no request but the helper's");
  assert.ok(notify.includes("requestOverSocket("), "the request goes through the helper's pinned client");
  assert.ok(notify.includes('{ method: "POST", path: "/mcp/tool", timeout: timeoutMs, headers }'));
});
