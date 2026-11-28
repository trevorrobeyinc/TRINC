import { Duplex, PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { LauncherIpcClient, LauncherIpcError, launcherIpcMissingReason } from "../server/launcherIpc";

// LauncherIpcClient over a real stream pair standing in for fd 3: the requests it writes are read back here,
// and answers are written the way obsidian-bridge-launcher writes them (one JSON line each).

const EM_DASH = String.fromCodePoint(0x2014);
const EMOJI = String.fromCodePoint(0x1f600);

function pipePair() {
  const toClient = new PassThrough();
  const fromClient = new PassThrough();
  const channel = Duplex.from({ readable: toClient, writable: fromClient });
  const requests: Array<{ id: string; method: string; params: unknown }> = [];
  let pending = "";
  fromClient.on("data", (chunk: Buffer) => {
    pending += chunk.toString("utf8");
    let nl: number;
    while ((nl = pending.indexOf("\n")) >= 0) {
      requests.push(JSON.parse(pending.slice(0, nl)));
      pending = pending.slice(nl + 1);
    }
  });
  return { client: new LauncherIpcClient(channel), channel, toClient, requests };
}

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("timed out");
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe("LauncherIpcClient", () => {
  it("resolves with the launcher's result", async () => {
    const { client, toClient, requests } = pipePair();
    const answer = client.request("vault.info", {});
    await until(() => requests.length === 1);
    expect(requests[0]).toMatchObject({ jsonrpc: "2.0", method: "vault.info", params: {} });
    toClient.write(`${JSON.stringify({ jsonrpc: "2.0", id: requests[0].id, result: { vault: "V" } })}\n`);
    await expect(answer).resolves.toEqual({ vault: "V" });
  });

  it("rejects with the launcher's refusal reason", async () => {
    const { client, toClient, requests } = pipePair();
    const answer = client.request("vault.read", { path: "Missing.md" });
    await until(() => requests.length === 1);
    toClient.write(
      `${JSON.stringify({ jsonrpc: "2.0", id: requests[0].id, error: { message: "note not found: Missing.md", reason: "not_found" } })}\n`
    );
    const error = await answer.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LauncherIpcError);
    expect((error as LauncherIpcError).reason).toBe("not_found");
    expect((error as LauncherIpcError).message).toBe("note not found: Missing.md");
  });

  it("keeps a note's text whole when an answer is split inside a character, and joins answers across reads", async () => {
    const { client, toClient, requests } = pipePair();
    const content = `plan ${EM_DASH} draft ${EMOJI}\n`.repeat(50);
    const first = client.request("vault.read", { path: "A.md" });
    const second = client.request("vault.read", { path: "B.md" });
    await until(() => requests.length === 2);
    const bytes = Buffer.from(
      `${JSON.stringify({ jsonrpc: "2.0", id: requests[0].id, result: { content } })}\n` +
        `${JSON.stringify({ jsonrpc: "2.0", id: requests[1].id, result: { content: "b" } })}\n`,
      "utf8"
    );
    const cut = bytes.indexOf(Buffer.from(EMOJI, "utf8")) + 2;
    toClient.write(bytes.subarray(0, cut));
    await tick();
    toClient.write(bytes.subarray(cut));
    await expect(first).resolves.toEqual({ content });
    await expect(second).resolves.toEqual({ content: "b" });
  });

  it("rejects with reason 'timeout' when no answer comes", async () => {
    const { client } = pipePair();
    const error = await client.request("vault.read", { path: "A.md" }, 20).catch((e: unknown) => e);
    expect((error as LauncherIpcError).reason).toBe("timeout");
  });

  it("fails pending calls as 'closed' when the launcher's side only ends (a stream that allows half-open use)", async () => {
    const { client, toClient, requests } = pipePair();
    const pending = client.request("vault.read", { path: "A.md" }, 5_000);
    await until(() => requests.length === 1);
    toClient.end();
    expect(((await pending.catch((e: unknown) => e)) as LauncherIpcError).reason).toBe("closed");
  });

  it("says why there is no pipe: unset, not a usable fd, or an fd that could not be opened", () => {
    const saved = process.env.BRIDGE_IPC_FD;
    try {
      delete process.env.BRIDGE_IPC_FD;
      expect(launcherIpcMissingReason()).toBe("BRIDGE_IPC_FD is not set");
      process.env.BRIDGE_IPC_FD = "abc";
      expect(launcherIpcMissingReason()).toBe('BRIDGE_IPC_FD ("abc") is not a usable fd');
      process.env.BRIDGE_IPC_FD = "2";
      expect(launcherIpcMissingReason()).toBe('BRIDGE_IPC_FD ("2") is not a usable fd');
      process.env.BRIDGE_IPC_FD = "7";
      expect(launcherIpcMissingReason()).toBe("fd 7 from BRIDGE_IPC_FD could not be opened");
    } finally {
      if (saved === undefined) delete process.env.BRIDGE_IPC_FD;
      else process.env.BRIDGE_IPC_FD = saved;
    }
  });

  it("rejects pending and later calls with reason 'closed' once the pipe closes", async () => {
    const { client, channel, requests } = pipePair();
    const pending = client.request("vault.read", { path: "A.md" }, 5_000);
    await until(() => requests.length === 1);
    channel.destroy();
    expect(((await pending.catch((e: unknown) => e)) as LauncherIpcError).reason).toBe("closed");
    expect(((await client.request("vault.info", {}).catch((e: unknown) => e)) as LauncherIpcError).reason).toBe("closed");
  });

  it("says whether a failed call was sent: a call made after the close never was, one in flight was", async () => {
    const { client, channel, requests } = pipePair();
    const inFlight = client.request("vault.append", { path: "A.md", content: "x" }, 5_000);
    await until(() => requests.length === 1);
    channel.destroy();
    const failedInFlight = (await inFlight.catch((e: unknown) => e)) as LauncherIpcError;
    const afterClose = (await client.request("vault.append", { path: "A.md", content: "x" }).catch((e: unknown) => e)) as LauncherIpcError;
    expect([failedInFlight.reason, failedInFlight.sent]).toEqual(["closed", true]);
    expect([afterClose.reason, afterClose.sent]).toEqual(["closed", false]);
    expect(requests).toHaveLength(1);
  });

  it("counts a timed-out call as sent", async () => {
    const { client } = pipePair();
    const error = (await client.request("vault.append", { path: "A.md", content: "x" }, 20).catch((e: unknown) => e)) as LauncherIpcError;
    expect([error.reason, error.sent]).toEqual(["timeout", true]);
  });
});
