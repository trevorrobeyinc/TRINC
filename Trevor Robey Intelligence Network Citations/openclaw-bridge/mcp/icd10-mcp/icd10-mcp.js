"use strict";

/**
 * ICD-10 MCP — looks up ICD-10-CM (diagnosis) and ICD-10-PCS (procedure)
 * codes using the NIH Clinical Tables API (clinicaltables.nlm.nih.gov).
 *
 * Provides code search, lookup, validation, category browsing, body-system
 * filtering, and hierarchy exploration for OpenClaw research agents.
 *
 * @module icd10-mcp
 */

const { createHttpsClient } = require("../../core/https-client.js");
const { SCHEMA_BY_TOOL } = require("./icd10-schema.js");

const API_HOST = "clinicaltables.nlm.nih.gov";

function isPlainObject(v) {
  return Boolean(v && typeof v === "object" && !Array.isArray(v));
}

/**
 * Parse the Clinical Tables API response format.
 * Response is a JSON array: [totalCount, codeArray, extraFieldsMap, [[code, description], ...]]
 * Element [3] contains the code-description pairs.
 *
 * @param {Array} data - Raw API response array
 * @returns {{ total: number, codes: Array<{code: string, description: string}> }}
 */
function parseSearchResponse(data) {
  if (!Array.isArray(data) || data.length < 4) {
    return { total: 0, codes: [] };
  }

  const total = Number(data[0]) || 0;
  const pairs = Array.isArray(data[3]) ? data[3] : [];

  const codes = pairs
    .filter(pair => Array.isArray(pair) && pair.length >= 2)
    .map(pair => ({
      code: String(pair[0] || "").trim(),
      description: String(pair[1] || "").trim()
    }));

  return { total, codes };
}

/**
 * Determine whether a code looks like a valid billable (leaf-level) code.
 * ICD-10-CM billable codes have at least 3 characters and typically 3-7 chars.
 * Header codes are shorter or end in a pattern indicating a category.
 *
 * @param {string} code
 * @returns {boolean}
 */
function looksLikeBillableCode(code) {
  const cleaned = code.replace(/\./g, "");
  return cleaned.length >= 3;
}

