"use strict";

// Customer runs (2026-11-06, operator decision #4; openclaw-bridge/core/customer-run.js). A paying
// client's run must read nothing from earlier runs (prior-research read-back, research-memory
// priors, the "Recent sessions" digest) and leave nothing behind (session record, vault notes,
// research-memory pack), now or through any later backfill. One test per switch point. Every test
// runs against a temporary root, a temporary vault and a CLI path that does not exist, so even a
// regression cannot touch the operator's vault or the research-memory store.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  CUSTOMER_RUN_EXCLUDED_FIELDS,
  CUSTOMER_RUN_EXCLUDED_TOOLS,
  CUSTOMER_RUN_PHRASES,
  CUSTOMER_RUN_PUBLISH_BLOCK,
  customerRunText,
  excludedFieldsFor,
  excludedToolsFor,
  customerRunSkip
} = require("../../openclaw-bridge/core/customer-run.js");
const { createToolPrefetch } = require("../../openclaw-bridge/core/tool-prefetch.js");
const { createAgentContextLoader } = require("../../openclaw-bridge/core/agent-context-loader.js");
const { createRoleRouter } = require("../../openclaw-bridge/core/role-router.js");
const { createAgentRegistry } = require("../../openclaw-bridge/core/agent-registry.js");
const { createWorkflowEngine } = require("../../openclaw-bridge/core/workflow-engine.js");
const {
  assessShippability,
  createWorkflowVaultPublisher
} = require("../../openclaw-bridge/vault/workflow-vault-publisher.js");
const { createResearchMemory } = require("../../openclaw-bridge/mcp/research-memory-mcp/index.js");

const ENGINE_ROOT = path.resolve(__dirname, "..", "..");
const quiet = { info() {}, warn() {}, error() {} };
const EARLIER_TOPIC = "EARLIER CLIENT TOPIC";
const THIS_TOPIC = "THIS CLIENT TOPIC";

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// A role folder with a soul, an AGENTS file and a session digest naming an earlier client's topic.
function writeAgentDir(rootDir, role) {
  const dir = path.join(rootDir, "config", "agents", role);
  fs.mkdirSync(path.join(dir, "sessions"), { recursive: true });
  fs.writeFileSync(path.join(dir, "SOUL.md"), "SOUL: cite only what you retrieved.\n");
  fs.writeFileSync(path.join(dir, "AGENTS.md"), "AGENTS: team notes.\n");
  fs.writeFileSync(path.join(dir, "sessions", "summary-latest.json"), JSON.stringify({
    schema_version: "agent-sessions-summary-v1",
    role,
    total_sessions: 1,
    window_sessions: [{ completed_at: "2026-11-01T00:00:00.000Z", status: "completed", model: "m", topic: EARLIER_TOPIC }]
  }));
  return dir;
}

// A completed, citation-PASS, non-mock run on disk, optionally marked as a customer run.
function writeWorkflow(rootDir, { customerRun }) {
  const id = "workflow-0123456789abcdef01234567";
  const dir = path.join(rootDir, "workspace", "workflows", id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "workflow.json"), JSON.stringify({
    workflow_id: id,
    template_id: "trial-design-benchmark",
    status: "completed",
    inputs: { indication: THIS_TOPIC },
    created_at: "2026-11-06T00:00:00.000Z",
    artifacts: { citation_verification: { pass: true, verdict: "PASS" } },
    ...(customerRun ? { customer_run: true } : {})
  }));
  return id;
}

