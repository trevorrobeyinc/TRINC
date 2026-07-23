export const PLUGIN_ID = "vault-zettelkasten";
export const VIEW_TYPE = "vault-zettelkasten-view";

export interface VaultZKSettings {
  // LLM. Ollama and LM Studio were both removed from this stack (LM Studio
  // 2026-07-16, Ollama 2026-07-23) — the Obsidian side now runs entirely on the
  // hosted Copilot Plus model, same as the chat panel and the wiki-definition
  // plugin. "openai" is the generic OpenAI-compatible path (baseUrl + apiKey).
  llmProvider: "openai";
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
  llmProvider: "openai",
  llmBaseUrl: "https://models.brevilabs.com/v1",
  llmModelName: "copilot-plus-flash",
  // Left EMPTY on purpose — never store the licence key in this data.json.
  // Resolution order at call time: request.model.apiKey (the wiki plugin passes
  // it per call) → ~/.config/trevclaw/brevilabs-key (0600) → this field.
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
