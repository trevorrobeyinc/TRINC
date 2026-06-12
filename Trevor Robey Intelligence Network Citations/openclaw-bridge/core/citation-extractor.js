"use strict";

const CITATION_PATTERNS = [
  { type: "PMID", regex: /PMID[:\s]*(\d{6,9})/gi },
  { type: "PubChem CID", regex: /(?:PubChem\s*)?CID[:\s]*(\d{3,12})/gi },
  { type: "NCT", regex: /(NCT\d{8})/gi },
  { type: "UniProt", regex: /UniProt[:\s]*([A-Z0-9]{6,10})/gi },
  { type: "ChEMBL", regex: /(CHEMBL\d{2,10})/gi },
  { type: "DrugBank", regex: /(DB\d{5,7})/gi },
  // Stop the DOI suffix at whitespace and at punctuation that is clearly NOT part of a DOI but
  // commonly trails one in prose/markdown — `, ) ; ] [ } { < > " ' |` — so wiki-link/markdown
  // artifacts (e.g. `10.3389/fphar.2026.1787936]]`, `10.54097/5hr7dp28;`) aren't captured into
  // the identifier (which inflated/duplicated the "unverified" set and deflated the grounded ratio).
  { type: "DOI", regex: /(?:doi[:\s]*|https?:\/\/doi\.org\/)(10\.\d{4,9}\/[^\s,);\]\[}{<>"'|]+)/gi }
];

function extractCitations(text) {
  const citations = [];
  for (const { type, regex } of CITATION_PATTERNS) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      let id = match[1] || match[0];
      // DOIs contain internal dots, so the pattern can't exclude "." — strip any TRAILING
      // sentence punctuation after capture (a DOI never ends in . , ; :), keeping internal dots.
      if (type === "DOI") id = id.replace(/[.,;:]+$/, "");
      citations.push({ type, id });
    }
  }
  return citations;
}

function deduplicateCitations(citations) {
  return [...new Map(citations.map((c) => [`${c.type}:${c.id}`, c])).values()];
}

function countByType(citations) {
  const byType = {};
  for (const c of citations) {
    if (!byType[c.type]) byType[c.type] = 0;
    byType[c.type]++;
  }
  return byType;
}

// Cross-check a report's citations against the set of identifiers actually retrieved at runtime
// (e.g. the PMIDs/NCTs/etc. in the tool-prefetch records). First building block of the citation
// validator: it flags cited identifiers the run never actually fetched (i.e. likely introduced
// from the model's parametric knowledge). It does NOT prove a citation resolves in the live
// database — only whether it was present in the data this run grounded on.
function crossCheckCitations(reportText, knownIds) {
  const known = new Set(
    (Array.isArray(knownIds) ? knownIds : []).map((s) => String(s).toUpperCase())
  );
  const cited = deduplicateCitations(extractCitations(String(reportText || "")));
  const verified = [];
  const unverified = [];
  for (const c of cited) {
    if (known.has(String(c.id).toUpperCase())) verified.push(c);
    else unverified.push(c);
  }
  return {
    total: cited.length,
    verified_count: verified.length,
    unverified_count: unverified.length,
    verified_ratio: cited.length > 0 ? Math.round((verified.length / cited.length) * 1000) / 1000 : 0,
    unverified
  };
}

function roleLabel(taskId) {
  const id = String(taskId || "").toLowerCase();
  if (id.includes("scout") || id.includes("literature") || id.includes("reviewer")) return "Literature Review";
  if (id.includes("analyst") || id.includes("safety") || id.includes("molecular") || id.includes("competitive")) return "Deep Analysis";
  if (id.includes("synth") || id.includes("report") || id.includes("generator") || id.includes("auditor")) return "Integrated Synthesis";
  return "Research Output";
}

module.exports = {
  CITATION_PATTERNS,
  countByType,
  crossCheckCitations,
  deduplicateCitations,
  extractCitations,
  roleLabel
};
