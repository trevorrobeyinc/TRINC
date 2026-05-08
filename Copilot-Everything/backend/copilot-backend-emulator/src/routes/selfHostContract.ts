import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { selfHostErrorSchema } from "../types/selfHost.js";
import type { CopilotRequestParser } from "../services/CopilotRequestParser.js";
import type { SelfHostExecutionEngine } from "../services/SelfHostExecutionEngine.js";
import type { AuthAdapter } from "../adapters/AuthAdapter.js";
import type { BridgeMcpClient } from "../adapters/BridgeMcpClient.js";

const deterministicToolCallSchema = z.object({
  tool: z.string().min(1),
  operation: z
    .enum([
      "open_vault",
      "create_note",
      "append_note",
      "read_note",
      "search_notes",
      "execute_command",
    ])
    .optional(),
  input: z.record(z.unknown()).optional(),
  backendHint: z.enum(["cli"]).optional(),
});

function writeSseEvent(
  reply: { raw: NodeJS.WritableStream },
  event: string,
  data: unknown
): void {
  reply.raw.write(`event: ${event}\n`);
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

export async function registerSelfHostContractRoutes(
  app: FastifyInstance,
  authAdapter: AuthAdapter,
  requestParser: CopilotRequestParser,
  executionEngine: SelfHostExecutionEngine,
  bridgeClient: BridgeMcpClient
): Promise<void> {
  app.post("/v1/self-host/agent-turn", async (request, reply) => {
    try {
      authAdapter.assertAuthorized(request);
      const parsed = requestParser.parse(request.body);
      return await executionEngine.execute(parsed);
    } catch (error) {
      reply.code(400);
      return selfHostErrorSchema.parse({
        ok: false,
        mode: "exact_backend_emulator",
        error: {
          code: "agent_turn_failed",
          message: error instanceof Error ? error.message : String(error),
          retryable: false,
        },
      });
    }
  });

  app.post("/v1/self-host/agent-turn/stream", async (request, reply) => {
    authAdapter.assertAuthorized(request);
    const parsed = requestParser.parse(request.body);
    if (parsed.runtimeLane !== "fork_dev" || parsed.responseStyle.stream !== true) {
      reply.code(400);
      return selfHostErrorSchema.parse({
        ok: false,
        mode: "exact_backend_emulator",
        requestId: parsed.requestId,
        error: {
          code: "streaming_not_allowed_for_lane",
          message:
            "Streaming is only allowed for runtimeLane='fork_dev' when responseStyle.stream=true. Use the buffered /v1/self-host/agent-turn route for production_official and raycast lanes.",
          retryable: false,
        },
      });
    }

    reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("Cache-Control", "no-store");
    reply.raw.setHeader("Connection", "keep-alive");

    try {
      const response = await executionEngine.execute(
        parsed,
        {
          onReasoningStep: (summary, displayContent) => {
            writeSseEvent(reply, "reasoning_step", { summary, displayContent });
          },
          onToolCallStart: (toolName, displayName, args, displayContent) => {
            writeSseEvent(reply, "tool_call_start", {
              toolName,
              displayName,
              args,
              displayContent,
            });
          },
          onToolCallResult: (toolName, success, displayResult, displayContent) => {
            writeSseEvent(reply, "tool_call_result", {
              toolName,
              success,
              displayResult,
              displayContent,
            });
          },
          onAssistantDelta: (delta, displayContent) => {
            writeSseEvent(reply, "assistant_delta", { delta, displayContent });
          },
        }
      );

      writeSseEvent(reply, "final", response);
      reply.raw.end();
      return reply;
    } catch (error) {
      writeSseEvent(reply, "error", {
        ok: false,
        mode: "exact_backend_emulator",
        error: {
          code: "agent_turn_stream_failed",
          message: error instanceof Error ? error.message : String(error),
          retryable: false,
        },
      });
      reply.raw.end();
      return reply;
    }
  });

  app.post("/v1/self-host/tool-call", async (request, reply) => {
    authAdapter.assertAuthorized(request);
    try {
      const parsed = deterministicToolCallSchema.parse(request.body);
      const result = await bridgeClient.callTool(parsed);
      if (!result.ok) {
        const status = result.error.retryable ? 502 : 400;
        reply.code(status);
      }
      return result;
    } catch (error) {
      reply.code(400);
      return {
        ok: false,
        error: {
          code: "invalid_tool_call_request",
          message: error instanceof Error ? error.message : String(error),
          retryable: false,
        },
      };
    }
  });
}
