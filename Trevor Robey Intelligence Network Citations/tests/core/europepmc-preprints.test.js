"use strict";

// europepmc-preprints.js — preprint lane (added 2026-09-19).
//
// The load-bearing assertion here is "no subject means NO CALL". This module exists because the
// config-only version of this lane could not express that: appending "AND SRC:PPR" to a
// prefetch-map query template yields a string that is never empty, which defeats BOTH
// tool-prefetch's empty-args skip guard and its topic fallback. If someone later "simplifies"
// this back into a template, that test is what should stop them.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  createEuropePmcPreprints,
  subjectFrom,
  PREPRINT_FILTER,
  ABSTRACT_CHARS
} = require("../../openclaw-bridge/mcp/europepmc-preprints/europepmc-preprints.js");

function mockFetch(payload, { ok = true, status = 200 } = {}) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return { ok, status, json: async () => payload };
  };
  fn.calls = calls;
  return fn;
}

const SAMPLE = {
  hitCount: 4252,
  resultList: {
    result: [
      {
        doi: "10.1101/2024.04.11.24305666",
        title: "Pilot trial of perampanel on peritumoral hyperexcitability",
        pubYear: "2024",
        abstractText: "Glioblastoma patients frequently experience seizures.",
        authorString: "Smith J, Doe A.",
        source: "PPR",
        publisher: "bioRxiv",
        pmid: "38699312"
      },
      { doi: "10.20944/preprints202609.0751.v1", title: "Bitter melon extract in glioma", pubYear: "2026" }
    ]
  }
};

describe("europepmc-preprints — searchPreprints", () => {
  it("makes NO CALL when there is no subject (the reason this is code, not a config line)", async () => {
    const fetchImpl = mockFetch(SAMPLE);
    const recs = await createEuropePmcPreprints({ fetchImpl }).searchPreprints({});
    assert.deepEqual(recs, []);
    assert.equal(
      fetchImpl.calls.length,
      0,
      "an empty input set must not spend a request on a bare SRC:PPR filter clause"
    );
  });

  it("treats `topic` as a first-class subject so topic-only templates work natively", async () => {
    // general-research-pack supplies only `topic`. The config version depended on
    // tool-prefetch's empty-string fallback, which a composed query defeats.
    const fetchImpl = mockFetch(SAMPLE);
    await createEuropePmcPreprints({ fetchImpl }).searchPreprints({ topic: "AI governance" });
    const q = new URL(fetchImpl.calls[0].url).searchParams.get("query");
    assert.equal(q, `AI governance AND ${PREPRINT_FILTER}`);
  });

  it("joins distinct subject aliases and de-duplicates them", async () => {
    const fetchImpl = mockFetch(SAMPLE);
    await createEuropePmcPreprints({ fetchImpl }).searchPreprints({
      indication: "glioblastoma",
      disease_name: "Glioblastoma",
      compound_name: "temozolomide",
      therapeutic_area: "   "
    });
    const q = new URL(fetchImpl.calls[0].url).searchParams.get("query");
    // "Glioblastoma" is a case-insensitive duplicate; the whitespace-only field is ignored.
    assert.equal(q, `glioblastoma temozolomide AND ${PREPRINT_FILTER}`);
  });

  it("always restricts to preprints", async () => {
    const fetchImpl = mockFetch(SAMPLE);
    await createEuropePmcPreprints({ fetchImpl }).searchPreprints({ indication: "x" });
    const q = new URL(fetchImpl.calls[0].url).searchParams.get("query");
    assert.match(q, /AND SRC:PPR$/);
  });

  it("returns DOI-bearing records that can reach the grounding gate", async () => {
    const recs = await createEuropePmcPreprints({ fetchImpl: mockFetch(SAMPLE) })
      .searchPreprints({ indication: "glioblastoma" });
    assert.equal(recs.length, 2);
    assert.equal(recs[0].doi, "10.1101/2024.04.11.24305666");
    assert.equal(recs[0].pmid, "38699312");
    assert.equal(recs[0].url, "https://doi.org/10.1101/2024.04.11.24305666");
  });

  it("labels every record as a preprint so it is never mistaken for peer-reviewed work", async () => {
    const recs = await createEuropePmcPreprints({ fetchImpl: mockFetch(SAMPLE) })
      .searchPreprints({ indication: "x" });
    for (const r of recs) assert.equal(r.journal, "Preprint (not peer reviewed)");
  });

  it("survives a sparse record without inventing fields", async () => {
    const recs = await createEuropePmcPreprints({ fetchImpl: mockFetch(SAMPLE) })
      .searchPreprints({ indication: "x" });
    assert.equal(recs[1].abstract, "");
    assert.equal(recs[1].pmid, "");
    assert.equal(recs[1].preprintServer, "");
  });

  it("strips markup from abstracts — Europe PMC returns HTML in abstractText", async () => {
    // Observed live: "<title>Abstract</title> <p>...", "<h4>Background</h4> ...". Without this
    // the tags land in the agent prompt verbatim.
    const html = {
      hitCount: 1,
      resultList: {
        result: [{ doi: "10.1/x", title: "t", abstractText: "<h4>Background</h4> <p>Real text here.</p>" }]
      }
    };
    const recs = await createEuropePmcPreprints({ fetchImpl: mockFetch(html) }).searchPreprints({ indication: "x" });
    assert.equal(recs[0].abstract, "Background Real text here.");
    assert.doesNotMatch(recs[0].abstract, /</);
  });

  it("truncates abstracts — these render into an agent prompt", async () => {
    const long = {
      hitCount: 1,
      resultList: { result: [{ doi: "10.1/x", title: "t", abstractText: "y".repeat(4000) }] }
    };
    const recs = await createEuropePmcPreprints({ fetchImpl: mockFetch(long) }).searchPreprints({ indication: "x" });
    assert.equal(recs[0].abstract.length, ABSTRACT_CHARS);
  });

  it("reports the true denominator separately from the page returned", async () => {
    const recs = await createEuropePmcPreprints({ fetchImpl: mockFetch(SAMPLE) })
      .searchPreprints({ indication: "x", limit: 1 });
    assert.equal(recs.length, 1);
    assert.equal(recs.totalMatched, 4252);
    assert.deepEqual(Object.keys(recs), ["0"]);
  });

  it("is fail-soft on HTTP errors and thrown transports", async () => {
    assert.deepEqual(
      await createEuropePmcPreprints({ fetchImpl: mockFetch({}, { ok: false, status: 503 }) })
        .searchPreprints({ indication: "x" }),
      []
    );
    assert.deepEqual(
      await createEuropePmcPreprints({ fetchImpl: async () => { throw new Error("down"); } })
        .searchPreprints({ indication: "x" }),
      []
    );
  });

  it("caches per query", async () => {
    const fetchImpl = mockFetch(SAMPLE);
    const e = createEuropePmcPreprints({ fetchImpl });
    await e.searchPreprints({ indication: "x" });
    await e.searchPreprints({ indication: "x" });
    assert.equal(fetchImpl.calls.length, 1);
  });
});

describe("europepmc-preprints — subjectFrom", () => {
  it("returns '' when nothing usable is present", () => {
    assert.equal(subjectFrom({}), "");
    assert.equal(subjectFrom({ indication: "   " }), "");
    assert.equal(subjectFrom({ indication: 42 }), "");
    assert.equal(subjectFrom(undefined), "");
  });

  it("preserves alias order", () => {
    assert.equal(subjectFrom({ compound_name: "temozolomide", indication: "glioblastoma" }), "glioblastoma temozolomide");
  });
});