function createIcd10Mcp(options = {}) {
  const logger = isPlainObject(options.logger)
    ? options.logger
    : { info() {}, warn() {}, error() {} };

  const cmClient = createHttpsClient({
    hostname: API_HOST,
    basePath: "/api/icd10cm/v3",
    maxPerSecond: 5
  });

  const pcsClient = createHttpsClient({
    hostname: API_HOST,
    basePath: "/api/icd10pcs/v3",
    maxPerSecond: 5
  });

  function clientFor(codeType) {
    return codeType === "procedure" ? pcsClient : cmClient;
  }

  async function execute(input) {
    const toolName = (input && typeof input.name === "string") ? input.name : "";
    const args = (input && isPlainObject(input.arguments)) ? input.arguments : {};

    if (!toolName) throw new Error("icd10-mcp: tool name is required");

    const schema = SCHEMA_BY_TOOL[toolName];
    if (!schema) throw new Error("icd10-mcp: unknown tool " + toolName);

    const validated = schema.parse(args);
    let result;

    switch (toolName) {
      case "icd10_search_codes": {
        const client = clientFor(validated.code_type);
        const query = encodeURIComponent(validated.query);
        const limit = validated.limit;

        let path;
        if (validated.search_by === "code") {
          path = `/search?sf=code,name&terms=${query}&maxList=${limit}`;
        } else {
          path = `/search?sf=code,name&terms=${query}&maxList=${limit}`;
        }

        const data = await client.getJson(path);
        const parsed = parseSearchResponse(data);

        let codes = parsed.codes;
        if (validated.exact) {
          const q = validated.query.toLowerCase();
          codes = codes.filter(c =>
            c.code.toLowerCase() === q || c.description.toLowerCase() === q
          );
        }

        result = {
          ok: true,
          codes,
          total: parsed.total
        };
        break;
      }

      case "icd10_lookup_code": {
        const client = clientFor(validated.code_type);
        const code = encodeURIComponent(validated.code);
        const path = `/search?sf=code,name&terms=${code}&maxList=50`;

        const data = await client.getJson(path);
        const parsed = parseSearchResponse(data);

        const normalizedInput = validated.code.replace(/\./g, "").toUpperCase();
        const match = parsed.codes.find(c =>
          c.code.replace(/\./g, "").toUpperCase() === normalizedInput
        );

        if (match) {
          result = {
            ok: true,
            code: match.code,
            description: match.description,
            code_type: validated.code_type,
            valid_for_hipaa: looksLikeBillableCode(match.code)
          };
        } else {
          result = {
            ok: false,
            error: "Code not found",
            code: validated.code,
            code_type: validated.code_type
          };
        }
        break;
      }

      case "icd10_validate_code": {
        const client = clientFor(validated.code_type);
        const code = encodeURIComponent(validated.code);
        const path = `/search?sf=code,name&terms=${code}&maxList=50`;

        const data = await client.getJson(path);
        const parsed = parseSearchResponse(data);

        const normalizedInput = validated.code.replace(/\./g, "").toUpperCase();
        const match = parsed.codes.find(c =>
          c.code.replace(/\./g, "").toUpperCase() === normalizedInput
        );

        if (match) {
          const billable = looksLikeBillableCode(match.code);
          result = {
            ok: true,
            valid: true,
            code: match.code,
            description: match.description,
            valid_for_hipaa: billable,
            reason: billable
              ? "Code exists and is valid for billing"
              : "Code exists but may be a header/category code — use a more specific child code for billing"
          };
        } else {
          result = {
            ok: true,
            valid: false,
            code: validated.code,
            description: null,
            valid_for_hipaa: false,
            reason: "Code not found in ICD-10-" + (validated.code_type === "procedure" ? "PCS" : "CM")
          };
        }
        break;
      }

      case "icd10_get_by_category": {
        const prefix = validated.category || validated.chapter || "";
        if (!prefix) {
          throw new Error("icd10-mcp: at least one of chapter or category is required");
        }

        const query = encodeURIComponent(prefix);
        const path = `/search?sf=code,name&terms=${query}&maxList=200`;

        const data = await cmClient.getJson(path);
        const parsed = parseSearchResponse(data);

        const upperPrefix = prefix.toUpperCase();
        const codes = parsed.codes.filter(c =>
          c.code.replace(/\./g, "").toUpperCase().startsWith(upperPrefix)
        );

        result = {
          ok: true,
          category: prefix,
          codes
        };
        break;
      }

      case "icd10_get_by_body_system": {
        const prefix = validated.section_code
          ? validated.section_code + validated.body_system_code
          : validated.body_system_code;
        const query = encodeURIComponent(prefix);
        const limit = validated.limit;
        const path = `/search?sf=code,name&terms=${query}&maxList=${limit}`;

        const data = await pcsClient.getJson(path);
        const parsed = parseSearchResponse(data);

        const upperPrefix = prefix.toUpperCase();
        const codes = parsed.codes.filter(c =>
          c.code.replace(/\./g, "").toUpperCase().startsWith(upperPrefix)
        );

        result = {
          ok: true,
          body_system_code: validated.body_system_code,
          codes
        };
        break;
      }

      case "icd10_get_hierarchy": {
        const prefix = encodeURIComponent(validated.code_prefix);
        const path = `/search?sf=code,name&terms=${prefix}&maxList=200`;

        const data = await cmClient.getJson(path);
        const parsed = parseSearchResponse(data);

        const upperPrefix = validated.code_prefix.replace(/\./g, "").toUpperCase();
        const codes = parsed.codes
          .filter(c => c.code.replace(/\./g, "").toUpperCase().startsWith(upperPrefix))
          .map(c => ({
            code: c.code,
            description: c.description,
            is_header: !looksLikeBillableCode(c.code)
          }));

        result = {
          ok: true,
          prefix: validated.code_prefix,
          codes
        };
        break;
      }
    }

    logger.info({
      event: "icd10_mcp_execute",
      tool_name: toolName,
      ok: result && result.ok
    });

    return JSON.stringify(result, null, 2);
  }

  async function isAvailable() {
    try {
      const data = await cmClient.getJson(
        "/search?sf=code,name&terms=diabetes&maxList=1"
      );
      return Array.isArray(data) && data.length >= 4;
    } catch (_) {
      return false;
    }
  }

  return Object.freeze({ execute, isAvailable });
}

module.exports = { createIcd10Mcp };
