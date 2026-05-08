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
  openAIOrgId?: string;
  azureOpenAIApiInstanceName?: string;
  azureOpenAIApiDeploymentName?: string;
  azureOpenAIApiVersion?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  reasoningEffort?: string;
  verbosity?: string;
  stream?: boolean;
  streamUsage?: boolean;
  numCtx?: number;
  useResponsesApi?: boolean;
  capabilities?: string[];
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
  rawReasoning?: string[];
}

export interface TextStreamCallbacks {
  onToken: (token: string) => void;
  signal?: AbortSignal;
}
