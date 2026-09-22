"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const {
  createWorkflowVaultPublisher,
  computeNotesFolderPath,
  guardVaultRelativePath
} = require("../../openclaw-bridge/vault/workflow-vault-publisher.js");
const { createTimeProvider } = require("../../openclaw-bridge/core/time-provider.js");

const FIXED_NOW_MS = Date.UTC(2026, 8, 22, 12, 0, 0);

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

/** The plugin's formula, verbatim (note-generator.ts:37-48) — the engine must match it byte-for-byte. */
function pluginFolderFormula(state, vaultOutputFolder) {
  const dateStr = new Date(state.created_at).toISOString().slice(0, 10);
  const inputLabel = Object.values(state.inputs || {}).slice(0, 2).join(" ")
    .replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
  return `${vaultOutputFolder}/${state.template_id}/${dateStr} ${inputLabel}`;
}

function makeFixture({ status = "completed", verdict = "PASS", provider = "claude-code", withBundle = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vault-publisher-root-"));
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "vault-publisher-vault-"));
  const workflowId = "workflow-0123456789abcdef01234567";
  const missionId = "mission-fixture0001";
  const taskIds = { scout: "task-scout0001", synthesizer: "task-synth0001" };
  const offerId = "offer-fixture0001";

  fs.mkdirSync(path.join(root, "config"), { recursive: true });
  fs.writeFileSync(path.join(root, "config", "vault-publish.json"), JSON.stringify({
    schemaVersion: "vault-publish-v1",
    enabled: true,
    vaultRoot: vault,
    allowedVaultRoots: [vault],
    vaultOutputFolder: "OpenClaw",
    requireCitationPass: true,
    deliverables: ["citation-integrity", "graveyard-memo", "search-coverage", "reproducibility-manifest", "design-benchmark"]
  }, null, 2));

  for (const [role, taskId] of Object.entries(taskIds)) {
    const dir = path.join(root, "workspace", "research-output", taskId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "output.md"), [
      `# ${role} findings`,
      "",
      "Temozolomide remains standard of care (PMID: 15758009).",
      "",
      "```",
      "one", "two", "three", "four", "five", "six",
      "```",
      "",
      "**Source**: ToolUniverse SMCP / PubMed_search_articles",
      "",
      "*Handoff complete.*"
    ].join("\n"));
    fs.writeFileSync(path.join(dir, "metadata.json"), JSON.stringify({
      task_id: taskId, provider, model: provider === "mock" ? "mock" : "claude-opus-4-8", token_count: 1234
    }));
  }

  const missionDir = path.join(root, "workspace", "missions", missionId);
  fs.mkdirSync(missionDir, { recursive: true });
  fs.writeFileSync(path.join(missionDir, "status.json"), JSON.stringify({
    mission_id: missionId,
    subtask_results: Object.entries(taskIds).map(([role, taskId], i) => ({
      agent_id: `${missionId}:${role}:${i + 1}`,
      task_id: taskId,
      output_path: path.join(root, "workspace", "research-output", taskId, "output.md"),
      metadata_path: path.join(root, "workspace", "research-output", taskId, "metadata.json"),
      status: "completed"
    }))
  }));

  const workflowDir = path.join(root, "workspace", "workflows", workflowId);
  fs.mkdirSync(workflowDir, { recursive: true });
  fs.writeFileSync(path.join(workflowDir, "graveyard-memo.md"), "# Graveyard Memo — workflow dir copy\n");
  fs.writeFileSync(path.join(workflowDir, "search-coverage.md"), "# Search-Coverage Ledger\n\n| Source | Status |\n|---|---|\n| PubMed | returned |\n");
  const state = {
    workflow_id: workflowId,
    template_id: "trial-design-benchmark",
    status,
    inputs: { indication: "non-small cell lung cancer", compound_name: "osimertinib: EGFR" },
    created_at: "2026-07-31T00:04:54.954Z",
    updated_at: "2026-07-31T00:17:35.258Z",
    completed_at: "2026-07-31T00:17:35.258Z",
    pipeline_progress: {
      total_steps: 2, completed_steps: 2, current_step: null,
      steps: [{ step_id: "research", type: "mission", status: "completed" }, { step_id: "export", type: "export", status: "completed" }]
    },
    artifacts: {
      mission_id: missionId,
      citation_verification: { pass: verdict === "PASS", verdict, cited: 10, grounded: 9, ungrounded: 1, grounded_ratio: 0.9, min_grounded_ratio: 0.75, retracted: [] },
      quality_report: { overall_confidence: 1, citation_density_raw: 0.55, total_claims: 20, verified_claims: 11, pass: true, section_coverage: [] },
      dataset_id: "dataset-fixture01",
      row_count: 12,
      ...(withBundle ? { offer_id: offerId, export_path: path.join(root, "workspace", "releases", `${offerId}-export.zip`) } : {})
    },
    error: null
  };
  fs.writeFileSync(path.join(workflowDir, "workflow.json"), JSON.stringify(state, null, 2));

  const bundleFiles = {};
  if (withBundle) {
    const deliverables = path.join(root, "workspace", "releases", offerId, "deliverables");
    fs.mkdirSync(deliverables, { recursive: true });
    bundleFiles["citation-integrity.md"] = "# Citation Integrity & Provenance\n\nGrade: A\n";
    bundleFiles["graveyard-memo.md"] = "# Graveyard Memo — Prior Terminated Programs\n\n- NCT01234567 — (none stated by sponsor)\n";
    bundleFiles["reproducibility-manifest.md"] = "# Reproducibility Manifest\n\nVERIFIED: 9\n";
    bundleFiles["design-benchmark.md"] = "# Trial Design Benchmark\n\n| Trial | Arms |\n|---|---|\n";
    for (const [name, content] of Object.entries(bundleFiles)) fs.writeFileSync(path.join(deliverables, name), content);
    fs.writeFileSync(path.join(root, "workspace", "releases", offerId, "checksums.txt"),
      Object.entries(bundleFiles).map(([n, c]) => `${sha256(c)}  deliverables/${n}`).join("\n") + "\n");
  }

  return { root, vault, workflowId, state, bundleFiles, offerId };
}

