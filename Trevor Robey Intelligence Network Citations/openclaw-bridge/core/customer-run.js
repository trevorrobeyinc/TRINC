"use strict";

// Customer runs (2026-11-06, operator decision #4 on
// 08-contracts-legal/decision-sheet-2026-11.md). A paying client's run reads nothing from earlier
// runs and leaves nothing behind that later runs or other systems read:
//   in:  no prior-research read-back (obsidian_prior_research), no research-memory priors
//        (research_memory_priors), no "Recent sessions" digest in the role prompts;
//   out: no session record under config/agents/<role>/sessions/, no vault publish, no research-memory
//        ingest, now or by any later backfill (workflow.json carries customer_run: true, and the
//        publisher's shippability check refuses such a run).
// Started only from the CLI, never through the Obsidian door:
//   node scripts/run-workflow.js --template <id> --inputs '<json>' --operator-approve --customer-run --confirm
// The run's own folder (workspace/workflows/<id>/) and its sealed release stay: they are the delivery.
// They are kept 12 months after delivery (decision #21).

const CUSTOMER_RUN_EXCLUDED_TOOLS = Object.freeze({
  obsidian_prior_research: "customer run: prior research from earlier runs is not read",
  research_memory_priors: "customer run: research-memory priors from earlier runs are not read"
});

const CUSTOMER_RUN_PUBLISH_BLOCK =
  "customer run: a paying client's run is never published to the vault or ingested into research memory";

// ── What a customer run is told about identifiers (T2-7, 2026-11-16) ─────────────────────────────
// Every delivery path refuses a ChEMBL id (scripts/_delivery-checks.js), the extractor never reads an
// ENSG id, an RxNorm CUI or a FAERS case number, and the biomedical prefetch map fetches no PubChem or
// UniProt records. So a paying client's run is asked for PMIDs, NCT numbers and DOIs, and for a PubChem
// CID or a UniProt accession only where one appears verbatim in the live data; otherwise a paid run
// could finish and be undeliverable (the 2026-11-16 proof run cited two ChEMBL ids). Operator default
// D4: customer runs only; every other run keeps today's prompt.
//
// The base texts stay the single source: config/role-prompts.json, config/agents/<role>/SOUL.md and the
// prefetch-failure notices in agent-engine.js. A customer run's assembled instructions swap these exact
// phrases (agent-engine buildPrompt). Each replacement names only what the model may use, never the
// excluded source (the instruction-gate lesson, CLAUDE.md). tests/core/customer-run.test.js fails when
// a phrase no longer matches its source, and tests/core/instruction-gate-consistency.test.js when a
// customer-run prompt still names a type outside the allowlist.
const CUSTOMER_RUN_PHRASES = Object.freeze([
  // config/agents/<role>/SOUL.md
  ["PubMed (PMID), ClinicalTrials.gov (NCT), ChEMBL, DOI, UniProt, PubChem CID",
    "PubMed (PMID), ClinicalTrials.gov (NCT) and DOI"],
  ["inventing a PMID/NCT/DOI/ChEMBL/CID/UniProt is a critical failure",
    "inventing a PMID/NCT/DOI/CID/UniProt is a critical failure"],
  ["only by these identifier types: PMID, NCT, PubChem CID, ChEMBL, ENSG, UniProt, DOI, RxNorm.",
    "only by these identifier types: PMID, NCT and DOI, plus a PubChem CID or UniProt accession only where one appears verbatim in the live data."],
  ["(PMID/NCT/ChEMBL/DOI/UniProt/CID)", "(PMID/NCT/DOI/UniProt/CID)"],
  ["(PMID/NCT/ChEMBL/DOI)", "(PMID/NCT/DOI)"],
  ["fabricating a PMID/NCT/ChEMBL/DOI is a critical failure", "fabricating a PMID/NCT/DOI is a critical failure"],
  // config/role-prompts.json
  ["Every drug compound must include its PubChem CID or ChEMBL ID.",
    "Name every drug compound in words, with its PubChem CID only where one appears verbatim in the live data."],
  ["Every gene/protein must include its ENSG ID or UniProt accession.",
    "Name every gene or protein in words, with its UniProt accession only where one appears verbatim in the live data."],
  ["Reference FAERS case numbers, PMID citations for each literature reference, a PubChem CID (e.g. PubChem CID: 2244) for each drug mentioned, RxNorm CUIs, and MedDRA preferred terms.",
    "Report FAERS case counts and MedDRA preferred terms as data, cite each literature reference by its PMID or DOI, and give a drug's PubChem CID (e.g. PubChem CID: 2244) only where one appears verbatim in the live data."],
  ["Use FAERS, DailyMed, RxNorm, and OpenFDA for signal detection.", "Use FAERS, DailyMed and OpenFDA for signal detection."],
  ["Every compound must include its PubChem CID (e.g. CID: 2244), every target must include its UniProt accession (e.g. UniProt: P04637) and ENSG ID (e.g. ENSG00000157764), and every bioactivity entry must include its ChEMBL ID (e.g. CHEMBL25).",
    "Give a compound's PubChem CID (e.g. CID: 2244) and a target's UniProt accession (e.g. UniProt: P04637) only where one appears verbatim in the live data, and cite each bioactivity value by the PMID or DOI of the record it came from."],
  ["Use PubChem, ChEMBL, ADMETai, and UniProt for compound profiling.", "Use PubChem, ADMETai and UniProt for compound profiling."],
  ["Every gene target must include its ENSG ID and UniProt accession. Every drug must include its PubChem CID or ChEMBL ID.",
    "Name every gene target and drug in words, with a UniProt accession or PubChem CID only where one appears verbatim in the live data."],
  ["(PMID, NCT, CID, ChEMBL, ENSG, UniProt, DOI)", "(PMID, NCT, DOI, and any PubChem CID or UniProt accession)"],
  // the prefetch-failure notices (agent-engine.js)
  ["(PMID / NCT / DOI / ChEMBL / CID / UniProt)", "(PMID / NCT / DOI / CID / UniProt)"]
]);

