"use strict";

/**
 * Section-level citation-coverage gate orchestration (spec: fail-closed ONLY at zero).
 *
 * One `runCitationGate` call per report section (= one `subtask_results[]` element), on a query
 * derived from THAT section's output text + the workflow's primary subject. A section "fails" only
 * when SearXNG ran and returned zero distinct primary sources (even after the breadth retry); infra
 * failures (connector missing / SearXNG unreachable) mark the section UNCHECKED and never fail it.
 * The step fails closed (throws) only if at least one section genuinely returned zero coverage.
 *
 * Pure/injectable (searchFn, runGate, readFile, log are all passed in) so it is offline-testable, and
 * deterministic — no wall-clock or RNG globals (forbidden under openclaw-bridge/).
 *
 * @module searxng-mcp/section-gate
 */

// Boilerplate that is NEVER a subject term — case-insensitive. Sentence openers + section labels,
// clinical-trial table/status vocab (COMPLETED/Phase/Sponsor/…), citation-ID type-names, and leaked
// prompt scaffolding (the engine injects a "LIVE DATABASE CONTEXT" instruction telling agents to
// prioritize live data over TRAINING KNOWLEDGE — that phrasing bleeds into some section outputs).
const STOPWORDS = new Set(
  [
    // openers / prose structure
    "the", "this", "these", "those", "that", "a", "an", "and", "but", "or", "for", "nor", "so", "yet",
    "in", "on", "at", "by", "to", "of", "as", "we", "our", "it", "its", "is", "are", "was", "were",
    "be", "been", "with", "from", "into", "based", "here", "key", "points", "may", "can", "will",
    "however", "thus", "therefore", "overall", "additionally", "notably", "importantly", "moreover",
    "figure", "table", "section", "results", "methods", "discussion", "conclusion", "conclusions",
    "introduction", "background", "summary", "abstract", "objective", "objectives", "report", "there", "their",
    // clinical-trial table / status vocab
    "completed", "terminated", "recruiting", "withdrawn", "suspended", "enrolling", "active", "unknown",
    "phase", "purpose", "status", "sponsor", "enrollment", "intervention", "interventions", "outcome",
    "outcomes", "arm", "arms", "randomized", "placebo", "cohort", "endpoint", "endpoints", "participants",
    "trial", "trials", "study", "studies", "condition", "conditions", "eligibility", "criteria", "design",
    "primary", "secondary", "date", "doc", "estimated", "actual", "start", "completion", "location",
    "locations", "country", "recruitment", "sponsors",
    // report-structure / workflow-scaffolding fragments that ride into section headings (observed in
    // the live run: "Source Discovery Set Scope", "Semantic Scholar", "Emerging ... Beyond", "Handoff")
    "set", "scope", "beyond", "handoff", "semantic", "scholar", "emerging", "discovery", "coverage",
    // citation-ID type-names (the identifiers themselves are stripped separately, below)
    "id", "pmid", "pmc", "nct", "doi", "cid", "chembl", "drugbank", "ensg", "uniprot", "gse", "gsm", "rrid",
    // leaked prompt scaffolding
    "training", "knowledge", "live", "database", "context", "instruction", "prioritize", "prioritizing",
  ].map((s) => s.toLowerCase())
);

// Multi-word workflow/process directives that agents write as section headings — never a search
// subject. Dropped whole (they'd otherwise survive the token stoplist since each word alone is common).
const PROCESS_PHRASE =
  /\b(action required|before delivery|synthesis confidence|confidence statement|(data )?quality assessment|failure mode|coverage gap|source discovery|competitor analysis|trial intelligence|research output|executive summary|handoff to)\b/i;

// A capitalized word or run of capitalized words (proper-noun / acronym / entity), 1-4 words.
const CAP_PHRASE = /\b([A-Z][A-Za-z0-9-]+(?:\s+[A-Z][A-Za-z0-9-]+){0,3})\b/g;

