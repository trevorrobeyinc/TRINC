import {
  hasSelfHostSearchKey,
  selfHostWebSearch,
  selfHostYoutube4llm,
} from "@/LLMProviders/selfHostServices";
import { getSettings } from "@/settings/model";
import type {
  SelfHostStreamHandlers,
  SelfHostTurnErrorResponse,
  SelfHostTurnRequest,
  SelfHostTurnSuccessResponse,
} from "./selfHostContract";
import type {
  BackendAdapter,
  BackendCapability,
  BackendCapabilityStatus,
  HostedLicenseValidationResult,
} from "./BackendAdapter";
import type {
  Docs4llmResponse,
  Pdf4llmResponse,
  RerankResponse,
  Twitter4llmResponse,
  Url4llmResponse,
  Youtube4llmResponse,
} from "@/LLMProviders/brevilabsClient";
import { requestUrl } from "obsidian";
import { createParser, type ParseEvent, type ParsedEvent } from "eventsource-parser";

function notSupported(capability: string): Error {
  return new Error(`Self-host adapter does not currently support ${capability}.`);
}

function rejectUnsupported<T>(capability: string): Promise<T> {
  return Promise.reject(notSupported(capability));
}

function appendSelfHostCapture(entry: Record<string, unknown>): void {
  const globalState = globalThis as Record<string, any>;
  if (!globalState.__copilotMcpSelfHostCapture) {
    globalState.__copilotMcpSelfHostCapture = { requests: [] };
  }
  globalState.__copilotMcpSelfHostCapture.requests.push(entry);
}

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      key.toLowerCase() === "authorization" ? "[redacted]" : value,
    ])
  );
}

function redactBody(body?: string): string | null {
  if (typeof body !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(body) as Record<string, any>;
    if (parsed?.model?.apiKey) {
      parsed.model.apiKey = "[redacted]";
    }
    return JSON.stringify(parsed);
  } catch {
    return body;
  }
}

export class SelfHostAdapter implements BackendAdapter {
  readonly mode = "self_host" as const;
  readonly label = "Self-Host";

  getCapabilityStatus(capability: BackendCapability): BackendCapabilityStatus {
    const settings = getSettings();

    switch (capability) {
      case "license_validation":
        return {
          supported: false,
          configured: false,
          message: "Self-host mode does not use hosted license validation.",
        };
      case "web_search":
        return {
          supported: true,
          configured: hasSelfHostSearchKey(),
          message: hasSelfHostSearchKey()
            ? "Self-host web search is configured."
            : "Configure a Firecrawl or Perplexity key for self-host web search.",
        };
      case "youtube_transcription":
        return {
          supported: true,
          configured: !!settings.supadataApiKey,
          message: settings.supadataApiKey
            ? "Self-host YouTube transcription is configured."
            : "Configure a Supadata key for self-host YouTube transcription.",
        };
      case "vector_search":
        return {
          supported: true,
          configured: !!settings.selfHostAdapter.baseUrl || settings.enableMiyo,
          message:
            !!settings.selfHostAdapter.baseUrl || settings.enableMiyo
              ? "Self-host vector search is configured."
              : "Configure a self-host backend URL or enable Miyo for vector search.",
        };
      case "pdf_parse":
        return {
          supported: settings.enableMiyo,
          configured: settings.enableMiyo,
          message: settings.enableMiyo
            ? "PDF parsing is delegated to Miyo in self-host mode."
            : "Enable Miyo to parse PDFs in self-host mode.",
        };
      case "docs_parse":
        return {
          supported: false,
          configured: false,
          message: "Document conversion is not implemented for the self-host adapter yet.",
        };
      case "url_ingestion":
        return {
          supported: false,
          configured: false,
          message: "URL ingestion is currently hosted-only.",
        };
      case "twitter_ingestion":
        return {
          supported: false,
          configured: false,
          message: "Twitter/X ingestion is currently hosted-only.",
        };
      case "rerank":
        return {
          supported: false,
          configured: false,
          message: "Reranking is not implemented for the self-host adapter yet.",
        };
    }
  }

