"use strict";

/**
 * Demo: OpenClaw → Medical Zettelkasten pipeline.
 * Simulates ToolUniverse JSON data flowing through graph analysis.
 */

const { createOpenClawBridgeAdapter } = require("../lib/openclaw-bridge-adapter.js");

const SAMPLE_TOOLUNIVERSE_DATA = {
  tools_found: [
    {
      name: "DrugBank Drug Info",
      description: "Aspirin is a non-steroidal anti-inflammatory drug used for pain relief, fever reduction, and anti-platelet therapy.",
      mechanism_of_action: "Irreversibly inhibits cyclooxygenase-1 and cyclooxygenase-2 enzymes, reducing prostaglandin synthesis.",
      indication: "Pain, inflammation, fever, cardiovascular prevention",
      adverse_effects: "Gastrointestinal bleeding, peptic ulcer, Reye syndrome in children, tinnitus at high doses",
      drug_interactions: "Increased bleeding risk with warfarin, reduced efficacy of ACE inhibitors, interaction with methotrexate",
    },
    {
      name: "PubChem Compound",
      description: "Acetylsalicylic acid (CID:2244) is the active compound in aspirin. Molecular formula C9H8O4.",
      pathway_name: "Arachidonic acid metabolism pathway",
      gene_name: "PTGS1 (COX-1), PTGS2 (COX-2)",
      protein_name: "Prostaglandin G/H synthase 1, Prostaglandin G/H synthase 2",
    },
    {
      name: "ClinicalTrials.gov Search",
      description: "Multiple clinical trials investigating aspirin for cardiovascular prevention, cancer risk reduction, and COVID-19.",
      title: "Aspirin in Reducing Events in the Elderly (ASPREE)",
      abstract: "ASPREE trial showed daily low-dose aspirin did not prolong disability-free survival in healthy elderly adults. Higher rates of major hemorrhage were observed in the aspirin group compared to placebo.",
    },
  ],
};

async function main() {
  const adapter = createOpenClawBridgeAdapter({
    logger: {
      info(msg) { console.log("[INFO]", JSON.stringify(msg)); },
      warn(msg) { console.warn("[WARN]", JSON.stringify(msg)); },
      error(msg) { console.error("[ERROR]", JSON.stringify(msg)); },
    },
  });

  console.log("=== OpenClaw → Medical Zettelkasten Pipeline Demo ===\n");

  // Full analysis
  const result = await adapter.analyzeToolUniverseData(SAMPLE_TOOLUNIVERSE_DATA);
  if (result.ok) {
    console.log("Full Zettelkasten Analysis completed in", result.durationMs, "ms");
    console.log("\nCross-Domain Bridges:", result.result.cross_domain.bridges.length);
    console.log("Structural Gaps:", result.result.serendipity.structural_gaps.length);
    console.log("Challenge Questions:", result.result.echo_chamber.challenge_questions.length);
    console.log("Hidden Links:", result.result.semantic_links.hidden_links.length);
    console.log("Orphan Nodes:", result.result.orphan_rescue.orphan_nodes.length);
    console.log("\nDemo completed successfully.");
  } else {
    console.error("Analysis failed:", result.error);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
