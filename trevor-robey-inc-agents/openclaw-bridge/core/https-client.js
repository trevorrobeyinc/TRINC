"use strict";

/**
 * Shared HTTPS client for OpenClaw MCP adapters.
 *
 * Provides configurable JSON/text GET requests with per-host rate limiting,
 * timeout enforcement, response size limits, and structured error reporting.
 *
 * Extracted from biorxiv-mcp.js to avoid duplicating the HTTP stack across
 * 10+ MCP adapter modules.
 *
 * @module https-client
 */

const https = require("node:https");
const http = require("node:http");
const timeProvider = require("./time-provider.js");

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

// Per-host token-bucket rate limiter
const hostBuckets = new Map();

function isPlainObject(v) {
  return Boolean(v && typeof v === "object" && !Array.isArray(v));
}

function getRateLimiter(hostname, maxPerSecond) {
  if (!maxPerSecond || maxPerSecond <= 0) return null;

  let bucket = hostBuckets.get(hostname);
  if (!bucket) {
    bucket = { tokens: maxPerSecond, maxTokens: maxPerSecond, lastRefill: timeProvider.nowMs() };
    hostBuckets.set(hostname, bucket);
  }
  return bucket;
}

function acquireToken(bucket) {
  if (!bucket) return Promise.resolve();

  const now = timeProvider.nowMs();
  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + elapsed * bucket.maxTokens);
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return Promise.resolve();
  }

  const waitMs = Math.ceil((1 - bucket.tokens) / bucket.maxTokens * 1000);
  return new Promise((resolve) => setTimeout(resolve, waitMs));
}

function createHttpsClientError(code, message, details) {
  const error = new Error(String(message || "HTTPS client error"));
  error.code = String(code || "HTTPS_CLIENT_ERROR");
  if (typeof details !== "undefined") {
    error.details = details;
  }
  return error;
}

/**
 * Create an HTTPS client bound to a specific host.
 *
 * @param {object} options
 * @param {string} options.hostname - Target hostname (e.g., "eutils.ncbi.nlm.nih.gov")
 * @param {string} [options.basePath=""] - Path prefix prepended to all requests
 * @param {number} [options.port] - Port number (defaults to 443 for HTTPS, 80 for HTTP)
 * @param {boolean} [options.useHttp=false] - Use HTTP instead of HTTPS
 * @param {number} [options.timeoutMs=30000] - Request timeout
 * @param {number} [options.maxResponseBytes=2MB] - Max response body size
 * @param {object} [options.headers={}] - Default headers merged into every request
 * @param {number} [options.maxPerSecond=0] - Rate limit (0 = unlimited)
 * @param {object} [options.logger] - Logger with info/warn/error methods
 * @returns {{ getJson, getText, getRaw }}
 */