  async validateHostedLicense(): Promise<HostedLicenseValidationResult> {
    return { isValid: true, plan: "self_host" };
  }

  async webSearch(query: string): Promise<{ content: string; citations: string[] }> {
    if (!hasSelfHostSearchKey()) {
      throw new Error(
        "Self-host web search is not configured. Add a Firecrawl or Perplexity key in settings."
      );
    }
    return await selfHostWebSearch(query);
  }

  async youtube4llm(url: string): Promise<Youtube4llmResponse> {
    if (!getSettings().supadataApiKey) {
      throw new Error(
        "Self-host YouTube transcription is not configured. Add a Supadata key in settings."
      );
    }
    return await selfHostYoutube4llm(url);
  }

  async url4llm(_url: string): Promise<Url4llmResponse> {
    return rejectUnsupported("URL ingestion");
  }

  async twitter4llm(_url: string): Promise<Twitter4llmResponse> {
    return rejectUnsupported("Twitter/X ingestion");
  }

  async pdf4llm(_binaryContent: ArrayBuffer): Promise<Pdf4llmResponse> {
    return rejectUnsupported("PDF parsing");
  }

  async docs4llm(_binaryContent: ArrayBuffer, _fileType: string): Promise<Docs4llmResponse> {
    return rejectUnsupported("document conversion");
  }

  async rerank(_query: string, _documents: string[]): Promise<RerankResponse | null> {
    return null;
  }

  async health(signal?: AbortSignal): Promise<unknown> {
    const response = await this.request(this.buildUrl("/healthz"), {
      method: "GET",
      headers: this.buildHeaders(),
    });
    return response.json;
  }

  async agentTurn(
    payload: SelfHostTurnRequest,
    signal?: AbortSignal
  ): Promise<SelfHostTurnSuccessResponse> {
    const response = await this.request(this.buildUrl("/v1/self-host/agent-turn"), {
      method: "POST",
      headers: this.buildJsonHeaders(),
      body: JSON.stringify(payload),
    });

    const json = response.json as SelfHostTurnSuccessResponse | SelfHostTurnErrorResponse;
    if (!response.ok || !json.ok) {
      throw new Error(this.extractErrorMessage(json));
    }

    return json;
  }

