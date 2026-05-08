import fs from "node:fs";
import http from "node:http";
import type { RuntimeContext } from "./context";
import { createRequestListener } from "./httpCommon";

export async function startUdsTransport(runtime: RuntimeContext): Promise<http.Server> {
  const socketPath = runtime.config.transport.udsPath;
  if (fs.existsSync(socketPath)) {
    fs.unlinkSync(socketPath);
  }

  const server = http.createServer(createRequestListener(runtime));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      resolve();
    });
  });

  fs.chmodSync(socketPath, 0o600);

  runtime.logger.info("uds_transport_started", {
    socketPath,
  });

  return server;
}
