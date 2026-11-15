"use strict";

// T1-3 (2026-11-14), end to end through the real engine, packager and approval: an untraced identifier
// is flagged [UNVERIFIED] at EVERY mention in the sealed report and in its citation index, and a section
// whose marks cannot be written stops the run (PHASE30_CITATION_ANNOTATE_FAILED) — the write error used
// to be swallowed. Only the model call (and, in the attribution case, the registries) are faked.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createCitationReresolver } = require("../../openclaw-bridge/mcp/citation-reresolver/citation-reresolver.js");
const { FULL_PIPELINE, makeEngine, workflowDef } = require("../helpers/workflow-bundle-harness.js");
const { writeJson, writeTaskText } = require("../helpers/phase20-fixtures.js");

const UNTRACED = "12345678";
// 4 of the 5 cited ids were retrieved (ratio 0.8, PASS); PMID 12345678 was not, and is cited twice.
const SECTION = [
  "Trials NCT01111111 and NCT02222222 established the comparator arm (PMID: 23456789).",
  "A pooled analysis (PMID: 34567890) agrees on the effect size.",
  `An older cohort study by Smith et al. (PMID: ${UNTRACED}) reported a smaller effect.`,
  `As noted above (PMID: ${UNTRACED}), the effect was not replicated.`
].join("\n");
const RETRIEVED = ["NCT01111111", "NCT02222222", "23456789", "34567890"];
const RETRIEVED_KEYS = ["NCT:NCT01111111", "NCT:NCT02222222", "PMID:23456789", "PMID:34567890"];

function spawnerWriting(rootDir, { readOnly = false } = {}) {
  return {
    spawnMission: async (envelope) => {
      const outputPath = writeTaskText(rootDir, "task-unverified-marks-1", SECTION, {
        fetched_citation_ids: RETRIEVED,
        fetched_citation_keys: RETRIEVED_KEYS,
        rights: { commercial_use_allowed: true, redistribution_allowed: true },
        source_domain: "approved.example"
      });
      // The section cannot be rewritten: the [UNVERIFIED] marks can never land in it.
      if (readOnly) fs.chmodSync(outputPath, 0o444);
      const missionRoot = path.join(rootDir, "workspace", "missions", envelope.mission_id);
      const subtask = { subtask_id: "sub-1", output_path: outputPath, status: "completed" };
      writeJson(path.join(missionRoot, "mission.json"), envelope);
      writeJson(path.join(missionRoot, "status.json"), { status: "completed" });
      writeJson(path.join(missionRoot, "artifacts", "mission-summary.json"), { subtask_results: [subtask] });
      return { ok: true, subtask_results: [{ ...subtask, metadata_path: path.join(path.dirname(outputPath), "metadata.json") }] };
    }
  };
}

async function engineWith(opts = {}, researchExtras = {}) {
  const holder = {};
  const made = await makeEngine({}, {
    researchExtras: { ...researchExtras, agentSpawner: { spawnMission: (envelope) => holder.spawner.spawnMission(envelope) } }
  });
  holder.spawner = spawnerWriting(made.rootDir, opts);
  return made;
}

const marksOf = (text, id) => text.split(`${id} [UNVERIFIED]`).length - 1;

describe("[UNVERIFIED] reaches the sealed report at every mention (T1-3)", () => {
  it("both mentions, the Citation Summary, tables.csv and the integrity ledger flag the untraced PMID", async () => {
    const { engine, rootDir } = await engineWith();
    const result = await engine.executeWorkflow(workflowDef(FULL_PIPELINE));
    assert.equal(result.ok, true, `workflow failed: ${JSON.stringify(result.error)}`);

    const deliverables = path.join(rootDir, "workspace", "releases", result.artifacts.offer_id, "deliverables");
    const report = fs.readFileSync(path.join(deliverables, "report.md"), "utf8");
    const [sections, summary] = report.split('<a id="citation-summary"></a>');
    assert.equal(marksOf(sections, UNTRACED), 2, "each in-text mention carries the mark");
    assert.equal(marksOf(summary, UNTRACED), 1, "the Citation Summary flags it too");
    for (const traced of ["23456789", "34567890", "NCT01111111", "NCT02222222"]) {
      assert.equal(marksOf(report, traced), 0, `${traced} was retrieved and is not flagged`);
    }

    const csv = fs.readFileSync(path.join(deliverables, "tables.csv"), "utf8").trim().split("\n");
    assert.match(csv[0], /,grounded_in_run$/);
    const row = (id) => csv.find((l) => l.split(",")[1] === id || l.includes(`,${id},`));
    assert.match(row(UNTRACED), /,no$/);
    assert.match(row("23456789"), /,yes$/);

    const ledger = fs.readFileSync(path.join(deliverables, "citation-integrity.md"), "utf8");
    assert.match(ledger, new RegExp(`- PMID:${UNTRACED}`));
    assert.match(ledger, /Matched on \| identifier type and number/);
  });

  it("a section the marks cannot be written to fails the run and seals nothing", async () => {
    const { engine, rootDir } = await engineWith({ readOnly: true });
    const result = await engine.executeWorkflow(workflowDef(FULL_PIPELINE));
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "PHASE30_CITATION_ANNOTATE_FAILED");
    const releases = path.join(rootDir, "workspace", "releases");
    const sealed = fs.existsSync(releases) ? fs.readdirSync(releases).filter((n) => n.startsWith("offer-")) : [];
    assert.deepEqual(sealed, [], "no release was packaged");
  });

  // Critic #16: the [UNVERIFIED] mark lands before the attribution annotator rewrites the same files.
  it("a line whose PMID is both untraced and misattributed carries both marks", async () => {
    const registry = async (url) => {
      const pmid = /[?&]id=(\d+)/.exec(url);
      if (url.includes("esummary") && pmid) {
        const body = { result: { [pmid[1]]: { uid: pmid[1], title: "A record", authors: [{ name: "Jones AB", authtype: "Author" }], pubdate: "2019" } } };
        return { status: 200, ok: true, json: async () => body, text: async () => JSON.stringify(body) };
      }
      const nct = /studies\/(NCT\d{8})/.exec(url);
      if (nct) {
        const body = { protocolSection: { identificationModule: { nctId: nct[1] } } };
        return { status: 200, ok: true, json: async () => body, text: async () => JSON.stringify(body) };
      }
      throw new Error(`no fake registry route for ${url}`);
    };
    const reresolver = createCitationReresolver({ fetchImpl: registry, nowIso: () => "2026-11-14T00:00:00Z", sleep: async () => {} });
    const { engine, rootDir } = await engineWith({}, { citationReresolver: reresolver });
    const result = await engine.executeWorkflow(workflowDef(FULL_PIPELINE));
    assert.equal(result.ok, true, `workflow failed: ${JSON.stringify(result.error)}`);

    const deliverables = path.join(rootDir, "workspace", "releases", result.artifacts.offer_id, "deliverables");
    const report = fs.readFileSync(path.join(deliverables, "report.md"), "utf8");
    const line = report.split("\n").find((l) => l.includes("Smith et al."));
    assert.ok(line.includes("[UNVERIFIED]"), `untraced mark missing: ${line}`);
    assert.ok(line.includes("[ATTRIBUTION MISMATCH: registry lists Jones, 2019]"), `attribution mark missing: ${line}`);
    const manifest = JSON.parse(fs.readFileSync(path.join(deliverables, "reproducibility-manifest.json"), "utf8"));
    assert.ok(manifest.summary.attribution_check.marked_lines >= 1);
  });
});
