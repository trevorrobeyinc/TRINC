"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const root = path.resolve(__dirname, "../..");

// ── types.ts contract tests ──

test("types.ts exports BridgePrincipalKind values", () => {
  const typesPath = path.join(root, "openclaw-bridge", "bridge", "types.ts");
  const content = fs.readFileSync(typesPath, "utf8");
  assert.ok(content.includes("BridgePrincipalKind"), "must export BridgePrincipalKind");
  assert.ok(content.includes('"supervisor"'), "must include supervisor principal");
  assert.ok(content.includes('"operator"'), "must include operator principal");
  assert.ok(content.includes('"anonymous"'), "must include anonymous principal");
});

test("types.ts exports ExecutionOutcome values", () => {
  const typesPath = path.join(root, "openclaw-bridge", "bridge", "types.ts");
  const content = fs.readFileSync(typesPath, "utf8");
  assert.ok(content.includes("ExecutionOutcome"), "must export ExecutionOutcome");
  assert.ok(content.includes('"routed"'), "must include routed outcome");
  assert.ok(content.includes('"denied"'), "must include denied outcome");
  assert.ok(content.includes('"stub"'), "must include stub outcome");
  assert.ok(content.includes('"error"'), "must include error outcome");
});

test("types.ts defines JobExecutionContext with required fields", () => {
  const typesPath = path.join(root, "openclaw-bridge", "bridge", "types.ts");
  const content = fs.readFileSync(typesPath, "utf8");
  assert.ok(content.includes("interface JobExecutionContext"), "must define JobExecutionContext interface");
  assert.ok(content.includes("principal: BridgePrincipalKind"), "must include principal field");
  assert.ok(content.includes("role: string"), "must include role field");
  assert.ok(content.includes("source: string"), "must include source field");
});

test("types.ts defines JobExecutionResult with required fields", () => {
  const typesPath = path.join(root, "openclaw-bridge", "bridge", "types.ts");
  const content = fs.readFileSync(typesPath, "utf8");
  assert.ok(content.includes("interface JobExecutionResult"), "must define JobExecutionResult interface");
  assert.ok(content.includes("outcome: ExecutionOutcome"), "must include outcome field");
  assert.ok(content.includes("router_role: string"), "must include router_role field");
  assert.ok(content.includes("tool_count: number"), "must include tool_count field");
  assert.ok(content.includes("completed_at: string"), "must include completed_at field");
});

test("types.ts includes execution_context and execution_result on JobRecord", () => {
  const typesPath = path.join(root, "openclaw-bridge", "bridge", "types.ts");
  const content = fs.readFileSync(typesPath, "utf8");
  assert.ok(content.includes("execution_context?: JobExecutionContext"), "JobRecord must have optional execution_context");
  assert.ok(content.includes("execution_result?: JobExecutionResult"), "JobRecord must have optional execution_result");
});

// ── state-store.ts contract tests ──

test("state-store.ts createJob accepts executionContext parameter", () => {
  const storePath = path.join(root, "openclaw-bridge", "bridge", "state-store.ts");
  const content = fs.readFileSync(storePath, "utf8");
  assert.ok(content.includes("executionContext?: JobExecutionContext"), "createJob must accept optional executionContext");
  assert.ok(content.includes("execution_context: executionContext"), "createJob must store executionContext on job");
});

test("state-store.ts exposes setExecutionResult method", () => {
  const storePath = path.join(root, "openclaw-bridge", "bridge", "state-store.ts");
  const content = fs.readFileSync(storePath, "utf8");
  assert.ok(content.includes("async setExecutionResult"), "must expose setExecutionResult method");
  assert.ok(content.includes("execution_result: result"), "setExecutionResult must store result on job");
});

// ── server.ts contract tests ──

test("server.ts creates execution router and passes to worker", () => {
  const serverPath = path.join(root, "openclaw-bridge", "bridge", "server.ts");
  const content = fs.readFileSync(serverPath, "utf8");
  assert.ok(content.includes("createExecutionRouter"), "must import and use createExecutionRouter");
  assert.ok(content.includes("executionRouter"), "must pass executionRouter to worker");
});

test("server.ts captures principal context at job creation", () => {
  const serverPath = path.join(root, "openclaw-bridge", "bridge", "server.ts");
  const content = fs.readFileSync(serverPath, "utf8");
  assert.ok(content.includes("JobExecutionContext"), "must use JobExecutionContext type");
  assert.ok(content.includes("principal: principal as BridgePrincipalKind"), "must capture principal");
  assert.ok(content.includes('source: "http_api"'), "must set source to http_api");
  assert.ok(content.includes("store.createJob(submission, executionContext)"), "must pass context to createJob");
});

test("server.ts still blocks direct tool execution", () => {
  const serverPath = path.join(root, "openclaw-bridge", "bridge", "server.ts");
  const content = fs.readFileSync(serverPath, "utf8");
  assert.ok(content.includes("TOOL_EXECUTION_BLOCKED"), "must block direct tool execution at bridge boundary");
});

// ── worker.ts contract tests ──

test("worker.ts accepts and uses execution router", () => {
  const workerPath = path.join(root, "openclaw-bridge", "bridge", "worker.ts");
  const content = fs.readFileSync(workerPath, "utf8");
  assert.ok(content.includes("executionRouter"), "must accept executionRouter in options");
  assert.ok(content.includes("ExecutionRouter"), "must import ExecutionRouter type");
});

