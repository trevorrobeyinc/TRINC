import fs from "node:fs";
import https from "node:https";
import type { RuntimeContext } from "./context";
import { createRequestListener } from "./httpCommon";

export async function startHttpsTransport(runtime: RuntimeContext): Promise<https.Server> {
  const { certPath, keyPath } = runtime.config.transport.tls;
  const cert = fs.readFileSync(certPath);
  const key = fs.readFileSync(keyPath);

  const server = https.createServer({ cert, key }, createRequestListener(runtime));

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(runtime.config.transport.port, runtime.config.transport.host, () => {
      resolve();
    });
  });

  runtime.logger.info("https_transport_started", {
    host: runtime.config.transport.host,
    port: runtime.config.transport.port,
    certPath,
  });

  return server;
}
