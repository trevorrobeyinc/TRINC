import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { checkDraft, statedNumbers } = require("../src/check.js");
const { ENTITY_DISCLOSURE, COMPANY_TAGLINE, FOUNDER_LOCKUP } = require("../src/config.js");

const D = ENTITY_DISCLOSURE;

describe("compliance gate", () => {
  it("passes clean founder-voice copy", () => {
    const result = checkDraft(
      { channel: "tiktok", text: `A hook.\n\n${FOUNDER_LOCKUP}\n\n${D}` },
      { claims: [] }
    );
    assert.equal(result.verdict, "PASS");
    assert.equal(result.fail_count, 0);
  });

  it("FAILS when the wrong lockup appears on a channel", () => {
    const result = checkDraft(
      { channel: "tiktok", text: `A hook.\n\n${COMPANY_TAGLINE}\n\n${D}` },
      { claims: [] }
    );
    assert.equal(result.verdict, "FAIL");
    assert.ok(result.findings.some((f) => f.code === "VOICE_MIXED"));
  });

  it("FAILS a company channel carrying the founder lockup", () => {
    const result = checkDraft(
      { channel: "youtube", text: `A hook.\n\n${FOUNDER_LOCKUP}\n\n${D}` },
      { claims: [] }
    );
    assert.ok(result.findings.some((f) => f.code === "VOICE_MIXED"));
  });

  it("FAILS a channel with no declared voice rather than guessing", () => {
    const result = checkDraft({ channel: "mastodon", text: `hi\n\n${D}` }, { claims: [] });
    assert.equal(result.verdict, "FAIL");
    assert.ok(result.findings.some((f) => f.code === "VOICE_UNKNOWN"));
  });

  it("FAILS when the entity disclosure is missing", () => {
    const result = checkDraft(
      { channel: "youtube", text: `A post.\n\n${COMPANY_TAGLINE}` },
      { claims: [] }
    );
    assert.ok(result.findings.some((f) => f.code === "DISCLOSURE_MISSING"));
  });

  it("FAILS a paraphrased disclosure — it must be verbatim", () => {
    const paraphrased = "Trevor Robey, INC. is a wordmark of an LLC in California.";
    const result = checkDraft(
      { channel: "youtube", text: `A post.\n\n${COMPANY_TAGLINE}\n\n${paraphrased}` },
      { claims: [] }
    );
    assert.ok(result.findings.some((f) => f.code === "DISCLOSURE_MISSING"));
  });

  it("FAILS retired claims, naming where each was retired", () => {
    for (const phrase of ["Zero hallucinations", "no hallucinated references", "no fabricated data"]) {
      const result = checkDraft(
        { channel: "youtube", text: `${phrase} here.\n\n${COMPANY_TAGLINE}\n\n${D}` },
        { claims: [] }
      );
      const hit = result.findings.find((f) => f.code === "RETIRED_CLAIM");
      assert.ok(hit, `'${phrase}' must be caught`);
      assert.ok(hit.detail.length > 0, "must say where it was retired and what to say instead");
    }
  });

  it("FAILS metrics this stack cannot measure", () => {
    const result = checkDraft(
      { channel: "instagram", text: `We hit 12,000 followers.\n\n${FOUNDER_LOCKUP}\n\n${D}` },
      { claims: [] }
    );
    assert.ok(result.findings.some((f) => f.code === "UNBOUNDED_METRIC"));
  });

  it("FAILS a figure that is not in the supplied claim set", () => {
    const result = checkDraft(
      { channel: "tiktok", text: `We checked 9999 identifiers.\n\n${FOUNDER_LOCKUP}\n\n${D}` },
      { claims: [{ id: "citations_grounded", value: 50 }] }
    );
    assert.equal(result.verdict, "FAIL");
    assert.ok(result.findings.some((f) => f.code === "FIGURE_NOT_IN_CLAIM_SET"));
  });

  it("ACCEPTS a figure that is in the claim set", () => {
    const result = checkDraft(
      { channel: "tiktok", text: `We checked 50 identifiers.\n\n${FOUNDER_LOCKUP}\n\n${D}` },
      { claims: [{ id: "citations_grounded", value: 50 }] }
    );
    assert.equal(result.verdict, "PASS");
  });

  it("downgrades figure checking to a warning when no claims were supplied", () => {
    const result = checkDraft(
      { channel: "tiktok", text: `We checked 50 identifiers.\n\n${FOUNDER_LOCKUP}\n\n${D}` },
      { claims: [] }
    );
    const hit = result.findings.find((f) => f.code === "FIGURE_NOT_IN_CLAIM_SET");
    assert.ok(hit);
    assert.equal(hit.severity, "warn", "advisory without a claim set, not a block");
    assert.equal(result.verdict, "PASS");
  });

  it("treats unfilled VERIFY slots as a warning, not a failure — a draft is not a defect", () => {
    const result = checkDraft(
      { channel: "tiktok", text: `We checked [VERIFY:1] identifiers.\n\n${FOUNDER_LOCKUP}\n\n${D}` },
      { claims: [] }
    );
    assert.equal(result.verdict, "PASS");
    assert.ok(result.findings.some((f) => f.code === "UNFILLED_VERIFY_SLOTS" && f.severity === "warn"));
  });

  it("FAILS an empty draft", () => {
    const result = checkDraft({ channel: "tiktok", text: "   " }, { claims: [] });
    assert.equal(result.verdict, "FAIL");
    assert.ok(result.findings.some((f) => f.code === "EMPTY_DRAFT"));
  });
});

describe("statedNumbers", () => {
  it("ignores hex colours, years and VERIFY slot ids", () => {
    const found = statedNumbers("Use #0a0a0f in 2026 for [VERIFY:3] items.");
    assert.deepEqual(found.map((entry) => entry.value), []);
  });

  it("finds real figures including comma-grouped ones", () => {
    const found = statedNumbers("We checked 50 identifiers and 12,000 rows.");
    assert.deepEqual(found.map((entry) => entry.value).sort((a, b) => a - b), [50, 12000]);
  });
});