test("worker.ts routes jobs through executeViaRouter", () => {
  const workerPath = path.join(root, "openclaw-bridge", "bridge", "worker.ts");
  const content = fs.readFileSync(workerPath, "utf8");
  assert.ok(content.includes("executeViaRouter"), "must have executeViaRouter method");
  assert.ok(content.includes("this.executionRouter"), "must use this.executionRouter");
});

test("worker.ts implements fail-closed on missing router", () => {
  const workerPath = path.join(root, "openclaw-bridge", "bridge", "worker.ts");
  const content = fs.readFileSync(workerPath, "utf8");
  assert.ok(content.includes("!this.executionRouter"), "must check for missing execution router");
  assert.ok(content.includes("fail-closed"), "must use fail-closed terminology");
  assert.ok(content.includes('outcome: "denied"'), "must deny when router is missing");
});

test("worker.ts implements fail-closed on missing execution context", () => {
  const workerPath = path.join(root, "openclaw-bridge", "bridge", "worker.ts");
  const content = fs.readFileSync(workerPath, "utf8");
  assert.ok(content.includes("!job.execution_context"), "must check for missing execution context");
  assert.ok(content.includes("Missing execution context"), "must explain missing context denial");
});

test("worker.ts resolves role through execution router", () => {
  const workerPath = path.join(root, "openclaw-bridge", "bridge", "worker.ts");
  const content = fs.readFileSync(workerPath, "utf8");
  assert.ok(content.includes("this.executionRouter.resolveRole"), "must call resolveRole on execution router");
  assert.ok(content.includes("this.executionRouter.listTools"), "must call listTools on execution router");
});

test("worker.ts persists execution result on job", () => {
  const workerPath = path.join(root, "openclaw-bridge", "bridge", "worker.ts");
  const content = fs.readFileSync(workerPath, "utf8");
  assert.ok(content.includes("this.store.setExecutionResult"), "must persist execution result via setExecutionResult");
});

test("worker.ts no longer references Phase 1 no-op mode", () => {
  const workerPath = path.join(root, "openclaw-bridge", "bridge", "worker.ts");
  const content = fs.readFileSync(workerPath, "utf8");
  assert.ok(!content.includes("Phase 1 runtime skeleton"), "must not reference Phase 1 no-op mode");
  assert.ok(!content.includes("no-op skeleton mode"), "must not reference no-op skeleton mode");
});

// ── execution-router.ts contract tests ──

test("execution-router.ts uses Phase 26 node ID", () => {
  const routerPath = path.join(root, "openclaw-bridge", "src", "core", "execution-router.ts");
  const content = fs.readFileSync(routerPath, "utf8");
  assert.ok(content.includes("phase26-bridge-node"), "must use phase26-bridge-node ID");
  assert.ok(!content.includes('"phase1-node"'), "must not reference phase1-node");
});

test("execution-router.ts tracks Phase 26 counters", () => {
  const routerPath = path.join(root, "openclaw-bridge", "src", "core", "execution-router.ts");
  const content = fs.readFileSync(routerPath, "utf8");
  assert.ok(content.includes("phase26_jobs_routed"), "must track phase26_jobs_routed counter");
  assert.ok(content.includes("phase26_jobs_denied"), "must track phase26_jobs_denied counter");
  assert.ok(content.includes("phase26_jobs_stub"), "must track phase26_jobs_stub counter");
});

test("execution-router.ts preserves supervisor execution denial boundary", () => {
  const routerPath = path.join(root, "openclaw-bridge", "src", "core", "execution-router.ts");
  const content = fs.readFileSync(routerPath, "utf8");
  assert.ok(content.includes("SUPERVISOR_EXECUTION_DENIED"), "must deny supervisor tool execution");
  assert.ok(content.includes("Supervisor cannot execute tools directly"), "must explain supervisor denial");
});

test("execution-router.ts uses Phase 26 attestation stub codes", () => {
  const routerPath = path.join(root, "openclaw-bridge", "src", "core", "execution-router.ts");
  const content = fs.readFileSync(routerPath, "utf8");
  assert.ok(content.includes("PHASE26_ATTESTATION_STUB"), "must use Phase 26 attestation stub code");
  assert.ok(content.includes("PHASE26_VERIFICATION_STUB"), "must use Phase 26 verification stub code");
  assert.ok(content.includes("PHASE26_TOOL_STUB"), "must use Phase 26 tool stub code");
});

// ── Phase 26 doc contract tests ──

test("phase26 doc covers full consolidation scope", () => {
  const docPath = path.join(root, "docs", "phase26-bridge-runtime-and-execution-routing.md");
  const content = fs.readFileSync(docPath, "utf8");
  assert.ok(content.includes("Phase 26: Bridge Runtime and Execution Router Consolidation"), "must have full Phase 26 title");
  assert.ok(content.includes("Phase 26A"), "must reference Phase 26A prerequisite");
  assert.ok(content.includes("JobExecutionContext"), "must document JobExecutionContext");
  assert.ok(content.includes("JobExecutionResult"), "must document JobExecutionResult");
  assert.ok(content.includes("fail-closed"), "must document fail-closed behavior");
  assert.ok(content.includes("manual-only"), "must preserve manual-only boundary language");
  assert.ok(content.includes("Direct external tool execution remains blocked"), "must reference tool execution block");
});