// A SMALL local set of citation-ID token shapes (NOT the connector's grammar — deliberately kept
// separate to avoid another drift pair like cluster.js). An identifier is never a subject term.
const ID_TOKEN = [
  /^NCT\d{6,}$/i, // ClinicalTrials.gov
  /^PMID\d+$/i,
  /^PMC\d+$/i,
  /^CID\d+$/i,
  /^CHEMBL\d+$/i,
  /^DB\d{4,}$/i, // DrugBank
  /^ENSG\d+$/i,
  /^GSE\d+$/i,
  /^GSM\d+$/i,
  /^SRR\d+$/i,
  /^10\.\d{4,}\//, // DOI (rarely capitalized-token form, but safe)
  /^[OPQ][0-9][A-Z0-9]{3}[0-9]$/, // UniProt accession (6-char)
  /^[A-NR-Z][0-9][A-Z][A-Z0-9]{2}[0-9]$/, // UniProt accession (alt 6-char)
];

/** True if a token is a citation identifier (stripped from key-term candidates before ranking). */
function looksLikeCitationId(token) {
  return ID_TOKEN.some((re) => re.test(token));
}

/**
 * Deterministic top-K key terms from `text`, excluding stopwords, subject tokens, and citation IDs.
 * Ranking (all deterministic): (1) most NET-DISTINCTIVE tokens first (meaningful.length — this is the
 * "rare multi-word wins / lower-commonness" proxy: a phrase of mostly-boilerplate tokens ranks low,
 * and it avoids a raw word-count sort letting a padded common phrase beat a 1-word drug name), then
 * (2) longer phrase, then (3) frequency as a TIEBREAK ONLY, then (4) first appearance for stability.
 * Returns original-cased representative phrases.
 */
function topKeyTerms(text, k, excludeTokens) {
  const stats = new Map(); // key(lower) -> { phrase, count, first, mc, words }
  let m;
  CAP_PHRASE.lastIndex = 0;
  while ((m = CAP_PHRASE.exec(String(text || ""))) !== null) {
    const phrase = m[1].trim();
    const origTokens = phrase.split(/\s+/);
    // A token counts as "meaningful" (distinctive subject signal) only if it is not too short, not a
    // stopword, not the primary subject, and not a citation identifier.
    const meaningful = origTokens.filter((t) => {
      const lt = t.toLowerCase();
      return (
        lt.length >= 3 &&
        !STOPWORDS.has(lt) &&
        !excludeTokens.has(lt) &&
        !looksLikeCitationId(t) &&
        !/^[ivxlcdm]+$/.test(lt) // pure roman numeral (e.g. "III" in "Phase III") — not a subject term
      );
    });
    if (meaningful.length === 0) continue;
    // Emit ONLY the distinctive tokens, not the whole phrase — this drops ride-along stopwords/roman
    // numerals ("The", "Set", "III") that sat next to a real term. Dedup on the emitted term so
    // "The Semantic Scholar" and "Semantic Scholar" collapse.
    const term = meaningful.join(" ");
    if (PROCESS_PHRASE.test(term)) continue; // whole workflow-directive heading → not a subject
    const key = term.toLowerCase();
    const rec = stats.get(key);
    if (rec) rec.count += 1;
    else stats.set(key, { term, count: 1, first: m.index, mc: meaningful.length });
  }
  return [...stats.values()]
    .sort((a, b) => b.mc - a.mc || b.count - a.count || a.first - b.first)
    .slice(0, k)
    .map((r) => r.term);
}

/**
 * Build a section-specific search query: `<primary subject> <top key terms from section text>`.
 * Falls back to the primary subject (then a text snippet) so it is never empty.
 */
function deriveSectionQuery({ primarySubject, sectionText } = {}) {
  const subject = String(primarySubject || "").trim();
  const text = String(sectionText || "");
  const subjectTokens = new Set(subject.toLowerCase().split(/\s+/).filter(Boolean));
  const terms = topKeyTerms(text, 4, subjectTokens);

  const parts = [];
  const seen = new Set();
  const pushUnique = (s) => {
    const key = s.toLowerCase();
    if (s && !seen.has(key)) {
      seen.add(key);
      parts.push(s);
    }
  };
  if (subject) pushUnique(subject);
  for (const t of terms) {
    if (!subjectTokens.has(t.toLowerCase())) pushUnique(t);
  }
  const q = parts.join(" ").replace(/\s+/g, " ").trim();
  return q || subject || text.trim().split(/\s+/).slice(0, 8).join(" ");
}

