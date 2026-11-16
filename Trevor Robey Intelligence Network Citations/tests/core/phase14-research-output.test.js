"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createResearchOutputManager } = require("../../openclaw-bridge/core/research-output-manager.js");
const { makeTmpDir, createMutableTimeProvider } = require("./_phase14-helpers.js");

test("phase14 output manager saves output and manifest deterministically", async () => {
  const dir = await makeTmpDir();
  const manager = createResearchOutputManager({
    timeProvider: createMutableTimeProvider(),
    outputDir: path.join(dir, "out")
  });

  const saved = manager.saveOutput("task-abc", "hello world", {
    status: "completed",
    type: "freeform",
    output_format: "markdown",
    provider: "mock",
    model: "mock-v1",
    started_at: "2026-03-05T00:00:00.000Z",
    completed_at: "2026-03-05T00:00:01.000Z"
  });

  assert.ok(saved.output_path.endsWith("output.md"));
  assert.equal(manager.listOutputs().length, 1);

  const manifest = manager.generateOutputManifest();
  assert.ok(manifest.path.endsWith("hash-manifest.json"));
  assert.ok(manifest.files.length >= 3);
});

// T1-5 (2026-11-14): the TYPE:ID keys survive the metadata allowlist; a sidecar written without them
// stays without them, so the gate can tell an untyped (older) record from one that retrieved nothing.
test("phase14 output manager keeps fetched_citation_keys only when the caller passed them", async () => {
  const dir = await makeTmpDir();
  const manager = createResearchOutputManager({ timeProvider: createMutableTimeProvider(), outputDir: path.join(dir, "out") });
  const base = { status: "completed", type: "freeform", output_format: "markdown", provider: "mock", model: "mock-v1",
    started_at: "2026-03-05T00:00:00.000Z", completed_at: "2026-03-05T00:00:01.000Z" };
  const typed = manager.saveOutput("task-typed", "text", {
    ...base, fetched_citation_ids: ["2244", "12345678"], fetched_citation_keys: ["PUBCHEM CID:2244", "PMID:12345678"]
  });
  const typedMeta = JSON.parse(fs.readFileSync(path.join(path.dirname(typed.output_path), "metadata.json"), "utf8"));
  assert.deepEqual(typedMeta.fetched_citation_keys, ["PUBCHEM CID:2244", "PMID:12345678"]);

  const untyped = manager.saveOutput("task-untyped", "text", { ...base, fetched_citation_ids: ["2244"] });
  const untypedMeta = JSON.parse(fs.readFileSync(path.join(path.dirname(untyped.output_path), "metadata.json"), "utf8"));
  assert.ok(!("fetched_citation_keys" in untypedMeta), "absent stays absent (never defaulted to [])");
});
