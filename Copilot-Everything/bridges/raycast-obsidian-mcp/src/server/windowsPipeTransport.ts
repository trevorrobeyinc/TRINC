import http from "node:http";
import type { RuntimeContext } from "./context";
import { createRequestListener } from "./httpCommon";

export async function startWindowsPipeTransport(runtime: RuntimeContext): Promise<http.Server> {
  const pipeName = runtime.config.transport.pipeName || "obsidian-mcp-bridge";
  const fullName = `\\\\.\\pipe\\${pipeName}`;

  const server = http.createServer(createRequestListener(runtime));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(fullName, () => {
      resolve();
    });
  });

  runtime.logger.info("pipe_transport_started", {
    pipeName: fullName,
  });

  return server;
}
