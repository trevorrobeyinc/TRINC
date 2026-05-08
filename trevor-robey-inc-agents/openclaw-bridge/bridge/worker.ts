import fs from "node:fs/promises";
import path from "node:path";
import { StateStore } from "./state-store";
import { JobRecord, JobExecutionResult } from "./types";
import { ExecutionRouter, ExecutionContext } from "../src/core/execution-router";
import { nowIso as runtimeNowIso } from "../core/time-provider.js";
import { randomToken } from "../core/entropy-provider.js";

interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  step: string;
  message: string;
  data?: unknown;
}

interface WorkerOptions {
  store: StateStore;
  commsRoot?: string;
  executionRouter?: ExecutionRouter;
}

function nowIso(): string {
  return runtimeNowIso();
}

async function appendLog(logPath: string, entry: LogEntry): Promise<void> {
  const line = `${JSON.stringify(entry)}\n`;
  await fs.appendFile(logPath, line, "utf-8");
}

function summarizeInstruction(instruction: string): string {
  const cleaned = instruction.replace(/\s+/g, " ").trim();
  return cleaned.length > 140 ? `${cleaned.slice(0, 137)}...` : cleaned;
}

function buildRoutedReport(job: JobRecord, executionResult: JobExecutionResult): string {
  const lines = [
    `# Mission Report: ${job.id}`,
    "",
    `- Status: ${executionResult.outcome === "routed" || executionResult.outcome === "stub" ? "succeeded" : "failed"}`,
    `- Created: ${job.created_at}`,
    `- Finished: ${executionResult.completed_at}`,
    `- Requester: ${job.request.requester}`,
    `- Workspace: ${job.workspace_path}`,
    `- Execution Outcome: ${executionResult.outcome}`,
    `- Router Role: ${executionResult.router_role}`,
    `- Tool Count: ${executionResult.tool_count}`,
  ];

  if (job.execution_context) {
    lines.push(`- Principal: ${job.execution_context.principal}`);
    lines.push(`- Source: ${job.execution_context.source}`);
  }

  lines.push("", "## Instruction", "", job.request.instruction, "");

  if (executionResult.outcome === "denied") {
    lines.push("## Denied", "", executionResult.denied_reason || "Execution denied by router policy.", "");
  } else if (executionResult.outcome === "stub") {
    lines.push("## Notes", "", "Execution router processed this job. No tool handlers are registered for the resolved role; stub outcome recorded.", "");
  } else if (executionResult.outcome === "routed") {
    lines.push("## Notes", "", "Execution router processed this job through the resolved role and tool pipeline.", "");
  } else if (executionResult.outcome === "error") {
    lines.push("## Error", "", executionResult.denied_reason || "Execution router encountered an error.", "");
  }

  return lines.join("\n");
}

function buildFailureReport(job: JobRecord, errorMessage: string): string {
  return [
    `# Mission Report: ${job.id}`,
    "",
    `- Status: failed`,
    `- Created: ${job.created_at}`,
    `- Finished: ${nowIso()}`,
    `- Requester: ${job.request.requester}`,
    `- Workspace: ${job.workspace_path}`,
    "",
    "## Instruction",
    "",
    job.request.instruction,
    "",
    "## Error",
    "",
    errorMessage,
  ].join("\n");
}

function mapPrincipalToExecutionSource(source: string): "http_api" | "cli" | "job_worker" | "in_process" | "mcp_sse" | "stdio_mcp" {
  if (source === "http_api") return "http_api";
  if (source === "cli") return "cli";
  if (source === "mcp_sse") return "mcp_sse";
  if (source === "stdio_mcp") return "stdio_mcp";
  return "job_worker";
}

export class JobWorker {
  private readonly store: StateStore;
  private readonly queue: string[] = [];
  private readonly commsRoot: string;
  private readonly executionRouter?: ExecutionRouter;
  private processing = false;

  constructor(options: WorkerOptions) {
    this.store = options.store;
    this.commsRoot = options.commsRoot || path.join(this.store.getWorkspaceRoot(), "comms");
    this.executionRouter = options.executionRouter;
  }

  enqueue(jobId: string): void {
    if (!this.queue.includes(jobId)) {
      this.queue.push(jobId);
    }

    void this.processLoop();
  }

  enqueueQueuedJobs(): void {
    for (const jobId of this.store.listQueuedJobIds()) {
      this.enqueue(jobId);
    }
  }

  private async processLoop(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;

    try {
      while (this.queue.length > 0) {
        const jobId = this.queue.shift();
        if (!jobId) {
          continue;
        }

        await this.processJob(jobId);
      }
    } finally {
      this.processing = false;
    }
  }

