"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");

const { createWorkflowEngine } = require("../../openclaw-bridge/core/workflow-engine.js");

function makeMockLogger() {
  const logs = [];
  return {
    info(data) { logs.push({ level: "info", data }); },
    warn(data) { logs.push({ level: "warn", data }); },
    error(data) { logs.push({ level: "error", data }); },
    logs
  };
}

function makeMockResearchRuntime(overrides = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase30-engine-test-"));
  fs.mkdirSync(path.join(tmpDir, "workspace", "workflows"), { recursive: true });
  return {
    rootDir: tmpDir,
    config: { defaultProvider: "mock", defaultModel: "mock-model" },
    agentSpawner: {
      spawnMission: async () => ({ ok: true, subtask_results: [] })
    },
    ...overrides
  };
}

function makeMockMonetizationRuntime() {
  const tmpBundleDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase30-bundle-"));
  fs.writeFileSync(path.join(tmpBundleDir, "offer.json"), JSON.stringify({ offer_id: "offer-test-001" }));
  return {
    offerBuilder: {
      buildOffer(opts) {
        return {
          ok: true,
          offer: { offer_id: "offer-test-001", product_line: opts.product_line, tier: opts.tier },
          source_context: { source: opts.source }
        };
      }
    },
    deliverablePackager: {
      createBundleWorkspace() { return tmpBundleDir; },
      writeDeliverables() { return []; },
      writeBundleRoot() {},
      finalizeBundle() {},
      commitBundle() { return tmpBundleDir; }
    },
    submissionPackGenerator: {
      generateSubmissionPacks() { return { submission_refs: [], publisher_adapter_snapshot: {} }; }
    },
    releaseApprovalManager: {
      approveRelease() { return { ok: true, approval_id: "apr-001" }; },
      validateApprovedRelease() {
        return {
          ok: true,
          bundle_dir: tmpBundleDir,
          approval: { approved_platform_targets: ["datarade"] }
        };
      }
    },
    submissionEvidenceManager: {
      buildExportArtifactRef: async () => ({ ref: "ref-001" }),
      recordExportEvent: async () => ({ ok: true, event: {} })
    }
  };
}

function makeValidWorkflowDef() {
  return {
    schema_version: "phase30-workflow-v1",
    workflow_template_id: "wf-engine-test-001",
    name: "Engine Integration Test",
    auto_approve: true,
    pipeline: [
      { step_id: "step_research", type: "mission", mission_template_id: "biomedical_drug_discovery", depends_on: [] }
    ]
  };
}

function makeMultiStepWorkflowDef() {
  return {
    schema_version: "phase30-workflow-v1",
    workflow_template_id: "wf-multi-step-test",
    name: "Multi-Step Order Test",
    auto_approve: true,
    pipeline: [
      { step_id: "step_a", type: "mission", mission_template_id: "biomedical_drug_discovery", depends_on: [] },
      { step_id: "step_b", type: "mission", mission_template_id: "biomedical_drug_discovery", depends_on: ["step_a"] }
    ]
  };
}

describe("Phase 30: Workflow Engine — createWorkflowEngine factory", () => {
  it("rejects missing researchRuntime", () => {
    assert.throws(
      () => createWorkflowEngine({
        researchRuntime: null,
        monetizationRuntime: makeMockMonetizationRuntime(),
        logger: makeMockLogger()
      }),
      (err) => err.message.includes("researchRuntime")
    );
  });

  it("rejects missing monetizationRuntime", () => {
    assert.throws(
      () => createWorkflowEngine({
        researchRuntime: makeMockResearchRuntime(),
        monetizationRuntime: null,
        logger: makeMockLogger()
      }),
      (err) => err.message.includes("monetizationRuntime")
    );
  });

  it("returns an engine with expected methods", () => {
    const engine = createWorkflowEngine({
      researchRuntime: makeMockResearchRuntime(),
      monetizationRuntime: makeMockMonetizationRuntime(),
      logger: makeMockLogger()
    });
    assert.equal(typeof engine.executeWorkflow, "function");
    assert.equal(typeof engine.getWorkflowStatus, "function");
    assert.equal(typeof engine.cancelWorkflow, "function");
  });
});

