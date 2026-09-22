"use strict";

const CITATION_PATTERNS = [
  // PMIDs are sequential positive integers with NO fixed width: they start at 1 (PMID 1 is a real
  // 1975 paper) and the current max is ~41M (8 digits), growing. The old `\d{6,9}` both (a) MISSED
  // legitimate sub-6-digit historical PMIDs — invisible to the grounding gate AND the retraction
  // screen, so a retracted 1970s paper cited by a Failed Trial Archaeology report slipped through —
  // and (b) TRUNCATED a 10+ digit run to a 9-digit prefix, which can collide with a DIFFERENT real
  // PMID (worse than dropping it). `\d{1,10}` covers 1 through ~10-billion (centuries of headroom),
  // and `(?!\d)` refuses to match a prefix of a longer digit run — an 11+ digit "PMID" is DROPPED,
  // never mis-captured. Lower bound 1 accepts a rare stray "PMID: 5"; that is self-correcting (an
  // unfetched id is flagged ungrounded, never silently trusted), whereas a missed retraction is not.
  { type: "PMID", regex: /PMID[:\s]*(\d{1,10})(?!\d)/gi },
  { type: "PubChem CID", regex: /(?:PubChem\s*)?CID[:\s]*(\d{3,12})/gi },
  { type: "NCT", regex: /(NCT\d{8})/gi },
  { type: "UniProt", regex: /UniProt[:\s]*([A-Z0-9]{6,10})/gi },
  { type: "ChEMBL", regex: /(CHEMBL\d{2,10})/gi },
  { type: "DrugBank", regex: /(DB\d{5,7})/gi },
  // Stop the DOI suffix at whitespace and at punctuation that is clearly NOT part of a DOI but
  // commonly trails one in prose/markdown — `, ; ] [ } { < > " ' |` — so wiki-link/markdown
  // artifacts (e.g. `10.3389/fphar.2026.1787936]]`, `10.54097/5hr7dp28;`) aren't captured into
  // the identifier (which inflated/duplicated the "unverified" set and deflated the grounded ratio).
  // NB: `(` and `)` are NOT excluded — Elsevier/Lancet legacy SICI DOIs contain BALANCED parens
  // (e.g. 10.1016/S0140-6736(97)11096-0). Excluding `)` truncated them to a malformed id that no
  // registry could screen. Unbalanced trailing `)` from prose wrapping is trimmed post-capture.
  { type: "DOI", regex: /(?:doi[:\s]*|https?:\/\/doi\.org\/)(10\.\d{4,9}\/[^\s,;\]\[}{<>"'|]+)/gi }
];

// Clean a captured DOI suffix. DOIs contain internal dots and MAY contain balanced parens, so the
// regex can't exclude "." or "(" / ")". Post-capture we (1) strip trailing sentence punctuation
// (a DOI never ends in . , ; :) while keeping internal dots, and (2) trim UNBALANCED trailing
// ")" left by prose wrapping like "(doi: 10.1234/foo)" — while keeping balanced trailing ")"
// that are genuinely part of the DOI (e.g. ...(97)11096-0 stays intact).
//
// Single reverse pass — O(n), not the earlier re-scanning do/while which was O(n²) and could burn
// seconds on adversarial input (a captured id with a long run of stray ")"). We walk from the end,
// tracking the running paren balance, and cut at the last index that is neither trailing sentence
// punctuation nor an unbalanced ")".
function normalizeDoiId(raw) {
  const s = String(raw);
  // A trailing ")" is unbalanced iff, within the current window s[0,end), the count of ")" exceeds
  // the count of "(". Track those two counts for the whole string, then walk the tail once: cut
  // sentence punctuation freely, and cut a trailing ")" only while it is unbalanced (decrementing
  // the close count as we go). Stops at the first char that is neither — O(n), single pass.
  let openW = 0;
  let closeW = 0;
  for (const ch of s) {
    if (ch === "(") openW++;
    else if (ch === ")") closeW++;
  }
  let end = s.length;
  while (end > 0) {
    const ch = s[end - 1];
    if (ch === "." || ch === "," || ch === ";" || ch === ":") { end--; continue; }
    // Markdown emphasis closing a bold/italic/strikethrough span that WRAPS the citation, e.g.
    // "**Lynch et al., 2004 (doi: 10.1056/nejmoa040938)**" — the regex cannot exclude "*" because it
    // stops only at whitespace and list punctuation, so "…040938)**" was captured whole; the ")"
    // then sat BEHIND the "**" where the unbalanced-paren cut below never reached it, and the
    // re-resolver sent the literal ")**" to doi.org → 404 → UNRESOLVED → the whole run BLOCKED
    // (first gated smoke run through Copilot chat, 2026-09-22). No DOI ends in "*" or "~".
    if (ch === "*" || ch === "~") { end--; continue; }
    if (ch === ")" && closeW > openW) { end--; closeW--; continue; }
    break;
  }
  return s.slice(0, end);
}

function extractCitations(text) {
  const citations = [];
  for (const { type, regex } of CITATION_PATTERNS) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      let id = match[1] || match[0];
      if (type === "DOI") id = normalizeDoiId(id);
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
