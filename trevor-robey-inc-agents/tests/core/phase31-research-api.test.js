"use strict";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { createResearchApi } = require("../../openclaw-bridge/bridge/research-api.js");

// ---------------------------------------------------------------------------
// Mock workflow engine
// ---------------------------------------------------------------------------

function createMockWorkflowEngine() {
  return {
    executeWorkflow: async (_workflowDef, _ctx) => ({
      ok: true,
      workflow_id: "wf-test",
      status: "completed",
      artifacts: {
        export_path: "/tmp/export.zip",
        subtask_results: [
          {
            task_id: "literature_reviewer",
            output_full: "Literature review of aspirin. PMID: 12345678 shows analgesic properties. NCT00012345 is a relevant trial. CID: 2244 is the PubChem identifier.",
            output_excerpt: "Literature review..."
          },
          {
            task_id: "safety_signal_detector",
            output_full: "Safety analysis reveals PMID: 23456789 reports GI bleeding. DrugBank DB00945 entry confirms interactions. CHEMBL25 is the compound.",
            output_excerpt: "Safety analysis..."
          },
          {
            task_id: "report_generator",
            output_full: "Synthesis: aspirin (CID: 2244, DB00945) shows strong evidence per PMID: 12345678 and PMID: 23456789. Trial NCT00012345 supports efficacy.",
            output_excerpt: "Synthesis..."
          }
        ]
      },
      export_format: "zip"
    }),
    getWorkflowStatus: (id) => ({
      workflow_id: id,
      status: "completed",
      artifacts: {}
    })
  };
}

