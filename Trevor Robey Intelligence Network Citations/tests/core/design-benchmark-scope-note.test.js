"use strict";

// 2026-11-06: the shipped design-benchmark.md said the citation grade "scores the narrative
// report's cited claims, and no identifier below was counted in it". Both halves were wrong: the
// grade scores cited identifiers, not claims, and a cohort NCT id counts whenever the narrative
// cites it (run #7's manifest counted all 20). The scope note must say what the grade does.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { buildDesignBenchmark } = require("../../openclaw-bridge/monetization/design-benchmark.js");

const RECORDS = [
  { nctId: "NCT00000011", title: "Fixture trial A", phase: "PHASE3", status: "COMPLETED", sponsor: "Example Pharma", sponsorClass: "INDUSTRY" },
  { nctId: "NCT00000012", title: "Fixture trial B", phase: "PHASE3", status: "RECRUITING", sponsor: "Example University", sponsorClass: "OTHER" }
];

describe("design-benchmark citation-integrity scope note", () => {
  it("says the table is not graded and that cited cohort NCT ids count in the narrative's grade", () => {
    const { markdown } = buildDesignBenchmark(RECORDS, { indication: "fixture disease" });
    const note = markdown.split("\n").find((line) => line.startsWith("**Citation-integrity scope.**"));
    assert.ok(note, "the scope note is present");
    assert.ok(note.includes("The table itself is not graded."), note);
    assert.ok(note.includes("scores the identifiers the narrative report cites, not its claims"), note);
    assert.ok(note.includes("any NCT below that the narrative cites is counted in that grade"), note);
  });

  it("no longer claims the grade scores claims or that no table identifier was counted", () => {
    const { markdown } = buildDesignBenchmark(RECORDS, { indication: "fixture disease" });
    assert.ok(!markdown.includes("cited claims"), "the grade does not score claims");
    assert.ok(!markdown.includes("no identifier below was counted"), "cited cohort ids are counted");
  });
});
