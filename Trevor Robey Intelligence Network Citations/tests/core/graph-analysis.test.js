"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const { createGraphAnalysis, precleanForGraph } = require("../../openclaw-bridge/vault/graph-analysis.js");

const ZK_ROOT = "/Users/myhome/TrevClaw-Obsidianodus/Claude/Medical-Zettelkasten-MCP";
const zkPresent = fs.existsSync(`${ZK_ROOT}/lib/openclaw-bridge-adapter.js`);

const SAMPLE = [
  "# Phase 3 trial-design benchmark for non-small cell lung cancer",
  "",
  "Docetaxel remains the comparator arm in most second-line NSCLC designs (PMID: 30000001; NCT01234567).",
  "Pembrolizumab monotherapy showed durable responses in PD-L1 high tumours (doi: 10.1056/NEJMoa1501824).",
  "Neoadjuvant chemoimmunotherapy improved pathological complete response before resection.",
  "KRAS G12C inhibitors sotorasib and adagrasib produced objective responses after platinum chemotherapy.",
  "Progression-free survival was the primary endpoint in most randomized designs; overall survival was secondary.",
  "Treatment-emergent adverse events of grade three or higher were reported by sponsor in every registered arm.",
  "**Source**: ToolUniverse SMCP / PubMed_search_articles",
  "Retrieved: 2026-07-31T00:10:00.000Z",
  "Live Data: search_clinical_trials returned 12 records."
].join("\n");

describe("graph-analysis (deterministic, LLM-free post-run note)", () => {
  it("precleanForGraph strips identifiers, pipeline lines and pipeline vocabulary but keeps the science", () => {
    const cleaned = precleanForGraph(SAMPLE);
    for (const gone of ["30000001", "NCT01234567", "10.1056/NEJMoa1501824", "ToolUniverse", "Retrieved:", "Live Data"]) {
      assert.ok(!cleaned.includes(gone), `${gone} should be stripped`);
    }
    assert.doesNotMatch(cleaned, /\bpmid\b/i);
    assert.doesNotMatch(cleaned, /\bretrieved\b/i);
    for (const kept of ["Docetaxel", "Pembrolizumab", "Neoadjuvant", "sotorasib", "Progression-free"]) {
      assert.ok(cleaned.includes(kept), `${kept} should survive`);
    }
  });

  it("is a recorded skip when disabled, when the package is missing, and when the text is too short", async () => {
    const off = createGraphAnalysis({ enabled: false, packageRoot: ZK_ROOT });
    assert.equal((await off.analyze(SAMPLE)).ok, false);
    const missing = createGraphAnalysis({ packageRoot: "/nonexistent/zk" });
    const r = await missing.analyze(SAMPLE);
    assert.equal(r.ok, false);
    assert.match(r.reason, /not found/);
    if (zkPresent) {
      const short = createGraphAnalysis({ packageRoot: ZK_ROOT });
      const s = await short.analyze("too short");
      assert.equal(s.ok, false);
      assert.match(s.reason, /too little text/);
    }
    assert.equal(off.render({ ok: false }), "");
  });

  it("renders a bounded, wikilink-free note from an analysis object", () => {
    const ga = createGraphAnalysis({ packageRoot: ZK_ROOT, maxItems: 3 });
    const analysis = {
      ok: true,
      summary: { nodes: 120, edges: 400, communities: 9, modularity: 0.4321, diversity: 0.87, dominanceRatio: 0.12, cleanedChars: 900 },
      central: [{ term: "docetaxel", score: 0.5 }, { term: "endpoint", score: 0.25 }],
      clusters: [{ id: 3, size: 10, terms: ["docetaxel", "comparator", "arm"] }],
      gaps: [{ a: 1, b: 2, score: 300, bridges: ["neoadjuvant", "[[resection]]"] }],
      blindSpots: ["no real-world evidence"],
      questions: ["What if the comparator is no longer standard of care?"],
      counterPerspectives: []
    };
    const md = ga.render(analysis, { workflowId: "workflow-abc" });
    assert.match(md, /^# Graph Analysis\n/);
    assert.match(md, /Workflow: \[\[Overview\]\] \(`workflow-abc`\)/);
    assert.match(md, /\| Concept nodes \| 120 \|/);
    assert.match(md, /- docetaxel — 0\.500/);
    assert.match(md, /- Cluster 3 \(10 terms\): docetaxel, comparator, arm/);
    assert.match(md, /- Cluster 1 ↔ Cluster 2 — gap score 300; bridge candidates: neoadjuvant, resection/);
    assert.match(md, /## Blind spots\n\n- no real-world evidence/);
    // The only wikilink allowed is the Overview backlink.
    assert.equal((md.match(/\[\[/g) || []).length, 1);
  });

  it("runs the real Medical Zettelkasten package in-process when present (skipped otherwise)", { skip: !zkPresent && "Medical-Zettelkasten-MCP not on this machine" }, async () => {
    const ga = createGraphAnalysis({ packageRoot: ZK_ROOT, maxItems: 5 });
    const analysis = await ga.analyze(SAMPLE.repeat(3));
    assert.equal(analysis.ok, true, JSON.stringify(analysis));
    assert.ok(analysis.summary.nodes > 10);
    assert.ok(analysis.central.length > 0 && analysis.central.length <= 5);
    assert.ok(!analysis.central.some((c) => /^(pmid|nct|doi|retrieved?|live)$/i.test(c.term)), "pipeline tokens must not be central concepts");
    const md = ga.render(analysis, { workflowId: "workflow-live" });
    assert.match(md, /## Central concepts/);
    assert.equal((md.match(/\[\[/g) || []).length, 1);
  });
});
