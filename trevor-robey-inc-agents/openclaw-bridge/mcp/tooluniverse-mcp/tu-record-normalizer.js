"use strict";

const { normalizeText, stripHtml, normalizeAuthors } = require("../base-mcp.js");
const timeProviderModule = require("../../core/time-provider.js");

const MAX_ABSTRACT_CHARS = 20_000;

function truncateResult(value, maxChars) {
  if (typeof value === "string") {
    return value.length > maxChars ? value.slice(0, maxChars) : value;
  }
  const serialized = JSON.stringify(value, null, 0);
  return serialized.length > maxChars ? serialized.slice(0, maxChars) : serialized;
}

function extractToolId(record) {
  if (record && typeof record.tool_name === "string" && record.tool_name.trim()) {
    return normalizeText(record.tool_name, 256);
  }
  if (record && typeof record.name === "string" && record.name.trim()) {
    return normalizeText(record.name, 256);
  }
  if (record && typeof record.id === "string" && record.id.trim()) {
    return normalizeText(record.id, 256);
  }
  return "unknown_tool";
}

function extractTitle(record) {
  if (record && typeof record.description === "string" && record.description.trim()) {
    return normalizeText(record.description, 2000);
  }
  if (record && typeof record.title === "string" && record.title.trim()) {
    return normalizeText(record.title, 2000);
  }
  return normalizeText(extractToolId(record), 2000);
}

function extractAbstract(record, maxChars) {
  const limit = maxChars || MAX_ABSTRACT_CHARS;

  if (record && record.result !== undefined && record.result !== null) {
    const resultStr = truncateResult(record.result, limit);
    return stripHtml(resultStr);
  }

  if (record && typeof record.detailed_description === "string") {
    return stripHtml(record.detailed_description).slice(0, limit);
  }

  if (record && typeof record.description === "string") {
    return stripHtml(record.description).slice(0, limit);
  }

  return "";
}

function extractAuthors(record) {
  if (record && Array.isArray(record.authors)) {
    return normalizeAuthors(record.authors);
  }
  if (record && typeof record.category === "string" && record.category.trim()) {
    return [normalizeText(record.category, 256)];
  }
  if (record && typeof record.source === "string" && record.source.trim()) {
    return [normalizeText(record.source, 256)];
  }
  return ["tooluniverse"];
}

function extractPublishedAt(record) {
  if (record && typeof record.published_at === "string" && record.published_at.trim()) {
    const parsed = Date.parse(record.published_at);
    if (Number.isFinite(parsed)) {
      return record.published_at;
    }
  }
  if (record && typeof record.created_at === "string" && record.created_at.trim()) {
    const parsed = Date.parse(record.created_at);
    if (Number.isFinite(parsed)) {
      return record.created_at;
    }
  }
  return "1970-01-01T00:00:00.000Z";
}

function normalizeToolRecord(rawRecord, options = {}) {
  const maxAbstractChars = options.maxAbstractChars || MAX_ABSTRACT_CHARS;
  const executionId = typeof options.executionId === "string" ? options.executionId : "";

  const toolId = extractToolId(rawRecord);
  const paperId = executionId ? `${toolId}/${executionId}` : toolId;

  return {
    source: "tooluniverse",
    paper_id: normalizeText(paperId, 256),
    title: extractTitle(rawRecord),
    abstract: extractAbstract(rawRecord, maxAbstractChars),
    authors: extractAuthors(rawRecord),
    citation_velocity: 0,
    published_at: extractPublishedAt(rawRecord),
    retrieved_at: options.retrievedAt || timeProviderModule.nowIso()
  };
}

function normalizeToolList(toolList, options = {}) {
  if (!Array.isArray(toolList)) {
    return [];
  }
  return toolList.map((item) => normalizeToolRecord(item, options));
}

module.exports = {
  normalizeToolRecord,
  normalizeToolList,
  extractToolId,
  extractTitle,
  extractAbstract,
  extractAuthors,
  extractPublishedAt,
  MAX_ABSTRACT_CHARS
};
