// The fd-3 reader (src/launcherIpcServer.ts). Until 2026-11-25 it decoded each read on its own, so a UTF-8
// character split across two reads became U+FFFD and the damaged note text still parsed. These tests split
// multi-byte characters at every byte boundary, feed frames in pieces, and drive the whole server over a
// real stream pair against the fake vault.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Duplex, PassThrough } from "node:stream";
import { attachLauncherIpcServer, createFrameReader } from "../src/launcherIpcServer.ts";
import { harness, sha256 } from "./support/fakeVault.ts";

const EM_DASH = String.fromCodePoint(0x2014); // 3 bytes in UTF-8
const EMOJI = String.fromCodePoint(0x1f600); // 4 bytes in UTF-8
const ACCENTED = String.fromCodePoint(0xe9); // 2 bytes in UTF-8

function collect(maxFrameChars = 1024) {
  const frames: string[] = [];
  const oversized: Array<{ head: string; chars: number }> = [];
  const push = createFrameReader({
    maxFrameChars,
    onFrame: (line) => frames.push(line),
    onOversize: (head, chars) => oversized.push({ head, chars }),
  });
  return { frames, oversized, push };
}

describe("createFrameReader", () => {
  test("keeps a multi-byte character whole when a read ends inside it, at every byte boundary", () => {
    for (const character of [ACCENTED, EM_DASH, EMOJI]) {
      const frame = `{"text":"a${character}b"}`;
      const bytes = Buffer.from(`${frame}\n`, "utf8");
      const start = Buffer.byteLength(`{"text":"a`, "utf8");
      const width = Buffer.byteLength(character, "utf8");
      for (let cut = start + 1; cut < start + width; cut += 1) {
        const r = collect();
        r.push(bytes.subarray(0, cut));
        r.push(bytes.subarray(cut));
        assert.deepEqual(r.frames, [frame], `split ${width}-byte character after ${cut - start} byte(s)`);
      }
    }
  });

  test("survives one byte per read", () => {
    const frame = `{"text":"${EM_DASH}${EMOJI}${ACCENTED} plain"}`;
    const bytes = Buffer.from(`${frame}\n`, "utf8");
    const r = collect();
    for (let i = 0; i < bytes.length; i += 1) r.push(bytes.subarray(i, i + 1));
    assert.deepEqual(r.frames, [frame]);
  });

  test("splits several frames in one read, joins one frame across reads, and skips blank lines", () => {
    const r = collect();
    r.push('{"a":1}\n\n{"b":');
    r.push("2");
    r.push('}\n   \n{"c":3}\n');
    assert.deepEqual(r.frames, ['{"a":1}', '{"b":2}', '{"c":3}']);
  });

  test("drops a frame that grows past the cap before its newline, then reads the next one", () => {
    const r = collect(50);
    r.push('{"jsonrpc":"2.0","id":"abc-123","method":"vault.create","params":{"content":"');
    r.push("x".repeat(40));
    r.push('"}}\n{"ok":1}\n');
    assert.equal(r.oversized.length, 1);
    assert.match(r.oversized[0].head, /"id":"abc-123"/);
    assert.deepEqual(r.frames, ['{"ok":1}']);
  });

  test("drops a complete frame over the cap that arrived in a single read", () => {
    const r = collect(10);
    r.push(`${"y".repeat(20)}\n{"ok":2}\n`);
    assert.equal(r.oversized.length, 1);
    assert.equal(r.oversized[0].chars, 20);
    assert.deepEqual(r.frames, ['{"ok":2}']);
  });
});

/** A child process stand-in whose fd 3 is a real stream pair: what the test writes, the launcher reads. */
function fakeChild() {
  const toLauncher = new PassThrough();
  const fromLauncher = new PassThrough();
  const fd3 = Duplex.from({ readable: toLauncher, writable: fromLauncher });
  const responses: Array<Record<string, unknown>> = [];
  let pending = "";
  fromLauncher.on("data", (chunk: Buffer) => {
    pending += chunk.toString("utf8");
    let nl: number;
    while ((nl = pending.indexOf("\n")) >= 0) {
      responses.push(JSON.parse(pending.slice(0, nl)) as Record<string, unknown>);
      pending = pending.slice(nl + 1);
    }
  });
  return { child: { stdio: [null, null, null, fd3] } as never, toLauncher, responses };
}

