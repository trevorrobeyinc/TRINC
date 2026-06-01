#!/usr/bin/env node
// claude-cli-bridge
// MCP server that exposes the local `claude` CLI as MCP tools.
// Inverse of `claude mcp serve`: this server is CALLED BY an MCP client
// (Claude Desktop chat, etc.) and shells out TO the `claude` CLI.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLAUDE_BIN =
  process.env.CLAUDE_BRIDGE_CLI_PATH || "/Users/trevorrobey/.local/bin/claude";
const DEFAULT_TIMEOUT_S = Number(
  process.env.CLAUDE_BRIDGE_DEFAULT_TIMEOUT_S || 300,
);
const SELF_NAME = "claude-cli-bridge";

if (!existsSync(CLAUDE_BIN)) {
  process.stderr.write(
    `[${SELF_NAME}] FATAL: claude CLI not found at ${CLAUDE_BIN}. ` +
      `Set CLAUDE_BRIDGE_CLI_PATH to the correct path.\n`,
  );
  process.exit(1);
}

function logErr(msg) {
  process.stderr.write(`[${SELF_NAME}] ${msg}\n`);
}

// Build the recursion-safe MCP config the subprocess will see.
// Caller can pass their own JSON; we strip our own entry no matter what.
function buildSubprocessMcpConfig(callerProvided) {
  let parsed;
  if (callerProvided) {
    try {
      parsed =
        typeof callerProvided === "string"
          ? JSON.parse(callerProvided)
          : callerProvided;
    } catch (e) {
      throw new Error(`mcp_config is not valid JSON: ${e.message}`);
    }
  } else {
    parsed = { mcpServers: {} };
  }
  const servers = { ...(parsed.mcpServers || {}) };
  if (servers[SELF_NAME]) {
    delete servers[SELF_NAME];
  }
  return { ...parsed, mcpServers: servers };
}