/** A customer run's version of an instruction text: each phrase above swapped. Plain text otherwise. */
function customerRunText(text) {
  let out = String(text == null ? "" : text);
  for (const [from, to] of CUSTOMER_RUN_PHRASES) out = out.split(from).join(to);
  return out;
}

// Prefetch record fields a customer run never renders into a prompt (tool-prefetch.js renderRecord):
// Open Targets records carry a ChEMBL id, which no paid deliverable may cite. The record keeps the field;
// only the prompt text leaves it out, so it can neither be cited nor ground a citation.
const CUSTOMER_RUN_EXCLUDED_FIELDS = Object.freeze({
  chemblId: "customer run: an identifier no paid deliverable may carry is not rendered"
});

function isCustomerRun(value) {
  return value === true;
}

/** The tool-prefetch exclusions for a run; empty unless it is a customer run. */
function excludedToolsFor(options = {}) {
  return isCustomerRun(options && options.customerRun) ? CUSTOMER_RUN_EXCLUDED_TOOLS : Object.freeze({});
}

/** The prefetch record fields left out of the prompt for a run; empty unless it is a customer run. */
function excludedFieldsFor(options = {}) {
  return isCustomerRun(options && options.customerRun) ? CUSTOMER_RUN_EXCLUDED_FIELDS : Object.freeze({});
}

/** The recorded result for a post-run step a customer run skips. */
function customerRunSkip(step) {
  return { ok: true, action: "skipped", reason: `customer run: ${step} is never done for a paying client's run` };
}

module.exports = {
  CUSTOMER_RUN_EXCLUDED_FIELDS,
  CUSTOMER_RUN_EXCLUDED_TOOLS,
  CUSTOMER_RUN_PHRASES,
  CUSTOMER_RUN_PUBLISH_BLOCK,
  isCustomerRun,
  customerRunText,
  excludedFieldsFor,
  excludedToolsFor,
  customerRunSkip
};
