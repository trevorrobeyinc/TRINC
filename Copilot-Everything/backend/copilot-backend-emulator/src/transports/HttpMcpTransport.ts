import { createHash, randomUUID } from "node:crypto";
import type { EmulatorEnv } from "../config/env.js";

export class HttpMcpTransport {
  constructor(private readonly env: EmulatorEnv) {}

  async healthCheck(): Promise<unknown> {
    const response = await fetch(`${this.normalizeBaseUrl(this.env.MCP_BRIDGE_BASE_URL)}/healthz`, {
      method: "GET",
    });
    return await response.json();
  }

  async postJson<T>(path: string, payload: unknown, signal?: AbortSignal): Promise<T> {
    const body = JSON.stringify(payload);
    const timestamp = Date.now().toString();
    const nonce = randomUUID();
    const headers = new Headers({
      "Content-Type": "application/json",
      "X-MCP-Nonce": nonce,
      "X-MCP-Timestamp": timestamp,
      "X-MCP-Body-Sha256": this.sha256Hex(body),
    });

    if (this.env.MCP_BRIDGE_AUTH_TOKEN) {
      headers.set("Authorization", `Bearer ${this.env.MCP_BRIDGE_AUTH_TOKEN}`);
      headers.set("X-MCP-Token", this.env.MCP_BRIDGE_AUTH_TOKEN);
    }

    const response = await fetch(`${this.normalizeBaseUrl(this.env.MCP_BRIDGE_BASE_URL)}${path}`, {
      method: "POST",
      headers,
      body,
      signal,
    });

    const json = (await response.json()) as T;
    return json;
  }

  private normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.replace(/\/+$/, "");
  }

  private sha256Hex(body: string): string {
    return createHash("sha256").update(body, "utf8").digest("hex");
  }
}
