export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type BridgePrincipalKind = "supervisor" | "operator" | "anonymous";

export type ExecutionOutcome = "routed" | "denied" | "stub" | "error";

export interface TaskSubmission {
  instruction: string;
  requester: string;
  initiative_id?: string;
  session_id?: string;
  context_urls?: string[];
  model?: string;
  hints?: string;
}

export interface JobExecutionContext {
  principal: BridgePrincipalKind;
  role: string;
  token_id?: string;
  source: string;
}

export interface JobExecutionResult {
  outcome: ExecutionOutcome;
  router_role: string;
  tool_count: number;
  denied_reason?: string;
  completed_at: string;
}

export interface JobRecord {
  id: string;
  status: JobStatus;
  request: TaskSubmission;
  created_at: string;
  updated_at: string;
  started_at?: string;
  finished_at?: string;
  workspace_path: string;
  error_message?: string;
  summary?: string;
  /** Phase 26: bridge principal context captured at job creation */
  execution_context?: JobExecutionContext;
  /** Phase 26: deterministic execution router outcome */
  execution_result?: JobExecutionResult;
  pr_url?: string;
}

export interface MissionReportIndex {
  updated_at: string;
  jobs: Array<{
    id: string;
    status: JobStatus;
    created_at: string;
    workspace_path: string;
    report_path: string;
    pr_url?: string;
  }>;
}
