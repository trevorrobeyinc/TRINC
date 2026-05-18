/**
 * REST API Backend
 *
 * Forwards bridge operations to the Obsidian Local REST API plugin
 * (https://github.com/coddingtonbear/obsidian-local-rest-api) over HTTPS at
 * 127.0.0.1:27124. The plugin runs inside Obsidian and exposes:
 *
 *   GET    /                              auth + status probe
 *   GET    /vault/{path}                  read note
 *   PUT    /vault/{path}                  create or overwrite note
 *   PATCH  /vault/{path}                  append/prepend (Operation header)
 *   POST   /search/simple/?query=...      simple text search
 *   POST   /commands/{commandId}/         execute Obsidian command
 *   POST   /open/{path}?newLeaf=...       open file in UI
 *
 * The plugin presents a self-signed cert that we trust via the file at
 * OBSIDIAN_REST_API_CERT_PATH. Auth is a Bearer token at OBSIDIAN_REST_API_KEY.
 *
 * Failure mode: if the plugin isn't loaded or Obsidian isn't running, probe()
 * returns { available: false } and the BackendSelector falls back to the cli
 * backend automatically.
 */

import fs from "node:fs";
import https from "node:https";
import { URL } from "node:url";
import type { Backend, BackendCapabilities } from "./backend";
import type { BackendResult, ExecutionContext, Operation } from "../types";

const SUPPORTED_OPS: Operation[] = [
  "open_vault",
  "create_note",
  "append_note",
  "read_note",
  "search_notes",
  "execute_command",
];

const DEFAULT_BASE = "https://127.0.0.1:27124";
const DEFAULT_PROBE_TIMEOUT_MS = 3_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export interface RestApiBackendOptions {
  baseUrl?: string;
  apiKey?: string;
  certPath?: string;
  probeTimeoutMs?: number;
  requestTimeoutMs?: number;
}

interface ResolvedConfig {
  baseUrl: string;
  apiKey: string;
  agent: https.Agent;
  probeTimeoutMs: number;
  requestTimeoutMs: number;
}

interface RawResponse {
  statusCode: number;
  body: string;
  durationMs: number;
}

function readCertOrThrow(certPath: string): string {
  if (!fs.existsSync(certPath)) {
    throw new Error(`OBSIDIAN_REST_API_CERT_PATH not found: ${certPath}`);
  }
  return fs.readFileSync(certPath, "utf8");
}

function resolveOptions(opts: RestApiBackendOptions): ResolvedConfig {
  const baseUrl = (opts.baseUrl ?? process.env.OBSIDIAN_REST_API_BASE ?? DEFAULT_BASE).replace(/\/+$/, "");
  const apiKey = opts.apiKey ?? process.env.OBSIDIAN_REST_API_KEY ?? "";
  const certPath = opts.certPath ?? process.env.OBSIDIAN_REST_API_CERT_PATH ?? "";

  if (!apiKey) {
    throw new Error("OBSIDIAN_REST_API_KEY is not set; cannot construct RestApiBackend");
  }
  if (!certPath) {
    throw new Error("OBSIDIAN_REST_API_CERT_PATH is not set; cannot construct RestApiBackend");
  }

  const ca = readCertOrThrow(certPath);
  const agent = new https.Agent({ ca });

  return {
    baseUrl,
    apiKey,
    agent,
    probeTimeoutMs: opts.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS,
    requestTimeoutMs: opts.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
  };
}

interface RequestSpec {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  pathAndQuery: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
}

