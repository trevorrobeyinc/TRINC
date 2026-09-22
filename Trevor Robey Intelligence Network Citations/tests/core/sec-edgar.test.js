"use strict";

// sec-edgar.js — SEC EDGAR full-text local fetcher (added 2026-09-19).
//
// The assertions that matter most here are the QUERY GRAMMAR ones. EDGAR's behaviour was measured
// against the live endpoint and is unforgiving: the subject must be quoted or a two-word
// indication ORs into noise, `terms` must NOT be quoted or a caller's `(a OR b)` becomes a literal
// phrase and silently returns zero, and an over-long phrase matches literally and finds nothing.
// A regression in any of those produces an empty or misleading result set with no error.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  createSecEdgar,
  parseDisplayName,
  filingUrl,
  describeItems,
  MAX_LIMIT
} = require("../../openclaw-bridge/mcp/sec-edgar/sec-edgar.js");

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
  hits: {
    total: { value: 155 },
    hits: [
      {
        _id: "0001564590-20-047276:pstv-ex991_6.htm",
        _source: {
          ciks: ["0001095981"],
          display_names: ["PLUS THERAPEUTICS, INC.  (PSTV)  (CIK 0001095981)"],
          adsh: "0001564590-20-047276",
          form: "8-K",
          root_forms: ["8-K"],
          file_date: "2020-10-22",
          file_type: "EX-99.1",
          biz_locations: ["Austin, TX"],
          items: ["2.02", "9.01"]
        }
      },
      {
        _id: "0001104659-20-034139:x.htm",
        _source: {
          ciks: ["0001680048"],
          display_names: ["MUSTANG BIO, INC.  (MBIO)  (CIK 0001680048)"],
          adsh: "0001104659-20-034139",
          form: "8-K",
          file_date: "2020-03-16",
          // An item code NOT in the SEC-defined map — must render bare, never invented.
          items: ["4.99"]
        }
      }
    ]
  }
};

