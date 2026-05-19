"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fsp = require("node:fs/promises");

const { NewsletterMcp } = require("../../openclaw-bridge/mcp/newsletter-mcp.js");

async function makeTmpDir() {
  return fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-newsletter-mcp-"));
}

test("newsletter MCP prepare enforces html/link guards and uses preparePublication", async () => {
  const dir = await makeTmpDir();
  let called = null;
  const mcp = new NewsletterMcp({
    mutationControl: {
      async preparePublication(input) {
        called = input;
        return {
          ok: true,
          provider: "newsletter",
          sequence: 1,
          preparedAt: "2026-03-22T08:00:00.000Z",
          idempotencyKey: "newsletter-phase24-idempotency",
          payloadHash: "newsletter-phase24-payload",
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
    allowedExternalHosts: ["example.com"],
    phase24OutDir: dir
  });

  await assert.rejects(
    () =>
      mcp.preparePublish({
        publicationId: "pub",
        title: "title",
        html: "<p>go https://example.com/path</p>",
        approvalToken: "cred_token_123456"
      }, { role: "supervisor" }),
    (error) => error && error.code === "MUTATION_ROLE_DENIED"
  );

  await assert.rejects(
    () =>
      mcp.preparePublish({
        publicationId: "pub",
        title: "title",
        html: "<script>alert(1)</script>",
        approvalToken: "cred_token_123456"
      }, { role: "operator" }),
    (error) => error && error.code === "NEWSLETTER_HTML_INJECTION_DETECTED"
  );

  await assert.rejects(
    () =>
      mcp.preparePublish({
        publicationId: "pub",
        title: "title",
        html: "<p>go https://evil.example</p>",
        approvalToken: "cred_token_123456"
      }, { role: "operator" }),
    (error) => error && error.code === "NEWSLETTER_EXTERNAL_LINK_NOT_ALLOWLISTED"
  );

  const prepared = await mcp.preparePublish({
    publicationId: "pub",
    title: "title",
    html: "<p>go https://example.com/path</p>",
    approvalToken: "cred_token_123456"
  }, { role: "operator", correlationId: "newsletter-phase24-test" });

  assert.equal(prepared.ok, true);
  assert.equal(Boolean(called), true);
  assert.equal(called.provider, "newsletter");
  assert.equal(called.method, "POST");
  assert.equal(prepared.operatorBriefing.provider, "newsletter");

  const requestSnapshot = JSON.parse(
    await fsp.readFile(path.join(prepared.operatorBriefing.out_dir, "request-snapshot.json"), "utf8")
  );
  assert.equal(Object.prototype.hasOwnProperty.call(requestSnapshot.operator_input, "approvalToken"), false);
});
