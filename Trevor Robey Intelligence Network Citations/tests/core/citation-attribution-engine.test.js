"use strict";

// End-to-end: the attribution check runs inside the real workflow engine and reaches the SEALED
// bundle a buyer receives. Only the model call and the registries are faked; the citation gate,
// re-resolver, manifest, packager and approval run for real (tests/helpers/workflow-bundle-harness.js).
// Fixture modelled on run #7 (workflow-e5947dccdce0e06fde1884b5), whose report credited Feldman et
// al.'s Lancet 2022 review (10.1016/s0140-6736(22)01272-7) to "Chio et al.".

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createCitationReresolver } = require("../../openclaw-bridge/mcp/citation-reresolver/citation-reresolver.js");
const { FULL_PIPELINE, GROUNDED_NCT, listFiles, makeEngine, workflowDef } = require("../helpers/workflow-bundle-harness.js");
const { writeJson, writeTaskText } = require("../helpers/phase20-fixtures.js");

const FELDMAN_DOI = "10.1016/s0140-6736(22)01272-7";
const HARDIMAN_DOI = "10.1038/nrdp.2017.71";

function registryFetch() {
  const routes = [
    { match: "/agency", body: { status: "ok", "message-type": "work-agency" } },
    { match: "works/10.1016%2Fs0140-6736(22)01272-7", body: { status: "ok", message: {
      author: [{ family: "Feldman" }, { family: "Goutman" }, { family: "Petri" }], issued: { "date-parts": [[2022]] }
    } } },
    { match: "works/10.1038%2Fnrdp.2017.71", body: { status: "ok", message: {
      author: [{ family: "Hardiman" }, { family: "Al-Chalabi" }, { family: "Chio" }], issued: { "date-parts": [[2017]] }
    } } },
    // T2-6 (2026-11-16): NCT numbers are asked in batches (`filter.ids`) first.
    { match: `filter.ids=${GROUNDED_NCT}`, body: { studies: [{ protocolSection: { identificationModule: { nctId: GROUNDED_NCT } } }] } },
    { match: `studies/${GROUNDED_NCT}`, body: { protocolSection: { identificationModule: { nctId: GROUNDED_NCT } } } }
  ];
  return async (url) => {
    const route = routes.find((r) => url.includes(r.match));
    if (!route) throw new Error(`no fake registry route for ${url}`);
    return { status: 200, ok: true, json: async () => route.body, text: async () => JSON.stringify(route.body) };
  };
}

function spawnerWriting(rootDir, captured) {
  return {
    spawnMission: async (envelope) => {
      captured.envelope = envelope;
      const text = [
        `Comparable programs include trial ${GROUNDED_NCT}.`,
        "",
        "| Author / Source | Year | Identifier | Key Finding |",
        "|---|---|---|---|",
        `| Hardiman et al. / Nat Rev Dis Primers | 2017 | doi: ${HARDIMAN_DOI} | ALSFRS-R and survival as endpoints |`,
        `| Chio et al. / Lancet | 2022 | doi: ${FELDMAN_DOI} | ALSFRS-R slope + survival |`
      ].join("\n");
      const outputPath = writeTaskText(rootDir, "task-attribution-1", text, {
        fetched_citation_ids: [GROUNDED_NCT, FELDMAN_DOI.toUpperCase(), HARDIMAN_DOI.toUpperCase()],
        rights: { commercial_use_allowed: true, redistribution_allowed: true },
        source_domain: "approved.example"
      });
      const missionRoot = path.join(rootDir, "workspace", "missions", envelope.mission_id);
      const subtask = { subtask_id: "sub-1", output_path: outputPath, status: "completed" };
      writeJson(path.join(missionRoot, "mission.json"), envelope);
      writeJson(path.join(missionRoot, "status.json"), { status: "completed" });
      writeJson(path.join(missionRoot, "artifacts", "mission-summary.json"), { subtask_results: [subtask] });
      return { ok: true, subtask_results: [{ ...subtask, metadata_path: path.join(path.dirname(outputPath), "metadata.json") }] };
    }
  };
}

describe("attribution check — through the real engine into the sealed bundle", () => {
  it("flags the run, marks the wrong attribution inline, and leaves the right one alone", async () => {
    const captured = {};
    const reresolver = createCitationReresolver({ fetchImpl: registryFetch(), nowIso: () => "2026-11-04T00:00:00Z" });
    // makeEngine builds the root first; the spawner needs it, so wire it through a late-bound holder.
    const holder = {};
    const { engine, rootDir } = await makeEngine(captured, {
      researchExtras: {
        citationReresolver: reresolver,
        agentSpawner: { spawnMission: (envelope) => holder.spawner.spawnMission(envelope) }
      }
    });
    holder.spawner = spawnerWriting(rootDir, captured);

    const result = await engine.executeWorkflow(workflowDef(FULL_PIPELINE));
    assert.equal(result.ok, true, `workflow failed: ${JSON.stringify(result.error)}`);

    const bundleDir = path.join(rootDir, "workspace", "releases", result.artifacts.offer_id);
    const manifest = JSON.parse(fs.readFileSync(path.join(bundleDir, "deliverables", "reproducibility-manifest.json"), "utf8"));
    assert.equal(manifest.summary.delivery_decision, "DELIVER_WITH_FLAGS");
    assert.deepEqual(manifest.summary.flag_reasons, ["attribution_mismatch"]);
    assert.equal(manifest.summary.counts.verified, manifest.summary.counts.total, "every identifier still resolved");
    assert.equal(manifest.summary.attribution_check.counts.matched, 1, "Hardiman et al. is right");
    assert.equal(manifest.summary.attribution_check.mismatches.length, 1);
    assert.equal(manifest.summary.attribution_check.mismatches[0].registry_label, "Feldman et al., 2022");

    const report = fs.readFileSync(path.join(bundleDir, "deliverables", "report.md"), "utf8");
    assert.ok(report.includes(`doi: ${FELDMAN_DOI} [ATTRIBUTION MISMATCH: registry lists Feldman et al., 2022]`),
      "the buyer's report carries the mark beside the wrong attribution");
    assert.equal(report.split("[ATTRIBUTION MISMATCH").length - 1, 1, "the correct Hardiman row is not marked");

    assert.equal(manifest.summary.attribution_check.marked_lines, 1, "the manifest records the mark actually written");
    assert.equal(manifest.summary.attribution_check.counts.mismatched_works, 1);

    const claim = listFiles(bundleDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => fs.readFileSync(f, "utf8"))
      .find((t) => t.includes("does not match the registry record"));
    assert.ok(claim, "the bundle's re-resolution sentence states the mismatch instead of a full-strength claim");
    assert.match(claim, /all \d+ resolved VERIFIED\. Of the VERIFIED, 1 cited work carries an author or year in the report that does not match the registry record and is marked \[ATTRIBUTION MISMATCH\] in the report\./);
    assert.match(report, /1 cited work with an author\/year that does not match the registry \(see the Reproducibility Manifest\)/,
      "the report's own Citation Summary states it too");
  });
});