function createMockTemplateLoader() {
  return (templateId) => ({
    schema_version: "phase30-workflow-v1",
    workflow_template_id: templateId,
    auto_approve: true,
    input_schema: { required: [], properties: {} },
    pipeline: [
      { step_id: "research", type: "mission", mission_template_id: "research_pack" }
    ]
  });
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTH_OPERATOR = { principal: "operator", api_key: "key-op" };
const AUTH_API_CLIENT = { principal: "api_client", api_key: "key-api" };
const AUTH_ANONYMOUS = { principal: "anonymous", api_key: "key-anon" };
const AUTH_MISSING = null;

const VALID_BODY = { template_id: "drug-repurposing", inputs: { target: "ACE2" } };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Phase 31 — Research API", () => {
  // ------------------------------------------------------------------
  // Factory validation
  // ------------------------------------------------------------------

  describe("createResearchApi", () => {
    it("returns API that returns 503 on submit when engine missing", () => {
      const api = createResearchApi({});
      const res = api.handleRequest("POST", "/api/v1/research", VALID_BODY, AUTH_OPERATOR);
      assert.equal(res.status, 503);
      assert.equal(res.body.error.code, "ENGINE_NOT_READY");
    });

    it("returns API that returns 503 on submit when options undefined", () => {
      const api = createResearchApi();
      const res = api.handleRequest("POST", "/api/v1/research", VALID_BODY, AUTH_OPERATOR);
      assert.equal(res.status, 503);
      assert.equal(res.body.error.code, "ENGINE_NOT_READY");
    });

    it("returns an object with handleRequest method", () => {
      const api = createResearchApi({ workflowEngine: createMockWorkflowEngine() });
      assert.equal(typeof api.handleRequest, "function");
    });
  });

  // ------------------------------------------------------------------
  // Routing
  // ------------------------------------------------------------------

  describe("handleRequest routing", () => {
    let api;

    beforeEach(() => {
      api = createResearchApi({
        workflowEngine: createMockWorkflowEngine(),
        templateLoader: createMockTemplateLoader(),
        rateLimitConfig: { windowMs: 60000, maxRequests: 100 }
      });
    });

    it("returns 404 for unknown paths", () => {
      const res = api.handleRequest("GET", "/api/v1/unknown", {}, AUTH_OPERATOR);
      assert.equal(res.status, 404);
      assert.equal(res.body.ok, false);
      assert.equal(res.body.error.code, "NOT_FOUND");
    });

    it("returns 404 for unsupported method on valid path", () => {
      const res = api.handleRequest("DELETE", "/api/v1/research", {}, AUTH_OPERATOR);
      assert.equal(res.status, 404);
    });
  });

  // ------------------------------------------------------------------
  // POST /api/v1/research — submit workflow
  // ------------------------------------------------------------------

  describe("POST /api/v1/research", () => {
    let api;

    beforeEach(() => {
      api = createResearchApi({
        workflowEngine: createMockWorkflowEngine(),
        templateLoader: createMockTemplateLoader(),
        rateLimitConfig: { windowMs: 60000, maxRequests: 100 }
      });
    });

    it("returns workflow_id and status 'running'", () => {
      const res = api.handleRequest("POST", "/api/v1/research", VALID_BODY, AUTH_OPERATOR);
      assert.equal(res.status, 201);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.status, "running");
      assert.ok(res.body.workflow_id);
      assert.match(res.body.workflow_id, /^workflow-/);
    });

    it("rejects missing template_id", () => {
      const res = api.handleRequest("POST", "/api/v1/research", {}, AUTH_OPERATOR);
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, "VALIDATION_ERROR");
    });

    it("returns 503 when no template loader configured", () => {
      const noLoader = createResearchApi({
        workflowEngine: createMockWorkflowEngine(),
        rateLimitConfig: { windowMs: 60000, maxRequests: 100 }
      });
      const res = noLoader.handleRequest("POST", "/api/v1/research", VALID_BODY, AUTH_OPERATOR);
      assert.equal(res.status, 503);
      assert.equal(res.body.error.code, "TEMPLATE_LOADER_MISSING");
    });
  });

  // ------------------------------------------------------------------
  // GET /api/v1/research — list workflows
  // ------------------------------------------------------------------

  describe("GET /api/v1/research", () => {
    let api;

    beforeEach(() => {
      api = createResearchApi({
        workflowEngine: createMockWorkflowEngine(),
        templateLoader: createMockTemplateLoader(),
        rateLimitConfig: { windowMs: 60000, maxRequests: 100 }
      });
    });

    it("returns a list of workflows", () => {
      // Submit one first
      api.handleRequest("POST", "/api/v1/research", VALID_BODY, AUTH_OPERATOR);

      const res = api.handleRequest("GET", "/api/v1/research", {}, AUTH_OPERATOR);
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.ok(Array.isArray(res.body.workflows));
      assert.equal(res.body.total, 1);
      assert.equal(res.body.workflows.length, 1);
    });

    it("returns empty list when no workflows submitted", () => {
      const res = api.handleRequest("GET", "/api/v1/research", {}, AUTH_OPERATOR);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.workflows, []);
      assert.equal(res.body.total, 0);
    });
  });

  // ------------------------------------------------------------------
  // GET /api/v1/research/:id — workflow status
  // ------------------------------------------------------------------

  describe("GET /api/v1/research/:id", () => {
    let api;

    beforeEach(() => {
      api = createResearchApi({
        workflowEngine: createMockWorkflowEngine(),
        templateLoader: createMockTemplateLoader(),
        rateLimitConfig: { windowMs: 60000, maxRequests: 100 }
      });
    });

    it("returns workflow status for known workflow", () => {
      const submit = api.handleRequest("POST", "/api/v1/research", VALID_BODY, AUTH_OPERATOR);
      const wfId = submit.body.workflow_id;

      const res = api.handleRequest("GET", `/api/v1/research/${wfId}`, {}, AUTH_OPERATOR);
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.ok(res.body.workflow);
      assert.equal(res.body.workflow.workflow_id, wfId);
    });

    it("falls back to workflowEngine.getWorkflowStatus for unknown local id", () => {
      const res = api.handleRequest("GET", "/api/v1/research/wf-engine-only", {}, AUTH_OPERATOR);
      assert.equal(res.status, 200);
      assert.equal(res.body.workflow.workflow_id, "wf-engine-only");
      assert.equal(res.body.workflow.status, "completed");
    });

    it("returns 404 when workflow not found anywhere", () => {
      const noFallback = createResearchApi({
        workflowEngine: {
          executeWorkflow: async () => ({ ok: true }),
          getWorkflowStatus: () => null
        },
        templateLoader: createMockTemplateLoader(),
        rateLimitConfig: { windowMs: 60000, maxRequests: 100 }
      });
      const res = noFallback.handleRequest("GET", "/api/v1/research/nonexistent", {}, AUTH_OPERATOR);
      assert.equal(res.status, 404);
      assert.equal(res.body.error.code, "NOT_FOUND");
    });
  });

  // ------------------------------------------------------------------
  // GET /api/v1/research/:id/download — export path info
  // ------------------------------------------------------------------

  describe("GET /api/v1/research/:id/download", () => {
    it("returns export path info for completed workflow", async () => {
      const engine = createMockWorkflowEngine();
      const api = createResearchApi({
        workflowEngine: engine,
        templateLoader: createMockTemplateLoader(),
        rateLimitConfig: { windowMs: 60000, maxRequests: 100 }
      });

      const submit = api.handleRequest("POST", "/api/v1/research", VALID_BODY, AUTH_OPERATOR);
      const wfId = submit.body.workflow_id;

      // Wait for the async executeWorkflow to settle
      await new Promise(r => setTimeout(r, 50));

      const res = api.handleRequest("GET", `/api/v1/research/${wfId}/download`, {}, AUTH_OPERATOR);
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.export_path, "/tmp/export.zip");
      assert.equal(res.body.format, "zip");
    });

    it("returns 404 for unknown workflow", () => {
      const api = createResearchApi({
        workflowEngine: createMockWorkflowEngine(),
        templateLoader: createMockTemplateLoader(),
        rateLimitConfig: { windowMs: 60000, maxRequests: 100 }
      });
      const res = api.handleRequest("GET", "/api/v1/research/nonexistent/download", {}, AUTH_OPERATOR);
      assert.equal(res.status, 404);
    });
  });

  // ------------------------------------------------------------------
  // Auth enforcement
  // ------------------------------------------------------------------

  describe("Auth enforcement", () => {
    let api;

    beforeEach(() => {
      api = createResearchApi({
        workflowEngine: createMockWorkflowEngine(),
        templateLoader: createMockTemplateLoader(),
        rateLimitConfig: { windowMs: 60000, maxRequests: 100 }
      });
    });

    it("returns 403 for anonymous principal", () => {
      const res = api.handleRequest("GET", "/api/v1/research", {}, AUTH_ANONYMOUS);
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, "FORBIDDEN");
    });

    it("returns 401 when authContext is missing", () => {
      const res = api.handleRequest("GET", "/api/v1/research", {}, AUTH_MISSING);
      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, "AUTH_REQUIRED");
    });

    it("allows api_client principal", () => {
      const res = api.handleRequest("GET", "/api/v1/research", {}, AUTH_API_CLIENT);
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
    });
  });

  // ------------------------------------------------------------------
  // Rate limiting
  // ------------------------------------------------------------------

  describe("Rate limiting", () => {
    it("rejects when rate limit exceeded", () => {
      const api = createResearchApi({
        workflowEngine: createMockWorkflowEngine(),
        templateLoader: createMockTemplateLoader(),
        rateLimitConfig: { windowMs: 60000, maxRequests: 3 }
      });

      const auth = { principal: "operator", api_key: "rate-test-key" };

      // Exhaust the limit
      for (let i = 0; i < 3; i++) {
        const res = api.handleRequest("GET", "/api/v1/research", {}, auth);
        assert.equal(res.status, 200);
      }

      // 4th request should be rate limited
      const res = api.handleRequest("GET", "/api/v1/research", {}, auth);
      assert.equal(res.status, 429);
      assert.equal(res.body.error.code, "RATE_LIMITED");
    });
  });

  // ------------------------------------------------------------------
  // GET /api/v1/research/:id/results — structured JSON results
  // ------------------------------------------------------------------

  describe("GET /api/v1/research/:id/results", () => {
    it("returns structured results with citations for completed workflow", async () => {
      const api = createResearchApi({
        workflowEngine: createMockWorkflowEngine(),
        templateLoader: createMockTemplateLoader(),
        rateLimitConfig: { windowMs: 60000, maxRequests: 100 }
      });

      const submit = api.handleRequest("POST", "/api/v1/research", VALID_BODY, AUTH_OPERATOR);
      const wfId = submit.body.workflow_id;

      await new Promise(r => setTimeout(r, 50));

      const res = api.handleRequest("GET", `/api/v1/research/${wfId}/results`, {}, AUTH_OPERATOR);
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.ok(res.body.results);
      assert.ok(Array.isArray(res.body.results.findings));
      assert.equal(res.body.results.findings.length, 3);
      assert.equal(res.body.results.findings[0].role, "Literature Review");
      assert.equal(res.body.results.findings[1].role, "Deep Analysis");
      assert.equal(res.body.results.findings[2].role, "Integrated Synthesis");
      assert.ok(res.body.results.citations_summary);
      assert.ok(res.body.results.citations_summary.total >= 5);
      assert.ok(res.body.results.citations_summary.by_type.PMID >= 1);
      assert.ok(res.body.results.confidence);
      assert.equal(res.body.results.confidence.pass, true);
    });

    it("returns 409 for running workflow", () => {
      const api = createResearchApi({
        workflowEngine: {
          executeWorkflow: () => new Promise(() => {}),
          getWorkflowStatus: () => null
        },
        templateLoader: createMockTemplateLoader(),
        rateLimitConfig: { windowMs: 60000, maxRequests: 100 }
      });

      const submit = api.handleRequest("POST", "/api/v1/research", VALID_BODY, AUTH_OPERATOR);
      const wfId = submit.body.workflow_id;
      const res = api.handleRequest("GET", `/api/v1/research/${wfId}/results`, {}, AUTH_OPERATOR);
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, "NOT_READY");
    });

    it("returns 404 for unknown workflow", () => {
      const api = createResearchApi({
        workflowEngine: { executeWorkflow: async () => ({}), getWorkflowStatus: () => null },
        templateLoader: createMockTemplateLoader(),
        rateLimitConfig: { windowMs: 60000, maxRequests: 100 }
      });
      const res = api.handleRequest("GET", "/api/v1/research/nonexistent/results", {}, AUTH_OPERATOR);
      assert.equal(res.status, 404);
    });
  });

  // ------------------------------------------------------------------
  // JSONL export
  // ------------------------------------------------------------------

  describe("JSONL export", () => {
    it("builds valid JSONL from structured results", async () => {
      const api = createResearchApi({
        workflowEngine: createMockWorkflowEngine(),
        templateLoader: createMockTemplateLoader(),
        rateLimitConfig: { windowMs: 60000, maxRequests: 100 }
      });

      const submit = api.handleRequest("POST", "/api/v1/research", VALID_BODY, AUTH_OPERATOR);
      const wfId = submit.body.workflow_id;

      await new Promise(r => setTimeout(r, 50));

      const statusRes = api.handleRequest("GET", `/api/v1/research/${wfId}`, {}, AUTH_OPERATOR);
      const record = statusRes.body.workflow;

      const jsonl = api.buildJsonlExport(record);
      const lines = jsonl.trim().split("\n");

      assert.ok(lines.length >= 3);

      const metadata = JSON.parse(lines[0]);
      assert.equal(metadata.record_type, "metadata");
      assert.ok(metadata.citations_summary);

      const finding = JSON.parse(lines[1]);
      assert.equal(finding.record_type, "finding");
      assert.ok(finding.role);
      assert.ok(finding.content);

      const summary = JSON.parse(lines[lines.length - 1]);
      assert.equal(summary.record_type, "summary");
      assert.ok(typeof summary.total_findings === "number");
      assert.ok(typeof summary.total_citations === "number");
    });
  });

  // ------------------------------------------------------------------
  // Webhook URL in submission
  // ------------------------------------------------------------------

  describe("Webhook support", () => {
    it("accepts webhook_url in submission body", () => {
      const api = createResearchApi({
        workflowEngine: createMockWorkflowEngine(),
        templateLoader: createMockTemplateLoader(),
        rateLimitConfig: { windowMs: 60000, maxRequests: 100 }
      });

      const body = {
        ...VALID_BODY,
        webhook_url: "https://example.com/webhook"
      };
      const res = api.handleRequest("POST", "/api/v1/research", body, AUTH_OPERATOR);
      assert.equal(res.status, 201);
      assert.equal(res.body.ok, true);
    });

    it("accepts output_format in submission body", () => {
      const api = createResearchApi({
        workflowEngine: createMockWorkflowEngine(),
        templateLoader: createMockTemplateLoader(),
        rateLimitConfig: { windowMs: 60000, maxRequests: 100 }
      });

      const body = {
        ...VALID_BODY,
        output_format: "jsonl"
      };
      const res = api.handleRequest("POST", "/api/v1/research", body, AUTH_OPERATOR);
      assert.equal(res.status, 201);
    });

    it("rejects invalid webhook_url", () => {
      const api = createResearchApi({
        workflowEngine: createMockWorkflowEngine(),
        templateLoader: createMockTemplateLoader(),
        rateLimitConfig: { windowMs: 60000, maxRequests: 100 }
      });

      const body = {
        ...VALID_BODY,
        webhook_url: "not-a-url"
      };
      const res = api.handleRequest("POST", "/api/v1/research", body, AUTH_OPERATOR);
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, "VALIDATION_ERROR");
    });
  });
});
