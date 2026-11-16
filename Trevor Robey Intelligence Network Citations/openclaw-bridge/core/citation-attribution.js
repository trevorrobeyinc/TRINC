"use strict";

// citation-attribution.js — does the author / year a report writes BESIDE a cited DOI or PMID match
// that identifier's registry record?
//
// Found 2026-11-04 (run #7, workflow-e5947dccdce0e06fde1884b5, ALS). Its report.md credited
// 10.1016/s0140-6736(22)01272-7 (Feldman et al., Lancet 2022, per Crossref) to "Chio et al." and
// 10.1056/NEJMra1603471 (Brown & Al-Chalabi, NEJM 2017, PMID 28700839) to "Paganoni et al.". A live
// pass over every report on disk then showed 6 of the 7 papers in that run's reference table carry a
// wrong author. Every identifier was real, retrieved during the run and resolvable, so the citation
// gate (was it fetched?) and delivery re-resolution (does it exist?) passed them all. This module
// adds the missing layer: is the attribution written next to it right?
//
// Deliberately conservative — a false alarm costs operator time, and every wrong flag erodes trust in
// the right ones. An adversarial review (2026-11-04) probed it with the whole on-disk corpus and with
// company names, journal titles, regimens, particles, suffixes and group authors; each guard below
// answers one of those probes:
//   - a line is checked only when it names exactly ONE author string: "X et al.", or a pair
//     "X & Y" / "X and Y" anchored to a year (or a table's "Author / Journal" slash), never a
//     Title-Case phrase such as "Merck Sharp & Dohme", "Muscle & Nerve" or "Japan and Korea";
//   - the line must cite exactly one work: every DOI and PMID on it counts, verified or not, and a
//     DOI + PMID pair counts as one only when they sit together (the "PMID: …; doi: …" form);
//   - outside a table row the name must sit near the identifier, not sentences away;
//   - the year is the one written next to the name (or a table's year-only cell), never any year
//     elsewhere on the line, and never one buried in an identifier or wiki-link target;
//   - a name matches when it equals ANY author on the record, compared token-wise so particles,
//     compound surnames, suffixes ("Jack CR Jr") and diacritics do not raise a false flag; a record
//     with no personal author (NCBI collective names only) or no Latin-script name is not checked.
// Everything else is "not_checked" with a reason, never a guess.

const fs = require("node:fs");
// The marks the engine writes after an identifier ([UNVERIFIED], [ATTRIBUTION MISMATCH: …]).
const { MARK_SOURCE } = require("./citation-extractor.js");

