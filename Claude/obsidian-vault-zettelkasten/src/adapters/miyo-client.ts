import { requestUrl } from "obsidian";

export interface MiyoSearchResult {
  path: string;
  score?: number;
  chunk_text?: string;
  title?: string;
  tags?: string[];
  mtime?: number;
  [key: string]: unknown;
}

/**
 * HTTP client for Miyo semantic search at :8742.
 * Uses Obsidian's requestUrl for Electron compatibility.
 */
export class MiyoClient {
  constructor(private baseUrl: string = "http://127.0.0.1:8742") {}

  updateBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  /** Check if Miyo is running. */
  async isHealthy(): Promise<boolean> {
    try {
      const res = await requestUrl({ url: `${this.baseUrl}/health`, method: "GET" });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  /** Semantic search via POST /v0/search. */
  async search(query: string, vault: string, limit = 5): Promise<MiyoSearchResult[]> {
    try {
      const res = await requestUrl({
        url: `${this.baseUrl}/v0/search`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, vault, limit }),
      });

      if (res.status !== 200) return [];

      const data = res.json;
      return Array.isArray(data?.results) ? data.results : [];
    } catch {
      return [];
    }
  }

  /** Related notes search via POST /v0/search/related. */
  async searchRelated(filePath: string, vault: string, limit = 10): Promise<MiyoSearchResult[]> {
    try {
      const res = await requestUrl({
        url: `${this.baseUrl}/v0/search/related`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_path: filePath, vault, limit }),
      });

      if (res.status !== 200) return [];

      const data = res.json;
      return Array.isArray(data?.results) ? data.results : [];
    } catch {
      return [];
    }
  }
}
