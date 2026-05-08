import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import type { RuntimeContext } from "./context";
import { createRequestListener } from "./httpCommon";

export async function startHttpTransport(runtime: RuntimeContext): Promise<https.Server> {
  const listener = createRequestListener(runtime);
  const tls = runtime.config.transport.tls;

  if (!tls) {
    throw new Error(
      "obsidian-bridge http transport requires TLS configuration. Plaintext HTTP is not permitted. " +
        "Set transport.tls.{certPath,keyPath} in obsidian-cli-mcp.local.json.",
    );
  }

  const server = https.createServer(
    { key: fs.readFileSync(tls.keyPath), cert: fs.readFileSync(tls.certPath) },
    listener,
  );

  // Encrypted-by-default invariant: a future regression must not be able to
  // demote this network transport to plain HTTP.
  if (!(server instanceof https.Server)) {
    throw new Error("obsidian-bridge http transport constructed a non-HTTPS server; refusing to listen.");
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
    tls: true,
  });

  return server;
}
