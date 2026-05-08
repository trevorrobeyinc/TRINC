"use strict";

/**
 * Demo: Obsidian note content → Medical Zettelkasten graph analysis →
 * Obsidian-formatted output with wikilinks, Dataview properties, tags.
 */

const { dispatch } = require("../src/handlers/index.js");
const { createCopilotBridge } = require("../lib/copilot-bridge.js");

const SAMPLE_OBSIDIAN_NOTE = `
# Drug Repurposing Research Notes

## Aspirin and Cancer Prevention
Recent studies suggest aspirin may reduce the risk of colorectal cancer through
COX-2 inhibition. The prostaglandin pathway plays a key role in tumor
microenvironment modulation. BRCA1 mutations may influence aspirin response.

## Metformin Repositioning
Metformin, traditionally used for type 2 diabetes, shows promise in cancer
prevention. It activates AMPK pathway and inhibits mTOR signaling. Clinical
trials are investigating metformin in breast cancer and pancreatic cancer.

## Statin Pleiotropic Effects
Statins reduce cholesterol via HMG-CoA reductase inhibition but also show
anti-inflammatory and immunomodulatory properties. They may reduce cancer
risk through mevalonate pathway disruption. Potential synergy with aspirin
for cardiovascular and cancer prevention.

## Thalidomide Revival
Once notorious for birth defects, thalidomide is now used for multiple
myeloma treatment. Its anti-angiogenic properties make it useful in cancer
therapy. TNF-alpha inhibition is a key mechanism.
`;

async function main() {
  console.log("=== Copilot MCP Integration Demo ===\n");

  // Run full Zettelkasten analysis
  const result = dispatch("full_zettelkasten_analysis", {
    text: SAMPLE_OBSIDIAN_NOTE,
    input_type: "text",
  });

  const analysisData = JSON.parse(result.content[0].text);

  // Convert to Copilot response format
  const bridge = createCopilotBridge({ vaultName: "My Digital Garden" });
  const copilotResponse = bridge.toCopilotResponse(analysisData, "full_zettelkasten_analysis");

  console.log("Copilot Response OK:", copilotResponse.ok);
  console.log("Suggestions:", copilotResponse.suggestions.length);
  console.log("\n--- Obsidian Note Output ---\n");
  console.log(copilotResponse.content.slice(0, 1000));
  console.log("\n--- Wikilink Suggestions ---");
  for (const s of copilotResponse.suggestions.slice(0, 5)) {
    console.log(`  ${s.wikilink} — ${s.rationale}`);
  }

  // Also generate standalone Obsidian note
  const note = bridge.toObsidianNote(analysisData, "Drug Repurposing — Graph Analysis");
  console.log("\n--- Standalone Note (first 500 chars) ---");
  console.log(note.slice(0, 500));

  console.log("\nDemo completed successfully.");
}

main().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
