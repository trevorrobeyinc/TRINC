"use strict";

// B1 review (2026-11-15): the company tagline is pinned in three places that must agree: OFFERINGS.md:3
// (the canon), the engine's social adapter, and the trinc-content MCP's content gate. After the canon
// moved to "Every citation, checked. ...", the content gate still required the retired "Every claim,
// sourced." as the company lockup and did not list it as retired, so it warned on the correct copy and
// passed the retired claim. Its own tests import its own constant, so nothing caught the drift.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ENGINE = path.resolve(__dirname, "..", "..");
const REPO = path.resolve(ENGINE, "..");

function canonTagline() {
  const line = fs.readFileSync(path.join(ENGINE, "OFFERINGS.md"), "utf8").split("\n")[2] || "";
  const m = /^>\s*\*(.+)\*\s*$/.exec(line);
  return m ? m[1] : null;
}

describe("the company tagline agrees with OFFERINGS.md:3 wherever it is pinned", () => {
  const canon = canonTagline();

  it("OFFERINGS.md:3 carries the tagline as an italic blockquote", () => {
    assert.ok(canon, "OFFERINGS.md line 3 is not `> *<tagline>*`");
    assert.doesNotMatch(canon, /every\s+claim,?\s+sourced/i, "the retired line must not come back");
  });

  it("the engine's social adapter closes company copy on the canon", () => {
    const { COMPANY_TAGLINE } = require("../../openclaw-bridge/monetization/adapters/social-content-adapter.js");
    assert.equal(COMPANY_TAGLINE, canon);
  });

  it("the trinc-content gate requires the canon and flags the retired line", () => {
    const tc = require(path.join(REPO, "Claude", "trinc-content-mcp", "src", "config.js"));
    assert.equal(tc.COMPANY_TAGLINE, canon);
    assert.ok(tc.RETIRED_CLAIMS.some((r) => r.pattern.test("Every claim, sourced.")), "'Every claim, sourced.' is a retired claim");
    assert.ok(!tc.RETIRED_CLAIMS.some((r) => r.pattern.test(canon)), "the canon is not itself a retired claim");
  });
});