  async streamAgentTurn(
    payload: SelfHostTurnRequest,
    handlers: SelfHostStreamHandlers,
    signal?: AbortSignal
  ): Promise<SelfHostTurnSuccessResponse> {
    const response = await this.request(this.buildUrl("/v1/self-host/agent-turn/stream"), {
      method: "POST",
      headers: this.buildJsonHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const fallbackErrorCode = this.extractErrorCode(response.json);
      if (fallbackErrorCode === "streaming_not_allowed_for_lane") {
        return await this.agentTurn(
          {
            ...payload,
            responseStyle: {
              ...payload.responseStyle,
              stream: false,
            },
          },
          signal
        );
      }

      throw new Error(response.text || `Self-host stream failed with HTTP ${response.status}`);
    }

    let finalResponse: SelfHostTurnSuccessResponse | null = null;
    let streamError: string | null = null;

    const parser = createParser((event: ParseEvent) => {
      if (event.type !== "event") {
        return;
      }

      const parsedEvent = event as ParsedEvent;
      if (!parsedEvent.event) {
        return;
      }

      const data = JSON.parse(event.data) as Record<string, any>;

      switch (parsedEvent.event) {
        case "reasoning_step":
          if (typeof data.displayContent === "string") {
            handlers.onDisplayContent?.(data.displayContent);
          }
          if (typeof data.summary === "string" && typeof data.displayContent === "string") {
            handlers.onReasoningStep?.(data.summary, data.displayContent);
          }
          break;
        case "tool_call_start":
          if (typeof data.displayContent === "string") {
            handlers.onDisplayContent?.(data.displayContent);
          }
          handlers.onToolCallStart?.(
            String(data.toolName || ""),
            String(data.displayName || ""),
            (data.args as Record<string, unknown>) || {},
            String(data.displayContent || "")
          );
          break;
        case "tool_call_result":
          if (typeof data.displayContent === "string") {
            handlers.onDisplayContent?.(data.displayContent);
          }
          handlers.onToolCallResult?.(
            String(data.toolName || ""),
            Boolean(data.success),
            String(data.displayResult || ""),
            String(data.displayContent || "")
          );
          break;
        case "assistant_delta":
          if (typeof data.displayContent === "string") {
            handlers.onDisplayContent?.(data.displayContent);
          }
          handlers.onAssistantDelta?.(String(data.delta || ""), String(data.displayContent || ""));
          break;
        case "final":
          finalResponse = data as SelfHostTurnSuccessResponse;
          if (finalResponse?.assistant?.content) {
            handlers.onDisplayContent?.(finalResponse.assistant.content);
          }
          break;
        case "error":
          streamError = this.extractErrorMessage(data as SelfHostTurnErrorResponse);
          break;
      }
    });

    parser.feed(response.text);

    if (streamError) {
      throw new Error(streamError);
    }
    if (!finalResponse) {
      throw new Error("Self-host stream ended without a final response.");
    }

    return finalResponse;
  }

  private buildUrl(path: string): string {
    const settings = getSettings();
    const baseUrl = (settings.selfHostAdapter.baseUrl || settings.selfHostUrl || "").trim();
    if (!baseUrl) {
      throw new Error("Self-host base URL is not configured.");
    }
    return `${baseUrl.replace(/\/+$/, "")}${path}`;
  }

  private buildHeaders(): Headers {
    const headers = new Headers();
    const apiKey = (
      getSettings().selfHostAdapter.apiKey ||
      getSettings().selfHostApiKey ||
      ""
    ).trim();
    if (apiKey) {
      headers.set("Authorization", `Bearer ${apiKey}`);
    }
    return headers;
  }

  private buildJsonHeaders(): Headers {
    const headers = this.buildHeaders();
    headers.set("Content-Type", "application/json");
    return headers;
  }

  private async request(
    url: string,
    init: {
      method: string;
      headers?: Headers;
      body?: string;
    }
  ): Promise<{ ok: boolean; status: number; text: string; json: any }> {
    const headerEntries = init.headers ? Object.fromEntries(init.headers.entries()) : {};
    const contentType = headerEntries["content-type"] || headerEntries["Content-Type"];
    delete headerEntries["content-type"];
    delete headerEntries["Content-Type"];

    const captureEntry: Record<string, unknown> = {
      url,
      method: init.method,
      headers: redactHeaders(headerEntries),
      requestBody: redactBody(init.body),
      startedAt: new Date().toISOString(),
    };

    const response = await requestUrl({
      url,
      method: init.method,
      headers: headerEntries,
      ...(contentType ? { contentType } : {}),
      ...(typeof init.body === "string" ? { body: init.body } : {}),
      throw: false,
    });

    let parsedJson = response.json;
    if (typeof parsedJson === "string") {
      try {
        parsedJson = JSON.parse(parsedJson);
      } catch {
        parsedJson = null;
      }
    }

    captureEntry.status = response.status;
    captureEntry.responseText = response.text;
    captureEntry.finishedAt = new Date().toISOString();
    appendSelfHostCapture(captureEntry);
    console.log("[SelfHostAdapter]", captureEntry);

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      text: response.text,
      json: parsedJson,
    };
  }

  private extractErrorMessage(
    errorResponse: SelfHostTurnErrorResponse | Record<string, any>
  ): string {
    if (typeof errorResponse?.error?.message === "string") {
      return errorResponse.error.message;
    }
    return "Self-host backend emulator request failed.";
  }

  private extractErrorCode(errorResponse: Record<string, any>): string {
    if (typeof errorResponse?.error?.code === "string") {
      return errorResponse.error.code;
    }
    return "";
  }
}
