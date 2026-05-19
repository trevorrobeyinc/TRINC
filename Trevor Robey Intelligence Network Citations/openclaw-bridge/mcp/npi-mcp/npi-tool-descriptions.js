"use strict";

/**
 * Tool descriptions for the NPI Registry MCP, formatted for injection
 * into the agentic loop LLM prompt via buildToolInstructionBlock().
 *
 * @module npi-tool-descriptions
 */

const NPI_TOOL_DESCRIPTIONS = Object.freeze([
  {
    name: "npi_search",
    description: "Search CMS NPPES registry for healthcare providers by name, specialty, or location",
    parameters: '{ ["first_name": "John"] [, "last_name": "Smith"] [, "organization_name": "Mayo Clinic"] [, "taxonomy_description": "Cardiology"] [, "city": "Boston"] [, "state": "CA"] [, "postal_code": "90210"] [, "country_code": "US"] [, "enumeration_type": "NPI-1"] [, "limit": 10] [, "skip": 0] [, "use_first_name_alias": true] }'
  },
  {
    name: "npi_lookup",
    description: "Retrieve full provider details from the NPI Registry by 10-digit NPI number",
    parameters: '{ "npi": "1234567890" }'
  },
  {
    name: "npi_validate",
    description: "Validate an NPI number format and check digit using the Luhn algorithm (no API call)",
    parameters: '{ "npi": "1234567890" }'
  }
]);

module.exports = { NPI_TOOL_DESCRIPTIONS };
