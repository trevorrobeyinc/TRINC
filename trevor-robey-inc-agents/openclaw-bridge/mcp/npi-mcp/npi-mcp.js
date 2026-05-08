"use strict";

/**
 * NPI Registry MCP — queries the CMS NPPES NPI Registry API over HTTPS.
 *
 * Provides provider search, NPI lookup, and local NPI validation (Luhn
 * check digit) for OpenClaw research agents.
 *
 * Uses the shared HTTPS client from ../../core/https-client.js for rate
 * limiting and connection management.
 *
 * Follows the same execute({name, arguments}) interface as other MCP providers.
 *
 * @module npi-mcp
 */

const { createHttpsClient } = require("../../core/https-client.js");
const { SCHEMA_BY_TOOL } = require("./npi-schema.js");

function isPlainObject(v) {
  return Boolean(v && typeof v === "object" && !Array.isArray(v));
}

/**
 * Validate an NPI using the Luhn algorithm with the "80840" healthcare prefix.
 *
 * 1. Prepend "80840" to the 10-digit NPI to form a 15-digit number.
 * 2. Starting from the rightmost digit, double every second digit.
 * 3. If doubling produces a value > 9, subtract 9.
 * 4. Sum all digits.
 * 5. Valid if sum % 10 === 0.
 *
 * @param {string} npi - 10-digit NPI string
 * @returns {boolean}
 */
function luhnCheckNpi(npi) {
  const prefixed = "80840" + npi;
  if (prefixed.length !== 15) return false;

  let sum = 0;
  for (let i = prefixed.length - 1; i >= 0; i--) {
    const pos = prefixed.length - 1 - i;
    let digit = Number(prefixed[i]);

    if (pos % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }

    sum += digit;
  }

  return sum % 10 === 0;
}

/**
 * Format a provider result from the NPPES search response into a compact object.
 */
function formatProvider(item) {
  const basic = item.basic || {};
  const taxonomies = Array.isArray(item.taxonomies) ? item.taxonomies : [];
  const addresses = Array.isArray(item.addresses) ? item.addresses : [];

  const primaryTaxonomy = taxonomies.find(t => t.primary === true) || taxonomies[0] || {};
  const primaryAddress = addresses[0] || {};

  const isOrg = item.enumeration_type === "NPI-2";
  const name = isOrg
    ? (basic.organization_name || "")
    : [basic.first_name, basic.middle_name, basic.last_name].filter(Boolean).join(" ");

  return {
    npi: String(item.number || ""),
    name,
    credential: basic.credential || "",
    specialty: primaryTaxonomy.desc || "",
    primary_address: [
      primaryAddress.address_1,
      primaryAddress.address_2,
      primaryAddress.city,
      primaryAddress.state,
      primaryAddress.postal_code
    ].filter(Boolean).join(", "),
    phone: primaryAddress.telephone_number || ""
  };
}

/**
 * Format full provider details from an NPPES lookup response.
 */
function formatProviderDetail(item) {
  const basic = item.basic || {};
  const taxonomies = Array.isArray(item.taxonomies) ? item.taxonomies : [];
  const addresses = Array.isArray(item.addresses) ? item.addresses : [];

  const primaryTaxonomy = taxonomies.find(t => t.primary === true) || taxonomies[0] || {};
  const primaryAddress = addresses[0] || {};

  const isOrg = item.enumeration_type === "NPI-2";
  const name = isOrg
    ? (basic.organization_name || "")
    : [basic.first_name, basic.middle_name, basic.last_name].filter(Boolean).join(" ");

  return {
    ok: true,
    found: true,
    npi: String(item.number || ""),
    provider_type: isOrg ? "Organization" : "Individual",
    name,
    credential: basic.credential || "",
    status: basic.status || "",
    enumeration_date: basic.enumeration_date || "",
    last_updated: basic.last_updated_epoch
      ? new Date(Number(basic.last_updated_epoch)).toISOString()
      : (basic.last_updated || ""),
    primary_taxonomy: {
      code: primaryTaxonomy.code || "",
      description: primaryTaxonomy.desc || "",
      license: primaryTaxonomy.license || "",
      state: primaryTaxonomy.state || "",
      primary: Boolean(primaryTaxonomy.primary)
    },
    primary_address: [
      primaryAddress.address_1,
      primaryAddress.address_2,
      primaryAddress.city,
      primaryAddress.state,
      primaryAddress.postal_code
    ].filter(Boolean).join(", "),
    phone: primaryAddress.telephone_number || "",
    raw: item
  };
}

