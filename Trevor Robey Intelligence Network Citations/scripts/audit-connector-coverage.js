#!/usr/bin/env node
"use strict";

// Connector coverage audit.
// Cross-references config/connector-registry.json against config/tool-prefetch-map.json
// and reports drift between the two surfaces (registry intent vs. prefetch wiring).
//
// Usage:
//   node scripts/audit-connector-coverage.js
//   node scripts/audit-connector-coverage.js --write-drift-tickets         # writes to .learnings/FEATURE_REQUESTS.md
//   node scripts/audit-connector-coverage.js --write-drift-tickets --dry-run   # preview tickets to stdout

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const REGISTRY_PATH = path.join(ROOT, "config", "connector-registry.json");
const PREFETCH_PATH = path.join(ROOT, "config", "tool-prefetch-map.json");
const LEARNINGS_DIR = path.join(ROOT, ".learnings");
const FEATURE_REQUESTS_PATH = path.join(LEARNINGS_DIR, "FEATURE_REQUESTS.md");

const args = process.argv.slice(2);
const writeDriftTickets = args.includes("--write-drift-tickets");
const dryRun = args.includes("--dry-run");

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function todayCompact() {
  return todayIso().replace(/-/g, "");
}

function classify(registry) {
  const ids = Object.keys(registry.connectors);
  const buckets = {
    registeredAndBound: [],
    registeredUnbound: [],
    intentionallyUnbound: [],
    declined: [],
    procurementGated: [],
    superseded: [],
    blockedOperatorDecision: [],
    adapterMissingHigh: [],
    adapterMissingMedium: [],
    adapterMissingLow: [],
    chatSupervisoryOnly: [],
    needsInvestigation: [],
    other: []
  };

  for (const id of ids) {
    const entry = registry.connectors[id];
    const bound = (entry.bound_roles && entry.bound_roles.length > 0) ||
                  (entry.bound_workflow_steps && entry.bound_workflow_steps.length > 0);
    const status = entry.adapter_status;
    const priority = entry.adapter_priority;
    const value = entry.business_value;

    // A connector may declare WHY it has no prefetch binding. Two legitimate reasons:
    //   intentionally-unbound        — a publishing/ops surface, never a research data source
    //   gate-consumed-not-prefetched — citation-gate infrastructure consumed via researchRuntime,
    //                                  which screens assembled report citations rather than
    //                                  gathering evidence, so a prefetch entry would be wrong.
    // Either way it is a recorded decision, not drift, and must not be reported as a gap.
    if (entry.binding_status === "intentionally-unbound" ||
        entry.binding_status === "gate-consumed-not-prefetched") {
      buckets.intentionallyUnbound.push(id);
      continue;
    }
    if (status === "declined-no-public-api") {
      buckets.declined.push(id);
      continue;
    }
    // Recorded commercial/operator states. Each is a decision already made, so none of these
    // is an engineering gap — but each stays visible so it can be revisited deliberately.
    if (status === "identified-procurement-gated") {
      buckets.procurementGated.push(id);
      continue;
    }
    if (status === "blocked-operator-decision") {
      buckets.blockedOperatorDecision.push(id);
      continue;
    }
    if (value === "superseded") {
      buckets.superseded.push(id);
      continue;
    }

    if (status === "wired" && bound) {
      buckets.registeredAndBound.push(id);
    } else if (status === "wired" && !bound) {
      buckets.registeredUnbound.push(id);
    } else if (status === "missing" && priority === "high") {
      buckets.adapterMissingHigh.push(id);
    } else if (status === "missing" && priority === "medium") {
      buckets.adapterMissingMedium.push(id);
    } else if (status === "missing" && priority === "low") {
      buckets.adapterMissingLow.push(id);
    } else if (value === "chat-supervisory-only") {
      buckets.chatSupervisoryOnly.push(id);
    } else if (status === "needs-investigation") {
      buckets.needsInvestigation.push(id);
    } else {
      buckets.other.push(id);
    }
  }
  return buckets;
}