/** Stable section id for a subtask element. */
function sectionIdOf(subtask, index) {
  return String((subtask && (subtask.subtask_id || subtask.task_id)) || `section-${index}`);
}

/**
 * Run the section gate over a mission's `subtask_results`. Never throws for infra reasons — returns
 * a report. Call `assertCoverageOrThrow` on the result to fail the step closed.
 *
 * @param {object} args
 * @param {Array<object>} args.subtasks       mission subtask_results[]
 * @param {string} args.primarySubject        workflow primary subject (indication||condition||…)
 * @param {Function} args.searchFn            (query, params) => Promise<{results:[...]}>
 * @param {Function} args.runGate             the adapter's runCitationGate
 * @param {Function} [args.readFile]          (path, enc) => string (defaults: none → empty text)
 * @param {number} [args.maxResults=8]
 * @param {object} [args.log]                 optional logger with .warn()
 * @returns {Promise<{section_coverage:object[], failing:object[]}>}
 */
async function runSectionGate({ subtasks, primarySubject, searchFn, runGate, readFile, maxResults = 8, log } = {}) {
  const section_coverage = [];
  const failing = [];
  const seenQueries = new Set();
  const list = Array.isArray(subtasks) ? subtasks : [];

  for (let i = 0; i < list.length; i += 1) {
    const subtask = list[i];
    const sectionId = sectionIdOf(subtask, i);

    // Read the section's output text (fail-soft — an unreadable file just yields a topic-level query).
    let sectionText = "";
    try {
      if (subtask && subtask.output_path && typeof readFile === "function") {
        sectionText = String(readFile(subtask.output_path, "utf8"));
      }
    } catch {
      sectionText = "";
    }

    const query = deriveSectionQuery({ primarySubject, sectionText });
    const qKey = query.toLowerCase();
    if (seenQueries.has(qKey) && log && typeof log.warn === "function") {
      // Observability for the topic-level-collapse risk — not a failure.
      log.warn({ event: "searxng_section_query_collision", section_id: sectionId, query });
    }
    seenQueries.add(qKey);

    try {
      const out = await runGate(
        { query, step_type: "breadth", section_id: sectionId, topic: "science", max_results: maxResults },
        { searchFn }
      );
      section_coverage.push({
        section_id: sectionId,
        query,
        checked: true,
        gate_status: out.gate_status,
        gate_reason: out.gate_reason || null,
        coverage_tier: out.coverage_tier || null,
        distinct_source_count: out.distinct_source_count,
      });
      if (out.gate_status === "fail") {
        failing.push({ section_id: sectionId, query, gate_reason: out.gate_reason || null });
      }
    } catch (err) {
      // Infra (connector missing / SearXNG unreachable): UNCHECKED — do NOT fail on this basis.
      if (log && typeof log.warn === "function") {
        log.warn({
          event: "searxng_section_gate_infra_skip",
          section_id: sectionId,
          error: String((err && err.message) || err),
        });
      }
      section_coverage.push({
        section_id: sectionId,
        query,
        checked: false,
        skip_reason: String((err && err.message) || err),
      });
    }
  }

  return { section_coverage, failing };
}

/**
 * Fail the quality step CLOSED if any section genuinely returned zero distinct primary sources.
 * Mirrors the engine's coded-error style (cf. executeMissionStep's PHASE30_CITATION_* throws).
 */
function assertCoverageOrThrow(coverage) {
  const failing = (coverage && coverage.failing) || [];
  if (failing.length > 0) {
    const ids = failing.map((f) => f.section_id).join(", ");
    const err = new Error(
      `Citation-coverage gate failed: section(s) [${ids}] returned zero distinct primary sources ` +
        `even after a breadth reformulation — refusing to synthesize to protect the ` +
        `fail-closed-only-at-zero / zero-fabrication guarantee.`
    );
    err.code = "PHASE30_CITATION_COVERAGE_ZERO";
    err.coverage_report = coverage;
    throw err;
  }
}

module.exports = { deriveSectionQuery, topKeyTerms, runSectionGate, assertCoverageOrThrow };
