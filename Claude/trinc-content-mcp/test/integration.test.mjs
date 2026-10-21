import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { listSources, extractClaims } = require("../src/sources.js");
const { buildDraft } = require("../src/draft.js");
const { brandContext } = require("../src/brand.js");
const { paths, CHANNELS } = require("../src/config.js");

// These run against the real monorepo. If it is not present (another machine, a fresh clone),
// they skip rather than fail — a missing checkout is not a defect in this server.
const repoPresent = fs.existsSync(paths().releases);
const options = repoPresent ? {} : { skip: "monorepo not present at the configured path" };

describe("against the real monorepo", options, () => {
  it("finds release bundles to repurpose", () => {
    const inventory = listSources();
    assert.ok(inventory.releases.length > 0, "at least one release bundle");
    for (const release of inventory.releases) {
      assert.match(release.source_ref, /^offer-/);
    }
  });

  it("reads the brand canon, including per-channel voices", () => {
    const context = brandContext();
    assert.deepEqual(context.warnings, [], "canon must be readable");
    assert.equal(context.channel_voices.tiktok, "founder");
    assert.equal(context.channel_voices.instagram, "founder");
    assert.equal(context.channel_voices.youtube, "company");
    assert.equal(context.channel_voices.facebook_page, "company");
  });

  it("extracts claims that all carry a source file and evidence", () => {
    const inventory = listSources();
    const withIntegrity = inventory.releases.find((entry) => entry.has_citation_integrity);
    assert.ok(withIntegrity, "a bundle with a citation-integrity ledger");

    const extracted = extractClaims(withIntegrity.source_ref);
    assert.ok(extracted.claims.length > 0);
    for (const entry of extracted.claims) {
      assert.ok(entry.source_file.startsWith("deliverables/"));
      assert.ok(entry.evidence.length > 0);
    }
  });

  it("drafts for every channel and passes its own gate", () => {
    const inventory = listSources();
    const source = inventory.releases.find((entry) => entry.has_citation_integrity);
    for (const channel of CHANNELS) {
      const draft = buildDraft({ channel, source_ref: source.source_ref });
      assert.equal(draft.check.verdict, "PASS", `${channel}: ${JSON.stringify(draft.check.findings)}`);
      assert.ok(draft.text.length > 0);
      assert.ok(!draft.over_limit, `${channel} draft must fit the caption limit`);
    }
  });

  it("states only figures that came from the bundle", () => {
    const inventory = listSources();
    const source = inventory.releases.find((entry) => entry.has_citation_integrity);
    const draft = buildDraft({ channel: "tiktok", source_ref: source.source_ref });
    for (const used of draft.claims_used) {
      assert.ok(used.source_file, `${used.id} must name the file it came from`);
      assert.ok(draft.text.includes(String(used.value)));
    }
  });

  it("turns an absent deliverable into a VERIFY slot, never a guess", () => {
    const inventory = listSources();
    const withoutCoverage = inventory.releases.find((entry) => !entry.has_search_coverage);
    if (!withoutCoverage) return; // every bundle has one; nothing to assert
    const draft = buildDraft({ channel: "youtube", source_ref: withoutCoverage.source_ref });
    assert.ok(draft.verify_slots.length > 0);
    const slot = draft.verify_slots.find((entry) => /search-coverage/.test(entry.read_from));
    assert.ok(slot, "the missing deliverable is named in the slot");
    assert.ok(draft.text.includes(`[VERIFY:${slot.id}]`));
  });

  it("refuses an unknown source_ref", () => {
    assert.throws(
      () => extractClaims("not-a-real-ref"),
      (error) => error.code === "TRINC_CONTENT_SOURCE_REF_INVALID"
    );
    assert.throws(
      () => extractClaims("offer-doesnotexist"),
      (error) => error.code === "TRINC_CONTENT_SOURCE_NOT_FOUND"
    );
  });
});
