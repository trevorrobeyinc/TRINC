/**
 * Loopback TLS dispatcher for the Obsidian bridge (:8798) and Local REST API (:27124).
 *
 * Security (audit RF-1): these listeners use mkcert-issued self-signed certs. Previously
 * each client did `new Agent({ connect: { rejectUnauthorized: false } })`, which DISABLES
 * server-identity verification while still sending a static bearer token to whatever
 * answers the socket. Instead we trust the mkcert ROOT CA explicitly and keep verification
 * ON — matching how the bridge and the copilot-mcp fork already do it.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Agent } from "undici";

/** Locate the mkcert root CA: NODE_EXTRA_CA_CERTS, then platform mkcert defaults. */
function loadMkcertCa(): string | undefined {
  const candidates: string[] = [];
  if (process.env.NODE_EXTRA_CA_CERTS) {
    candidates.push(process.env.NODE_EXTRA_CA_CERTS);
  }
  const home = os.homedir();
  if (process.platform === "darwin") {
    candidates.push(path.join(home, "Library/Application Support/mkcert/rootCA.pem"));
  } else if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    candidates.push(path.join(process.env.LOCALAPPDATA, "mkcert", "rootCA.pem"));
  } else {
    candidates.push(path.join(home, ".local/share/mkcert/rootCA.pem"));
  }
  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate)) {
        return fs.readFileSync(candidate, "utf8");
      }
    } catch {
      // ignore and try the next candidate
    }
  }
  return undefined;
}

/**
 * undici dispatcher that trusts the mkcert root CA and KEEPS certificate verification on
 * (server identity is checked). If the mkcert CA cannot be located it falls back to system
 * trust — still verifying — and NEVER disables verification.
 *
 * @param extraCaPems Additional PEM certificates to trust alongside the mkcert root — used
 * to PIN a specific self-signed listener cert (e.g. the Obsidian Local REST API plugin's
 * own cert, which is not mkcert-issued but carries SAN 127.0.0.1). Verification stays ON.
 */
export function createLoopbackTlsAgent(extraCaPems: string[] = []): Agent {
  const mkcertCa = loadMkcertCa();
  const ca = [...(mkcertCa ? [mkcertCa] : []), ...extraCaPems.filter(Boolean)];
  return new Agent({
    connect: ca.length > 0 ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: true },
  });
}