const PARTICLES = ["van", "von", "der", "den", "de", "del", "della", "di", "da", "du", "dos", "das", "le", "la", "ten", "ter"];
const PARTICLE_ALT = PARTICLES.map((p) => `[${p[0]}${p[0].toUpperCase()}]${p.slice(1)}`).join("|");
// A surname: optional particles (any case), then a capitalised word of at least two letters
// (letters, apostrophes and hyphens inside: "Al-Chalabi", "O'Brien", "Chiò").
const SURNAME = String.raw`(?:(?:${PARTICLE_ALT})\s+)*\p{Lu}[\p{L}'’\-]*\p{L}`;
// Vancouver style puts initials after the surname ("Feldman EL et al.", "Brown RH & Al-Chalabi A").
const INITIALS = String.raw`(?:\s+\p{Lu}{1,3}\.?(?=[\s,&.]))*`;
const YEAR_AHEAD = String.raw`(?=\s*\.?\s*[,(]?\s*(?:19|20)\d{2}[a-z]?\b)`;
// "et al." plain or in italics ("*et al.*", "_et al._").
const ET_AL = new RegExp(String.raw`(${SURNAME})${INITIALS},?\s+[*_]?et\.?\s*al\b\.?[*_]?`, "gu");
// The plain Vancouver list the "Authors:" line now shows the model (2026-11-04): "Calvo A, Moglia C,
// Canosa A". Initials are required after EVERY name, so "Japan, Korea" or a company list never
// qualifies; the line's author is the list's FIRST surname.
const INIT_TOKEN = String.raw`\p{Lu}{1,3}(?=[\s,.;)|*]|$)`;
const VANCOUVER = new RegExp(
  String.raw`(?<![*_\p{L}])(${SURNAME})\s+${INIT_TOKEN}(?:,\s*(?:${SURNAME})\s+${INIT_TOKEN})+`,
  "gu"
);
// Pairs must be anchored: a year right after ("Brown & Al-Chalabi, 2017", "(2017)") or, for "&",
// the table convention "Brown & Al-Chalabi / NEJM". An unanchored Title-Case "X & Y" is far more
// often a company, journal, regimen or body site than two authors.
const AMP_PAIR = new RegExp(
  String.raw`(?<![*_\p{L}])(${SURNAME})${INITIALS}\s*&\s*(${SURNAME})(?:\s+\p{Lu}{1,3}\.?)*(?:${YEAR_AHEAD}|(?=\s*\/))`,
  "gu"
);
const AND_PAIR = new RegExp(String.raw`(?<![*_\p{L}])(${SURNAME})${INITIALS}\s+and\s+(${SURNAME})(?:\s+\p{Lu}{1,3}\.?)*${YEAR_AHEAD}`, "gu");
// The year written right after a byline, allowing a trailing ", et al." between them
// ("Calvo A, Moglia C, et al. (2026)").
const ADJACENT_YEAR = /^\s*,?\s*(?:[*_]?et\.?\s*al\b\.?[*_]?)?\s*\.?\s*[,(]?\s*((?:19|20)\d{2})[a-z]?\b/;

// Words that appear capitalised around "&" / "and" in citations but are never author surnames:
// companies, journal-title words, regions and regulators (all found or probed in the 2026-11-04 review).
const NON_NAMES = new Set([
  "muscle", "nerve", "dementia", "therapy", "therapeutics", "research", "cell", "bioscience", "psychiatry",
  "neurosurgery", "neurology", "neuroscience", "head", "neck", "safety", "efficacy", "health", "medicine",
  "science", "nature", "lancet", "journal", "annals", "review", "reviews", "clinical", "oncology", "cancer",
  "disease", "diseases", "pharmacology", "pharmacy", "cardiology", "metabolism", "endocrinology", "immunology",
  "biology", "chemistry", "genetics", "genomics", "surgery", "pediatrics", "nutrition", "rehabilitation",
  "sharp", "dohme", "merck", "johnson", "pfizer", "biontech", "lilly", "squibb", "bristol", "myers", "novartis",
  "roche", "genentech", "astrazeneca", "sanofi", "bayer", "abbvie", "amgen", "gilead", "biogen", "moderna",
  "takeda", "eisai", "daiichi", "sankyo", "boehringer", "ingelheim", "janssen", "regeneron", "vertex",
  "japan", "korea", "china", "canada", "europe", "america", "australia", "india", "germany", "france", "italy",
  "spain", "britain", "england", "switzerland", "sweden", "brazil", "mexico", "taiwan", "singapore",
  "phase", "trial", "trials", "study", "allocation", "masking", "design", "primary", "secondary", "outcome",
  "outcomes", "endpoint", "endpoints", "results", "methods", "efficacy", "tolerability", "pharmacokinetics",
  // Words that take Roman-numeral or letter suffixes and so look like "Surname INITIALS" in a list
  // ("Type II, Type III", "Stage IV", "Group A"): never authors.
  "type", "grade", "stage", "class", "part", "arm", "arms", "cohort", "level", "tier", "group", "figure",
  "table", "section", "appendix", "schedule", "category", "zone", "lot", "batch"
]);

const DOI_SPAN = /\b10\.\d{4,9}\/[^\s|;,\])}>"']+/gi;
const PMID_TAG = /\bPMID[\s:#-]*(\d{1,9})\b/gi;
const URL_SPAN = /https?:\/\/[^\s)\]>]+/gi;
const WIKILINK = /\[\[[^\]]*\]\]/g; // markdown links and URLs: markdownLinkRanges / urlRanges (balanced parens)
const WIKILINK_TARGET = /\[\[[^\]|]*\|/g; // "[[DOI-10.1016_j.x.2019.12.005|" — the target half only
const NCT_SPAN = /\bNCT\d{8}\b/gi;
const LONG_DIGITS = /\b\d{6,9}\b/g;
const NEAR_CHARS = 200; // outside a table row, the name must end within this many characters of the id
const PAIR_DISTANCE = 80; // a DOI and a PMID this close together are one work's two identifiers

const MARK = "[ATTRIBUTION MISMATCH";

const TRANSLIT = { "ø": "o", "Ø": "O", "æ": "ae", "Æ": "AE", "ł": "l", "Ł": "L", "ß": "ss", "đ": "d", "Đ": "D", "œ": "oe", "Œ": "OE", "þ": "th", "Þ": "TH", "ı": "i" };

function normName(s) {
  return String(s || "")
    .replace(/[øØæÆłŁßđĐœŒþÞı]/g, (ch) => TRANSLIT[ch] || ch)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "2nd", "3rd"]);

