"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fsp = require("node:fs/promises");

const {
  createPhase24OperatorBriefingWriter
} = require("../../openclaw-bridge/mutation/phase24-operator-briefing.js");

async function makeTmpDir() {
  return fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-phase24-briefing-"));
}

async function readArtifactSet(dirPath, files) {
  const out = {};
  for (const file of files) {
    out[file] = await fsp.readFile(path.join(dirPath, file), "utf8");
  }
  return out;
}

test("phase24 operator briefing artifacts are byte-stable for identical inputs", async () => {
  const dir = await makeTmpDir();
  const writer = createPhase24OperatorBriefingWriter({
    outDir: path.join(dir, "evidence")
  });
  const input = {
    provider: "newsletter",
    sequence: 7,
    preparedAt: "2026-03-22T08:00:00.000Z",
    idempotencyKey: "phase24-idempotency-key",
    payloadHash: "phase24-payload-hash",
    correlationId: "corr-phase24",
    method: "POST",
    url: "https://api.beehiiv.com/v2/publications/pub_123/posts",
    operatorInput: {
      publicationId: "pub_123",
      title: "Phase 24 update",
      html: "<p>https://example.com/demo</p>",
      approvalToken: "cred_token_hidden"
    },
    sanitizedPayload: {
      title: "Phase 24 update",
      html: "<p>https://example.com/demo</p>",
      tags: []
    }
  };

  const first = await writer.writePreparedPublicationArtifacts({
    ...input,
    outDir: path.join(dir, "first")
  });
  const second = await writer.writePreparedPublicationArtifacts({
    ...input,
    outDir: path.join(dir, "second")
  });

  assert.deepEqual(first.files, second.files);

  const firstBodies = await readArtifactSet(first.out_dir, first.files);
  const secondBodies = await readArtifactSet(second.out_dir, second.files);
  assert.deepEqual(firstBodies, secondBodies);

  const requestSnapshot = JSON.parse(firstBodies["request-snapshot.json"]);
  assert.equal(requestSnapshot.schema_version, "phase24-operator-request-snapshot-v1");
  assert.equal(Object.prototype.hasOwnProperty.call(requestSnapshot.operator_input, "approvalToken"), false);
});
