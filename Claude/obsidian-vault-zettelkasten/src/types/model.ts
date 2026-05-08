export type CanonicalChatRole = "system" | "user" | "assistant";

export interface CanonicalChatMessage {
  role: CanonicalChatRole;
  content: string;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface ResolvedModelConfig {
  key: string;
  name: string;
  provider: string;
  baseUrl?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface TextGenerationRequest {
  model: ResolvedModelConfig;
  messages: CanonicalChatMessage[];
  signal?: AbortSignal;
}

export interface TextGenerationResult {
  text: string;
  usage?: TokenUsage;
  finishReason?: string | null;
}
