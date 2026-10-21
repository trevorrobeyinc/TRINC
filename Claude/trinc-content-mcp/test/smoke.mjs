/**
 * End-to-end MCP smoke test: spawn the real server over stdio, complete the protocol
 * handshake, list the tools, and call two of them. Proves the thing a unit test cannot —
 * that a Claude session can actually reach this server.
 *
 * Run: npm run smoke
 */
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(here, "..", "src", "server.js");

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath]
});
const client = new Client({ name: "trinc-content-smoke", version: "1.0.0" }, { capabilities: {} });

await client.connect(transport);
console.log("handshake: ok");

const { tools } = await client.listTools();
console.log(`tools/list: ${tools.length} tools`);
assert.ok(tools.length === 12, `expected 12 tools, got ${tools.length}`);
for (const name of [
  "content_brand_context", "content_source_inventory", "content_extract_claims",
  "content_channel_profile", "content_draft", "content_check", "content_aws_listing",
  "content_calendar", "publish_youtube", "publish_tiktok", "publish_instagram", "publish_facebook_page"
]) {
  assert.ok(tools.some((tool) => tool.name === name), `missing tool ${name}`);
}
console.log("tools/list: all expected tools present");

const brand = await client.callTool({ name: "content_brand_context", arguments: {} });
const brandData = JSON.parse(brand.content[0].text);
assert.match(brandData.disclosure, /wordmark of Trevor Robey Intelligence Network Citations LLC/);
assert.equal(brandData.channel_voices.tiktok, "founder");
console.log("content_brand_context: ok (disclosure verbatim, voices loaded)");

const blocked = await client.callTool({
  name: "publish_tiktok",
  arguments: { draft_text: "Zero hallucinations." }
});
const blockedData = JSON.parse(blocked.content[0].text);
assert.equal(blockedData.status, "BLOCKED");
assert.equal(blockedData.would_publish, false);
console.log("publish_tiktok: correctly BLOCKED, nothing sent");

const unknown = await client.callTool({ name: "content_extract_claims", arguments: { source_ref: "nope" } });
assert.equal(unknown.isError, true);
assert.match(unknown.content[0].text, /TRINC_CONTENT_SOURCE_REF_INVALID/);
console.log("error path: ok (coded error, not a stack trace)");

await client.close();
console.log("\nSMOKE PASSED");