function createHttpsClient(options = {}) {
  const hostname = String(options.hostname || "").trim();
  if (!hostname) throw createHttpsClientError("HTTPS_CONFIG_INVALID", "hostname is required");

  const basePath = String(options.basePath || "");
  const useHttp = Boolean(options.useHttp);
  const port = options.port || (useHttp ? 80 : 443);
  const timeoutMs = Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS;
  const maxResponseBytes = Number(options.maxResponseBytes) || DEFAULT_MAX_RESPONSE_BYTES;
  const defaultHeaders = isPlainObject(options.headers) ? { ...options.headers } : {};
  const maxPerSecond = Number(options.maxPerSecond) || 0;
  const logger = isPlainObject(options.logger) ? options.logger : { info() {}, warn() {}, error() {} };

  const rateLimiter = getRateLimiter(hostname, maxPerSecond);
  const httpModule = useHttp ? http : https;

  /**
   * Perform a raw HTTP(S) GET request.
   *
   * @param {string} requestPath - Path (appended to basePath)
   * @param {object} [reqOptions] - Per-request overrides
   * @param {string} [reqOptions.hostname] - Override hostname for this request
   * @param {object} [reqOptions.headers] - Additional headers for this request
   * @param {string} [reqOptions.method="GET"] - HTTP method
   * @param {string} [reqOptions.body] - Request body (for POST)
   * @returns {Promise<{statusCode: number, headers: object, body: string}>}
   */
  async function getRaw(requestPath, reqOptions = {}) {
    await acquireToken(rateLimiter);

    const reqHostname = reqOptions.hostname || hostname;
    const fullPath = basePath + requestPath;
    const method = reqOptions.method || "GET";
    const mergedHeaders = {
      Accept: "application/json, text/plain",
      ...defaultHeaders,
      ...(isPlainObject(reqOptions.headers) ? reqOptions.headers : {})
    };

    const reqModule = reqOptions.hostname
      ? (reqOptions.useHttp ? http : https)
      : httpModule;

    return new Promise((resolve, reject) => {
      const req = reqModule.request(
        {
          hostname: reqHostname,
          port: reqOptions.port || port,
          method,
          path: fullPath,
          headers: mergedHeaders,
          rejectUnauthorized: true,
          agent: false
        },
        (res) => {
          const chunks = [];
          let bytes = 0;

          res.on("data", (chunk) => {
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            bytes += buf.length;
            if (bytes > maxResponseBytes) {
              req.destroy(createHttpsClientError(
                "HTTPS_RESPONSE_TOO_LARGE",
                `Response exceeded ${maxResponseBytes} bytes`,
                { hostname: reqHostname, path: fullPath }
              ));
              return;
            }
            chunks.push(buf);
          });

          res.on("end", () => {
            const statusCode = Number(res.statusCode || 0);
            const body = Buffer.concat(chunks).toString("utf8");

            if (statusCode < 200 || statusCode >= 300) {
              reject(createHttpsClientError(
                "HTTPS_REQUEST_FAILED",
                `${method} ${reqHostname}${fullPath} returned ${statusCode}`,
                { statusCode, bodyPreview: body.slice(0, 300), hostname: reqHostname }
              ));
              return;
            }

            resolve({ statusCode, headers: res.headers, body });
          });
        }
      );

      req.setTimeout(timeoutMs, () => {
        req.destroy(createHttpsClientError(
          "HTTPS_TIMEOUT",
          `${method} ${reqHostname}${fullPath} timed out after ${timeoutMs}ms`
        ));
      });

      req.on("error", (error) => reject(error));

      if (method === "POST" && reqOptions.body) {
        req.write(reqOptions.body);
      }
      req.end();
    });
  }

  /**
   * GET and parse response as JSON.
   */
  async function getJson(requestPath, reqOptions = {}) {
    const response = await getRaw(requestPath, reqOptions);
    try {
      return JSON.parse(response.body);
    } catch {
      throw createHttpsClientError(
        "HTTPS_INVALID_JSON",
        "Expected JSON response",
        { hostname, path: basePath + requestPath, bodyPreview: response.body.slice(0, 200) }
      );
    }
  }

  /**
   * GET and return response body as text.
   */
  async function getText(requestPath, reqOptions = {}) {
    const response = await getRaw(requestPath, reqOptions);
    return response.body;
  }

  return Object.freeze({ getJson, getText, getRaw });
}

/**
 * Convenience: HTTPS POST to the local scrape-sidecar service.
 *
 * The sidecar listens on TLS via mkcert (see TrevClaw-Obsidianodus monorepo
 * HTTPS-only invariant). Callers must have NODE_EXTRA_CA_CERTS pointing at
 * the mkcert root CA so this client trusts the sidecar's cert.
 *
 * Throws structured errors via createHttpsClientError so failures surface
 * with the same shape as the rest of the MCP HTTP layer.
 *
 * @param {object} options
 * @param {string} options.target            - Connector ID, e.g. "elife"
 * @param {object} [options.params={}]       - Connector-specific params
 * @param {string} [options.preferEngine]    - "playwright-firefox" | "playwright-chromium"
 * @param {boolean} [options.bypassCache=false]
 * @param {string} [options.host="127.0.0.1"]
 * @param {number} [options.port=8842]
 * @param {number} [options.timeoutMs=120000]
 * @returns {Promise<object>}                - Parsed sidecar response { record, cache_hit, engines_tried }
 */
async function scrapeSidecarRequest({
  target,
  params = {},
  preferEngine = null,
  bypassCache = false,
  host = "127.0.0.1",
  port = 8842,
  timeoutMs = 120_000
} = {}) {
  if (!target || typeof target !== "string") {
    throw createHttpsClientError("SCRAPE_SIDECAR_BAD_TARGET", "scrapeSidecarRequest requires a target string");
  }
  const client = createHttpsClient({
    hostname: host,
    port,
    timeoutMs,
    headers: { "Content-Type": "application/json" }
  });
  const body = JSON.stringify({
    target,
    params,
    prefer_engine: preferEngine,
    bypass_cache: Boolean(bypassCache)
  });
  const response = await client.getRaw("/scrape", { method: "POST", body });
  try {
    return JSON.parse(response.body);
  } catch {
    throw createHttpsClientError(
      "SCRAPE_SIDECAR_INVALID_JSON",
      "scrape-sidecar returned non-JSON response",
      { bodyPreview: response.body.slice(0, 200) }
    );
  }
}

module.exports = { createHttpsClient, createHttpsClientError, scrapeSidecarRequest };
