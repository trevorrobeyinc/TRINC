/**
 * Direct Qdrant HTTP client for scrolling chunk payloads.
 * Bypasses Miyo to retrieve indexed chunk_text for a given file.
 */
export class QdrantScrollClient {
  constructor(
    private readonly qdrantUrl = "http://127.0.0.1:6333",
    private readonly collection = "miyo"
  ) {}

  /**
   * Scroll all chunks for a given file path from Qdrant.
   * Returns chunk_text strings ordered by chunk_index.
   */
  async getChunksForFile(absoluteFilePath: string): Promise<string[]> {
    const url = `${this.qdrantUrl}/collections/${this.collection}/points/scroll`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filter: {
          must: [
            { key: "file_path", match: { value: absoluteFilePath } },
          ],
        },
        limit: 100,
        with_payload: true,
        with_vector: false,
      }),
    });

    if (!response.ok) return [];

    const data = (await response.json()) as {
      result?: {
        points?: Array<{
          payload?: {
            chunk_text?: string;
            chunk_index?: number;
          };
        }>;
      };
    };

    const points = data.result?.points ?? [];

    // Sort by chunk_index, then extract text
    return points
      .sort(
        (a, b) =>
          (a.payload?.chunk_index ?? 0) - (b.payload?.chunk_index ?? 0)
      )
      .map((p) => p.payload?.chunk_text ?? "")
      .filter(Boolean);
  }
}
