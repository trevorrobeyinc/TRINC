"use strict";

/**
 * Google Drive MCP — searches and fetches documents from Google Drive
 * via the Drive API v3 over HTTPS.
 *
 * Provides file search and document content retrieval for OpenClaw
 * research agents.
 *
 * Auth: accepts either a direct access token (GOOGLE_DRIVE_ACCESS_TOKEN)
 * or a refresh token triplet (GOOGLE_DRIVE_REFRESH_TOKEN,
 * GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET) for automatic
 * token refresh.
 *
 * Uses the shared HTTPS client from ../../core/https-client.js for rate
 * limiting and connection management.
 *
 * Follows the same execute({name, arguments}) interface as other MCP providers.
 *
 * @module gdrive-mcp
 */

const { createHttpsClient } = require("../../core/https-client.js");
const { SCHEMA_BY_TOOL } = require("./gdrive-schema.js");

const MAX_RAW_CONTENT_CHARS = 50_000;

/** Module-level cached access token from refresh flow. */
let cachedAccessToken = null;

function isPlainObject(v) {
  return Boolean(v && typeof v === "object" && !Array.isArray(v));
}

/**
 * Determine whether any Google Drive auth env vars are configured.
 */
function hasAuthConfig() {
  return Boolean(
    process.env.GOOGLE_DRIVE_ACCESS_TOKEN ||
    (process.env.GOOGLE_DRIVE_REFRESH_TOKEN &&
     process.env.GOOGLE_DRIVE_CLIENT_ID &&
     process.env.GOOGLE_DRIVE_CLIENT_SECRET)
  );
}

/**
 * Obtain a fresh access token by exchanging the refresh token.
 *
 * @returns {Promise<string>} The new access token
 */
async function refreshAccessToken() {
  const tokenClient = createHttpsClient({ hostname: "oauth2.googleapis.com" });
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
    client_id: process.env.GOOGLE_DRIVE_CLIENT_ID,
    client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET
  }).toString();

  const data = await tokenClient.getRaw("/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  return JSON.parse(data.body).access_token;
}

/**
 * Resolve a valid access token, refreshing if necessary.
 *
 * @returns {Promise<string>}
 */
async function getAccessToken() {
  if (process.env.GOOGLE_DRIVE_ACCESS_TOKEN) {
    return process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
  }

  if (cachedAccessToken) {
    return cachedAccessToken;
  }

  cachedAccessToken = await refreshAccessToken();
  return cachedAccessToken;
}

/**
 * Invalidate the cached token so the next call triggers a refresh.
 */
function invalidateCachedToken() {
  cachedAccessToken = null;
}

/**
 * Format a Drive file object into a compact result.
 */
function formatFile(item) {
  return {
    id: item.id || "",
    name: item.name || "",
    mime_type: item.mimeType || "",
    modified_time: item.modifiedTime || "",
    size: item.size || null,
    web_view_link: item.webViewLink || ""
  };
}

/**
 * Create a Google Drive MCP adapter.
 *
 * @param {object} [options]
 * @param {object} [options.logger] - Logger with info/warn/error methods
 * @returns {{ execute, isAvailable }}
 */
function createGdriveMcp(options = {}) {
  const logger = isPlainObject(options.logger)
    ? options.logger
    : { info() {}, warn() {}, error() {} };

  const client = createHttpsClient({
    hostname: "www.googleapis.com",
    basePath: "/drive/v3",
    maxPerSecond: 5
  });

  /**
   * Make an authenticated request, retrying once on 401 with a refreshed token.
   *
   * @param {Function} requestFn - Function that takes an auth header object and returns a promise
   * @returns {Promise<*>}
   */
  async function authenticatedRequest(requestFn) {
    const token = await getAccessToken();
    try {
      return await requestFn({ Authorization: "Bearer " + token });
    } catch (err) {
      const is401 = err && err.details && err.details.statusCode === 401;
      if (!is401 || process.env.GOOGLE_DRIVE_ACCESS_TOKEN) {
        throw err;
      }

      // Token expired — refresh and retry once
      invalidateCachedToken();
      const freshToken = await getAccessToken();
      return requestFn({ Authorization: "Bearer " + freshToken });
    }
  }

  async function execute(input) {
    const toolName = (input && typeof input.name === "string") ? input.name : "";
    const args = (input && isPlainObject(input.arguments)) ? input.arguments : {};

    if (!toolName) throw new Error("gdrive-mcp: tool name is required");

    const schema = SCHEMA_BY_TOOL[toolName];
    if (!schema) throw new Error("gdrive-mcp: unknown tool " + toolName);

    const validated = schema.parse(args);
    let result;

    switch (toolName) {

      case "gdrive_search": {
        const params = new URLSearchParams();
        params.set("q", validated.query);
        params.set("pageSize", String(validated.page_size));
        params.set("orderBy", validated.order_by);
        params.set("fields", "files(id,name,mimeType,modifiedTime,size,webViewLink),nextPageToken");

        if (validated.page_token != null) {
          params.set("pageToken", validated.page_token);
        }

        const qs = "/files?" + params.toString();

        const data = await authenticatedRequest((authHeaders) =>
          client.getJson(qs, { headers: authHeaders })
        );

        const files = Array.isArray(data.files) ? data.files : [];

        result = {
          ok: true,
          files: files.map(formatFile),
          next_page_token: data.nextPageToken || null
        };
        break;
      }

      case "gdrive_fetch": {
        const documents = [];

        for (const docId of validated.document_ids) {
          try {
            // Try exporting as plain text (works for Google Docs/Sheets/Slides)
            const content = await authenticatedRequest((authHeaders) =>
              client.getText(
                "/files/" + encodeURIComponent(docId) + "/export?mimeType=text%2Fplain",
                { headers: authHeaders }
              )
            );

            documents.push({
              id: docId,
              content: content
            });
          } catch (exportErr) {
            // Not a Google Doc — try raw content download
            try {
              const raw = await authenticatedRequest((authHeaders) =>
                client.getText(
                  "/files/" + encodeURIComponent(docId) + "?alt=media",
                  { headers: authHeaders }
                )
              );

              documents.push({
                id: docId,
                content: raw.length > MAX_RAW_CONTENT_CHARS
                  ? raw.slice(0, MAX_RAW_CONTENT_CHARS)
                  : raw
              });
            } catch (downloadErr) {
              documents.push({
                id: docId,
                content: null,
                error: downloadErr.message || "Failed to fetch document"
              });
            }
          }
        }

        result = {
          ok: true,
          documents
        };
        break;
      }
    }

    logger.info({
      event: "gdrive_mcp_execute",
      tool_name: toolName,
      ok: result && result.ok
    });

    return JSON.stringify(result, null, 2);
  }

  /**
   * Quick availability check: verify auth is configured and token is valid
   * by hitting the Drive about endpoint.
   */
  async function isAvailable() {
    if (!hasAuthConfig()) {
      return false;
    }

    try {
      await authenticatedRequest((authHeaders) =>
        client.getJson("/about?fields=user", { headers: authHeaders })
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  return Object.freeze({ execute, isAvailable });
}

module.exports = { createGdriveMcp };
