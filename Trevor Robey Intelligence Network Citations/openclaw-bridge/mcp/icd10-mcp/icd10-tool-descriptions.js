"use strict";

/**
 * Tool descriptions for the ICD-10 MCP, formatted for injection
 * into the agentic loop LLM prompt via buildToolInstructionBlock().
 *
 * @module icd10-tool-descriptions
 */

const ICD10_TOOL_DESCRIPTIONS = Object.freeze([
  {
    name: "icd10_search_codes",
    description: "Search ICD-10-CM diagnosis or ICD-10-PCS procedure codes by keyword or code prefix",
    parameters: '{ "query": "diabetes mellitus" [, "code_type": "diagnosis"] [, "search_by": "description"] [, "exact": false] [, "limit": 20] [, "valid_for_hipaa_only": true] }'
  },
  {
    name: "icd10_lookup_code",
    description: "Look up a specific ICD-10 code to get its full description and metadata",
    parameters: '{ "code": "E11.9", "code_type": "diagnosis" }'
  },
  {
    name: "icd10_validate_code",
    description: "Validate whether an ICD-10 code exists and is billable under current HIPAA standards",
    parameters: '{ "code": "E11.9", "code_type": "diagnosis" }'
  },
  {
    name: "icd10_get_by_category",
    description: "List ICD-10-CM codes within a chapter letter or 3-character category prefix",
    parameters: '{ [, "chapter": "E"] [, "category": "E11"] [, "valid_for_hipaa_only": true] }'
  },
  {
    name: "icd10_get_by_body_system",
    description: "List ICD-10-PCS procedure codes for a body system, optionally filtered by section",
    parameters: '{ "body_system_code": "0", [, "section_code": "B"] [, "limit": 100] [, "valid_for_hipaa_only": true] }'
  },
  {
    name: "icd10_get_hierarchy",
    description: "Get all ICD-10 codes under a given prefix to explore the code hierarchy",
    parameters: '{ "code_prefix": "E11" }'
  }
]);

module.exports = { ICD10_TOOL_DESCRIPTIONS };
