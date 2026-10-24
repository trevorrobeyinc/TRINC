import { afterAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RuntimeContext } from "../server/context";

// The audit sink is a process singleton that reads TREVCLAW_AUDIT_LOG when its module loads. vi.hoisted
// runs before every import below, so the sink points at a temp file: tests must never write the real
// audit trail that OSSEC tails.
const { auditFile } = vi.hoisted(() => {
  const file = `${process.env.TMPDIR ?? "/tmp"}/browser-guard-audit-${process.pid}-${Date.now()}.jsonl`;
  process.env.TREVCLAW_AUDIT_LOG = file;
  return { auditFile: file };
});

import { refuseBrowserRequest } from "../server/browserGuard";
import { createRequestListener } from "../server/httpCommon";

// The program-client header sets were measured on 2026-10-24 against a throwaway HTTPS echo server
// (Node https, Node fetch, curl, Python urllib). The browser sets follow the Fetch Metadata spec: a web
// page always sends Sec-Fetch-Site (same-origin, same-site or cross-site), and Origin on any POST.
// The same vectors run in the :8799 and :8800 bridges, whose guard copies are byte-identical.

const PORT = 8798;
const HOST = `127.0.0.1:${PORT}`;

afterAll(() => {
  fs.rmSync(auditFile, { force: true });
});

describe("browser guard: the pure check", () => {
  it("passes program clients: Node https, curl and Python send only Host", () => {
    expect(refuseBrowserRequest({ host: HOST }, PORT)).toBeNull();
  });

  it("passes Node's built-in fetch despite its sec-fetch-mode: cors", () => {
    expect(refuseBrowserRequest({ host: HOST, "sec-fetch-mode": "cors" }, PORT)).toBeNull();
  });

  it("passes Obsidian requestUrl (Electron net, no initiator) even with Sec-Fetch-Site: none", () => {
    const headers = { host: HOST, "sec-fetch-site": "none", "sec-fetch-mode": "no-cors", "sec-fetch-dest": "empty" };
    expect(refuseBrowserRequest(headers, PORT)).toBeNull();
  });

  it("passes localhost and [::1] on the arrival port", () => {
    expect(refuseBrowserRequest({ host: `localhost:${PORT}` }, PORT)).toBeNull();
    expect(refuseBrowserRequest({ host: `[::1]:${PORT}` }, PORT)).toBeNull();
  });

  it("refuses a cross-site fetch from a web page with 403", () => {
    const refusal = refuseBrowserRequest(
      { host: HOST, origin: "https://evil.example", "sec-fetch-site": "cross-site", "sec-fetch-mode": "cors" },
      PORT
    );
    expect(refusal?.status).toBe(403);
    expect(refusal?.code).toBe("browser_origin");
    expect(refusal?.reason).toMatch(/origin=https:\/\/evil\.example/);
  });

  it("refuses a no-cors GET from a web page (an <img> probe, no Origin) by Sec-Fetch-Site", () => {
    const headers = { host: HOST, "sec-fetch-site": "cross-site", "sec-fetch-mode": "no-cors", "sec-fetch-dest": "image" };
    expect(refuseBrowserRequest(headers, PORT)?.code).toBe("browser_origin");
  });

  it("refuses same-site and same-origin requests", () => {
    expect(refuseBrowserRequest({ host: HOST, "sec-fetch-site": "same-site" }, PORT)?.code).toBe("browser_origin");
    expect(refuseBrowserRequest({ host: HOST, "sec-fetch-site": "same-origin" }, PORT)?.code).toBe("browser_origin");
  });

  it("refuses an older browser's POST without fetch metadata by Origin alone, Origin: null included", () => {
    expect(refuseBrowserRequest({ host: HOST, origin: "https://evil.example" }, PORT)?.status).toBe(403);
    expect(refuseBrowserRequest({ host: HOST, origin: "null" }, PORT)?.status).toBe(403);
  });

  it("refuses a Referer alone without logging its value", () => {
    const refusal = refuseBrowserRequest({ host: HOST, referer: "https://evil.example/page?secret=1" }, PORT);
    expect(refusal?.code).toBe("browser_origin");
    expect(refusal?.reason).toBe("referer");
  });

  it("refuses a DNS-rebinding host with 421 before the header check", () => {
    const refusal = refuseBrowserRequest(
      { host: `evil.example:${PORT}`, origin: `https://evil.example:${PORT}`, "sec-fetch-site": "same-origin" },
      PORT
    );
    expect(refusal?.status).toBe(421);
    expect(refusal?.code).toBe("wrong_host");
  });

  it("refuses a missing Host, another port or another address with 421", () => {
    expect(refuseBrowserRequest({}, PORT)?.code).toBe("wrong_host");
    expect(refuseBrowserRequest({ host: "127.0.0.1:9999" }, PORT)?.code).toBe("wrong_host");
    expect(refuseBrowserRequest({ host: `192.168.1.5:${PORT}` }, PORT)?.code).toBe("wrong_host");
  });

  it("refuses a duplicated Sec-Fetch-Site that is not exactly none", () => {
    expect(refuseBrowserRequest({ host: HOST, "sec-fetch-site": "none, cross-site" }, PORT)?.code).toBe("browser_origin");
  });

  it("skips the Host check on a unix socket (no port) but still refuses browser headers", () => {
    expect(refuseBrowserRequest({ host: "localhost" }, undefined)).toBeNull();
    expect(refuseBrowserRequest({ host: "localhost", origin: "https://evil.example" }, undefined)?.code).toBe("browser_origin");
  });

  it("clips reason fields to 100 characters", () => {
    expect(refuseBrowserRequest({ host: "x".repeat(500) }, PORT)?.reason).toBe(`host=${"x".repeat(100)}`);
  });
});

