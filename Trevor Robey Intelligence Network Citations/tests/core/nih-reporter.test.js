"use strict";

// nih-reporter.js — NIH RePORTER v2 local fetcher (added 2026-09-19).
//
// Two things here are easy to regress silently and are asserted deliberately:
//   • the endpoint is POST-only (a GET returns 405, which reads like an outage but is not);
//   • tool-prefetch.js renderRecord emits `abstract` BEFORE `description`, so the funding facts
//     are folded into the HEAD of `abstract`. If someone "tidies" them back into `description`
//     they end up buried under ~900 chars of science summary and are the first thing lost to any
//     truncation — for a funding record those facts ARE the point.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  createNihReporter,
  contactPi,
  isoDay,
  usd,
  ABSTRACT_CHARS,
  MAX_LIMIT
} = require("../../openclaw-bridge/mcp/nih-reporter/nih-reporter.js");

function mockFetch(payload, { ok = true, status = 200 } = {}) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: init && init.body ? JSON.parse(init.body) : null });
    return { ok, status, json: async () => payload };
  };
  fn.calls = calls;
  return fn;
}

const SAMPLE = {
  meta: { total: 9347 },
  results: [
    {
      appl_id: 11394494,
      project_num: "5R01NS127824-04",
      project_title: "Targeting macrophage reprogramming in glioblastoma",
      fiscal_year: 2026,
      award_amount: 403028,
      organization: { org_name: "CLEVELAND CLINIC LERNER COM-CWRU" },
      agency_ic_admin: { abbreviation: "NINDS" },
      principal_investigators: [
        { first_name: "Peiwen", last_name: "Chen", full_name: "CHEN, PEIWEN", is_contact_pi: true }
      ],
      project_start_date: "2023-09-01T00:00:00",
      project_end_date: "2028-08-31T00:00:00",
      abstract_text: "Project Summary\nGlioblastoma is the most lethal form of primary brain cancer.",
      project_detail_url: "https://reporter.nih.gov/project-details/11394494"
    },
    {
      project_title: "Sparse record",
      fiscal_year: 2025,
      organization: {},
      project_detail_url: "https://reporter.nih.gov/project-details/2"
    }
  ]
};

