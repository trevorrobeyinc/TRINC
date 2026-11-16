"use strict";

// The engine must never instruct its model with a word its own shipment gate bans.
//
// Found by the fourth real run (2026-10-08): it finished the mission, the quality check and the dataset, then
// died at the package step with "DrugBank reference/identifier found in shipped content - no license to
// redistribute." The offending text was the synthesizer's own closing line, "No DrugBank fields used." - a
// compliant sentence that the gate (license-allowlist.js, which rejects the bare word anywhere in shipped content)
// cannot tell from a violation. The model had been told to write it, twice over and in contradiction:
//   - config/role-prompts.json (last edited 2026-05-19, five weeks BEFORE the gate existed) told this template's
//     roles to attach "a PubChem CID or DrugBank ID" to every drug, and told the safety role to fill a
//     "DrugBank ID" table column;
//   - config/agents/*/SOUL.md (2026-07) told the same roles "No DrugBank fields".
// The model reconciled the two at random: the clause showed up in 1 of 25 stored role outputs, which is why earlier
// runs shipped. The fix is to keep the banned word out of everything the model is instructed with (a positive list of
// the identifier types it may use), and this test keeps it out: an instruction that names a banned source invites the
// model to echo it, and a bundle that echoes it cannot ship.
//
// The gate is deliberately NOT relaxed - its header says its constraints are hard - so the last test pins that too.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { assertNoBannedContent } = require("../../openclaw-bridge/distribution/license-allowlist.js");

const ROOT = path.resolve(__dirname, "../..");

// Everything the model is instructed with: the per-role prompts, the mission and workflow templates that become the
// task description, and each role's persistent identity files.
function modelFacingInstructionFiles() {
  const rels = ["config/role-prompts.json", "config/mission-templates.json"];
  for (const name of fs.readdirSync(path.join(ROOT, "config", "workflow-templates")).sort()) {
    if (name.endsWith(".json")) rels.push(`config/workflow-templates/${name}`);
  }
  const agentsDir = path.join(ROOT, "config", "agents");
  for (const role of fs.readdirSync(agentsDir).sort()) {
    for (const file of ["SOUL.md", "AGENTS.md"]) {
      rels.push(`config/agents/${role}/${file}`);
    }
  }
  return rels.filter((rel) => fs.existsSync(path.join(ROOT, rel)));
}

function bannedLines(text) {
  const hits = [];
  text.split("\n").forEach((line, i) => {
    try {
      assertNoBannedContent(line);
    } catch {
      hits.push(`  line ${i + 1}: ${line.trim().slice(0, 140)}`);
    }
  });
  return hits;
}

describe("model-facing instructions never contain a word the shipment gate bans", () => {
  const files = modelFacingInstructionFiles();

  it("is actually looking at the instruction sources (so it cannot pass by checking nothing)", () => {
    assert.ok(files.includes("config/role-prompts.json"), "role-prompts.json must be covered");
    assert.ok(files.includes("config/mission-templates.json"), "mission-templates.json must be covered");
    assert.ok(files.filter((f) => f.endsWith("SOUL.md")).length >= 3, "the role identity files must be covered");
    assert.ok(files.filter((f) => f.startsWith("config/workflow-templates/")).length >= 7, "every workflow template must be covered");
  });

  for (const rel of files) {
    it(`${rel}`, () => {
      const hits = bannedLines(fs.readFileSync(path.join(ROOT, rel), "utf8"));
      assert.deepEqual(hits, [], `${rel} instructs the model with text the shipment gate would reject:\n${hits.join("\n")}`);
    });
  }
});

describe("the shipment gate itself stays strict", () => {
  it("still rejects the honest-negative sentence that blocked run #4", () => {
    assert.throws(() => assertNoBannedContent("*Research artifact only. No DrugBank fields used.*"), /DrugBank/);
  });

  it("still rejects a bare accession id", () => {
    assert.throws(() => assertNoBannedContent("Aspirin (DB00945) is an NSAID."), /DrugBank/);
  });

  it("still accepts the identifier types the instructions now point the model at", () => {
    assert.doesNotThrow(() => assertNoBannedContent("Aspirin: PubChem CID 2244, ChEMBL CHEMBL25, PMID 12345678, NCT01234567."));
  });
});

// T2-7 (2026-11-16): a paying client's run is instructed only with identifier types a paid deliverable may
// carry and the gate checks (openclaw-bridge/core/customer-run.js). No delivery path ships a ChEMBL id, and
// the extractor never reads an ENSG id or an RxNorm CUI, so no biomedical role's assembled customer-run
// instructions may ask for one; the run of 2026-11-16 cited two ChEMBL ids and could not be delivered.
// An ordinary run keeps today's prompt (operator default D4), which the last test pins.
describe("a customer run's assembled instructions ask only for allowlisted identifier types (T2-7)", () => {
  const { buildPrompt } = require("../../openclaw-bridge/core/agent-engine.js");
  const { createAgentContextLoader } = require("../../openclaw-bridge/core/agent-context-loader.js");
  const rolePrompts = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "role-prompts.json"), "utf8")).prompts;
  const loader = createAgentContextLoader({ rootDir: ROOT });
  const task = { type: "analyze", description: "Fixture task.", output_format: "markdown", constraints: {} };
  const agentsDir = path.join(ROOT, "config", "agents");
  const roles = [...new Set([
    ...Object.keys(rolePrompts),
    ...fs.readdirSync(agentsDir).filter((r) => fs.existsSync(path.join(agentsDir, r, "SOUL.md")))
  ])].sort();

  // Everything the model is told before the evidence: identity, role prompt, task and citation rules.
  function instructions(role, customerRun) {
    const identity = loader.loadAgentContext(role, "biomedical", { skipSessions: true });
    const prompt = buildPrompt(task, [], {
      customerRun,
      systemPrefix: rolePrompts[role] ? rolePrompts[role].system_prefix : "",
      agentIdentityPrefix: identity.agentIdentityPrefix,
      workflowInputs: {}
    });
    return prompt.slice(0, prompt.indexOf("===== END INSTRUCTIONS ====="));
  }

  it("covers every role prompt and every role identity (so it cannot pass by checking nothing)", () => {
    for (const role of ["scout", "analyst", "synthesizer", "literature_reviewer", "molecular_profiler", "competitive_intel_analyst", "report_generator", "safety_signal_detector"]) {
      assert.ok(roles.includes(role), `${role} must be covered`);
    }
  });

  for (const role of roles) {
    it(`${role}: no ChEMBL, ENSG or RxNorm ask, and the PMID/NCT/DOI allowlist`, () => {
      const text = instructions(role, true);
      assert.doesNotMatch(text, /chembl/i);
      assert.doesNotMatch(text, /RxNorm/);
      assert.doesNotMatch(text, /ENSG ID|ENSG0/);
      assert.match(text, /A single invented PMID\/NCT\/DOI identifier/);
      assert.match(text, /Use: PMID \(e\.g\. PMID: 12345678\), NCT numbers \(e\.g\. NCT01234567\) and DOIs/);
    });
  }

  it("an ordinary run keeps today's prompt (operator default D4)", () => {
    const text = instructions("molecular_profiler", false);
    assert.match(text, /every bioactivity entry must include its ChEMBL ID/);
    assert.match(text, /A single invented PMID\/NCT\/DOI\/ChEMBL\/CID\/UniProt identifier/);
  });
});