async function runClaude({
  prompt,
  resumeSessionId = null,
  cwd = null,
  model = null,
  allowedTools = null,
  disallowedTools = null,
  mcpConfig = null,
  permissionMode = null,
  addDirs = null,
  maxBudgetUsd = null,
  appendSystemPrompt = null,
  timeoutSeconds = DEFAULT_TIMEOUT_S,
  forkSession = false,
  onProgress = null,
}) {
  // --mcp-config <configs...> is variadic — would swallow any positional args
  // that follow it. Two consequences for the design:
  //   1. We write the JSON to a temp file (not as a string arg) for clarity.
  //   2. We feed the prompt via stdin, not as a positional, so nothing on the
  //      command line can be confused for an extra mcp-config value.
  const effectiveMcp = buildSubprocessMcpConfig(mcpConfig);
  const tmpRoot = mkdtempSync(join(tmpdir(), "claude-cli-bridge-"));
  const mcpConfigPath = join(tmpRoot, "mcp-config.json");
  writeFileSync(mcpConfigPath, JSON.stringify(effectiveMcp), "utf8");

  const args = [
    "--print",
    "--output-format",
    "json",
    "--strict-mcp-config",
    "--mcp-config",
    mcpConfigPath,
  ];

  if (resumeSessionId) {
    args.push("--resume", resumeSessionId);
    if (forkSession) args.push("--fork-session");
  }
  if (model) args.push("--model", model);
  if (allowedTools && allowedTools.length > 0) {
    args.push("--allowedTools", allowedTools.join(" "));
  }
  if (disallowedTools && disallowedTools.length > 0) {
    args.push("--disallowedTools", disallowedTools.join(" "));
  }
  if (permissionMode) args.push("--permission-mode", permissionMode);
  if (addDirs && addDirs.length > 0) args.push("--add-dir", ...addDirs);
  if (maxBudgetUsd != null) args.push("--max-budget-usd", String(maxBudgetUsd));
  if (appendSystemPrompt)
    args.push("--append-system-prompt", appendSystemPrompt);

  // Prompt goes via stdin — no positional arg.
  const subprocessOpts = {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
  };
  if (cwd) {
    if (!existsSync(cwd)) {
      rmSync(tmpRoot, { recursive: true, force: true });
      throw new Error(`cwd does not exist: ${cwd}`);
    }
    subprocessOpts.cwd = cwd;
  }

  logErr(
    `spawn: ${CLAUDE_BIN} ${args
      .map((a) => (a.length > 80 ? a.slice(0, 80) + "…" : a))
      .join(" ")} (prompt via stdin, mcp-config=${mcpConfigPath})`,
  );

  return new Promise((resolve, reject) => {
    const cleanup = () => rmSync(tmpRoot, { recursive: true, force: true });
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutSeconds * 1000);
    const startedAt = Date.now();

    // Heartbeat: emit MCP progress notifications every 20s so the client's
    // per-request timeout (default ~60s in many clients including Claude
    // Desktop) doesn't fire while we're waiting on a long subprocess. Per
    // MCP spec, each notifications/progress event resets the client's
    // request-timeout deadline. The onProgress callback is built by the
    // CallToolRequestSchema handler when the incoming request carries a
    // _meta.progressToken.
    const heartbeat = onProgress
      ? setInterval(() => {
          const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
          try {
            onProgress(elapsedSec);
          } catch {
            /* best-effort: never let a failed notification kill the run */
          }
        }, 20_000)
      : null;
    const clearHeartbeat = () => {
      if (heartbeat) clearInterval(heartbeat);
    };

    const child = spawn(CLAUDE_BIN, args, {
      ...subprocessOpts,
      signal: ac.signal,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      clearHeartbeat();
      cleanup();
      const ctx = `stderr_tail=${stderr.slice(-500)}`;
      reject(
        new Error(
          ac.signal.aborted
            ? `claude subprocess timed out after ${timeoutSeconds}s. ${ctx}`
            : `claude subprocess error: ${err.message}. ${ctx}`,
        ),
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      clearHeartbeat();
      cleanup();
      if (ac.signal.aborted) {
        reject(
          new Error(
            `claude subprocess timed out after ${timeoutSeconds}s. stderr_tail=${stderr.slice(
              -500,
            )}`,
          ),
        );
        return;
      }
      let envelope;
      try {
        envelope = JSON.parse(stdout.trim());
      } catch {
        reject(
          new Error(
            `claude subprocess returned non-JSON (exit ${code}). stdout_head=${stdout.slice(
              0,
              400,
            )} stderr_tail=${stderr.slice(-500)}`,
          ),
        );
        return;
      }
      resolve({ envelope, exitCode: code, stderr });
    });

    // Write prompt to stdin and close.
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function envelopeToToolResult(envelope, exitCode, stderr) {
  const text = envelope.result ?? "";
  const meta = {
    session_id: envelope.session_id ?? null,
    cost_usd: envelope.total_cost_usd ?? null,
    duration_ms: envelope.duration_ms ?? null,
    num_turns: envelope.num_turns ?? null,
    terminal_reason: envelope.terminal_reason ?? null,
    is_error: envelope.is_error ?? false,
    permission_denials: envelope.permission_denials ?? [],
    exit_code: exitCode,
    stderr_tail: stderr ? stderr.slice(-500) : "",
  };
  const isError = !!envelope.is_error || exitCode !== 0;
  return {
    content: [
      { type: "text", text: text || "(no text in result envelope)" },
      {
        type: "text",
        text: `\n--- ${SELF_NAME} metadata ---\n${JSON.stringify(meta, null, 2)}`,
      },
    ],
    isError,
  };
}

const COMMON_PROPS = {
  cwd: {
    type: "string",
    description: "Working directory for the spawned `claude` (must exist).",
  },
  model: {
    type: "string",
    description:
      "Model alias or full ID (e.g. `sonnet`, `opus`, `claude-sonnet-4-6`).",
  },
  allowed_tools: {
    type: "array",
    items: { type: "string" },
    description:
      'Pre-allowlist tools (e.g. ["Read","Bash(git *)"]) to skip permission prompts.',
  },
  disallowed_tools: {
    type: "array",
    items: { type: "string" },
    description: "Block specific tools.",
  },
  permission_mode: {
    type: "string",
    enum: [
      "acceptEdits",
      "auto",
      "bypassPermissions",
      "default",
      "dontAsk",
      "plan",
    ],
    description: "Permission mode for the subprocess session.",
  },
  add_dirs: {
    type: "array",
    items: { type: "string" },
    description: "Additional directories to grant tool access to.",
  },
  mcp_config: {
    type: "string",
    description:
      "JSON string of MCP config (e.g. '{\"mcpServers\":{...}}') to pass to the subprocess. The claude-cli-bridge entry is auto-stripped to prevent recursion.",
  },
  max_budget_usd: {
    type: "number",
    description: "Cap subprocess spend in USD.",
  },
  append_system_prompt: {
    type: "string",
    description: "Extra text appended to the subprocess's default system prompt.",
  },
  timeout_seconds: {
    type: "number",
    description: `Subprocess timeout in seconds (default ${DEFAULT_TIMEOUT_S}).`,
  },
};

const TOOLS = [
  {
    name: "claude_run",
    description:
      "Run a one-shot prompt through the local `claude` CLI in a fresh session and return the response. " +
      "Spawned subprocess uses --strict-mcp-config so it does NOT see claude-cli-bridge in its own MCP " +
      "environment (recursion guard). Returns the assistant's final text plus metadata including " +
      "session_id (pass to claude_resume to continue), cost_usd, duration_ms, and permission_denials.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "The user prompt to send to `claude`.",
        },
        ...COMMON_PROPS,
      },
      required: ["prompt"],
    },
  },
  {
    name: "claude_resume",
    description:
      "Continue a prior `claude` session by session_id. Pass the session_id you got back from a previous claude_run or claude_resume tool result.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "UUID of the session to resume.",
        },
        prompt: {
          type: "string",
          description: "Follow-up prompt for the resumed session.",
        },
        fork_session: {
          type: "boolean",
          description:
            "If true, create a new session ID (fork) instead of continuing in-place.",
        },
        ...COMMON_PROPS,
      },
      required: ["session_id", "prompt"],
    },
  },
  {
    name: "claude_version",
    description:
      "Return the local `claude` CLI version. Use as a quick sanity check that the bridge can reach the binary.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "claude_diag",
    description:
      "Diagnostic: report the bridge subprocess's view of HOME/USER/PATH and verify the claude credential file is reachable. Use this when claude_run reports `Not logged in` even though `claude auth status` from a normal terminal shows logged-in — usually means the parent MCP client (Claude Desktop) is passing a non-standard env or sandboxing keychain access.",
    inputSchema: { type: "object", properties: {} },
  },
];

