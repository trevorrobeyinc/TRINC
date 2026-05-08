import type {
  Docs4llmResponse,
  Pdf4llmResponse,
  RerankResponse,
  Twitter4llmResponse,
  Url4llmResponse,
  Youtube4llmResponse,
} from "@/LLMProviders/brevilabsClient";

export type BackendMode = "hosted" | "self_host";

export type BackendCapability =
  | "license_validation"
  | "web_search"
  | "youtube_transcription"
  | "url_ingestion"
  | "twitter_ingestion"
  | "pdf_parse"
  | "docs_parse"
  | "rerank"
  | "vector_search";

export interface BackendCapabilityStatus {
  supported: boolean;
  configured: boolean;
  message: string;
}

export interface HostedLicenseValidationResult {
  isValid: boolean | undefined;
  plan?: string;
}

export interface BackendAdapter {
  readonly mode: BackendMode;
  readonly label: string;

  getCapabilityStatus(capability: BackendCapability): BackendCapabilityStatus;

  validateHostedLicense?(context?: Record<string, unknown>): Promise<HostedLicenseValidationResult>;
  webSearch?(query: string): Promise<{ content: string; citations: string[] }>;
  youtube4llm?(url: string): Promise<Youtube4llmResponse>;
  url4llm?(url: string): Promise<Url4llmResponse>;
  twitter4llm?(url: string): Promise<Twitter4llmResponse>;
  pdf4llm?(binaryContent: ArrayBuffer): Promise<Pdf4llmResponse>;
  docs4llm?(binaryContent: ArrayBuffer, fileType: string): Promise<Docs4llmResponse>;
  rerank?(query: string, documents: string[]): Promise<RerankResponse | null>;
}
