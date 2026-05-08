import { getPreferenceValues } from "@raycast/api";
import { randomUUID } from "node:crypto";

type RuntimeLane = "production_official" | "fork_dev" | "raycast";

interface BackendEmulatorPreferences {
  backendEmulatorUrl?: string;
  backendEmulatorApiKey?: string;
  backendRequestTimeoutMs?: string;
  backendRuntimeLane?: RuntimeLane;
}

interface AgentTurnResponse {
  ok: boolean;
  assistant?: {
    content?: string;
    reply?: string;
  };
  error?: {
    message?: string;
  };
}

export interface DeterministicToolCallRequest {
  tool: string;
  operation?:
    | "open_vault"
    | "create_note"
    | "append_note"
    | "read_note"
    | "search_notes"
    | "execute_command";
  input?: Record<string, unknown>;
  backendHint?: "cli";
}

export class BackendEmulatorService {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly runtimeLane: RuntimeLane;

  constructor() {
    const prefs = getPreferenceValues<BackendEmulatorPreferences>();
    this.baseUrl = (prefs.backendEmulatorUrl?.trim() || "http://127.0.0.1:8789").replace(
      /\/+$/,
      ""
    );
    this.apiKey = prefs.backendEmulatorApiKey?.trim() || "";
    this.timeoutMs = Number.parseInt(prefs.backendRequestTimeoutMs || "30000", 10) || 30_000;
    this.runtimeLane = prefs.backendRuntimeLane || "raycast";
  }

  async parseDoc(filePath: string): Promise<{ text: string }> {
    const response = await this.requestJson<{ text: string }>("/v0/parse-doc", {
      method: "POST",
      body: {
        path: filePath,
      },
    });
    return response;
  }

  async runAgentTurn(input: {
    userMessage: string;
    systemMessage?: string;
    includeReasoning?: boolean;
  }): Promise<string> {
    const userMessage = input.userMessage.trim();
    if (!userMessage) {
      throw new Error("Backend agent turn requires a non-empty user message.");
    }

    const payload = {
      requestId: randomUUID(),
      executionMode: "exact_backend_emulator" as const,
      runtimeLane: this.runtimeLane,
      chainType: "raycast_command",
      rawUserMessage: userMessage,
      originalUserMessage: userMessage,
      messages: [
        {
          role: "system" as const,
          content:
            input.systemMessage ||
            "You are an Obsidian assistant. Return only the final markdown answer with no preamble.",
        },
        {
          role: "user" as const,
          content: userMessage,
        },
      ],
      tools: [] as Array<Record<string, unknown>>,
      responseStyle: {
        stream: false,
        includeReasoning: input.includeReasoning ?? true,
      },
    };

    const response = await this.requestJson<AgentTurnResponse>(
      "/v1/self-host/agent-turn",
      {
        method: "POST",
        body: payload,
      }
    );

    if (!response.ok) {
      throw new Error(
        response.error?.message || "Backend agent turn failed without a detailed error."
      );
    }

    const answer =
      response.assistant?.reply?.trim() || response.assistant?.content?.trim() || "";
    if (!answer) {
      throw new Error("Backend agent turn returned an empty answer.");
    }
    return answer;
  }

  async callDeterministicTool(
    request: DeterministicToolCallRequest
  ): Promise<Record<string, unknown>> {
    return await this.requestJson<Record<string, unknown>>("/v1/self-host/tool-call", {
      method: "POST",
      body: request,
    });
  }

  private async requestJson<T>(
    routePath: string,
    options: { method: "GET" | "POST"; body?: unknown }
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
      headers["X-API-Key"] = this.apiKey;
    }
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${routePath}`, {
        method: options.method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });

      const text = await response.text();
      let parsed: unknown = {};
      try {
        parsed = text ? (JSON.parse(text) as unknown) : {};
      } catch {
        parsed = {};
      }

      if (!response.ok) {
        const errorMessage =
          typeof parsed === "object" &&
          parsed !== null &&
          "error" in parsed &&
          typeof (parsed as { error?: { message?: string } }).error?.message === "string"
            ? (parsed as { error: { message: string } }).error.message
            : `Backend request failed with status ${response.status}.`;
        throw new Error(errorMessage);
      }

      return parsed as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}
