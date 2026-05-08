/**
 * Tests for zettelkasten-graph-enhancer.mjs
 *
 * Run: node --test tools/zettelkasten-graph-enhancer.test.mjs
 */

import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { loadConfig, enhanceWithGraph, DEFAULT_CONFIG } from "./zettelkasten-graph-enhancer.mjs";

describe("zettelkasten-graph-enhancer — loadConfig", () => {
  it("returns an object with expected keys", () => {
    const config = loadConfig();
    assert.ok(typeof config === "object");
    assert.ok("enabled" in config);
    assert.ok("zettelkastenMcpServerPath" in config);
    assert.ok("nodePath" in config);
    assert.ok("timeoutMs" in config);
  });

  it("defaults enabled to false", () => {
    const config = loadConfig();
    assert.strictEqual(config.enabled, false);
  });

  it("DEFAULT_CONFIG is frozen", () => {
    assert.ok(Object.isFrozen(DEFAULT_CONFIG));
  });

  it("DEFAULT_CONFIG has correct shape", () => {
    assert.strictEqual(DEFAULT_CONFIG.enabled, false);
    assert.strictEqual(typeof DEFAULT_CONFIG.zettelkastenMcpServerPath, "string");
    assert.strictEqual(typeof DEFAULT_CONFIG.nodePath, "string");
    assert.strictEqual(typeof DEFAULT_CONFIG.timeoutMs, "number");
  });
});

describe("zettelkasten-graph-enhancer — enhanceWithGraph", () => {
  it("returns null when disabled", async () => {
    const result = await enhanceWithGraph("some text", "full_zettelkasten_analysis", {
      config: { ...DEFAULT_CONFIG, enabled: false }
    });
    assert.strictEqual(result, null);
  });

  it("returns null for empty text", async () => {
    const result = await enhanceWithGraph("", "full_zettelkasten_analysis", {
      config: { ...DEFAULT_CONFIG, enabled: true }
    });
    assert.strictEqual(result, null);
  });

  it("returns null for whitespace-only text", async () => {
    const result = await enhanceWithGraph("   \n\t  ", "full_zettelkasten_analysis", {
      config: { ...DEFAULT_CONFIG, enabled: true }
    });
    assert.strictEqual(result, null);
  });

  it("returns null for non-string text", async () => {
    const result = await enhanceWithGraph(42, "full_zettelkasten_analysis", {
      config: { ...DEFAULT_CONFIG, enabled: true }
    });
    assert.strictEqual(result, null);
  });

  it("returns null for null text", async () => {
    const result = await enhanceWithGraph(null, "full_zettelkasten_analysis", {
      config: { ...DEFAULT_CONFIG, enabled: true }
    });
    assert.strictEqual(result, null);
  });

  it("uses loadConfig when no config provided and returns null (disabled by default)", async () => {
    const result = await enhanceWithGraph("some text");
    assert.strictEqual(result, null);
  });
});