describe("Phase 30: Workflow Engine — executeWorkflow", () => {
  let engine;
  let researchRuntime;
  let logger;

  beforeEach(() => {
    researchRuntime = makeMockResearchRuntime();
    logger = makeMockLogger();
    engine = createWorkflowEngine({
      researchRuntime,
      monetizationRuntime: makeMockMonetizationRuntime(),
      logger
    });
  });

  it("validates the workflow definition (rejects bad schema)", async () => {
    const bad = { schema_version: "wrong", workflow_template_id: "x", pipeline: [] };
    await assert.rejects(
      () => engine.executeWorkflow(bad),
      (err) => err.message !== undefined
    );
  });

  it("runs steps in topological order", async () => {
    const executionOrder = [];
    let callCount = 0;
    const customResearch = makeMockResearchRuntime({
      agentSpawner: {
        spawnMission: async () => {
          callCount += 1;
          executionOrder.push(`mission_${callCount}`);
          return { ok: true, subtask_results: [] };
        }
      }
    });

    const eng = createWorkflowEngine({
      researchRuntime: customResearch,
      monetizationRuntime: makeMockMonetizationRuntime(),
      logger: makeMockLogger()
    });

    const result = await eng.executeWorkflow(makeMultiStepWorkflowDef());
    assert.equal(result.ok, true);
    assert.equal(executionOrder.length, 2);
    assert.equal(executionOrder[0], "mission_1");
    assert.equal(executionOrder[1], "mission_2");
  });

  it("writes workflow state to filesystem", async () => {
    const result = await engine.executeWorkflow(makeValidWorkflowDef());
    const workflowDir = path.join(researchRuntime.rootDir, "workspace", "workflows", result.workflow_id);
    const statePath = path.join(workflowDir, "workflow.json");
    assert.ok(fs.existsSync(statePath), `Workflow state file should exist at ${statePath}`);

    const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    assert.equal(state.workflow_id, result.workflow_id);
  });

  it("returns ok:true on successful completion", async () => {
    const result = await engine.executeWorkflow(makeValidWorkflowDef());
    assert.equal(result.ok, true);
    assert.ok(result.workflow_id.startsWith("workflow-"));
    assert.equal(result.status, "completed");
  });

  it("returns ok:false when a step fails", async () => {
    const failingResearch = makeMockResearchRuntime({
      agentSpawner: {
        spawnMission: async () => { throw new Error("mission failed"); }
      }
    });

    const eng = createWorkflowEngine({
      researchRuntime: failingResearch,
      monetizationRuntime: makeMockMonetizationRuntime(),
      logger: makeMockLogger()
    });

    const result = await eng.executeWorkflow(makeValidWorkflowDef());
    assert.equal(result.ok, false);
    assert.ok(result.error);
    assert.equal(result.status, "failed");
  });
});

describe("Phase 30: Workflow Engine — getWorkflowStatus", () => {
  it("returns null for unknown workflow", () => {
    const engine = createWorkflowEngine({
      researchRuntime: makeMockResearchRuntime(),
      monetizationRuntime: makeMockMonetizationRuntime(),
      logger: makeMockLogger()
    });
    const status = engine.getWorkflowStatus("wf-does-not-exist");
    assert.equal(status, null);
  });
});

describe("Phase 30: Workflow Engine — cancelWorkflow", () => {
  it("throws for unknown workflow", () => {
    const engine = createWorkflowEngine({
      researchRuntime: makeMockResearchRuntime(),
      monetizationRuntime: makeMockMonetizationRuntime(),
      logger: makeMockLogger()
    });
    assert.throws(
      () => engine.cancelWorkflow("wf-not-found"),
      (err) => err.message.includes("not found")
    );
  });
});

