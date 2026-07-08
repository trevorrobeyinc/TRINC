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
const { buildGraveyardFeed } = require("../openclaw-bridge/monetization/graveyard-feed.js");

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
  const pageSize = Math.min(Math.max(parseInt(arg("pageSize", "20"), 10) || 20, 1), 50);
  const teaserRows = Math.min(Math.max(parseInt(arg("teaserRows", "5"), 10) || 5, 1), 50);
  const outDir = arg("out", path.join("workspace", "distribution", "graveyard-feed", `${slug(condition)}-${asOf}`));

  const ctgov = createCtgovSupplemental({ maxHistory: pageSize }); // enrich ALL fetched rows with change-history
  console.log(`[graveyard-feed] fetching stopped trials for "${condition}" (pageSize=${pageSize})...`);
  const records = await ctgov.searchStoppedTrials({ condition, pageSize });
  console.log(`[graveyard-feed] retrieved ${records.length} stopped trial record(s).`);

  const full = buildGraveyardFeed(records, { indication: condition, asOf });
  const teaser = buildGraveyardFeed(records.slice(0, teaserRows), { indication: condition, asOf });

  const paidDir = path.join(outDir, "paid");
  const freeDir = path.join(outDir, "free");
  fs.mkdirSync(paidDir, { recursive: true });
  fs.mkdirSync(freeDir, { recursive: true });

  // PAID offer = the complete feed (all rows, all columns).
  fs.writeFileSync(path.join(paidDir, "register.csv"), full.feedCsv, "utf8");
  fs.writeFileSync(path.join(paidDir, "citation-index.csv"), full.citationIndexCsv, "utf8");
  fs.writeFileSync(path.join(paidDir, "data-dictionary.md"), full.dataDictionaryMd, "utf8");

  // FREE offer = a capped evaluation sample (first N rows; identical schema).
  fs.writeFileSync(path.join(freeDir, "register-sample.csv"), teaser.feedCsv, "utf8");
  fs.writeFileSync(path.join(freeDir, "citation-index-sample.csv"), teaser.citationIndexCsv, "utf8");
  fs.writeFileSync(path.join(freeDir, "data-dictionary.md"), teaser.dataDictionaryMd, "utf8");
  fs.writeFileSync(path.join(freeDir, "SAMPLE-NOTICE.md"),
    `# Free Sample — Trial Graveyard Feed (${condition})\n\n` +
    `This free sample contains the first ${teaser.summary.total} of ${full.summary.total} stopped trials in the ` +
    `${condition} feed (as of ${asOf}), in the identical schema, so you can evaluate data quality and format before subscribing.\n\n` +
    `The paid subscription delivers the **complete** ${condition} feed (all ${full.summary.total} terminated/withdrawn/suspended ` +
    `trials), refreshed **monthly** as new revisions, with the full amendment-risk band and protocol-churn intelligence on every row. ` +
    `Every row resolves to a public ClinicalTrials.gov record; no PHI.\n`);

  fs.writeFileSync(path.join(outDir, "summary.json"),
    JSON.stringify({ condition, asOf, teaserRows, paid: full.summary, free: teaser.summary }, null, 2), "utf8");

  console.log(`[graveyard-feed] PAID (full): ${full.summary.total} rows -> ${paidDir}`);
  console.log(`[graveyard-feed] FREE (sample): ${teaser.summary.total} rows -> ${freeDir}`);
  console.log(`[graveyard-feed] band_counts (paid): ${JSON.stringify(full.summary.band_counts)}`);
}

main().catch((err) => { console.error("[graveyard-feed] ERROR:", err && err.message); process.exit(2); });
