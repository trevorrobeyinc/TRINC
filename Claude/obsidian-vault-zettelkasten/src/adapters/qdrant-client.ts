import { requestUrl } from "obsidian";

/**
 * Direct Qdrant HTTP client for scrolling chunk payloads.
 * Bypasses Miyo to retrieve indexed chunk_text for a given file.
 */
export class QdrantClient {
  constructor(
    private baseUrl: string = "http://127.0.0.1:6333",
    private collection: string = "miyo"
  ) {}

  updateConfig(baseUrl: string, collection: string): void {
    this.baseUrl = baseUrl;
    this.collection = collection;
  }

  /** Scroll all chunks for a given file path from Qdrant. Returns chunk_text strings ordered by chunk_index. */
  async getChunksForFile(absoluteFilePath: string): Promise<string[]> {
    try {
      const res = await requestUrl({
        url: `${this.baseUrl}/collections/${this.collection}/points/scroll`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filter: {
            must: [{ key: "file_path", match: { value: absoluteFilePath } }],
          },
          limit: 100,
          with_payload: true,
          with_vector: false,
        }),
      });

      if (res.status !== 200) return [];

      const data = res.json as {
        result?: {
          points?: Array<{
            payload?: { chunk_text?: string; chunk_index?: number };
          }>;
        };
      };

      const points = data.result?.points ?? [];

      return points
        .sort((a, b) => (a.payload?.chunk_index ?? 0) - (b.payload?.chunk_index ?? 0))
        .map((p) => p.payload?.chunk_text ?? "")
        .filter(Boolean);
    } catch {
      return [];
    }
  }
}