describe("customer run", () => {
  it("excludes exactly the two prior-run sources, and nothing for an ordinary run", () => {
    assert.deepEqual(Object.keys(excludedToolsFor({ customerRun: true })).sort(), ["obsidian_prior_research", "research_memory_priors"]);
    assert.deepEqual(excludedToolsFor({}), {});
    assert.deepEqual(excludedToolsFor({ customerRun: "yes" }), {}, "only a real true switches it on");
    assert.deepEqual(customerRunSkip("vault publish"), {
      ok: true, action: "skipped", reason: "customer run: vault publish is never done for a paying client's run"
    });
  });

  it("never calls the prior-run fetchers, and records each skip with its reason", async () => {
    const rootDir = tmp("customer-run-prefetch-");
    try {
      fs.mkdirSync(path.join(rootDir, "config"));
      fs.writeFileSync(path.join(rootDir, "config", "tool-prefetch-map.json"), JSON.stringify({
        role_mappings: {
          fixture_role: [
            { action: "executeTool", tool_name: "obsidian_prior_research", optional: true, context_only: true, arguments: { topic: "{{indication}}" } },
            { action: "executeTool", tool_name: "research_memory_priors", optional: true, context_only: true, arguments: { query: "{{indication}}" } },
            { action: "executeTool", tool_name: "ctgov_design_benchmark", arguments: { condition: "{{indication}}" } }
          ]
        }
      }));
      const run = async (excludedTools) => {
        const called = [];
        const fetcher = (name, records) => async () => { called.push(name); return records; };
        const prefetch = createToolPrefetch({
          toolUniverseMcp: { execute: async () => [] },
          logger: quiet,
          rootDir,
          excludedTools,
          localFetchers: {
            obsidian_prior_research: fetcher("obsidian_prior_research", [{ title: `Prior note on ${EARLIER_TOPIC}`, context_only: true }]),
            research_memory_priors: fetcher("research_memory_priors", [{ title: `Prior pack on ${EARLIER_TOPIC}`, context_only: true }]),
            ctgov_design_benchmark: fetcher("ctgov_design_benchmark", [{ title: "Fixture trial", nctId: "NCT00000021" }])
          }
        });
        const docs = await prefetch.prefetchForRole("fixture_role", { indication: "fixture disease" });
        return { called, docs };
      };

      const ordinary = await run(excludedToolsFor({}));
      assert.deepEqual(ordinary.called.sort(), ["ctgov_design_benchmark", "obsidian_prior_research", "research_memory_priors"]);
      assert.ok(ordinary.docs.some((d) => d.content.includes(EARLIER_TOPIC)), "control: an ordinary run does see prior context");

      const customer = await run(excludedToolsFor({ customerRun: true }));
      assert.deepEqual(customer.called, ["ctgov_design_benchmark"], "only the evidence source is called");
      assert.ok(!customer.docs.some((d) => d.content.includes(EARLIER_TOPIC)), "no earlier run's content reaches a prompt");
      for (const [tool, reason] of Object.entries(CUSTOMER_RUN_EXCLUDED_TOOLS)) {
        const entry = customer.docs.coverage.find((c) => c.source === tool);
        assert.equal(entry.status, "skipped", `${tool} is a recorded skip, not a zero-result search`);
        assert.equal(entry.reason, reason);
      }
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  // T2-7 (2026-11-16): every delivery path refuses a ChEMBL id, and Open Targets records carry one, so a
  // customer run never renders it into a prompt. The record keeps it; only the prompt text leaves it out.
  it("T2-7: leaves exactly the ChEMBL id field out of a customer run's prompt, and nothing out of an ordinary run's", () => {
    assert.deepEqual(Object.keys(excludedFieldsFor({ customerRun: true })), ["chemblId"]);
    assert.deepEqual(excludedFieldsFor({}), {});
    assert.deepEqual(excludedFieldsFor({ customerRun: "yes" }), {}, "only a real true switches it on");
    assert.equal(excludedFieldsFor({ customerRun: true }), CUSTOMER_RUN_EXCLUDED_FIELDS);
  });

  it("T2-7: a customer-run render of an Open Targets record omits the ChEMBL id and keeps its PMID, raw-JSON form included", async () => {
    const rootDir = tmp("customer-run-fields-");
    try {
      fs.mkdirSync(path.join(rootDir, "config"));
      fs.writeFileSync(path.join(rootDir, "config", "tool-prefetch-map.json"), JSON.stringify({
        role_mappings: {
          fixture_role: [{ action: "executeTool", tool_name: "opentargets_disease_intel", arguments: { indication: "{{indication}}" } }]
        }
      }));
      const render = async (excludedFields) => {
        const prefetch = createToolPrefetch({
          toolUniverseMcp: { execute: async () => [] },
          logger: quiet,
          rootDir,
          excludedFields,
          localFetchers: {
            opentargets_disease_intel: async () => [
              { title: "Semaglutide", chemblId: "CHEMBL2108724", pmid: "36216945" },
              // No printable field but the id: the renderer falls back to the record's raw JSON.
              { chemblId: "CHEMBL9", mechanism: "GLP-1 receptor agonist" }
            ]
          }
        });
        const docs = await prefetch.prefetchForRole("fixture_role", { indication: "fixture disease" });
        return docs.map((d) => d.content).join("\n");
      };
      const ordinary = await render(excludedFieldsFor({}));
      assert.match(ordinary, /ChEMBL: CHEMBL2108724/, "control: an ordinary run still sees the id");
      const customer = await render(excludedFieldsFor({ customerRun: true }));
      assert.doesNotMatch(customer, /CHEMBL2108724|CHEMBL9/);
      assert.match(customer, /PMID: 36216945/);
      assert.match(customer, /GLP-1 receptor agonist/, "the raw-JSON record keeps every other field");
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  // The base texts stay the single source; a customer run swaps exact phrases (core/customer-run.js).
  // A phrase that no longer matches its source would silently stop being swapped, so pin each one.
  it("T2-7: every swapped phrase still matches the instruction text it replaces", () => {
    const rolePrompts = JSON.parse(fs.readFileSync(path.join(ENGINE_ROOT, "config", "role-prompts.json"), "utf8")).prompts;
    const sources = [
      ...Object.values(rolePrompts).map((p) => String((p && p.system_prefix) || "")),
      ...["scout", "analyst", "synthesizer"].map((role) => fs.readFileSync(path.join(ENGINE_ROOT, "config", "agents", role, "SOUL.md"), "utf8")),
      fs.readFileSync(path.join(ENGINE_ROOT, "openclaw-bridge", "core", "agent-engine.js"), "utf8")
    ].join("\n");
    for (const [from, to] of CUSTOMER_RUN_PHRASES) {
      assert.ok(sources.includes(from), `no instruction text still says: ${from}`);
      assert.doesNotMatch(to, /chembl|ENSG ID|RxNorm/i, `a replacement names a type outside the allowlist: ${to}`);
    }
    assert.equal(customerRunText("Nothing to swap here."), "Nothing to swap here.");
    assert.equal(customerRunText(null), "");
  });

  it("leaves the Recent sessions digest out of the identity but keeps the soul and AGENTS files", () => {
    const rootDir = tmp("customer-run-loader-");
    try {
      writeAgentDir(rootDir, "scout");
      const loader = createAgentContextLoader({ rootDir });
      const ordinary = loader.loadAgentContext("scout").agentIdentityPrefix;
      assert.ok(ordinary.includes(EARLIER_TOPIC), "control: an ordinary run sees recent sessions");
      const customer = loader.loadAgentContext("scout", undefined, { skipSessions: true }).agentIdentityPrefix;
      assert.ok(customer.includes("SOUL: cite only what you retrieved."));
      assert.ok(customer.includes("AGENTS: team notes."));
      assert.ok(!customer.includes(EARLIER_TOPIC));
      assert.ok(!customer.includes("Recent sessions"));
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("role-router: no earlier topics in the prompt and no session record of this run", async () => {
    const rootDir = tmp("customer-run-router-");
    try {
      const dir = writeAgentDir(rootDir, "scout");
      const seen = [];
      const registry = createAgentRegistry();
      registry.registerRole("scout", async (_envelope, context) => { seen.push(context); return { ok: true }; });
      const router = createRoleRouter({
        registry,
        autonomyLadder: { canRolePerform: () => true, requireHumanApproval: () => false },
        rootDir,
        logger: quiet
      });
      const base = { supervisorDecision: { approved: true, decision_id: "sup-1" }, operatorApproved: true, workflowInputs: { topic: THIS_TOPIC } };
      const summaryFile = path.join(dir, "sessions", "summary-latest.json");

      await router.dispatch({ role: "scout", actionType: "execute_task" }, { ...base, customerRun: true });
      assert.ok(!seen[0].agentIdentityPrefix.includes(EARLIER_TOPIC), "the customer run's prompt carries no earlier topic");
      const afterCustomer = JSON.parse(fs.readFileSync(summaryFile, "utf8"));
      assert.equal(afterCustomer.total_sessions, 1, "no session recorded for the customer run");
      assert.ok(!JSON.stringify(afterCustomer).includes(THIS_TOPIC), "this client's topic is nowhere in the digest");
      assert.deepEqual(fs.readdirSync(path.join(dir, "sessions")), ["summary-latest.json"]);

      await router.dispatch({ role: "scout", actionType: "execute_task" }, base);
      assert.ok(seen[1].agentIdentityPrefix.includes(EARLIER_TOPIC), "control: an ordinary run sees the digest");
      assert.equal(JSON.parse(fs.readFileSync(summaryFile, "utf8")).total_sessions, 2, "control: an ordinary run is recorded");
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("workflow-engine records customer_run in workflow.json and passes it to the mission", async () => {
    const rootDir = tmp("customer-run-engine-");
    try {
      fs.mkdirSync(path.join(rootDir, "workspace", "workflows"), { recursive: true });
      let captured = null;
      const engine = createWorkflowEngine({
        researchRuntime: {
          rootDir,
          config: { defaultProvider: "mock", defaultModel: "mock-model" },
          agentSpawner: { spawnMission: async (_envelope, opts) => { captured = opts; return { ok: true, subtask_results: [] }; } }
        },
        monetizationRuntime: { offerBuilder: { buildOffer() { return { ok: true, offer: { offer_id: "o-1" }, source_context: {} }; } } },
        logger: quiet
      });
      const workflow = {
        schema_version: "phase30-workflow-v1",
        workflow_template_id: "wf-customer-run-test",
        name: "Customer Run Threading Test",
        auto_approve: true,
        pipeline: [{ step_id: "step_research", type: "mission", mission_template_id: "biomedical_drug_discovery", depends_on: [] }]
      };
      await engine.executeWorkflow(workflow, { inputs: {}, customerRun: true });
      assert.equal(captured.customerRun, true, "the mission context carries the switch to the role router");
      const [id] = fs.readdirSync(path.join(rootDir, "workspace", "workflows"));
      const state = JSON.parse(fs.readFileSync(path.join(rootDir, "workspace", "workflows", id, "workflow.json"), "utf8"));
      assert.equal(state.customer_run, true, "every later consumer can see it is a customer run");

      await engine.executeWorkflow(workflow, { inputs: {} });
      assert.equal(captured.customerRun, false, "off by default");
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("the shippability check refuses a customer run whatever its status, and only a customer run", () => {
    const pass = { status: "completed", artifacts: { citation_verification: { pass: true, verdict: "PASS" } } };
    assert.equal(assessShippability({ ...pass, customer_run: true }, []), CUSTOMER_RUN_PUBLISH_BLOCK);
    assert.equal(assessShippability({ ...pass, status: "failed", customer_run: true }, []), CUSTOMER_RUN_PUBLISH_BLOCK);
    assert.equal(assessShippability(pass, []), null, "control: an ordinary shippable run may leave the workspace");
  });

  it("vault publish and research-memory ingest both refuse it, so no later backfill can publish it", async () => {
    const rootDir = tmp("customer-run-publish-");
    try {
      const vault = path.join(rootDir, "vault");
      fs.mkdirSync(vault);
      fs.mkdirSync(path.join(rootDir, "config"));
      fs.writeFileSync(path.join(rootDir, "config", "vault-publish.json"), JSON.stringify({
        enabled: true,
        vaultRoot: vault,
        allowedVaultRoots: [vault],
        vaultOutputFolder: "OpenClaw",
        requireCitationPass: true,
        deliverables: [],
        graphAnalysis: { enabled: false },
        researchMemory: { enabled: true }
      }));
      const id = writeWorkflow(rootDir, { customerRun: true });

      const published = await createWorkflowVaultPublisher({ rootDir, logger: quiet }).publishWorkflow(id);
      assert.equal(published.action, "skipped");
      assert.equal(published.reason, CUSTOMER_RUN_PUBLISH_BLOCK);
      assert.deepEqual(fs.readdirSync(vault), [], "nothing was written into the vault");

      const ingested = await createResearchMemory({ rootDir, logger: quiet, cliPath: path.join(rootDir, "no-such-cli.js") }).ingestWorkflow(id);
      assert.equal(ingested.action, "skipped");
      assert.equal(ingested.reason, CUSTOMER_RUN_PUBLISH_BLOCK);
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("the CLI accepts --customer-run and documents it; the flag never consumes a gate token on a bad template", () => {
    const env = { ...process.env, __OPENCLAW_CA_REEXEC: "1" };
    const run = (args) => spawnSync(process.execPath, ["scripts/run-workflow.js", ...args], { cwd: ENGINE_ROOT, env, encoding: "utf8", timeout: 60000 });

    const usage = run([]);
    assert.equal(usage.status, 1);
    assert.match(usage.stderr, /--customer-run\s+A paying client's run/);

    const accepted = run(["--customer-run", "--template", "no-such-template-for-customer-run-test", "--confirm"]);
    assert.equal(accepted.status, 1);
    assert.doesNotMatch(accepted.stderr, /^Usage:/m, "the flag is known, so the run reaches the template preflight");
    assert.match(accepted.stderr, /no-such-template-for-customer-run-test/);

    const misspelt = run(["--customer-runs", "--template", "no-such-template-for-customer-run-test", "--confirm"]);
    assert.match(misspelt.stderr, /^Usage:/m, "an unknown flag still prints usage");
  });
});
