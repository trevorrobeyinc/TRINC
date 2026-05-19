"use strict";

const CITATION_PATTERNS = [
  { type: "PMID", regex: /PMID[:\s]*(\d{6,9})/gi },
  { type: "PubChem CID", regex: /(?:PubChem\s*)?CID[:\s]*(\d{3,12})/gi },
  { type: "NCT", regex: /(NCT\d{8})/gi },
  { type: "UniProt", regex: /UniProt[:\s]*([A-Z0-9]{6,10})/gi },
  { type: "ChEMBL", regex: /(CHEMBL\d{2,10})/gi },
  { type: "DrugBank", regex: /(DB\d{5,7})/gi },
  { type: "DOI", regex: /(?:doi[:\s]*|https?:\/\/doi\.org\/)(10\.\d{4,9}\/[^\s,)]+)/gi }
];

function extractCitations(text) {
  const citations = [];
  for (const { type, regex } of CITATION_PATTERNS) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      citations.push({ type, id: match[1] || match[0] });
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
  deduplicateCitations,
  extractCitations,
  roleLabel
};
