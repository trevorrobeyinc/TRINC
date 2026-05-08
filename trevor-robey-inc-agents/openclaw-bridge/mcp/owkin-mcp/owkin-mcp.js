"use strict";

/**
 * Owkin MCP -- calls the Owkin pathology platform REST API over HTTPS.
 *
 * Provides TCGA cohort analysis, histomics feature queries, survival
 * analysis, and cell-type lookups for OpenClaw research agents.
 *
 * Excludes image-rendering tools (display_slide_thumbnail,
 * display_tiles_with_predictions, download_histomics) because
 * agents process text, not images.
 *
 * Follows the same execute({name, arguments}) interface as other MCP providers.
 *
 * @module owkin-mcp
 */

const { createHttpsClient } = require("../../core/https-client.js");
const { SCHEMA_BY_TOOL } = require("./owkin-schema.js");

function isPlainObject(v) {
  return Boolean(v && typeof v === "object" && !Array.isArray(v));
}

function encodeParam(value) {
  return encodeURIComponent(String(value));
}

function createOwkinMcp(options = {}) {
  const logger = isPlainObject(options.logger) ? options.logger : { info() {}, warn() {}, error() {} };

  const apiKey = process.env.OWKIN_API_KEY || "";
  const baseUrl = process.env.OWKIN_API_URL || "api.owkin.com";

  const client = createHttpsClient({
    hostname: baseUrl,
    headers: {
      Authorization: "Bearer " + apiKey,
      Accept: "application/json"
    },
    maxPerSecond: 5
  });

  async function execute(input) {
    const toolName = (input && typeof input.name === "string") ? input.name : "";
    const args = (input && isPlainObject(input.arguments)) ? input.arguments : {};

    if (!toolName) throw new Error("owkin-mcp: tool name is required");
    if (!apiKey) throw new Error("owkin-mcp: OWKIN_API_KEY environment variable is required");

    const schema = SCHEMA_BY_TOOL[toolName];
    if (!schema) throw new Error("owkin-mcp: unknown tool " + toolName);

    const validated = schema.parse(args);
    let result;

    switch (toolName) {
      case "owkin_list_cohorts": {
        const data = await client.getJson("/cohorts");
        const cohorts = Array.isArray(data) ? data : (Array.isArray(data.cohorts) ? data.cohorts : []);

        result = { ok: true, cohorts };
        break;
      }

      case "owkin_cohort_description": {
        const data = await client.getJson(
          `/cohorts/${encodeParam(validated.cohort)}/description?column_name=${encodeParam(validated.column_name)}`
        );

        result = {
          ok: true,
          cohort: validated.cohort,
          column_name: validated.column_name,
          stats: {
            mean: data.mean != null ? Number(data.mean) : null,
            std: data.std != null ? Number(data.std) : null,
            min: data.min != null ? Number(data.min) : null,
            max: data.max != null ? Number(data.max) : null,
            percentiles: isPlainObject(data.percentiles) ? {
              25: data.percentiles["25"] != null ? Number(data.percentiles["25"]) : null,
              50: data.percentiles["50"] != null ? Number(data.percentiles["50"]) : null,
              75: data.percentiles["75"] != null ? Number(data.percentiles["75"]) : null
            } : { 25: null, 50: null, 75: null }
          }
        };
        break;
      }

      case "owkin_filter_slides": {
        const params = [
          `sort_by=${encodeParam(validated.column)}`,
          `descending=${encodeParam(validated.descending)}`,
          `limit=${encodeParam(validated.limit)}`
        ];

        const data = await client.getJson(
          `/cohorts/${encodeParam(validated.cohort)}/slides?${params.join("&")}`
        );
        const slides = Array.isArray(data) ? data : (Array.isArray(data.slides) ? data.slides : []);

        result = {
          ok: true,
          cohort: validated.cohort,
          slides: slides.map(s => ({
            slide_id: s.slide_id || "",
            feature_value: s.feature_value != null ? Number(s.feature_value) : null
          }))
        };
        break;
      }

      case "owkin_survival_analysis": {
        const params = [
          `feature=${encodeParam(validated.feature)}`,
          `endpoint=${encodeParam(validated.endpoint)}`,
          `stratify=${encodeParam(validated.stratify)}`
        ];

        const data = await client.getJson(
          `/cohorts/${encodeParam(validated.cohort)}/survival?${params.join("&")}`
        );

        const groups = Array.isArray(data.groups) ? data.groups : [];

        result = {
          ok: true,
          cohort: validated.cohort,
          feature: validated.feature,
          endpoint: validated.endpoint,
          results: {
            p_value: data.p_value != null ? Number(data.p_value) : null,
            hazard_ratio: data.hazard_ratio != null ? Number(data.hazard_ratio) : null,
            groups: groups.map(g => ({
              name: g.name || "",
              n: g.n != null ? Number(g.n) : null,
              events: g.events != null ? Number(g.events) : null,
              median_survival: g.median_survival != null ? Number(g.median_survival) : null
            }))
          }
        };
        break;
      }

      case "owkin_list_cell_types": {
        const data = await client.getJson("/cell-types");
        const cellTypes = Array.isArray(data) ? data : (Array.isArray(data.cell_types) ? data.cell_types : []);

        result = { ok: true, cell_types: cellTypes };
        break;
      }

      case "owkin_filter_tiles": {
        const params = [
          `sort_by=${encodeParam(validated.column)}`,
          `descending=${encodeParam(validated.descending)}`,
          `limit=${encodeParam(validated.limit)}`
        ];

        const data = await client.getJson(
          `/cohorts/${encodeParam(validated.cohort)}/slides/${encodeParam(validated.slide_id)}/tiles?${params.join("&")}`
        );
        const tiles = Array.isArray(data) ? data : (Array.isArray(data.tiles) ? data.tiles : []);

        result = {
          ok: true,
          cohort: validated.cohort,
          slide_id: validated.slide_id,
          tiles: tiles.map(t => ({
            tile_id: t.tile_id || "",
            feature_value: t.feature_value != null ? Number(t.feature_value) : null
          }))
        };
        break;
      }

      case "owkin_get_histomics": {
        const body = { slide_ids: validated.slide_ids };
        if (validated.column_names) {
          body.column_names = validated.column_names;
        }

        const response = await client.getRaw("/histomics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        const data = JSON.parse(response.body);
        const slides = Array.isArray(data) ? data : (Array.isArray(data.slides) ? data.slides : []);

        result = {
          ok: true,
          slides: slides.map(s => ({
            slide_id: s.slide_id || "",
            features: isPlainObject(s.features) ? s.features : {}
          }))
        };
        break;
      }

      case "owkin_features_description": {
        const params = [];
        if (validated.cell_type) {
          params.push(`cell_type=${encodeParam(validated.cell_type)}`);
        }
        if (validated.column_name) {
          params.push(`column_name=${encodeParam(validated.column_name)}`);
        }
        if (validated.name_only) {
          params.push(`name_only=${encodeParam(validated.name_only)}`);
        }

        const qs = params.length > 0 ? "?" + params.join("&") : "";
        const data = await client.getJson(`/features${qs}`);

        if (validated.name_only) {
          const featureNames = Array.isArray(data) ? data : (Array.isArray(data.feature_names) ? data.feature_names : []);
          result = { ok: true, feature_names: featureNames };
        } else {
          const features = Array.isArray(data) ? data : (Array.isArray(data.features) ? data.features : []);
          result = {
            ok: true,
            features: features.map(f => ({
              name: f.name || "",
              description: f.description || ""
            }))
          };
        }
        break;
      }
    }

    logger.info({
      event: "owkin_mcp_execute",
      tool_name: toolName,
      ok: result && result.ok
    });

    return JSON.stringify(result, null, 2);
  }

  async function isAvailable() {
    if (!apiKey) return false;
    try {
      const data = await client.getJson("/cohorts");
      return Array.isArray(data) || (isPlainObject(data) && Array.isArray(data.cohorts));
    } catch (_) {
      return false;
    }
  }

  return Object.freeze({ execute, isAvailable });
}

module.exports = { createOwkinMcp };
