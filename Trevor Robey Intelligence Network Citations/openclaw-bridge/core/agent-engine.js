"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { canonicalize, safeString } = require("../../workflows/governance-automation/common.js");
const { validateTaskDefinition } = require("./task-definition-schema.js");
const { enrichWithWikiLinks } = require("./wiki-link-enricher.js");
const { extractCitations, deduplicateCitations, crossCheckCitations } = require("./citation-extractor.js");

const SYNTHESIZER_TASK_ID_PATTERN = /synth|report_generator|integrator/i;

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function makeError(code, message, details) {
  const error = new Error(String(message || "Agent engine error"));
  error.code = String(code || "PHASE14_AGENT_ENGINE_ERROR");
  if (typeof details !== "undefined") {
    error.details = details;
  }
  return error;
}

function normalizeIso(value) {
  const text = safeString(value);
  if (!text || !Number.isFinite(Date.parse(text))) {
    return "1970-01-01T00:00:00.000Z";
  }
  return text;
}

function readFileText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function walkDirFiles(dirPath) {
  const out = [];
  const stack = [dirPath];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
        continue;
      }
      if (entry.isFile()) {
        out.push(abs);
      }
    }
  }
  out.sort((left, right) => left.localeCompare(right));
  return out;
}

function isWithinAllowedRoot(absPath) {
  const roots = String(process.env.OPENCLAW_INPUT_ROOTS || "")
    .split(":")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((r) => path.resolve(r));
  roots.push(path.resolve(process.env.OPENCLAW_ROOT || process.cwd()));
  return roots.some((root) => absPath === root || absPath.startsWith(root + path.sep));
}

function loadInputs(inputs) {
  const normalized = Array.isArray(inputs) ? inputs : [];
  const loaded = [];
  for (const input of normalized) {
    const inputPath = path.resolve(safeString(input.path || input));
    if (!inputPath || !fs.existsSync(inputPath)) {
      continue;
    }
    // Security (audit state-rehydration): confine inputs to the OpenClaw root so a
    // tampered/crafted task envelope cannot read arbitrary host files (e.g. ~/.ssh/*)
    // into the LLM prompt or saved output. Override roots via OPENCLAW_INPUT_ROOTS.
    if (!isWithinAllowedRoot(inputPath)) {
      continue;
    }
    const stat = fs.statSync(inputPath);
    if (stat.isDirectory()) {
      const files = walkDirFiles(inputPath);
      for (const filePath of files) {
        loaded.push({
          path: filePath,
          rel: path.relative(process.cwd(), filePath).split(path.sep).join("/"),
          content: readFileText(filePath)
        });
      }
      continue;
    }

    loaded.push({
      path: inputPath,
      rel: path.relative(process.cwd(), inputPath).split(path.sep).join("/"),
      content: readFileText(inputPath)
    });
  }

  loaded.sort((left, right) => left.rel.localeCompare(right.rel));
  return loaded;
}