interface Captured {
  status: number;
  body: { ok?: boolean; error?: { code?: string } };
}

function fakeRuntime(counters: string[]): RuntimeContext {
  return {
    config: {
      security: {
        replayWindowSeconds: 60,
        nonceTtlSeconds: 120,
        rateLimitPerMinute: 600,
        globalRateLimitPerMinute: 600,
        authToken: "a".repeat(64),
      },
    },
    metrics: { increment: (name: string, labels?: Record<string, string>) => counters.push(`${name}:${labels?.code ?? ""}`) },
    logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
  } as unknown as RuntimeContext;
}

async function call(headers: Record<string, string>, method = "GET", url = "/healthz", localPort: number | undefined = PORT) {
  const counters: string[] = [];
  const listener = createRequestListener(fakeRuntime(counters));
  const req = { headers, method, url, socket: { localPort, remoteAddress: "127.0.0.1" } } as unknown as IncomingMessage;
  const captured: Captured = { status: 0, body: {} };
  const res = {
    statusCode: 0,
    setHeader: () => undefined,
    end: (text: string) => {
      captured.body = JSON.parse(text);
    },
  };
  await listener(req, res as unknown as ServerResponse);
  captured.status = res.statusCode;
  return { captured, counters };
}

describe("browser guard: wired into the :8798 request listener", () => {
  it("answers a program client's /healthz as before", async () => {
    const { captured } = await call({ host: HOST });
    expect(captured.status).toBe(200);
    expect(captured.body.ok).toBe(true);
  });

  it("refuses a browser before the open /healthz route, counts it and audits it", async () => {
    const { captured, counters } = await call({ host: HOST, origin: "https://evil.example", "sec-fetch-site": "cross-site" });
    expect(captured.status).toBe(403);
    expect(captured.body.error?.code).toBe("BROWSER_ORIGIN_REFUSED");
    expect(counters).toContain("browser_rejections_total:browser_origin");
    const lines = fs.readFileSync(auditFile, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.at(-1)).toMatchObject({ eventType: "BROWSER_REJECT", errorCode: "browser_origin" });
  });

  it("refuses a browser's CORS preflight with 403, not the old preflight answer", async () => {
    const { captured } = await call({ host: HOST, origin: "https://evil.example", "sec-fetch-site": "cross-site" }, "OPTIONS");
    expect(captured.status).toBe(403);
  });

  it("refuses a rebinding host with 421 REQUEST_WRONG_HOST", async () => {
    const { captured } = await call({ host: `evil.example:${PORT}` });
    expect(captured.status).toBe(421);
    expect(captured.body.error?.code).toBe("REQUEST_WRONG_HOST");
  });

  it("still lets an unauthenticated program reach auth, which refuses it (the guard adds, never replaces)", async () => {
    const { captured } = await call({ host: HOST }, "POST", "/mcp/tool");
    expect(captured.status).toBe(401);
  });
});