function crossCheckPrefetch(registry, prefetch) {
  const registryRoles = new Set();
  for (const entry of Object.values(registry.connectors)) {
    for (const r of (entry.bound_roles || [])) registryRoles.add(r);
  }
  const prefetchRoles = new Set(Object.keys(prefetch.role_mappings || {}));

  const registryTools = new Set();
  for (const entry of Object.values(registry.connectors)) {
    if (entry.execution_surface === "subprocess-mcp" || entry.execution_surface === "tooluniverse-tool") {
      for (const t of (entry.tools || [])) registryTools.add(t);
    }
  }
  const prefetchTools = new Set();
  for (const roleEntries of Object.values(prefetch.role_mappings || {})) {
    if (!Array.isArray(roleEntries)) continue;
    for (const action of roleEntries) {
      if (action.tool_name) prefetchTools.add(action.tool_name);
    }
  }

  // Roles that consume assembled upstream output rather than gathering external evidence
  // (report_generator, quality_auditor) correctly have NO prefetch entry. Declared in the
  // registry's prefetch_exempt_roles so this is a recorded design decision, not silent drift.
  const exemptRoles = new Set((registry.prefetch_exempt_roles && registry.prefetch_exempt_roles.roles) || []);

  const rolesInRegistryNotPrefetch = [...registryRoles]
    .filter(r => !prefetchRoles.has(r) && !exemptRoles.has(r));
  const rolesInPrefetchNotRegistry = [...prefetchRoles].filter(r => !registryRoles.has(r));

  const toolsInPrefetchNotRegistry = [...prefetchTools].filter(t => !registryTools.has(t));

  return {
    registryRoles: [...registryRoles].sort(),
    prefetchRoles: [...prefetchRoles].sort(),
    exemptRoles: [...exemptRoles].sort(),
    rolesInRegistryNotPrefetch,
    rolesInPrefetchNotRegistry,
    prefetchTools: [...prefetchTools].sort(),
    toolsInPrefetchNotRegistry: toolsInPrefetchNotRegistry.sort()
  };
}

