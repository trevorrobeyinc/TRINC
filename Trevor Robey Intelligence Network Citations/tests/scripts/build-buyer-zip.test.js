"use strict";

// scripts/build-buyer-zip.js (2026-11-06, decision #5): a buyer ZIP holds only the order form's
// section-4 files plus a fresh checksums.txt, and is refused, with nothing written, when the
// release is incomplete, altered after sealing, blocked, unresolved, carries a ChEMBL identifier
// or still carries wording retired by decisions #6 and #7.

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { buildBuyerZip, BuyerZipError, COMMON_FILES, BENCHMARK_FILES } = require("../../scripts/build-buyer-zip.js");

const OFFER = "offer-0123456789abcdef01234567";
const INTERNAL_FILES = ["store-copy.md", "sample-preview.md", "evidence-appendix.md", "private-delivery-note.md", "delivery-manifest.json", "submission-metadata.json"];

function sealHash(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function reproManifest({ decision = "DELIVER", unresolved = 0, flags = [] } = {}) {
  return JSON.stringify({
    citations: [],
    summary: { delivery_decision: decision, flag_reasons: flags, block_reasons: [], counts: { total: 3, verified: 3 - unresolved, unresolved, unchecked: 0 } }
  }, null, 2);
}

// A sealed release in the engine's layout: deliverables/ + manifest.json listing deliverables/<file>.
function writeRelease(root, { benchmark = true, overrides = {}, omit = [], decision, unresolved, flags } = {}) {
  const releaseDir = path.join(root, OFFER);
  const deliverables = path.join(releaseDir, "deliverables");
  fs.mkdirSync(deliverables, { recursive: true });
  const contents = {
    "report.md": "# Report\n\nCites NCT00000011 and PMID 12345678.\n",
    "graveyard-memo.md": "# Graveyard Memo\n\nIt records what each sponsor reported; it is not advice.\n",
    "tables.csv": "id,type\nNCT00000011,NCT\n",
    "citation-integrity.md": "# Citation integrity\n\nGrade A.\n",
    "search-coverage.md": "# Search coverage\n",
    "reproducibility-manifest.md": "# Reproducibility manifest\n",
    "reproducibility-manifest.json": reproManifest({ decision, unresolved, flags }),
    ...(benchmark ? {
      "design-benchmark.md": "# Trial Design Benchmark\n\nThe table itself is not graded.\n",
      "design-benchmark.csv": "nct_id\nNCT00000011\n"
    } : {}),
    ...Object.fromEntries(INTERNAL_FILES.map((name) => [name, `internal ${name}\n`])),
    ...overrides
  };
  const files = [];
  for (const [name, text] of Object.entries(contents)) {
    if (omit.includes(name)) continue;
    fs.writeFileSync(path.join(deliverables, name), text);
    files.push({ file: `deliverables/${name}`, sha256: sealHash(text) });
  }
  fs.writeFileSync(path.join(releaseDir, "manifest.json"), JSON.stringify({ schema_version: "phase19-release-manifest-v1", files }, null, 2));
  return { releaseDir, deliverables };
}

// Reads the stored (method 0) entries the engine's ZIP writer produces.
function readStoredZip(zipPath) {
  const buffer = fs.readFileSync(zipPath);
  const entries = new Map();
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.toString("utf8", offset + 30, offset + 30 + nameLength);
    const start = offset + 30 + nameLength + extraLength;
    entries.set(name, buffer.subarray(start, start + size));
    offset = start + size;
  }
  return entries;
}

function refusal(fn) {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof BuyerZipError, `expected a BuyerZipError, got ${err && err.stack}`);
    return err.problems.join("\n");
  }
  assert.fail("expected the buyer ZIP to be refused");
  return "";
}

