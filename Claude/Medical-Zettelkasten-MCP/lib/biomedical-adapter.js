"use strict";

/**
 * Biomedical text adapter — normalizes ToolUniverse JSON, PubMed abstracts,
 * and OpenClaw reports into text suitable for graph analysis.
 *
 * @module biomedical-adapter
 */

const fs = require("node:fs");
const path = require("node:path");
const { BIOMEDICAL_STOPWORDS } = require("./biomedical-stopwords.js");
const { STOPWORDS } = require("./text-to-graph.js");

let entityConfig = null;

function loadEntityConfig() {
  if (entityConfig) return entityConfig;
  try {
    const configPath = path.join(__dirname, "..", "config", "biomedical-entities.json");
    entityConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    entityConfig = { entityPatterns: [], preservePatterns: [], weightMultipliers: {} };
  }
  return entityConfig;
}

/**
 * Build a combined stopword set (general + biomedical).
 * @param {string} mode - "general", "biomedical", or "none"
 * @returns {Set<string>}
 */
function buildStopwords(mode) {
  if (mode === "none") return new Set();
  if (mode === "general") return new Set(STOPWORDS);
  // Default: biomedical = general + biomedical-specific
  const combined = new Set(STOPWORDS);
  for (const word of BIOMEDICAL_STOPWORDS) combined.add(word);
  return combined;
}

/**
 * Extract text from ToolUniverse JSON query results.
 * @param {string|object} data - JSON string or parsed object
 * @returns {string}
 */
function extractFromToolUniverseJson(data) {
  const parsed = typeof data === "string" ? JSON.parse(data) : data;
  const parts = [];

  function extractFields(obj) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      for (const item of obj) extractFields(item);
      return;
    }
    const textFields = [
      "description", "mechanism_of_action", "indication", "pharmacodynamics",
      "absorption", "toxicity", "adverse_effects", "drug_interactions",
      "name", "generic_name", "brand_name", "abstract", "title",
      "pathway_name", "gene_name", "protein_name", "disease_name",
      "compound_name", "summary", "text", "content",
    ];
    for (const field of textFields) {
      if (typeof obj[field] === "string" && obj[field].trim()) {
        parts.push(obj[field].trim());
      }
    }
    // Recurse into nested objects
    for (const val of Object.values(obj)) {
      if (val && typeof val === "object") extractFields(val);
    }
  }

  extractFields(parsed);
  return parts.join("\n\n");
}

/**
 * Extract text from PubMed abstract collections.
 * @param {string|Array} data - JSON string or array of abstracts
 * @returns {string}
 */
function extractFromPubmedAbstracts(data) {
  const parsed = typeof data === "string" ? JSON.parse(data) : data;
  if (!Array.isArray(parsed)) {
    return typeof parsed === "string" ? parsed : JSON.stringify(parsed);
  }
  const parts = [];
  for (const item of parsed) {
    if (typeof item === "string") {
      parts.push(item);
    } else if (item && typeof item === "object") {
      if (item.abstract) parts.push(item.abstract);
      if (item.title) parts.push(item.title);
      if (item.pmid) parts.push(`PMID:${item.pmid}`);
    }
  }
  return parts.join("\n\n");
}

/**
 * Extract text from OpenClaw agent reports (markdown).
 * Strips markdown formatting, preserves citation blocks.
 * @param {string} report
 * @returns {string}
 */
function extractFromOpenClawReport(report) {
  if (!report || typeof report !== "string") return "";
  let text = report;
  // Remove markdown headers but keep content
  text = text.replace(/^#{1,6}\s+/gm, "");
  // Remove markdown bold/italic markers
  text = text.replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1");
  // Remove markdown links but keep text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // Remove code blocks
  text = text.replace(/```[\s\S]*?```/g, "");
  text = text.replace(/`([^`]+)`/g, "$1");
  // Preserve citation references like [PMID:12345]
  text = text.replace(/\[(PMID:\d+)\]/g, "$1");
  text = text.replace(/\[(NCT\d+)\]/g, "$1");
  text = text.replace(/\[(CID:\d+)\]/g, "$1");
  return text.trim();
}

/**
 * Normalize input to text based on input_type.
 *
 * @param {string} input - Raw input (text or JSON string)
 * @param {string} inputType - "text", "tooluniverse_json", "pubmed_abstracts", "openclaw_report"
 * @returns {string}
 */
function normalizeInput(input, inputType) {
  if (!input || typeof input !== "string") {
    throw new Error("Input must be a non-empty string");
  }

  switch (inputType) {
    case "tooluniverse_json":
      return extractFromToolUniverseJson(input);
    case "pubmed_abstracts":
      return extractFromPubmedAbstracts(input);
    case "openclaw_report":
      return extractFromOpenClawReport(input);
    case "text":
    default:
      return input;
  }
}

/**
 * Get preserved multi-word entities from config.
 * @returns {string[]}
 */
function getPreserveEntities() {
  const config = loadEntityConfig();
  return config.preservePatterns || [];
}

module.exports = {
  normalizeInput,
  buildStopwords,
  getPreserveEntities,
  extractFromToolUniverseJson,
  extractFromPubmedAbstracts,
  extractFromOpenClawReport,
  loadEntityConfig,
};
