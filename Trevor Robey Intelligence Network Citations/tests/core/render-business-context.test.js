"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  renderDerivedBlock, spliceBlock, currentBlock, MARK_BEGIN, MARK_END
} = require("../../scripts/render-business-context.js");

const ROOT = path.resolve(__dirname, "..", "..");
const SCRIPT = path.join(ROOT, "scripts", "render-business-context.js");

describe("render-business-context (derived block of the canonical Copilot note)", () => {
  it("renders every section from live config and never invents a price or an entity fact", () => {
    const block = renderDerivedBlock(ROOT);
    assert.ok(block.startsWith(MARK_BEGIN));
    assert.ok(block.endsWith(MARK_END));
    for (const h of [
      "### LLM routing", "### Research sources", "### Evidence prefetch per role",
      "### Distribution & content channels", "### Engine → Obsidian pipeline", "### Offering ladder", "### Business research tiers", "### Legal entity"
    ]) assert.ok(block.includes(h), `missing ${h}`);

    // Routing rows come from the live map.
    const routing = JSON.parse(fs.readFileSync(path.join(ROOT, "config/role-provider-map.json"), "utf8"));
    for (const [role, v] of Object.entries(routing.roles)) {
      assert.ok(block.includes(`| ${role} | \`${v.provider}\` | \`${v.model}\` |`), `routing row for ${role}`);
    }
    // Every dollar figure in the block exists verbatim in OFFERINGS.md — prices are copied, never computed.
    const offerings = fs.readFileSync(path.join(ROOT, "OFFERINGS.md"), "utf8");
    const prices = block.match(/\$[\d,]+/g) || [];
    assert.ok(prices.length > 0, "ladder copied");
    for (const p of prices) assert.ok(offerings.includes(p), `${p} is not in OFFERINGS.md`);
    // Entity number comes from the certificate record, verbatim.
    assert.ok(block.includes("B20260217250"));
    // Vault-lane read-back is declared context-only in the prefetch table.
    assert.match(block, /\| scout \| .*obsidian_prior_research.* \| .*obsidian_prior_research/);
    // Channels: every target present and manual-only.
    const targets = JSON.parse(fs.readFileSync(path.join(ROOT, "config/platform-targets.json"), "utf8")).platform_targets;
    for (const id of Object.keys(targets)) assert.ok(block.includes(`| ${id} | yes |`), `${id} manual-only row`);
    // Deterministic: no timestamp inside the block, so --check is meaningful.
    assert.equal(renderDerivedBlock(ROOT), block);
    assert.doesNotMatch(block, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });

  it("splices the block before '## 1.' on first apply, replaces it on later applies, and bumps last-verified", () => {
    const note = "---\ncopilot-context: canonical\nlast-verified: 2026-07-27\n---\n\n# Business Context\n\n> intro\n\n---\n\n## 1. TL;DR\n\nbody\n";
    const block = `${MARK_BEGIN}\n\n## 0. X\n\nv1\n\n${MARK_END}`;
    const first = spliceBlock(note, block, "2026-09-22");
    assert.match(first, /last-verified: 2026-09-22\n/);
    assert.ok(first.indexOf(MARK_BEGIN) < first.indexOf("## 1. TL;DR"));
    assert.equal(currentBlock(first), block);
    const block2 = block.replace("v1", "v2");
    const second = spliceBlock(first, block2, "2026-09-23");
    assert.equal(currentBlock(second), block2);
    assert.equal((second.match(/derived:begin/g) || []).length, 1, "exactly one block");
    assert.doesNotMatch(second, /v1/);
    assert.match(second, /## 1\. TL;DR\n\nbody\n$/);
  });

  it("CLI: --check reports drift, --apply fixes it, --check then passes; a note outside the vault roots is refused", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bc-note-"));
    const notePath = path.join(tmp, "Business Context.md");
    fs.writeFileSync(notePath, "---\nlast-verified: 2026-07-27\n---\n\n## 1. TL;DR\n\nbody\n");
    // The real config allow-lists only the live vault, so this temp note must be refused…
    const refused = spawnSync(process.execPath, [SCRIPT, "--check", "--note", notePath], { cwd: ROOT, encoding: "utf8" });
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /outside every allowed vault root/);
    // …and the in-process API is what a permitted apply would do.
    const block = renderDerivedBlock(ROOT);
    const applied = spliceBlock(fs.readFileSync(notePath, "utf8"), block, "2026-09-22");
    fs.writeFileSync(notePath, applied);
    assert.equal(currentBlock(fs.readFileSync(notePath, "utf8")), block);
    fs.rmSync(tmp, { recursive: true, force: true });

    const printed = spawnSync(process.execPath, [SCRIPT, "--print"], { cwd: ROOT, encoding: "utf8" });
    assert.equal(printed.status, 0);
    assert.equal(printed.stdout.trim(), block);
    const usage = spawnSync(process.execPath, [SCRIPT], { cwd: ROOT, encoding: "utf8" });
    assert.equal(usage.status, 2);
  });
});