function buildPrompt(taskDefinition, inputDocs, context = {}) {
  const systemPrefix = safeString(context.systemPrefix);
  // Persistent agent identity (SOUL.md/AGENTS.md + recent-session digest), loaded from
  // config/agents/<role>/ by the role router and carried in context. Prepended ahead of
  // the role prompt. Empty when no identity is configured → unchanged behavior.
  const agentIdentityPrefix = safeString(context.agentIdentityPrefix);
  const baseInstruction = systemPrefix || "You are a local-first research agent.";
  const roleInstruction = agentIdentityPrefix
    ? `${agentIdentityPrefix}\n\n${baseInstruction}`
    : baseInstruction;

  const headerParts = [
    // Fence: everything up to "END INSTRUCTIONS" steers the agent and must NOT appear in its output.
    "===== INSTRUCTIONS (obey these; they are NOT part of your deliverable — do not reproduce them) =====",
    roleInstruction,
    "",
    `Task Type: ${taskDefinition.type}`,
    `Task Description: ${taskDefinition.description}`,
    `Output Format: ${taskDefinition.output_format}`,
    `Constraints: ${JSON.stringify(taskDefinition.constraints || {})}`,
    "",
    "CITATION REQUIREMENTS: For every factual claim, include specific database identifiers inline. Use: PubChem CID (e.g. CID: 2244), PMID (e.g. PMID: 12345678), NCT numbers (e.g. NCT01234567), ChEMBL IDs (e.g. CHEMBL25), ENSG IDs (e.g. ENSG00000157764), UniProt accessions (e.g. UniProt: P04637), DOIs (e.g. doi: 10.1000/example). Aim for at least one verifiable identifier per substantive paragraph. This output will be automatically audited for verifiable citations.",
    "ABSOLUTE RULE — ZERO FABRICATION (this is the entire value of the business): NEVER invent, guess, or approximate an identifier. Cite ONLY identifiers that appear verbatim in the live database documents provided below. If you cannot find a real, retrievable source for a claim, you MUST write \"[no verifiable citation found]\" and state the claim as UNVERIFIED — it is always correct to say you could not find a source, and never acceptable to fabricate one. A single invented PMID/NCT/DOI/ChEMBL/CID/UniProt identifier is a critical failure that destroys the report. Do not pattern-match plausible-looking numbers; if it is not in the provided evidence, it is not a citation.",
    ""
  ];

  // Detect if any input docs are from ToolUniverse (live data)
  const hasLiveData = inputDocs.some((doc) =>
    doc.path && doc.path.startsWith("tooluniverse://")
  );
  if (hasLiveData) {
    headerParts.push(
      "LIVE DATABASE CONTEXT: The input documents below marked 'tooluniverse://' " +
      "contain LIVE DATA retrieved from biomedical databases via ToolUniverse. " +
      "PRIORITIZE this live data over your training knowledge. Cite the specific " +
      "database source for every claim derived from live data. Do not fabricate " +
      "data points beyond what the live results provide."
    );
    headerParts.push("");
  }

  // Optional advisory digest from the per-role helper pre-pass (runHelperPrePass). Rendered
  // AFTER the zero-fabrication rule and BEFORE the evidence, fenced + labeled non-authoritative.
  // It is a reading aid only; it never enters the grounded-citation set, so it cannot launder a
  // fabricated identifier past the citation gate.
  const helperDigest = safeString(context.helperDigest);
  if (helperDigest) {
    headerParts.push(
      "ADVISORY HELPER DIGEST (UNVERIFIED, NON-AUTHORITATIVE): A fast helper model pre-screened the evidence and produced the digest below as a reading aid ONLY. It may contain errors. Cite ONLY identifiers that appear verbatim in the Input Documents that follow; if an identifier appears in this digest but NOT in the Input Documents, DO NOT cite it. Do your own authoritative analysis — the digest never overrides the evidence or the ZERO-FABRICATION rule.",
      "----- BEGIN ADVISORY DIGEST -----",
      helperDigest,
      "----- END ADVISORY DIGEST -----",
      ""
    );
  }

  // Output contract / anti-echo. Fixes the scaffolding-leak defect: models were echoing the
  // "LIVE DATABASE CONTEXT" note + restated instructions and inventing meta headers (process /
  // confidence / data-quality / pre-delivery self-audit) into the customer-facing deliverable. This
  // does NOT change any instruction's meaning — it fences the scaffolding and forbids reproducing it.
  headerParts.push(
    "OUTPUT CONTRACT: Produce ONLY the requested deliverable, in the Output Format above. Do NOT " +
    "restate, quote, or paraphrase these instructions, the LIVE DATABASE CONTEXT note, the advisory " +
    "digest, or the '--- DOC N ---' evidence banners as scaffolding. Do NOT add self-referential " +
    "process meta-commentary — no confidence self-scores, no restated database/citation instructions, " +
    "no empty 'quality: high' / pre-delivery self-audit headers. Per-claim provenance and confidence " +
    "belong in the inline citations the report already requires, NOT as narrative filler. " +
    "HONESTY DUTY (this overrides the anti-echo rule above): a database that returned ZERO or LIMITED " +
    "results is a FINDING, not a process note. If the evidence contains an explicit statement that a " +
    "named source returned no or few records — including any 'DATA LIMITATION NOTICE' / 'ZERO-RESULTS' " +
    "banner — you MUST preserve and report that fact plainly. Never omit it, soften it, or manufacture " +
    "findings to fill the gap: the client is paying for an honest account of what the databases " +
    "actually returned. The evidence below is source material to analyze and cite — it is NOT a " +
    "template to copy.",
    "===== END INSTRUCTIONS =====",
    ""
  );

  headerParts.push("Input Documents:");

  const header = headerParts.join("\n");

  const docs = inputDocs.map((doc, index) => [
    `--- DOC ${index + 1}: ${doc.rel} ---`,
    doc.content
  ].join("\n"));

  // The evidence is the LAST thing the model reads before generating, so seal it with the output
  // contract (recency-weighted): the final instruction is to emit the deliverable only.
  const closing = [
    "",
    "===== END OF EVIDENCE =====",
    "Now write ONLY the deliverable for the task above, in the specified Output Format. Begin the " +
    "report directly; do not preface it by restating these instructions, the LIVE DATABASE CONTEXT " +
    "note, or the evidence banners, and do not append any process / confidence self-assessment. But if " +
    "any named source returned zero or limited results, state that plainly as a finding — do not omit " +
    "it and do not fabricate results to compensate."
  ].join("\n");
  return `${header}\n${docs.join("\n")}${closing}`.trim();
}