// NCBI esummary author names are "Surname Initials" ("Brown RH", "Al-Chalabi A", "van den Berg LH",
// "Jack CR Jr"). Collective names carry no initials and are kept whole.
function surnameFromNcbi(name) {
  const tokens = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && SUFFIXES.has(tokens[tokens.length - 1].replace(/\./g, "").toLowerCase())) tokens.pop();
  if (tokens.length > 1 && /^[A-Z]{1,4}$/.test(tokens[tokens.length - 1].replace(/-/g, ""))) tokens.pop();
  return tokens.join(" ");
}

// Token-wise surname comparison: the written name may be the full registry family name, its
// particle-free core, or any contiguous run of its tokens ("Pascual" or "Figal" for "Pascual Figal",
// "Es" or "Van Es" for "van Es"); a collective name's distinctive last word also matches.
function namesEqual(written, registry) {
  const w = normName(written);
  if (!w) return false;
  const tokens = String(registry || "").split(/[\s\-‐]+/).map(normName).filter(Boolean);
  if (tokens.length === 0) return false;
  const core = tokens.filter((t) => !PARTICLES.includes(t));
  const candidates = new Set([tokens.join(""), core.join("")]);
  for (const list of [tokens, core]) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j <= list.length; j++) candidates.add(list.slice(i, j).join(""));
    }
  }
  if (candidates.has(w)) return true;
  const full = tokens.join("");
  return w.length >= 4 && full.endsWith(w);
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Where an identifier appears in a line. DOIs case-insensitively and bounded on the right, so a DOI
// never matches as the prefix of a longer one (Cochrane ".pub2" versions); PMIDs as a whole number,
// never inside a longer number or a PMCID.
function idPattern(type, id, flags = "") {
  if (type === "PMID") return new RegExp(`(?<![0-9A-Za-z])${escapeRegExp(id)}(?!\\d)`, flags);
  return new RegExp(`${escapeRegExp(id)}(?![0-9A-Za-z_\\-/]|\\.[0-9A-Za-z])`, `i${flags}`);
}

// Blank a span with spaces of the same length, so positions found in the cleaned line still point
// at the same characters in the original.
function blank(line, re) {
  return line.replace(re, (m) => " ".repeat(m.length));
}

function cleanForNames(line) {
  let s = blank(line, WIKILINK_TARGET);
  s = blank(s, URL_SPAN);
  s = blank(s, DOI_SPAN);
  s = blank(s, NCT_SPAN);
  s = blank(s, LONG_DIGITS);
  return s;
}

function isTableRow(line) {
  return /^\s*\|/.test(line);
}

function tableYear(line) {
  if (!isTableRow(line)) return null;
  const years = line.split("|").map((c) => c.trim()).filter((c) => /^(?:19|20)\d{2}$/.test(c));
  return years.length === 1 ? Number(years[0]) : null;
}

