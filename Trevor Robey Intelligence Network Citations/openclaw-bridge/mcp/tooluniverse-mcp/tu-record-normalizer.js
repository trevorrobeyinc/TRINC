"use strict";

const { normalizeText, stripHtml, normalizeAuthors } = require("../base-mcp.js");
const timeProviderModule = require("../../core/time-provider.js");

const MAX_ABSTRACT_CHARS = 20_000;

// Open Targets drug ids as the search API returns them ("CHEMBL1431", live 2026-10-24).
const CHEMBL_ID = /^CHEMBL\d+$/;

function chemblShapedId(record) {
  return record && typeof record.id === "string" && CHEMBL_ID.test(record.id) ? record.id : "";
}

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

  // Open Targets search hits (OpenTargets_get_drug_id_description_by_name, 2026-10-24) are
  // { id: "CHEMBL1431", name: "METFORMIN", description: "Small molecule drug with a maximum clinical
  // stage of Approval ..." }, read off a live v1.5.7 response. Description-first would title the
  // hit with that sentence; the drug is the subject. Keyed on the ChEMBL-shaped id, which no
  // tool-discovery record carries, so their precedence is unchanged.
  if (chemblShapedId(record) && typeof record.name === "string" && record.name.trim()) {
    return normalizeText(record.name, 2000);
  }
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
  // FAERS case reports (ToolUniverse v1.5.x `reports` rows, 2026-10-24): no title field at all.
  // The safety report id is the stable handle; seriousness is what a safety reader scans for.
  if (record && typeof record.safetyreportid === "string" && record.safetyreportid.trim()) {
    const serious = String(record.serious) === "1" ? " (serious)" : "";
    return normalizeText(`FAERS safety report ${record.safetyreportid}${serious}`, 2000);
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
  // FAERS case reports (2026-10-24): the payload is nested under `patient`. Reaction terms
  // (MedDRA preferred terms) lead, then the seriousness criteria flagged "1", the drugs with
  // their stated indications, and where/when the report was received. Field names read off a
  // live v1.5.7 response; codes the field names do not spell out (sex, outcome) are left out
  // rather than guessed.
  if (record && typeof record.safetyreportid === "string" && record.patient && typeof record.patient === "object") {
    const reactions = (Array.isArray(record.patient.reaction) ? record.patient.reaction : [])
      .map((r) => r && r.reactionmeddrapt)
      .filter((t) => typeof t === "string" && t.trim());
    const criteria = [
      ["death", "death"], ["hospitalization", "hospitalization"], ["lifethreatening", "life-threatening"],
      ["disabling", "disabling"], ["congenitalanomali", "congenital anomaly"], ["other", "other"]
    ].filter(([field]) => String(record[`seriousness${field}`]) === "1").map(([, label]) => label);
    const drugs = (Array.isArray(record.patient.drug) ? record.patient.drug : [])
      .filter((d) => d && typeof d.medicinalproduct === "string" && d.medicinalproduct.trim())
      .map((d) => (typeof d.drugindication === "string" && d.drugindication.trim()
        ? `${d.medicinalproduct} (for ${d.drugindication})`
        : d.medicinalproduct));
    const parts = [
      reactions.length && `Reactions: ${reactions.join(", ")}`,
      criteria.length && `Seriousness: ${criteria.join(", ")}`,
      drugs.length && `Drugs: ${drugs.join("; ")}`,
      record.occurcountry && `Country: ${record.occurcountry}`,
      record.receivedate && `Received: ${record.receivedate}`
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
  // Open Targets search hits carry the ChEMBL id under a plain `id` (see extractTitle).
  const chembl = raw.molecule_chembl_id || raw.chembl_id || raw.chemblId || chemblShapedId(raw);
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

// --- Error rows (2026-10-24) ---------------------------------------------------------------
// Some tools report an upstream failure AS A ROW: Europe PMC answers HTTP 503 with { status:
// "success", data: [{ title: "Error", error: "Europe PMC API error 503", retryable: true,
// abstract: null, doi: null, ... }] } (live, 2026-10-24). Normalized, that row reached the prompt as
// "### Error" and search-coverage.md counted it "returned". A row is error-only when it carries a
// non-empty `error` and normalizes to no payload: no abstract text and no citation identifier. A
// record that merely carries an `error` note beside real content (a PMID whose abstract fetch
// failed) is kept.
const CITATION_ID_FIELDS = ["pmid", "nctId", "doi", "chemblId", "pmcid"];

function isErrorOnlyRow(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return false;
  const error = record.error;
  const hasError = typeof error === "string"
    ? error.trim().length > 0
    : error === true || (error !== null && typeof error === "object");
  if (!hasError) return false;
  // Judged on the view normalizeToolRecord renders, so a placeholder is not payload here either.
  const row = fromLiteratureIndex(record);
  if (extractAbstract(row, MAX_ABSTRACT_CHARS).trim()) return false;
  const ids = extractIdentifiers(row);
  return !CITATION_ID_FIELDS.some((field) => ids[field]);
}

// --- Literature-index rows: OpenAlex and DOAJ (2026-10-24) ---------------------------------------
// openalex_literature_search and DOAJ_search_articles rows already use the generic names (title,
// abstract, year, doi, url -- read off live v1.5.7 responses for metformin / type 2 diabetes), with
// three differences the generic extractors would get wrong:
//   - the journal is `venue`;
//   - a value the source lacks is a placeholder STRING -- "Abstract not available" (5 of the 8 OpenAlex
//     rows), "Unknown venue", DOAJ's "DOI not available" / "URL not available" -- which the tool itself
//     flags false in the row's `data_quality`. Taken at face value a placeholder abstract counts as text
//     and a placeholder DOI as an identifier;
//   - OpenAlex gives the DOI as a resolver URL ("https://doi.org/10.1016/j.annonc.2020.12.008"); every
//     other row carries the bare DOI.
// A row is recognized by its own marker (OpenAlex `openalex_id`, DOAJ `source: "DOAJ"`), so the other
// tools that also emit `data_quality` (Europe PMC, Semantic Scholar) are unchanged.
const LITERATURE_INDEX_FLAGS = Object.freeze({
  openalex: Object.freeze({ abstract: "has_abstract", doi: "has_doi", year: "has_year", venue: "has_venue" }),
  doaj: Object.freeze({ abstract: "has_abstract", doi: "has_doi", year: "has_year", venue: "has_journal", url: "has_url" })
});

function literatureIndexSource(record) {
  if (!record || typeof record !== "object") return "";
  if (typeof record.openalex_id === "string" && record.openalex_id.startsWith("https://openalex.org/")) return "openalex";
  if (record.source === "DOAJ") return "doaj";
  return "";
}

function fromLiteratureIndex(record) {
  const source = literatureIndexSource(record);
  if (!source) return record;
  const quality = record.data_quality && typeof record.data_quality === "object" ? record.data_quality : {};
  const row = { ...record };
  for (const [field, flag] of Object.entries(LITERATURE_INDEX_FLAGS[source])) {
    if (quality[flag] === false) delete row[field];
  }
  if (typeof row.doi === "string") row.doi = row.doi.replace(/^https?:\/\/doi\.org\//i, "");
  if (!row.journal && typeof row.venue === "string" && row.venue.trim()) row.journal = row.venue;
  return row;
}

function normalizeToolRecord(rawRecord, options = {}) {
  const maxAbstractChars = options.maxAbstractChars || MAX_ABSTRACT_CHARS;
  const executionId = typeof options.executionId === "string" ? options.executionId : "";
  const record = fromLiteratureIndex(rawRecord);

  const toolId = extractToolId(record);
  const paperId = executionId ? `${toolId}/${executionId}` : toolId;

  return {
    source: "tooluniverse",
    paper_id: normalizeText(paperId, 256),
    title: extractTitle(record),
    abstract: extractAbstract(record, maxAbstractChars),
    authors: extractAuthors(record),
    citation_velocity: 0,
    published_at: extractPublishedAt(record),
    retrieved_at: options.retrievedAt || timeProviderModule.nowIso(),
    ...extractIdentifiers(record),
    ...extractAuthorNames(record)
  };
}

// The record's REAL author list, for the prompt (tool-prefetch.js renderRecord). Kept apart from
// `authors`, which falls back to the category, the source or "tooluniverse" when a row names no
// author and so cannot be shown to a model as a byline. Found 2026-11-04: run #7's report credited
// 6 of the 7 papers in its reference table to the wrong authors because no author name ever reached
// the prompt, so the model wrote them from memory. PubMed rows carry at most 5 names plus
// `author_count`; the count is kept so the renderer can say how many were left out.
// Placeholders sources put where a name should be (OpenAlex's "Unknown Author" for an authorship with
// no display_name, openalex_tool.py:200): never a byline.
const PLACEHOLDER_AUTHOR = /^(?:unknown author|anonymous|author information not available|n\/?a)$/i;
const MAX_AUTHOR_NAMES = 25;
function extractAuthorNames(record) {
  if (!record || !Array.isArray(record.authors)) return {};
  const all = normalizeAuthors(record.authors).filter((n) => !PLACEHOLDER_AUTHOR.test(n.trim()));
  if (all.length === 0) return {};
  const names = all.slice(0, MAX_AUTHOR_NAMES);
  const out = { author_names: names };
  const declared = Number(record.author_count);
  if (Number.isInteger(declared) && declared > names.length) {
    out.author_count = declared; // PubMed declares the true count beside its first five names
  } else if (all.length > names.length) {
    // Semantic Scholar, Europe PMC and OpenAlex send the list without a count: the total is the list
    // length — a floor, not a total, once the list may itself have been cut (OpenAlex stops at 100
    // authorships; normalizeAuthors keeps 200).
    out.author_count = all.length;
    if (all.length >= 100) out.author_count_is_minimum = true;
  }
  return out;
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
  isErrorOnlyRow,
  MAX_ABSTRACT_CHARS
};
