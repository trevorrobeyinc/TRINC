"use strict";

/**
 * Reads real engine output and extracts the facts a post is allowed to assert.
 *
 * THIS MODULE IS THE ANTI-FABRICATION SPINE. A drafting tool may only state a figure that came
 * out of here, and every extracted claim carries the file and the verbatim line it came from,
 * so any number in a draft can be traced back to a document on disk in one step.
 *
 * The parsers below match the ACTUAL rendered formats of the deliverables (read from shipped
 * bundles on 2026-09-19), not an assumed schema. If a deliverable's renderer changes shape, the
 * matching claim simply goes missing — which surfaces as a VERIFY slot in the draft rather than
 * as a wrong number.
 *
 * @module sources
 */

const fs = require("node:fs");
const path = require("node:path");

const { paths } = require("./config.js");

function readIfPresent(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function listDirs(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

/** Every release bundle and workflow run available to repurpose. */
function listSources() {
  const p = paths();
  const releases = listDirs(p.releases)
    .filter((name) => name.startsWith("offer-"))
    .map((name) => {
      const dir = path.join(p.releases, name);
      const deliverables = path.join(dir, "deliverables");
      let files = [];
      try {
        files = fs.readdirSync(deliverables).sort();
      } catch { /* a bundle without deliverables is still worth listing */ }
      let title = "";
      const meta = readIfPresent(path.join(dir, "metadata.json"));
      if (meta) {
        try { title = JSON.parse(meta).offer_title || ""; } catch { /* keep empty */ }
      }
      return {
        source_ref: name,
        kind: "release",
        title,
        dir,
        deliverables: files,
        has_citation_integrity: files.includes("citation-integrity.md"),
        has_graveyard_memo: files.includes("graveyard-memo.md"),
        has_search_coverage: files.includes("search-coverage.md")
      };
    });

  const workflows = listDirs(p.workflows)
    .filter((name) => name.startsWith("workflow-"))
    .map((name) => ({
      source_ref: name,
      kind: "workflow",
      dir: path.join(p.workflows, name)
    }));

  return { releases, workflows };
}

function resolveSourceDir(sourceRef) {
  const p = paths();
  if (/^offer-[A-Za-z0-9]+$/.test(sourceRef)) {
    return { dir: path.join(p.releases, sourceRef), kind: "release" };
  }
  if (/^workflow-[A-Za-z0-9]+$/.test(sourceRef)) {
    return { dir: path.join(p.workflows, sourceRef), kind: "workflow" };
  }
  return null;
}

function claim(id, value, unit, file, evidence, note) {
  return { id, value, unit, source_file: file, evidence: evidence.trim(), note: note || null };
}

/* --------------------------- per-deliverable parsers --------------------------- */

// Format (verified 2026-09-19):
//   **Integrity grade: A** — High integrity — ...
//   | Citations | 34 |
//   | Grounded in fetched evidence | 34 (100%) |
//   | Unverified (treat as unconfirmed) | 0 |
//   | Retracted | 0 |
function parseCitationIntegrity(text, file) {
  const claims = [];
  if (!text) return claims;

  const grade = text.match(/\*\*Integrity grade:\s*([A-F])\*\*\s*—\s*([^\n]*)/);
  if (grade) {
    claims.push(claim("integrity_grade", grade[1], "grade", file, grade[0],
      grade[2].trim()));
  }
  const cited = text.match(/^\|\s*Citations\s*\|\s*(\d+)\s*\|/m);
  if (cited) {
    claims.push(claim("citations_total", Number(cited[1]), "citations", file, cited[0]));
  }
  const grounded = text.match(/^\|\s*Grounded in fetched evidence\s*\|\s*(\d+)\s*\((\d+)%\)\s*\|/m);
  if (grounded) {
    claims.push(claim("citations_grounded", Number(grounded[1]), "citations", file, grounded[0],
      "Grounded means the identifier was found in evidence the report actually fetched."));
    claims.push(claim("grounded_ratio_pct", Number(grounded[2]), "percent", file, grounded[0]));
  }
  const unverified = text.match(/^\|\s*Unverified[^|]*\|\s*(\d+)\s*\|/m);
  if (unverified) {
    claims.push(claim("citations_unverified", Number(unverified[1]), "citations", file, unverified[0],
      "These are flagged inline in the report rather than removed."));
  }
  const retracted = text.match(/^\|\s*Retracted\s*\|\s*(\d+)\s*\|/m);
  if (retracted) {
    claims.push(claim("citations_retracted", Number(retracted[1]), "citations", file, retracted[0]));
  }
  return claims;
}

// Format (verified 2026-09-19):
//   ... in **non-small cell lung cancer** that were terminated ...
//   **8 stopped program(s) retrieved.**
//   *NCT00238615 · TERMINATED · Phase PHASE2*
//   Across **5** comparable stopped trial(s) ... a **median of 13** times (max 30).
//   **Amendment-risk: HIGH.**
function parseGraveyardMemo(text, file) {
  const claims = [];
  if (!text) return claims;

  const indication = text.match(/in \*\*([^*]+)\*\* that were terminated/);
  if (indication) {
    claims.push(claim("indication", indication[1].trim(), "text", file, indication[0]));
  }
  const stopped = text.match(/\*\*(\d+)\s+stopped program\(s\) retrieved\.\*\*/);
  if (stopped) {
    claims.push(claim("stopped_programs", Number(stopped[1]), "trials", file, stopped[0],
      "Each resolves to a real ClinicalTrials.gov record."));
  }
  const ncts = Array.from(new Set((text.match(/NCT\d{8}/g) || [])));
  if (ncts.length > 0) {
    claims.push(claim("nct_ids", ncts, "identifiers", file,
      `${ncts.length} distinct NCT identifiers in the memo`,
      "Safe to quote individually — each is a resolvable clinicaltrials.gov/study/<NCT> link."));
  }
  const risk = text.match(/\*\*Amendment-risk:\s*(LOW|MODERATE|HIGH)\.\*\*/);
  if (risk) {
    claims.push(claim("amendment_risk", risk[1], "band", file, risk[0],
      "Bound to the condition query, not the disease as a whole."));
  }
  const median = text.match(/\*\*median of (\d+)\*\* times \(max (\d+)\)/);
  if (median) {
    claims.push(claim("protocol_amendments_median", Number(median[1]), "amendments", file, median[0]));
  }
  return claims;
}

// Format (verified 2026-09-19):
//   **Coverage:** 13 search(es) across 10 source(s) · 81 record(s) retrieved · 2 returned zero.
function parseSearchCoverage(text, file) {
  const claims = [];
  if (!text) return claims;

  const coverage = text.match(
    /\*\*Coverage:\*\*\s*(\d+)\s*search\(es\)\s*across\s*(\d+)\s*source\(s\)\s*·\s*(\d+)\s*record\(s\)\s*retrieved\s*·\s*(\d+)\s*returned zero/
  );
  if (coverage) {
    claims.push(claim("searches_run", Number(coverage[1]), "searches", file, coverage[0]));
    claims.push(claim("sources_queried", Number(coverage[2]), "sources", file, coverage[0]));
    claims.push(claim("records_retrieved", Number(coverage[3]), "records", file, coverage[0]));
    claims.push(claim("zero_result_searches", Number(coverage[4]), "searches", file, coverage[0],
      "An honest zero: the source ran and returned nothing. NOT the same as a failed source."));
  }
  return claims;
}

/**
 * Every figure a post about this bundle may assert.
 * Returns { source_ref, claims, missing, files_read } — `missing` names the deliverables that
 * were absent, so a caller can see why a claim it expected is not here.
 */
function extractClaims(sourceRef) {
  const resolved = resolveSourceDir(sourceRef);
  if (!resolved) {
    const error = new Error(
      `unrecognized source_ref '${sourceRef}' — expected offer-<id> or workflow-<id>`
    );
    error.code = "TRINC_CONTENT_SOURCE_REF_INVALID";
    throw error;
  }
  if (!fs.existsSync(resolved.dir)) {
    const error = new Error(`source '${sourceRef}' not found at ${resolved.dir}`);
    error.code = "TRINC_CONTENT_SOURCE_NOT_FOUND";
    throw error;
  }

  const deliverables = path.join(resolved.dir, "deliverables");
  const wanted = [
    ["citation-integrity.md", parseCitationIntegrity],
    ["graveyard-memo.md", parseGraveyardMemo],
    ["search-coverage.md", parseSearchCoverage]
  ];

  const claims = [];
  const filesRead = [];
  const missing = [];
  for (const [name, parser] of wanted) {
    const full = path.join(deliverables, name);
    const text = readIfPresent(full);
    if (text === null) {
      missing.push(name);
      continue;
    }
    filesRead.push(`deliverables/${name}`);
    claims.push(...parser(text, `deliverables/${name}`));
  }

  return {
    source_ref: sourceRef,
    kind: resolved.kind,
    claims,
    claim_ids: claims.map((entry) => entry.id),
    files_read: filesRead,
    missing_deliverables: missing,
    // Said plainly so a caller never reads an empty result as "nothing to say".
    note: claims.length === 0
      ? "No claims could be extracted. Draft with VERIFY slots only — do not supply figures from memory."
      : "A draft may assert ONLY these values. Anything else must stay a VERIFY slot."
  };
}

module.exports = {
  extractClaims,
  listSources,
  parseCitationIntegrity,
  parseGraveyardMemo,
  parseSearchCoverage,
  resolveSourceDir
};
