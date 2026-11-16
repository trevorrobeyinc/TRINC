"use strict";

// release-content.js — what the marketplace adapters and the training-data generator may read out of a
// sealed release (Tier 1 review, 2026-11-14). Since T1-2, scripts/distribute.js hands them the
// release's own report.md and tables.csv. report.md wraps the research sections in packager
// scaffolding (deliverable-packager.js renderResearchReport): a title block, a Table of Contents,
// section anchors and "*Task: …*" lines, the engine's appended "⚠️ Citation Verification" lists and a
// closing Citation Summary. Findings, training samples and Q&A come from the research text only, and
// training records never come from a sentence that cites an identifier the citation gate could not
// trace (tables.csv grounded_in_run "no", or an [UNVERIFIED] mark in the sentence itself).

const { extractCitations, groundingKey } = require("../core/citation-extractor.js");

const SKIPPED_HEADINGS = Object.freeze([
  /^Table of Contents$/i,
  /^(?:\d+\.\s+)?Citation Summary$/i,
  /^⚠️ Citation Verification$/
]);

// The research sections of a packaged report.md, without the packager's scaffolding. Markdown with no
// "## " section at all is returned as it is (it is not a packaged report).
function researchText(reportMarkdown) {
  const text = String(reportMarkdown || "");
  const parts = text.split(/^(?=## )/m);
  if (!parts.some((p) => p.startsWith("## "))) return text.trim();
  const kept = [];
  for (const part of parts) {
    if (!part.startsWith("## ")) continue; // the title block before the first section
    const heading = part.slice(3, part.indexOf("\n") < 0 ? part.length : part.indexOf("\n")).trim();
    if (SKIPPED_HEADINGS.some((re) => re.test(heading))) continue;
    kept.push(part
      .replace(/^<a id="[^"]*"><\/a>[ \t]*$/gm, "")
      .replace(/^\*Task: [^\n]*\*[ \t]*$/gm, "")
      .replace(/^---[ \t]*$/gm, ""));
  }
  return kept.join("").replace(/\n{3,}/g, "\n\n").trim();
}

// RFC 4180 rows, as deliverable-packager.js renderCsv writes them: a field with a comma, a quote or a
// newline is quoted, and a quote inside it is doubled.
function parseCsv(text) {
  const src = String(text || "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === "\"") {
        if (src[i + 1] === "\"") { field += "\""; i++; } else quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === "\"") {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// TYPE:ID keys (citation-extractor groundingKey) of the identifiers tables.csv marks grounded_in_run
// "no": the ones the citation gate could not trace to evidence retrieved for the report.
function untracedKeysFromIndex(tablesCsv) {
  const rows = parseCsv(tablesCsv);
  const out = new Set();
  if (rows.length === 0) return out;
  const header = rows[0].map((h) => h.trim());
  const typeAt = header.indexOf("citation_type");
  const idAt = header.indexOf("identifier");
  const groundedAt = header.indexOf("grounded_in_run");
  if (typeAt < 0 || idAt < 0 || groundedAt < 0) return out;
  for (const row of rows.slice(1)) {
    if (String(row[groundedAt] || "").trim() === "no") out.add(groundingKey({ type: row[typeAt], id: row[idAt] }));
  }
  return out;
}

// True when the text carries an [UNVERIFIED] mark or cites an identifier tables.csv marks untraced.
function citesUntraced(text, untracedKeys) {
  const s = String(text || "");
  if (s.includes("[UNVERIFIED]")) return true;
  const keys = untracedKeys instanceof Set ? untracedKeys : new Set();
  return keys.size > 0 && extractCitations(s).some((c) => keys.has(groundingKey(c)));
}

module.exports = { researchText, parseCsv, untracedKeysFromIndex, citesUntraced };