function renderReport(registry, buckets, crosscheck) {
  const lines = [];
  lines.push(`=== Connector Coverage Audit (${todayIso()}) ===`);
  lines.push("");
  lines.push(`Registry: ${REGISTRY_PATH.replace(ROOT + "/", "")} (schema ${registry.schema_version})`);
  lines.push(`Total connectors registered: ${Object.keys(registry.connectors).length}`);
  lines.push(`Infrastructure tool-prefixes explicitly excluded: ${(registry.excluded_infrastructure && registry.excluded_infrastructure.tool_prefixes || []).length}`);
  lines.push("");
  // Lane distribution — `research` is the only lane permitted into tool-prefetch-map.json.
  const byLane = {};
  for (const entry of Object.values(registry.connectors)) {
    const lane = entry.lane || "(unlaned)";
    byLane[lane] = (byLane[lane] || 0) + 1;
  }
  const laneSummary = Object.entries(byLane).sort().map(([l, n]) => `${l}=${n}`).join("  ");
  lines.push(`Lanes: ${laneSummary}`);
  const unlaned = Object.entries(registry.connectors).filter(([, e]) => !e.lane).map(([id]) => id);
  if (unlaned.length) {
    lines.push(`  ⚠  Unlaned connectors (assign a lane): ${unlaned.join(", ")}`);
  }
  lines.push("");
  lines.push(`Registered & bound (subprocess-reachable, role-bound):   ${buckets.registeredAndBound.length}`);
  lines.push(`Registered, unbound (wired but no role/step binding):    ${buckets.registeredUnbound.length}${buckets.registeredUnbound.length ? "  ⚠  " + buckets.registeredUnbound.join(", ") : ""}`);
  lines.push(`Unbound BY DESIGN (recorded decision, not drift):        ${buckets.intentionallyUnbound.length}${buckets.intentionallyUnbound.length ? "  ✓  " + buckets.intentionallyUnbound.join(", ") : ""}`);
  lines.push(`Declined (no public API — do not attempt to connect):    ${buckets.declined.length}${buckets.declined.length ? "  ✓  " + buckets.declined.join(", ") : ""}`);
  lines.push("");
  lines.push("--- Adapter gaps (claude-host-mcp connectors that need subprocess adapters) ---");
  lines.push(`  HIGH priority   (load-bearing for $9,950+ deliverables):  ${buckets.adapterMissingHigh.length}${buckets.adapterMissingHigh.length ? "  ✗  " + buckets.adapterMissingHigh.join(", ") : ""}`);
  lines.push(`  MEDIUM priority (high research value):                    ${buckets.adapterMissingMedium.length}${buckets.adapterMissingMedium.length ? "  ⚠  " + buckets.adapterMissingMedium.join(", ") : ""}`);
  lines.push(`  LOW priority    (nice-to-have):                           ${buckets.adapterMissingLow.length}${buckets.adapterMissingLow.length ? "     " + buckets.adapterMissingLow.join(", ") : ""}`);
  lines.push("");
  lines.push(`Procurement-gated (connect on a signed deal, not before):  ${buckets.procurementGated.length}${buckets.procurementGated.length ? "  ✓  " + buckets.procurementGated.join(", ") : ""}`);
  lines.push(`Blocked on an operator decision (key / budget):            ${buckets.blockedOperatorDecision.length}${buckets.blockedOperatorDecision.length ? "  ⏸  " + buckets.blockedOperatorDecision.join(", ") : ""}`);
  lines.push(`Superseded tombstones (kept so they can't silently return): ${buckets.superseded.length}${buckets.superseded.length ? "  ✓  " + buckets.superseded.join(", ") : ""}`);
  lines.push(`Chat-supervisory only (operator-side, never subprocess):  ${buckets.chatSupervisoryOnly.length}`);
  lines.push(`Needs investigation (underspecified vendor):              ${buckets.needsInvestigation.length}${buckets.needsInvestigation.length ? "  ⚠  " + buckets.needsInvestigation.join(", ") : ""}`);
  if (buckets.other.length) {
    lines.push(`Other (unclassified):                                     ${buckets.other.length}  ⚠  ${buckets.other.join(", ")}`);
  }
  lines.push("");
  lines.push("--- Registry ↔ tool-prefetch-map.json cross-check ---");
  lines.push(`Roles in registry: ${crosscheck.registryRoles.join(", ") || "(none)"}`);
  lines.push(`Roles in prefetch: ${crosscheck.prefetchRoles.join(", ") || "(none)"}`);
  if (crosscheck.exemptRoles.length) {
    lines.push(`Prefetch-exempt by design (consume upstream output, fetch nothing): ${crosscheck.exemptRoles.join(", ")} ✓`);
  }
  if (crosscheck.rolesInRegistryNotPrefetch.length) {
    lines.push(`  ⚠  Roles bound in registry but absent from prefetch: ${crosscheck.rolesInRegistryNotPrefetch.join(", ")}`);
  }
  if (crosscheck.rolesInPrefetchNotRegistry.length) {
    lines.push(`  ⚠  Roles in prefetch but never referenced in registry: ${crosscheck.rolesInPrefetchNotRegistry.join(", ")}`);
  }
  if (crosscheck.toolsInPrefetchNotRegistry.length) {
    lines.push(`  ⚠  Tools in prefetch but not declared in any registry entry's tools[]:`);
    for (const t of crosscheck.toolsInPrefetchNotRegistry) {
      lines.push(`        - ${t}`);
    }
  } else {
    lines.push(`Prefetch tool coverage: all ${crosscheck.prefetchTools.length} prefetch tools are referenced in registry ✓`);
  }
  lines.push("");
  lines.push("Audit exit: 0 (read-only audit always exits 0; drift is informational not failing).");
  return lines.join("\n");
}

function nextTicketId(existingContent) {
  const dateStr = todayCompact();
  const pattern = new RegExp(`FEAT-${dateStr}-(\\d{3})`, "g");
  let maxN = 0;
  let m;
  while ((m = pattern.exec(existingContent)) !== null) {
    const n = parseInt(m[1], 10);
    if (n > maxN) maxN = n;
  }
  return `FEAT-${dateStr}-${String(maxN + 1).padStart(3, "0")}`;
}

function ticketAlreadyExists(existingContent, connectorId) {
  const tag = `connector-id: ${connectorId}`;
  return existingContent.includes(tag);
}

