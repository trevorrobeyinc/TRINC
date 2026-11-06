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

function isCustomerRun(value) {
  return value === true;
}

/** The tool-prefetch exclusions for a run; empty unless it is a customer run. */
function excludedToolsFor(options = {}) {
  return isCustomerRun(options && options.customerRun) ? CUSTOMER_RUN_EXCLUDED_TOOLS : Object.freeze({});
}

/** The recorded result for a post-run step a customer run skips. */
function customerRunSkip(step) {
  return { ok: true, action: "skipped", reason: `customer run: ${step} is never done for a paying client's run` };
}

module.exports = {
  CUSTOMER_RUN_EXCLUDED_TOOLS,
  CUSTOMER_RUN_PUBLISH_BLOCK,
  isCustomerRun,
  excludedToolsFor,
  customerRunSkip
};
