import fs from "node:fs";
import https from "node:https";
import type { RuntimeContext } from "./context";
import { createRequestListener } from "./httpCommon";

// Hardening note (2026-04-30): the legacy plain-http TCP transport was removed.
// Selecting `--transport=http` (or omitting the override and falling through to
// this branch) now starts the SAME TLS-enforced server as `--transport=https`.
// There is no plaintext fallback. If the mkcert key/cert pair cannot be loaded,
// this function throws with the exact paths it tried — the caller MUST refactor
// (regenerate certs, fix env propagation, point config at the right paths)
// rather than reintroducing an `http.createServer` code path.
export async function startHttpTransport(runtime: RuntimeContext): Promise<https.Server> {
  const tls = runtime.config.transport.tls;

  if (!tls || !tls.certPath || !tls.keyPath) {
    throw new Error(
      "raycast-obsidian-mcp http transport now requires TLS. Set transport.tls.{certPath,keyPath} in your config " +
        "(default mkcert paths: ~/.local/share/mkcert/localhost.pem and localhost-key.pem). Plaintext fallback is not permitted.",
    );
  }

  let key: Buffer;
  let cert: Buffer;
  try {
    key = fs.readFileSync(tls.keyPath);
    cert = fs.readFileSync(tls.certPath);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `raycast-obsidian-mcp http transport: TLS key/cert load failed (${detail}). Tried key=${tls.keyPath} cert=${tls.certPath}. ` +
        `Refactor the cert configuration; do NOT downgrade to plaintext.`,
    );
  }

  const server = https.createServer({ key, cert }, createRequestListener(runtime));

  // Encrypted-by-default invariant: a future regression must not be able to
  // demote this network transport to plain HTTP.
  if (!(server instanceof https.Server)) {
    throw new Error("raycast-obsidian-mcp http transport constructed a non-HTTPS server; refusing to listen.");
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(runtime.config.transport.port, runtime.config.transport.host, () => {
      resolve();
    });
  });

  runtime.logger.info("https_transport_started", {
    host: runtime.config.transport.host,
    port: runtime.config.transport.port,
    legacyName: "http",
    certPath: tls.certPath,
  });

  return server;
}
