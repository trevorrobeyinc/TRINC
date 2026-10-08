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
const { verifyReportCitations, annotateSubtaskOutputs, checkRetractions, DEFAULT_MIN_GROUNDED_RATIO } = require("./citation-gate.js");
const { extractCitations, deduplicateCitations } = require("./citation-extractor.js");
const { createCitationReresolver } = require("../mcp/citation-reresolver/citation-reresolver.js");
const { buildReproducibilityManifest, renderManifestMarkdown } = require("./reproducibility-manifest.js");
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
    let searchCoverageLedger = null; // Q5: the deterministic Search-Coverage Ledger (honest-zero deliverable)
    if (missionResult && missionResult.ok && Array.isArray(missionResult.subtask_results)) {
      // Q7: the grounded floor is a required, config-owned value (config/agent-config.json). Fail
      // CLOSED — if it is missing or malformed, use the strict shared default and WARN loudly; never
      // silently fall back to a laxer number (the old 0.34 fallback quietly undercut the config).
      const cfgRatio = Number(researchRuntime.config.minGroundedCitationRatio);
      let minGroundedRatio = cfgRatio;
      if (!Number.isFinite(cfgRatio)) {
        minGroundedRatio = DEFAULT_MIN_GROUNDED_RATIO;
        logger.warn({
          event: "min_grounded_ratio_unconfigured",
          using: DEFAULT_MIN_GROUNDED_RATIO,
          note: "config/agent-config.json minGroundedCitationRatio missing/invalid — failing closed to the strict default"
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
        researchRuntime.pubmedRetraction && researchRuntime.pubmedRetraction.resolveDoisToPmids
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
            fetched_id_count: gate.fetched_id_count, ungrounded_list: gate.ungrounded_list,
            retracted: retraction.retracted,
            retracted_dois: retraction.retracted_dois || [],
            retracted_pmids: retraction.retracted_pmids || [],
            retracted_dois_via_pmid: retraction.retracted_dois_via_pmid || [],
            unflagged_notice_dois: retraction.unflagged_notice_dois || [],
            retraction_screen_checked: Boolean(retraction.checked),
            dois_checked: retraction.dois_checked || 0,
            pmids_checked: retraction.pmids_checked || 0,
            dois_escalated_via_pmid: retraction.dois_escalated_via_pmid || 0,
            dois_cited: retraction.dois_cited || 0,
            pmids_cited: retraction.pmids_cited || 0,
            unscreened: retraction.unscreened || 0
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
        fetched_id_count: gate.fetched_id_count,
        ungrounded_sample: gate.ungrounded_list.slice(0, 25).map((c) => `${c.type}:${c.id}`),
        retracted: retraction.retracted,
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
        err.code = retractedCount > 0
          ? "PHASE30_CITATION_RETRACTED"
          : gate.verdict === "INSUFFICIENT_EVIDENCE"
            ? "PHASE30_CITATION_INSUFFICIENT_EVIDENCE"
            : gate.verdict === "NO_CITATIONS"
              ? "PHASE30_CITATION_NONE"
              : "PHASE30_CITATION_UNVERIFIED";
        err.citation_verification = citationVerification;
        err.search_coverage = searchCoverageLedger ? searchCoverageLedger.summary : null;
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

      // Slice 4 — citation RE-RESOLUTION + Reproducibility Manifest. The gate proved the cited ids
      // are GROUNDED in fetched evidence; this independently RE-RESOLVES each one against its live
      // source registry at delivery and records VERIFIED / UNRESOLVED / UNCHECKED in a manifest.
      // Fail-soft on infra (network/throttle => UNCHECKED, never a false VERIFIED); fail-CLOSED on
      // fabrication (a live "does-not-exist" => UNRESOLVED => BLOCK), mirroring the gate above.
      try {
        const cites = deduplicateCitations(extractCitations(gate.reportText || ""));
        if (cites.length > 0) {
          const startedAt = timeProviderModule.nowIso();
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
            minRequestIntervalMs: ncbiApiKey ? 110 : 350
          });
          const reresolved = await reresolver.resolveAll(cites);
          const manifest = buildReproducibilityManifest({
            reresolved,
            // `checked` must reflect whether the screens actually covered every cited identifier —
            // hardcoding `true` made the manifest claim a retraction screen that a rate-limited or
            // unreachable source may have skipped entirely. DOI and PMID retractions stay in their
            // own fields so a retracted PMID is never mislabeled as a DOI in the sealed manifest.
            retraction: {
              checked: Boolean(retraction.checked),
              retracted_dois: retraction.retracted_dois || [],
              retracted_pmids: retraction.retracted_pmids || []
            },
            gate: {
              cited: gate.cited, grounded: gate.grounded, ungrounded: gate.ungrounded,
              grounded_ratio: gate.grounded_ratio, min_grounded_ratio: gate.min_grounded_ratio, hardFail: false
            },
            groundedIds: gate.fetchedIds,
            meta: {
              reportId: missionEnvelope.mission_id,
              deliveryId: context.workflowId,
              resolverTableVersion: reresolver.RESOLVER_TABLE_VERSION,
              asOf: startedAt.slice(0, 10),
              startedAt,
              completedAt: timeProviderModule.nowIso()
            }
          });
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
            throw err;
          }
        }
      } catch (reresolveError) {
        // Re-throw our own hard-fail; swallow only infra errors (fail-soft) so a resolver bug never
        // blocks a report the gate already passed.
        if (reresolveError && reresolveError.code === "PHASE30_CITATION_UNRESOLVED") throw reresolveError;
        logger.warn({ event: "citation_reresolution_failed", error: safeString(reresolveError && reresolveError.message) });
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

    // Trial Design Benchmark Pack — the comparative Phase 3 structure matrix. Same discipline as
    // the graveyard memo above and deliberately placed after it, i.e. AFTER verifyReportCitations
    // and the re-resolution gate: a thin cohort or a fetch error must never block a report that
    // already cleared the citation gate. The cohort re-fetch is a session-cache hit from the
    // competitive_intel_analyst prefetch, so it costs no extra CT.gov round-trip, and the memo
    // renders from exactly the records the analyst was grounded on.
    let designBenchmark = null;
    if (missionResult && missionResult.ok) {
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
    // section. Fail-soft on infra (SearXNG unreachable -> section UNCHECKED); fail-closed on a genuine
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
      const coverage = await runSectionGate({
        subtasks: subtaskResults,
        primarySubject,
        searchFn,
        runGate: runCitationGate,
        readFile: fs.readFileSync,
        maxResults: Number(step.max_results) || 8,
        log: logger
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
      artifacts: {}
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
