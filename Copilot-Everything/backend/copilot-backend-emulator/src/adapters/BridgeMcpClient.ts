import type { BridgeToolRequest, BridgeToolResult, McpToolBinding } from "../types/mcp.js";
import { HttpMcpTransport } from "../transports/HttpMcpTransport.js";

export class BridgeMcpClient {
  constructor(private readonly transport: HttpMcpTransport) {}

  async healthCheck(): Promise<unknown> {
    return await this.transport.healthCheck();
  }

  async listTools(bindings: McpToolBinding[] = []): Promise<string[]> {
    return bindings.map((binding) => binding.bridge.toolName);
  }

  async callTool(
    request: BridgeToolRequest,
    signal?: AbortSignal
  ): Promise<BridgeToolResult<unknown>> {
    return await this.transport.postJson<BridgeToolResult<unknown>>("/mcp/tool", request, signal);
  }
}