function readNote(vault, rel) {
  return fs.readFileSync(path.join(vault, rel), "utf8");
}

describe("workflow-vault-publisher", () => {
  let fx;
  let timeProvider;

  beforeEach(() => {
    fx = makeFixture();
    timeProvider = createTimeProvider({ fixedNowMs: FIXED_NOW_MS });
  });

  afterEach(() => {
    fs.rmSync(fx.root, { recursive: true, force: true });
    fs.rmSync(fx.vault, { recursive: true, force: true });
  });

  it("folder formula matches the plugin's byte-for-byte (fixture parity with note-generator.ts)", () => {
    const cases = [
      fx.state,
      { ...fx.state, created_at: "2026-12-31T23:59:59.999Z", inputs: { a: "x/y:z*?", b: "  many   spaces ", c: "ignored third" } },
      { ...fx.state, created_at: "2026-01-01T00:00:00.000Z", inputs: {} }
    ];
    for (const state of cases) {
      assert.equal(computeNotesFolderPath(state, "OpenClaw", timeProvider), pluginFolderFormula(state, "OpenClaw"));
    }
    assert.throws(() => computeNotesFolderPath({ ...fx.state, created_at: "not a date" }, "OpenClaw", timeProvider), /created_at/);
  });

  it("writes the plugin's note set plus the deliverables verbatim, and records artifacts.vault_notes", async () => {
    const publisher = createWorkflowVaultPublisher({ rootDir: fx.root, timeProvider });
    const r = await publisher.publishWorkflow(fx.workflowId);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.action, "written");
    assert.equal(r.folder, "OpenClaw/trial-design-benchmark/2026-07-31 non-small cell lung cancer osimertinib EGFR");

    const names = fs.readdirSync(path.join(fx.vault, r.folder)).sort();
    assert.deepEqual(names, [
      "Citation Integrity.md", "Dataset Card.md", "Design Benchmark.md", "Graveyard Memo.md", "Overview.md",
      "Quality Audit.md", "Reproducibility Manifest.md", "Scout.md", "Search Coverage.md", "Synthesizer.md"
    ]);

    const overview = readNote(fx.vault, `${r.folder}/Overview.md`);
    assert.match(overview, /^---\ntype: openclaw\/workflow\nworkflow_id: workflow-0123456789abcdef01234567\n/);
    assert.match(overview, /\ncitation_integrity: PASS\n/);
    assert.match(overview, /\nwritten_by: engine\n/);
    assert.match(overview, /\npublished_at: "2026-09-22T12:00:00.000Z"\n/);
    assert.match(overview, /\n## Deliverables\n/);
    assert.match(overview, /- \[\[Citation Integrity\]\]/);
    assert.match(overview, /- \[\[Synthesizer\|Synthesizer\]\]/);

    // Deliverables: the bundle copy wins over the workflow-dir copy, and the body is verbatim.
    const graveyard = readNote(fx.vault, `${r.folder}/Graveyard Memo.md`);
    assert.ok(graveyard.endsWith(fx.bundleFiles["graveyard-memo.md"]), "bundle deliverable copied verbatim");
    assert.match(graveyard, new RegExp(`\nsha256: ${sha256(fx.bundleFiles["graveyard-memo.md"])}\n`));
    assert.match(graveyard, /\nsealed_bundle: true\n/);
    // search-coverage exists only in the workflow dir → still copied, marked unsealed.
    const coverage = readNote(fx.vault, `${r.folder}/Search Coverage.md`);
    assert.match(coverage, /\nsealed_bundle: false\n/);
    assert.ok(coverage.endsWith("| PubMed | returned |\n"));

    // Agent note is sanitized (large code block dropped, source line + handoff stripped), citation kept.
    const synth = readNote(fx.vault, `${r.folder}/Synthesizer.md`);
    assert.match(synth, /PMID: 15758009/);
    assert.doesNotMatch(synth, /Handoff complete/);
    assert.doesNotMatch(synth, /\*\*Source\*\*: ToolUniverse/);
    assert.doesNotMatch(synth, /\nthree\n/);
    assert.match(synth, /provider: claude-code/);

    // The run's own state now carries the record the plugin rehydrates from.
    const state = JSON.parse(fs.readFileSync(path.join(fx.root, "workspace", "workflows", fx.workflowId, "workflow.json"), "utf8"));
    assert.equal(state.artifacts.vault_notes.folder, r.folder);
    assert.equal(state.artifacts.vault_notes.written_by, "engine");
    assert.equal(state.artifacts.vault_notes.overview, `${r.folder}/Overview.md`);
    assert.deepEqual(state.artifacts.vault_notes.agent_notes.map((a) => a.role), ["scout", "synthesizer"]);
    assert.equal(state.artifacts.vault_notes.files.length, 10);
  });

  it("is idempotent: a second publish skips, --force rewrites", async () => {
    const publisher = createWorkflowVaultPublisher({ rootDir: fx.root, timeProvider });
    const first = await publisher.publishWorkflow(fx.workflowId);
    assert.equal(first.action, "written");
    const second = await publisher.publishWorkflow(fx.workflowId);
    assert.equal(second.action, "skipped");
    assert.match(second.reason, /already present/);
    const third = await publisher.publishWorkflow(fx.workflowId, { force: true });
    assert.equal(third.action, "written");
    assert.equal(third.rewritten, true);
  });

  it("refuses to overwrite another run's folder and lands in a suffixed sibling instead", async () => {
    const publisher = createWorkflowVaultPublisher({ rootDir: fx.root, timeProvider });
    const folder = computeNotesFolderPath(fx.state, "OpenClaw", timeProvider);
    fs.mkdirSync(path.join(fx.vault, folder), { recursive: true });
    fs.writeFileSync(path.join(fx.vault, folder, "Overview.md"), "---\nworkflow_id: workflow-someone-else\n---\n# other\n");
    const r = await publisher.publishWorkflow(fx.workflowId);
    assert.equal(r.action, "written");
    assert.equal(r.folder, `${folder} (01234567)`);
    assert.equal(fs.readFileSync(path.join(fx.vault, folder, "Overview.md"), "utf8").includes("workflow-someone-else"), true);
  });

  it("dry-run resolves everything and writes nothing", async () => {
    const publisher = createWorkflowVaultPublisher({ rootDir: fx.root, timeProvider });
    const r = await publisher.publishWorkflow(fx.workflowId, { dryRun: true });
    assert.equal(r.action, "dry-run");
    assert.equal(r.files.length, 10);
    assert.equal(fs.existsSync(path.join(fx.vault, "OpenClaw")), false);
    const state = JSON.parse(fs.readFileSync(path.join(fx.root, "workspace", "workflows", fx.workflowId, "workflow.json"), "utf8"));
    assert.equal(state.artifacts.vault_notes, undefined);
  });

  it("skips failed runs, non-PASS runs and mock-provider runs — recorded, never written", async () => {
    for (const variant of [{ status: "failed" }, { verdict: "UNVERIFIED" }, { provider: "mock" }]) {
      const local = makeFixture(variant);
      try {
        const publisher = createWorkflowVaultPublisher({ rootDir: local.root, timeProvider });
        const r = await publisher.publishWorkflow(local.workflowId);
        assert.equal(r.ok, true);
        assert.equal(r.action, "skipped", JSON.stringify(variant));
        assert.equal(fs.existsSync(path.join(local.vault, "OpenClaw")), false);
      } finally {
        fs.rmSync(local.root, { recursive: true, force: true });
        fs.rmSync(local.vault, { recursive: true, force: true });
      }
    }
  });

  it("skips when disabled, when OPENCLAW_VAULT_PUBLISH=0, and when the vault root is absent", async () => {
    const disabled = createWorkflowVaultPublisher({ rootDir: fx.root, timeProvider, configOverride: { enabled: false } });
    assert.equal((await disabled.publishWorkflow(fx.workflowId)).action, "skipped");

    const previous = process.env.OPENCLAW_VAULT_PUBLISH;
    process.env.OPENCLAW_VAULT_PUBLISH = "0";
    try {
      const env = createWorkflowVaultPublisher({ rootDir: fx.root, timeProvider });
      const r = await env.publishWorkflow(fx.workflowId);
      assert.equal(r.action, "skipped");
      assert.match(r.reason, /OPENCLAW_VAULT_PUBLISH/);
    } finally {
      if (previous === undefined) delete process.env.OPENCLAW_VAULT_PUBLISH;
      else process.env.OPENCLAW_VAULT_PUBLISH = previous;
    }

    const missing = path.join(fx.vault, "not-mounted");
    const absent = createWorkflowVaultPublisher({ rootDir: fx.root, timeProvider, configOverride: { vaultRoot: missing, allowedVaultRoots: [missing] } });
    const r = await absent.publishWorkflow(fx.workflowId);
    assert.equal(r.action, "skipped");
    assert.match(r.reason, /not present/);
  });

  it("refuses a vault root that is not allow-listed (a failure, not a skip)", async () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "vault-publisher-other-"));
    try {
      const publisher = createWorkflowVaultPublisher({ rootDir: fx.root, timeProvider, configOverride: { vaultRoot: other } });
      const r = await publisher.publishWorkflow(fx.workflowId);
      assert.equal(r.ok, false);
      assert.equal(r.code, "VAULT_PUBLISH_ROOT_REFUSED");
      assert.equal(fs.readdirSync(other).length, 0);
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });

  it("path guard rejects escapes, absolute paths and .obsidian/", () => {
    const root = fs.realpathSync(fx.vault);
    assert.throws(() => guardVaultRelativePath(root, "../outside/Overview.md"), /refused/);
    assert.throws(() => guardVaultRelativePath(root, "OpenClaw/../../x.md"), /refused/);
    assert.throws(() => guardVaultRelativePath(root, "/etc/passwd"), /relative/);
    assert.throws(() => guardVaultRelativePath(root, ".obsidian/plugins/x.md"), /refused/);
    assert.equal(guardVaultRelativePath(root, "OpenClaw/t/2026-01-01 x/Overview.md").absolutePath, path.join(root, "OpenClaw/t/2026-01-01 x/Overview.md"));
  });

  it("a template_id that escapes the vault is refused at write time, not written", async () => {
    const stateFile = path.join(fx.root, "workspace", "workflows", fx.workflowId, "workflow.json");
    const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    state.template_id = "../../escape";
    fs.writeFileSync(stateFile, JSON.stringify(state));
    const publisher = createWorkflowVaultPublisher({ rootDir: fx.root, timeProvider });
    const r = await publisher.publishWorkflow(fx.workflowId);
    assert.equal(r.ok, false);
    assert.equal(r.code, "VAULT_PUBLISH_PATH_REFUSED");
  });

  it("publishAll backfills every completed run and reports a summary", async () => {
    const publisher = createWorkflowVaultPublisher({ rootDir: fx.root, timeProvider });
    // add a failed sibling that must be ignored
    const failedDir = path.join(fx.root, "workspace", "workflows", "workflow-failed0001");
    fs.mkdirSync(failedDir, { recursive: true });
    fs.writeFileSync(path.join(failedDir, "workflow.json"), JSON.stringify({ ...fx.state, workflow_id: "workflow-failed0001", status: "failed" }));
    const first = await publisher.publishAll();
    assert.deepEqual(first.summary, { written: 1, skipped: 0, failed: 0, dry_run: 0 });
    const again = await publisher.publishAll();
    assert.deepEqual(again.summary, { written: 0, skipped: 1, failed: 0, dry_run: 0 });
  });

  it("adds a wikilink-free Graph Analysis note when graphAnalysis is enabled and the package is present", async () => {
    const zkRoot = "/Users/myhome/TrevClaw-Obsidianodus/Claude/Medical-Zettelkasten-MCP";
    if (!fs.existsSync(path.join(zkRoot, "lib", "openclaw-bridge-adapter.js"))) return; // package not on this machine
    // Give the synthesizer enough science text for a graph.
    const synthOut = path.join(fx.root, "workspace", "research-output", "task-synth0001", "output.md");
    fs.writeFileSync(synthOut, [
      "# Synthesis",
      "Docetaxel remains the comparator arm in second-line NSCLC designs (PMID: 30000001).",
      "Pembrolizumab monotherapy showed durable responses in PD-L1 high tumours.",
      "Neoadjuvant chemoimmunotherapy improved pathological complete response before resection.",
      "KRAS G12C inhibitors sotorasib and adagrasib produced objective responses after platinum chemotherapy.",
      "Progression-free survival was the primary endpoint; overall survival was secondary."
    ].join("\n").repeat(3));
    const publisher = createWorkflowVaultPublisher({
      rootDir: fx.root, timeProvider,
      configOverride: { graphAnalysis: { enabled: true, packageRoot: zkRoot, maxItems: 5 } }
    });
    const r = await publisher.publishWorkflow(fx.workflowId);
    assert.equal(r.action, "written", JSON.stringify(r));
    const names = fs.readdirSync(path.join(fx.vault, r.folder));
    assert.ok(names.includes("Graph Analysis.md"));
    const ga = readNote(fx.vault, `${r.folder}/Graph Analysis.md`);
    assert.match(ga, /^---\ntype: openclaw\/graph-analysis\n/);
    assert.match(ga, /## Central concepts/);
    // Every wikilink in the note is an Overview backlink (frontmatter + body) — never a graph term.
    assert.equal((ga.match(/\[\[/g) || []).length, (ga.match(/\[\[Overview\]\]/g) || []).length, "only Overview backlinks");
    const overview = readNote(fx.vault, `${r.folder}/Overview.md`);
    assert.match(overview, /\ngraph_analysis: true\n/);
    assert.match(overview, /see \[\[Graph Analysis\]\]/);
  });

  it("without a sealed bundle the workflow-dir copies are used and citation-integrity is rendered from the verdict", async () => {
    const local = makeFixture({ withBundle: false });
    try {
      const publisher = createWorkflowVaultPublisher({ rootDir: local.root, timeProvider });
      const r = await publisher.publishWorkflow(local.workflowId);
      assert.equal(r.action, "written", JSON.stringify(r));
      const names = fs.readdirSync(path.join(local.vault, r.folder)).sort();
      assert.ok(names.includes("Graveyard Memo.md"));
      assert.ok(names.includes("Search Coverage.md"));
      assert.ok(!names.includes("Design Benchmark.md"), "no design benchmark on disk → no note");
      const graveyard = readNote(local.vault, `${r.folder}/Graveyard Memo.md`);
      assert.ok(graveyard.endsWith("# Graveyard Memo — workflow dir copy\n"));
      if (names.includes("Citation Integrity.md")) {
        const ci = readNote(local.vault, `${r.folder}/Citation Integrity.md`);
        assert.match(ci, /rendered from workflow\.json/);
      }
    } finally {
      fs.rmSync(local.root, { recursive: true, force: true });
      fs.rmSync(local.vault, { recursive: true, force: true });
    }
  });
});