/**
 * Create an NPI Registry MCP adapter.
 *
 * @param {object} [options]
 * @param {object} [options.logger] - Logger with info/warn/error methods
 * @returns {{ execute, isAvailable }}
 */
function createNpiMcp(options = {}) {
  const logger = isPlainObject(options.logger)
    ? options.logger
    : { info() {}, warn() {}, error() {} };

  const client = createHttpsClient({
    hostname: "npiregistry.cms.hhs.gov",
    basePath: "/api",
    maxPerSecond: 3
  });

  async function execute(input) {
    const toolName = (input && typeof input.name === "string") ? input.name : "";
    const args = (input && isPlainObject(input.arguments)) ? input.arguments : {};

    if (!toolName) throw new Error("npi-mcp: tool name is required");

    const schema = SCHEMA_BY_TOOL[toolName];
    if (!schema) throw new Error("npi-mcp: unknown tool " + toolName);

    const validated = schema.parse(args);
    let result;

    switch (toolName) {

      case "npi_search": {
        const params = new URLSearchParams();
        params.set("version", "2.1");

        if (validated.first_name != null) params.set("first_name", validated.first_name);
        if (validated.last_name != null) params.set("last_name", validated.last_name);
        if (validated.organization_name != null) params.set("organization_name", validated.organization_name);
        if (validated.taxonomy_description != null) params.set("taxonomy_description", validated.taxonomy_description);
        if (validated.city != null) params.set("city", validated.city);
        if (validated.state != null) params.set("state", validated.state);
        if (validated.postal_code != null) params.set("postal_code", validated.postal_code);
        if (validated.country_code != null) params.set("country_code", validated.country_code);
        if (validated.enumeration_type != null) params.set("enumeration_type", validated.enumeration_type);
        if (validated.use_first_name_alias != null) params.set("use_first_name_alias", String(validated.use_first_name_alias));

        params.set("limit", String(validated.limit));
        params.set("skip", String(validated.skip));

        const qs = "/?" + params.toString();
        const data = await client.getJson(qs);
        const results = Array.isArray(data.results) ? data.results : [];

        result = {
          ok: true,
          providers: results.map(formatProvider),
          result_count: Number(data.result_count) || 0,
          next_skip: validated.skip + results.length
        };
        break;
      }

      case "npi_lookup": {
        const qs = "/?version=2.1&number=" + encodeURIComponent(validated.npi);
        const data = await client.getJson(qs);
        const results = Array.isArray(data.results) ? data.results : [];

        if (results.length === 0) {
          result = {
            ok: true,
            found: false,
            npi: validated.npi
          };
        } else {
          result = formatProviderDetail(results[0]);
        }
        break;
      }

      case "npi_validate": {
        const npi = validated.npi.replace(/\s/g, "");
        const formatValid = /^\d{10}$/.test(npi);
        const checkDigitValid = formatValid ? luhnCheckNpi(npi) : false;
        const valid = formatValid && checkDigitValid;

        let reason = "";
        if (!formatValid) {
          reason = "NPI must be exactly 10 digits";
        } else if (!checkDigitValid) {
          reason = "Check digit failed Luhn validation";
        } else {
          reason = "Valid NPI";
        }

        result = {
          ok: true,
          valid,
          npi,
          format_valid: formatValid,
          check_digit_valid: checkDigitValid,
          reason
        };
        break;
      }
    }

    logger.info({
      event: "npi_mcp_execute",
      tool_name: toolName,
      ok: result && result.ok
    });

    return JSON.stringify(result, null, 2);
  }

  /**
   * Quick availability check: search for a common name and verify valid response.
   */
  async function isAvailable() {
    try {
      const qs = "/?version=2.1&last_name=Smith&state=CA&limit=1";
      const data = await client.getJson(qs);
      return Boolean(data && typeof data.result_count === "number");
    } catch (_) {
      return false;
    }
  }

  return Object.freeze({ execute, isAvailable });
}

module.exports = { createNpiMcp };
