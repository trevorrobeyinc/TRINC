"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createGraphEngine } = require("../lib/graph-engine.js");

const { crossDomainConnect } = require("../lib/zettelkasten/cross-domain-connector.js");
const { breakEchoChamber } = require("../lib/zettelkasten/echo-chamber-breaker.js");
const { linkSemantically } = require("../lib/zettelkasten/semantic-linker.js");
const { rescueOrphans } = require("../lib/zettelkasten/orphan-rescuer.js");
const { generateSerendipity } = require("../lib/zettelkasten/serendipity-generator.js");

const SAMPLE_TEXT = `
Aspirin inhibits cyclooxygenase enzymes reducing prostaglandin synthesis.
Prostaglandin reduction leads to decreased inflammation and pain relief.
Warfarin is an anticoagulant that interacts with aspirin increasing bleeding risk.
Metformin activates AMPK pathway and inhibits mTOR signaling for diabetes.
Cancer prevention research investigates both aspirin and metformin mechanisms.
Statin drugs reduce cholesterol through HMG-CoA reductase inhibition pathway.
Thalidomide anti-angiogenic properties useful for multiple myeloma treatment.
TNF-alpha inhibition is thalidomide primary mechanism for cancer therapy.
`;

function buildAnalyzedEngine() {
  const engine = createGraphEngine();
  engine.fromText(SAMPLE_TEXT);
  engine.analyze();
  return engine;
}

describe("Cross-Domain Connector", () => {
  it("returns bridges array", () => {
    const engine = buildAnalyzedEngine();
    const result = crossDomainConnect(engine);
    assert.ok(Array.isArray(result.bridges));
  });

  it("returns connection proposals", () => {
    const engine = buildAnalyzedEngine();
    const result = crossDomainConnect(engine);
    assert.ok(Array.isArray(result.connection_proposals));
  });

  it("returns universal principles with tags", () => {
    const engine = buildAnalyzedEngine();
    const result = crossDomainConnect(engine);
    assert.ok(Array.isArray(result.universal_principles));
    for (const p of result.universal_principles) {
      assert.ok(p.tag.startsWith("#"));
    }
  });

  it("bridges have bridge_strength", () => {
    const engine = buildAnalyzedEngine();
    const result = crossDomainConnect(engine);
    for (const b of result.bridges) {
      assert.ok(typeof b.bridge_strength === "number");
      assert.ok(b.bridge_strength >= 0 && b.bridge_strength <= 1);
    }
  });

  it("returns isomorphisms array", () => {
    const engine = buildAnalyzedEngine();
    const result = crossDomainConnect(engine);
    assert.ok(Array.isArray(result.isomorphisms));
  });
});

describe("Echo Chamber Breaker", () => {
  it("returns diversity score", () => {
    const engine = buildAnalyzedEngine();
    const result = breakEchoChamber(engine);
    assert.ok(typeof result.diversity_score === "number");
    assert.ok(result.diversity_score >= 0 && result.diversity_score <= 1);
  });

  it("identifies dominant cluster", () => {
    const engine = buildAnalyzedEngine();
    const result = breakEchoChamber(engine);
    assert.ok(result.bias_assessment.dominant_cluster >= 0);
    assert.ok(result.bias_assessment.dominance_ratio > 0);
  });

  it("generates challenge questions", () => {
    const engine = buildAnalyzedEngine();
    const result = breakEchoChamber(engine);
    assert.ok(Array.isArray(result.challenge_questions));
    for (const q of result.challenge_questions) {
      assert.ok(q.question.length > 0);
    }
  });

  it("finds blind spots", () => {
    const engine = buildAnalyzedEngine();
    const result = breakEchoChamber(engine);
    assert.ok(Array.isArray(result.blind_spots));
  });

  it("suggests counter perspectives", () => {
    const engine = buildAnalyzedEngine();
    const result = breakEchoChamber(engine);
    assert.ok(Array.isArray(result.counter_perspectives));
  });
});

