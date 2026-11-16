"use strict";

// T1-4 (2026-11-14): pins the Crossref behaviour the 2026-11-14 read-only probe recorded
// (tests/fixtures/crossref-probe-2026-11-14/agency-probe.json). An invented suffix on a real publisher
// prefix (Elsevier 10.1016, Springer 10.1007, Wiley 10.1002), and a prefix no agency registered, get
// 404 from Crossref's /works/{doi}/agency and from doi.org, so the re-resolver stamps them UNRESOLVED
// and they block delivery. The existence check does not work by prefix. The real control resolves.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createCitationReresolver } = require("../../openclaw-bridge/mcp/citation-reresolver/citation-reresolver.js");

const PROBE = JSON.parse(fs.readFileSync(
  path.join(__dirname, "..", "fixtures", "crossref-probe-2026-11-14", "agency-probe.json"), "utf8"));

// Replays the probe's recorded answers: the /agency route and the doi.org HEAD, per DOI.
function probeReplay() {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || "GET" });
    for (const c of PROBE.cases) {
      if (url.includes(`api.crossref.org/works/${encodeURIComponent(c.doi)}/agency`)) {
        const body = c.crossref_agency.body;
        // Crossref's 404 body is the plain text "Resource not found.", not JSON.
        return { status: c.crossref_agency.status, ok: c.crossref_agency.status === 200,
          json: async () => { if (typeof body === "string") throw new SyntaxError("not JSON"); return body; },
          text: async () => (typeof body === "string" ? body : JSON.stringify(body)) };
      }
      if (url === `https://doi.org/${c.doi}`) {
        return { status: c.doi_org_head_status, ok: c.doi_org_head_status < 400, json: async () => ({}), text: async () => "" };
      }
    }
    throw new Error(`no recorded probe answer for ${url}`);
  };
  return { fetchImpl, calls };
}

describe("an invented DOI on a real publisher prefix does not resolve (2026-11-14 probe)", () => {
  for (const c of PROBE.cases.filter((x) => x.crossref_agency.status === 404)) {
    it(`${c.label}: ${c.doi} → UNRESOLVED`, async () => {
      const { fetchImpl, calls } = probeReplay();
      const r = await createCitationReresolver({ fetchImpl, nowIso: () => "2026-11-14T00:00:00Z" })
        .resolveOne({ type: "DOI", id: c.doi });
      assert.equal(r.status, "UNRESOLVED");
      assert.equal(r.resolver_type, "fallback", "a Crossref 404 is not final: doi.org is asked too");
      assert.equal(r.evidence.reason, "resource_not_found");
      assert.ok(calls.some((k) => k.url === `https://doi.org/${c.doi}` && k.method === "HEAD"));
    });
  }

  it("the real control DOI resolves VERIFIED on Crossref's agency route", async () => {
    const control = PROBE.cases.find((x) => x.crossref_agency.status === 200);
    const { fetchImpl } = probeReplay();
    const r = await createCitationReresolver({ fetchImpl, nowIso: () => "2026-11-14T00:00:00Z" })
      .resolveOne({ type: "DOI", id: control.doi });
    assert.equal(r.status, "VERIFIED");
    assert.equal(r.resolver_type, "primary");
  });
});