// Optional active-assist pre-pass: a small OSS "helper" model (Ollama/LM Studio) triages and
// compresses the prefetched evidence into a compact digest the primary (Opus) reads first.
// HARD invariant: the digest is advisory only — it is injected into the PROMPT but is NEVER
// added to the grounded-citation set, so a hallucinated identifier in the digest is still
// caught as ungrounded by the citation gate. Fail-soft: any error returns "" and the primary
// runs alone (the helper must never be able to fail a run).
async function runHelperPrePass({ taskDefinition, inputDocs, helper, llmAdapter, logger, taskId, role }) {
  if (!helper || !safeString(helper.provider)) return "";
  if (!Array.isArray(inputDocs) || inputDocs.length === 0) return "";

  const evidence = inputDocs
    .map((doc, index) => `--- DOC ${index + 1}: ${(doc && doc.rel) || "doc"} ---\n${(doc && doc.content) || ""}`)
    .join("\n");

  const helperPrompt = [
    `You are a fast PRE-PASS assistant helping a senior ${role || "research"} agent.`,
    "Your ONLY job is to triage and compress the evidence below into a compact, well-organized digest the senior agent will read before doing its own authoritative analysis.",
    "HARD RULES:",
    "- NEVER invent, guess, or alter any identifier (PMID, NCT, DOI, ChEMBL, CID, UniProt, ENSG). Copy identifiers VERBATIM from the evidence.",
    "- Do NOT add any fact or identifier that is not present in the evidence below.",
    "- Do NOT write the final report or draw final conclusions. Just organize: group related records, note which sources bear on which sub-questions, surface candidate claims with the verbatim source identifier each rests on, and flag duplicates or gaps.",
    "- If the evidence is thin or empty, say so plainly in one line.",
    "OUTPUT: a short bulleted digest (relevance notes, each followed by the verbatim source identifier(s) it rests on).",
    "",
    `Senior agent's task: ${safeString(taskDefinition && taskDefinition.description)}`,
    "",
    "EVIDENCE:",
    evidence
  ].join("\n");

  try {
    const res = await llmAdapter.complete(helperPrompt, {
      taskId: `${taskId}:helper`,
      provider: helper.provider,
      model: safeString(helper.model),
      // No fallbackProvider on purpose: the helper is optional. If it errors, we skip it.
      maxTokens: Number(helper.maxTokens) > 0 ? Number(helper.maxTokens) : 1024
    });
    const digest = safeString(res && res.text);
    logger.info({
      event: "helper_prepass_complete",
      role,
      helper_provider: helper.provider,
      helper_model: safeString(helper.model),
      digest_chars: digest.length
    });
    return digest;
  } catch (err) {
    logger.warn({
      event: "helper_prepass_skipped",
      role,
      helper_provider: helper.provider,
      error: safeString(err && err.message)
    });
    return "";
  }
}

