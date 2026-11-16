"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const {
  validateWorkflowDefinition,
  resolveTemplateVariables,
  findMissingRequiredInputs,
  formatMissingRequiredInputs
} = require("./workflow-schema.js");
const { validateMissionEnvelope } = require("./mission-envelope-schema.js");
const { canonicalize, canonicalJson, safeString } = require("../../workflows/governance-automation/common.js");
const { createSchemaEngine } = require("../dataset/schema-engine.js");
const { INTERACTION_LOG_SCHEMA_VERSION, CHAIN_ZERO_HASH } = require("./interaction-log.js");
const timeProviderModule = require("./time-provider.js");
const { createDatasetBuilder } = require("../dataset/dataset-builder.js");
const { createDatasetOutputManager } = require("../dataset/dataset-output-manager.js");
const {
  verifyReportCitations, annotateSubtaskOutputs, checkRetractions, isDeskAuthoredSubtask,
  DEFAULT_MIN_GROUNDED_RATIO, resolveConfiguredGroundedFloor
} = require("./citation-gate.js");
const { toSearchQuery } = require("../mcp/business-sources/search-terms.js");
const { extractCitations, deduplicateCitations } = require("./citation-extractor.js");
const { createCitationReresolver } = require("../mcp/citation-reresolver/citation-reresolver.js");
const { getResearchProfile } = require("./research-profiles.js");
const { buildReproducibilityManifest, renderManifestMarkdown } = require("./reproducibility-manifest.js");
const { annotateSubtaskAttributions } = require("./citation-attribution.js");
const { writeMissionCitationRecord, failMissionCitationRecord, passMissionQualityAudit } = require("./mission-citation-record.js");
const { buildGraveyardMemo, buildAmendmentRisk } = require("../monetization/graveyard-memo.js");
const { buildDesignBenchmark } = require("../monetization/design-benchmark.js");
const { buildSearchCoverageLedger, collectSearchCoverage } = require("../monetization/search-coverage-ledger.js");

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(input) {
  return crypto.createHash("sha256").update(String(input)).digest("hex");
}

function generateWorkflowId(templateId, timeProvider) {
  const timestamp = timeProvider.nowMs ? timeProvider.nowMs() : timeProvider.nowIso();
  const random = crypto.randomBytes(8).toString("hex");
  return `workflow-${sha256(`workflow-${templateId}-${timestamp}-${random}`).slice(0, 24)}`;
}

// T2-6 (2026-11-16): every identifier a mission bundle ships, for ONE re-resolution pass: the report's own,
// then the NCT numbers of the graveyard memo and the design benchmark (deterministic files rendered from
// registry records this run retrieved). Each is tagged with the sections it appears in, so the manifest
// keeps per-section counts. An NCT only the memo or the benchmark carries counts as retrieved in this run
// (those fetchers retrieved it); an NCT the report cites keeps the gate's verdict. With no memo and no
// benchmark nothing is tagged, so the manifest is exactly what it was before.
const SECTION_REPORT = "report";
const SECTION_MEMO = "graveyard-memo";
const SECTION_BENCHMARK = "design-benchmark";

function collectSectionCitations(reportText, graveyardMemo, amendmentRisk, designBenchmark) {
  const sections = new Map(); // TYPE:ID -> Set of sections
  const cites = [];
  const key = (c) => `${c.type}:${c.id}`.toUpperCase();
  const add = (list, section) => {
    for (const c of list) {
      const k = key(c);
      if (!sections.has(k)) {
        sections.set(k, new Set());
        cites.push({ type: c.type, id: c.id });
      }
      sections.get(k).add(section);
    }
  };
  const read = (text) => deduplicateCitations(extractCitations(String(text || "")));
  add(read(reportText), SECTION_REPORT);
  if (graveyardMemo && graveyardMemo.markdown) {
    add(read(`${graveyardMemo.markdown}\n${(amendmentRisk && amendmentRisk.markdown) || ""}`).filter((c) => c.type === "NCT"), SECTION_MEMO);
  }
  if (designBenchmark && designBenchmark.markdown) {
    add(read(designBenchmark.markdown).filter((c) => c.type === "NCT"), SECTION_BENCHMARK);
  }
  const tagged = cites.some((c) => sections.get(key(c)).size > 1 || !sections.get(key(c)).has(SECTION_REPORT));
  const outsideReport = cites.filter((c) => !sections.get(key(c)).has(SECTION_REPORT));
  return {
    cites,
    tag: (rows) => (tagged ? rows.map((r) => ({ ...r, sections: [...(sections.get(key(r)) || [SECTION_REPORT])] })) : rows),
    groundedIds: (ids) => (Array.isArray(ids) ? [...ids, ...outsideReport.map((c) => c.id)] : ids),
    groundedKeys: (keys) => (Array.isArray(keys) ? [...keys, ...outsideReport.map(key)] : keys)
  };
}

