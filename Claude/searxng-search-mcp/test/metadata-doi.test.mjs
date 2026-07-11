/**
 * Unit tests for engine-metadata DOI harvesting (no network).
 * Run: `node --test test/metadata-doi.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { addMetadataDoi } = require("../src/searxng.js");

test("addMetadataDoi: adds an engine-supplied DOI absent from url/title/snippet", () => {
  const citations = [];
  addMetadataDoi(citations, "10.1038/s41598-026-61640-1");
  assert.deepEqual(citations, [
    { type: "doi", id: "10.1038/s41598-026-61640-1", source: "metadata" },
  ]);
});

test("addMetadataDoi: normalizes wrappers and casing", () => {
  const citations = [];
  addMetadataDoi(citations, "https://doi.org/10.1111/DOM.70859");
  assert.deepEqual(citations, [{ type: "doi", id: "10.1111/dom.70859", source: "metadata" }]);
});

test("addMetadataDoi: preprint registrants keep their subtype", () => {
  const citations = [];
  addMetadataDoi(citations, "10.1101/2024.01.15.575000");
  assert.equal(citations[0].subtype, "preprint");
});

test("addMetadataDoi: never downgrades a DOI already harvested from the url", () => {
  const citations = [{ type: "doi", id: "10.1038/s41591-022-01707-4", source: "url" }];
  addMetadataDoi(citations, "10.1038/s41591-022-01707-4");
  assert.equal(citations.length, 1);
  assert.equal(citations[0].source, "url"); // page-identity provenance wins
});

test("addMetadataDoi: ignores absent or non-DOI values rather than emitting a bogus id", () => {
  for (const bad of [undefined, null, "", "not-a-doi", "PMC123456", 42, {}]) {
    const citations = [];
    addMetadataDoi(citations, bad);
    assert.deepEqual(citations, [], `should ignore ${JSON.stringify(bad)}`);
  }
});

test("addMetadataDoi: a metadata DOI never becomes a dedupe identity key", () => {
  // robust.dedupe() keys identity on source==="url" only; assert the provenance we emit is not that.
  const citations = [];
  addMetadataDoi(citations, "10.1111/dom.70721");
  assert.notEqual(citations[0].source, "url");
});
