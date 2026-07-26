#!/usr/bin/env node

const fs = require("fs");
const https = require("https");
const crypto = require("crypto");

const configPath =
  process.env.OBSIDIAN_MCP_CONFIG ||
  "/Users/myhome/TrevClaw-Obsidianodus/Copilot-Everything/bridges/obsidian-copilot-bridge/config/obsidian-cli-mcp.local.json";

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const body = JSON.stringify({ tool: "obsidian_health", args: {} });
const bodySha = crypto.createHash("sha256").update(body).digest("hex");

const req = https.request(
  {
    hostname: config.transport.host,
    port: config.transport.port,
    path: "/mcp/tool",
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.security.authToken}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
      "X-MCP-Timestamp": String(Date.now()),
      "X-MCP-Nonce": crypto.randomUUID(),
      "X-MCP-Body-SHA256": bodySha,
    },
  },
  (res) => {
    let raw = "";
    res.setEncoding("utf8");
    res.on("data", (chunk) => {
      raw += chunk;
    });
    res.on("end", () => {
      try {
        const parsed = JSON.parse(raw);
        const output = {
          statusCode: res.statusCode,
          ok: parsed.ok,
          error: parsed.error || null,
          cli: parsed.data?.backends?.cli?.capabilities
            ? {
                available: parsed.data.backends.cli.capabilities.available,
                supportedOps: parsed.data.backends.cli.capabilities.supportedOps,
                constraints: parsed.data.backends.cli.capabilities.constraints,
                diagnostics: parsed.data.backends.cli.capabilities.diagnostics || null,
              }
            : null,
          routing: parsed.data?.routing
            ? {
                operationMap: parsed.data.routing.operationMap,
                reasons: parsed.data.routing.reasons,
              }
            : null,
        };
        process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
      } catch (error) {
        process.stderr.write(`Failed to parse response: ${error}\n${raw}\n`);
        process.exitCode = 1;
      }
    });
  }
);

req.on("error", (error) => {
  process.stderr.write(`${error}\n`);
  process.exitCode = 1;
});

req.write(body);
req.end();
