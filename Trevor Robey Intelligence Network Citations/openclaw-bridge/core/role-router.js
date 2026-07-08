"use strict";

const { safeString, canonicalize } = require("../../workflows/governance-automation/common.js");
const { createAgentContextLoader } = require("./agent-context-loader.js");
const { createRoleProviderRouter } = require("./role-provider-router.js");
const { createAgentSessionRecorder } = require("./agent-session-recorder.js");

function createRoleRouter(options = {}) {
  const logger = options.logger && typeof options.logger === "object" ? options.logger : { info() {}, warn() {}, error() {} };
  const registry = options.registry;
  const autonomyLadder = options.autonomyLadder;

  if (!registry || typeof registry.getRole !== "function") {
    throw new Error("registry.getRole is required");
  }
  if (!autonomyLadder || typeof autonomyLadder.canRolePerform !== "function") {
    throw new Error("autonomyLadder.canRolePerform is required");
  }

  // Multi-agent layer (all fail-soft / additive): per-role backend routing, persistent
  // identity (SOUL.md/AGENTS.md), and session recording. With no role-provider-map and no
  // config/agents/<role>/ dirs, these are no-ops and dispatch behaves exactly as before.
  const rootDir = (typeof options.rootDir === "string" && options.rootDir) || process.cwd();
  const contextLoader = createAgentContextLoader({ rootDir, logger });
  const providerRouter = createRoleProviderRouter({ rootDir, logger });
  const sessionRecorder = createAgentSessionRecorder({ rootDir, logger });

  function resolveRole(taskEnvelope = {}) {
    const agentId = safeString(taskEnvelope.agent_id || taskEnvelope.agentId);
    if (agentId && typeof registry.getAgent === "function") {
      const agent = registry.getAgent(agentId);
      if (agent && safeString(agent.role)) {
        return safeString(agent.role);
      }
    }

    const explicitRole = safeString(taskEnvelope.role).toLowerCase();
    if (explicitRole) {
      return explicitRole;
    }

    const taskType = safeString(taskEnvelope.type).toLowerCase();
    if (taskType === "summarize" || taskType === "extract") return "analyst";
    if (taskType === "analyze") return "analyst";
    if (taskType === "synthesize") return "synthesizer";
    return "scout";
  }

  async function dispatch(taskEnvelope = {}, context = {}) {
    if (!context.supervisorDecision || context.supervisorDecision.approved !== true) {
      const error = new Error("Supervisor approval required for role dispatch");
      error.code = "SUPERVISOR_APPROVAL_REQUIRED";
      throw error;
    }

    const agentId = safeString(taskEnvelope.agent_id || taskEnvelope.agentId);
    const role = resolveRole(taskEnvelope);
    const actionType = safeString(taskEnvelope.actionType) || "execute_task";

    if (!autonomyLadder.canRolePerform(role, actionType)) {
      const error = new Error(`Role '${role}' cannot perform action '${actionType}'`);
      error.code = "PHASE15_ROLE_ACTION_DENIED";
      throw error;
    }

    // Security (audit state-rehydration): a crafted/tampered envelope must not be able
    // to DOWNGRADE the human-approval requirement below the execute_task baseline by
    // supplying a permissive actionType. Require approval if EITHER the claimed action
    // OR the execute_task baseline requires it.
    const requiresHumanApproval =
      autonomyLadder.requireHumanApproval(role, actionType) ||
      autonomyLadder.requireHumanApproval(role, "execute_task");
    if (requiresHumanApproval && context.operatorApproved !== true) {
      const error = new Error(`Human approval required for role '${role}' action '${actionType}'`);
      error.code = "PHASE15_HUMAN_APPROVAL_REQUIRED";
      throw error;
    }

    const agent = agentId && typeof registry.getAgent === "function" ? registry.getAgent(agentId) : null;
    const handler = agent && typeof agent.handler === "function"
      ? agent.handler
      : registry.getRole(role);
    if (!handler) {
      const error = new Error(`No registered handler for role '${role}'`);
      error.code = "PHASE15_ROLE_HANDLER_MISSING";
      throw error;
    }

    // Resolve this role's backend route + load its persistent identity, and carry both into
    // the handler context. resolveRoute precedence: role-provider-map[role] → existing
    // context provider/model (template/global default) → map default → claude-code.
    const route = providerRouter.resolveRoute(role, context);
    const identity = contextLoader.loadAgentContext(role);
    const enrichedContext = {
      ...context,
      provider: safeString(route.provider) || context.provider,
      model: safeString(route.model) || context.model,
      fallbackProvider: safeString(route.fallback) || context.fallbackProvider,
      // Small per-role OSS helper that runs a cheap evidence pre-pass before the primary
      // backend (agent-engine.runHelperPrePass). null when the role declares none.
      helper: route.helper || context.helper || null,
      agentIdentityPrefix: identity.agentIdentityPrefix || context.agentIdentityPrefix
    };

    logger.info({ event: "phase15_role_dispatch", role, action_type: actionType, agent_id: agentId, provider: enrichedContext.provider });
    const result = await handler(taskEnvelope, enrichedContext);

    // Append a session record under config/agents/<role>/sessions/ (fail-soft).
    try {
      sessionRecorder.recordSession(role, {
        agent_id: agentId,
        mission_id: safeString(taskEnvelope.mission_id) || safeString(context.missionId),
        subtask_id: safeString(taskEnvelope.subtask_id || taskEnvelope.subtaskId),
        action_type: actionType,
        status: "completed",
        provider: enrichedContext.provider,
        model: enrichedContext.model,
        topic: safeString((context.workflowInputs || {}).topic),
        completed_at: new Date().toISOString()
      });
    } catch (recErr) {
      logger.warn({ event: "agent_session_record_skipped", role, error: recErr && recErr.message });
    }

    return canonicalize({ role, agent_id: agentId, action_type: actionType, result });
  }

  return Object.freeze({
    resolveRole,
    dispatch
  });
}

module.exports = {
  createRoleRouter
};