function createWorkflowEngine(options = {}) {
  const researchRuntime = options.researchRuntime;
  const monetizationRuntime = options.monetizationRuntime;
  const logger = options.logger && typeof options.logger === "object" ? options.logger : { info() {}, warn() {}, error() {} };
  const timeProvider = options.timeProvider || timeProviderModule;

  if (!researchRuntime || !researchRuntime.agentSpawner) {
    throw new Error("workflow engine requires researchRuntime with agentSpawner");
  }
  if (!monetizationRuntime || !monetizationRuntime.offerBuilder) {
    throw new Error("workflow engine requires monetizationRuntime with offerBuilder");
  }

  const rootDir = researchRuntime.rootDir;
  const workflowsDir = path.join(rootDir, "workspace", "workflows");
  const activeWorkflows = new Map();

  function getWorkflowDir(workflowId) {
    return path.join(workflowsDir, workflowId);
  }

  function writeWorkflowState(workflowId, state) {
    const workflowDir = getWorkflowDir(workflowId);
    writeJson(path.join(workflowDir, "workflow.json"), state);
  }

  function buildProgrammaticApprovals(workflowId, description) {
    const now = timeProvider.nowIso();
    return {
      supervisorDecision: canonicalize({
        approved: true,
        decision_id: `sup-workflow-${workflowId}`,
        decision_sequence: 1,
        operator_id: "workflow-engine",
        reason: "workflow_auto_approved",
        task_id: workflowId,
        timestamp: now,
        receipt_hash: sha256(`workflow-approval-${workflowId}-${now}`)
      }),
      governanceDecision: canonicalize({
        approved: true,
        reason: "governance_approved",
        task_id: workflowId,
        timestamp: now
      })
    };
  }

  function topologicalSort(steps) {
    const sorted = [];
    const visited = new Set();
    const stepMap = new Map();
    for (const step of steps) {
      stepMap.set(step.step_id, step);
    }

    function visit(stepId) {
      if (visited.has(stepId)) return;
      visited.add(stepId);
      const step = stepMap.get(stepId);
      if (step) {
        for (const dep of step.depends_on || []) {
          visit(dep);
        }
        sorted.push(step);
      }
    }

    for (const step of steps) {
      visit(step.step_id);
    }
    return sorted;
  }

  function applyInputSchemaDefaults(workflowDef, inputs) {
    const schema = workflowDef.input_schema;
    const merged = { ...inputs };
    if (schema && schema.properties) {
      for (const [key, prop] of Object.entries(schema.properties)) {
        if (merged[key] === undefined && prop.default !== undefined) {
          merged[key] = prop.default;
        }
      }
    }
    // Research profile (core/research-profiles.js). Set ONLY when the template declares one, and the
    // template wins over a caller-supplied input: the lane is a property of the product, not of the
    // request. Templates without it get no key at all, so biomedical runs are unchanged.
    if (typeof workflowDef.research_profile === "string" && workflowDef.research_profile.trim()) {
      const profile = getResearchProfile(workflowDef.research_profile);
      merged.research_profile = profile.id;
      // Evidence Desk (2026-10-21): inputs a profile derives from the run's own inputs (the business
      // lane's us_scope / eurostat_geo, which decide whether BLS/Census/EIA or Eurostat apply). A
      // value the caller supplied wins.
      if (typeof profile.deriveInputs === "function") {
        for (const [key, value] of Object.entries(profile.deriveInputs(merged))) {
          if (merged[key] === undefined) merged[key] = value;
        }
      }
    }
    return merged;
  }

  function generateSeedDocument(description, inputs, workflowDef) {
    const lines = [
      `# Research Seed Document`,
      ``,
      `## Task Description`,
      description,
      ``,
      `## Research Parameters`
    ];
    for (const [key, value] of Object.entries(inputs)) {
      if (key === "input_path" || key === "input_dir" || key === "research_profile") continue;
      // Profile-derived routing inputs (business lane) steer the prefetch, not the research.
      if (key === "us_scope" || key === "eurostat_geo") continue;
      lines.push(`- **${key.replace(/_/g, " ")}**: ${String(value)}`);
    }
    if (workflowDef.description) {
      lines.push(``, `## Workflow Context`, workflowDef.description);
    }
    return lines.join("\n") + "\n";
  }

  async function executeMissionStep(step, workflowDef, inputs, stepResults, context) {
    const enrichedInputs = applyInputSchemaDefaults(workflowDef, inputs);
    const description = resolveTemplateVariables(
      step.description_template || workflowDef.name || "Workflow mission",
      enrichedInputs
    );
    const inputPaths = [];
    if (enrichedInputs.input_path) {
      const p = path.resolve(rootDir, safeString(enrichedInputs.input_path));
      inputPaths.push({ path: p, type: "path" });
    } else if (enrichedInputs.input_dir) {
      const p = path.resolve(rootDir, safeString(enrichedInputs.input_dir));
      if (fs.existsSync(p)) {
        inputPaths.push({ path: p, type: "path" });
      }
    }

    // Phase 36 (workflow-honor-inputs): Generate a seed document from workflow
    // inputs (excluding input_path/input_dir) and prepend it to inputPaths so
    // user-supplied parameters like therapeutic_area, drug_class, compound_name,
    // topic, etc. reach the agent prompts directly. Previously the seed was only
    // written as a fallback when no path inputs existed, so user inputs only
    // flowed into the rendered description and never into agent context — agents
    // worked solely from input_dir seed docs and could ignore the user's topic.
    const hasNonPathInputs = Object.keys(enrichedInputs).some((k) => {
      if (k === "input_path" || k === "input_dir") return false;
      const v = enrichedInputs[k];
      return v !== undefined && v !== null && String(v).trim() !== "";
    });
    if (hasNonPathInputs || inputPaths.length === 0) {
      const workflowDir = getWorkflowDir(context.workflowId);
      const seedPath = path.join(workflowDir, "seed-input.md");
      ensureDir(workflowDir);
      fs.writeFileSync(seedPath, generateSeedDocument(description, enrichedInputs, workflowDef), "utf8");
      // Prepend so the user's topic context appears first in the agent's input stream.
      inputPaths.unshift({ path: seedPath, type: "path" });
    }

    const missionEnvelope = validateMissionEnvelope({
      template_id: safeString(step.mission_template_id) || "dataset_sample",
      description: safeString(description),
      inputs: inputPaths,
      mission_type: safeString(step.mission_type) || "research_to_dataset",
      dataset_type: safeString(step.dataset_type) || safeString(workflowDef.pipeline.find((s) => s.type === "dataset")?.dataset_type) || "retrieval_qa",
      // The engine's own clock. Left out, the schema falls back to its epoch default, and the real
      // spawner writes this envelope verbatim as mission.json - which a mission-sourced offer reads
      // as the bundle's "Generated" date (first real run, 2026-10-08: "Generated: 1970-01-01").
      created_at: timeProvider.nowIso()
    });

    const approvals = workflowDef.auto_approve
      ? buildProgrammaticApprovals(missionEnvelope.mission_id, description)
      : context.approvals || {};

    if (!approvals.supervisorDecision || !approvals.governanceDecision) {
      const error = new Error("Mission step requires approvals (set auto_approve: true or provide approvals in context)");
      error.code = "PHASE30_WORKFLOW_APPROVAL_REQUIRED";
      throw error;
    }

    // Phase 33: Per-template provider routing — prefer workflow template's
    // provider_preference over the global default from agent-config.json
    const templatePref = workflowDef.provider_preference;
    const resolvedProvider = (templatePref && safeString(templatePref.primary))
      || researchRuntime.config.defaultProvider;
    const resolvedModel = researchRuntime.config.defaultModel;

    // Phase-15 autonomy gate: research roles' execute_task requires an explicit
    // human (operator) approval (role-router.js). The CLI surfaces this as the
    // opt-in --operator-approve flag, which arrives here as context.operatorApproved.
    // Default-off / fail-closed: when false, the gate blocks the mission exactly as
    // before. We forward it through spawnMission's context (spread into the dispatch
    // context by agent-spawner → spawn-orchestrator) WITHOUT altering the gate itself.
    const operatorApproved = context.operatorApproved === true;
    if (operatorApproved) {
      logger.info({
        event: "phase15_operator_approval_granted",
        workflow_id: context.workflowId,
        mission_id: missionEnvelope.mission_id,
        operator_id: context.operatorId || "workflow-engine",
        source: "cli_operator_approve_flag"
      });
    }

    const missionResult = await researchRuntime.agentSpawner.spawnMission(missionEnvelope, {
      confirm: true,
      operatorId: context.operatorId || "workflow-engine",
      operatorApproved,
      provider: resolvedProvider,
      model: resolvedModel,
      ...approvals,
      correlationId: `phase30-workflow-${context.workflowId}`,
      toolPrefetch: researchRuntime.toolPrefetch || null,
      // Evidence Desk (business lane): writes the scout section deterministically (agent-engine.js).
      evidenceDesk: researchRuntime.evidenceDesk || null,
      workflowInputs: enrichedInputs,
      // Customer run: role-router leaves out the "Recent sessions" digest and records no session.
      customerRun: context.customerRun === true
    });

    // Slice 1 — report-level citation gate. Verify the assembled mission report against the
    // UNION of runtime-fetched identifiers and HARD-FAIL when too many cited ids are ungrounded
    // (present in the report but not in anything actually fetched = likely model-introduced).
    // Protects the zero-fabrication brand promise. Engages only when there IS fetched ground
    // truth (an empty fetch can't fail here — that is surfaced as tool_prefetch_zero_docs).
    let citationVerification = null;
    let searchCoverageLedger = null; // Q5: the deterministic Search-Coverage Ledger (honest-zero deliverable)
    // T1-1 (2026-11-14): the gate's verdict beside the mission (core/mission-citation-record.js), so the
    // offer builder refuses a mission the gate did not pass on EVERY packaging path. pass:false is
    // recorded before each throw below; a failed pass:false write is logged (the run is failing anyway).
    const recordGateFailure = (err, verdict) => {
      try {
        writeMissionCitationRecord({
          rootDir, missionId: missionEnvelope.mission_id, workflowId: context.workflowId, timeProvider,
          pass: false, verdict, errorCode: err && err.code, citationVerification
        });
      } catch (recordErr) {
        logger.error({ event: "mission_citation_record_write_failed", mission_id: missionEnvelope.mission_id, error: safeString(recordErr && recordErr.message) });
      }
    };
    // The deterministic deliverables buildPostGateArtifacts (end of this function) fills in (T2-6).
    let graveyardMemo = null;
    let amendmentRisk = null;
    let designBenchmark = null;
    let postGateArtifactsBuilt = false;
    if (missionResult && missionResult.ok && Array.isArray(missionResult.subtask_results)) {
      // Q7: the grounded floor is a required, config-owned value (config/agent-config.json). Fail
      // CLOSED — if it is missing or malformed, use the strict shared default and WARN loudly; never
      // silently fall back to a laxer number (the old 0.34 fallback quietly undercut the config).
      // T1-6 (2026-11-14): only a number from 0.75 to 1 is accepted, so configuration can tighten the
      // floor but never loosen or switch it off (`Number(null)` and `0` used to switch it off).
      const floor = resolveConfiguredGroundedFloor(researchRuntime.config.minGroundedCitationRatio);
      const minGroundedRatio = floor.value;
      if (!floor.accepted) {
        logger.warn({
          event: "min_grounded_ratio_unconfigured",
          using: DEFAULT_MIN_GROUNDED_RATIO,
          rejected: floor.rejected,
          note: "config/agent-config.json minGroundedCitationRatio missing, invalid or below the 0.75 floor — failing closed to the strict default"
        });
      }
      const gate = verifyReportCitations({ subtaskResults: missionResult.subtask_results, minGroundedRatio });
      // Q5: the deterministic Search-Coverage Ledger — the honest-zero deliverable, built from the
      // per-search outcomes captured in each subtask's metadata sidecar. Available whether the gate
      // PASSES (a coverage appendix) or BLOCKS on INSUFFICIENT_EVIDENCE (the honest-zero IS the
      // shippable artifact). No LLM — every row is a real runtime search outcome.
      searchCoverageLedger = buildSearchCoverageLedger(
        collectSearchCoverage(missionResult.subtask_results),
        { topic: safeString((context.workflowInputs || {}).topic) || safeString((context.workflowInputs || {}).indication) }
      );
      // Literature-integrity: a report must never cite a RETRACTED paper. Cited DOIs are screened
      // against Crossref and cited PMIDs against PubMed — neither source alone is sufficient
      // (Crossref lacks an `update-to` relation on some older retracted records; PMID-only
      // citations never reach the DOI screen). Fail-soft — a network error on either screen yields
      // no retractions, so a network issue can never wrongly block a report.
      const retraction = await checkRetractions(
        gate.reportText,
        researchRuntime.crossrefRetraction && researchRuntime.crossrefRetraction.checkDois,
        researchRuntime.pubmedRetraction && researchRuntime.pubmedRetraction.checkPmids,
        // DOI→PMID escalation closes Crossref's blind spot for DOI-only citations (Wakefield class).
        researchRuntime.pubmedRetraction && researchRuntime.pubmedRetraction.resolveDoisToPmids,
        // T2-16: a cited PMCID is screened through the PMID (or DOI) its PMC record lists.
        researchRuntime.pubmedRetraction && researchRuntime.pubmedRetraction.resolvePmcidsToIds
      );
      const retractedCount = retraction.retracted.length;
      const gatePass = gate.pass && retractedCount === 0;
      logger.info({
        event: "citation_gate",
        mission_id: missionEnvelope.mission_id,
        cited: gate.cited,
        grounded: gate.grounded,
        ungrounded: gate.ungrounded,
        grounded_ratio: gate.grounded_ratio,
        grounding_match: gate.grounding_match,
        fetched_id_count: gate.fetched_id_count,
        retracted: retractedCount,
        retraction_screen_checked: Boolean(retraction.checked),
        dois_checked: retraction.dois_checked || 0,
        pmids_checked: retraction.pmids_checked || 0,
        unscreened: retraction.unscreened || 0,
        pass: gatePass
      });
      try {
        const gateDir = getWorkflowDir(context.workflowId);
        ensureDir(gateDir);
        fs.writeFileSync(
          path.join(gateDir, "citation-verification.json"),
          JSON.stringify({
            mission_id: missionEnvelope.mission_id,
            pass: gatePass, verdict: gate.verdict, cited: gate.cited, grounded: gate.grounded, ungrounded: gate.ungrounded,
            grounded_ratio: gate.grounded_ratio, min_grounded_ratio: gate.min_grounded_ratio,
            // T1-5: "type_and_id", or "id_only" when an evidence record carried no TYPE:ID keys.
            grounding_match: gate.grounding_match,
            fetched_id_count: gate.fetched_id_count, ungrounded_list: gate.ungrounded_list,
            // Sections the grounded ratio did NOT judge (Evidence Desk, written without a model).
            desk_authored_sections: gate.desk_authored_sections || [],
            retracted: retraction.retracted,
            retracted_dois: retraction.retracted_dois || [],
            retracted_pmids: retraction.retracted_pmids || [],
            // T2-16: cited PMCIDs, screened through their PMC record's PMID or DOI.
            retracted_pmcids: retraction.retracted_pmcids || [],
            pmcids_checked: retraction.pmcids_checked || 0,
            pmcids_cited: retraction.pmcids_cited || 0,
            retracted_dois_via_pmid: retraction.retracted_dois_via_pmid || [],
            unflagged_notice_dois: retraction.unflagged_notice_dois || [],
            retraction_screen_checked: Boolean(retraction.checked),
            // T2-1: true when the screen asked again, once, for ids that first got no definitive answer.
            retraction_screen_retried: Boolean(retraction.retried),
            dois_checked: retraction.dois_checked || 0,
            pmids_checked: retraction.pmids_checked || 0,
            dois_escalated_via_pmid: retraction.dois_escalated_via_pmid || 0,
            dois_cited: retraction.dois_cited || 0,
            pmids_cited: retraction.pmids_cited || 0,
            unscreened: retraction.unscreened || 0,
            // T1-7: WHICH ids could not be screened, and the DOIs no retraction source holds.
            unscreened_ids: retraction.unscreened_ids || [],
            dois_without_retraction_source: retraction.dois_without_retraction_source || 0,
            // Tier 1 review: DOIs screened against Crossref alone (their PubMed cross-check reached no verdict).
            dois_crossref_only: retraction.dois_crossref_only || 0,
            crossref_notice_dois: retraction.crossref_notice_dois || [],
            editorial_flags: retraction.editorial_flags || []
          }, null, 2)
        );
        if (gate.ungrounded > 0 || retractedCount > 0) {
          fs.writeFileSync(path.join(gateDir, "report-annotated.md"), gate.annotatedReport);
        }
        // Q5: always persist the honest-zero ledger to the workflow dir (blocked runs surface it here).
        if (searchCoverageLedger && searchCoverageLedger.markdown) {
          fs.writeFileSync(path.join(gateDir, "search-coverage.md"), searchCoverageLedger.markdown);
        }
      } catch (persistError) {
        logger.warn({ event: "citation_gate_persist_failed", error: safeString(persistError && persistError.message) });
      }
      citationVerification = {
        pass: gatePass, verdict: gate.verdict, cited: gate.cited, grounded: gate.grounded, ungrounded: gate.ungrounded,
        grounded_ratio: gate.grounded_ratio, min_grounded_ratio: gate.min_grounded_ratio,
        grounding_match: gate.grounding_match,
        fetched_id_count: gate.fetched_id_count,
        ungrounded_sample: gate.ungrounded_list.slice(0, 25).map((c) => `${c.type}:${c.id}`),
        // T1-3: the FULL untraced list (TYPE:ID). The packager marks each one in the Citation Summary,
        // the sample preview and tables.csv, and the integrity ledger lists them all.
        ungrounded_ids: gate.ungrounded_list.map((c) => `${c.type}:${c.id}`),
        retracted: retraction.retracted,
        // T1-7: the retraction screen's coverage travels with the report, so the manifest, the ledger
        // and the bundle text say "retraction-screened" only when every cited DOI and PMID was screened.
        retraction_screen_checked: Boolean(retraction.checked),
        retraction_screen_cited: (retraction.dois_cited || 0) + (retraction.pmids_cited || 0) + (retraction.pmcids_cited || 0),
        unscreened: retraction.unscreened || 0,
        unscreened_ids: retraction.unscreened_ids || [],
        dois_without_retraction_source: retraction.dois_without_retraction_source || 0,
        // Tier 1 review: cited DOIs screened against Crossref alone, so no copy names PubMed for them.
        retraction_dois_crossref_only: retraction.dois_crossref_only || 0,
        retraction_editorial_flags: retraction.editorial_flags || [],
        search_coverage: searchCoverageLedger ? searchCoverageLedger.summary : null
      };
      if (!gatePass) {
        logger.error({
          event: "citation_gate_failed",
          mission_id: missionEnvelope.mission_id,
          cited: gate.cited, ungrounded: gate.ungrounded, retracted: retractedCount, grounded_ratio: gate.grounded_ratio
        });
        let reason;
        if (retractedCount > 0) {
          reason = `the report cites ${retractedCount} RETRACTED paper(s) (${retraction.retracted.join(", ")})`;
        } else if (gate.verdict === "SECTION_UNREADABLE") {
          reason = `${gate.unreadable_sections.length} section(s) could not be read (${gate.unreadable_sections.join(", ")}), so their citations cannot be verified`;
        } else if (gate.verdict === "INSUFFICIENT_EVIDENCE") {
          reason = "no runtime evidence was fetched (fetched_id_count=0) — the findings cannot be verified against any source, so this is a recorded honest-zero, not a silent pass. See search-coverage.md in the workflow dir for the per-source zero-result record";
        } else if (gate.verdict === "NO_CITATIONS") {
          reason = "evidence was fetched but the report cites nothing to ground — a due-diligence deliverable must trace its claims to sources";
        } else {
          reason = `${gate.ungrounded}/${gate.cited} cited identifiers are ungrounded (grounded ratio ${gate.grounded_ratio} < ${minGroundedRatio})`;
        }
        const err = new Error(
          `Citation gate failed [${gate.verdict}]: ${reason} — refusing to ship to protect the ` +
          `zero-fabrication / citation-integrity guarantee. Annotated report written to the workflow dir.`
        );
        const VERDICT_CODES = {
          SECTION_UNREADABLE: "PHASE30_CITATION_SECTION_UNREADABLE",
          INSUFFICIENT_EVIDENCE: "PHASE30_CITATION_INSUFFICIENT_EVIDENCE",
          NO_CITATIONS: "PHASE30_CITATION_NONE"
        };
        err.code = retractedCount > 0
          ? "PHASE30_CITATION_RETRACTED"
          : VERDICT_CODES[gate.verdict] || "PHASE30_CITATION_UNVERIFIED";
        err.citation_verification = citationVerification;
        err.search_coverage = searchCoverageLedger ? searchCoverageLedger.summary : null;
        recordGateFailure(err, retractedCount > 0 ? "RETRACTED" : gate.verdict);
        throw err;
      }
      // Passed, but some citations may still be ungrounded → annotate the shipped sections in place
      // so the bundle itself carries the [UNVERIFIED] marks (honesty over completeness).
      // T1-3 (2026-11-14): on EVERY pass (the old `gate.ungrounded > 0` guard skipped Evidence Desk
      // sections, which the ratio does not judge), at every mention, and FAIL-CLOSED: a section whose
      // marks cannot be written stops the run, because an untraced identifier must never ship unflagged.
      const annotation = annotateSubtaskOutputs(missionResult.subtask_results, gate.fetchedIds, { fetchedKeys: gate.fetchedKeys });
      if (annotation.failed.length > 0) {
        logger.error({ event: "citation_gate_annotate_failed", mission_id: missionEnvelope.mission_id, failed: annotation.failed });
        const err = new Error(
          `Citation gate passed, but the [UNVERIFIED] marks could not be written to ${annotation.failed.length} section(s) ` +
          `(${annotation.failed.join(", ")}) — refusing to ship a report whose untraced identifiers are not flagged at every mention.`
        );
        err.code = "PHASE30_CITATION_ANNOTATE_FAILED";
        err.citation_verification = citationVerification;
        recordGateFailure(err, "ANNOTATE_FAILED");
        throw err;
      }

      // Slice 4 — citation RE-RESOLUTION + Reproducibility Manifest. The gate proved the cited ids
      // are GROUNDED in fetched evidence; this independently RE-RESOLVES each one against its live
      // source registry at delivery and records VERIFIED / UNRESOLVED / UNCHECKED in a manifest.
      // Fail-soft on infra (network/throttle => UNCHECKED, never a false VERIFIED); fail-CLOSED on
      // fabrication (a live "does-not-exist" => UNRESOLVED => BLOCK), mirroring the gate above.
      // `checked` must reflect whether the screens actually covered every cited identifier —
      // hardcoding `true` made the manifest claim a retraction screen that a rate-limited or
      // unreachable source may have skipped entirely. DOI and PMID retractions stay in their own
      // fields so a retracted PMID is never mislabeled as a DOI in the sealed manifest.
      // T2-6: the memo and the benchmark are built now, so the NCT numbers they ship are re-resolved and
      // recorded with the report's identifiers (an UNRESOLVED one blocks like any other).
      await buildPostGateArtifacts();
      const sectionCitations = collectSectionCitations(gate.reportText || "", graveyardMemo, amendmentRisk, designBenchmark);
      const manifestRetraction = {
        checked: Boolean(retraction.checked),
        retracted_dois: retraction.retracted_dois || [],
        retracted_pmids: retraction.retracted_pmids || [],
        retracted_pmcids: retraction.retracted_pmcids || [],
        // T1-7: an incomplete screen restricts the claim (flag), never blocks.
        cited: (retraction.dois_cited || 0) + (retraction.pmids_cited || 0) + (retraction.pmcids_cited || 0),
        unscreened_ids: retraction.unscreened_ids || []
      };
      const manifestGate = {
        cited: gate.cited, grounded: gate.grounded, ungrounded: gate.ungrounded,
        grounded_ratio: gate.grounded_ratio, min_grounded_ratio: gate.min_grounded_ratio, hardFail: false
      };
      // T1-5: grounded_in_run by TYPE:ID when every evidence record carried keys.
      const manifestGroundedKeys = sectionCitations.groundedKeys(Array.isArray(gate.fetchedKeys) ? gate.fetchedKeys : null);
      const manifestGroundedIds = sectionCitations.groundedIds(gate.fetchedIds);
      let reresolutionStartedAt = null;
      try {
        const cites = sectionCitations.cites;
        if (cites.length > 0) {
          const startedAt = timeProviderModule.nowIso();
          reresolutionStartedAt = startedAt;
          // DI seam (mirrors researchRuntime.crossrefRetraction / pubmedRetraction / ctgovSupplemental
          // above): use an injected re-resolver when the runtime provides one, else construct the real
          // one. Production is IDENTICAL — nothing is injected, so createCitationReresolver still runs.
          const ncbiApiKey = safeString(researchRuntime.config && researchRuntime.config.ncbiApiKey) || process.env.NCBI_API_KEY || "";
          const reresolver = researchRuntime.citationReresolver || createCitationReresolver({
            logger,
            contactEmail: safeString(researchRuntime.config && researchRuntime.config.contactEmail) || "trevor@trevorobeyinc.com",
            ncbiApiKey,
            // NCBI's polite-use ceiling (3 req/sec anonymous, 10 with a key): the same numbers the PubMed retraction
            // screen is wired with in scripts/_workflow-runtime.js. Unpaced, the PMID checks left ~100 ms apart and NCBI
            // answered 429 for 7 of 12 in the first real dispatch-lane run (2026-10-08), forfeiting the full DELIVER claim.
            minRequestIntervalMs: ncbiApiKey ? 110 : 350,
            // Business lane: WEB ids re-resolve against the run's stored page snapshots.
            webSnapshotStore: researchRuntime.webSnapshotStore || null,
            // Evidence Desk keys (free, operator-registered; never in git). BLS works keyless (v1);
            // without the other two, CENSUS / EIA ids re-resolve UNCHECKED `no_api_key`.
            blsApiKey: process.env.BLS_API_KEY || "",
            censusApiKey: process.env.CENSUS_API_KEY || "",
            eiaApiKey: process.env.EIA_API_KEY || ""
          });
          const reresolved = await reresolver.resolveAll(cites);
          // Attribution check (2026-11-04, run #7): is the author / year written beside each DOI / PMID
          // the registry's? Operator decision: flag and mark inline, never block. An injected
          // re-resolver without the method (tests) simply skips it; a crash is recorded, not thrown.
          let attribution = null;
          if (typeof reresolver.checkAttributions === "function") {
            try {
              attribution = await reresolver.checkAttributions(reresolved, gate.reportText || "");
            } catch (attrErr) {
              // The message goes to the log only: the manifest ships, so it carries a fixed code.
              logger.warn({ event: "citation_attribution_check_failed", error: safeString(attrErr && attrErr.message) });
              attribution = { checked: false, error: "internal_error", results: [] };
            }
          }
          const manifest = buildReproducibilityManifest({
            reresolved: sectionCitations.tag(reresolved),
            attribution,
            retraction: manifestRetraction,
            gate: manifestGate,
            groundedIds: manifestGroundedIds,
            groundedKeys: manifestGroundedKeys,
            reresolutionCompleted: true,
            meta: {
              reportId: missionEnvelope.mission_id,
              deliveryId: context.workflowId,
              resolverTableVersion: reresolver.RESOLVER_TABLE_VERSION,
              asOf: startedAt.slice(0, 10),
              startedAt,
              completedAt: timeProviderModule.nowIso()
            }
          });
          // Mark each mismatched attribution in the shipped sections, the way annotateSubtaskOutputs
          // marks [UNVERIFIED]: the reader sees "[ATTRIBUTION MISMATCH: registry lists …]" beside the
          // identifier. Nothing is rewritten silently; the model's text stays, with the correction next
          // to it. Done BEFORE the manifest is written, so the manifest records how many lines were
          // actually marked and never claims a mark that a failed rewrite did not make.
          const attributionMismatches = attribution && Array.isArray(attribution.results)
            ? attribution.results.filter((a) => a && (a.status === "author_mismatch" || a.status === "year_mismatch"))
            : [];
          if (manifest.summary.attribution_check) {
            let marked = 0;
            if (attributionMismatches.length > 0 && manifest.summary.delivery_decision !== "BLOCK") {
              try {
                marked = annotateSubtaskAttributions(missionResult.subtask_results, attributionMismatches);
              } catch (markErr) {
                logger.warn({ event: "citation_attribution_mark_failed", error: safeString(markErr && markErr.message) });
              }
            }
            manifest.summary.attribution_check.marked_lines = marked;
            logger.info({ event: "citation_attribution_check", mismatched: attributionMismatches.length, marked_lines: marked });
          }
          try {
            const mdir = getWorkflowDir(context.workflowId);
            ensureDir(mdir);
            fs.writeFileSync(path.join(mdir, "reproducibility-manifest.json"), JSON.stringify(manifest, null, 2));
            fs.writeFileSync(path.join(mdir, "reproducibility-manifest.md"), renderManifestMarkdown(manifest));
          } catch (persistErr) {
            logger.warn({ event: "reproducibility_manifest_persist_failed", error: safeString(persistErr && persistErr.message) });
          }
          logger.info({
            event: "citation_reresolution",
            mission_id: missionEnvelope.mission_id,
            verified: manifest.summary.counts.verified,
            unresolved: manifest.summary.counts.unresolved,
            unchecked: manifest.summary.counts.unchecked,
            decision: manifest.summary.delivery_decision
          });
          if (citationVerification) {
            citationVerification.reproducibility = manifest.summary;
            citationVerification.reproducibility_manifest = manifest;
          }
          if (manifest.summary.delivery_decision === "BLOCK") {
            const err = new Error(
              `Citation re-resolution failed: ${manifest.summary.counts.unresolved} cited identifier(s) did NOT resolve ` +
              `in their live source registry — refusing to ship to protect the zero-fabrication guarantee. ` +
              `See reproducibility-manifest.json in the workflow dir.`
            );
            err.code = "PHASE30_CITATION_UNRESOLVED";
            err.citation_verification = citationVerification;
            recordGateFailure(err, "UNRESOLVED");
            throw err;
          }
        }
      } catch (reresolveError) {
        // Re-throw our own hard-fail; swallow only infra errors (fail-soft) so a resolver bug never
        // blocks a report the gate already passed.
        if (reresolveError && reresolveError.code === "PHASE30_CITATION_UNRESOLVED") throw reresolveError;
        logger.warn({ event: "citation_reresolution_failed", error: safeString(reresolveError && reresolveError.message) });
        // T1-8 (2026-11-14): the run stays fail-soft (operator default D1) but never seals a gated
        // report without a manifest. Until this date a crash left none (sealed release
        // offer-bcaf2746298f5280fde747f0 has no reproducibility manifest). The fallback lists every
        // cited id UNCHECKED with reason `reresolution_error` and records reresolution_completed:false,
        // so the bundle says nothing was looked up and delivery refuses it (build-buyer-zip.js,
        // distribute.js, export-release.js). If even the fallback cannot be built, the run stops.
        if (citationVerification && !citationVerification.reproducibility_manifest) {
          let fallback;
          try {
            const checkedAt = timeProviderModule.nowIso();
            fallback = buildReproducibilityManifest({
              reresolved: sectionCitations.tag(sectionCitations.cites.map((c) => ({
                type: c.type, id: c.id, status: "UNCHECKED", resolver_type: "primary",
                evidence: { reason: "reresolution_error" }, checked_at: checkedAt
              }))),
              retraction: manifestRetraction,
              gate: manifestGate,
              groundedIds: manifestGroundedIds,
              groundedKeys: manifestGroundedKeys,
              reresolutionCompleted: false,
              meta: {
                reportId: missionEnvelope.mission_id,
                deliveryId: context.workflowId,
                resolverTableVersion: null,
                asOf: checkedAt.slice(0, 10),
                startedAt: reresolutionStartedAt || checkedAt,
                completedAt: checkedAt
              }
            });
          } catch (fallbackError) {
            const err = new Error(
              "Citation re-resolution crashed, and its fallback manifest could not be built either: " +
              `${safeString(fallbackError && fallbackError.message)} — refusing to seal a gated report without a manifest.`
            );
            err.code = "PHASE30_CITATION_RERESOLUTION_ERROR";
            err.citation_verification = citationVerification;
            recordGateFailure(err, "RERESOLUTION_ERROR");
            throw err;
          }
          try {
            const mdir = getWorkflowDir(context.workflowId);
            ensureDir(mdir);
            fs.writeFileSync(path.join(mdir, "reproducibility-manifest.json"), JSON.stringify(fallback, null, 2));
            fs.writeFileSync(path.join(mdir, "reproducibility-manifest.md"), renderManifestMarkdown(fallback));
          } catch (persistErr) {
            logger.warn({ event: "reproducibility_manifest_persist_failed", error: safeString(persistErr && persistErr.message) });
          }
          logger.warn({
            event: "citation_reresolution_fallback_manifest",
            mission_id: missionEnvelope.mission_id,
            unchecked: fallback.summary.counts.unchecked,
            decision: fallback.summary.delivery_decision
          });
          citationVerification.reproducibility = fallback.summary;
          citationVerification.reproducibility_manifest = fallback;
        }
      }

      // T1-1: the gate passed. The pass:true record is written HERE, after the last rewrite of the
      // shipped sections (the [UNVERIFIED] marks, then the attribution marks above), so the hashes it
      // pins are of exactly the text that ships. It carries the manifest (T1-8 guarantees one). A
      // failed write stops the run (fail-closed): without it the mission could never be packaged, and
      // a stale record must never stand in for it.
      // Tier 1 review (2026-11-14, operator pick D1): the record waits for the workflow's quality audit
      // ("pending" until that step passes), so a run stopped between here and the audit cannot be
      // packaged by generate-offer.js with a density audit that never ran.
      const hasQualityAudit = Array.isArray(workflowDef && workflowDef.pipeline)
        && workflowDef.pipeline.some((s) => s && s.type === "quality_audit");
      try {
        writeMissionCitationRecord({
          rootDir, missionId: missionEnvelope.mission_id, workflowId: context.workflowId, timeProvider,
          pass: true, verdict: gate.verdict, errorCode: null, citationVerification,
          qualityAudit: hasQualityAudit ? "pending" : "not_applicable"
        });
      } catch (recordErr) {
        const err = new Error(`Citation gate passed, but its record could not be written beside the mission: ${safeString(recordErr && recordErr.message)}`);
        err.code = "PHASE30_CITATION_RECORD_WRITE_FAILED";
        err.citation_verification = citationVerification;
        recordGateFailure(err, "RECORD_WRITE_FAILED");
        throw err;
      }
    }

    // The memo and the benchmark: built by buildPostGateArtifacts (below), before re-resolution when the
    // citation gate ran (T2-6), else here for an ungated run. Either way at most once per mission.
    if (missionResult && missionResult.ok) await buildPostGateArtifacts();

    return {
      ok: Boolean(missionResult && missionResult.ok),
      mission_id: missionEnvelope.mission_id,
      mission_result: missionResult,
      citation_verification: citationVerification,
      graveyard_memo: graveyardMemo,
      amendment_risk: amendmentRisk,
      design_benchmark: designBenchmark,
      search_coverage_ledger: searchCoverageLedger
    };

    // T2-6 (2026-11-16): the graveyard memo and the design benchmark, built BEFORE re-resolution so the NCT
    // numbers they ship are re-resolved with the report's identifiers and recorded in the manifest, each
    // tagged with the sections it appears in. Until this date re-resolution read the report's text alone and
    // these files were built afterwards (the order form says they "are not separately re-resolved at
    // delivery"). Still fully fail-soft and bounded: an absent fetcher, an empty indication or a fetch error
    // omits them and can never block a report that cleared the citation gate. (A function declaration, so
    // it is in scope above; it closes over this mission's inputs.)
    async function buildPostGateArtifacts() {
      if (postGateArtifactsBuilt) return;
      postGateArtifactsBuilt = true;
    // Slice 3 v2 — structured kill-memo deliverables. For a passing mission, re-fetch the
    // indication's stopped trials (a session-cache hit from the scout prefetch's call, so no extra
    // CT.gov round-trip) and render the graveyard memo + protocol amendment-risk signal
    // DETERMINISTICALLY from the records (NCT-traced, no LLM — the data IS the artifact). Fully
    // fail-soft + bounded: an absent fetcher, an empty indication, or a fetch error simply omits
    // the memos; it can never block a report that already cleared the citation gate.
    {
      try {
        const ctgov = researchRuntime.ctgovSupplemental;
        const condition = safeString(
          enrichedInputs.indication || enrichedInputs.condition || enrichedInputs.disease
          || enrichedInputs.therapeutic_area || enrichedInputs.topic
        ).trim();
        if (ctgov && typeof ctgov.searchStoppedTrials === "function" && condition) {
          // CENSUS mode: this output is written to a file and never rendered into a prompt, so it
          // walks the full result set rather than riding the scout prefetch's 6-8 record page.
          // That prefetch-shared array was also a silent defect — the memo on 6 of 7 templates was
          // built from scout's SIX records while the copy rules said eight — and the size-aware
          // cache key in the fetcher now makes the two provably distinct.
          const stopped = await ctgov.searchStoppedTrials({ condition, census: true });
          const memo = buildGraveyardMemo(stopped, { indication: condition });
          if (memo.count > 0) {
            const risk = buildAmendmentRisk(stopped);
            graveyardMemo = memo;
            // Keep the section whenever it has something to print. That includes the disclosure
            // that the signal was NOT available (history requested, none returned): gating on
            // `sampled > 0` alone made an unavailable signal vanish from the shipped memo without a
            // word (first real run, 2026-10-08).
            amendmentRisk = risk.markdown ? risk : null;
            try {
              const gdir = getWorkflowDir(context.workflowId);
              ensureDir(gdir);
              fs.writeFileSync(
                path.join(gdir, "graveyard-memo.md"),
                memo.markdown + (amendmentRisk ? "\n" + amendmentRisk.markdown : "")
              );
            } catch (persistErr) {
              logger.warn({ event: "graveyard_memo_persist_failed", error: safeString(persistErr && persistErr.message) });
            }
            logger.info({
              event: "graveyard_memo",
              mission_id: missionEnvelope.mission_id,
              stopped_count: memo.count,
              amendment_band: amendmentRisk ? amendmentRisk.band : null,
              amendment_status: risk.status
            });
          }
        }
      } catch (graveErr) {
        logger.warn({ event: "graveyard_memo_failed", error: safeString(graveErr && graveErr.message) });
      }
    }

    // Trial Design Benchmark Pack — the comparative Phase 3 structure matrix. Same discipline as
    // the graveyard memo above and deliberately placed after it, i.e. AFTER verifyReportCitations
    // (and, since T2-6, before re-resolution, which now checks its NCTs too): a thin cohort or a fetch
    // error must never block a report that already cleared the citation gate. The cohort re-fetch is a
    // session-cache hit from the competitive_intel_analyst prefetch, so it costs no extra CT.gov
    // round-trip, and the memo renders from exactly the records the analyst was grounded on.
    {
      try {
        const bench = researchRuntime.ctgovDesignBenchmark;
        const condition = safeString(
          enrichedInputs.indication || enrichedInputs.condition || enrichedInputs.disease
          || enrichedInputs.therapeutic_area || enrichedInputs.topic
        ).trim();
        const requested = Number(enrichedInputs.benchmark_cohort_size) || 20;
        const drugClass = safeString(enrichedInputs.drug_class || "").trim();
        if (bench && typeof bench.searchDesignCohort === "function" && condition) {
          const cohort = await bench.searchDesignCohort({
            condition,
            pageSize: requested,
            drug_class: drugClass
          });
          const built = buildDesignBenchmark(cohort, {
            indication: condition,
            requested,
            eligibleTotal: cohort && cohort.eligibleTotal,
            selectionRule: cohort && cohort.selectionRule,
            sort: cohort && cohort.sort
          });
          if (built.count > 0) {
            designBenchmark = built;
            try {
              const bdir = getWorkflowDir(context.workflowId);
              ensureDir(bdir);
              fs.writeFileSync(path.join(bdir, "design-benchmark.md"), built.markdown);
              fs.writeFileSync(path.join(bdir, "design-benchmark.csv"), built.csv);
            } catch (persistErr) {
              logger.warn({ event: "design_benchmark_persist_failed", error: safeString(persistErr && persistErr.message) });
            }
            logger.info({
              event: "design_benchmark",
              mission_id: missionEnvelope.mission_id,
              cohort: built.count,
              eligible_total: built.eligibleTotal,
              excluded_from_stats: built.excludedFromStats,
              shortfall: built.shortfall
            });
          }
        }
      } catch (benchErr) {
        logger.warn({ event: "design_benchmark_failed", error: safeString(benchErr && benchErr.message) });
      }
    }
    }
  }

  async function executeDatasetStep(step, workflowDef, inputs, stepResults) {
    const missionStep = findUpstreamMissionResult(step, stepResults);
    if (!missionStep || !missionStep.mission_id) {
      throw new Error(`Dataset step '${step.step_id}' has no upstream mission result`);
    }

    // Both stamp build_started_at / build_completed_at - the "Generated" date of a dataset-sourced
    // offer. Built without a clock they fall back to a frozen epoch, so hand them the engine's.
    const schemaEngine = createSchemaEngine({ rootDir });
    const outputManager = createDatasetOutputManager({ rootDir, timeProvider });
    const builder = createDatasetBuilder({ rootDir, schemaEngine, outputManager, timeProvider });

    const datasetResult = builder.buildDatasetFromSources({
      mission_id: missionStep.mission_id,
      dataset_type: safeString(step.dataset_type) || "retrieval_qa",
      target_schema: safeString(step.target_schema) || "",
      quality_threshold: step.quality_threshold || 0.5,
      packaging_formats: ["jsonl"]
    });

    return {
      ok: Boolean(datasetResult && datasetResult.ok),
      dataset_id: datasetResult.dataset_id,
      row_count: datasetResult.row_count,
      dataset_result: datasetResult
    };
  }

  function executeOfferStep(step, workflowDef, inputs, stepResults) {
    const datasetStep = findUpstreamDatasetResult(step, stepResults);
    const missionStep = findUpstreamMissionResult(step, stepResults);
    const source = datasetStep ? datasetStep.dataset_id : (missionStep ? missionStep.mission_id : null);

    if (!source) {
      throw new Error(`Offer step '${step.step_id}' has no upstream dataset or mission result`);
    }

    const offerParams = {
      product_line: safeString(step.product_line),
      tier: safeString(step.tier),
      targets: step.targets || ["datarade"],
      delivery_targets: step.delivery_targets || []
    };

    let built;
    try {
      built = monetizationRuntime.offerBuilder.buildOffer({ source: safeString(source), ...offerParams });
    } catch (offerError) {
      const fallbackCodes = [
        "PHASE20_DATASET_BUILD_NOT_COMMERCIALIZATION_READY",
        "PHASE19_PRODUCT_LINE_SOURCE_KIND_DENIED"
      ];
      if (fallbackCodes.includes(offerError.code) && missionStep && missionStep.mission_id && source !== missionStep.mission_id) {
        logger.warn({
          event: "phase30_offer_dataset_fallback",
          reason: offerError.message,
          original_source: source,
          mission_id: missionStep.mission_id
        });
        built = monetizationRuntime.offerBuilder.buildOffer({ source: safeString(missionStep.mission_id), ...offerParams });
      } else {
        throw offerError;
      }
    }

    // Slice 3: carry the citation gate's verification into the bundle so the packager can emit
    // the Citation Integrity & Provenance ledger (the deliverable's audit-trail spine).
    if (missionStep && missionStep.citation_verification && built && built.source_context) {
      built.source_context.citation_verification = missionStep.citation_verification;
    }
    // Slice 3 v2: carry the structured kill-memo deliverables (graveyard memo + amendment-risk)
    // into the bundle so the packager ships them as cost-avoidance artifacts.
    if (missionStep && built && built.source_context) {
      if (missionStep.graveyard_memo) built.source_context.graveyard_memo = missionStep.graveyard_memo;
      if (missionStep.amendment_risk) built.source_context.amendment_risk = missionStep.amendment_risk;
      // Trial Design Benchmark Pack: carry the comparative Phase 3 structure matrix into the bundle.
      if (missionStep.design_benchmark) built.source_context.design_benchmark = missionStep.design_benchmark;
      // Q5: carry the Search-Coverage Ledger into the bundle so the packager ships the honest-zero.
      if (missionStep.search_coverage_ledger) built.source_context.search_coverage_ledger = missionStep.search_coverage_ledger;
    }
    // Slice 3 v3: carry the per-section coverage tiers from the upstream quality_audit step (the only
    // step result that carries a section_coverage[]), so the packager can surface Sparse/Moderate/
    // Comprehensive per section in the integrity ledger. Fail-soft: absent → ledger just omits it.
    if (built && built.source_context) {
      const qa = [...stepResults.values()].find(
        (r) => r && Array.isArray(r.section_coverage) && r.section_coverage.length > 0
      );
      if (qa) built.source_context.section_coverage = qa.section_coverage;
    }
    // Business lane (2026-10-21): tell the packager which research profile produced the bundle so
    // its customer copy names the right registries, and hand it the WEB snapshots the report cites
    // (only ones that re-hash cleanly) so a buyer can read every web source the report used.
    const offerProfileId = applyInputSchemaDefaults(workflowDef, inputs).research_profile;
    if (offerProfileId && built && built.source_context) {
      built.source_context.research_profile = offerProfileId;
      const store = researchRuntime.webSnapshotStore;
      const cv = built.source_context.citation_verification;
      const rm = cv && cv.reproducibility_manifest;
      if (store && rm && Array.isArray(rm.citations)) {
        const snapshots = [];
        for (const c of rm.citations) {
          if (c.type !== "WEB") continue;
          const v = store.verify(c.id);
          if (v.status === "found") snapshots.push(v.record);
        }
        if (snapshots.length > 0) built.source_context.web_snapshots = snapshots;
      }
    }
    const tempBundleDir = monetizationRuntime.deliverablePackager.createBundleWorkspace(built.offer.offer_id);
    const artifactRefs = monetizationRuntime.deliverablePackager.writeDeliverables(tempBundleDir, built.offer, built.source_context);
    const generatedSubmission = monetizationRuntime.submissionPackGenerator.generateSubmissionPacks(tempBundleDir, built.offer, built.source_context);
    monetizationRuntime.deliverablePackager.writeBundleRoot(
      tempBundleDir,
      built.offer,
      built.source_context,
      artifactRefs,
      generatedSubmission.submission_refs,
      generatedSubmission.publisher_adapter_snapshot
    );
    monetizationRuntime.deliverablePackager.finalizeBundle(tempBundleDir);
    const bundleDir = monetizationRuntime.deliverablePackager.commitBundle(tempBundleDir, built.offer.offer_id);

    return {
      ok: true,
      offer_id: built.offer.offer_id,
      bundle_dir: bundleDir
    };
  }

  function executeApproveStep(step, workflowDef, inputs, stepResults, context) {
    const offerStep = findUpstreamOfferResult(step, stepResults);
    if (!offerStep || !offerStep.offer_id) {
      throw new Error(`Approve step '${step.step_id}' has no upstream offer result`);
    }

    const approval = monetizationRuntime.releaseApprovalManager.approveRelease({
      offer_id: offerStep.offer_id,
      approver: context.operatorId || "workflow-engine"
    });

    return {
      ok: true,
      offer_id: offerStep.offer_id,
      approval
    };
  }

  async function executeExportStep(step, workflowDef, inputs, stepResults, context) {
    const offerStep = findUpstreamOfferResult(step, stepResults);
    if (!offerStep || !offerStep.offer_id) {
      throw new Error(`Export step '${step.step_id}' has no upstream offer result`);
    }

    const format = step.format || "zip";
    const validated = monetizationRuntime.releaseApprovalManager.validateApprovedRelease(offerStep.offer_id);
    const bundleDir = validated.bundle_dir;

    // T2-14 (2026-11-16): a research (mission) bundle clears the same checks export-release.js runs
    // (scripts/_delivery-checks.js researchExportProblems: a reproducibility manifest whose decision allows
    // shipping, nothing UNRESOLVED, a completed re-resolution pass, no ChEMBL identifier) before anything
    // is copied, zipped or recorded as exported. Before this the step checked only the approval, so the
    // armed proof run workflow-e255cb68727f683268c754db zipped and recorded an export of a release that
    // export-release.js refuses (two ChEMBL ids). A refusal writes and records nothing, and the run still
    // completes, so a run that passed every citation check keeps its vault notes and post-run chain
    // (operator default D1); workflow.json names the problems under artifacts.export_refused.
    const { researchExportProblems } = require("../../scripts/_delivery-checks.js");
    let exportProblems;
    try {
      const offer = JSON.parse(fs.readFileSync(path.join(bundleDir, "offer.json"), "utf8"));
      exportProblems = researchExportProblems(bundleDir, offer);
    } catch (checkError) {
      exportProblems = [`the release could not be checked before export: ${safeString(checkError && checkError.message)}`];
    }
    if (exportProblems.length > 0) {
      logger.warn({ event: "phase30_export_refused", offer_id: offerStep.offer_id, format, problems: exportProblems });
      return {
        ok: true,
        offer_id: offerStep.offer_id,
        exported: false,
        export_refused: exportProblems,
        format
      };
    }

    if (format === "zip") {
      const zipPath = path.join(rootDir, "workspace", "releases", `${offerStep.offer_id}-export.zip`);
      if (fs.existsSync(zipPath)) {
        fs.rmSync(zipPath, { force: true });
      }
      const { buildDeterministicZip } = require("../../scripts/_export-zip-util");
      buildDeterministicZip(bundleDir, zipPath);

      const exportArtifactRef = await monetizationRuntime.submissionEvidenceManager.buildExportArtifactRef({ export_path: zipPath });
      await monetizationRuntime.submissionEvidenceManager.recordExportEvent({
        offer_id: offerStep.offer_id,
        operator_id: context.operatorId || "workflow-engine",
        export_format: "zip",
        exported_platform_targets: validated.approval && Array.isArray(validated.approval.approved_platform_targets)
          ? validated.approval.approved_platform_targets
          : [],
        export_artifact_refs: [exportArtifactRef]
      });

      return {
        ok: true,
        offer_id: offerStep.offer_id,
        exported: true,
        export_path: zipPath,
        format: "zip"
      };
    }

    const targetDir = path.join(rootDir, "workspace", "releases", `${offerStep.offer_id}-export`);
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
    copyDir(bundleDir, targetDir);

    return {
      ok: true,
      offer_id: offerStep.offer_id,
      exported: true,
      export_path: targetDir,
      format: "folder"
    };
  }

  async function executeQualityAuditStep(step, workflowDef, inputs, stepResults) {
    const missionStep = findUpstreamMissionResult(step, stepResults);
    if (!missionStep) {
      throw new Error(`Quality audit step '${step.step_id}' has no upstream mission result`);
    }

    const threshold = step.confidence_threshold || 0.5;
    const minVerifiedCitations = Number(step.min_verified_citations) || 5;
    const missionResult = missionStep.mission_result;
    const subtaskResults = missionResult && missionResult.subtask_results
      ? missionResult.subtask_results
      : [];

    let totalClaims = 0;
    let verifiedClaims = 0;

    const citationPattern = /\b(PubChem|CID\s*[:\s]?\s*\d+|NCT\d{8}|PMID\s*[:\s]?\s*\d+|doi:\s*10\.\d{4,}|10\.\d{4,}\/\S+|FAERS|ChEMBL\w+|ENSG\d+|DrugBank:\s*DB\d+|UniProt:\s*[A-Z]\w+)\b/i;
    // Business lane: the same density heuristic must recognise the lane's citation shapes, or every
    // business report would read as uncited. Literal uppercase prefixes, as in citation-extractor.js.
    const businessCitationPattern = /\b(?:WEB[:\s]+[0-9a-f]{12}|SEC[:\s]+\d{1,10}\/\d{10}-\d{2}-\d{6}|WB[:\s]+[A-Z]{2,4}\.|BLS:\s*[A-Z0-9]*\d|EUROSTAT:\s*[A-Za-z]+_|CENSUS:\s*[a-z]+\/\d{4}\/|EIA:\s*[A-Z]{2,6}\.)/;
    const auditProfile = getResearchProfile(applyInputSchemaDefaults(workflowDef, inputs).research_profile);
    const isCitedLine = auditProfile.id === "business"
      ? (line) => citationPattern.test(line) || businessCitationPattern.test(line)
      : (line) => citationPattern.test(line);

    for (const subtask of subtaskResults) {
      // Operator decision 2026-10-21: the density audit judges MODEL-written text only. The Evidence
      // Desk's brief cites every source it shows, so counting it would let it carry weaker sections.
      if (isDeskAuthoredSubtask(subtask)) continue;
      if (subtask.output_path && fs.existsSync(subtask.output_path)) {
        const content = fs.readFileSync(subtask.output_path, "utf8");
        const lines = content.split("\n").filter((line) => line.trim().length > 10);
        totalClaims += lines.length;
        verifiedClaims += lines.filter(isCitedLine).length;
      }
    }

    // Q11/Q12: this score is citation DENSITY, not verification. `verifiedClaims` here counts lines
    // matching a citation SHAPE (the regex above) — a "citation-shaped line," NOT a verified identifier.
    // It is EXPLICITLY SEPARATE from the truth-based grounding gate (citation-gate.js `grounded_ratio`),
    // which checks each cited id against the evidence actually fetched. This density check is a cheap
    // heuristic that the writing is citation-dense; it never asserts an id is real. Surfaced to buyers as
    // "citation density" (deliverable-packager methodology), never as "confidence"/verification.
    // Density per 100 lines, capped at 1.0; 10+ citation-shaped lines per 100 → full score.
    const citationDensity = totalClaims > 0 ? (verifiedClaims / totalClaims) * 10 : 0;
    const overallConfidence = Math.min(1.0, citationDensity);
    const pass = overallConfidence >= threshold && verifiedClaims >= minVerifiedCitations;

    if (!pass) {
      logger.warn({
        event: "phase30_quality_below_threshold",
        step_id: step.step_id,
        overall_confidence: overallConfidence,
        threshold,
        total_claims: totalClaims,
        verified_claims: verifiedClaims
      });
    }

    // SECTION-LEVEL citation-coverage gate (fail-closed ONLY at zero distinct primary sources).
    // Runs ONLY when the cheap local density check passed, so a report that already fails density
    // never spends any searches. Complementary to verifyReportCitations (which grounds cited IDs
    // against fetched IDs on the mission step): this measures EXTERNAL primary-source coverage per
    // section. Fail-soft on infra (search unreachable -> section UNCHECKED); fail-closed on a genuine
    // zero-coverage section. Helpers are required lazily so a connector problem can never break module
    // load and is only touched on a density-passing quality-audit step.
    let sectionCoverage = [];
    if (pass) {
      const { runSectionGate, assertCoverageOrThrow } = require("../mcp/searxng-mcp/section-gate.js");
      const { searchFn } = require("../mcp/searxng-mcp/searchfn.js");
      const { runCitationGate } = require("../mcp/searxng-mcp/index.js");
      const enrichedInputs = applyInputSchemaDefaults(workflowDef, inputs);
      const primarySubject = String(
        enrichedInputs.indication || enrichedInputs.condition || enrichedInputs.disease
        || enrichedInputs.therapeutic_area || enrichedInputs.topic || ""
      ).trim();
      // Business lane: grade against business primary hosts, on the category the profile names
      // (science since 2026-10-21 — see research-profiles.js), and search with the question's
      // content words: OpenAlex answered the verbatim 3PL question with zero works.
      const sectionGateProfile = getResearchProfile(enrichedInputs.research_profile).sectionGate;
      const coverage = await runSectionGate({
        subtasks: subtaskResults,
        primarySubject: sectionGateProfile ? toSearchQuery(primarySubject) : primarySubject,
        searchFn,
        runGate: runCitationGate,
        readFile: fs.readFileSync,
        maxResults: Number(step.max_results) || 8,
        log: logger,
        ...(sectionGateProfile ? {
          topic: sectionGateProfile.topic,
          extraPrimaryDomains: sectionGateProfile.extraPrimaryDomains
        } : {})
      });
      // Throws PHASE30_CITATION_COVERAGE_ZERO (caught by the per-step try/catch) if any section
      // genuinely returned zero distinct primary sources; otherwise records per-section tiers.
      assertCoverageOrThrow(coverage);
      sectionCoverage = coverage.section_coverage;
    }

    return {
      ok: pass,
      overall_confidence: Math.round(overallConfidence * 1000) / 1000,
      citation_density_raw: totalClaims > 0 ? Math.round((verifiedClaims / totalClaims) * 1000) / 1000 : 0,
      total_claims: totalClaims,
      verified_claims: verifiedClaims,
      min_verified_citations: minVerifiedCitations,
      threshold,
      pass,
      section_coverage: sectionCoverage
    };
  }

  function findUpstreamResult(step, stepResults, predicate) {
    for (const depId of (step.depends_on || []).slice().reverse()) {
      const result = stepResults.get(depId);
      if (result && predicate(result)) {
        return result;
      }
    }
    for (const [, result] of stepResults) {
      if (predicate(result)) {
        return result;
      }
    }
    return null;
  }

  function findUpstreamMissionResult(step, stepResults) {
    return findUpstreamResult(step, stepResults, (r) => r.mission_id);
  }

  function findUpstreamDatasetResult(step, stepResults) {
    return findUpstreamResult(step, stepResults, (r) => r.dataset_id);
  }

  function findUpstreamOfferResult(step, stepResults) {
    return findUpstreamResult(step, stepResults, (r) => r.offer_id);
  }

  function copyDir(sourceDir, targetDir) {
    fs.mkdirSync(targetDir, { recursive: true });
    const entries = fs.readdirSync(sourceDir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const sourcePath = path.join(sourceDir, entry.name);
      const targetPath = path.join(targetDir, entry.name);
      if (entry.isDirectory()) {
        copyDir(sourcePath, targetPath);
      } else {
        fs.copyFileSync(sourcePath, targetPath);
      }
    }
  }

  async function executeWorkflow(workflowDef, context = {}) {
    const validated = validateWorkflowDefinition(workflowDef);
    const workflowId = generateWorkflowId(validated.workflow_template_id, timeProvider);
    const workflowDir = getWorkflowDir(workflowId);
    ensureDir(workflowDir);

    const inputs = context.inputs || {};
    const enrichedContext = {
      ...context,
      workflowId,
      operatorId: context.operatorId || "workflow-engine"
    };

    const state = {
      workflow_id: workflowId,
      template_id: validated.workflow_template_id,
      status: "running",
      inputs: canonicalize(inputs),
      created_at: timeProvider.nowIso(),
      updated_at: timeProvider.nowIso(),
      pipeline_progress: {
        total_steps: validated.pipeline.length,
        completed_steps: 0,
        current_step: null,
        steps: validated.pipeline.map((step) => ({
          step_id: step.step_id,
          type: step.type,
          status: "pending"
        }))
      },
      artifacts: {},
      // Customer run (2026-11-06, core/customer-run.js). Recorded so every later consumer (vault
      // publish, research-memory ingest, any backfill) refuses this run, not just this process.
      ...(context.customerRun === true ? { customer_run: true } : {})
    };

    writeWorkflowState(workflowId, state);
    activeWorkflows.set(workflowId, state);

    // Required-input enforcement (2026-08-20). Templates declared input_schema.required and
    // NOTHING checked it: resolveTemplateVariables leaves an unsupplied key as the literal
    // "{{topic}}", which then reached both the mission description and the seed document, so
    // the run spent full compute researching a placeholder. Authoritative check for every
    // caller of the engine; run-workflow.js repeats it BEFORE the operator-gate ceremony so a
    // typo cannot consume the one-shot YubiKey token.
    //
    // The failure is recorded in workflow.json rather than thrown bare, deliberately: the
    // Obsidian runner falls back to the NEWEST workflow dir when it never saw a workflow_id,
    // so a run that died without its own state file could surface a PREVIOUS run's terminal
    // result as this one's. Writing a failed state for this workflow_id keeps that honest.
    const missingRequiredInputs = findMissingRequiredInputs(validated, inputs);
    if (missingRequiredInputs.length > 0) {
      const inputError = new Error(formatMissingRequiredInputs(validated, missingRequiredInputs));
      inputError.code = "PHASE30_MISSING_REQUIRED_INPUT";
      state.status = "failed";
      state.updated_at = timeProvider.nowIso();
      state.completed_at = timeProvider.nowIso();
      state.error = { code: inputError.code, message: inputError.message };
      writeWorkflowState(workflowId, state);
      activeWorkflows.set(workflowId, state);
      logger.error({
        event: "phase30_missing_required_input",
        workflow_id: workflowId,
        template_id: validated.workflow_template_id,
        missing: missingRequiredInputs.map((item) => item.key),
        code: inputError.code
      });
      throw inputError;
    }

    // Reset interaction log at workflow boundary to prevent chain corruption
    // from previous runs blocking this workflow. Each workflow run starts fresh.
    // CRITICAL: Must call reset() on the instance (not just rewrite the file)
    // because the in-memory promise chain must also be reset.
    try {
      if (researchRuntime.interactionLog && typeof researchRuntime.interactionLog.reset === "function") {
        researchRuntime.interactionLog.reset();
        logger.info({ event: "phase30_interaction_log_reset", workflow_id: workflowId, method: "instance" });
      } else {
        const interactionLogPath = researchRuntime.interactionLog && researchRuntime.interactionLog.storePath
          ? researchRuntime.interactionLog.storePath
          : path.join(rootDir, "security", "interaction-log.json");
        const freshLog = {
          schema_version: INTERACTION_LOG_SCHEMA_VERSION,
          chain_head: CHAIN_ZERO_HASH,
          entries: [],
          next_sequence: 0
        };
        ensureDir(path.dirname(interactionLogPath));
        fs.writeFileSync(interactionLogPath, canonicalJson(canonicalize(freshLog)), "utf8");
        logger.info({ event: "phase30_interaction_log_reset", workflow_id: workflowId, method: "file" });
      }
    } catch (resetErr) {
      logger.warn({ event: "phase30_interaction_log_reset_failed", workflow_id: workflowId, error: resetErr.message });
    }

    const sortedSteps = topologicalSort(validated.pipeline);
    const stepResults = new Map();
    let lastError = null;

    for (const step of sortedSteps) {
      state.pipeline_progress.current_step = step.step_id;
      const stepState = state.pipeline_progress.steps.find((s) => s.step_id === step.step_id);
      if (stepState) {
        stepState.status = "running";
      }
      state.updated_at = timeProvider.nowIso();
      writeWorkflowState(workflowId, state);

      try {
        let result;
        switch (step.type) {
          case "mission":
            result = await executeMissionStep(step, validated, inputs, stepResults, enrichedContext);
            if (result.mission_id) state.artifacts.mission_id = result.mission_id;
            if (result.citation_verification) state.artifacts.citation_verification = result.citation_verification;
            if (result.graveyard_memo) {
              state.artifacts.graveyard = {
                stopped_count: result.graveyard_memo.count,
                amendment_band: result.amendment_risk ? result.amendment_risk.band : null,
                amendment_status: result.amendment_risk ? result.amendment_risk.status : "not_computed"
              };
            }
            break;
          case "dataset":
            result = await executeDatasetStep(step, validated, inputs, stepResults);
            if (result.dataset_id) state.artifacts.dataset_id = result.dataset_id;
            if (result.row_count !== undefined) state.artifacts.row_count = result.row_count;
            break;
          case "quality_audit":
            result = await executeQualityAuditStep(step, validated, inputs, stepResults);
            state.artifacts.quality_report = {
              overall_confidence: result.overall_confidence,
              citation_density_raw: result.citation_density_raw,
              total_claims: result.total_claims,
              verified_claims: result.verified_claims,
              min_verified_citations: result.min_verified_citations,
              threshold: result.threshold,
              // executeQualityAuditStep returns the pass boolean as `ok`; older code read
              // `result.pass` (always undefined → note-gen always saw pass:undefined).
              pass: result.ok !== undefined ? result.ok : result.pass,
              // Per-section external primary-source coverage tiers (additive; deliverable can render
              // Sparse/Moderate/Comprehensive per section).
              section_coverage: result.section_coverage || []
            };
            if (!result.ok) {
              const error = new Error(`Quality audit failed: confidence ${result.overall_confidence} below threshold ${result.threshold}`);
              error.code = "PHASE30_QUALITY_BELOW_THRESHOLD";
              throw error;
            }
            // Tier 1 review (2026-11-14): only now is the mission packageable ("pending" -> "passed").
            // A failed write fails this step, which turns the record to pass:false (the catch below).
            if (state.artifacts.mission_id) {
              try {
                passMissionQualityAudit({ rootDir, missionId: state.artifacts.mission_id });
              } catch (recordErr) {
                const error = new Error(`Quality audit passed, but the mission's citation record could not be updated: ${String(recordErr && recordErr.message)}`);
                error.code = "PHASE30_QUALITY_RECORD_WRITE_FAILED";
                throw error;
              }
            }
            break;
          case "offer":
            result = executeOfferStep(step, validated, inputs, stepResults);
            if (result.offer_id) state.artifacts.offer_id = result.offer_id;
            break;
          case "approve":
            result = executeApproveStep(step, validated, inputs, stepResults, enrichedContext);
            break;
          case "export":
            result = await executeExportStep(step, validated, inputs, stepResults, enrichedContext);
            if (result.export_path) state.artifacts.export_path = result.export_path;
            // T2-14: an export the delivery checks refused leaves no export_path, only the reasons.
            if (Array.isArray(result.export_refused)) state.artifacts.export_refused = result.export_refused;
            break;
          default:
            throw new Error(`Unknown step type '${step.type}'`);
        }

        stepResults.set(step.step_id, result);
        if (stepState) {
          stepState.status = "completed";
          stepState.result = result;
        }
        state.pipeline_progress.completed_steps += 1;

      } catch (error) {
        lastError = error;
        if (stepState) {
          stepState.status = "failed";
          stepState.error = {
            code: error.code || "PHASE30_STEP_FAILED",
            message: String(error.message || error)
          };
        }
        // T1-1 (2026-11-14): a quality audit that fails AFTER the citation gate passed (density below
        // threshold, or a section with zero primary-source coverage) turns the mission's citation
        // record to pass:false, so generate-offer.js cannot package what this workflow refused.
        if (step.type === "quality_audit" && state.artifacts.mission_id) {
          try {
            failMissionCitationRecord({
              rootDir, missionId: state.artifacts.mission_id,
              verdict: "QUALITY_AUDIT_FAILED", errorCode: error.code || "PHASE30_STEP_FAILED",
              qualityAudit: "failed"
            });
          } catch (recordErr) {
            logger.error({ event: "mission_citation_record_fail_failed", mission_id: state.artifacts.mission_id, error: String(recordErr && recordErr.message) });
          }
        }
        logger.error({
          event: "phase30_workflow_step_failed",
          workflow_id: workflowId,
          step_id: step.step_id,
          step_type: step.type,
          error: String(error.message || error),
          code: error.code
        });
        break;
      }
    }

    state.pipeline_progress.current_step = null;
    state.status = lastError ? "failed" : "completed";
    state.updated_at = timeProvider.nowIso();
    state.completed_at = timeProvider.nowIso();
    if (lastError) {
      state.error = {
        code: lastError.code || "PHASE30_WORKFLOW_FAILED",
        message: String(lastError.message || lastError)
      };
    }

    writeWorkflowState(workflowId, state);
    activeWorkflows.set(workflowId, state);

    logger.info({
      event: state.status === "completed" ? "phase30_workflow_completed" : "phase30_workflow_failed",
      workflow_id: workflowId,
      template_id: validated.workflow_template_id,
      status: state.status,
      steps_completed: state.pipeline_progress.completed_steps,
      steps_total: state.pipeline_progress.total_steps,
      artifacts: state.artifacts
    });

    return {
      ok: state.status === "completed",
      workflow_id: workflowId,
      status: state.status,
      artifacts: state.artifacts,
      pipeline_progress: state.pipeline_progress,
      error: state.error || null
    };
  }

  function getWorkflowStatus(workflowId) {
    const cached = activeWorkflows.get(workflowId);
    if (cached) return cached;

    const statePath = path.join(getWorkflowDir(workflowId), "workflow.json");
    if (!fs.existsSync(statePath)) {
      return null;
    }
    return readJson(statePath);
  }

  function cancelWorkflow(workflowId) {
    const state = getWorkflowStatus(workflowId);
    if (!state) {
      throw new Error(`Workflow '${workflowId}' not found`);
    }
    if (state.status !== "running") {
      throw new Error(`Workflow '${workflowId}' is not running (status: ${state.status})`);
    }
    state.status = "cancelled";
    state.updated_at = timeProvider.nowIso();
    writeWorkflowState(workflowId, state);
    activeWorkflows.set(workflowId, state);
  }

  return Object.freeze({
    executeWorkflow,
    getWorkflowStatus,
    cancelWorkflow
  });
}

module.exports = {
  createWorkflowEngine
};
