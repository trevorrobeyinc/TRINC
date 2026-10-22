"use strict";

// build-graveyard-feed.js — generate a Trial Graveyard Feed (AWS Data Exchange Files data set)
// for one therapeutic area from live ClinicalTrials.gov data, split into a FREE evaluation sample
// and the PAID full feed. Deterministic render; public-domain source; no PHI.
//
// Usage:
//   node scripts/build-graveyard-feed.js --condition "glioblastoma" [--out <dir>] [--asOf YYYY-MM-DD] [--pageSize 20] [--teaserRows 5]
//
// Output layout (<out>/):
//   paid/register.csv, paid/citation-index.csv, paid/data-dictionary.md   (full feed = paid offer)
//   free/register-sample.csv, free/citation-index-sample.csv, free/data-dictionary.md, free/SAMPLE-NOTICE.md  (free offer)
//   summary.json

const fs = require("node:fs");
const path = require("node:path");
const { createCtgovSupplemental } = require("../openclaw-bridge/mcp/ctgov-supplemental/ctgov-supplemental.js");
const { buildGraveyardFeed, renderSampleNotice, FEED_FILES } = require("../openclaw-bridge/monetization/graveyard-feed.js");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

async function main() {
  const condition = arg("condition", "");
  if (!condition) {
    console.error('Missing --condition. Example: node scripts/build-graveyard-feed.js --condition "glioblastoma"');
    process.exit(1);
  }
  const asOf = arg("asOf", new Date().toISOString().slice(0, 10));
  const teaserRows = Math.min(Math.max(parseInt(arg("teaserRows", "5"), 10) || 5, 1), 50);
  // Protocol-churn enrichment is ONE HTTP call per trial against an undocumented endpoint, so it
  // is bounded independently of the register. 40 is the largest sweep measured end to end
  // (concurrency 3, 400ms inter-batch pauses, 6.85s, 0 non-200); raising it is arithmetic, not
  // evidence. Consequence: on a large TA the churn columns are populated for a SUBSET of rows,
  // and SAMPLE-NOTICE.md states that subset explicitly.
  const historySample = Math.min(Math.max(parseInt(arg("historySample", "40"), 10) || 40, 1), 200);
  const outDir = arg("out", path.join("workspace", "distribution", "graveyard-feed", `${slug(condition)}-${asOf}`));

  // CENSUS mode. Until 2026-07-30 this script passed a --pageSize that defaulted to 20 and was
  // hard-capped at 50, on top of the fetcher's own 50-row cap — a DOUBLE clamp whose fingerprint
  // is visible in the shipped data: every therapeutic area landed on exactly 50 rows. The listing
  // meanwhile marketed "ALL stopped trials for the TA" and "(complete TA)", and this script's own
  // SAMPLE-NOTICE said "the complete feed (all N ...)" where N was the CLAMPED number. The claim
  // and the artifact disagreed. The census walk makes the register genuinely complete for the
  // query; --pageSize is accepted and ignored so old invocations keep working.
  if (arg("pageSize", null)) {
    console.log("[graveyard-feed] NOTE: --pageSize is ignored; the register is now a full census.");
  }
  const ctgov = createCtgovSupplemental({ maxHistory: historySample });
  console.log(`[graveyard-feed] census fetch for "${condition}" (churn sample=${historySample})...`);
  const records = await ctgov.searchStoppedTrials({ condition, census: true });
  const censusComplete = records.censusComplete === true;
  const eligibleTotal = records.eligibleTotal;
  const churnRows = records.filter((r) => r && r.changeSummary && Number(r.changeSummary.versions) > 0).length;
  console.log(`[graveyard-feed] retrieved ${records.length} of ${eligibleTotal} record(s); complete=${censusComplete}; churn on ${churnRows}.`);
  if (!censusComplete) {
    console.log("[graveyard-feed] WARNING: retrieval is NOT complete — do not publish this as a complete feed.");
  }

  // The history accounting rides on `records` as non-enumerable properties, which slice() drops,
  // so it is read here once and handed to both tiers and the notice.
  const history = {
    attempted: records.historyAttempted,
    succeeded: records.historySucceeded,
    firstError: records.historyFirstError,
  };
  if (history.attempted > 0 && history.succeeded === 0) {
    console.log(`[graveyard-feed] protocol history: 0 of ${history.attempted} request(s) came back (first error: ${history.firstError || "none"}).`);
  }

  const full = buildGraveyardFeed(records, { indication: condition, asOf, tier: "paid", history });
  const teaser = buildGraveyardFeed(records.slice(0, teaserRows), { indication: condition, asOf, tier: "free", history });

  const paidDir = path.join(outDir, "paid");
  const freeDir = path.join(outDir, "free");
  fs.mkdirSync(paidDir, { recursive: true });
  fs.mkdirSync(freeDir, { recursive: true });

  // PAID offer = the complete feed (all rows, all columns).
  fs.writeFileSync(path.join(paidDir, FEED_FILES.paid.register), full.feedCsv, "utf8");
  fs.writeFileSync(path.join(paidDir, FEED_FILES.paid.citations), full.citationIndexCsv, "utf8");
  fs.writeFileSync(path.join(paidDir, "data-dictionary.md"), full.dataDictionaryMd, "utf8");

  // FREE offer = a capped evaluation sample (first N rows; identical schema).
  fs.writeFileSync(path.join(freeDir, FEED_FILES.free.register), teaser.feedCsv, "utf8");
  fs.writeFileSync(path.join(freeDir, FEED_FILES.free.citations), teaser.citationIndexCsv, "utf8");
  fs.writeFileSync(path.join(freeDir, "data-dictionary.md"), teaser.dataDictionaryMd, "utf8");
  fs.writeFileSync(path.join(freeDir, "SAMPLE-NOTICE.md"), renderSampleNotice({
    condition,
    asOf,
    sampleTotal: teaser.summary.total,
    fullTotal: full.summary.total,
    eligibleTotal,
    censusComplete,
    churnRows,
    history,
  }), "utf8");

  fs.writeFileSync(path.join(outDir, "summary.json"),
    JSON.stringify({ condition, asOf, teaserRows, paid: full.summary, free: teaser.summary }, null, 2), "utf8");

  console.log(`[graveyard-feed] PAID (full): ${full.summary.total} rows -> ${paidDir}`);
  console.log(`[graveyard-feed] FREE (sample): ${teaser.summary.total} rows -> ${freeDir}`);
  console.log(`[graveyard-feed] band_counts (paid): ${JSON.stringify(full.summary.band_counts)}`);
}

main().catch((err) => { console.error("[graveyard-feed] ERROR:", err && err.message); process.exit(2); });
