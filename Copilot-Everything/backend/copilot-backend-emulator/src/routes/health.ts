import type { FastifyInstance } from "fastify";
import type { SelfHostContractInventory } from "../services/SelfHostContractInventory.js";
import type { BridgeMcpClient } from "../adapters/BridgeMcpClient.js";

export async function registerHealthRoute(
  app: FastifyInstance,
  inventory: SelfHostContractInventory,
  bridgeClient: BridgeMcpClient
): Promise<void> {
  app.get("/healthz", async () => {
    let bridge: unknown;
    let bridgeOk = true;

    try {
      bridge = await bridgeClient.healthCheck();
    } catch (error) {
      bridgeOk = false;
      bridge = { message: error instanceof Error ? error.message : String(error) };
    }

    return {
      ok: true,
      status: "ready",
      contractVersion: inventory.getContractVersion(),
      bridgeOk,
      bridge,
      ts: new Date().toISOString(),
    };
  });
}
