"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createOpenClawBridgeAdapter } = require("../../lib/openclaw-bridge-adapter.js");

const SAMPLE_TOOLUNIVERSE = {
  description: "Aspirin is an NSAID used for pain and inflammation",
  mechanism_of_action: "COX-1 and COX-2 inhibition",
  adverse_effects: "GI bleeding, ulcers",
  drug_interactions: "Warfarin increases bleeding risk",
};

describe("OpenClaw bridge adapter", () => {
  it("callTool returns ok:true for valid input", async () => {
    const adapter = createOpenClawBridgeAdapter();
    const result = await adapter.callTool("analyze_network", {
      text: "aspirin reduces inflammation through COX inhibition",
      input_type: "text",
    });
    assert.ok(result.ok);
    assert.ok(result.result);
    assert.ok(result.durationMs >= 0);
  });

  it("callTool returns ok:false for bad input", async () => {
    const adapter = createOpenClawBridgeAdapter();
    const result = await adapter.callTool("analyze_network", { text: "" });
    assert.equal(result.ok, false);
    assert.ok(result.error);
  });

  it("analyzeToolUniverseData processes JSON", async () => {
    const adapter = createOpenClawBridgeAdapter();
    const result = await adapter.analyzeToolUniverseData(SAMPLE_TOOLUNIVERSE);
    assert.ok(result.ok);
    assert.ok(result.result.cross_domain);
    assert.ok(result.result.serendipity);
  });

  it("analyzeToolUniverseData handles string input", async () => {
    const adapter = createOpenClawBridgeAdapter();
    const result = await adapter.analyzeToolUniverseData(JSON.stringify(SAMPLE_TOOLUNIVERSE));
    assert.ok(result.ok);
  });
});