  private async processJob(jobId: string): Promise<void> {
    const existing = this.store.getJob(jobId);
    if (!existing || existing.status === "cancelled") {
      return;
    }

    const job = await this.store.updateStatus(jobId, "running", {
      summary: summarizeInstruction(existing.request.instruction),
      error_message: undefined,
    });

    const missionInputPath = path.join(job.workspace_path, "MISSION_INPUT.json");
    const missionLogPath = path.join(job.workspace_path, "MISSION_LOG.ndjson");
    const missionReportPath = path.join(job.workspace_path, "MISSION_REPORT.md");

    await fs.mkdir(job.workspace_path, { recursive: true });
    await fs.mkdir(this.commsRoot, { recursive: true });

    await fs.writeFile(
      missionInputPath,
      JSON.stringify(
        {
          job_id: job.id,
          request: job.request,
          created_at: job.created_at,
          started_at: job.started_at,
          execution_context: job.execution_context || null,
        },
        null,
        2,
      ),
      "utf-8",
    );

    const logger = async (entry: { level: "info" | "warn" | "error"; step: string; message: string; data?: unknown }) => {
      await appendLog(missionLogPath, {
        timestamp: nowIso(),
        ...entry,
      });
    };

    try {
      await logger({ level: "info", step: "job.start", message: `Processing ${job.id}` });

      // Write supervisor inbox envelope
      const inboxFile = path.join(this.commsRoot, "supervisor.inbox.md");
      const envelope = [
        `## ${nowIso()} ${job.id}`,
        "",
        `initiative_id: ${job.request.initiative_id || "(none)"}`,
        `session_id: ${job.request.session_id || "(none)"}`,
        `requester: ${job.request.requester}`,
        `principal: ${job.execution_context?.principal || "(none)"}`,
        "",
        "instruction:",
        job.request.instruction,
        "",
      ].join("\n");
      await fs.appendFile(inboxFile, `${envelope}\n`, "utf-8");

      // Phase 26: Route through execution router
      const executionResult = await this.executeViaRouter(job, logger);

      // Persist execution result
      await this.store.setExecutionResult(job.id, executionResult);

      // Write report
      const report = buildRoutedReport(job, executionResult);
      await fs.writeFile(missionReportPath, report, "utf-8");

      // Determine final status from execution outcome
      if (executionResult.outcome === "routed" || executionResult.outcome === "stub") {
        await this.store.updateStatus(job.id, "succeeded", {
          summary: `Completed ${job.id} via execution router (${executionResult.outcome}).`,
        });
        await logger({ level: "info", step: "job.finish", message: `Job succeeded (${executionResult.outcome})` });
      } else {
        await this.store.updateStatus(job.id, "failed", {
          error_message: executionResult.denied_reason || `Execution ${executionResult.outcome}`,
          summary: `Failed ${job.id} via execution router (${executionResult.outcome}).`,
        });
        await logger({ level: "warn", step: "job.finish", message: `Job failed (${executionResult.outcome}): ${executionResult.denied_reason || ""}` });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.store.updateStatus(job.id, "failed", {
        error_message: message,
        summary: `Failed ${job.id}`,
      });

      await logger({
        level: "error",
        step: "job.error",
        message,
      });

      await fs.writeFile(missionReportPath, buildFailureReport(job, message), "utf-8");
    }
  }

  private async executeViaRouter(
    job: JobRecord,
    logger: (entry: { level: "info" | "warn" | "error"; step: string; message: string; data?: unknown }) => Promise<void>
  ): Promise<JobExecutionResult> {
    // Fail-closed: if no execution router is available, deny
    if (!this.executionRouter) {
      await logger({ level: "warn", step: "router.missing", message: "No execution router configured; fail-closed" });
      return {
        outcome: "denied",
        router_role: "anonymous",
        tool_count: 0,
        denied_reason: "No execution router configured; fail-closed by Phase 26 policy",
        completed_at: nowIso(),
      };
    }

    // Fail-closed: if no execution context was captured at job creation, deny
    if (!job.execution_context) {
      await logger({ level: "warn", step: "router.no_context", message: "No execution context on job; fail-closed" });
      return {
        outcome: "denied",
        router_role: "anonymous",
        tool_count: 0,
        denied_reason: "Missing execution context; fail-closed by Phase 26 policy",
        completed_at: nowIso(),
      };
    }

    const execSource = mapPrincipalToExecutionSource(job.execution_context.source);

    const executionContext: ExecutionContext = {
      requestId: `${job.id}-${randomToken(4)}`,
      workspaceRoot: job.workspace_path,
      source: execSource,
      caller: job.execution_context.principal,
      authHeader: job.execution_context.token_id ? `Bearer ${job.execution_context.token_id}` : undefined,
    };

    // Resolve role through the execution router
    const role = await this.executionRouter.resolveRole(executionContext);
    await logger({ level: "info", step: "router.role_resolved", message: `Resolved role: ${role}`, data: { principal: job.execution_context.principal, role } });

    // List available tools for the resolved role
    const tools = await this.executionRouter.listTools(executionContext);
    await logger({ level: "info", step: "router.tools_listed", message: `Available tools: ${tools.length}`, data: { tool_count: tools.length } });

    // If the role cannot see or execute tools, record the outcome deterministically
    if (tools.length === 0) {
      // This is expected for supervisor role (cannot execute tools) - record as stub
      const isSupervisorLike = role === "supervisor" || role === "anonymous";
      if (isSupervisorLike) {
        await logger({ level: "info", step: "router.stub", message: `Role '${role}' has no tool execution capability; stub outcome` });
        return {
          outcome: "stub",
          router_role: role,
          tool_count: 0,
          completed_at: nowIso(),
        };
      }

      // For internal/admin roles with no tools, still record as routed (tools may be registered later)
      await logger({ level: "info", step: "router.routed_empty", message: `Role '${role}' has no tools registered; routed with empty tool set` });
      return {
        outcome: "routed",
        router_role: role,
        tool_count: 0,
        completed_at: nowIso(),
      };
    }

    // Route through router - the router itself enforces execution boundaries
    // (supervisor cannot execute, Phase 2 boundary, etc.)
    await logger({ level: "info", step: "router.routed", message: `Routed job through execution router as '${role}' with ${tools.length} tools` });

    return {
      outcome: "routed",
      router_role: role,
      tool_count: tools.length,
      completed_at: nowIso(),
    };
  }
}
