import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { preparePublish, confirmPublish, readiness, runbook } = require("../src/publish.js");
const { ENTITY_DISCLOSURE, FOUNDER_LOCKUP, CHANNELS } = require("../src/config.js");

const CLEAN = `A hook that says something true.\n\n${FOUNDER_LOCKUP}\n\n${ENTITY_DISCLOSURE}`;

describe("publish readiness", () => {
  it("reports every channel as not ready, with actionable blockers", () => {
    for (const channel of CHANNELS) {
      const state = readiness(channel);
      assert.equal(state.ready, false, `${channel} must not be publishable without setup`);
      assert.ok(state.blockers.length > 0);
      for (const blocker of state.blockers) {
        assert.ok(blocker.resolve.length > 0, "every blocker must say how to clear it");
        assert.ok(typeof blocker.layer === "number");
      }
    }
  });

  it("gives a real, channel-specific runbook", () => {
    assert.match(runbook("youtube"), /YouTube Data API/);
    assert.match(runbook("tiktok"), /Content Posting API/);
    assert.match(runbook("instagram"), /App Review/);
    assert.match(runbook("facebook_page"), /Business Verification/);
  });

  it("tells the operator to store the token themselves", () => {
    for (const channel of CHANNELS) {
      assert.match(runbook(channel), /Claude must not run this/);
    }
  });
});

describe("publish handshake", () => {
  it("BLOCKS and sends nothing when no credential exists", () => {
    const result = preparePublish("tiktok", { text: CLEAN }, { claims: [] });
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.would_publish, false);
    assert.equal(result.nonce, undefined, "no nonce is issued for a blocked channel");
  });

  it("BLOCKS a draft that fails the compliance gate, independent of credentials", () => {
    const result = preparePublish("tiktok", { text: "Zero hallucinations." }, { claims: [] });
    assert.equal(result.status, "BLOCKED");
    assert.ok(result.blockers.some((b) => b.layer === 5));
  });

  it("BLOCKS a draft with unfilled VERIFY slots so they cannot publish literally", () => {
    const withSlot = CLEAN.replace("something true", "[VERIFY:1]");
    const result = preparePublish("tiktok", { text: withSlot }, { claims: [] });
    assert.ok(result.blockers.some((b) => /VERIFY/.test(b.blocker)));
  });

  it("refuses an unknown channel", () => {
    assert.throws(
      () => preparePublish("mastodon", { text: CLEAN }, { claims: [] }),
      (error) => error.code === "TRINC_CONTENT_CHANNEL_UNKNOWN"
    );
  });

  it("refuses an unknown nonce", () => {
    assert.throws(
      () => confirmPublish("tiktok", "deadbeef"),
      (error) => error.code === "TRINC_CONTENT_NONCE_UNKNOWN"
    );
  });

  it("reports each blocker as an independent layer", () => {
    const result = preparePublish("youtube", { text: "Zero hallucinations." }, { claims: [] });
    const layers = new Set(result.blockers.map((b) => b.layer));
    assert.ok(layers.size >= 2, "gate failure and credential absence are separate layers");
    assert.match(result.note, /independent layer/);
  });
});