function buildOrchestratedTaskDefinition(taskEnvelope = {}, defaults = {}) {
  return canonicalize({
    task_id: safeString(taskEnvelope.task_id || taskEnvelope.taskId),
    type: safeString(taskEnvelope.type) || safeString(defaults.defaultTaskType) || "freeform",
    description: safeString(taskEnvelope.description) || safeString(defaults.defaultDescription) || "Mission subtask",
    inputs: Array.isArray(taskEnvelope.inputs) ? canonicalize(taskEnvelope.inputs) : [],
    output_format: safeString(taskEnvelope.output_format || taskEnvelope.outputFormat) || safeString(defaults.defaultOutputFormat) || "markdown",
    constraints: canonicalize({
      ...(isPlainObject(taskEnvelope.constraints) ? taskEnvelope.constraints : {}),
      mission_id: safeString(taskEnvelope.mission_id || taskEnvelope.missionId),
      agent_id: safeString(taskEnvelope.agent_id || taskEnvelope.agentId),
      subtask_id: safeString(taskEnvelope.subtask_id || taskEnvelope.subtaskId)
    }),
    created_at: normalizeIso(taskEnvelope.created_at || taskEnvelope.createdAt || defaults.createdAt)
  });
}

function createAgentEngine(options = {}) {
  const logger = isPlainObject(options.logger) ? options.logger : { info() {}, warn() {}, error() {} };
  const timeProvider = options.timeProvider && typeof options.timeProvider.nowIso === "function"
    ? options.timeProvider
    : { nowIso: () => "1970-01-01T00:00:00.000Z" };
  const config = isPlainObject(options.config) ? options.config : {};

  const governanceBridge = options.governanceBridge;
  const llmAdapter = options.llmAdapter;
  const outputManager = options.outputManager;

  if (!governanceBridge || typeof governanceBridge.requestTaskApproval !== "function") {
    throw makeError("PHASE14_AGENT_ENGINE_CONFIG_INVALID", "governanceBridge.requestTaskApproval is required");
  }
  if (!llmAdapter || typeof llmAdapter.complete !== "function") {
    throw makeError("PHASE14_AGENT_ENGINE_CONFIG_INVALID", "llmAdapter.complete is required");
  }
  if (!outputManager || typeof outputManager.saveOutput !== "function") {
    throw makeError("PHASE14_AGENT_ENGINE_CONFIG_INVALID", "outputManager.saveOutput is required");
  }

  const taskState = new Map();

  function setStatus(taskId, status, details = {}) {
    const existing = taskState.get(taskId) || {};
    const next = canonicalize({
      ...existing,
      task_id: taskId,
      status,
      updated_at: normalizeIso(timeProvider.nowIso()),
      ...details
    });
    taskState.set(taskId, next);
    return next;
  }

  async function executeTask(taskDefinition, context = {}) {
    let normalizedTask;
    try {
      normalizedTask = validateTaskDefinition(taskDefinition);
    } catch (error) {
      throw error;
    }

    const taskId = safeString(normalizedTask.task_id);
    const startedAt = normalizeIso(timeProvider.nowIso());
    setStatus(taskId, "pending", { task_definition: normalizedTask, started_at: startedAt });

    if (!context.supervisorDecision || context.supervisorDecision.approved !== true) {
      setStatus(taskId, "rejected", { reason: "SUPERVISOR_APPROVAL_REQUIRED" });
      throw makeError("SUPERVISOR_APPROVAL_REQUIRED", "Task execution requires a supervisor approval receipt", { task_id: taskId });
    }

    setStatus(taskId, "supervisor_approved", {
      supervisor_decision: canonicalize(context.supervisorDecision)
    });

    const approval = await governanceBridge.requestTaskApproval(normalizedTask, context);
    if (!approval || approval.approved !== true) {
      const rejection = setStatus(taskId, "rejected", {
        reason: safeString(approval && approval.reason) || "governance_rejected"
      });

      await outputManager.saveOutput(taskId, `Task rejected: ${rejection.reason}`, {
        status: "rejected",
        type: normalizedTask.type,
        output_format: normalizedTask.output_format,
        provider: safeString(context.provider) || "mock",
        model: safeString(context.model) || "mock-v1",
        started_at: startedAt,
        completed_at: normalizeIso(timeProvider.nowIso()),
        task_definition: normalizedTask,
        error_code: "PHASE14_TASK_REJECTED",
        error_message: rejection.reason
      });

      await governanceBridge.recordTaskExecution(taskId, {
        status: "rejected",
        reason: rejection.reason
      }, context);

      return canonicalize({ ok: false, task_id: taskId, status: "rejected", reason: rejection.reason });
    }

    setStatus(taskId, "governance_approved", {
      governance_decision: canonicalize(approval)
    });

    try {
      setStatus(taskId, "executing");
      const inputDocs = loadInputs(normalizedTask.inputs);
      // Live ToolUniverse-fetched identifiers — the ground-truth set for the report-level
      // citation gate (Slice 1). Persisted into this task's metadata so the workflow engine
      // can verify the assembled report against what was actually fetched at runtime.
      let fetchedCitationIds = [];
      let searchCoverage = []; // Q5: per-search outcome log for the deterministic Search-Coverage Ledger

      // WS1: Inject live ToolUniverse data before prompt construction
      if (context.toolPrefetch && typeof context.toolPrefetch.prefetchForRole === "function") {
        const roleName = safeString(context.agentRole);
        if (roleName) {
          try {
            const toolDocs = await context.toolPrefetch.prefetchForRole(
              roleName, context.workflowInputs || {}
            );
            inputDocs.push(...toolDocs);
            searchCoverage = Array.isArray(toolDocs.coverage) ? toolDocs.coverage : [];
            fetchedCitationIds = deduplicateCitations(
              extractCitations(toolDocs.map((d) => (d && d.content) || "").join("\n\n"))
            ).map((c) => String(c.id));
            if (toolDocs.length > 0) {
              logger.info({
                event: "tool_prefetch_injected",
                role: roleName,
                tool_doc_count: toolDocs.length
              });
            }
          } catch (prefetchError) {
            logger.warn({
              event: "tool_prefetch_failed",
              role: roleName,
              error: safeString(prefetchError && prefetchError.message)
            });
            // Surface the limitation into the prompt so the model knows it is running WITHOUT
            // live-database grounding and must not invent identifiers.
            inputDocs.push({
              rel: "LIVE-DATA-LIMITATION-NOTICE",
              content: "DATA LIMITATION NOTICE: live biomedical-database prefetch FAILED for this task, so no runtime-fetched records were injected below. Do NOT fabricate database identifiers (PMID / NCT / DOI / ChEMBL / CID / UniProt); cite only sources you can state with high confidence and explicitly flag any claim that lacks a verifiable citation."
            });
          }
        }
      }

      // Grounded-citation set = every identifier present in this agent's input context (live
      // prefetch records + upstream sections). Any identifier in the OUTPUT but not here is
      // "ungrounded" — introduced by the model rather than the fetched evidence. This is the
      // signal that protects the zero-fabrication brand promise.
      const groundedCitationIds = deduplicateCitations(
        extractCitations(inputDocs.map((d) => (d && d.content) || "").join("\n\n"))
      ).map((c) => String(c.id));

      // Optional helper pre-pass (active assist): a small OSS model triages/compresses the
      // evidence for the primary backend. Advisory only — groundedCitationIds above is computed
      // from inputDocs BEFORE this runs and is NOT expanded by the digest, so the helper can
      // never launder a fabricated citation past the gate. Fail-soft (returns "" on any error).
      let helperDigest = "";
      if (context.helper) {
        helperDigest = await runHelperPrePass({
          taskDefinition: normalizedTask,
          inputDocs,
          helper: context.helper,
          llmAdapter,
          logger,
          taskId,
          role: safeString(context.agentRole)
        });
      }

      const prompt = buildPrompt(normalizedTask, inputDocs, { ...context, helperDigest });

      const completion = await llmAdapter.complete(prompt, {
        taskId,
        provider: safeString(context.provider),
        fallbackProvider: safeString(context.fallbackProvider),
        model: safeString(context.model),
        maxTokens: Number(config.maxTokensPerRequest || 0)
      });

      let outputText = completion.text;
      let wikiLinks = null;
      const isSynthesizerTask = SYNTHESIZER_TASK_ID_PATTERN.test(taskId)
        || SYNTHESIZER_TASK_ID_PATTERN.test(safeString(context.agentRole));
      const outputFormatForEnrich = safeString(normalizedTask.output_format) || "markdown";
      if (isSynthesizerTask && outputFormatForEnrich === "markdown") {
        try {
          const enriched = enrichWithWikiLinks(completion.text, {
            workflowInputs: context.workflowInputs || {}
          });
          outputText = enriched.markdown;
          wikiLinks = enriched.links;
          logger.info({
            event: "wiki_link_enrichment_applied",
            task_id: taskId,
            link_count: Array.isArray(wikiLinks) ? wikiLinks.length : 0
          });
        } catch (enrichError) {
          logger.warn({
            event: "wiki_link_enrichment_failed",
            task_id: taskId,
            error: safeString(enrichError && enrichError.message)
          });
        }
      }

      // Zero-fabrication audit: cross-check the output's citations against the grounded set.
      const citationCheck = crossCheckCitations(outputText, groundedCitationIds);
      logger.info({
        event: "citation_verification",
        task_id: taskId,
        role: safeString(context.agentRole),
        cited: citationCheck.total,
        grounded: citationCheck.verified_count,
        ungrounded: citationCheck.unverified_count,
        grounded_ratio: citationCheck.verified_ratio
      });
      if (citationCheck.total > 0 && citationCheck.unverified_count > 0) {
        logger.warn({
          event: "citation_verification_ungrounded",
          task_id: taskId,
          role: safeString(context.agentRole),
          ungrounded_count: citationCheck.unverified_count,
          sample: citationCheck.unverified.slice(0, 8).map((c) => `${c.type}:${c.id}`)
        });
      }
      const citationVerification = {
        cited: citationCheck.total,
        grounded: citationCheck.verified_count,
        ungrounded: citationCheck.unverified_count,
        grounded_ratio: citationCheck.verified_ratio
      };

      const completedAt = normalizeIso(timeProvider.nowIso());
      const outputWrite = outputManager.saveOutput(taskId, outputText, {
        status: "completed",
        type: normalizedTask.type,
        output_format: normalizedTask.output_format,
        provider: completion.provider,
        model: completion.model,
        started_at: startedAt,
        completed_at: completedAt,
        duration_ms: Number(completion.durationMs || 0),
        token_count: Number(completion.tokenCount || 0),
        task_definition: normalizedTask,
        provider_info: llmAdapter.getProviderInfo(),
        citation_verification: citationVerification,
        fetched_citation_ids: fetchedCitationIds,
        search_coverage: searchCoverage
      });

      const rlhfResult = await governanceBridge.generateRLHFEntry(taskId, {
        prompt,
        response: completion.text,
        provider: completion.provider,
        model: completion.model,
        tokenCount: completion.tokenCount,
        durationMs: completion.durationMs
      }, {
        ...context,
        taskOutputDir: outputWrite.task_dir
      });

      outputManager.saveOutput(taskId, outputText, {
        status: "completed",
        type: normalizedTask.type,
        output_format: normalizedTask.output_format,
        provider: completion.provider,
        model: completion.model,
        started_at: startedAt,
        completed_at: completedAt,
        duration_ms: Number(completion.durationMs || 0),
        token_count: Number(completion.tokenCount || 0),
        task_definition: normalizedTask,
        provider_info: llmAdapter.getProviderInfo(),
        citation_verification: citationVerification,
        fetched_citation_ids: fetchedCitationIds,
        search_coverage: searchCoverage,
        rlhf_local_mirror_path: safeString(rlhfResult.local_mirror_path)
      });

      if (Array.isArray(wikiLinks) && wikiLinks.length > 0
          && typeof outputManager.saveSidecar === "function") {
        try {
          outputManager.saveSidecar(taskId, "wiki-links.json", {
            schema_version: "wiki-links-v1",
            task_id: taskId,
            generated_at: completedAt,
            links: wikiLinks
          });
        } catch (sidecarError) {
          logger.warn({
            event: "wiki_link_sidecar_failed",
            task_id: taskId,
            error: safeString(sidecarError && sidecarError.message)
          });
        }
      }

      const result = canonicalize({
        ok: true,
        task_id: taskId,
        status: "completed",
        output_path: outputWrite.output_path,
        metadata_path: outputWrite.metadata_path,
        manifest_path: outputWrite.manifest_path,
        token_count: Number(completion.tokenCount || 0),
        provider: completion.provider,
        model: completion.model
      });

      await governanceBridge.recordTaskExecution(taskId, result, context);
      setStatus(taskId, "completed", { completed_at: completedAt, result });

      logger.info({ event: "phase14_task_completed", task_id: taskId });
      return result;
    } catch (error) {
      const failedAt = normalizeIso(timeProvider.nowIso());
      const failure = canonicalize({
        status: "failed",
        error_code: safeString(error && error.code) || "PHASE14_TASK_FAILED",
        error_message: safeString(error && error.message) || "Task execution failed"
      });

      outputManager.saveOutput(taskId, `Task failed: ${failure.error_message}`, {
        status: "failed",
        type: normalizedTask.type,
        output_format: normalizedTask.output_format,
        provider: safeString(context.provider) || "mock",
        model: safeString(context.model) || "mock-v1",
        started_at: startedAt,
        completed_at: failedAt,
        task_definition: normalizedTask,
        error_code: failure.error_code,
        error_message: failure.error_message
      });

      await governanceBridge.recordTaskExecution(taskId, failure, context);
      setStatus(taskId, "failed", { completed_at: failedAt, ...failure });
      throw error;
    }
  }

  function getTaskStatus(taskId) {
    const normalizedTaskId = safeString(taskId);
    if (!normalizedTaskId) {
      return null;
    }
    if (taskState.has(normalizedTaskId)) {
      return canonicalize(taskState.get(normalizedTaskId));
    }
    const outputs = outputManager.listOutputs();
    const match = outputs.find((entry) => entry.task_id === normalizedTaskId);
    return match ? canonicalize(match) : null;
  }

  function listCompletedTasks() {
    return canonicalize(outputManager.listOutputs().filter((entry) => entry.status === "completed"));
  }

  function getTaskOutput(taskId) {
    return outputManager.getOutput(taskId);
  }

  async function executeOrchestratedTask(taskEnvelope = {}, context = {}) {
    const taskDefinition = buildOrchestratedTaskDefinition(taskEnvelope, {
      defaultTaskType: safeString(context.defaultTaskType) || "freeform",
      defaultDescription: safeString(taskEnvelope.description) || "Mission subtask",
      defaultOutputFormat: safeString(taskEnvelope.output_format || taskEnvelope.outputFormat) || "markdown",
      createdAt: safeString(taskEnvelope.created_at || taskEnvelope.createdAt)
    });
    return executeTask(taskDefinition, context);
  }

  return Object.freeze({
    executeTask,
    executeOrchestratedTask,
    getTaskStatus,
    listCompletedTasks,
    getTaskOutput
  });
}

module.exports = {
  createAgentEngine,
  // Exported for unit testing the multi-agent helper pre-pass + prompt assembly.
  buildPrompt,
  runHelperPrePass
};
