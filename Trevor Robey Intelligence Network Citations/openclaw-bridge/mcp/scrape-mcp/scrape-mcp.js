"use strict";

/**
 * scrape-mcp — thin Node-side adapter to the manual-invocation Python sidecar
 * at scrape-sidecar/. Exposes one tool: scrape_target.
 *
 * Used as a building block — the existing mcp-service.js wires biomedical MCPs
 * via createXxxMcp factories. This module follows the same factory shape so
 * it can be registered the same way when the operator decides to expose
 * scraping to the agent runtime; until then it is callable directly from
 * scripts via runScrape().
 *
 * The sidecar listens on HTTPS (mkcert). NODE_EXTRA_CA_CERTS must be set on
 * the Node process for TLS verification.
 */

const { z } = require("zod");

const { scrapeSidecarRequest } = require("../../core/https-client.js");

const ScrapeTargetInputSchema = z
  .object({
    target: z.string().min(1).max(64),
    params: z.record(z.unknown()).default({}),
    prefer_engine: z
      .enum(["playwright-firefox", "playwright-chromium"])
      .nullable()
      .optional(),
    bypass_cache: z.boolean().default(false)
  })
  .strict();

const ScrapeTargetOutputSchema = z
  .object({
    record: z
      .object({
        source_url: z.string().min(1),
        retrieved_at: z.string().min(1),
        data_source: z.string().min(1),
        citation_hash: z.string().regex(/^[a-f0-9]{64}$/),
        license: z.string().min(1),
        engine: z.string().min(1),
        engines_tried: z.array(z.string()),
        payload: z.record(z.unknown())
      })
      .passthrough(),
    cache_hit: z.boolean(),
    engines_tried: z.array(z.string())
  })
  .strict();

function createScrapeMcp(options = {}) {
  const host = options.host || process.env.SCRAPE_SIDECAR_HOST || "127.0.0.1";
  const port = Number(options.port || process.env.SCRAPE_SIDECAR_PORT || 8842);
  const timeoutMs = Number(options.timeoutMs || 120_000);

  async function scrape_target(rawInput) {
    const input = ScrapeTargetInputSchema.parse(rawInput);
    const response = await scrapeSidecarRequest({
      target: input.target,
      params: input.params,
      preferEngine: input.prefer_engine ?? null,
      bypassCache: input.bypass_cache,
      host,
      port,
      timeoutMs
    });
    return ScrapeTargetOutputSchema.parse(response);
  }

  function getToolDescriptors() {
    return Object.freeze([
      Object.freeze({
        name: "scrape_target",
        description:
          "Fetch a JS-rendered open-access biomedical page through the manual scrape-sidecar. " +
          "Returns a provenance-tagged record matching the openclaw-bridge schema. " +
          "Sidecar must be started by hand (scrape-sidecar/scripts/start-sidecar.sh).",
        input_schema: {
          type: "object",
          required: ["target"],
          properties: {
            target: { type: "string", description: "Connector ID, e.g. 'elife'" },
            params: { type: "object", description: "Connector-specific params" },
            prefer_engine: {
              type: ["string", "null"],
              enum: ["playwright-firefox", "playwright-chromium", null]
            },
            bypass_cache: { type: "boolean", default: false }
          }
        }
      })
    ]);
  }

  return Object.freeze({ scrape_target, getToolDescriptors });
}

async function runScrape(target, params = {}, options = {}) {
  const mcp = createScrapeMcp(options);
  return mcp.scrape_target({ target, params, prefer_engine: options.preferEngine, bypass_cache: Boolean(options.bypassCache) });
}

module.exports = {
  createScrapeMcp,
  runScrape,
  ScrapeTargetInputSchema,
  ScrapeTargetOutputSchema
};
