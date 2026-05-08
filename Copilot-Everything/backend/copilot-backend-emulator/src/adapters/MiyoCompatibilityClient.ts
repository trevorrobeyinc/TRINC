import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { EmulatorEnv } from "../config/env.js";

export interface MiyoForwardRequest {
  method: "GET" | "POST" | "DELETE";
  routePath: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  incomingAuthorization?: string;
  incomingApiKey?: string;
}

export interface MiyoForwardResponse {
  status: number;
  contentType: string | null;
  body: unknown;
  text: string;
}

interface MiyoServiceConfig {
  host: string;
  port: number;
}

export class MiyoCompatibilityClient {
  private cachedBaseUrl: string | null = null;

  constructor(private readonly env: EmulatorEnv) {}

  async forward(request: MiyoForwardRequest): Promise<MiyoForwardResponse> {
    const baseUrl = await this.resolveBaseUrl();
    const url = new URL(request.routePath, `${baseUrl}/`);
    if (request.query) {
      Object.entries(request.query).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      });
    }

    const body = request.body === undefined ? undefined : JSON.stringify(request.body);
    const headers = this.buildHeaders(request, body !== undefined);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.env.REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: request.method,
        headers,
        body,
        signal: controller.signal,
      });
      const text = await response.text();
      return {
        status: response.status,
        contentType: response.headers.get("content-type"),
        body: this.parseBody(text, response.headers.get("content-type")),
        text,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async resolveBaseUrl(): Promise<string> {
    if (this.env.MIYO_BASE_URL.trim().length > 0) {
      return this.normalizeBaseUrl(this.env.MIYO_BASE_URL);
    }
    if (this.cachedBaseUrl) {
      return this.cachedBaseUrl;
    }

    for (const candidatePath of this.getServiceConfigPaths()) {
      try {
        const raw = await fs.readFile(candidatePath, "utf8");
        const config = JSON.parse(raw) as Partial<MiyoServiceConfig>;
        if (typeof config.host === "string" && typeof config.port === "number") {
          this.cachedBaseUrl = this.normalizeBaseUrl(`http://${config.host}:${config.port}`);
          return this.cachedBaseUrl;
        }
      } catch (error) {
        const code = (error as NodeJS.ErrnoException | undefined)?.code;
        if (code === "ENOENT") {
          continue;
        }
        throw error;
      }
    }

    throw new Error(
      "Miyo base URL is not configured. Set MIYO_BASE_URL or provide a readable Miyo service.json discovery file."
    );
  }

  private buildHeaders(
    request: Pick<MiyoForwardRequest, "incomingAuthorization" | "incomingApiKey">,
    hasBody: boolean
  ): Headers {
    const headers = new Headers();
    headers.set("Accept", "application/json");
    if (hasBody) {
      headers.set("Content-Type", "application/json");
    }

    const configuredAuth = this.env.MIYO_AUTH.trim();
    if (configuredAuth.length > 0) {
      headers.set("Authorization", `Bearer ${configuredAuth}`);
      headers.set("X-API-Key", configuredAuth);
      return headers;
    }

    if (request.incomingAuthorization) {
      headers.set("Authorization", request.incomingAuthorization);
    }
    if (request.incomingApiKey) {
      headers.set("X-API-Key", request.incomingApiKey);
    }

    return headers;
  }

  private parseBody(text: string, contentType: string | null): unknown {
    if (!text) {
      return {};
    }
    const isJson =
      contentType?.includes("application/json") === true ||
      text.startsWith("{") ||
      text.startsWith("[");
    if (!isJson) {
      return text;
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }

  private getServiceConfigPaths(): string[] {
    const homeDir = os.homedir();
    switch (os.platform()) {
      case "darwin":
        return [path.join(homeDir, "Library", "Application Support", "Miyo", "service.json")];
      case "linux":
        return [path.join(homeDir, ".config", "Miyo", "service.json")];
      case "win32": {
        const envLocalAppData = process.env.LOCALAPPDATA?.trim();
        const envAppData = process.env.APPDATA?.trim();
        const candidates = [
          envLocalAppData,
          path.join(homeDir, "AppData", "Local"),
          envAppData,
          path.join(homeDir, "AppData", "Roaming"),
        ].filter((value): value is string => Boolean(value));
        return [...new Set(candidates)].map((value) => path.join(value, "Miyo", "service.json"));
      }
      default:
        return [];
    }
  }

  private normalizeBaseUrl(value: string): string {
    return value.trim().replace(/\/+$/, "");
  }
}
