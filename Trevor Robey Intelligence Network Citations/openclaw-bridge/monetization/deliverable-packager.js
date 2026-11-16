"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { canonicalize, canonicalJson, safeString, sha256 } = require("../../workflows/governance-automation/common.js");
const {
  extractCitations, deduplicateCitations, countByType, roleLabel, citationKey, groundingKey
} = require("../core/citation-extractor.js");
const { buildIntegrityReport } = require("./integrity-rating.js");
const { renderManifestMarkdown } = require("../core/reproducibility-manifest.js");
const { PHASE21_RELEASE_METADATA_SCHEMA } = require("./publisher-adapter-contract.js");
const { validatePublisherAdapterSnapshot } = require("./publisher-adapter-snapshot-validator.js");
const allowlist = require("../distribution/license-allowlist.js");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeText(filePath, body) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, String(body || ""), "utf8");
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, canonicalJson(canonicalize(value)), "utf8");
}

function hashFile(filePath) {
  return sha256(fs.readFileSync(filePath, "utf8"));
}

function renderCsv(rows) {
  const lines = rows.map((row) => row.map((value) => {
    const normalized = String(value || "");
    return /[,"\n]/.test(normalized) ? `"${normalized.replace(/"/g, "\"\"")}"` : normalized;
  }).join(","));
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

function shortText(value, length = 800) {
  return String(value || "").trim().slice(0, length);
}

// The sample preview's executive summary: whole lines, up to about `limit` characters. A cut is made
// only at a line end, so an identifier is never separated from its [UNVERIFIED] mark (T1-3 puts the
// mark on the identifier's own line, right after it or its link). If the last line end before the
// limit would leave less than half of it, the line that crosses the limit is kept whole instead
// (Tier 1 review, 2026-11-14; a raw 1500-character slice could cut between an id and its mark).
function previewExcerpt(text, limit) {
  const s = String(text || "");
  if (s.length <= limit) return s.trim();
  let cut = s.lastIndexOf("\n", limit);
  if (cut < limit / 2) {
    const end = s.indexOf("\n", limit);
    cut = end < 0 ? s.length : end;
  }
  return s.slice(0, cut).trim();
}

function relativeFrom(baseDir, filePath) {
  return path.relative(baseDir, filePath).split(path.sep).join("/");
}

function asStringArray(value) {
  return Array.isArray(value)
    ? value.map((entry) => safeString(entry)).filter(Boolean).sort((left, right) => left.localeCompare(right))
    : [];
}

function asPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function copyIfExists(sourcePath, targetPath) {
  if (!safeString(sourcePath) || !fs.existsSync(sourcePath)) {
    return false;
  }
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
  return true;
}

// Customer-facing wording per research profile (2026-10-21 business lane). The biomedical strings
// are the original copy, byte-for-byte; the business strings name the sources the business lane
// actually resolves against (citation-reresolver.js hostFor: sec / worldbank / websnapshot / doi).
// A WEB citation is a content hash of a stored page, so its claim is "exactly what was read, from
// this URL, at this time", never "the page is still live" or "the page is correct".
const PROFILE_COPY = Object.freeze({
  biomedical: Object.freeze({
    noRecordIdentifiers: "Citations carry public identifiers (PMID, NCT, PubChem CID, DOI) that resolve in their issuing registries and can be checked directly.",
    // T1-9 (2026-11-14): the registries a cited identifier can actually reach. RxNorm was listed here,
    // but no extractor pattern ever yields an RxNorm id, so nothing is re-resolved against RxNav.
    registries: "PMID → NCBI E-utilities, DOI → Crossref with a doi.org fallback, "
      + "NCT → ClinicalTrials.gov, PubChem CID → PubChem, ChEMBL → ChEMBL, UniProt → UniProt",
    correctnessNote: "Re-resolution confirms an "
      + "identifier resolves to a source record — it does not assess the scientific correctness of the source.",
    sourcesSentence: "peer-reviewed biomedical literature, clinical trial registries, and pharmacological databases",
    drawnFrom: "PubMed, ClinicalTrials.gov, PubChem, UniProt, ChEMBL, and other authoritative sources",
    reviewStep: "1. **Literature Review** — Systematic scan of peer-reviewed sources with citation extraction",
    analysisStep: "2. **Deep Analysis** — Pharmacological, molecular, or safety signal analysis with quantitative data",
    // T1-9: nothing enforces an identifier on every citation, so the bullet says what is true of them.
    identifierBullet: "- Identifiers cited in the report (PMID, NCT number, PubChem CID, DOI) are public records in their issuing registries, and every one is listed in `tables.csv`",
    // Tier 1 review (2026-11-14): a dataset-sourced bundle ships no tables.csv.
    identifierBulletDataset: "- Identifiers cited in the source report (PMID, NCT number, PubChem CID, DOI) are public records in their issuing registries",
    retractionBullet: "- Cited DOIs and PMIDs are retraction-screened (Crossref for DOIs, PubMed for PMIDs, with a DOI→PMID cross-check); any retracted source blocks release",
    // T1-7: the bullet when the screen did not cover every cited DOI and PMID (a count follows).
    retractionBulletPartial: "- Cited DOIs and PMIDs are put through the retraction screen (Crossref for DOIs, PubMed for PMIDs, with a DOI→PMID cross-check); any retracted source found blocks release.",
    dataSourcesIntro: "The pipeline queries the following authoritative biomedical databases:",
    dataSources: Object.freeze([
      "- **PubMed / MEDLINE** — Peer-reviewed biomedical literature (PMID identifiers)",
      "- **PubChem** — Chemical compound properties, bioassay data (CID identifiers)",
      "- **ClinicalTrials.gov** — Clinical trial registries (NCT identifiers)",
      "- **UniProt** — Protein sequence and function (UniProt accession numbers)",
      "- **ChEMBL** — Bioactivity and drug-target interactions (CHEMBL identifiers, cited by ID only)",
      "- **CrossRef / DOI** — Scholarly article resolution (DOI identifiers)"
    ]),
    disclaimer: "This intelligence product is intended for informational and research purposes only. It does not constitute medical advice, investment advice, legal counsel, or regulatory guidance. Independent verification of all findings is recommended before making clinical, commercial, or regulatory decisions."
  }),
  business: Object.freeze({
    noRecordIdentifiers: "Citations carry public identifiers (SEC filing accession, World Bank indicator code, official statistics series id, DOI) or the content hash of the exact web page read (WEB), and can be checked directly.",
    registries: "SEC → SEC EDGAR filing index, WB → World Bank Indicators API, BLS → BLS Public Data API, "
      + "EUROSTAT → Eurostat SDMX dataflow, CENSUS → U.S. Census Bureau API, EIA → EIA API v2, DOI → Crossref with a doi.org fallback, "
      + "WEB → this run's stored page snapshot, re-hashed when the report was assembled",
    correctnessNote: "Re-resolution confirms an "
      + "identifier resolves to a source record — it does not assess the correctness of the source. For WEB citations it confirms "
      + "the stored text is exactly what was read from that URL at retrieval time, not that the page is still live.",
    sourcesSentence: "public company filings, official economic statistics, scholarly literature, and archived web sources",
    drawnFrom: "SEC EDGAR, official statistics agencies (U.S. Bureau of Labor Statistics, Eurostat, the World Bank), OpenAlex / Crossref, and archived web pages",
    reviewStep: "1. **Source Review** — Systematic scan of filings, official statistics, scholarly works and web sources with citation extraction",
    analysisStep: "2. **Deep Analysis** — Cost, market, competitive, or operational analysis with quantitative data",
    identifierBullet: "- Identifiers cited in the report (SEC accession, official statistics series id, World Bank indicator, DOI) are public records, and a WEB identifier is the hash of a stored page snapshot; every cited web page ships in `sources/`",
    identifierBulletDataset: "- Identifiers cited in the source report (SEC accession, official statistics series id, World Bank indicator, DOI) are public records, and a WEB identifier is the hash of a stored page snapshot",
    retractionBullet: "- Cited DOIs are retraction-screened against Crossref; any retracted source blocks release",
    retractionBulletPartial: "- Cited DOIs are put through the Crossref retraction screen; any retracted source found blocks release.",
    dataSourcesIntro: "The pipeline queries the following sources:",
    dataSources: Object.freeze([
      "- **SEC EDGAR** — Public company filings: 10-K, 10-Q, 8-K (SEC accession identifiers)",
      "- **World Bank Indicators** — Official macroeconomic statistics (WB indicator codes)",
      "- **U.S. Bureau of Labor Statistics** — Wages, employment and prices by industry, for U.S. requests (BLS series ids)",
      "- **Eurostat** — Energy prices and labour costs, for European requests (Eurostat dataset codes)",
      "- **OpenAlex / Crossref** — Scholarly and industry research (DOI identifiers)",
      "- **The open web** — Pages read during the run, each stored as a content-addressed snapshot (WEB identifiers) and shipped in `sources/`"
    ]),
    disclaimer: "This intelligence product is intended for informational and research purposes only. It does not constitute investment advice, legal counsel, tax or accounting advice, or regulatory guidance. Independent verification of all findings is recommended before making commercial, financial, or operational decisions."
  })
});

function profileCopy(sourceContext) {
  const id = safeString(asPlainObject(sourceContext).research_profile);
  return PROFILE_COPY[id] || PROFILE_COPY.biomedical;
}

function createDeliverablePackager(options = {}) {
  const rootDir = path.resolve(safeString(options.rootDir) || process.cwd());
  const releasesDir = path.resolve(safeString(options.releasesDir) || path.join(rootDir, "workspace", "releases"));
  const directDeliveryTargets = asPlainObject(asPlainObject(options.directDeliveryTargets).delivery_targets);

  // ── Citation-claim truth source ────────────────────────────────────────────────────────────
  // Customer-facing copy must report the REAL re-resolution outcome, never the raw extraction
  // tally. extractCitations()/deduplicateCitations() count identifiers FOUND IN PROSE by regex;
  // calling that number "verified" is an overclaim (a shipped bundle said "34 verified citations"
  // while its own manifest recorded 29 verified + 5 UNCHECKED). The real verdicts already travel
  // on sourceContext — workflow-engine.js sets source_context.citation_verification, whose
  // reproducibility_manifest.summary carries per-identifier VERIFIED / UNRESOLVED / UNCHECKED.
  //
  // { present:false, gated:false } is the bundle that never went through the research path (dataset
  // bundles, hand-fed source contexts). { present:false, gated:true } can no longer reach rendering
  // (T1-8): writeDeliverables refuses a gated bundle without a manifest, because the engine always
  // attaches one — a fallback when the re-resolution pass crashed.
  function readResolutionSummary(sourceContext) {
    const cv = asPlainObject(asPlainObject(sourceContext).citation_verification);
    // `gated` separates the bundles that carry the citation gate's record from those that never
    // went through the research path at all. renderStoreCopy is called for EVERY bundle, so
    // asserting the gates' guarantees for an ungated one would be a fresh overclaim of exactly the
    // class this module exists to prevent.
    const gated = Object.keys(cv).length > 0;
    const s = asPlainObject(asPlainObject(cv.reproducibility_manifest).summary);
    const counts = asPlainObject(s.counts);
    if (!Number.isFinite(counts.total) || counts.total < 1) return { present: false, gated, byType: {} };
    const num = (v) => (Number.isFinite(v) ? v : 0);
    return {
      present: true,
      gated: true,
      // Tier 1 review (2026-11-14): false for the T1-8 fallback manifest — the pass crashed and no
      // identifier was looked up, so no sentence may say the identifiers were submitted or resolved.
      completed: s.reresolution_completed !== false,
      total: counts.total,
      verified: num(counts.verified),
      unresolved: num(counts.unresolved),
      unchecked: num(counts.unchecked),
      decision: safeString(s.delivery_decision),
      // T1-9: re-resolution runs when the report is assembled, not at delivery; its date is stated.
      asOf: safeString(s.as_of) || "",
      byType: asPlainObject(s.by_type),
      // Attribution check (2026-11-04): cited WORKS (a "PMID: …; doi: …" pair is one) that resolve but
      // carry the wrong author/year in the report, and whether marks actually reached the sections.
      attributionMismatches: (() => {
        const ac = asPlainObject(s.attribution_check);
        const k = asPlainObject(ac.counts);
        if (Number.isFinite(k.mismatched_works) && k.mismatched_works > 0) return k.mismatched_works;
        return Array.isArray(ac.mismatches) ? ac.mismatches.length : 0;
      })(),
      attributionMarked: Number.isFinite(asPlainObject(s.attribution_check).marked_lines)
        && asPlainObject(s.attribution_check).marked_lines > 0
    };
  }

  // T1-7 (2026-11-14): the retraction screen's coverage for THIS bundle. The bundle says
  // "retraction-screened" only when every cited DOI and PMID was screened; otherwise it says how many
  // could not be, and that the integrity ledger names them. `known:false` = a record that predates
  // the coverage fields, so nothing is asserted about coverage either way.
  function readRetractionCoverage(sourceContext) {
    const cv = asPlainObject(asPlainObject(sourceContext).citation_verification);
    if (typeof cv.retraction_screen_checked !== "boolean") return { known: false, complete: false };
    const ids = Array.isArray(cv.unscreened_ids) ? cv.unscreened_ids : [];
    return {
      known: true,
      complete: cv.retraction_screen_checked === true,
      unscreened: Number.isFinite(cv.unscreened) ? cv.unscreened : ids.length,
      cited: Number.isFinite(cv.retraction_screen_cited) ? cv.retraction_screen_cited : null,
      // Tier 1 review: DOIs screened against Crossref alone (their PubMed cross-check reached no verdict).
      crossrefOnly: Number.isFinite(cv.retraction_dois_crossref_only) ? cv.retraction_dois_crossref_only : 0
    };
  }
  function retractionShortfall(coverage) {
    return coverage.known
      ? `For this report ${coverage.unscreened}${coverage.cited !== null ? ` of ${coverage.cited}` : ""} cited DOIs and PMIDs could not be screened; the citation-integrity ledger lists them.`
      : "This bundle's record does not state whether every cited DOI and PMID could be screened.";
  }
  function retractionBulletFor(copy, coverage) {
    const base = coverage.complete ? copy.retractionBullet : `${copy.retractionBulletPartial} ${retractionShortfall(coverage)}`;
    // Tier 1 review (2026-11-14, operator pick D2-wording): the bullet names PubMed, so say which DOIs
    // were screened against Crossref alone.
    const n = coverage.crossrefOnly || 0;
    if (n === 0 || !copy.retractionBullet.includes("PubMed")) return base;
    return `${base}${coverage.complete ? "." : ""} For ${n} cited DOI${n === 1 ? "" : "s"} the PubMed cross-check reached no verdict, so ${n === 1 ? "it was" : "they were"} screened against Crossref alone.`;
  }

  // T1-9: the store copy's gate and retraction bullets, by what this bundle's record says.
  const NO_RECORD_BULLET = "- This bundle carries no citation-verification record: no grounding, retraction-screen, or re-resolution outcome is claimed for it";
  function storeCopyGateBullets(sourceContext, copy, coverage) {
    const cv = asPlainObject(asPlainObject(sourceContext).citation_verification);
    if (Object.keys(cv).length === 0) return [NO_RECORD_BULLET];
    if (cv.pass !== true) return ["- This bundle's citation-verification record did not pass the citation gate, so no grounding, retraction-screen, or re-resolution outcome is claimed for it"];
    if (safeString(asPlainObject(sourceContext).source_kind) === "dataset") {
      return ["- This dataset was built from a research report that passed the citation gate; the gate checked that report's cited identifiers, not each dataset row"];
    }
    return [
      "- **The Zero-Fabrication Guarantee** — every cited identifier is cross-checked at generation time against the evidence retrieved for this report; an identifier not found in that evidence is flagged `[UNVERIFIED]` at every mention and in the citation index, and a report in which fewer than 75% of cited identifiers trace does not ship",
      retractionBulletFor(copy, coverage)
    ];
  }

  // The re-resolution CAPABILITY claim must never be softened to "grounding only" — the
  // per-identifier resolver is built, wired and verified (SYSTEM-REALITY.md §3 carries an explicit
  // copy-sweep warning that doing so is a false understatement). What varies per bundle is the
  // OUTCOME, which is read from the manifest instead of assumed. Claim strength therefore tracks
  // the same counts that produce delivery_decision: all-VERIFIED (DELIVER) reads at full strength,
  // anything else is stated with its real UNCHECKED / UNRESOLVED residue (DELIVER_WITH_FLAGS).
  function renderResolutionSentence(res, copy = PROFILE_COPY.biomedical, opts = {}) {
    // Tier 1 review (2026-11-14): a dataset-sourced bundle carries the source report's record but not
    // its manifest, so it must not point to "the accompanying" one.
    const manifestShips = opts.manifestShips !== false;
    const manifestRef = manifestShips
      ? "the accompanying Reproducibility Manifest"
      : "the source report's Reproducibility Manifest, which this dataset bundle does not include";
    if (res.present && res.completed === false) {
      // The T1-8 fallback: the pass crashed and looked nothing up (its manifest says so too).
      return `${copy.noRecordIdentifiers} Re-resolution did not complete for this bundle: no cited identifier was looked up in its registry, `
        + `and the bundle is not cleared for delivery until the order is re-run. See ${manifestRef}.`;
    }
    if (!res.present) {
      if (!res.gated) {
        // No citation-verification record at all — claim neither gate. Identifiers are still
        // public and independently checkable, which is true of any bundle.
        return `${copy.noRecordIdentifiers} This bundle carries no citation-verification record, so no grounding, retraction-screen, or re-resolution outcome is asserted for it.`;
      }
      // Gated with no usable manifest: unreachable (writeDeliverables refuses it, T1-8). Defensive
      // only, so it asserts nothing either way.
      return `${copy.noRecordIdentifiers} No re-resolution result is recorded for this bundle, so no re-resolution outcome is asserted for it.`;
    }
    // Registries actually dispatched to, per citation-reresolver.js hostFor(). DrugBank is a
    // recognised identifier type but has NO resolver host, and the literal string is banned in
    // shipped content by the license allowlist — finalizeBundle would hard-fail the seal. Never
    // add it to this list.
    const registries = copy.registries;
    const when = `when the report is assembled${res.asOf ? ` (as of ${res.asOf})` : ""}`;
    if (res.decision === "BLOCK") {
      return `Every cited identifier is submitted for independent re-resolution against its issuing public registry (${registries}) ${when}. `
        + `For this report the pass returned a BLOCKING result (${res.unresolved} of ${res.total} UNRESOLVED): this bundle is NOT cleared for delivery. `
        + `See ${manifestRef}.`;
    }
    const residue = [];
    if (res.unchecked > 0) residue.push(`${res.unchecked} returned no definitive answer and are recorded UNCHECKED`);
    if (res.unresolved > 0) residue.push(`${res.unresolved} did not resolve and are recorded UNRESOLVED`);
    // Full strength is gated on DELIVER, not merely on a clean residue: DELIVER is the only
    // decision that asserts "every identifier was re-resolved" (Q8 policy, doctrine-REQUIRED). An
    // attribution flag alone leaves every id VERIFIED, so that fact is stated as such and the flag
    // follows as its own sentence (the mismatches are a subset of the VERIFIED, not extra ids).
    const attributionOnly = res.attributionMismatches > 0 && res.verified === res.total;
    const outcome = residue.length > 0
      ? `For this report ${res.verified} of ${res.total} resolved VERIFIED; ${residue.join("; ")}.`
      : res.decision === "DELIVER" || attributionOnly
        ? `For this report all ${res.total} resolved VERIFIED.`
        : `For this report ${res.verified} of ${res.total} resolved VERIFIED (delivery decision: ${res.decision || "not recorded"}).`;
    let attribution = "";
    if (res.attributionMismatches > 0) {
      const n = res.attributionMismatches;
      attribution = ` Of the VERIFIED, ${n} cited work${n === 1 ? "" : "s"} ${n === 1 ? "carries" : "carry"} an author or year in the report that does not match the registry record`
        + `${res.attributionMarked ? ` and ${n === 1 ? "is" : "are"} marked [ATTRIBUTION MISMATCH] in the report` : ""}.`;
    }
    return `Every cited identifier is submitted for independent re-resolution against its issuing public registry (${registries}) ${when}. ${outcome}${attribution} `
      + `Per-identifier results are recorded in ${manifestRef}. ` + copy.correctnessNote;
  }

  // Per-type breakdown from the manifest when present; a plain cited count otherwise. Never
  // labels an extraction tally "verified".
  function renderTypeBreakdown(type, citedCount, res) {
    const t = asPlainObject(res.byType[type]);
    if (!res.present || !Number.isFinite(t.total)) return `- **${type}**: ${citedCount} cited`;
    const seg = [`${t.total} cited`, `${Number.isFinite(t.verified) ? t.verified : 0} VERIFIED`];
    if (Number.isFinite(t.unchecked) && t.unchecked > 0) seg.push(`${t.unchecked} UNCHECKED`);
    if (Number.isFinite(t.unresolved) && t.unresolved > 0) seg.push(`${t.unresolved} UNRESOLVED`);
    return `- **${type}**: ${seg.join(" · ")}`;
  }

  function renderStoreCopy(offer, sourceContext) {
    const artifacts = Array.isArray(sourceContext.artifacts) ? sourceContext.artifacts : [];
    const allText = artifacts.map((a) => a.output_full || a.output_excerpt || "").join("\n");
    const citations = extractCitations(allText);
    const uniqueCitations = deduplicateCitations(citations);
    const totalChars = artifacts.reduce((sum, a) => sum + (a.output_full || a.output_excerpt || "").length, 0);
    const pageEstimate = Math.max(1, Math.round(totalChars / 2000));
    const productLine = safeString(offer.product_line).replace(/_/g, " ");
    const tierName = safeString(offer.tier);
    const title = safeString(offer.offer_title);
    const resolution = readResolutionSummary(sourceContext);
    const copy = profileCopy(sourceContext);
    const coverage = readRetractionCoverage(sourceContext);
    const webSnapshots = Array.isArray(sourceContext.web_snapshots) ? sourceContext.web_snapshots : [];
    // Tier 1 review (2026-11-14): a dataset-sourced bundle ships the dataset files only (no report,
    // citation index, ledger or manifest), and a bundle whose record did not pass states no gate result.
    const isMission = safeString(sourceContext.source_kind) === "mission";
    const missionPassed = isMission && asPlainObject(sourceContext.citation_verification).pass === true;
    const resolutionTotalsKnown = resolution.present && resolution.completed !== false;

    const lines = [
      `# ${title}`,
      "",
      `**${productLine}** | **${tierName} tier**`,
      "",
      "## Overview",
      "",
      `This intelligence pack delivers citation-backed research synthesized from ${copy.sourcesSentence}. ${renderResolutionSentence(resolution, copy, { manifestShips: isMission })}`,
      "",
      resolutionTotalsKnown
        ? `The report spans **${pageEstimate}+ pages** of original analysis citing **${resolution.total} unique identifiers** (**${resolution.verified}** independently re-resolved VERIFIED) drawn from ${copy.drawnFrom}.`
        : `The report spans **${pageEstimate}+ pages** of original analysis citing **${resolution.present ? resolution.total : uniqueCitations.length} unique identifiers** drawn from ${copy.drawnFrom}.`,
      "",
      "## What's Included",
      "",
      "| File | Description |",
      "| ---- | ----------- |",
      ...(isMission
        ? [
          "| `report.md` | Full research report with literature review, deep analysis, and integrated synthesis |",
          "| `tables.csv` | Citation index with identifier type, source task, context, and whether the identifier was found in the evidence retrieved for this report (`grounded_in_run`) |",
          "| `sample-preview.md` | Executive summary with key findings and citation highlights |",
          "| `evidence-appendix.md` | Source provenance and task-level artifact references |",
          ...(webSnapshots.length > 0 ? ["| `sources/` | The exact text of every cited web page, as read at retrieval time (one file per WEB identifier) |"] : [])
        ]
        : [
          "| `dataset.jsonl` | The dataset rows |",
          "| `schema.json` | The dataset's schema |",
          "| `dataset-card.md` | What the dataset covers, where its rows come from, and its limits |",
          "| `build-report.json` | How the dataset was built |",
          "| `sample-preview.jsonl` | The first rows of the dataset |",
          "| other `*-report.json` and `provenance.json` files | Validation, de-duplication, quality, licence and provenance records, when the build produced them |"
        ]),
      "",
      "## Research Methodology",
      "",
      "Each report is produced through a multi-agent research pipeline:",
      "",
      copy.reviewStep,
      copy.analysisStep,
      // T1-9 (2026-11-14): no cross-validation module exists, and the evidence ledger is not
      // chain-hashed; the bundle's real integrity mechanism is its per-file SHA-256 seal.
      "3. **Integrated Synthesis** — The sections combined into one report, with citation-density scoring",
      "",
      // Tier 1 review: only for a research bundle whose record passed; Provenance & Trust below states
      // what any other bundle's record says.
      ...(missionPassed
        ? ["Every report passes the citation gate (each cited identifier checked against the evidence retrieved for the report) before release, and each workflow template adds a citation-density audit that a report must also pass.", ""]
        : []),
      "## Provenance & Trust",
      "",
      isMission ? copy.identifierBullet : copy.identifierBulletDataset,
      "- Every file in this bundle is listed with its SHA-256 checksum in checksums.txt and manifest.json",
      // Retired 2026-07-13 (OFFERINGS.md, commit 7801443): the absolute "Zero hallucination
      // architecture — claims without citations are flagged and excluded" claim overstated twice
      // over. Ungrounded identifiers are NOT excluded: citation-gate.js annotateSubtaskOutputs
      // marks them [UNVERIFIED] inline and they SHIP ("honesty over completeness"). Do not
      // reintroduce an absolute no-hallucination claim here.
      // Gate-dependent: these two bullets describe the citation gate and the retraction screen.
      // A bundle with no citation-verification record never ran either, so claiming them there
      // would reintroduce the overclaim at a different line. T1-9 (2026-11-14): they print only for
      // a record that PASSED, and a dataset-sourced bundle says what the gate did and did not check
      // (it checked the source report's identifiers, not the dataset's rows). "Never presented as
      // fact" is dropped (operator default D4): an untraced identifier's sentence still ships, flagged.
      ...storeCopyGateBullets(sourceContext, copy, coverage),
      ""
    ];

    if (uniqueCitations.length > 0) {
      const byType = {};
      for (const c of uniqueCitations) {
        if (!byType[c.type]) byType[c.type] = [];
        byType[c.type].push(c.id);
      }
      lines.push("## Citation Breakdown");
      lines.push("");
      // When a manifest exists, drive the table off ITS types so the rows reconcile with the
      // total stated above. The manifest is built from the assembled report; `byType` here is
      // this module's own extraction over artifact text — different corpora, so a manifest type
      // missing from the extraction would otherwise be silently dropped from the table.
      const breakdownTypes = resolution.present
        ? Object.keys(resolution.byType).sort((a, b) => a.localeCompare(b))
        : Object.keys(byType).sort((a, b) => a.localeCompare(b));
      for (const type of breakdownTypes) {
        lines.push(renderTypeBreakdown(type, (byType[type] || []).length, resolution));
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  // T1-3 (2026-11-14): the citation gate's untraced identifiers as upper-cased TYPE:ID keys, so the
  // Citation Summary, the sample preview and tables.csv flag them like the report text does. null when
  // the bundle carries no gate record (nothing can be said either way, so nothing is marked "yes").
  function readUntracedKeys(sourceContext) {
    const cv = asPlainObject(asPlainObject(sourceContext).citation_verification);
    const list = Array.isArray(cv.ungrounded_ids) ? cv.ungrounded_ids
      : Array.isArray(cv.ungrounded_sample) ? cv.ungrounded_sample : null;
    return list ? new Set(list.map((s) => String(s).toUpperCase())) : null;
  }
  function flagIfUntraced(c, untraced) {
    return untraced && untraced.has(groundingKey(c)) ? `${c.id} [UNVERIFIED]` : c.id;
  }

  function renderResearchReport(offer, sourceContext) {
    const artifacts = Array.isArray(sourceContext.artifacts) ? sourceContext.artifacts : [];
    const allText = artifacts.map((a) => a.output_full || a.output_excerpt || "").join("\n");
    const citations = extractCitations(allText);
    const uniqueCitations = deduplicateCitations(citations);
    const reportResolution = readResolutionSummary(sourceContext);
    const untraced = readUntracedKeys(sourceContext);

    const lines = [
      `# ${safeString(offer.offer_title)}`,
      "",
      `**Product Line**: ${safeString(offer.product_line).replace(/_/g, " ")}`,
      `**Tier**: ${safeString(offer.tier)}`,
      `**Source**: ${safeString(sourceContext.source_id)}`,
      // report.md is the PRIMARY deliverable. This header labelled the regex extraction tally
      // "Verified Citations" — the shipped bundle read 34 while its manifest said 29 VERIFIED.
      `**Citations**: ${reportResolution.present
        ? `${reportResolution.total} cited · ${reportResolution.verified} VERIFIED · ${reportResolution.unresolved} UNRESOLVED · ${reportResolution.unchecked} UNCHECKED when this report was assembled${reportResolution.asOf ? ` (as of ${reportResolution.asOf})` : ""}`
        : `${uniqueCitations.length} cited identifiers`}`,
      `**Generated**: ${safeString(sourceContext.created_at).split("T")[0] || "N/A"}`,
      "",
      "---",
      "",
      "## Table of Contents",
      ""
    ];

    for (let i = 0; i < artifacts.length; i++) {
      const label = roleLabel(artifacts[i].task_id);
      lines.push(`${i + 1}. [${label}](#section-${i + 1})`);
    }
    lines.push(`${artifacts.length + 1}. [Citation Summary](#citation-summary)`);
    lines.push("");
    lines.push("---");
    lines.push("");

    for (let i = 0; i < artifacts.length; i++) {
      const artifact = artifacts[i];
      const label = roleLabel(artifact.task_id);
      const content = artifact.output_full || artifact.output_excerpt || "No output available.";
      lines.push(`<a id="section-${i + 1}"></a>`);
      lines.push(`## ${i + 1}. ${label}`);
      lines.push("");
      lines.push(`*Task: ${safeString(artifact.task_id)}*`);
      lines.push("");
      lines.push(content.trim());
      lines.push("");
      lines.push("---");
      lines.push("");
    }

    lines.push('<a id="citation-summary"></a>');
    lines.push(`## ${artifacts.length + 1}. Citation Summary`);
    lines.push("");
    // "cited", not "verified" — this is the regex extraction tally. The verified figure comes
    // from the re-resolution manifest and is only stated when that manifest exists.
    lines.push(`Total cited identifiers: **${uniqueCitations.length}**`);
    if (reportResolution.present) {
      lines.push("");
      lines.push(`Independently re-resolved when this report was assembled${reportResolution.asOf ? ` (as of ${reportResolution.asOf})` : ""}: **${reportResolution.verified} VERIFIED** of ${reportResolution.total}`
        + `${reportResolution.unchecked > 0 ? ` · ${reportResolution.unchecked} UNCHECKED` : ""}`
        + `${reportResolution.unresolved > 0 ? ` · ${reportResolution.unresolved} UNRESOLVED` : ""}`
        + `${reportResolution.attributionMismatches > 0
          ? ` · ${reportResolution.attributionMismatches} cited work${reportResolution.attributionMismatches === 1 ? "" : "s"} with an author/year that does not match the registry (see the Reproducibility Manifest)`
          : ""}`);
    }
    lines.push("");

    const byType = {};
    for (const c of uniqueCitations) {
      if (!byType[c.type]) byType[c.type] = [];
      byType[c.type].push(flagIfUntraced(c, untraced));
    }
    for (const [type, ids] of Object.entries(byType).sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`- **${type}** (${ids.length}): ${ids.slice(0, 10).join(", ")}${ids.length > 10 ? `, ... (+${ids.length - 10} more)` : ""}`);
    }
    lines.push("");

    return `${lines.join("\n")}\n`;
  }

  function renderMethodologyStatement(offer, sourceContext) {
    const artifacts = Array.isArray(sourceContext.artifacts) ? sourceContext.artifacts : [];
    const allText = artifacts.map((a) => a.output_full || a.output_excerpt || "").join("\n");
    const citations = extractCitations(allText);
    const uniqueCitations = deduplicateCitations(citations);
    const byType = {};
    for (const c of uniqueCitations) {
      if (!byType[c.type]) byType[c.type] = 0;
      byType[c.type]++;
    }
    const agentRoles = artifacts.map((a) => `- **${roleLabel(a.task_id)}** (${safeString(a.task_id)})`);
    const copy = profileCopy(sourceContext);
    // Tier 1 review (2026-11-14): the gate lines describe a research report that passed the gate; a
    // dataset-sourced bundle or one without a passing record says what was and was not checked.
    const isMission = safeString(sourceContext.source_kind) === "mission";
    const gatePassed = asPlainObject(sourceContext.citation_verification).pass === true;
    const gateLine = isMission && gatePassed
      ? "Each agent works on the records retrieved for its role; every identifier the finished report cites is then checked against the records retrieved for this report (the citation gate below)."
      : !isMission && gatePassed
        ? "Each agent works on the records retrieved for its role. The identifiers the source report cites were checked against the records retrieved for it; this dataset's rows were not checked one by one."
        : "Each agent works on the records retrieved for its role. This bundle carries no passing citation-gate record, so no grounding result is stated for it.";

    return [
      `# Methodology Statement`,
      "",
      `**Offer**: ${safeString(offer.offer_title)}`,
      `**Product Line**: ${safeString(offer.product_line).replace(/_/g, " ")}`,
      `**Tier**: ${safeString(offer.tier)}`,
      `**Generated**: ${safeString(sourceContext.created_at).split("T")[0] || "N/A"}`,
      "",
      "---",
      "",
      "## Multi-Agent Research Pipeline",
      "",
      // T1-9 (2026-11-14): role calls are unseeded model calls, so the pipeline is not deterministic,
      // and no cross-validation step exists; the citation gate below is what checks the output.
      "This intelligence product is synthesized through a multi-agent pipeline in which each agent role contributes a distinct research phase:",
      "",
      ...agentRoles,
      "",
      gateLine,
      "",
      "## Data Sources",
      "",
      copy.dataSourcesIntro,
      "",
      ...copy.dataSources,
      "",
      "## Citation Verification Methodology",
      "",
      "Citations are extracted from agent outputs using deterministic regex patterns matching known identifier formats. Each citation is deduplicated by type and identifier, then indexed with its source task and surrounding context.",
      "",
      `This report contains **${uniqueCitations.length} unique cited identifiers** distributed across the following types:`,
      "",
      ...Object.entries(byType).sort(([a], [b]) => a.localeCompare(b)).map(([type, count]) => `- **${type}**: ${count}`),
      "",
      "## Quality Audit",
      "",
      "All outputs pass automated quality auditing before release:",
      "",
      // T1-9: the rule the quality audit actually applies (workflow-engine.js executeQualityAuditStep).
      "- **Citation density threshold**: a share of the report's content lines, set by the workflow template, must carry a citation-shaped reference, and there must be at least 5 such lines",
      ...(isMission && gatePassed
        ? ["- **Cross-reference verification (grounding)**: every identifier cited in the report is checked against the records retrieved for this report — the truth-based gate, graded in the Citation Integrity ledger (grounded_ratio)."]
        : []),
      "- **Citation-density score**: a separate, shape-based heuristic — the fraction of content lines carrying a citation-shaped reference. It measures how citation-dense the writing is, NOT whether the identifiers were verified (that is the citation gate's job, not this score's).",
      "- **Quality gate**: a report below the citation-density threshold does not ship.",
      "",
      // T1-9: this was a "Provenance Chain" with a per-record link to the preceding record. The bundle
      // has no such chain; what it has is the flat per-file SHA-256 seal finalizeBundle writes.
      "## Bundle Seal",
      "",
      "Every file in this bundle is listed in manifest.json and checksums.txt with the SHA-256 checksum of its content, written when the bundle is sealed. The seal files themselves, and the approval and delivery records added after sealing, are not listed.",
      "",
      "A file changed after sealing no longer matches its checksum, and the buyer ZIP refuses a changed file.",
      "",
      "## Disclaimer",
      "",
      copy.disclaimer,
      ""
    ].join("\n");
  }

  function renderSchemaDefinition(offer, sourceContext) {
    const artifacts = Array.isArray(sourceContext.artifacts) ? sourceContext.artifacts : [];
    const allText = artifacts.map((a) => a.output_full || a.output_excerpt || "").join("\n");
    const citations = extractCitations(allText);
    const uniqueCitations = deduplicateCitations(citations);
    // Q37: parity with the AWS-DX path (aws-data-exchange-format-adapter.js). The PRIMARY manual-ZIP
    // path — which ships the highest-value SKUs — previously checked only citation TYPES here, so a
    // bare prose "DrugBank" mention or a DB##### id in the report body slipped through. assertShippable
    // adds the full-text scan (assertNoBannedContent over the report content) alongside the
    // citation-type check; fail-closed (throws LicenseComplianceError) so a non-compliant bundle
    // cannot ship. `allText` is the same artifact-output content report.md is assembled from.
    allowlist.assertShippable({ citations: uniqueCitations, text: allText });
    const sampleCitation = uniqueCitations[0] || { type: "PMID", id: "00000000" };

    return canonicalize({
      schema_version: "openclaw-research-output-v1",
      offer_id: safeString(offer.offer_id),
      product_line: safeString(offer.product_line),
      tier: safeString(offer.tier),
      output_formats: {
        report: {
          format: "markdown",
          file: "report.md",
          description: "Full multi-section research report with embedded citations"
        },
        // Tier 1 review (2026-11-14): all five tables.csv columns, grounded_in_run included (T1-3).
        citation_index: {
          format: "csv",
          file: "tables.csv",
          description: "Citation index with type, identifier, source task, context, and whether the identifier was found in the evidence retrieved for this report",
          columns: [
            { name: "citation_type", type: "string", description: "Identifier type as the engine names it (for example PMID, NCT, PubChem CID, DOI, UniProt)", nullable: false },
            { name: "identifier", type: "string", description: "The citation identifier value", nullable: false },
            { name: "source_task", type: "string", description: "Agent task ID that produced this citation", nullable: false },
            { name: "context_snippet", type: "string", description: "Surrounding text context for the citation", nullable: true },
            { name: "grounded_in_run", type: "string", description: "yes: the citation gate found this identifier in the evidence retrieved for this report; no: it did not, and the report flags it [UNVERIFIED]; unknown: the bundle carries no gate record", nullable: false }
          ],
          example_record: {
            citation_type: sampleCitation.type,
            identifier: sampleCitation.id,
            source_task: "literature_reviewer",
            context_snippet: "...surrounding text context...",
            grounded_in_run: "yes"
          }
        },
        executive_summary: {
          format: "markdown",
          file: "sample-preview.md",
          description: "Executive summary with key findings and sample citations"
        },
        evidence_appendix: {
          format: "markdown",
          file: "evidence-appendix.md",
          description: "Source provenance and task-level artifact references"
        },
        methodology_statement: {
          format: "markdown",
          file: "methodology-statement.md",
          description: "Research pipeline methodology, data sources, and quality audit criteria"
        }
      },
      // Tier 1 review (2026-11-14): the "structured_json_payload" entry described a findings payload
      // "available via API" with "Chain hash" provenance. The bundle holds no such file, no research API
      // is deployed and nothing is chain-hashed, so the entry is gone; the bundle's integrity record is
      // its per-file SHA-256 seal (manifest.json and checksums.txt).
      bundle_seal: {
        description: "Every file in this bundle is listed in manifest.json and checksums.txt with the SHA-256 checksum of its content, written when the bundle is sealed"
      },
      statistics: {
        total_citations: uniqueCitations.length,
        agent_roles: artifacts.map((a) => roleLabel(a.task_id)),
        sections: artifacts.length
      }
    });
  }

  function renderEvidenceAppendix(sourceContext) {
    const lines = [
      "# Evidence Appendix",
      "",
      "Source task outputs included in this manual-only package:",
      ""
    ];
    for (const artifact of Array.isArray(sourceContext.artifacts) ? sourceContext.artifacts : []) {
      lines.push(`- ${safeString(artifact.task_id)} :: ${safeString(artifact.output_rel)}`);
    }
    lines.push("");
    return `${lines.join("\n")}\n`;
  }

  function renderDatasetCard(offer, sourceContext) {
    const phase20 = sourceContext.phase20_status || {};
    const warnings = Array.isArray(sourceContext.warnings) ? sourceContext.warnings : [];
    return [
      `# ${safeString(offer.offer_title)}`,
      "",
      "This dataset card is generated for manual review and manual submission only.",
      "",
      `Dataset ID: ${safeString(sourceContext.source_id)}`,
      `Build ID: ${safeString(sourceContext.build_id)}`,
      `Dataset Type: ${safeString(sourceContext.metadata.dataset_type)}`,
      `Rows: ${String(sourceContext.metadata.row_count || 0)}`,
      `Validation status: ${safeString(phase20.validation_status) || "failed"}`,
      `Quality status: ${safeString(phase20.quality_status) || "failed"}`,
      `License state: ${safeString(phase20.license_state) || "blocked"}`,
      `Commercialization ready: ${phase20.commercialization_ready === true ? "true" : "false"}`,
      "",
      "## Intended Use",
      "Prepared for deterministic local packaging and manual review before any external submission.",
      "",
      "## Limitations",
      phase20.license_state === "review_required"
        ? "This build requires manual legal/commercial review before any external listing or distribution."
        : "External publication and submission remain manual-only.",
      "",
      "## Provenance",
      "Row-level provenance is included in the packaged provenance artifact.",
      "",
      "## Licensing",
      `Current deterministic license review state: ${safeString(phase20.license_state) || "blocked"}.`,
      ...(warnings.length > 0 ? ["", "## Warnings", ...warnings.map((entry) => `- ${entry}`)] : []),
      ""
    ].join("\n");
  }

  function renderPrivateDeliveryNote(offer) {
    return [
      "# Private Delivery Note",
      "",
      `Offer ${safeString(offer.offer_id)} is prepared for manual-only delivery or manual-only listing review.`,
      "",
      "No external publication or submission has occurred as part of this package build.",
      ""
    ].join("\n");
  }

  function renderDeliveryChecklist(targetName, definition = {}) {
    const requirements = asStringArray(definition.checklist_requirements);
    return [
      `# Delivery Checklist: ${targetName}`,
      "",
      "Manual-only direct delivery steps:",
      ...requirements.map((entry) => `- ${entry}`),
      "",
      "No browser/login automation or outbound delivery automation is performed by this repository.",
      ""
    ].join("\n");
  }

  function renderDeliveryHandoffNote(offer, targetName) {
    return [
      `# Delivery Handoff: ${targetName}`,
      "",
      `Offer ${safeString(offer.offer_id)} is packaged for manual-only direct delivery.`,
      "",
      "Operator action is required for external handoff.",
      ""
    ].join("\n");
  }

  function createBundleWorkspace(offerId) {
    ensureDir(releasesDir);
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-phase19-release-"));
    const tempBundleDir = path.join(tempRoot, offerId);
    ensureDir(tempBundleDir);
    return tempBundleDir;
  }

  function writeDeliverables(bundleDir, offer, sourceContext) {
    // T1-8 (2026-11-14): a gated bundle (it carries the citation gate's record) must carry its
    // re-resolution manifest. The engine always attaches one — a fallback, with every id UNCHECKED and
    // reresolution_completed:false, when the pass crashed — so a gate record without one means the
    // manifest was lost on the way. Refused before any file is written. (Sealed release
    // offer-bcaf2746298f5280fde747f0 shipped with no manifest before this.)
    const gateRecord = asPlainObject(asPlainObject(sourceContext).citation_verification);
    if (Object.keys(gateRecord).length > 0
      && Object.keys(asPlainObject(asPlainObject(gateRecord.reproducibility_manifest).summary)).length === 0) {
      const error = new Error("citation_verification is present but carries no reproducibility manifest; a gated bundle is never packaged without one");
      error.code = "PHASE19_RERESOLUTION_MANIFEST_MISSING";
      throw error;
    }
    const deliverablesDir = path.join(bundleDir, "deliverables");
    ensureDir(deliverablesDir);
    const artifactRefs = {};

    if (safeString(sourceContext.source_kind) === "mission") {
      // Q37: license shipment gate FIRST on the PRIMARY research path (report.md — the highest-value
      // SKUs). This branch previously had NO DrugBank / ChEMBL-activity screen at all; only the dataset
      // branch's schema render did. Fail-closed FULL scan (citation types + the full report text, so a
      // bare prose "DrugBank" mention or a DB##### id is caught, not just typed citations) — a
      // non-compliant research bundle cannot ship. Runs before any deliverable is written. Mirrors the
      // AWS-DX path (aws-data-exchange-format-adapter.js).
      const licenseScanText = (Array.isArray(sourceContext.artifacts) ? sourceContext.artifacts : [])
        .map((a) => a.output_full || a.output_excerpt || "").join("\n");
      allowlist.assertShippable({
        citations: deduplicateCitations(extractCitations(licenseScanText)),
        text: licenseScanText
      });

      const reportPath = path.join(deliverablesDir, "report.md");
      const appendixPath = path.join(deliverablesDir, "evidence-appendix.md");
      const tablesPath = path.join(deliverablesDir, "tables.csv");
      const previewPath = path.join(deliverablesDir, "sample-preview.md");
      writeText(reportPath, renderResearchReport(offer, sourceContext));
      writeText(appendixPath, renderEvidenceAppendix(sourceContext));
      const allArtifacts = Array.isArray(sourceContext.artifacts) ? sourceContext.artifacts : [];
      const allCitationText = allArtifacts.map((a) => a.output_full || a.output_excerpt || "").join("\n");
      const allCitations = extractCitations(allCitationText);
      // T1-3: grounded_in_run says whether the citation gate traced the identifier to evidence this run
      // retrieved ("yes"), flagged it [UNVERIFIED] ("no"), or the bundle has no gate record ("unknown").
      const untraced = readUntracedKeys(sourceContext);
      const csvRows = [["citation_type", "identifier", "source_task", "context_snippet", "grounded_in_run"]];
      const seen = new Set();
      for (const artifact of allArtifacts) {
        const text = artifact.output_full || artifact.output_excerpt || "";
        const taskCitations = extractCitations(text);
        for (const c of taskCitations) {
          const key = citationKey(c);
          if (seen.has(key)) continue;
          seen.add(key);
          const idx = text.indexOf(c.id);
          const snippet = idx >= 0 ? text.slice(Math.max(0, idx - 40), idx + c.id.length + 40).replace(/\n/g, " ").trim() : "";
          const grounded = untraced ? (untraced.has(groundingKey(c)) ? "no" : "yes") : "unknown";
          csvRows.push([c.type, c.id, safeString(artifact.task_id), snippet, grounded]);
        }
      }
      writeText(tablesPath, renderCsv(csvRows));

      const uniqueAllCitations = deduplicateCitations(allCitations);
      const synthArtifact = allArtifacts.find((a) => roleLabel(a.task_id) === "Integrated Synthesis") || allArtifacts[allArtifacts.length - 1];
      const synthText = synthArtifact ? (synthArtifact.output_full || synthArtifact.output_excerpt || "") : "";
      const execSummary = previewExcerpt(synthText, 1500);
      const sampleCitations = uniqueAllCitations.slice(0, 5);
      const previewLines = [
        `# ${safeString(offer.offer_title)} — Executive Summary`,
        "",
        execSummary,
        "",
        "---",
        "",
        "## Sample Citations",
        "",
        ...sampleCitations.map((c) => `- **${c.type}**: ${flagIfUntraced(c, untraced)}`),
        "",
        "## Full Report Contents",
        "",
        ...allArtifacts.map((a, i) => `${i + 1}. ${roleLabel(a.task_id)}`),
        "",
        "---",
        "",
        `> Full report cites **${uniqueAllCitations.length} unique identifiers** across **${Math.max(1, Math.round(allCitationText.length / 2000))} pages** of original analysis.`,
        ""
      ];
      writeText(previewPath, previewLines.join("\n"));
      artifactRefs.primary_deliverable = relativeFrom(bundleDir, reportPath);
      artifactRefs.structured_support = relativeFrom(bundleDir, tablesPath);
      artifactRefs.supporting_appendix = relativeFrom(bundleDir, appendixPath);
      // Slice 3: the Citation Integrity & Provenance ledger — the deliverable's audit-trail
      // artifact, built deterministically from the citation gate's verification (the product spine).
      if (sourceContext.citation_verification) {
        const integrityPath = path.join(deliverablesDir, "citation-integrity.md");
        writeText(integrityPath, buildIntegrityReport(sourceContext.citation_verification, sourceContext.section_coverage).markdown);
        artifactRefs.citation_integrity = relativeFrom(bundleDir, integrityPath);
        // Reproducibility Manifest — per-citation live re-resolution result, shipped beside the
        // integrity ledger so a subscriber can re-run the listed URLs and reproduce the verdicts.
        const rm = sourceContext.citation_verification.reproducibility_manifest;
        if (rm && rm.summary) {
          const rmJsonPath = path.join(deliverablesDir, "reproducibility-manifest.json");
          const rmMdPath = path.join(deliverablesDir, "reproducibility-manifest.md");
          writeText(rmJsonPath, JSON.stringify(rm, null, 2));
          writeText(rmMdPath, renderManifestMarkdown(rm));
          artifactRefs.reproducibility_manifest = relativeFrom(bundleDir, rmMdPath);
        }
      }
      // Slice 3 v2: the structured kill-memo — prior terminated programs (graveyard) + the
      // protocol amendment-risk signal, rendered upstream from NCT-traced CT.gov records. A
      // cost-AVOIDANCE deliverable; only present when stopped trials were retrieved for the indication.
      if (sourceContext.graveyard_memo && safeString(sourceContext.graveyard_memo.markdown)) {
        const graveyardPath = path.join(deliverablesDir, "graveyard-memo.md");
        const amendmentMd = sourceContext.amendment_risk && safeString(sourceContext.amendment_risk.markdown)
          ? "\n" + sourceContext.amendment_risk.markdown : "";
        writeText(graveyardPath, sourceContext.graveyard_memo.markdown + amendmentMd);
        artifactRefs.graveyard_memo = relativeFrom(bundleDir, graveyardPath);
      }
      // Slice 5 (Q5): the Search-Coverage Ledger — the honest-zero deliverable, rendered
      // deterministically from the runtime per-search outcomes (no LLM). Present whenever real
      // searches ran; an all-zero run still ships it as the truthful "here is exactly what each
      // source returned, including the zeros" record that the never-hallucinate doctrine requires.
      if (sourceContext.search_coverage_ledger && safeString(sourceContext.search_coverage_ledger.markdown)) {
        const coveragePath = path.join(deliverablesDir, "search-coverage.md");
        writeText(coveragePath, sourceContext.search_coverage_ledger.markdown);
        artifactRefs.search_coverage = relativeFrom(bundleDir, coveragePath);
      }
      // Trial Design Benchmark Pack: the comparative Phase 3 structure matrix, rendered upstream
      // from NCT-traced CT.gov records (no LLM), plus its machine-readable CSV twin. Present only
      // when a cohort was actually retrieved — an empty cohort ships nothing rather than an empty
      // table. finalizeBundle walks the directory, so writing the files here is the whole
      // registration: both are hashed into manifest.json and sealed in checksums.txt automatically.
      if (sourceContext.design_benchmark && safeString(sourceContext.design_benchmark.markdown)) {
        const benchPath = path.join(deliverablesDir, "design-benchmark.md");
        writeText(benchPath, sourceContext.design_benchmark.markdown);
        artifactRefs.design_benchmark = relativeFrom(bundleDir, benchPath);
        if (safeString(sourceContext.design_benchmark.csv)) {
          const benchCsvPath = path.join(deliverablesDir, "design-benchmark.csv");
          writeText(benchCsvPath, sourceContext.design_benchmark.csv);
          artifactRefs.design_benchmark_csv = relativeFrom(bundleDir, benchCsvPath);
        }
      }
      // Business lane: ship the exact text of every cited web page (WEB snapshots that re-hashed
      // cleanly upstream) so a buyer can read each source. A snapshot whose text trips the license
      // scan is left out and named in the index instead of failing the whole seal.
      const webSnapshots = Array.isArray(sourceContext.web_snapshots) ? sourceContext.web_snapshots : [];
      if (webSnapshots.length > 0) {
        const sourcesDir = path.join(deliverablesDir, "sources");
        const indexLines = [
          "# Web Sources",
          "",
          "Each file is the exact text read from the URL at retrieval time. Its WEB identifier is the first 12 hex",
          "characters of sha256(url + newline + text), so anyone can re-hash the stored text to confirm it is unaltered.",
          "A snapshot shows what the page said when it was read, not that the page is still live or correct.",
          "",
          "| WEB id | Retrieved | URL |",
          "| ------ | --------- | --- |"
        ];
        const withheld = [];
        for (const snap of webSnapshots) {
          const id = safeString(snap.id);
          if (!/^[0-9a-f]{12}$/.test(id)) continue;
          const body = [
            `# WEB: ${id}`,
            "",
            `- URL: ${safeString(snap.url)}`,
            ...(safeString(snap.title) ? [`- Title: ${safeString(snap.title)}`] : []),
            `- Retrieved: ${safeString(snap.retrieved_at) || "not recorded"}`,
            `- sha256: ${safeString(snap.sha256)}`,
            "",
            "---",
            "",
            String(snap.text || ""),
            ""
          ].join("\n");
          try {
            allowlist.assertNoBannedContent(body);
          } catch {
            withheld.push(id);
            continue;
          }
          writeText(path.join(sourcesDir, `WEB-${id}.md`), body);
          indexLines.push(`| ${id} | ${safeString(snap.retrieved_at) || "n/a"} | ${safeString(snap.url)} |`);
        }
        if (withheld.length > 0) {
          indexLines.push("", `Withheld by the license screen (cited, but not redistributable here): ${withheld.join(", ")}`);
        }
        indexLines.push("");
        const indexPath = path.join(sourcesDir, "index.md");
        writeText(indexPath, indexLines.join("\n"));
        artifactRefs.web_sources = relativeFrom(bundleDir, indexPath);
      }
      artifactRefs.sample_preview = relativeFrom(bundleDir, previewPath);

    } else {
      const datasetPath = path.join(deliverablesDir, "dataset.jsonl");
      const schemaPath = path.join(deliverablesDir, "schema.json");
      const buildReportPath = path.join(deliverablesDir, "build-report.json");
      const validationReportPath = path.join(deliverablesDir, "validation-report.json");
      const dedupeReportPath = path.join(deliverablesDir, "dedupe-report.json");
      const provenancePath = path.join(deliverablesDir, "provenance.json");
      const qualityReportPath = path.join(deliverablesDir, "quality-report.json");
      const licenseReportPath = path.join(deliverablesDir, "license-report.json");
      const cardPath = path.join(deliverablesDir, "dataset-card.md");
      const previewPath = path.join(deliverablesDir, "sample-preview.jsonl");
      fs.copyFileSync(sourceContext.dataset_path, datasetPath);
      fs.copyFileSync(sourceContext.schema_path, schemaPath);
      fs.copyFileSync(sourceContext.build_report_path, buildReportPath);
      copyIfExists(sourceContext.validation_report_path, validationReportPath);
      copyIfExists(sourceContext.dedupe_report_path, dedupeReportPath);
      copyIfExists(sourceContext.provenance_path, provenancePath);
      copyIfExists(sourceContext.quality_report_path, qualityReportPath);
      copyIfExists(sourceContext.license_report_path, licenseReportPath);
      writeText(cardPath, renderDatasetCard(offer, sourceContext));
      const previewLines = fs.readFileSync(sourceContext.dataset_path, "utf8").split("\n").filter(Boolean).slice(0, 5).join("\n");
      writeText(previewPath, previewLines ? `${previewLines}\n` : "");
      artifactRefs.primary_deliverable = relativeFrom(bundleDir, datasetPath);
      artifactRefs.structured_support = relativeFrom(bundleDir, schemaPath);
      artifactRefs.supporting_appendix = relativeFrom(bundleDir, cardPath);
      artifactRefs.sample_preview = relativeFrom(bundleDir, previewPath);
      artifactRefs.build_report = relativeFrom(bundleDir, buildReportPath);
      if (fs.existsSync(validationReportPath)) {
        artifactRefs.validation_report = relativeFrom(bundleDir, validationReportPath);
      }
      if (fs.existsSync(dedupeReportPath)) {
        artifactRefs.dedupe_report = relativeFrom(bundleDir, dedupeReportPath);
      }
      if (fs.existsSync(provenancePath)) {
        artifactRefs.provenance = relativeFrom(bundleDir, provenancePath);
      }
      if (fs.existsSync(qualityReportPath)) {
        artifactRefs.quality_report = relativeFrom(bundleDir, qualityReportPath);
      }
      if (fs.existsSync(licenseReportPath)) {
        artifactRefs.license_report = relativeFrom(bundleDir, licenseReportPath);
      }
    }

    const tierLower = safeString(offer.tier).toLowerCase();
    if (tierLower === "premium" || tierLower === "enterprise") {
      const methodologyPath = path.join(deliverablesDir, "methodology-statement.md");
      const schemaDefPath = path.join(deliverablesDir, "schema-definition.json");
      writeText(methodologyPath, renderMethodologyStatement(offer, sourceContext));
      artifactRefs.methodology_statement = relativeFrom(bundleDir, methodologyPath);
      // Always rendered, because rendering runs the licence scan (Q37). Written only for a research
      // bundle: it defines report.md, tables.csv and the other research files, which a dataset-sourced
      // bundle does not have (it ships its own schema.json; Tier 1 review, 2026-11-14).
      const schemaDefinition = renderSchemaDefinition(offer, sourceContext);
      if (safeString(sourceContext.source_kind) === "mission") {
        writeJson(schemaDefPath, schemaDefinition);
        artifactRefs.schema_definition = relativeFrom(bundleDir, schemaDefPath);
      } else {
        // The premium and enterprise tiers require a schema_definition slot (config/monetization-map.json);
        // a dataset bundle's own schema.json IS its field definition, so the slot points there.
        artifactRefs.schema_definition = artifactRefs.structured_support;
      }
    }

    const storeCopyPath = path.join(deliverablesDir, "store-copy.md");
    const submissionMetadataPath = path.join(deliverablesDir, "submission-metadata.json");
    const deliveryManifestPath = path.join(deliverablesDir, "delivery-manifest.json");
    const privateDeliveryNotePath = path.join(deliverablesDir, "private-delivery-note.md");
    writeText(storeCopyPath, renderStoreCopy(offer, sourceContext));
    writeJson(submissionMetadataPath, canonicalize({
      offer_id: safeString(offer.offer_id),
      offer_title: safeString(offer.offer_title),
      manual_only: true,
      packaging_artifact: true,
      source_kind: safeString(sourceContext.source_kind),
      source_id: safeString(sourceContext.source_id),
      build_id: safeString(sourceContext.build_id),
      commercialization_ready: sourceContext.source_kind === "dataset" && sourceContext.phase20_status
        ? sourceContext.phase20_status.commercialization_ready === true
        : false,
      license_state: sourceContext.source_kind === "dataset" && sourceContext.phase20_status
        ? safeString(sourceContext.phase20_status.license_state)
        : "",
      platform_targets: Array.isArray(offer.platform_targets) ? offer.platform_targets : []
    }));
    writeJson(deliveryManifestPath, canonicalize({
      offer_id: safeString(offer.offer_id),
      product_line: safeString(offer.product_line),
      tier: safeString(offer.tier),
      source_kind: safeString(sourceContext.source_kind),
      source_id: safeString(sourceContext.source_id),
      build_id: safeString(sourceContext.build_id),
      manual_only: true,
      source_status: sourceContext.source_kind === "dataset" ? canonicalize(sourceContext.phase20_status || {}) : {}
    }));
    writeText(privateDeliveryNotePath, renderPrivateDeliveryNote(offer));
    artifactRefs.store_copy = relativeFrom(bundleDir, storeCopyPath);
    artifactRefs.submission_metadata = relativeFrom(bundleDir, submissionMetadataPath);
    artifactRefs.delivery_manifest = relativeFrom(bundleDir, deliveryManifestPath);
    artifactRefs.private_delivery_note = relativeFrom(bundleDir, privateDeliveryNotePath);

    const deliveryTargets = asStringArray(offer.direct_delivery_targets);
    if (deliveryTargets.length > 0) {
      const summaryTargets = [];
      for (const targetName of deliveryTargets) {
        const definition = asPlainObject(directDeliveryTargets[targetName]);
        if (Object.keys(definition).length < 1) {
          const error = new Error(`Unknown direct delivery target '${targetName}'`);
          error.code = "PHASE28_DELIVERY_TARGET_UNKNOWN";
          throw error;
        }
        const targetRoot = path.join(bundleDir, "delivery", targetName);
        ensureDir(targetRoot);
        const contractPath = path.join(targetRoot, "delivery-contract.json");
        const checklistPath = path.join(targetRoot, "checklist.md");
        const handoffPath = path.join(targetRoot, "handoff-note.md");
        writeJson(contractPath, canonicalize({
          schema_version: "phase28-direct-delivery-contract-v1",
          offer_id: safeString(offer.offer_id),
          delivery_target: targetName,
          product_line: safeString(offer.product_line),
          tier: safeString(offer.tier),
          source_kind: safeString(sourceContext.source_kind),
          source_id: safeString(sourceContext.source_id),
          manual_only: true,
          approved_bundle_required: true,
          required_artifact_placeholders: asStringArray(definition.required_artifact_placeholders)
        }));
        writeText(checklistPath, renderDeliveryChecklist(targetName, definition));
        writeText(handoffPath, renderDeliveryHandoffNote(offer, targetName));

        for (const placeholder of asStringArray(definition.required_artifact_placeholders)) {
          const expectedPath = path.join(targetRoot, placeholder);
          if (!fs.existsSync(expectedPath)) {
            const error = new Error(`delivery target '${targetName}' is missing required placeholder '${placeholder}'`);
            error.code = "PHASE28_DELIVERY_PLACEHOLDER_MISSING";
            throw error;
          }
        }

        summaryTargets.push(canonicalize({
          delivery_target: targetName,
          delivery_contract: relativeFrom(bundleDir, contractPath),
          checklist: relativeFrom(bundleDir, checklistPath),
          handoff_note: relativeFrom(bundleDir, handoffPath)
        }));
      }
      const directDeliverySummaryPath = path.join(bundleDir, "delivery", "direct-delivery-targets.json");
      writeJson(directDeliverySummaryPath, canonicalize({
        schema_version: "phase28-direct-delivery-contract-summary-v1",
        offer_id: safeString(offer.offer_id),
        delivery_targets: summaryTargets
      }));
      artifactRefs.direct_delivery_summary = relativeFrom(bundleDir, directDeliverySummaryPath);
    }

    const missingSlots = asStringArray(offer.artifact_slots).filter((slot) => !safeString(artifactRefs[slot]));
    if (missingSlots.length > 0) {
      const error = new Error(`Bundle is missing required artifact slots: ${missingSlots.join(", ")}`);
      error.code = "PHASE19_RELEASE_ARTIFACT_SLOT_MISSING";
      throw error;
    }

    return canonicalize(artifactRefs);
  }

  function writeBundleRoot(bundleDir, offer, sourceContext, artifactRefs, submissionRefs = {}, publisherAdapterSnapshot = {}) {
    const offerPath = path.join(bundleDir, "offer.json");
    const metadataPath = path.join(bundleDir, "metadata.json");
    const releaseNotesPath = path.join(bundleDir, "release-notes.md");
    const expectedTargets = Array.isArray(offer.platform_targets) ? offer.platform_targets.slice().sort((left, right) => left.localeCompare(right)) : [];
    const validatedAdapterSnapshot = validatePublisherAdapterSnapshot(publisherAdapterSnapshot, {
      expected_targets: expectedTargets
    });
    writeJson(offerPath, canonicalize({
      ...offer,
      artifact_refs: canonicalize({
        ...artifactRefs,
        submission: submissionRefs
      })
    }));
    writeJson(metadataPath, canonicalize({
      schema_version: PHASE21_RELEASE_METADATA_SCHEMA,
      offer_id: safeString(offer.offer_id),
      offer_title: safeString(offer.offer_title),
      product_line: safeString(offer.product_line),
      tier: safeString(offer.tier),
      source_kind: safeString(sourceContext.source_kind),
      source_id: safeString(sourceContext.source_id),
      build_id: safeString(sourceContext.build_id),
      platform_targets: Array.isArray(offer.platform_targets) ? offer.platform_targets : [],
      workflow_roles: Array.isArray(offer.workflow_roles) ? offer.workflow_roles : [],
      release_status: safeString(offer.release_status) || "packaged",
      packaging_artifact: true,
      publication_state: "not_published",
      manual_submission_only: true,
      publisher_adapter_required: true,
      publisher_adapter_snapshot_hash: safeString(validatedAdapterSnapshot.publisher_adapter_snapshot_hash),
      publisher_adapter_snapshot: validatedAdapterSnapshot,
      source_status: sourceContext.source_kind === "dataset" ? canonicalize(sourceContext.phase20_status || {}) : {},
      warnings: Array.isArray(sourceContext.warnings) ? sourceContext.warnings : []
    }));
    writeText(releaseNotesPath, [
      `# Release Notes: ${safeString(offer.offer_id)}`,
      "",
      "This bundle is prepared for manual-only delivery or manual-only listing submission.",
      "",
      `Product line: ${safeString(offer.product_line)}`,
      `Tier: ${safeString(offer.tier)}`,
      `Source: ${safeString(sourceContext.source_kind)} ${safeString(sourceContext.source_id)}`,
      `Targets: ${(Array.isArray(offer.platform_targets) ? offer.platform_targets : []).join(", ")}`,
      ...(sourceContext.source_kind === "dataset" ? [`License state: ${safeString(sourceContext.phase20_status && sourceContext.phase20_status.license_state) || "blocked"}`] : []),
      ...(Array.isArray(sourceContext.warnings) && sourceContext.warnings.length > 0 ? sourceContext.warnings.map((entry) => `Warning: ${entry}`) : []),
      ""
    ].join("\n"));
  }

  function finalizeBundle(bundleDir) {
    const files = [];
    const stack = [bundleDir];
    while (stack.length > 0) {
      const current = stack.pop();
      const entries = fs.readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
          continue;
        }
        const rel = relativeFrom(bundleDir, fullPath);
        if (["manifest.json", "checksums.txt", "release-approval.json"].includes(rel) || rel.startsWith("delivery-evidence/")) {
          continue;
        }
        // Q37: bundle-wide license scan on EVERY shipped file's content, at the seal choke point. This
        // catches DrugBank / DB##### content from ANY source — the report body, offer-derived headers
        // (offer_title comes from the user's mission description), submission packs, and dynamically
        // sourced deliverables — not just the raw artifacts the research-branch pre-check reads.
        // Fail-closed BEFORE checksums are sealed, so a non-compliant bundle can never be hashed into a
        // shippable manifest.
        const shippedContent = fs.readFileSync(fullPath, "utf8");
        allowlist.assertNoBannedContent(shippedContent);
        files.push(canonicalize({
          file: rel,
          sha256: sha256(shippedContent)
        }));
      }
    }
    files.sort((left, right) => left.file.localeCompare(right.file));
    const manifestPath = path.join(bundleDir, "manifest.json");
    const checksumsPath = path.join(bundleDir, "checksums.txt");
    writeJson(manifestPath, canonicalize({
      schema_version: "phase19-release-manifest-v1",
      files
    }));
    writeText(checksumsPath, files.map((entry) => `${entry.sha256}  ${entry.file}`).join("\n") + (files.length > 0 ? "\n" : ""));
    return canonicalize({
      manifest_path: manifestPath,
      checksums_path: checksumsPath,
      files
    });
  }

  function commitBundle(tempBundleDir, offerId) {
    const finalBundleDir = path.join(releasesDir, offerId);
    if (fs.existsSync(finalBundleDir)) {
      fs.rmSync(finalBundleDir, { recursive: true, force: true });
    }
    ensureDir(path.dirname(finalBundleDir));
    try {
      fs.renameSync(tempBundleDir, finalBundleDir);
    } catch (error) {
      // The bundle workspace is created under os.tmpdir() (internal disk), while
      // releasesDir may live on a different filesystem/volume (e.g. the repo on an
      // external drive). rename(2) cannot move across devices and throws EXDEV.
      // Fall back to a recursive copy + remove so commit works regardless of where
      // the repo is mounted.
      if (error && error.code === "EXDEV") {
        // Cross-device: copy then remove. If the copy fails partway, clean up the partial
        // destination (so a half-written bundle is never mistaken for a complete one) and
        // keep the temp dir for diagnosis, then rethrow with context.
        try {
          fs.cpSync(tempBundleDir, finalBundleDir, { recursive: true });
        } catch (copyError) {
          try { fs.rmSync(finalBundleDir, { recursive: true, force: true }); } catch { /* best effort */ }
          const wrapped = new Error(`commitBundle cross-device copy failed for offer '${offerId}': ${copyError && copyError.message}`);
          wrapped.code = (copyError && copyError.code) || "COMMIT_BUNDLE_COPY_FAILED";
          wrapped.cause = copyError;
          throw wrapped;
        }
        fs.rmSync(tempBundleDir, { recursive: true, force: true });
      } else {
        throw error;
      }
    }
    return finalBundleDir;
  }

  return Object.freeze({
    createBundleWorkspace,
    writeDeliverables,
    writeBundleRoot,
    finalizeBundle,
    commitBundle,
    releasesDir
  });
}

module.exports = {
  createDeliverablePackager
};