describe("build-buyer-zip", () => {
  let root;
  let out;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "buyer-zip-test-"));
    out = path.join(root, "out", "buyer.zip");
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("ships exactly the order form's Benchmark files plus a checksums.txt that verifies them", () => {
    writeRelease(root);
    const result = buildBuyerZip({ offerId: OFFER, outPath: out, releasesDir: root });
    assert.equal(result.sku, "benchmark");
    assert.equal(result.decision, "DELIVER");
    const entries = readStoredZip(out);
    const expected = [...BENCHMARK_FILES, ...COMMON_FILES, "checksums.txt"].sort();
    assert.deepEqual([...entries.keys()].sort(), expected, "nothing else reaches the buyer");
    for (const name of INTERNAL_FILES) assert.ok(!entries.has(name), `${name} must not reach the buyer`);
    assert.deepEqual(result.leftOut, [...INTERNAL_FILES].sort());

    const lines = entries.get("checksums.txt").toString("utf8").trim().split("\n");
    assert.equal(lines.length, expected.length - 1, "one line per delivered file");
    for (const line of lines) {
      const [hash, name] = line.split("  ");
      assert.equal(hash, crypto.createHash("sha256").update(entries.get(name)).digest("hex"), `checksum for ${name}`);
    }
    assert.equal(result.sha256, crypto.createHash("sha256").update(fs.readFileSync(out)).digest("hex"));
  });

  it("treats a release without the design files as Failed Trial Archaeology", () => {
    writeRelease(root, { benchmark: false });
    const result = buildBuyerZip({ offerId: OFFER, outPath: out, releasesDir: root });
    assert.equal(result.sku, "archaeology");
    assert.deepEqual([...readStoredZip(out).keys()].sort(), [...COMMON_FILES, "checksums.txt"].sort());
  });

  it("reports a flagged delivery without refusing it", () => {
    writeRelease(root, { decision: "DELIVER_WITH_FLAGS", flags: ["attribution_mismatch"] });
    const result = buildBuyerZip({ offerId: OFFER, outPath: out, releasesDir: root });
    assert.deepEqual(result.flags, ["attribution_mismatch"]);
  });

  const REFUSALS = [
    ["a listed file is missing", { omit: ["search-coverage.md"] }, /missing: search-coverage\.md/],
    ["the delivery decision is BLOCK", { decision: "BLOCK" }, /delivery decision is BLOCK/],
    ["an identifier was UNRESOLVED", { unresolved: 1 }, /1 cited identifier\(s\) were UNRESOLVED/],
    ["a ChEMBL identifier is present", { overrides: { "tables.csv": "id,type\nCHEMBL25,ChEMBL\n" } }, /ChEMBL identifier in tables\.csv:2 \("CHEMBL25"\)/],
    ["a ChEMBL-derived field is present", { overrides: { "reproducibility-manifest.md": "| chemblId | x |\n" } }, /ChEMBL identifier in reproducibility-manifest\.md:1/],
    ["the memo keeps the retired funding sentence", { overrides: { "graveyard-memo.md": "Use it to avoid re-funding a path others have already abandoned.\n" } }, /graveyard-memo\.md still says "re-funding a path"/],
    ["the benchmark keeps the retired scope note", { overrides: { "design-benchmark.md": "and no identifier below was counted in it.\n" } }, /design-benchmark\.md still says "no identifier below was counted"/]
  ];
  for (const [label, release, pattern] of REFUSALS) {
    it(`refuses, writing nothing, when ${label}`, () => {
      writeRelease(root, release);
      assert.match(refusal(() => buildBuyerZip({ offerId: OFFER, outPath: out, releasesDir: root })), pattern);
      assert.ok(!fs.existsSync(out), "no ZIP is written on a refusal");
    });
  }

  it("refuses a file changed after the release was sealed", () => {
    const { deliverables } = writeRelease(root);
    fs.appendFileSync(path.join(deliverables, "report.md"), "edited after sealing\n");
    assert.match(refusal(() => buildBuyerZip({ offerId: OFFER, outPath: out, releasesDir: root })), /changed after the release was sealed: report\.md/);
  });

  it("refuses a release that has only one of the two design-benchmark files unless --sku says which", () => {
    writeRelease(root, { omit: ["design-benchmark.csv"] });
    assert.match(refusal(() => buildBuyerZip({ offerId: OFFER, outPath: out, releasesDir: root })), /only design-benchmark\.md of the two/);
    const result = buildBuyerZip({ offerId: OFFER, outPath: out, releasesDir: root, sku: "archaeology" });
    assert.ok(!readStoredZip(result.out).has("design-benchmark.md"), "an Archaeology ZIP leaves the design files out");
  });

  it("never overwrites an existing file and checks its arguments", () => {
    writeRelease(root);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, "keep me");
    assert.match(refusal(() => buildBuyerZip({ offerId: OFFER, outPath: out, releasesDir: root })), /already exists/);
    assert.equal(fs.readFileSync(out, "utf8"), "keep me");
    assert.match(refusal(() => buildBuyerZip({ offerId: "../etc", outPath: out, releasesDir: root })), /must look like offer-<hex>/);
    assert.match(refusal(() => buildBuyerZip({ offerId: OFFER, outPath: path.join(root, "x.tar"), releasesDir: root })), /must name a \.zip/);
    assert.match(refusal(() => buildBuyerZip({ offerId: "offer-ffff", outPath: path.join(root, "y.zip"), releasesDir: root })), /no sealed release/);
  });

  // Run #7 (ALS) was sealed before decisions #6 and #7, so its memo and scope note carry the retired
  // wording: the builder must refuse it. Releases are gitignored, so this skips on a clean checkout.
  it("refuses run #7's sealed release for its retired wording only", (t) => {
    const releasesDir = path.resolve(__dirname, "..", "..", "workspace", "releases");
    const offerId = "offer-6e024a207af1d5e62c6a15ef";
    if (!fs.existsSync(path.join(releasesDir, offerId, "manifest.json"))) {
      t.skip("run #7's release is not on this machine");
      return;
    }
    const problems = refusal(() => buildBuyerZip({ offerId, outPath: out, releasesDir })).split("\n");
    assert.ok(problems.length >= 1);
    for (const problem of problems) assert.match(problem, /still says .*retired on 2026-11-06/, problem);
    assert.ok(!fs.existsSync(out));
  });
});