function acceptName(n) {
  const t = String(n || "").trim();
  if (!t || /^\p{Lu}{1,3}\.?$/u.test(t)) return false; // "EL", "RH": initials
  if (/^[\p{Lu}\s'’\-]+$/u.test(t) && t.replace(/[^\p{L}]/gu, "").length >= 2) return false; // "EULAR", "NCCN": acronyms
  return !t.split(/\s+/).some((w) => NON_NAMES.has(normName(w)));
}

// Author strings written on a line, each with its position and the year written beside it.
function namesOnLine(rawLine) {
  const line = cleanForNames(rawLine);
  const found = [];
  const add = (name, start, end) => {
    if (!acceptName(name)) return;
    const ahead = ADJACENT_YEAR.exec(line.slice(end, end + 16));
    const year = ahead ? Number(ahead[1]) : tableYear(rawLine);
    found.push({ name: name.trim(), start, end, year });
  };
  // A Vancouver list first: its FIRST surname is the byline, and the "et al." / "&" forms that sit
  // inside the list ("… Zucchi E et al.") are part of it, not a second author.
  const spans = [];
  for (const m of line.matchAll(VANCOUVER)) {
    spans.push([m.index, m.index + m[0].length]);
    add(m[1], m.index, m.index + m[0].length);
  }
  const insideList = (i) => spans.some(([s, e]) => i >= s && i <= e + 2);
  for (const m of line.matchAll(ET_AL)) {
    if (insideList(m.index)) continue;
    add(m[1], m.index, m.index + m[0].length);
  }
  for (const m of line.matchAll(AMP_PAIR)) {
    if (insideList(m.index)) continue;
    if (normName(m[1]) === normName(m[2]) || !acceptName(m[2])) continue; // "Johnson & Johnson"; "X & Nerve"
    add(m[1], m.index, m.index + m[0].length);
  }
  for (const m of line.matchAll(AND_PAIR)) {
    if (insideList(m.index)) continue;
    if (!acceptName(m[2])) continue;
    add(m[1], m.index, m.index + m[0].length);
  }
  const distinct = [];
  for (const f of found.sort((a, b) => a.start - b.start)) {
    if (!distinct.some((d) => normName(d.name) === normName(f.name))) distinct.push(f);
  }
  return distinct;
}

// How many cited works the line carries: every DOI and PMID on it, whatever its status. A DOI and a
// PMID count as ONE work only in the "PMID: …; doi: …" form — nothing but punctuation and a label
// between them — never merely because they are close ("Smith et al. (doi: X) and a cohort (PMID: Y)").
const PAIR_GLUE = /^[\s;,:|()[\]\/-]*(?:doi|pmid|pubmed)?[\s:#-]*$/i;
function worksOnLine(line) {
  const dois = new Map();
  for (const m of line.matchAll(DOI_SPAN)) {
    const id = m[0].replace(/[.,;:]+$/, "").toLowerCase();
    if (!dois.has(id)) dois.set(id, { start: m.index, end: m.index + m[0].length });
  }
  const pmids = new Map();
  for (const m of line.matchAll(PMID_TAG)) {
    if (!pmids.has(m[1])) pmids.set(m[1], { start: m.index, end: m.index + m[0].length });
  }
  let works = dois.size + pmids.size;
  if (dois.size === 1 && pmids.size === 1) {
    const [d] = dois.values();
    const [p] = pmids.values();
    const [first, second] = d.start < p.start ? [d, p] : [p, d];
    const between = line.slice(first.end, second.start);
    if (between.length <= PAIR_DISTANCE && PAIR_GLUE.test(between)) works = 1;
  }
  return works;
}

function clip(s, max = 200) {
  const t = String(s).trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

// T2-19 (2026-11-16): the engine's own marks are not the report's text. The detector reads the report
// before any mark is written; the marker re-reads each section line after the [UNVERIFIED] pass wrote
// into it. Both now read a line without the marks: names are found with them blanked (positions kept),
// and the author-to-identifier distance counts the report's own characters only. Before this, a mark
// between the two could push the author past NEAR_CHARS on the marked line, so the manifest flagged
// attribution_mismatch while the line carried no inline mark.
const ENGINE_MARKS = new RegExp(String.raw`[ \t]*${MARK_SOURCE}`, "g");

// One line, one cited identifier → a checkable { name, year } or a reason it cannot be checked.
function evaluateLine(line, citation) {
  const hit = idPattern(citation.type, String(citation.id)).exec(line);
  if (!hit) return null;
  // T2-20: a reference definition never renders, and a mark on its line would break it, so the
  // attribution beside an identifier there is neither checked nor marked.
  if (referenceDefinition(line)) return { reason: "reference_definition" };
  if (worksOnLine(line) > 1) return { reason: "several_works_on_line" };
  const names = namesOnLine(blank(line, ENGINE_MARKS));
  if (names.length === 0) return { reason: "no_author_named" };
  if (names.length > 1) return { reason: "several_authors_named" };
  const n = names[0];
  if (!isTableRow(line)) {
    const between = hit.index >= n.end ? line.slice(n.end, hit.index) : line.slice(hit.index + hit[0].length, n.start);
    const gap = between.replace(ENGINE_MARKS, "").length;
    if (gap > NEAR_CHARS) return { reason: "author_not_near_identifier" };
  }
  return { name: n.name, year: Number.isFinite(n.year) ? n.year : null };
}

// For each cited DOI / PMID: every report line that mentions it, split into the lines that can be
// checked and the reasons the others cannot.
function findWrittenAttributions(reportText, citations) {
  const lines = String(reportText || "").split("\n");
  const list = (Array.isArray(citations) ? citations : []).filter((c) => c && (c.type === "DOI" || c.type === "PMID") && c.id);
  const out = new Map();
  for (const c of list) out.set(`${c.type}:${String(c.id).toUpperCase()}`, { checkable: [], skipped: [] });
  lines.forEach((line, index) => {
    for (const c of list) {
      const r = evaluateLine(line, c);
      if (!r) continue;
      const slot = out.get(`${c.type}:${String(c.id).toUpperCase()}`);
      const base = { line_no: index + 1, excerpt: clip(line) };
      if (r.reason) slot.skipped.push({ ...base, reason: r.reason });
      else slot.checkable.push({ ...base, name: r.name, year: r.year });
    }
  });
  return out;
}

// registry: { authors: [display surnames], years: [numbers] }
function compareAttribution(entry, registry) {
  const raw = registry && Array.isArray(registry.authors) ? registry.authors.filter(Boolean) : [];
  if (raw.length === 0) return { status: "not_checked", reason: "registry_has_no_authors" };
  const authors = raw.filter((a) => normName(a));
  if (authors.length === 0) return { status: "not_checked", reason: "registry_names_not_latin" };
  if (!authors.some((a) => namesEqual(entry.name, a))) return { status: "author_mismatch" };
  const years = registry && Array.isArray(registry.years) ? registry.years.filter(Number.isFinite) : [];
  if (entry.year && years.length > 0 && !years.includes(entry.year)) return { status: "year_mismatch" };
  return { status: "match" };
}

// Registry text is third-party: it is written into shipped section files and a markdown table, so
// it is kept to plain words (no brackets, pipes, angle brackets or control characters).
function sanitize(s, max) {
  const t = String(s || "").replace(/[\u0000-\u001f\u007f[\]|<>]/g, " ").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function registryLabel(registry) {
  const authors = (registry && Array.isArray(registry.authors) ? registry.authors : [])
    .map((a) => sanitize(a, 40))
    .filter(Boolean);
  const first = authors[0] || "unknown author";
  const who = authors.length > 2 ? `${first} et al.` : authors.length === 2 ? `${first} & ${authors[1]}` : first;
  const years = registry && Array.isArray(registry.years) ? registry.years.filter(Number.isFinite) : [];
  return sanitize(years.length ? `${who}, ${Math.min(...years)}` : who, 80) || "unknown author";
}

function yearsIn(value) {
  return typeof value === "string" ? (value.match(/\b(?:19|20)\d{2}\b/g) || []).map(Number) : [];
}

// Crossref work message → { authors, years }.
function bibFromCrossref(message) {
  const m = message && typeof message === "object" ? message : {};
  const authors = (Array.isArray(m.author) ? m.author : [])
    .map((a) => (a && (a.family || a.name)) || "")
    .filter(Boolean);
  const years = [];
  for (const key of ["issued", "published-print", "published-online", "published"]) {
    const parts = m[key] && Array.isArray(m[key]["date-parts"]) && m[key]["date-parts"][0];
    const y = Array.isArray(parts) ? Number(parts[0]) : NaN;
    if (Number.isFinite(y) && !years.includes(y)) years.push(y);
  }
  return { authors, years };
}

// NCBI esummary docsum → { authors, years }. Collective names (authtype "CollectiveName") are not
// people: a record listing only those is "no personal author", not a list to compare against.
function bibFromNcbiDocsum(rec) {
  const r = rec && typeof rec === "object" ? rec : {};
  const authors = (Array.isArray(r.authors) ? r.authors : [])
    .filter((a) => a && String(a.authtype || "Author") !== "CollectiveName")
    .map((a) => surnameFromNcbi(a.name))
    .filter(Boolean);
  const years = [];
  for (const key of ["pubdate", "epubdate", "sortpubdate"]) {
    for (const y of yearsIn(r[key])) if (!years.includes(y)) years.push(y);
  }
  return { authors, years };
}

// ── Where a mark goes (T1-3; T2-20, 2026-11-16) ─────────────────────────────────────────────────────
// A mark goes after the whole construct that holds the identifier, so the construct still renders
// and the mark is read as text. T2-20 (review marks:3) added the six constructs a mark used to land
// inside, or break: a markdown link whose text holds brackets ("[[1]](…)", "[Smith [2019]](…)"), an
// angle-bracket autolink, an HTML attribute, a link title, a reference definition and a scheme-less
// URL. Construct boundaries are read as if the engine's marks were not there, so a mark already
// inside a construct never makes it look closed: the gate's fail-closed re-read then finds the
// mention unmarked and the run stops.

// The line without the engine's marks, with a map from each kept character to its original index.
function withoutMarks(line) {
  const map = [];
  let text = "";
  let from = 0;
  for (const m of line.matchAll(ENGINE_MARKS)) {
    for (let i = from; i < m.index; i++) map.push(i);
    text += line.slice(from, m.index);
    from = m.index + m[0].length;
  }
  for (let i = from; i < line.length; i++) map.push(i);
  text += line.slice(from);
  return { text, map };
}

// The "]" that closes a link text opening at `open`, nested brackets kept ("[[1]]", "[Smith [2019]]"), or -1.
function linkTextEnd(line, open) {
  let depth = 0;
  for (let i = open; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\\") { i++; continue; }
    if (ch === "[") depth++;
    else if (ch === "]" && --depth === 0) return i;
  }
  return -1;
}

// The end of an inline link's `(destination "title")` that opens at `open`, or -1. The destination is
// <bracketed> or keeps balanced parentheses (a Lancet DOI); a title in "…", '…' or (…) may hold a ")"
// of its own ("Smith :)").
function linkTailEnd(line, open) {
  let i = open + 1;
  const skipSpace = () => { while (line[i] === " " || line[i] === "\t") i++; };
  skipSpace();
  if (line[i] === "<") {
    const close = line.indexOf(">", i + 1);
    if (close < 0) return -1;
    i = close + 1;
  } else {
    let depth = 0;
    for (; i < line.length; i++) {
      const ch = line[i];
      if (ch === "\\") { i++; continue; }
      if (ch === " " || ch === "\t") break;
      if (ch === "(") depth++;
      else if (ch === ")") { if (depth === 0) break; depth--; }
    }
  }
  skipSpace();
  const q = line[i];
  if (q === '"' || q === "'" || q === "(") {
    const closeCh = q === "(" ? ")" : q;
    let t = i + 1;
    for (; t < line.length && line[t] !== closeCh; t++) if (line[t] === "\\") t++;
    if (t >= line.length) return -1;
    i = t + 1;
    skipSpace();
  }
  return line[i] === ")" ? i + 1 : -1;
}

// T1-3's rule for a link the parser above cannot close: the target's balanced parentheses only.
function balancedParenEnd(line, from) {
  let depth = 1;
  let i = from;
  for (; i < line.length && depth > 0; i++) {
    if (line[i] === "(") depth++;
    else if (line[i] === ")") depth--;
  }
  return depth === 0 ? i : -1;
}

// Markdown links "[text](target "title")": the text with nested brackets, the target with its
// BALANCED parentheses (T1-3, 2026-11-14: a Lancet-style DOI in a link target used to end the link at
// its first ")", which put a mark inside the DOI), and a title (T2-20). Images ("![alt](…)") too.
function markdownLinkRanges(line) {
  const out = [];
  for (let i = line.indexOf("["); i >= 0; i = line.indexOf("[", i + 1)) {
    const close = linkTextEnd(line, i);
    if (close < 0 || line[close + 1] !== "(") continue;
    let end = linkTailEnd(line, close + 1);
    if (end < 0) end = balancedParenEnd(line, close + 2);
    if (end > 0) out.push([i, end]);
  }
  return out;
}

// Angle-bracket autolinks: "<" a scheme (as CommonMark has it) or "www.", no space, ">".
const AUTOLINK = /<(?:[a-z][a-z0-9+.-]{1,31}:|www\.)[^\s<>]*>/gi;
function autolinkRanges(line) {
  return [...line.matchAll(AUTOLINK)].map((m) => [m.index, m.index + m[0].length]);
}

// An HTML tag ('<a href="https://doi.org/…">'): the mark goes after the tag, or after the closing </a>
// of a link, so it is never inside an attribute and always renders. The tag name must be followed by
// a space, "/" or ">", so an autolink ("<https:…>") is not read as a tag.
const HTML_TAG = /<([a-z][a-z0-9-]*)(?=[\s/>])[^<>]*>/gi;
function htmlRanges(line) {
  const out = [];
  const lower = line.toLowerCase();
  for (const m of line.matchAll(HTML_TAG)) {
    let end = m.index + m[0].length;
    if (m[1].toLowerCase() === "a") {
      const close = lower.indexOf("</a>", end);
      if (close >= 0) end = close + 4;
    }
    out.push([m.index, end]);
  }
  return out;
}

function wikiLinkRanges(line) {
  return [...line.matchAll(WIKILINK)].map((m) => [m.index, m.index + m[0].length]);
}

// A reference definition, "[1]: https://doi.org/…" (CommonMark: up to three spaces, a label, a colon,
// a destination and an optional title, then nothing), read with the engine's marks removed. It never
// renders: the reader sees its label where the text uses it, so the gate marks those uses
// (citation-gate.js markPositions), and a mark written on the line itself would end the definition
// and break every link that uses it. Returns { label, end } (end: just after the definition, in the
// line's own positions) or null.
const REFERENCE_DEFINITION = /^ {0,3}\[((?:[^[\]\\\n]|\\.)+)\]:[ \t]*(?:<[^<>\n]*>|\S+)(?:[ \t]+(?:"[^"\n]*"|'[^'\n]*'|\([^()\n]*\)))?[ \t]*$/;
function normLabel(s) {
  return String(s).trim().replace(/\s+/g, " ").toLowerCase();
}
function referenceDefinition(line) {
  const { text, map } = withoutMarks(String(line || ""));
  const m = REFERENCE_DEFINITION.exec(text);
  if (!m) return null;
  const bare = text.replace(/[ \t]+$/, "").length;
  return { label: normLabel(m[1]), end: bare > 0 ? map[bare - 1] + 1 : 0 };
}

// Where a text uses a reference label: "[text][label]", "[label][]" and the shortcut "[label]", never
// in a definition line, an inline link "[label](…)" or a wiki-link "[[…]]". Returns the index just
// after each use, where its mark belongs.
function labelUseEnds(text, label) {
  const want = normLabel(label);
  const ends = [];
  let offset = 0;
  for (const line of String(text || "").split("\n")) {
    if (!referenceDefinition(line)) {
      for (let i = line.indexOf("["); i >= 0; i = line.indexOf("[", i + 1)) {
        if (line[i - 1] === "\\") continue;
        const close = linkTextEnd(line, i);
        if (close < 0) continue;
        let used = null;
        let end = close + 1;
        if (line[close + 1] === "[") {
          const close2 = line.indexOf("]", close + 2);
          if (close2 < 0) continue;
          const second = line.slice(close + 2, close2);
          used = second.trim() === "" ? line.slice(i + 1, close) : second;
          end = close2 + 1;
        } else if (line[close + 1] !== "(" && line[close + 1] !== ":") {
          used = line.slice(i + 1, close);
        }
        if (used !== null && normLabel(used) === want) ends.push(offset + end);
        i = end - 1; // past this bracket group, so its inner "[" is not read as a use
      }
    }
    offset += line.length + 1;
  }
  return ends;
}

// Bare URLs: with a scheme, or (T2-20) the scheme-less host-then-path forms the extractor reads since
// T2-17 ("www.doi.org/…", "pubmed.ncbi.nlm.nih.gov/12345678/"). Balanced parentheses are kept, and
// trailing sentence punctuation, markdown emphasis or a wrapping ")" dropped (the extractor's DOI rule,
// citation-extractor.js normalizeDoiId).
const BARE_URL = /(?:https?:\/\/|(?<![\w@./:-])(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\/)[^\s\]>|]*/gi;
function urlRanges(line) {
  const out = [];
  for (const m of line.matchAll(BARE_URL)) {
    const s = m[0];
    let open = 0;
    let close = 0;
    for (const ch of s) {
      if (ch === "(") open++;
      else if (ch === ")") close++;
    }
    let end = s.length;
    while (end > 0) {
      const ch = s[end - 1];
      if (".,;:!?*~'\"".includes(ch)) { end--; continue; }
      if (ch === ")" && close > open) { end--; close--; continue; }
      break;
    }
    out.push([m.index, m.index + end]);
  }
  return out;
}

// The end of the outermost construct holding [hitIndex, hitEnd) on a line with no marks, or hitEnd.
// Outermost first: an HTML link or tag, a markdown link, an autolink, a wiki-link, a bare URL, and
// last a reference definition (whose marks the gate puts at its label's uses instead).
function constructEnd(line, hitIndex, hitEnd) {
  const holds = ([start, end]) => hitIndex >= start && hitIndex < end;
  for (const ranges of [htmlRanges(line), markdownLinkRanges(line), autolinkRanges(line), wikiLinkRanges(line), urlRanges(line)]) {
    const ends = ranges.filter(holds).map(([, end]) => end);
    if (ends.length > 0) return Math.max(hitEnd, ...ends);
  }
  const def = REFERENCE_DEFINITION.test(line) ? line.replace(/[ \t]+$/, "").length : -1;
  return def > hitEnd ? def : hitEnd;
}

// Where to put a mark: after the identifier, or, when the identifier sits inside a construct, after
// the whole construct, so no link is broken. Never before the end of the identifier itself. Shared by
// the attribution marks and the gate's [UNVERIFIED] marks (T1-3). The constructs are found on the line
// with the engine's marks removed (T2-20), and the position is mapped back to the line as written.
function insertionPoint(line, hitIndex, hitEnd) {
  const { text, map } = withoutMarks(line);
  const back = new Map(map.map((orig, k) => [orig, k]));
  if (!back.has(hitIndex) || !back.has(hitEnd - 1)) return hitEnd;
  const start = back.get(hitIndex);
  const end = back.get(hitEnd - 1) + 1;
  const at = constructEnd(text, start, end);
  return at === end ? hitEnd : map[at - 1] + 1;
}

// Mark a line only when the line's OWN verdict is a mismatch against the stored registry record —
// the same rules the detector applies (one work, one author, adjacency, year) — so a correct line
// that cites the same identifier is never marked. Content-based, because the shipped sections are
// separate files whose lines do not line up with the assembled report. Idempotent.
function annotateAttributionText(text, mismatches) {
  const list = (Array.isArray(mismatches) ? mismatches : []).filter((m) => m && m.id && m.registry_full);
  if (list.length === 0) return String(text || "");
  const lines = String(text || "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes(MARK)) continue;
    for (const mm of list) {
      const r = evaluateLine(line, mm);
      if (!r || r.reason) continue;
      const verdict = compareAttribution(r, mm.registry_full);
      if (verdict.status !== "author_mismatch" && verdict.status !== "year_mismatch") continue;
      const hit = idPattern(mm.type, String(mm.id)).exec(line);
      const at = insertionPoint(line, hit.index, hit.index + hit[0].length);
      const label = mm.registry_label || registryLabel(mm.registry_full);
      lines[i] = `${line.slice(0, at)} ${MARK}: registry lists ${label}]${line.slice(at)}`;
      break; // one mark per line
    }
  }
  return lines.join("\n");
}

// Annotate each subtask's output file in place so the SHIPPED bundle carries the marks (mirrors
// citation-gate.js annotateSubtaskOutputs). Fail-soft; returns how many lines were marked.
function annotateSubtaskAttributions(subtaskResults, mismatches, opts = {}) {
  const readFile = opts.readFile || fs.readFileSync;
  const writeFile = opts.writeFile || fs.writeFileSync;
  let marked = 0;
  for (const st of Array.isArray(subtaskResults) ? subtaskResults : []) {
    if (!st || !st.output_path) continue;
    try {
      const text = readFile(st.output_path, "utf8");
      const next = annotateAttributionText(text, mismatches);
      if (next !== text) {
        writeFile(st.output_path, next);
        marked += next.split(MARK).length - text.split(MARK).length;
      }
    } catch { /* fail-soft: a section we cannot rewrite still carries the manifest flag */ }
  }
  return marked;
}

// Prior-run text served as context only (vault read-back, research-memory priors) can carry a past
// run's WRONG bylines — run #7's notes still say "Chio et al. / Lancet | 2022". Identifiers are already
// withheld there (tool-prefetch.js redactIdentifiers); the names are withheld too, so a model cannot
// re-attach an old misattribution to a live identifier. Over-redaction is harmless: context-only text
// is never citable evidence.
const BYLINE_WITHHELD = "<prior-run author withheld>";
function redactBylines(text) {
  let s = String(text || "");
  for (const re of [VANCOUVER, ET_AL, AMP_PAIR, AND_PAIR]) {
    s = s.replace(new RegExp(re.source, re.flags), BYLINE_WITHHELD);
  }
  return s;
}

module.exports = {
  redactBylines,
  findWrittenAttributions,
  compareAttribution,
  registryLabel,
  bibFromCrossref,
  bibFromNcbiDocsum,
  surnameFromNcbi,
  namesEqual,
  normName,
  annotateAttributionText,
  annotateSubtaskAttributions,
  insertionPoint,
  referenceDefinition,
  labelUseEnds,
  ATTRIBUTION_MARK: MARK
};
