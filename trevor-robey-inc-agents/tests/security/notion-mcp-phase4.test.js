"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fsp = require("node:fs/promises");

const { NotionMcp } = require("../../openclaw-bridge/mcp/notion-mcp.js");

async function makeTmpDir() {
  return fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-notion-mcp-"));
}

test("notion MCP enforces database/property allowlists and uses preparePublication", async () => {
  const dir = await makeTmpDir();
  let called = null;
  const mcp = new NotionMcp({
    mutationControl: {
      async preparePublication(input) {
        called = input;
        return {
          ok: true,
          provider: "notion",
          sequence: 1,
          preparedAt: "2026-03-22T08:00:00.000Z",
          idempotencyKey: "notion-phase24-idempotency",
          payloadHash: "notion-phase24-payload",
          request: {
            method: "POST",
            url: input.url,
            bodyBytes: Buffer.byteLength(JSON.stringify(input.payload))
          }
        };
      },
      async commitPublication() { return { ok: true }; },
      async retryPublication() { return { ok: true }; },
      async reconcilePublication() { return { ok: true }; }
    },
    phase24OutDir: dir
  });

  await assert.rejects(
    () =>
      mcp.preparePublish({
        databaseId: "db_openclaw_publications",
        properties: { Name: { title: [] } },
        approvalToken: "cred_token_123456"
      }, { role: "supervisor" }),
    (error) => error && error.code === "MUTATION_ROLE_DENIED"
  );

  await assert.rejects(
    () =>
      mcp.preparePublish({
        databaseId: "db_untrusted",
        properties: { Name: { title: [] } },
        approvalToken: "cred_token_123456"
      }, { role: "operator" }),
    (error) => error && error.code === "NOTION_DATABASE_NOT_ALLOWLISTED"
  );

  await assert.rejects(
    () =>
      mcp.preparePublish({
        databaseId: "db_openclaw_publications",
        properties: { Dangerous: { rich_text: [] } },
        approvalToken: "cred_token_123456"
      }, { role: "operator" }),
    (error) => error && error.code === "NOTION_PROPERTY_NOT_ALLOWLISTED"
  );

  const prepared = await mcp.preparePublish({
    databaseId: "db_openclaw_publications",
    properties: { Name: { title: [] }, Summary: { rich_text: [] } },
    content: [],
    approvalToken: "cred_token_123456"
  }, { role: "operator", correlationId: "notion-phase24-test" });

  assert.equal(prepared.ok, true);
  assert.equal(Boolean(called), true);
  assert.equal(called.provider, "notion");
  assert.equal(called.method, "POST");
  assert.equal(prepared.operatorBriefing.provider, "notion");

  const requestSnapshot = JSON.parse(
    await fsp.readFile(path.join(prepared.operatorBriefing.out_dir, "request-snapshot.json"), "utf8")
  );
  assert.equal(Object.prototype.hasOwnProperty.call(requestSnapshot.operator_input, "approvalToken"), false);
});
