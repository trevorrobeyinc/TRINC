export const PLUGIN_ID = "vault-zettelkasten";
export const VIEW_TYPE = "vault-zettelkasten-view";

export interface VaultZKSettings {
  // LLM
  llmProvider: "lm-studio" | "ollama" | "openai";
  llmBaseUrl: string;
  llmModelName: string;
  llmApiKey: string;
  llmTemperature: number;
  llmMaxTokens: number;

  // Miyo
  miyoBaseUrl: string;

  // Qdrant
  qdrantBaseUrl: string;
  qdrantCollection: string;

  // Scheduler
  enableOrphanScan: boolean;
  enableHealthDigest: boolean;
  enableSerendipityDigest: boolean;

  // Reports
  reportsFolder: string;
}

export const DEFAULT_SETTINGS: VaultZKSettings = {
  llmProvider: "ollama",
  llmBaseUrl: "https://127.0.0.1:11435",
  llmModelName: "qwen2.5:7b-instruct",
  llmApiKey: "",
  llmTemperature: 0.7,
  llmMaxTokens: 2048,

  miyoBaseUrl: "https://127.0.0.1:8743",

  qdrantBaseUrl: "https://127.0.0.1:6433",
  qdrantCollection: "miyo",

  enableOrphanScan: true,
  enableHealthDigest: true,
  enableSerendipityDigest: true,

  reportsFolder: "Zettelkasten/Reports",
};
