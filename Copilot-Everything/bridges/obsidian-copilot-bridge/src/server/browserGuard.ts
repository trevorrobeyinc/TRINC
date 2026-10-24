import type { IncomingHttpHeaders } from "node:http";

/**
 * Browser guard: refuse every request a web page could have caused, before authentication and before
 * any route runs (added 2026-10-24). It follows the :8801 Security Bridge
 * (`~/Security Everything/obsidian-security-bridge/src/server/httpsServer.ts`), adapted to the clients
 * of the :8798, :8799 and :8800 bridges, whose headers were measured on 2026-10-24:
 *  - Node `https`, curl and Python send none of the headers checked below.
 *  - Node's built-in `fetch` adds `sec-fetch-mode: cors`, so Sec-Fetch-Mode and Sec-Fetch-Dest
 *    prove nothing on their own and are not checked.
 *  - Obsidian's `requestUrl` (the Copilot plugin's transport) runs in Electron's main process with no
 *    initiator, so the most it can say is `Sec-Fetch-Site: none`.
 *  - A web page in a modern browser always sends `Sec-Fetch-Site` (same-origin, same-site or
 *    cross-site) and, on any POST, `Origin`; a DNS-rebinding page also names its own host in `Host`.
 * Keep the copies in the three bridges byte-identical: `ops/tr-suite/verify.sh` compares them.
 */

export type BrowserRefusal =
  | { status: 421; code: "wrong_host"; reason: string }
  | { status: 403; code: "browser_origin"; reason: string };

const MAX_REASON_FIELD = 100;

function clip(value: unknown): string {
  return String(value ?? "").slice(0, MAX_REASON_FIELD);
}

/**
 * Returns the refusal for a browser-originated request, or null when the request may proceed to
 * authentication. `localPort` is the port the connection arrived on; it is undefined on a unix socket
 * or named pipe, where the Host check is skipped (no browser can reach one).
 */
export function refuseBrowserRequest(
  headers: IncomingHttpHeaders,
  localPort: number | undefined
): BrowserRefusal | null {
  if (typeof localPort === "number") {
    const host = headers.host;
    const allowed = [`127.0.0.1:${localPort}`, `localhost:${localPort}`, `[::1]:${localPort}`];
    if (host === undefined || !allowed.includes(host)) {
      return { status: 421, code: "wrong_host", reason: `host=${clip(host)}` };
    }
  }

  const hits: string[] = [];
  if (headers.origin !== undefined) hits.push(`origin=${clip(headers.origin)}`);
  if (headers.referer !== undefined) hits.push("referer");
  const site = headers["sec-fetch-site"];
  if (site !== undefined && site !== "none") hits.push(`sec-fetch-site=${clip(site)}`);

  return hits.length > 0 ? { status: 403, code: "browser_origin", reason: hits.join(",") } : null;
}
