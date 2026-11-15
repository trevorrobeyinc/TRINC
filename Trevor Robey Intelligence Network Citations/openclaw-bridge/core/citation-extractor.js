"use strict";

// Marks the engine itself writes after an identifier: citation-gate's " [UNVERIFIED]" and
// citation-attribution's " [ATTRIBUTION MISMATCH: registry lists …]". A PMID list or a PMID table cell
// that already carries one is still read in full, so re-reading an annotated section finds the same
// identifiers the gate counted (T1-4, 2026-11-14).
const MARK_SOURCE = String.raw`\[(?:UNVERIFIED|ATTRIBUTION MISMATCH:[^\]\n]*)\]`;
const MARKS_AFTER = String.raw`(?:[ \t]*${MARK_SOURCE})*`;

// PMID list items (T1-4). The first item keeps the original width rule (below). A LATER list item must
// also not be a percentage, a decimal or a number followed by a word ("PMID: 12345678, 95% CI",
// "…, 2.5 mg", "…, 10 patients"), so ordinary prose after a citation is not read as a PMID. A year right
// after a list ("PMID: 12345678, 2019.") is still read; it is flagged [UNVERIFIED] like any unretrieved
// id, which is the self-correcting side of the width doctrine.
const PMID_FIRST = String.raw`\d{1,10}(?!\d)`;
const PMID_NEXT = String.raw`\d{1,10}(?!\d)(?![ \t]*%)(?!\.\d)(?![ \t]+[A-Za-z])`;
const PMID_LIST = `${PMID_FIRST}${MARKS_AFTER}(?:[ \\t]*[,;][ \\t]*${PMID_NEXT}${MARKS_AFTER})*`;

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
  // T1-4: "PMIDs" is a label too, and every item of a comma- or semicolon-separated list after the
  // label is read ("PMIDs: 12345678, 23456789"); before, only the first item of "PMID: a, b" was.
  // The wiki-link target half "[[PMID-42529345|…" is not a label (no ":"/space before the digits).
  { type: "PMID", form: "label", regex: new RegExp(String.raw`PMIDs?[:\s]*(` + PMID_LIST + ")", "gi") },
  // T1-4: a "PubMed ID" or "PubMed:" label. A bare "PubMed 2019" (a search year in prose) is NOT a label.
  { type: "PMID", form: "pubmed_label", regex: /\bPubMed(?:\s*IDs?\s*[:#]?|\s*[:#])\s*(\d{1,10})(?!\d)/gi },
  // T1-4: PubMed record links, pubmed.ncbi.nlm.nih.gov/<id> and (www.)ncbi.nlm.nih.gov/pubmed/<id>.
  { type: "PMID", form: "pubmed_url", regex: /\b(?:pubmed\.ncbi\.nlm\.nih\.gov\/|ncbi\.nlm\.nih\.gov\/pubmed\/)(\d{1,10})(?!\d)/gi },
  // T1-4: an uppercase "CID" on a word boundary, no `i` flag. The old pattern had neither, so "amino
  // acid 614" and "acid 2019" read as PubChem CIDs, and it had no `(?!\d)` guard, so a longer number was
  // cut to a prefix. A longer digit run is now DROPPED, never mis-captured (the PMID rule).
  { type: "PubChem CID", regex: /\b(?:PubChem\s*)?CID\b[:\s]*(\d{1,12})(?!\d)/g },
  // T1-4: an optional space or hyphen after "NCT" ("NCT 01234567", "NCT-01234567"), normalized to
  // NCT + 8 digits. `(?!\d)` refuses the first 8 digits of a longer run: NCT012345678 is a different
  // (possibly real) trial NCT01234567, so it is dropped rather than mis-captured.
  { type: "NCT", regex: /\bNCT[ -]?(\d{8})(?!\d)/gi },
  // UniProt: the id must be a real ACCESSION (UniProt's published grammar: 6 chars `[OPQ]\d[A-Z0-9]{3}\d`, or
  // `[A-NR-Z]\d` + one or two `[A-Z][A-Z0-9]{2}\d` groups = 6 or 10 chars). The old pattern,
  // `UniProt[:\s]*([A-Z0-9]{6,10})` with the `i` flag, captured ANY 6-10 letter word after the label, so a
  // report's own honest-negative sentence ("ENSG/UniProt accessions ... [no verifiable ENSG/UniProt citation
  // found in live data]") yielded the "ids" `accessions` and `citation`; UniProt answered 400, the re-resolver
  // stamped them UNRESOLVED, and the first real run started through the Claude Code dispatch lane
  // (workflow-12c3ef8ba2021cf5d6a81516, 2026-10-08) was BLOCKED at delivery with nothing fabricated. Checked on
  // 1,368 stored reports/notes: 4 of the old pattern's 7 distinct "ids" were English words (accessions, citation,
  // protein, validation); every real accession was kept. The label stays case-insensitive but is spelled out so
  // an `i` flag cannot widen the id; `KB` is accepted ("UniProtKB:O15111"). The id is uppercase and `\b`-bounded:
  // a prefix of a longer token is DROPPED, never mis-captured (same rule as PMID above). A malformed
  // "UniProt <token>" is not an identifier, so it is not extracted; a well-formed accession still goes through
  // grounding and re-resolution.
  { type: "UniProt", regex: /[Uu][Nn][Ii][Pp][Rr][Oo][Tt](?:KB)?[:\s]*\b([OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9](?:[A-Z][A-Z0-9]{2}[0-9]){1,2})\b/g },
  { type: "ChEMBL", regex: /(CHEMBL\d{2,10})/gi },
  { type: "DrugBank", regex: /(DB\d{5,7})/gi },
  // DOIs in every written form (T1-4): "doi: 10.x/…", https://doi.org/, dx.doi.org/, www.doi.org/,
  // scheme-less doi.org/, publisher URLs (…/doi/10.x/…) and a BARE "10.x/…" token. The left boundary
  // rejects a preceding letter, digit or dot ("v10.1234/…", "1.10.1234/…"), except an attached "doi"
  // label ("doi10.1234/…"). A wiki-link target half "[[DOI-10.3389_fonc…" has no "/" after the prefix,
  // so it is never read; its alias half "|doi: 10.3389/fonc…]]" is.
  // Stop the DOI suffix at whitespace and at punctuation that is clearly NOT part of a DOI but
  // commonly trails one in prose/markdown — `, ; ] [ } { < > " ' |` — so wiki-link/markdown
  // artifacts (e.g. `10.3389/fphar.2026.1787936]]`, `10.54097/5hr7dp28;`) aren't captured into
  // the identifier (which inflated/duplicated the "unverified" set and deflated the grounded ratio).
  // NB: `(` and `)` are NOT excluded — Elsevier/Lancet legacy SICI DOIs contain BALANCED parens
  // (e.g. 10.1016/S0140-6736(97)11096-0). Excluding `)` truncated them to a malformed id that no
  // registry could screen. Unbalanced trailing `)` from prose wrapping is trimmed post-capture, and a
  // `?query` or `#fragment` is cut from a DOI captured inside a URL (extractCitationSpans).
  { type: "DOI", regex: /(?:(?<=[Dd][Oo][Ii])|(?<![A-Za-z0-9.]))(10\.\d{4,9}\/[^\s,;\]\[}{<>"'|]+)/g },
  // ── Business research lane (2026-10-21, core/research-profiles.js) ─────────────────────────────
  // Each needs a literal UPPERCASE prefix, so no biomedical text is newly captured: the sec-edgar
  // context fetcher renders "Accession 0001…" (never "SEC: <cik>/<accession>"), and nothing else in
  // the engine writes "WEB:" or "WB:". Every type here has a resolver in citation-reresolver.js —
  // an identifier the resolver cannot check would be UNCHECKED and forfeit the full DELIVER claim.
  // SEC: "<CIK>/<accession>" — the CIK is carried because the filing index lives under it.
  { type: "SEC", regex: /\bSEC[:\s]+(\d{1,10}\/\d{10}-\d{2}-\d{6})(?!\d)/g },
  // WEB: the first 12 hex of the sha256 of a page snapshot this run fetched and stored
  // (mcp/business-sources/web-evidence.js). Lowercase hex only; a longer hex run is DROPPED.
  { type: "WEB", regex: /\bWEB[:\s]+([0-9a-f]{12})(?![0-9a-f])/g },
  // WB: a World Bank indicator code (FP.CPI.TOTL.ZG). Codes are uppercase dotted segments.
  { type: "WB", regex: /\bWB[:\s]+([A-Z]{2,4}(?:\.[A-Z0-9]{1,8}){1,5})\b/g },
  // ── Evidence Desk (2026-10-21) — official statistics (mcp/business-sources/). These four need the
  // uppercase label AND a colon: "BLS" (basic life support) and "EIA" (enzyme immunoassay) occur in
  // biomedical prose, and "census" in any prose; none of them is followed by ":" and an id of these
  // shapes there. Each has a resolver in citation-reresolver.js.
  // BLS: a series id — uppercase alphanumerics with at least one digit (CES4349300003, CUUR0000SA0).
  { type: "BLS", regex: /\bBLS:\s*((?=[A-Z0-9]*\d)[A-Z0-9]{8,30})(?![A-Za-z0-9])/g },
  // EUROSTAT: a dataset code (nrg_pc_205, lc_lci_lev). Lower-cased after capture, as Eurostat writes them.
  { type: "EUROSTAT", regex: /\bEUROSTAT:\s*([A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+){1,5})(?![A-Za-z0-9_])/g },
  // CENSUS: "<dataset>/<year>/<NAICS>" (cbp/2023/493, cbp/2023/31-33).
  { type: "CENSUS", regex: /\bCENSUS:\s*([a-z]{2,12}\/\d{4}\/\d{2}(?:-\d{2}|\d{1,4})?)(?![\d/-])/g },
  // EIA: a legacy series id (ELEC.PRICE.US-IND.M, NG.N3035US3.M); sentence punctuation is not captured.
  { type: "EIA", regex: /\bEIA:\s*([A-Z]{2,6}\.[A-Z0-9_.-]{1,40}[A-Z0-9])(?![A-Za-z0-9_-])/g }
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

// A DOI with an empty suffix after normalization ("10.1234/.") is not an identifier.
const DOI_SHAPE = /^10\.\d{4,9}\/./;

// True when the DOI starting at `start` sits inside a URL token (https://…, www.…, doi.org/…), where a
// trailing `?query` or `#fragment` belongs to the URL, not to the DOI.
function inUrlContext(text, start) {
  let i = start;
  while (i > 0 && !/\s/.test(text[i - 1])) i--;
  return /(?:https?:\/\/|www\.|doi\.org\/)/i.test(text.slice(i, start));
}

// PMIDs start at 1, so an all-zero number is never one. Found by the T1-4 replay (2026-11-14): the
// manifest's own count line "retracted PMIDs: 0" read as PMID 0 once "PMIDs" became a label.
const NOT_A_PMID = /^0+$/;

// Each item of a PMID list (or of a PMID table cell), skipping any mark between items. `offset` is the
// list's position in the full text, so every item gets its own span.
function listItems(listText, offset) {
  const out = [];
  const re = new RegExp(`${MARK_SOURCE}|(\\d{1,10})`, "gi");
  let m;
  while ((m = re.exec(listText)) !== null) {
    if (m[1] === undefined) continue; // a mark, not an item
    if (NOT_A_PMID.test(m[1])) continue;
    out.push({ id: m[1], start: offset + m.index, end: offset + m.index + m[1].length });
  }
  return out;
}

// Split one markdown table row into cells with their offsets in the line. A "|" inside a wiki-link
// ("[[target|alias]]") or escaped ("\|") does not split. Returns null when the line has no cell pipe.
function splitTableRow(line) {
  const src = String(line);
  const cells = [];
  let i = 0;
  while (i < src.length && (src[i] === " " || src[i] === "\t")) i++;
  let pipes = 0;
  if (src[i] === "|") { i++; pipes++; }
  let cellStart = i;
  let depth = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "\\") { i++; continue; }
    if (ch === "[" && src[i + 1] === "[") { depth++; i++; continue; }
    if (ch === "]" && src[i + 1] === "]" && depth > 0) { depth--; i++; continue; }
    if (ch === "|" && depth === 0) {
      cells.push({ text: src.slice(cellStart, i), start: cellStart });
      cellStart = i + 1;
      pipes++;
    }
  }
  if (pipes === 0) return null;
  const tail = src.slice(cellStart);
  if (tail.replace(/\r$/, "").trim() !== "") cells.push({ text: tail, start: cellStart });
  return cells;
}

// A header cell is "exactly PMID or PMIDs" once whitespace and wrapping markdown emphasis are removed.
const PMID_HEADER = /^PMIDs?$/;
function headerText(cell) {
  return cell.trim().replace(/^(\*\*|__|\*|_)(.*)\1$/, "$2").trim();
}
const SEPARATOR_CELL = /^\s*:?-+:?\s*$/;
const PMID_CELL = new RegExp(String.raw`^[ \t]*(${PMID_FIRST}${MARKS_AFTER}(?:[ \t]*[,;][ \t]*${PMID_FIRST}${MARKS_AFTER})*)[ \t]*\r?$`, "d");

// T1-4: bare numbers in a markdown table column whose header cell is exactly "PMID" or "PMIDs" — the
// references-table form (offer-3dec35098e8e47e2d0a72012 report.md:396-407), which nothing read before.
// This is the ONLY place a bare number is read as a PMID: never in prose, and never under any other
// header (the UniProt false-capture lesson above). A cell that is not wholly a number (or a list of
// numbers) is left alone; a labelled "PMID: n" cell is already read by the label pattern.
function pmidTableCellSpans(text) {
  if (!text.includes("PMID")) return [];
  const out = [];
  const lines = [];
  let pos = 0;
  for (const line of text.split("\n")) {
    lines.push({ line, start: pos });
    pos += line.length + 1;
  }
  for (let i = 0; i + 1 < lines.length; i++) {
    const header = splitTableRow(lines[i].line);
    if (!header || header.length === 0) continue;
    const sep = splitTableRow(lines[i + 1].line);
    if (!sep || sep.length === 0 || !sep.every((c) => SEPARATOR_CELL.test(c.text))) continue;
    const cols = [];
    header.forEach((c, idx) => { if (PMID_HEADER.test(headerText(c.text))) cols.push(idx); });
    let j = i + 2;
    for (; j < lines.length; j++) {
      const row = splitTableRow(lines[j].line);
      if (!row) break;
      for (const col of cols) {
        const cell = row[col];
        if (!cell) continue;
        const m = PMID_CELL.exec(cell.text);
        if (!m) continue;
        for (const item of listItems(m[1], lines[j].start + cell.start + m.indices[1][0])) {
          out.push({ type: "PMID", ...item });
        }
      }
    }
    i = j - 1; // the table's rows were just read
  }
  return out;
}

// Every identifier with its position: { type, id, start, end }, where text.slice(start, end) is the
// identifier as written (end is exclusive). The id is normalized (NCT upper-cased with no separator,
// a DOI without trailing punctuation, a ?query or a wrapping ")", EUROSTAT lower-cased), so a trimmed
// ")", "." or "**" falls outside the span. Order: pattern by pattern, in text order within a pattern,
// with PMID table cells after the other PMID forms — the order extractCitations has always returned.
function extractCitationSpans(text) {
  const s = String(text == null ? "" : text);
  const spans = [];
  let tableCellsDone = false;
  for (const p of CITATION_PATTERNS) {
    if (p.type !== "PMID" && !tableCellsDone) {
      spans.push(...pmidTableCellSpans(s));
      tableCellsDone = true;
    }
    const flags = p.regex.flags.includes("d") ? p.regex.flags : `${p.regex.flags}d`;
    const re = new RegExp(p.regex.source, flags); // a fresh copy: no lastIndex shared between callers
    let m;
    while ((m = re.exec(s)) !== null) {
      if (m[0] === "") { re.lastIndex += 1; continue; }
      const raw = m[1] !== undefined ? m[1] : m[0];
      const [gStart, gEnd] = m.indices[1] || [m.index, m.index + m[0].length];
      if (p.type === "PMID" && p.form === "label") {
        for (const item of listItems(raw, gStart)) spans.push({ type: "PMID", ...item });
        continue;
      }
      if (p.type === "NCT") {
        spans.push({ type: "NCT", id: `NCT${m[1]}`, start: m.index, end: m.index + m[0].length });
        continue;
      }
      if (p.type === "DOI") {
        const cut = inUrlContext(s, gStart) ? raw.replace(/[?#].*$/, "") : raw;
        const id = normalizeDoiId(cut);
        if (!DOI_SHAPE.test(id)) continue;
        spans.push({ type: "DOI", id, start: gStart, end: gStart + id.length });
        continue;
      }
      if (p.type === "PMID" && NOT_A_PMID.test(raw)) continue;
      spans.push({ type: p.type, id: p.type === "EUROSTAT" ? raw.toLowerCase() : raw, start: gStart, end: gEnd });
    }
  }
  if (!tableCellsDone) spans.push(...pmidTableCellSpans(s));
  return spans;
}

function extractCitations(text) {
  return extractCitationSpans(text).map(({ type, id }) => ({ type, id }));
}

// The identity of a citation: type plus id, with DOIs compared case-insensitively (a DOI is
// case-insensitive by definition, so "10.1056/NEJMoa…" and "10.1056/nejmoa…" are one work).
function citationKey(c) {
  const id = String(c && c.id);
  return `${c && c.type}:${c && c.type === "DOI" ? id.toLowerCase() : id}`;
}

// De-duplicate by citationKey, keeping the FIRST mention as written.
function deduplicateCitations(citations) {
  const byKey = new Map();
  for (const c of Array.isArray(citations) ? citations : []) {
    const k = citationKey(c);
    if (!byKey.has(k)) byKey.set(k, c);
  }
  return [...byKey.values()];
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
  MARK_SOURCE,
  citationKey,
  countByType,
  crossCheckCitations,
  deduplicateCitations,
  extractCitations,
  extractCitationSpans,
  normalizeDoiId,
  roleLabel
};