function rawRequest(config: ResolvedConfig, spec: RequestSpec, timeoutMs: number): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(config.baseUrl + spec.pathAndQuery);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.apiKey}`,
      Accept: "application/json",
      ...(spec.headers ?? {}),
    };
    if (spec.body !== undefined && headers["Content-Type"] === undefined) {
      headers["Content-Type"] = "application/json";
    }

    const startedAt = Date.now();
    const req = https.request(
      {
        method: spec.method,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers,
        agent: config.agent,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            durationMs: Date.now() - startedAt,
          });
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error(`request timeout after ${timeoutMs}ms`));
    });
    req.on("error", reject);
    if (spec.body !== undefined) req.write(spec.body);
    req.end();
  });
}

function encodeVaultPath(relPath: string): string {
  return relPath
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`expected string for ${field}, got ${typeof value}`);
  }
  return value;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function toBackendResult(raw: RawResponse, parsed?: unknown): BackendResult {
  const ok = raw.statusCode >= 200 && raw.statusCode < 300;
  return {
    statusCode: raw.statusCode,
    stdout: ok ? raw.body : "",
    stderr: ok ? "" : raw.body,
    durationMs: raw.durationMs,
    parsed,
  };
}

export class RestApiBackend implements Backend {
  readonly id = "restApi" as const;
  private readonly options: RestApiBackendOptions;

  constructor(opts: RestApiBackendOptions = {}) {
    this.options = opts;
  }

  async probe(): Promise<BackendCapabilities> {
    let config: ResolvedConfig;
    try {
      config = resolveOptions(this.options);
    } catch (error) {
      return {
        backend: "restApi",
        available: false,
        supportedOps: [],
        reliabilityScore: 0,
        p95MsByOp: {},
        lastErrorAt: new Date().toISOString(),
        constraints: [`config_invalid:${(error as Error).message}`],
      };
    }

    try {
      const raw = await rawRequest(
        config,
        { method: "GET", pathAndQuery: "/" },
        config.probeTimeoutMs
      );
      let parsed: { authenticated?: boolean; service?: string; versions?: Record<string, string> } = {};
      try {
        parsed = JSON.parse(raw.body);
      } catch {
        // non-JSON body — treated as unavailable
      }
      const authenticated = Boolean(parsed?.authenticated);
      if (raw.statusCode !== 200 || !authenticated) {
        return {
          backend: "restApi",
          available: false,
          supportedOps: [],
          reliabilityScore: 0,
          p95MsByOp: {},
          lastErrorAt: new Date().toISOString(),
          constraints: [
            `probe_status:${raw.statusCode}`,
            `authenticated:${authenticated}`,
          ],
          diagnostics: { service: parsed?.service, versions: parsed?.versions },
        };
      }
      return {
        backend: "restApi",
        available: true,
        supportedOps: SUPPORTED_OPS,
        reliabilityScore: 0.99,
        p95MsByOp: {
          open_vault: 200,
          create_note: 250,
          append_note: 200,
          read_note: 150,
          search_notes: 400,
          execute_command: 500,
        },
        constraints: [
          "Requires Obsidian.app running with obsidian-local-rest-api plugin enabled.",
        ],
        diagnostics: { service: parsed?.service, versions: parsed?.versions },
      };
    } catch (error) {
      return {
        backend: "restApi",
        available: false,
        supportedOps: [],
        reliabilityScore: 0,
        p95MsByOp: {},
        lastErrorAt: new Date().toISOString(),
        constraints: [`probe_failed:${String(error)}`],
      };
    }
  }

  async execute(operation: Operation, input: unknown, _ctx: ExecutionContext): Promise<BackendResult> {
    const config = resolveOptions(this.options);
    const payload = (input as Record<string, unknown>) ?? {};

    switch (operation) {
      case "read_note": {
        const path = encodeVaultPath(asString(payload.path, "path"));
        const raw = await rawRequest(
          config,
          { method: "GET", pathAndQuery: `/vault/${path}`, headers: { Accept: "text/markdown" } },
          config.requestTimeoutMs
        );
        return toBackendResult(raw, raw.statusCode === 200 ? { content: raw.body } : undefined);
      }

      case "create_note": {
        const path = encodeVaultPath(asString(payload.path, "path"));
        const content = asOptionalString(payload.content) ?? "";
        const raw = await rawRequest(
          config,
          {
            method: "PUT",
            pathAndQuery: `/vault/${path}`,
            headers: { "Content-Type": "text/markdown" },
            body: content,
          },
          config.requestTimeoutMs
        );
        return toBackendResult(raw);
      }

      case "append_note": {
        const path = encodeVaultPath(asString(payload.path, "path"));
        const content = asString(payload.content, "content");
        const inline = payload.inline === true;
        const raw = await rawRequest(
          config,
          {
            method: "POST",
            pathAndQuery: `/vault/${path}`,
            headers: {
              "Content-Type": "text/markdown",
              "Content-Insertion-Position": "end",
              ...(inline ? {} : { "Content-Insertion-Ignore-Newline": "false" }),
            },
            body: content,
          },
          config.requestTimeoutMs
        );
        return toBackendResult(raw);
      }

      case "search_notes": {
        const query = asString(payload.query, "query");
        const raw = await rawRequest(
          config,
          {
            method: "POST",
            pathAndQuery: `/search/simple/?query=${encodeURIComponent(query)}`,
          },
          config.requestTimeoutMs
        );
        // The REST API plugin returns: [{ filename, score, matches: [{ match: {start,end,source}, context }] }]
        // The bridge's searchNotesTool expects: [{ path, line?, text? }]
        // Map filename→path and pick the first match's context as text.
        const ok = raw.statusCode >= 200 && raw.statusCode < 300;
        let mappedBody = raw.body;
        let mapped: unknown = undefined;
        if (ok) {
          try {
            const arr = JSON.parse(raw.body);
            if (Array.isArray(arr)) {
              mapped = arr.map((r: { filename?: string; matches?: Array<{ context?: string }> }) => ({
                path: r.filename,
                text: r.matches?.[0]?.context,
              }));
              mappedBody = JSON.stringify(mapped);
            } else {
              mapped = arr;
            }
          } catch {
            // Leave raw body untouched if non-JSON; the tool will handle the error.
          }
        }
        return {
          statusCode: raw.statusCode,
          stdout: ok ? mappedBody : "",
          stderr: ok ? "" : raw.body,
          durationMs: raw.durationMs,
          parsed: mapped,
        };
      }

      case "execute_command": {
        const id = asString(payload.id, "id");
        const raw = await rawRequest(
          config,
          { method: "POST", pathAndQuery: `/commands/${encodeURIComponent(id)}/` },
          config.requestTimeoutMs
        );
        return toBackendResult(raw);
      }

      case "open_vault": {
        const optionalPath = asOptionalString(payload.path);
        if (optionalPath) {
          const encoded = encodeVaultPath(optionalPath);
          const newLeaf = payload.newLeaf === true ? "?newLeaf=true" : "";
          const raw = await rawRequest(
            config,
            { method: "POST", pathAndQuery: `/open/${encoded}${newLeaf}` },
            config.requestTimeoutMs
          );
          return toBackendResult(raw);
        }
        const raw = await rawRequest(
          config,
          { method: "GET", pathAndQuery: "/" },
          config.requestTimeoutMs
        );
        return toBackendResult(raw);
      }

      default: {
        const exhaustive: never = operation;
        throw new Error(`unsupported operation: ${String(exhaustive)}`);
      }
    }
  }
}
