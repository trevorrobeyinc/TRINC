import type { TextGenerationRequest } from "../types/model.js";
import { OpenAICompatibleAdapter } from "./OpenAICompatibleAdapter.js";

export class LMStudioAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super("http://127.0.0.1:1234/v1");
  }

  protected override getEndpoint(request: TextGenerationRequest): string {
    const rawBaseUrl = request.model.baseUrl?.trim() || "http://127.0.0.1:1234/v1";
    const normalized = rawBaseUrl.replace(/\/+$/, "");
    if (normalized.endsWith("/chat/completions")) {
      return normalized;
    }
    if (normalized.endsWith("/v1")) {
      return `${normalized}/chat/completions`;
    }
    return `${normalized}/v1/chat/completions`;
  }
}
