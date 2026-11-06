#!/usr/bin/env node
"use strict";

// Build the ZIP a buyer receives (2026-11-06, operator decision #5 on
// 08-contracts-legal/decision-sheet-2026-11.md). The engine's export ZIP also carries marketplace
// copy, Datarade listing files and internal notes. A buyer gets only the Deliverable files the
// order form lists (08-contracts-legal/common-paper/sow-template.md, section 4), plus a fresh
// checksums.txt over exactly those files.
//
// It refuses, and writes nothing, when:
//   - a listed file is missing, or changed after the release was sealed (manifest.json);
//   - the engine's delivery decision is not DELIVER / DELIVER_WITH_FLAGS, or an identifier is UNRESOLVED;
//   - any file carries a ChEMBL identifier (excluded from paid deliverables until counsel answers
//     the CC BY-SA 3.0 share-alike question);
//   - a file still carries wording the operator retired on 2026-11-06 (decisions #6 and #7).
// It never edits the sealed release.
//
// Usage: node scripts/build-buyer-zip.js --offer-id <offer-…> --out <file.zip> [--sku benchmark|archaeology]

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { buildDeterministicZip } = require("./_export-zip-util.js");

const DEFAULT_RELEASES_DIR = path.resolve(__dirname, "..", "workspace", "releases");

// The order form's section 4. Keep the two lists in step with it.
const COMMON_FILES = Object.freeze([
  "report.md",
  "graveyard-memo.md",
  "tables.csv",
  "citation-integrity.md",
  "search-coverage.md",
  "reproducibility-manifest.md",
  "reproducibility-manifest.json"
]);
const BENCHMARK_FILES = Object.freeze(["design-benchmark.md", "design-benchmark.csv"]);
const SKU_FILES = Object.freeze({
  benchmark: Object.freeze([...BENCHMARK_FILES, ...COMMON_FILES].sort()),
  archaeology: Object.freeze([...COMMON_FILES].sort())
});
const SKU_NAMES = Object.freeze({ benchmark: "Trial Design Benchmark Pack", archaeology: "Failed Trial Archaeology" });

const SHIPPABLE_DECISIONS = new Set(["DELIVER", "DELIVER_WITH_FLAGS"]);
const CHEMBL_PATTERNS = Object.freeze([/CHEMBL\d+/, /chembl_?id/i]);
// Text the generators no longer write. A bundle sealed before the fix still carries it, so it is
// refused rather than shipped: run the order again on the current engine.
const RETIRED_WORDING = Object.freeze([
  { file: "graveyard-memo.md", text: "re-funding a path", decision: "#7 (the memo read as funding advice)" },
  { file: "design-benchmark.md", text: "no identifier below was counted", decision: "#6 (the scope note misstated the grade)" }
]);

class BuyerZipError extends Error {
  constructor(problems) {
    super(`buyer ZIP refused, nothing written:\n- ${problems.join("\n- ")}`);
    this.name = "BuyerZipError";
    this.problems = problems;
  }
}

// The engine seals the UTF-8 text of each file (finalizeBundle), so the seal check hashes the same way.
function sealHash(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath, "utf8")).digest("hex");
}

// The buyer's checksums.txt hashes raw bytes, so `shasum -a 256 -c checksums.txt` verifies it.
function byteHash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function chooseSku(deliverablesDir, requested) {
  if (requested) {
    if (!Object.prototype.hasOwnProperty.call(SKU_FILES, requested)) {
      return { error: `unknown --sku "${requested}"; use benchmark or archaeology` };
    }
    return { sku: requested };
  }
  const present = BENCHMARK_FILES.filter((name) => fs.existsSync(path.join(deliverablesDir, name)));
  if (present.length === BENCHMARK_FILES.length) return { sku: "benchmark" };
  if (present.length === 0) return { sku: "archaeology" };
  return { error: `only ${present.join(", ")} of the two design-benchmark files is present; pass --sku to say which service this is` };
}

