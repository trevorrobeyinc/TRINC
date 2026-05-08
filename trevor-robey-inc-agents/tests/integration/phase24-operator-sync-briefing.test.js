"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const fsp = require("node:fs/promises");

const { createApiGovernance } = require("../../security/api-governance.js");
const { createMcpService } = require("../../openclaw-bridge/mcp/mcp-service.js");

async function makeTmpDir() {
  return fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-phase24-integration-"));
}

test("phase24 prepare flow writes operator briefing artifacts and keeps research methods disabled", async () => {
  const dir = await makeTmpDir();
  const service = createMcpService({
    apiGovernance: createApiGovernance({
      statePath: path.join(dir, "state.json"),
      researchNdjsonPath: path.join(dir, "research.ndjson")
    }),
    mutationLogPath: path.join(dir, "mutation.ndjson"),
    incidentArtifactPath: path.join(dir, "observability", "incidents"),
    recoveryArtifactPath: path.join(dir, "recovery-assurance"),
    supplyChainArtifactPath: path.join(dir, "supply-chain"),
    accessControlArtifactPath: path.join(dir, "access-control"),
    phase24OutDir: path.join(dir, "phase24"),
    allowedExternalHosts: ["example.com"]
  });

  const enableToken = service.operatorAuthorization.issueApprovalToken({ scope: "mutation.control.toggle" }).token;
  await service.handle(
    "mutation.setMutationEnabled",
    {
      enabled: true,
      approvalToken: enableToken
    },
    {
      correlationId: "phase24-enable",
      role: "operator"
    }
  );

  const prepareToken = service.operatorAuthorization.issueApprovalToken({ scope: "mutation.newsletter.prepare" }).token;
  const prepared = await service.handle(
    "mutation.preparePublication",
    {
      provider: "newsletter",
      publicationId: "pub_123",
      title: "Phase 24 Branch Briefing",
      html: "<p>Open the review at https://example.com/review</p>",
      approvalToken: prepareToken
    },
    {
      correlationId: "phase24-prepare",
      role: "operator",
      requester: "phase24-test"
    }
  );

  assert.equal(prepared.ok, true);
  assert.equal(prepared.provider, "newsletter");
  assert.equal(prepared.operatorBriefing.provider, "newsletter");
  assert.equal(fs.existsSync(path.join(prepared.operatorBriefing.out_dir, "operator-briefing.md")), true);

  const manifest = JSON.parse(await fsp.readFile(path.join(prepared.operatorBriefing.out_dir, "hash-manifest.json"), "utf8"));
  assert.equal(manifest.schema_version, "phase24-operator-briefing-manifest-v1");

  await assert.rejects(
    () =>
      service.handle(
        "research.search",
        {
          provider: "newsletter",
          query: "phase24 operator briefing",
          limit: 1
        },
        {
          correlationId: "phase24-search"
        }
      ),
    (error) => error && error.code === "MCP_NOT_IMPLEMENTED"
  );
});
