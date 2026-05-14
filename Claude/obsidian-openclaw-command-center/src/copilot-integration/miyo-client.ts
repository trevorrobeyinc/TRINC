import * as https from "https";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/**
 * Load the mkcert root CA so https.request validates the in-monorepo
 * miyo-tls-proxy at https://127.0.0.1:8743. If the file is missing, we
 * fall back to Node's default CA bundle — which will reject the mkcert
 * cert, causing every Miyo request to fail closed (the correct behavior
 * under the monorepo HTTPS-only invariant: never silently degrade).
 */
const MKCERT_CA_PATH = path.join(
  os.homedir(),
  "Library/Application Support/mkcert/rootCA.pem"
);
let mkcertCa: Buffer | undefined;
try {
  mkcertCa = fs.readFileSync(MKCERT_CA_PATH);
} catch {
  mkcertCa = undefined;
}

export interface MiyoSearchResult {
  path: string;
  score: number;
  title: string;
  chunk_text: string;
  file_name: string;
}

export interface MiyoHealthStatus {
  status: string;
  indexed_files: number;
  embedding_model: string;
  qdrant: string;
}

export interface MiyoScanResponse {
  status?: string;
  path?: string;
}

export interface MiyoIndexedFileEntry {
  path: string;
  title?: string | null;
  mtime: number;
  total_chunks?: number;
}

/**
 * HTTPS client for the Miyo semantic search backend.
 *
 * Talks to the in-monorepo TLS-terminating proxy at `https://127.0.0.1:8743`,
 * which forwards to Miyo's plaintext loopback upstream. Default port is 8743
 * (the HTTPS proxy); never point this client at Miyo's plaintext upstream
 * directly — that would violate the HTTPS-only invariant.
 *
 * API:
 *   GET  /v0/health → status, indexed_files, embedding_model
 *   POST /v0/search → {query, limit} → {results: [{path, score, title, chunk_text}]}
 *   POST /v0/search/related → {file_path, limit} → similar notes by embedding
 *
 * Degrades gracefully: connection refused or TLS handshake failure → null /
 * empty results. Never falls back to plain HTTP, per the monorepo HTTPS-only
 * invariant.
 */
export class MiyoClient {
  private port: number;
  private timeoutMs: number;