function firstMatch(text, patterns) {
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    for (const pattern of patterns) {
      const match = lines[index].match(pattern);
      if (match) return { line: index + 1, match: match[0] };
    }
  }
  return null;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function buildBuyerZip({ offerId, outPath, sku, releasesDir = DEFAULT_RELEASES_DIR } = {}) {
  if (!/^offer-[0-9a-f]+$/.test(String(offerId || ""))) {
    throw new BuyerZipError([`--offer-id must look like offer-<hex>, got "${offerId || ""}"`]);
  }
  if (!outPath || !String(outPath).toLowerCase().endsWith(".zip")) {
    throw new BuyerZipError(["--out must name a .zip file"]);
  }
  const out = path.resolve(String(outPath));
  if (fs.existsSync(out)) throw new BuyerZipError([`${out} already exists; nothing is overwritten, choose a new name`]);

  const releaseDir = path.join(releasesDir, offerId);
  const deliverablesDir = path.join(releaseDir, "deliverables");
  if (!fs.existsSync(deliverablesDir)) throw new BuyerZipError([`no sealed release at ${releaseDir}`]);

  const chosen = chooseSku(deliverablesDir, sku);
  if (chosen.error) throw new BuyerZipError([chosen.error]);
  const files = SKU_FILES[chosen.sku];
  const problems = [];

  // 1. Every listed file is present and unchanged since the release was sealed.
  let sealed = null;
  try {
    sealed = new Map((readJson(path.join(releaseDir, "manifest.json")).files || []).map((entry) => [entry.file, entry.sha256]));
  } catch (err) {
    problems.push(`the release seal (manifest.json) is unreadable: ${err.message}`);
  }
  const present = [];
  for (const name of files) {
    const filePath = path.join(deliverablesDir, name);
    if (!fs.existsSync(filePath)) {
      problems.push(`missing: ${name}`);
      continue;
    }
    present.push(name);
    if (!sealed) continue;
    const expected = sealed.get(`deliverables/${name}`);
    if (!expected) problems.push(`not covered by the release seal: ${name}`);
    else if (sealHash(filePath) !== expected) problems.push(`changed after the release was sealed: ${name}`);
  }

  // 2. The engine's own delivery decision allows shipping, and nothing is UNRESOLVED.
  let decision = null;
  let flags = [];
  if (present.includes("reproducibility-manifest.json")) {
    try {
      const summary = readJson(path.join(deliverablesDir, "reproducibility-manifest.json")).summary || {};
      decision = summary.delivery_decision || null;
      flags = Array.isArray(summary.flag_reasons) ? summary.flag_reasons : [];
      const unresolved = Number((summary.counts || {}).unresolved || 0);
      if (!SHIPPABLE_DECISIONS.has(decision)) problems.push(`delivery decision is ${decision || "missing"}, not DELIVER or DELIVER_WITH_FLAGS`);
      if (unresolved > 0) problems.push(`${unresolved} cited identifier(s) were UNRESOLVED at delivery`);
    } catch (err) {
      problems.push(`reproducibility-manifest.json is unreadable: ${err.message}`);
    }
  }

  // 3. No ChEMBL identifier, and no retired wording, in anything the buyer receives.
  for (const name of present) {
    const text = fs.readFileSync(path.join(deliverablesDir, name), "utf8");
    const chembl = firstMatch(text, CHEMBL_PATTERNS);
    if (chembl) {
      problems.push(`ChEMBL identifier in ${name}:${chembl.line} ("${chembl.match}"); ChEMBL is excluded from paid deliverables until counsel answers the share-alike question`);
    }
    for (const retired of RETIRED_WORDING) {
      if (retired.file === name && text.includes(retired.text)) {
        problems.push(`${name} still says "${retired.text}", retired on 2026-11-06 by decision ${retired.decision}; run the order on the current engine`);
      }
    }
  }

  if (problems.length > 0) throw new BuyerZipError(problems);

  // 4. Stage exactly those files at the ZIP root, add a fresh checksums.txt, zip, clean up.
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "buyer-zip-"));
  try {
    const checksumLines = [];
    for (const name of files) {
      const data = fs.readFileSync(path.join(deliverablesDir, name));
      fs.writeFileSync(path.join(staging, name), data);
      checksumLines.push(`${byteHash(data)}  ${name}`);
    }
    fs.writeFileSync(path.join(staging, "checksums.txt"), `${checksumLines.join("\n")}\n`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    buildDeterministicZip(staging, out);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }

  return {
    offerId,
    sku: chosen.sku,
    service: SKU_NAMES[chosen.sku],
    decision,
    flags,
    files: [...files, "checksums.txt"],
    leftOut: fs.readdirSync(deliverablesDir).filter((name) => !files.includes(name)).sort(),
    out,
    sha256: byteHash(fs.readFileSync(out))
  };
}

function parseArgs(argv) {
  const out = { offerId: "", outPath: "", sku: "", unknown: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "");
    if (token === "--offer-id") { out.offerId = String(argv[index + 1] || "").trim(); index += 1; continue; }
    if (token === "--out") { out.outPath = String(argv[index + 1] || "").trim(); index += 1; continue; }
    if (token === "--sku") { out.sku = String(argv[index + 1] || "").trim(); index += 1; continue; }
    out.unknown.push(token);
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.unknown.length > 0 || !args.offerId || !args.outPath) {
    process.stderr.write("Usage: node scripts/build-buyer-zip.js --offer-id <offer-…> --out <file.zip> [--sku benchmark|archaeology]\n");
    process.exit(1);
  }
  try {
    const result = buildBuyerZip({ offerId: args.offerId, outPath: args.outPath, sku: args.sku || undefined });
    process.stdout.write([
      `Buyer ZIP written: ${result.out}`,
      `  sha256: ${result.sha256}`,
      `  service: ${result.service}; delivery decision: ${result.decision}`,
      `  files (${result.files.length}): ${result.files.join(", ")}`,
      `  left out of the buyer ZIP: ${result.leftOut.join(", ") || "nothing"}`
    ].join("\n") + "\n");
    if (result.flags.length > 0) {
      process.stdout.write(`  NOTE: flagged (${result.flags.join(", ")}). The report carries inline marks; read them before sending.\n`);
    }
  } catch (err) {
    if (err instanceof BuyerZipError) {
      process.stderr.write(`${err.message}\n`);
      process.exit(2);
    }
    throw err;
  }
}

if (require.main === module) main();

module.exports = { buildBuyerZip, BuyerZipError, COMMON_FILES, BENCHMARK_FILES, RETIRED_WORDING };