describe("Semantic Linker", () => {
  it("classifies direct links", () => {
    const engine = buildAnalyzedEngine();
    const result = linkSemantically(engine);
    assert.ok(result.direct_links.length > 0);
    const types = new Set(result.direct_links.map((l) => l.type));
    assert.ok(types.size > 0);
  });

  it("finds hidden links", () => {
    const engine = buildAnalyzedEngine();
    const result = linkSemantically(engine);
    assert.ok(Array.isArray(result.hidden_links));
  });

  it("infers transitive links", () => {
    const engine = buildAnalyzedEngine();
    const result = linkSemantically(engine);
    assert.ok(Array.isArray(result.transitive_links));
  });

  it("provides relationship summary", () => {
    const engine = buildAnalyzedEngine();
    const result = linkSemantically(engine);
    assert.ok("hierarchical" in result.relationship_summary);
    assert.ok("causal" in result.relationship_summary);
    assert.ok("associative" in result.relationship_summary);
    assert.ok("antagonistic" in result.relationship_summary);
  });

  it("direct links have type and weight", () => {
    const engine = buildAnalyzedEngine();
    const result = linkSemantically(engine);
    for (const link of result.direct_links.slice(0, 5)) {
      assert.ok(["hierarchical", "causal", "associative", "antagonistic"].includes(link.type));
      assert.ok(link.weight > 0);
    }
  });
});

describe("Orphan Rescuer", () => {
  it("returns orphan nodes array", () => {
    const engine = buildAnalyzedEngine();
    const result = rescueOrphans(engine);
    assert.ok(Array.isArray(result.orphan_nodes));
  });

  it("returns orphan communities array", () => {
    const engine = buildAnalyzedEngine();
    const result = rescueOrphans(engine);
    assert.ok(Array.isArray(result.orphan_communities));
  });

  it("generates rescue proposals", () => {
    const engine = buildAnalyzedEngine();
    const result = rescueOrphans(engine);
    assert.ok(Array.isArray(result.rescue_proposals));
    for (const rp of result.rescue_proposals) {
      assert.ok(rp.orphan);
      assert.ok(typeof rp.info_gain_score === "number");
    }
  });

  it("reports graph improvement metrics", () => {
    const engine = buildAnalyzedEngine();
    const result = rescueOrphans(engine);
    assert.ok("new_connections" in result.rescued_graph_improvement);
    assert.ok("gaps_resolved" in result.rescued_graph_improvement);
  });
});

describe("Serendipity Generator", () => {
  it("returns structural gaps", () => {
    const engine = buildAnalyzedEngine();
    const result = generateSerendipity(engine);
    assert.ok(Array.isArray(result.structural_gaps));
  });

  it("generates bridge hypotheses", () => {
    const engine = buildAnalyzedEngine();
    const result = generateSerendipity(engine);
    assert.ok(Array.isArray(result.bridge_hypotheses));
    for (const bh of result.bridge_hypotheses) {
      assert.ok(bh.hypothesis.length > 0);
      assert.ok(typeof bh.novelty_score === "number");
    }
  });

  it("finds dark nodes", () => {
    const engine = buildAnalyzedEngine();
    const result = generateSerendipity(engine);
    assert.ok(Array.isArray(result.dark_nodes));
  });

  it("finds serendipitous connections", () => {
    const engine = buildAnalyzedEngine();
    const result = generateSerendipity(engine);
    assert.ok(Array.isArray(result.serendipitous_connections));
    for (const sc of result.serendipitous_connections) {
      assert.ok(typeof sc.surprise_score === "number");
    }
  });

  it("generates lateral prompts", () => {
    const engine = buildAnalyzedEngine();
    const result = generateSerendipity(engine);
    assert.ok(Array.isArray(result.lateral_prompts));
    for (const lp of result.lateral_prompts) {
      assert.ok(lp.prompt.length > 0);
      assert.ok(lp.source_domain);
      assert.ok(lp.target_domain);
    }
  });
});
