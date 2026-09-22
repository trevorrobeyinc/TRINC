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
  // Tool-discovery record → description (preserved precedence); article
  // (PubMed/SemanticScholar/EuropePMC) → title; trial → brief_title; else the tool id.
  // Articles/trials have no `description`, so description-first does not affect them.
  if (record && typeof record.description === "string" && record.description.trim()) {
    return normalizeText(record.description, 2000);
  }
  if (record && typeof record.title === "string" && record.title.trim()) {
    return normalizeText(record.title, 2000);
  }
  if (record && typeof record.brief_title === "string" && record.brief_title.trim()) {
    return normalizeText(record.brief_title, 2000);
  }
  if (record && typeof record.official_title === "string" && record.official_title.trim()) {
    return normalizeText(record.official_title, 2000);
  }

  // --- Source-specific row fields (2026-09-19) ------------------------------------
  // Rows from the FDA / DailyMed / openFDA families carry no `title`; without these the
  // row fell through to the tool id and rendered as "unknown_tool" in the prompt. Field
  // names were read off live responses (see the row-shape dump in the 2026-09-19 session),
  // not guessed -- guessing is how the empty-abstract case survived this long.

  // openFDA enforcement (recall) rows: the product description is the human-readable subject.
  if (record && typeof record.product_description === "string" && record.product_description.trim()) {
    return normalizeText(record.product_description, 2000);
  }
  // Orange Book / Drugs@FDA rows: identify by application number + sponsor.
  if (record && typeof record.application_number === "string" && record.application_number.trim()) {
    const sponsor =
      typeof record.sponsor_name === "string" && record.sponsor_name.trim()
        ? ` — ${record.sponsor_name}`
        : "";
    return normalizeText(`${record.application_number}${sponsor}`, 2000);
  }
  // FDA drug-label rows: openFDA flattens nested keys, so the brand name arrives under the
  // LITERAL dotted key "openfda.brand_name" (an array), not a nested openfda object.
  if (record && Array.isArray(record["openfda.brand_name"]) && record["openfda.brand_name"].length) {
    return normalizeText(record["openfda.brand_name"].join(", "), 2000);
  }

  return normalizeText(extractToolId(record), 2000);
}

function extractAbstract(record, maxChars) {
  const limit = maxChars || MAX_ABSTRACT_CHARS;

  // Real payload fields first: PubMed `abstract`, ClinicalTrials `brief_summary`.
  if (record && typeof record.abstract === "string" && record.abstract.trim()) {
    return stripHtml(record.abstract).slice(0, limit);
  }
  if (record && typeof record.brief_summary === "string" && record.brief_summary.trim()) {
    return stripHtml(record.brief_summary).slice(0, limit);
  }

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

  // --- Source-specific row fields (2026-09-19) ------------------------------------
  // Same reason as extractTitle: these families put their payload under their own names,
  // so every row above returned "" -- a call that succeeded, was counted as "returned" in
  // search-coverage.md, and reached the prompt carrying nothing. An empty abstract is worse
  // than a failed fetch because nothing surfaces it.

  // DailyMed parsed-label sections: { type, content }.
  if (record && typeof record.content === "string" && record.content.trim()) {
    return stripHtml(record.content).slice(0, limit);
  }
  // openFDA enforcement (recall) rows: lead with the reason, then the classification/firm
  // context a safety reader needs to judge it.
  if (record && typeof record.reason_for_recall === "string" && record.reason_for_recall.trim()) {
    const parts = [
      record.reason_for_recall,
      record.classification && `Classification: ${record.classification}`,
      record.recalling_firm && `Recalling firm: ${record.recalling_firm}`,
      record.recall_initiation_date && `Initiated: ${record.recall_initiation_date}`,
      record.distribution_pattern
    ].filter((p) => typeof p === "string" && p.trim());
    return stripHtml(parts.join(" | ")).slice(0, limit);
  }
  // FDA drug-label rows: indications_and_usage is an array of label paragraphs.
  if (record && Array.isArray(record.indications_and_usage) && record.indications_and_usage.length) {
    return stripHtml(record.indications_and_usage.join(" ")).slice(0, limit);
  }
  // Orange Book / Drugs@FDA rows: the payload is the products array (brand names, strengths,
  // dosage forms, marketing status) -- serialized because it is structured, not prose.
  if (record && Array.isArray(record.products) && record.products.length) {
    return stripHtml(truncateResult(record.products, limit));
  }
  // DailyMed SPL search rows: no body text, only label metadata. Carry the version/date so
  // the record is not an empty shell next to its title.
  if (record && typeof record.setid === "string" && record.setid.trim()) {
    const parts = [
      record.published_date && `Published: ${record.published_date}`,
      record.spl_version !== undefined && `SPL version: ${record.spl_version}`,
      `setid: ${record.setid}`
    ].filter((p) => typeof p === "string" && p.trim());
    return stripHtml(parts.join(" | ")).slice(0, limit);
  }

  return "";
}

// Preserve the citation + bibliographic identifiers from the raw record so the
// injected "Live Data" doc (rendered by tool-prefetch.js renderRecord) carries
// real PMIDs / NCT IDs / DOIs / ChEMBL IDs the agent can cite, instead of dropping
// them during normalization. Field names vary by source (e.g. ClinicalTrials uses
// "NCT ID", PubMed uses pmid/pub_year).
function extractIdentifiers(raw) {
  const ids = {};
  if (!raw || typeof raw !== "object") return ids;
  const take = (val, max) => normalizeText(String(val), max);
  const pmid = raw.pmid || raw.PMID;
  if (pmid) ids.pmid = take(pmid, 64);
  const nct = raw["NCT ID"] || raw.nctId || raw.nct_id || raw.nct;
  if (nct) ids.nctId = take(nct, 64);
  const doi = raw.doi || raw.DOI;
  if (doi) ids.doi = take(doi, 256);
  const chembl = raw.molecule_chembl_id || raw.chembl_id || raw.chemblId;
  if (chembl) ids.chemblId = take(chembl, 64);
  if (raw.pmcid) ids.pmcid = take(raw.pmcid, 64);
  if (raw.url) ids.url = take(raw.url, 512);
  if (raw.journal) ids.journal = take(raw.journal, 256);
  const year = raw.pub_year || raw.year;
  if (year) ids.year = take(year, 16);
  if (raw.phase) ids.phase = take(Array.isArray(raw.phase) ? raw.phase.join("/") : raw.phase, 64);
  const status = raw.overall_status || (typeof raw.status === "string" ? raw.status : "");
  if (status) ids.status = take(status, 64);
  return ids;
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
    retrieved_at: options.retrievedAt || timeProviderModule.nowIso(),
    ...extractIdentifiers(rawRecord)
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
  extractIdentifiers,
  MAX_ABSTRACT_CHARS
};