describe("Phase 30: Workflow Engine — section citation-coverage gate (executeQualityAuditStep wiring)", () => {
  // Stub the connector-backed searchFn OFFLINE by overriding require.cache for searchfn.js — no live
  // SearXNG call, no production-only injection seam. executeQualityAuditStep lazily requires the same
  // resolved path, so the override is what it gets.
  const searchfnPath = require.resolve("../../openclaw-bridge/mcp/searxng-mcp/searchfn.js");
  let searchCalls;
  let searchImpl;
  let savedCacheEntry;

  // Two distinct primary-source (grade-C clinicaltrials.gov) results → distinct count 2 → not THIN → no retry.
  const PRIMARY_SOURCES = {
    results: [
      { title: "Trial A", url: "https://clinicaltrials.gov/study/NCT01111111", content: "", score: 1, engine: "crossref", citations: [] },
      { title: "Trial B", url: "https://clinicaltrials.gov/study/NCT02222222", content: "", score: 1, engine: "crossref", citations: [] }
    ]
  };
  // Density-PASS section text. The density check just counts lines matching its regex; "FAERS" trips
  // it but is NOT an extractable citation id — so the mission step's grounded-ratio gate and the
  // re-resolution slice (which resolve real PMIDs/NCTs/DOIs against a live registry) see nothing to
  // block. That isolates THIS test to the section-coverage gate. Plus a distinctive marker phrase.
  const CITED = (marker) => [
    "The FAERS pharmacovigilance dataset was analyzed for adverse events.",
    "A second FAERS review examined signal detection across cohorts.",
    "FAERS-based analysis confirmed the safety profile in patients.",
    "Additional FAERS records supported the observed adverse-event trend.",
    "A fifth FAERS query aggregated case reports for the therapy.",
    `${marker} Syndrome was the distinctive focus of this section analysis.`
  ].join("\n");
  // Density-FAIL section text: prose with no database identifiers → 0 verified claims.
  const UNCITED = [
    "This section contains general narrative prose about the condition.",
    "It intentionally includes no database identifiers of any kind.",
    "The discussion remains qualitative without any specific citations."
  ].join("\n");

  function writeSections(texts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase30-sections-"));
    return texts.map((text, i) => {
      const p = path.join(dir, `section-${i}.md`);
      fs.writeFileSync(p, text, "utf8");
      return { subtask_id: `sub-${i}`, output_path: p };
    });
  }

  function gateWorkflowDef() {
    return {
      schema_version: "phase30-workflow-v1",
      workflow_template_id: "wf-gate-composition",
      name: "Section Gate Composition Test",
      auto_approve: true,
      pipeline: [
        { step_id: "step_research", type: "mission", mission_template_id: "biomedical_drug_discovery", depends_on: [] },
        { step_id: "quality_check", type: "quality_audit", depends_on: ["step_research"], confidence_threshold: 0.5 }
      ]
    };
  }

  function engineWithSubtasks(subtaskResults) {
    const researchRuntime = makeMockResearchRuntime({
      agentSpawner: { spawnMission: async () => ({ ok: true, subtask_results: subtaskResults }) }
    });
    return createWorkflowEngine({ researchRuntime, monetizationRuntime: makeMockMonetizationRuntime(), logger: makeMockLogger() });
  }

  const runInputs = { inputs: { therapeutic_area: "heart failure" } };

  beforeEach(() => {
    searchCalls = [];
    searchImpl = async () => PRIMARY_SOURCES;
    const stub = async (query, params) => { searchCalls.push({ query, params }); return searchImpl(query, params); };
    savedCacheEntry = require.cache[searchfnPath];
    require.cache[searchfnPath] = { id: searchfnPath, filename: searchfnPath, loaded: true, exports: { searchFn: stub }, children: [], paths: [] };
  });

  afterEach(() => {
    if (savedCacheEntry) require.cache[searchfnPath] = savedCacheEntry;
    else delete require.cache[searchfnPath];
  });

  it("(a) DENSITY-FIRST: a density-fail short-circuits — section gate NOT invoked, throws PHASE30_QUALITY_BELOW_THRESHOLD", async () => {
    const engine = engineWithSubtasks(writeSections([UNCITED, UNCITED]));
    const result = await engine.executeWorkflow(gateWorkflowDef(), runInputs);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "PHASE30_QUALITY_BELOW_THRESHOLD");
    assert.equal(searchCalls.length, 0, "section gate must not run when the density check already fails");
  });

  it("(b) PASS PATH: density-pass + sources → completes, per-section tiers surfaced, searchFn once per section", async () => {
    const engine = engineWithSubtasks(writeSections([CITED("Alphamarker"), CITED("Betamarker")]));
    const result = await engine.executeWorkflow(gateWorkflowDef(), runInputs);
    assert.equal(result.ok, true, result.error && JSON.stringify(result.error));
    const cov = result.artifacts.quality_report.section_coverage;
    assert.ok(Array.isArray(cov) && cov.length === 2, "per-section coverage populated");
    assert.ok(cov.every((s) => s.checked === true && s.gate_status === "pass" && s.coverage_tier));
    assert.equal(searchCalls.length, 2, "one search per section (2 distinct sources → no THIN retry)");
  });

  it("(c) FAIL-CLOSED PROPAGATION: one section returns zero sources → PHASE30_CITATION_COVERAGE_ZERO through the dispatch", async () => {
    searchImpl = async (query) => (/Betamarker/i.test(String(query)) ? { results: [] } : PRIMARY_SOURCES);
    const engine = engineWithSubtasks(writeSections([CITED("Alphamarker"), CITED("Betamarker")]));
    const result = await engine.executeWorkflow(gateWorkflowDef(), runInputs);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "PHASE30_CITATION_COVERAGE_ZERO");
  });

  it("(d) SUBJECT DERIVATION: the query passed to searchFn reflects the workflow primary subject", async () => {
    const engine = engineWithSubtasks(writeSections([CITED("Alphamarker"), CITED("Gammamarker")]));
    const result = await engine.executeWorkflow(gateWorkflowDef(), runInputs);
    assert.equal(result.ok, true, result.error && JSON.stringify(result.error));
    assert.ok(searchCalls.length >= 1);
    assert.ok(
      searchCalls.every((c) => /heart failure/i.test(String(c.query))),
      "every section query must carry the primary subject: " + searchCalls.map((c) => c.query).join(" | ")
    );
  });
});
