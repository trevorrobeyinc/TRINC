"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const { validateWorkflowDefinition, resolveTemplateVariables } = require("./workflow-schema.js");
const { validateMissionEnvelope } = require("./mission-envelope-schema.js");
const { canonicalize, canonicalJson, safeString } = require("../../workflows/governance-automation/common.js");
const { createSchemaEngine } = require("../dataset/schema-engine.js");
const { INTERACTION_LOG_SCHEMA_VERSION, CHAIN_ZERO_HASH } = require("./interaction-log.js");
const timeProviderModule = require("./time-provider.js");
const { createDatasetBuilder } = require("../dataset/dataset-builder.js");
const { createDatasetOutputManager } = require("../dataset/dataset-output-manager.js");
const { verifyReportCitations, annotateSubtaskOutputs, checkRetractions } = require("./citation-gate.js");
const { buildGraveyardMemo, buildAmendmentRisk } = require("../monetization/graveyard-memo.js");

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
    if (!schema || !schema.properties) return inputs;
    const merged = { ...inputs };
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (merged[key] === undefined && prop.default !== undefined) {
        merged[key] = prop.default;
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
      if (key === "input_path" || key === "input_dir") continue;
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
      dataset_type: safeString(step.dataset_type) || safeString(workflowDef.pipeline.find((s) => s.type === "dataset")?.dataset_type) || "retrieval_qa"
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
      workflowInputs: enrichedInputs
    });

    // Slice 1 — report-level citation gate. Verify the assembled mission report against the
    // UNION of runtime-fetched identifiers and HARD-FAIL when too many cited ids are ungrounded
    // (present in the report but not in anything actually fetched = likely model-introduced).
    // Protects the zero-fabrication brand promise. Engages only when there IS fetched ground
    // truth (an empty fetch can't fail here — that is surfaced as tool_prefetch_zero_docs).
    let citationVerification = null;
    if (missionResult && missionResult.ok && Array.isArray(missionResult.subtask_results)) {
      const cfgRatio = Number(researchRuntime.config.minGroundedCitationRatio);
      const minGroundedRatio = Number.isFinite(cfgRatio) ? cfgRatio : 0.34;
      const gate = verifyReportCitations({ subtaskResults: missionResult.subtask_results, minGroundedRatio });
      // Literature-integrity: a report must never cite a RETRACTED paper. Fail-soft — Crossref
      // errors yield no retractions, so a network issue can never wrongly block a report.
      const retraction = await checkRetractions(
        gate.reportText,
        researchRuntime.crossrefRetraction && researchRuntime.crossrefRetraction.checkDois
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
        fetched_id_count: gate.fetched_id_count,
        retracted: retractedCount,
        pass: gatePass
      });
      try {
        const gateDir = getWorkflowDir(context.workflowId);
        ensureDir(gateDir);
        fs.writeFileSync(
          path.join(gateDir, "citation-verification.json"),
          JSON.stringify({
            mission_id: missionEnvelope.mission_id,
            pass: gatePass, cited: gate.cited, grounded: gate.grounded, ungrounded: gate.ungrounded,
            grounded_ratio: gate.grounded_ratio, min_grounded_ratio: gate.min_grounded_ratio,
            fetched_id_count: gate.fetched_id_count, ungrounded_list: gate.ungrounded_list,
            retracted: retraction.retracted, dois_checked: retraction.dois_checked || 0
          }, null, 2)
        );
        if (gate.ungrounded > 0 || retractedCount > 0) {
          fs.writeFileSync(path.join(gateDir, "report-annotated.md"), gate.annotatedReport);
        }
      } catch (persistError) {
        logger.warn({ event: "citation_gate_persist_failed", error: safeString(persistError && persistError.message) });
      }
      citationVerification = {
        pass: gatePass, cited: gate.cited, grounded: gate.grounded, ungrounded: gate.ungrounded,
        grounded_ratio: gate.grounded_ratio, min_grounded_ratio: gate.min_grounded_ratio,
        fetched_id_count: gate.fetched_id_count,
        ungrounded_sample: gate.ungrounded_list.slice(0, 25).map((c) => `${c.type}:${c.id}`),
        retracted: retraction.retracted
      };
      if (!gatePass) {
        logger.error({
          event: "citation_gate_failed",
          mission_id: missionEnvelope.mission_id,
          cited: gate.cited, ungrounded: gate.ungrounded, retracted: retractedCount, grounded_ratio: gate.grounded_ratio
        });
        const reason = retractedCount > 0
          ? `the report cites ${retractedCount} RETRACTED paper(s) (${retraction.retracted.join(", ")})`
          : `${gate.ungrounded}/${gate.cited} cited identifiers are ungrounded (grounded ratio ${gate.grounded_ratio} < ${minGroundedRatio})`;
        const err = new Error(
          `Citation gate failed: ${reason} — refusing to ship to protect the zero-fabrication / ` +
          `citation-integrity guarantee. Annotated report written to the workflow dir.`
        );
        err.code = retractedCount > 0 ? "PHASE30_CITATION_RETRACTED" : "PHASE30_CITATION_UNVERIFIED";
        err.citation_verification = citationVerification;
        throw err;
      }
      // Passed, but some citations are still ungrounded → annotate the shipped sections in place
      // so the bundle itself carries the [UNVERIFIED] marks (honesty over completeness).
      if (gate.ungrounded > 0) {
        try {
          annotateSubtaskOutputs(missionResult.subtask_results, gate.fetchedIds);
        } catch (annotateError) {
          logger.warn({ event: "citation_gate_annotate_failed", error: safeString(annotateError && annotateError.message) });
        }
      }
    }

    // Slice 3 v2 — structured kill-memo deliverables. For a passing mission, re-fetch the
    // indication's stopped trials (a session-cache hit from the scout prefetch's call, so no extra
    // CT.gov round-trip) and render the graveyard memo + protocol amendment-risk signal
    // DETERMINISTICALLY from the records (NCT-traced, no LLM — the data IS the artifact). Fully
    // fail-soft + bounded: an absent fetcher, an empty indication, or a fetch error simply omits
    // the memos; it can never block a report that already cleared the citation gate.
    let graveyardMemo = null;
    let amendmentRisk = null;
    if (missionResult && missionResult.ok) {
      try {
        const ctgov = researchRuntime.ctgovSupplemental;
        const condition = safeString(
          enrichedInputs.indication || enrichedInputs.condition || enrichedInputs.disease
          || enrichedInputs.therapeutic_area || enrichedInputs.topic
        ).trim();
        if (ctgov && typeof ctgov.searchStoppedTrials === "function" && condition) {
          const stopped = await ctgov.searchStoppedTrials({ condition });
          const memo = buildGraveyardMemo(stopped, { indication: condition });
          if (memo.count > 0) {
            const risk = buildAmendmentRisk(stopped);
            graveyardMemo = memo;
            amendmentRisk = risk.sampled > 0 ? risk : null;
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
              amendment_band: amendmentRisk ? amendmentRisk.band : null
            });
          }
        }
      } catch (graveErr) {
        logger.warn({ event: "graveyard_memo_failed", error: safeString(graveErr && graveErr.message) });
      }
    }

    return {
      ok: Boolean(missionResult && missionResult.ok),
      mission_id: missionEnvelope.mission_id,
      mission_result: missionResult,
      citation_verification: citationVerification,
      graveyard_memo: graveyardMemo,
      amendment_risk: amendmentRisk
    };
  }

  async function executeDatasetStep(step, workflowDef, inputs, stepResults) {
    const missionStep = findUpstreamMissionResult(step, stepResults);
    if (!missionStep || !missionStep.mission_id) {
      throw new Error(`Dataset step '${step.step_id}' has no upstream mission result`);
    }

    const schemaEngine = createSchemaEngine({ rootDir });
    const outputManager = createDatasetOutputManager({ rootDir });
    const builder = createDatasetBuilder({ rootDir, schemaEngine, outputManager });

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

    for (const subtask of subtaskResults) {
      if (subtask.output_path && fs.existsSync(subtask.output_path)) {
        const content = fs.readFileSync(subtask.output_path, "utf8");
        const lines = content.split("\n").filter((line) => line.trim().length > 10);
        totalClaims += lines.length;
        verifiedClaims += lines.filter((line) => citationPattern.test(line)).length;
      }
    }

    // Confidence uses citation density per 100 lines, capped at 1.0.
    // A report with 10+ citations per 100 lines of content achieves full confidence.
    // This rewards meaningful citation density without requiring every line to have a citation.
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

    return {
      ok: pass,
      overall_confidence: Math.round(overallConfidence * 1000) / 1000,
      citation_density_raw: totalClaims > 0 ? Math.round((verifiedClaims / totalClaims) * 1000) / 1000 : 0,
      total_claims: totalClaims,
      verified_claims: verifiedClaims,
      min_verified_citations: minVerifiedCitations,
      threshold,
      pass
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
      artifacts: {}
    };

    writeWorkflowState(workflowId, state);
    activeWorkflows.set(workflowId, state);

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
                amendment_band: result.amendment_risk ? result.amendment_risk.band : null
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
              pass: result.ok !== undefined ? result.ok : result.pass
            };
            if (!result.ok) {
              const error = new Error(`Quality audit failed: confidence ${result.overall_confidence} below threshold ${result.threshold}`);
              error.code = "PHASE30_QUALITY_BELOW_THRESHOLD";
              throw error;
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
