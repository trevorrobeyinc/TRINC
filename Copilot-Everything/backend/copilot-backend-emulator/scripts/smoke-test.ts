import { loadEnv } from "../src/config/env.js";
import { HttpMcpTransport } from "../src/transports/HttpMcpTransport.js";
import { BridgeMcpClient } from "../src/adapters/BridgeMcpClient.js";

const env = loadEnv();
const baseUrl = process.env.EMULATOR_BASE_URL || `http://${env.HOST}:${env.PORT}`;

const healthResponse = await fetch(`${baseUrl}/healthz`);
const health = await healthResponse.json();

const bridgeClient = new BridgeMcpClient(new HttpMcpTransport(env));
const toolResult = await bridgeClient.callTool({
  tool: "obsidian_health",
  input: {},
});

console.log(
  JSON.stringify(
    {
      emulatorBaseUrl: baseUrl,
      healthStatusCode: healthResponse.status,
      health,
      bridgeToolResult: toolResult,
    },
    null,
    2
  )
);