const server = new Server(
  { name: SELF_NAME, version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  // Extract the MCP progressToken (if the client provided one) so we can
  // emit notifications/progress during long subprocess waits. Each
  // notification resets the client's per-request timeout deadline.
  // Without this, Claude Desktop's default ~60s timeout fires while we
  // wait on long claude_run jobs, even when timeout_seconds is 1800.
  const progressToken = request.params?._meta?.progressToken;
  const onProgress = progressToken
    ? (elapsedSec) => {
        try {
          server.notification({
            method: "notifications/progress",
            params: {
              progressToken,
              progress: elapsedSec,
            },
          });
        } catch {
          /* swallow — never let a failed notification kill the run */
        }
      }
    : null;
  try {
    if (name === "claude_run") {
      const { envelope, exitCode, stderr } = await runClaude({
        prompt: args.prompt,
        cwd: args.cwd,
        model: args.model,
        allowedTools: args.allowed_tools,
        disallowedTools: args.disallowed_tools,
        permissionMode: args.permission_mode,
        addDirs: args.add_dirs,
        mcpConfig: args.mcp_config,
        maxBudgetUsd: args.max_budget_usd,
        appendSystemPrompt: args.append_system_prompt,
        timeoutSeconds: args.timeout_seconds ?? DEFAULT_TIMEOUT_S,
        onProgress,
      });
      return envelopeToToolResult(envelope, exitCode, stderr);
    }
    if (name === "claude_resume") {
      const { envelope, exitCode, stderr } = await runClaude({
        prompt: args.prompt,
        resumeSessionId: args.session_id,
        cwd: args.cwd,
        model: args.model,
        allowedTools: args.allowed_tools,
        disallowedTools: args.disallowed_tools,
        permissionMode: args.permission_mode,
        addDirs: args.add_dirs,
        mcpConfig: args.mcp_config,
        maxBudgetUsd: args.max_budget_usd,
        appendSystemPrompt: args.append_system_prompt,
        timeoutSeconds: args.timeout_seconds ?? DEFAULT_TIMEOUT_S,
        forkSession: args.fork_session === true,
        onProgress,
      });
      return envelopeToToolResult(envelope, exitCode, stderr);
    }
    if (name === "claude_version") {
      const out = await new Promise((resolve, reject) => {
        const child = spawn(CLAUDE_BIN, ["--version"], {
          stdio: ["ignore", "pipe", "pipe"],
        });
        let buf = "";
        child.stdout.on("data", (d) => {
          buf += d.toString("utf8");
        });
        child.on("error", reject);
        child.on("close", () => resolve(buf.trim()));
      });
      return { content: [{ type: "text", text: out }] };
    }
    if (name === "claude_diag") {
      const env = process.env;
      const home = env.HOME || "(unset)";
      const credPath = home && home !== "(unset)" ? `${home}/.claude/.credentials.json` : null;
      const credExists = credPath ? existsSync(credPath) : false;
      const claudeJsonExists = home && home !== "(unset)" ? existsSync(`${home}/.claude.json`) : false;

      // Try `claude auth status` from this exact env to see what claude itself sees.
      const authStatus = await new Promise((resolve) => {
        const child = spawn(CLAUDE_BIN, ["auth", "status"], {
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...env },
        });
        let so = "", se = "";
        child.stdout.on("data", (d) => { so += d.toString("utf8"); });
        child.stderr.on("data", (d) => { se += d.toString("utf8"); });
        child.on("error", (err) => resolve({ exit: -1, stdout: "", stderr: err.message }));
        child.on("close", (code) => resolve({ exit: code, stdout: so, stderr: se }));
      });

      const report = {
        bridge_pid: process.pid,
        bridge_node_version: process.version,
        env: {
          HOME: home,
          USER: env.USER || "(unset)",
          LOGNAME: env.LOGNAME || "(unset)",
          PATH: env.PATH || "(unset)",
          SHELL: env.SHELL || "(unset)",
          ANTHROPIC_API_KEY_set: env.ANTHROPIC_API_KEY ? true : false,
          XDG_CONFIG_HOME: env.XDG_CONFIG_HOME || "(unset)",
        },
        files: {
          credentials_file_path: credPath,
          credentials_file_exists: credExists,
          claude_json_exists: claudeJsonExists,
        },
        claude_auth_status: authStatus,
      };
      return { content: [{ type: "text", text: JSON.stringify(report, null, 2) }] };
    }
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `${SELF_NAME} error: ${err.message}` }],
      isError: true,
    };
  }
});

logErr(`starting (cli=${CLAUDE_BIN}, default_timeout_s=${DEFAULT_TIMEOUT_S})`);
const transport = new StdioServerTransport();
await server.connect(transport);