describe("sec-edgar — searchDisclosures", () => {
  it("parses hits into prompt-ready records with a resolvable filing URL", async () => {
    const fetchImpl = mockFetch(SAMPLE);
    const sec = createSecEdgar({ fetchImpl });
    const recs = await sec.searchDisclosures({ indication: "glioblastoma", limit: 5 });

    assert.equal(recs.length, 2);
    assert.match(recs[0].title, /PLUS THERAPEUTICS/);
    assert.match(recs[0].title, /\(PSTV\)/);
    assert.match(recs[0].title, /8-K, 2020-10-22/);
    assert.equal(recs[0].year, "2020");
    assert.equal(recs[0].ticker, "PSTV");
    assert.equal(recs[0].cik, "0001095981");
    assert.equal(recs[0].accessionNumber, "0001564590-20-047276");
    // Leading zeros stripped from the CIK path segment, dashes stripped from the directory.
    assert.equal(
      recs[0].url,
      "https://www.sec.gov/Archives/edgar/data/1095981/000156459020047276/0001564590-20-047276-index.htm"
    );
  });

  it("decodes 8-K item codes to their SEC-defined meanings and leaves unmapped codes bare", async () => {
    const fetchImpl = mockFetch(SAMPLE);
    const recs = await createSecEdgar({ fetchImpl }).searchDisclosures({ indication: "x" });
    assert.match(recs[0].description, /2\.02 \(Results of Operations and Financial Condition\)/);
    // Never invent a label for a code the SEC form instructions don't define.
    assert.match(recs[1].description, /Items: 4\.99/);
    assert.doesNotMatch(recs[1].description, /4\.99 \(/);
  });

  it("states plainly that EDGAR returns metadata, so nothing implies the filing was quoted", async () => {
    const fetchImpl = mockFetch(SAMPLE);
    const recs = await createSecEdgar({ fetchImpl }).searchDisclosures({ indication: "x" });
    assert.match(recs[0].description, /metadata only/i);
  });

  it("QUOTES the subject but passes `terms` through VERBATIM", async () => {
    // Quoting `terms` would turn a parenthesised OR into a literal phrase and return zero —
    // the exact bug this asserts against.
    const fetchImpl = mockFetch(SAMPLE);
    const sec = createSecEdgar({ fetchImpl });
    await sec.searchDisclosures({
      indication: "multiple myeloma",
      terms: "(discontinued OR terminated)"
    });
    const q = decodeURIComponent(new URL(fetchImpl.calls[0].url).searchParams.get("q"));
    assert.equal(q, '"multiple myeloma" (discontinued OR terminated)');
  });

  it("accepts the indication under any of the workflow templates' aliases", async () => {
    // Each template names the indication field differently; binding only `indication` starves
    // this source on most runs — the same trap ctgov-supplemental documents.
    for (const key of ["indication", "disease_name", "disease_context", "therapeutic_area", "topic"]) {
      const fetchImpl = mockFetch(SAMPLE);
      await createSecEdgar({ fetchImpl }).searchDisclosures({ [key]: "glioblastoma" });
      const q = decodeURIComponent(new URL(fetchImpl.calls[0].url).searchParams.get("q"));
      assert.equal(q, '"glioblastoma"', `alias ${key} should drive the query`);
    }
  });

  it("an explicit query wins over the subject keys", async () => {
    const fetchImpl = mockFetch(SAMPLE);
    await createSecEdgar({ fetchImpl }).searchDisclosures({
      indication: "ignored",
      query: '"CAR-T" -"myeloma"'
    });
    const q = decodeURIComponent(new URL(fetchImpl.calls[0].url).searchParams.get("q"));
    assert.equal(q, '"CAR-T" -"myeloma"');
  });

  it("clamps limit and defaults to 8-K", async () => {
    const fetchImpl = mockFetch(SAMPLE);
    await createSecEdgar({ fetchImpl }).searchDisclosures({ indication: "x", limit: 9999 });
    const url = new URL(fetchImpl.calls[0].url);
    assert.equal(url.searchParams.get("forms"), "8-K");
    // The clamp governs how many records are RETURNED; the fixture only has two.
    const recs = await createSecEdgar({ fetchImpl: mockFetch(SAMPLE) })
      .searchDisclosures({ indication: "x", limit: 1 });
    assert.equal(recs.length, 1);
    assert.ok(MAX_LIMIT <= 25, "prompt-path ceiling must stay bounded");
  });

  it("sends a declared User-Agent — SEC fair access throttles undeclared clients", async () => {
    const fetchImpl = mockFetch(SAMPLE);
    await createSecEdgar({ fetchImpl, contactEmail: "ops@example.com", org: "Example LLC" })
      .searchDisclosures({ indication: "x" });
    assert.equal(fetchImpl.calls[0].init.headers["User-Agent"], "Example LLC ops@example.com");
  });

  it("reports the true denominator separately from the page it returned", async () => {
    const recs = await createSecEdgar({ fetchImpl: mockFetch(SAMPLE) })
      .searchDisclosures({ indication: "x", limit: 1 });
    assert.equal(recs.length, 1);
    assert.equal(recs.totalMatched, 155);
    // Non-enumerable, so it never serializes as an array element.
    assert.deepEqual(Object.keys(recs), ["0"]);
  });

  it("is fail-soft: an HTTP error returns [] rather than breaking the run", async () => {
    const fetchImpl = mockFetch({}, { ok: false, status: 403 });
    const recs = await createSecEdgar({ fetchImpl }).searchDisclosures({ indication: "x" });
    assert.deepEqual(recs, []);
  });

  it("is fail-soft: a thrown transport error returns []", async () => {
    const recs = await createSecEdgar({
      fetchImpl: async () => { throw new Error("network down"); }
    }).searchDisclosures({ indication: "x" });
    assert.deepEqual(recs, []);
  });

  it("skips the call entirely when no subject is supplied", async () => {
    const fetchImpl = mockFetch(SAMPLE);
    const recs = await createSecEdgar({ fetchImpl }).searchDisclosures({});
    assert.deepEqual(recs, []);
    assert.equal(fetchImpl.calls.length, 0, "must not spend an HTTP call on an empty subject");
  });

  it("caches per query so two identical prefetch calls cost one request", async () => {
    const fetchImpl = mockFetch(SAMPLE);
    const sec = createSecEdgar({ fetchImpl });
    await sec.searchDisclosures({ indication: "x" });
    await sec.searchDisclosures({ indication: "x" });
    assert.equal(fetchImpl.calls.length, 1);
  });
});

describe("sec-edgar — helpers", () => {
  it("parseDisplayName splits EDGAR's pre-formatted label", () => {
    const p = parseDisplayName("PLUS THERAPEUTICS, INC.  (PSTV)  (CIK 0001095981)");
    assert.equal(p.company, "PLUS THERAPEUTICS, INC.");
    assert.equal(p.ticker, "PSTV");
    assert.equal(p.cik, "0001095981");
  });

  it("parseDisplayName degrades to the raw string rather than inventing a company name", () => {
    const p = parseDisplayName("SOME ODD FORMAT");
    assert.equal(p.company, "SOME ODD FORMAT");
    assert.equal(p.ticker, "");
    assert.equal(p.cik, "");
    assert.deepEqual(parseDisplayName(undefined), { company: "", ticker: "", cik: "" });
  });

  it("filingUrl returns '' on missing parts instead of a broken link", () => {
    assert.equal(filingUrl("", "0001-20-1"), "");
    assert.equal(filingUrl("0001095981", ""), "");
  });

  it("describeItems only decodes 8-K codes", () => {
    assert.match(describeItems("8-K", ["1.02"]), /Termination of a Material Definitive Agreement/);
    // A 10-K has no such item vocabulary — list the codes, don't reinterpret them.
    assert.equal(describeItems("10-K", ["1.02"]), "Items: 1.02");
    assert.equal(describeItems("8-K", []), "");
  });
});
