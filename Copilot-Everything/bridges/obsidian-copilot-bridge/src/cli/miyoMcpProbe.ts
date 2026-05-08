import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";

type ProbeOptions = {
  command: string;
  url?: string;
};

function parseArgs(argv: string[]): ProbeOptions {
  let command = process.env.MIYO_CLI_BIN || "miyo";
  let url = process.env.MIYO_URL || "";

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--command") {
      command = argv[index + 1] || command;
      index += 1;
      continue;
    }
    if (value === "--url") {
      url = argv[index + 1] || url;
      index += 1;
    }
  }

  return {
    command,
    url: url.trim() || undefined,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const stderrChunks: string[] = [];
  const env = {
    ...getDefaultEnvironment(),
    ...Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    ),
  };

  if (options.url) {
    env.MIYO_URL = options.url;
  }

  const transport = new StdioClientTransport({
    command: options.command,
    args: ["mcp"],
    env,
    stderr: "pipe",
  });
  const stderrStream = transport.stderr;
  if (stderrStream) {
    stderrStream.on("data", (chunk) => {
      stderrChunks.push(String(chunk));
    });
  }

  const client = new Client(
    {
      name: "miyo-mcp-probe",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  try {
    await client.connect(transport);
    const ping = await client.ping();
    const tools = await client.listTools();
    const capabilities = client.getServerCapabilities();
    const result: Record<string, unknown> = {
      ok: true,
      command: options.command,
      url: options.url || null,
      serverVersion: client.getServerVersion() || null,
      serverCapabilities: capabilities || null,
      ping,
      tools: tools.tools.map((tool) => ({
        name: tool.name,
        description: tool.description || "",
        inputSchema: tool.inputSchema ?? null,
      })),
      stderr: stderrChunks.join("").trim() || null,
    };

    if (capabilities?.resources) {
      try {
        result.resources = await client.listResources();
      } catch (error) {
        result.resourcesError = String(error);
      }
    }

    if (capabilities?.prompts) {
      try {
        result.prompts = await client.listPrompts();
      } catch (error) {
        result.promptsError = String(error);
      }
    }

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const result = {
      ok: false,
      command: options.command,
      url: options.url || null,
      error: String(error),
      stderr: stderrChunks.join("").trim() || null,
    };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = 1;
  } finally {
    await transport.close().catch(() => undefined);
  }
}

void main();