async function until(check: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out waiting for ${label}`);
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe("attachLauncherIpcServer over a stream pair", () => {
  test("writes a note body split inside a character exactly as the bridge sent it", async () => {
    const h = harness();
    const { child, toLauncher, responses } = fakeChild();
    const capture = { getLogs: () => [], getErrors: () => [] };
    const detach = attachLauncherIpcServer(child, { capture: capture as never, ...(h.deps as never) });

    const content = `Plan ${EM_DASH} draft ${EMOJI}, caf${ACCENTED}\n`.repeat(400);
    const frame = JSON.stringify({
      jsonrpc: "2.0",
      id: "req-1",
      method: "vault.create",
      params: { path: "Scratch/probe.md", content, contentSha256: sha256(content) },
    });
    const bytes = Buffer.from(`${frame}\n`, "utf8");
    const cut = bytes.indexOf(Buffer.from(EM_DASH, "utf8")) + 1;
    toLauncher.write(bytes.subarray(0, cut));
    await tick();
    toLauncher.write(bytes.subarray(cut));

    await until(() => responses.length === 1, "the create response");
    assert.deepEqual(responses[0], { jsonrpc: "2.0", id: "req-1", result: { path: "Scratch/probe.md", created: true } });
    assert.equal(h.vault.notes.get("Scratch/probe.md"), content);
    detach();
  });

  test("answers refusals with the reason, unknown methods by name, and unparseable frames by id", async () => {
    const h = harness();
    const { child, toLauncher, responses } = fakeChild();
    const capture = { getLogs: () => [], getErrors: () => [] };
    attachLauncherIpcServer(child, { capture: capture as never, ...(h.deps as never) });

    toLauncher.write(`${JSON.stringify({ jsonrpc: "2.0", id: "r1", method: "vault.read", params: { path: "Missing.md" } })}\n`);
    toLauncher.write(`${JSON.stringify({ jsonrpc: "2.0", id: "r2", method: "vault.nope", params: {} })}\n`);
    toLauncher.write('{"jsonrpc":"2.0","id":"r3","method":"vault.read","params":{"path":\n');
    await until(() => responses.length === 3, "three answers");

    const byId = Object.fromEntries(responses.map((r) => [r.id, r.error]));
    assert.deepEqual(byId.r1, { message: "note not found: Missing.md", reason: "not_found" });
    assert.deepEqual(byId.r2, { message: "unknown launcher IPC method: vault.nope" });
    assert.deepEqual(byId.r3, { message: "request is not valid JSON", reason: "invalid_params" });
  });

  test("answers a frame over the cap by its id with too_large, audits the drop, writes nothing, and reads on", async () => {
    const h = harness();
    const { child, toLauncher, responses } = fakeChild();
    const capture = { getLogs: () => [], getErrors: () => [] };
    attachLauncherIpcServer(child, { capture: capture as never, ...(h.deps as never), maxFrameChars: 200 });
    const content = "x".repeat(500);
    const big = JSON.stringify({
      jsonrpc: "2.0",
      id: "big-1",
      method: "vault.create",
      params: { path: "N.md", content, contentSha256: sha256(content) },
    });
    toLauncher.write(`${big}\n`);
    toLauncher.write(`${JSON.stringify({ jsonrpc: "2.0", id: "next", method: "vault.info", params: {} })}\n`);
    await until(() => responses.length === 2, "two answers");
    const byId = Object.fromEntries(responses.map((r) => [r.id, r]));
    assert.equal((byId["big-1"].error as { reason?: string }).reason, "too_large");
    assert.equal((byId.next.result as { vault?: string }).vault, "Test Vault");
    assert.equal(h.audits.filter((a) => a.eventType === "LAUNCHER_IPC_FRAME_DROPPED").length, 1);
    assert.ok(!JSON.stringify(h.audits).includes("xxxxx"), "the dropped frame's text is never audited");
    assert.equal(h.vault.notes.size, 0);
  });
});