describe("nih-reporter — searchFunding", () => {
  it("POSTs (the endpoint rejects GET with 405) and sends the advanced-text-search criteria", async () => {
    const fetchImpl = mockFetch(SAMPLE);
    await createNihReporter({ fetchImpl }).searchFunding({ indication: "glioblastoma", limit: 2 });
    const call = fetchImpl.calls[0];
    assert.equal(call.init.method, "POST");
    assert.equal(call.body.criteria.advanced_text_search.search_text, "glioblastoma");
    assert.equal(call.body.criteria.advanced_text_search.search_field, "projecttitle,abstracttext");
    assert.equal(call.body.limit, 2);
  });

  it("leads the record with the funding facts, not the science summary", async () => {
    const recs = await createNihReporter({ fetchImpl: mockFetch(SAMPLE) })
      .searchFunding({ indication: "glioblastoma" });
    const head = recs[0].abstract.split("\n")[0];
    assert.match(head, /CLEVELAND CLINIC/);
    assert.match(head, /PI: CHEN, PEIWEN/);
    assert.match(head, /FY2026 award \$403,028/);
    assert.match(head, /Funding IC: NINDS/);
    assert.match(head, /Project period 2023-09-01 to 2028-08-31/);
    assert.match(head, /Project 5R01NS127824-04/);
    // The abstract text follows; `description` is intentionally unset so renderRecord cannot
    // reorder the funding facts behind it.
    assert.match(recs[0].abstract, /most lethal form of primary brain cancer/);
    assert.equal(recs[0].description, undefined);
  });

  it("uses the API's own project_detail_url rather than constructing one", async () => {
    const recs = await createNihReporter({ fetchImpl: mockFetch(SAMPLE) })
      .searchFunding({ indication: "x" });
    assert.equal(recs[0].url, "https://reporter.nih.gov/project-details/11394494");
  });

  it("survives a sparse record without inventing values", async () => {
    const recs = await createNihReporter({ fetchImpl: mockFetch(SAMPLE) })
      .searchFunding({ indication: "x" });
    assert.equal(recs[1].title, "Sparse record");
    assert.equal(recs[1].organization, "");
    assert.equal(recs[1].awardAmount, null);
    assert.equal(recs[1].fundingIc, "");
    // No award line fabricated when there is no amount.
    assert.doesNotMatch(recs[1].abstract || "", /award \$/);
  });

  it("truncates the abstract — these records are rendered into an agent prompt", async () => {
    const long = { ...SAMPLE, results: [{ ...SAMPLE.results[0], abstract_text: "x".repeat(5000) }] };
    const recs = await createNihReporter({ fetchImpl: mockFetch(long) }).searchFunding({ indication: "x" });
    const body = recs[0].abstract.split("\n").slice(1).join("\n");
    assert.equal(body.length, ABSTRACT_CHARS);
  });

  it("reports the true denominator separately from the page it returned", async () => {
    const recs = await createNihReporter({ fetchImpl: mockFetch(SAMPLE) })
      .searchFunding({ indication: "x", limit: 1 });
    assert.equal(recs.length, 1);
    assert.equal(recs.totalMatched, 9347);
    assert.deepEqual(Object.keys(recs), ["0"]);
  });

  it("accepts the subject under any of the workflow templates' aliases", async () => {
    for (const key of ["indication", "disease_name", "disease_context", "therapeutic_area", "target_gene", "topic"]) {
      const fetchImpl = mockFetch(SAMPLE);
      await createNihReporter({ fetchImpl }).searchFunding({ [key]: "glioblastoma" });
      assert.equal(
        fetchImpl.calls[0].body.criteria.advanced_text_search.search_text,
        "glioblastoma",
        `alias ${key} should drive the search`
      );
    }
  });

  it("passes optional fiscal-year and active filters only when asked", async () => {
    const plain = mockFetch(SAMPLE);
    await createNihReporter({ fetchImpl: plain }).searchFunding({ indication: "x" });
    assert.equal(plain.calls[0].body.criteria.fiscal_years, undefined);
    assert.equal(plain.calls[0].body.criteria.is_active, undefined);

    const filtered = mockFetch(SAMPLE);
    await createNihReporter({ fetchImpl: filtered })
      .searchFunding({ indication: "x", fiscalYears: [2025, 2026], activeOnly: true });
    assert.deepEqual(filtered.calls[0].body.criteria.fiscal_years, [2025, 2026]);
    assert.equal(filtered.calls[0].body.criteria.is_active, true);
  });

  it("is fail-soft on HTTP errors, thrown transports, and an empty subject", async () => {
    assert.deepEqual(
      await createNihReporter({ fetchImpl: mockFetch({}, { ok: false, status: 500 }) }).searchFunding({ indication: "x" }),
      []
    );
    assert.deepEqual(
      await createNihReporter({ fetchImpl: async () => { throw new Error("down"); } }).searchFunding({ indication: "x" }),
      []
    );
    const fetchImpl = mockFetch(SAMPLE);
    assert.deepEqual(await createNihReporter({ fetchImpl }).searchFunding({}), []);
    assert.equal(fetchImpl.calls.length, 0, "must not spend an HTTP call on an empty subject");
  });

  it("caches per query and keeps the prompt-path ceiling bounded", async () => {
    const fetchImpl = mockFetch(SAMPLE);
    const nih = createNihReporter({ fetchImpl });
    await nih.searchFunding({ indication: "x" });
    await nih.searchFunding({ indication: "x" });
    assert.equal(fetchImpl.calls.length, 1);
    assert.ok(MAX_LIMIT <= 25);
  });
});

describe("nih-reporter — helpers", () => {
  it("contactPi prefers the contact PI and degrades without inventing a name", () => {
    assert.equal(contactPi({ contact_pi_name: "DOE, JANE" }), "DOE, JANE");
    assert.equal(
      contactPi({ principal_investigators: [{ full_name: "A", is_contact_pi: false }, { full_name: "B", is_contact_pi: true }] }),
      "B"
    );
    assert.equal(contactPi({ principal_investigators: [{ first_name: "Ann", last_name: "Lee" }] }), "Ann Lee");
    assert.equal(contactPi({}), "");
  });

  it("isoDay trims RePORTER's timestamps and rejects junk", () => {
    assert.equal(isoDay("2023-09-01T00:00:00"), "2023-09-01");
    assert.equal(isoDay("not a date"), "");
    assert.equal(isoDay(undefined), "");
  });

  it("usd formats real amounts and returns '' for absent or zero ones", () => {
    assert.equal(usd(403028), "$403,028");
    assert.equal(usd(0), "");
    assert.equal(usd(null), "");
    assert.equal(usd("abc"), "");
  });
});