  constructor(port = 8743, timeoutMs = 5000) {
    this.port = port;
    this.timeoutMs = timeoutMs;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const data = await this.get<MiyoHealthStatus>("/v0/health");
      return data !== null && data.status === "ok";
    } catch {
      return false;
    }
  }

  async getHealth(): Promise<MiyoHealthStatus | null> {
    return this.get<MiyoHealthStatus>("/v0/health");
  }

  /**
   * Search for vault notes semantically similar to the query text.
   * Results are filtered by the given score threshold.
   */
  async search(
    query: string,
    limit: number,
    threshold: number
  ): Promise<MiyoSearchResult[]> {
    try {
      const body = JSON.stringify({ query, limit });
      const data = await this.post<{ results: MiyoSearchResult[] }>(
        "/v0/search",
        body
      );
      if (!data || !data.results) return [];
      return data.results.filter((r) => r.score >= threshold);
    } catch {
      return [];
    }
  }

  /**
   * Trigger an immediate rescan of a registered folder.
   * Returns immediately — indexing runs in the background.
   */
  async scanFolder(
    folderPath: string,
    force = false
  ): Promise<MiyoScanResponse | null> {
    try {
      const body = JSON.stringify({ path: folderPath, force });
      return await this.post<MiyoScanResponse>("/v0/scan", body);
    } catch {
      return null;
    }
  }

  /**
   * List indexed files with optional filtering.
   * Uses GET with query params via the getWithQuery helper.
   */
  async listFolderFiles(
    folderPath: string,
    filePath?: string,
    limit = 50
  ): Promise<{ files: MiyoIndexedFileEntry[]; total: number } | null> {
    try {
      return await this.getWithQuery<{
        files: MiyoIndexedFileEntry[];
        total: number;
      }>("/v0/folder/files", {
        folder_path: folderPath,
        file_path: filePath,
        limit,
      });
    } catch {
      return null;
    }
  }

  /**
   * Poll until all expected file paths appear in the Miyo index,
   * or until timeout expires. Returns which files were found and
   * which are still missing.
   */
  async waitForFilesIndexed(
    folderPath: string,
    expectedPaths: string[],
    timeoutMs: number,
    pollIntervalMs: number
  ): Promise<{ indexed: string[]; missing: string[] }> {
    const deadline = Date.now() + timeoutMs;
    const remaining = new Set(expectedPaths);

    while (remaining.size > 0 && Date.now() < deadline) {
      for (const fp of [...remaining]) {
        const result = await this.listFolderFiles(folderPath, fp, 1);
        if (result && result.files.length > 0) {
          remaining.delete(fp);
        }
      }
      if (remaining.size > 0 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, pollIntervalMs));
      }
    }

    return {
      indexed: expectedPaths.filter((p) => !remaining.has(p)),
      missing: [...remaining],
    };
  }

  /**
   * Search with exponential backoff retries when results are empty.
   * Handles the case where files are registered but embeddings
   * are still being generated.
   */
  async searchWithRetry(
    query: string,
    limit: number,
    threshold: number,
    retries: number
  ): Promise<MiyoSearchResult[]> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const results = await this.search(query, limit, threshold);
      if (results.length > 0 || attempt === retries) {
        return results;
      }
      const delayMs = Math.min(1000 * Math.pow(2, attempt), 4000);
      await new Promise((r) => setTimeout(r, delayMs));
    }
    return [];
  }

  /**
   * Find vault notes related to a given note by file path.
   */
  async searchRelated(
    filePath: string,
    limit: number
  ): Promise<MiyoSearchResult[]> {
    try {
      const body = JSON.stringify({ file_path: filePath, limit });
      const data = await this.post<{ results: MiyoSearchResult[] }>(
        "/v0/search/related",
        body
      );
      if (!data || !data.results) return [];
      return data.results;
    } catch {
      return [];
    }
  }

  private getWithQuery<T>(
    basePath: string,
    params: Record<string, string | number | undefined>
  ): Promise<T | null> {
    const query = Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(
        ([k, v]) =>
          `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`
      )
      .join("&");
    const fullPath = query ? `${basePath}?${query}` : basePath;
    return this.get<T>(fullPath);
  }

  private get<T>(path: string): Promise<T | null> {
    return new Promise((resolve) => {
      const req = https.request(
        {
          hostname: "127.0.0.1",
          port: this.port,
          path,
          method: "GET",
          timeout: this.timeoutMs,
          ca: mkcertCa,
        },
        (res) => {
          let body = "";
          res.on("data", (chunk: Buffer) => {
            body += chunk.toString();
          });
          res.on("end", () => {
            try {
              resolve(JSON.parse(body) as T);
            } catch {
              resolve(null);
            }
          });
        }
      );
      req.on("error", () => resolve(null));
      req.on("timeout", () => {
        req.destroy();
        resolve(null);
      });
      req.end();
    });
  }

  private post<T>(path: string, body: string): Promise<T | null> {
    return new Promise((resolve) => {
      const req = https.request(
        {
          hostname: "127.0.0.1",
          port: this.port,
          path,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
          timeout: this.timeoutMs,
          ca: mkcertCa,
        },
        (res) => {
          let data = "";
          res.on("data", (chunk: Buffer) => {
            data += chunk.toString();
          });
          res.on("end", () => {
            try {
              resolve(JSON.parse(data) as T);
            } catch {
              resolve(null);
            }
          });
        }
      );
      req.on("error", () => resolve(null));
      req.on("timeout", () => {
        req.destroy();
        resolve(null);
      });
      req.write(body);
      req.end();
    });
  }
}
