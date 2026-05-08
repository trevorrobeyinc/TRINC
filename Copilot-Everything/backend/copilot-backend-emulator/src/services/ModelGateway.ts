import type {
  TextGenerationRequest,
  TextGenerationResult,
  TextStreamCallbacks,
} from "../types/model.js";
import { LMStudioAdapter } from "../adapters/LMStudioAdapter.js";
import { OllamaAdapter } from "../adapters/OllamaAdapter.js";
import { OpenAICompatibleAdapter } from "../adapters/OpenAICompatibleAdapter.js";

export class ModelGateway {
  private readonly openAICompatibleAdapter = new OpenAICompatibleAdapter();
  private readonly lmStudioAdapter = new LMStudioAdapter();
  private readonly ollamaAdapter = new OllamaAdapter();

  async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
    return await this.getAdapter(request.model.provider).generateText(request);
  }

  async streamText(
    request: TextGenerationRequest,
    callbacks: TextStreamCallbacks
  ): Promise<TextGenerationResult> {
    return await this.getAdapter(request.model.provider).streamText(request, callbacks);
  }

  private getAdapter(provider: string):
    | OpenAICompatibleAdapter
    | LMStudioAdapter
    | OllamaAdapter {
    if (provider === "lm-studio") {
      return this.lmStudioAdapter;
    }

    if (provider === "ollama") {
      return this.ollamaAdapter;
    }

    return this.openAICompatibleAdapter;
  }
}