function renderTicket(id, registry, ticketId) {
  const entry = registry.connectors[id];
  const lines = [];
  lines.push(`## [${ticketId}] adapter-missing`);
  lines.push("");
  lines.push(`**Logged**: ${new Date().toISOString()}`);
  lines.push(`**Priority**: ${entry.adapter_priority === "high" ? "high" : entry.adapter_priority === "medium" ? "medium" : "low"}`);
  lines.push("**Status**: pending");
  lines.push("**Area**: backend");
  lines.push("");
  lines.push("### Summary");
  lines.push(`Build subprocess adapter for ${id} (currently claude-host-mcp only; invisible to run-workflow.js).`);
  lines.push("");
  lines.push("### Details");
  lines.push(`Connector \`${id}\` is bound in \`config/connector-registry.json\` to roles ${(entry.bound_roles || []).join(", ") || "(none)"} and workflow steps ${(entry.bound_workflow_steps || []).map(s => `${s.workflow_template_id}#${s.step_id}`).join(", ") || "(none)"}, but has \`adapter_status: missing\` — it is reachable only at the Claude-host level and cannot be called from \`run-workflow.js\` subprocess. Business value: ${entry.business_value}. Purpose: ${entry.purpose}`);
  lines.push("");
  lines.push("### Suggested Action");
  lines.push(`Scaffold adapter at \`${entry.suggested_adapter_path}\` following the \`openclaw-bridge/mcp/chembl-mcp/\` pattern (index.js + schema.js + tool-descriptions.js). Wire into \`config/tool-prefetch-map.json\` for the roles listed above. Add health check: ${entry.health_check}.`);
  lines.push("");
  lines.push("### Metadata");
  lines.push("- Source: connector-registry-audit");
  lines.push(`- Related Files: config/connector-registry.json, config/tool-prefetch-map.json, ${entry.suggested_adapter_path}`);
  lines.push(`- Tags: connector, adapter, mcp, ${entry.business_value}`);
  lines.push(`- connector-id: ${id}`);
  lines.push(`- tool-prefix: ${entry.tool_prefix}`);
  lines.push("");
  return lines.join("\n");
}

function maybeWriteDriftTickets(registry, buckets) {
  const candidates = [...buckets.adapterMissingHigh, ...buckets.adapterMissingMedium];
  if (candidates.length === 0) {
    console.log("\nNo high/medium-priority adapter gaps — no drift tickets to write.");
    return;
  }

  let existing = "";
  let fileExisted = false;
  try {
    existing = fs.readFileSync(FEATURE_REQUESTS_PATH, "utf8");
    fileExisted = true;
  } catch (e) {
    existing = "# Feature Requests\n\nTracked by audit-connector-coverage.js and operator notes.\n\n";
  }

  const newTickets = [];
  let currentContent = existing;
  for (const id of candidates) {
    if (ticketAlreadyExists(currentContent, id)) {
      console.log(`  skip (ticket already exists): ${id}`);
      continue;
    }
    const ticketId = nextTicketId(currentContent);
    const block = renderTicket(id, registry, ticketId);
    newTickets.push({ id, ticketId, block });
    currentContent = currentContent + block + "\n";
  }

  if (newTickets.length === 0) {
    console.log("\nAll high/medium adapter gaps already have tickets — no new tickets needed.");
    return;
  }

  if (dryRun) {
    console.log(`\n--- DRY RUN: would write ${newTickets.length} new ticket(s) to ${FEATURE_REQUESTS_PATH} ---\n`);
    for (const t of newTickets) console.log(t.block);
    console.log("--- END DRY RUN (no file written) ---");
    return;
  }

  if (!fs.existsSync(LEARNINGS_DIR)) fs.mkdirSync(LEARNINGS_DIR, { recursive: true });
  fs.writeFileSync(FEATURE_REQUESTS_PATH, currentContent, "utf8");
  console.log(`\nWrote ${newTickets.length} ticket(s) to ${FEATURE_REQUESTS_PATH}${fileExisted ? "" : " (created)"}.`);
  for (const t of newTickets) console.log(`  ✓ ${t.ticketId}  ${t.id}`);
}

function main() {
  const registry = loadJson(REGISTRY_PATH);
  const prefetch = loadJson(PREFETCH_PATH);
  const buckets = classify(registry);
  const crosscheck = crossCheckPrefetch(registry, prefetch);
  console.log(renderReport(registry, buckets, crosscheck));
  if (writeDriftTickets) {
    maybeWriteDriftTickets(registry, buckets);
  }
  process.exit(0);
}

main();
