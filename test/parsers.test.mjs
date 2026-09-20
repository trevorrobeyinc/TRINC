import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  parseCitationIntegrity,
  parseGraveyardMemo,
  parseSearchCoverage
} = require("../src/sources.js");

// Fixtures are copied VERBATIM from shipped bundles (read 2026-09-19). If a renderer's format
// changes, these tests fail loudly — which is the point. A silently-missing claim degrades to a
// VERIFY slot in a draft, so the failure mode is safe, but it should still be visible here.

const CITATION_INTEGRITY = `# Citation Integrity & Provenance

**Integrity grade: A** — High integrity — nearly all citations grounded in fetched evidence

| Metric | Value |
| --- | --- |
| Citations | 50 |
| Grounded in fetched evidence | 50 (100%) |
| Unverified (treat as unconfirmed) | 0 |
| Retracted | 0 |
`;

const GRAVEYARD = `# Graveyard Memo — Prior Terminated Programs

Citation-traced record of clinical programs in **non-small cell lung cancer** that were terminated, withdrawn, or suspended, with the stop reason each sponsor reported.

**8 stopped program(s) retrieved.**

### Phase II Docetaxel
*NCT00238615 · TERMINATED · Phase PHASE2*
- **Stop reason:** low accrual

### Another study
*NCT05631574 · TERMINATED · Phase PHASE1*

## Protocol Amendment-Risk Signal
Across **5** comparable stopped trial(s) with version history, protocols were amended a **median of 13** times (max 30). **Amendment-risk: HIGH.**
`;

const COVERAGE = `# Search-Coverage Ledger

**Coverage:** 13 search(es) across 10 source(s) · 81 record(s) retrieved · 2 returned zero.
`;

function byId(claims) {
  return Object.fromEntries(claims.map((entry) => [entry.id, entry]));
}

describe("citation-integrity parser", () => {
  it("extracts grade, totals, grounded count and ratio", () => {
    const claims = byId(parseCitationIntegrity(CITATION_INTEGRITY, "f.md"));
    assert.equal(claims.integrity_grade.value, "A");
    assert.equal(claims.citations_total.value, 50);
    assert.equal(claims.citations_grounded.value, 50);
    assert.equal(claims.grounded_ratio_pct.value, 100);
    assert.equal(claims.citations_unverified.value, 0);
    assert.equal(claims.citations_retracted.value, 0);
  });

  it("carries the verbatim source line as evidence on every claim", () => {
    for (const entry of parseCitationIntegrity(CITATION_INTEGRITY, "f.md")) {
      assert.ok(entry.evidence.length > 0, `${entry.id} must carry evidence`);
      assert.equal(entry.source_file, "f.md");
    }
  });

  it("returns nothing for empty input rather than inventing defaults", () => {
    assert.deepEqual(parseCitationIntegrity("", "f.md"), []);
    assert.deepEqual(parseCitationIntegrity(null, "f.md"), []);
  });
});

describe("graveyard-memo parser", () => {
  it("extracts indication, stopped count, NCT ids and the risk band", () => {
    const claims = byId(parseGraveyardMemo(GRAVEYARD, "g.md"));
    assert.equal(claims.indication.value, "non-small cell lung cancer");
    assert.equal(claims.stopped_programs.value, 8);
    assert.deepEqual(claims.nct_ids.value, ["NCT00238615", "NCT05631574"]);
    assert.equal(claims.amendment_risk.value, "HIGH");
  });

  it("extracts the amendment median — the bold wraps the phrase, not the digits", () => {
    const claims = byId(parseGraveyardMemo(GRAVEYARD, "g.md"));
    assert.equal(claims.protocol_amendments_median.value, 13);
  });

  it("deduplicates repeated NCT ids", () => {
    const claims = byId(parseGraveyardMemo(
      `${GRAVEYARD}\nNCT00238615 again`, "g.md"
    ));
    assert.equal(claims.nct_ids.value.length, 2);
  });
});

describe("search-coverage parser", () => {
  it("extracts the four coverage figures", () => {
    const claims = byId(parseSearchCoverage(COVERAGE, "s.md"));
    assert.equal(claims.searches_run.value, 13);
    assert.equal(claims.sources_queried.value, 10);
    assert.equal(claims.records_retrieved.value, 81);
    assert.equal(claims.zero_result_searches.value, 2);
  });

  it("marks zero-results as an honest negative, distinct from a failed source", () => {
    const claims = byId(parseSearchCoverage(COVERAGE, "s.md"));
    assert.match(claims.zero_result_searches.note, /NOT the same as a failed source/);
  });
});
