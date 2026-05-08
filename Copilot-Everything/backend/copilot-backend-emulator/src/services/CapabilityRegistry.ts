import type { McpToolBinding } from "../types/mcp.js";

export class CapabilityRegistry {
  listToolNames(tools: McpToolBinding[]): string[] {
    return tools.map((tool) => tool.runtimeName);
  }

  supportsProvider(provider: string): boolean {
    return [
      "openai",
      "openrouterai",
      "3rd party (openai-format)",
      "azure openai",
      "deepseek",
      "siliconflow",
      "lm-studio",
      "ollama",
    ].includes(provider);
  }
}
