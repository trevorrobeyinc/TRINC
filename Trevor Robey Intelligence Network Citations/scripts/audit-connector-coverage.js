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
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const REGISTRY_PATH = path.join(ROOT, "config", "connector-registry.json");
const PREFETCH_PATH = path.join(ROOT, "config", "tool-prefetch-map.json");
const PLUGIN_BINDINGS_PATH = path.join(ROOT, "config", "plugin-bindings.json");
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

function renderReport(registry, buckets, crosscheck, extraSections = []) {
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
  for (const l of extraSections) lines.push(l);
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

// --- Plugin surfaces -------------------------------------------------------
// A plugin is not a connector: it is a bundle of skills plus (usually) MCP servers.
// The skills work unauthenticated; only the MCP servers need OAuth. What actually
// breaks a plugin here is an UNRESOLVED `~~category` placeholder — a skill handed a
// missing tool invents a plausible substitute. So this section audits binding
// coverage, not connectivity.
function auditPluginSurfaces(registry, prefetch) {
  const lines = [];
  lines.push("");
  lines.push("--- Plugin surfaces (config/plugin-bindings.json) ---");

  const surfaces = registry.plugin_surfaces;
  if (!surfaces) {
    lines.push("  ⚠  Registry has no plugin_surfaces block — plugins are unrecorded.");
    return lines;
  }

  let bindings;
  try {
    bindings = loadJson(PLUGIN_BINDINGS_PATH);
  } catch (e) {
    lines.push(`  ⚠  Cannot read ${path.relative(ROOT, PLUGIN_BINDINGS_PATH)}: ${e.message}`);
    lines.push("     The registry lists plugins but their category bindings are missing.");
    return lines;
  }

  const registryIds = (surfaces.plugins || []).map((p) => p.id).sort();
  const bindingIds = Object.keys(bindings.plugins || {}).sort();

  const byLane = {};
  for (const p of surfaces.plugins || []) {
    byLane[p.lane || "(unlaned)"] = (byLane[p.lane || "(unlaned)"] || 0) + 1;
  }
  lines.push(`Plugins bound: ${registryIds.length}   Lanes: ${Object.entries(byLane).sort().map(([l, n]) => `${l}=${n}`).join("  ")}`);

  // Per-plugin mcp_* figures are SLOT counts, not server counts: slack / notion /
  // atlassian / gmail / google calendar each appear in 7 plugins, so summing them
  // triples the apparent surface (97 slots vs 46 unique servers). Report slots as
  // slots, and derive the unique total from disk when the packages are reachable.
  const needsAuth = (surfaces.plugins || []).reduce((n, p) => n + (p.mcp_needs_auth || 0), 0);
  const connected = (surfaces.plugins || []).reduce((n, p) => n + (p.mcp_connected || 0), 0);
  lines.push(`Plugin MCP server SLOTS: ${connected} connected + ${needsAuth} awaiting OAuth = ${connected + needsAuth} (skills work regardless of auth)`);

  // 1. The two files must agree on which plugins exist.
  const onlyRegistry = registryIds.filter((id) => !bindingIds.includes(id));
  const onlyBindings = bindingIds.filter((id) => !registryIds.includes(id));
  if (onlyRegistry.length || onlyBindings.length) {
    if (onlyRegistry.length) lines.push(`  ⚠  In registry but unbound in plugin-bindings.json: ${onlyRegistry.join(", ")}`);
    if (onlyBindings.length) lines.push(`  ⚠  Bound in plugin-bindings.json but missing from registry: ${onlyBindings.join(", ")}`);
  } else {
    lines.push(`  ✓  Registry and plugin-bindings.json agree on all ${registryIds.length} plugins`);
  }

  // 2. Every category a plugin references must have a binding. An unresolved
  //    placeholder is the failure mode this whole layer exists to prevent.
  const catalog = bindings.category_bindings || {};
  const missingCats = [];
  for (const [id, p] of Object.entries(bindings.plugins || {})) {
    for (const cat of p.categories || []) {
      if (cat === "~~category") continue; // the generic self-reference in each CONNECTORS.md
      if (!catalog[cat]) missingCats.push(`${id}:${cat}`);
    }
  }
  if (missingCats.length) {
    lines.push(`  ⚠  Categories referenced by a plugin with NO binding: ${missingCats.join(", ")}`);
  } else {
    lines.push(`  ✓  Every category referenced by a plugin resolves (${Object.keys(catalog).length} bindings)`);
  }

  // 3. An unbound category must name a fallback or say NONE explicitly — silence
  //    is what lets a skill improvise.
  const bound = Object.entries(catalog).filter(([, c]) => c.bound);
  const unbound = Object.entries(catalog).filter(([, c]) => !c.bound);
  const silent = unbound.filter(([, c]) => !c.fallback && !/NONE|UNAUTHENTICATED/i.test(c.resolves_to || ""));
  lines.push(`Categories: ${bound.length} bound to a real tool, ${unbound.length} unbound (explicit NONE / awaiting auth)`);
  if (silent.length) {
    lines.push(`  ⚠  Unbound with neither a fallback nor an explicit NONE: ${silent.map(([k]) => k).join(", ")}`);
  } else {
    lines.push("  ✓  Every unbound category states NONE or names a fallback");
  }

  // 3b. Cross-file pointers must resolve. `registry_ids` and `duplicate_of_registry`
  //     name entries in THIS registry; a bare id that resolves nowhere is a dangling
  //     pointer into the file both documents call the binding authority. Bare ids mean
  //     registry entries; `plugin:`-prefixed ids mean plugin MCP servers and are not
  //     expected here. (A 2026-07-24 review caught `biorxiv` used where the registry key
  //     is `biorxiv-medrxiv` — silent precisely because nothing validated these arrays.)
  const knownIds = new Set([
    ...Object.keys(registry.connectors || {}),
    ...((registry.operator_surfaces && registry.operator_surfaces.surfaces) || []).map((s) => s.id),
  ]);
  const dangling = [];
  for (const [cat, c] of Object.entries(catalog)) {
    for (const rid of c.registry_ids || []) {
      if (rid.startsWith("plugin:")) continue;
      if (!knownIds.has(rid)) dangling.push(`${cat} -> ${rid}`);
    }
  }
  for (const p of surfaces.plugins || []) {
    for (const rid of p.duplicate_of_registry || []) {
      if (!knownIds.has(rid)) dangling.push(`${p.id}.duplicate_of_registry -> ${rid}`);
    }
  }
  if (dangling.length) {
    lines.push(`  ⚠  Dangling registry pointers (no such connector or operator surface): ${dangling.join(", ")}`);
  } else {
    lines.push("  ✓  Every registry_ids / duplicate_of_registry pointer resolves to a real registry entry");
  }

  // 4. No plugin MCP server may reach research prefetch — business-lane payloads
  //    are non-citable and would dilute the grounded-citation ratio.
  const prefetchRaw = JSON.stringify(prefetch);
  const leaked = /plugin[:_][a-z-]+[:_]/i.test(prefetchRaw);
  lines.push(leaked
    ? "  ⚠  A plugin-namespaced tool appears in tool-prefetch-map.json — business lane leaked into research prefetch"
    : "  ✓  No plugin MCP server present in tool-prefetch-map.json");

  // 4b. INLINE-DECLARED MCP SERVERS — the smuggling vector.
  //     Most plugins declare MCP servers in a sibling `.mcp.json`, but a plugin may also
  //     declare them inline under `mcpServers` in `.claude-plugin/plugin.json`. A plugin
  //     package is therefore a THIRD MCP registration surface, independent of
  //     ~/.claude.json and claude_desktop_config.json — removing a server from both of
  //     those does NOT remove it if a plugin re-declares it. Found 2026-07-28:
  //     desktop-commander had been removed from both host configs yet still shipped
  //     `npx -y @wonderwhy-er/desktop-commander@latest` (terminal + filesystem, outside
  //     the YubiKey/sudo-gate model) inline in its plugin.json. The original enumeration
  //     read only `.mcp.json`, so it recorded that plugin as having zero servers.
  //     Best-effort: the package root is session-scoped, so a miss is reported, not fatal.
  const pkgRoots = [];
  try {
    const base = path.join(os.homedir(), "Library", "Application Support", "Claude", "local-agent-mode-sessions");
    const walk = (dir, depth) => {
      if (depth > 3) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!e.isDirectory()) continue;
        const p = path.join(dir, e.name);
        if (e.name === "rpm") pkgRoots.push(p);
        else walk(p, depth + 1);
      }
    };
    if (fs.existsSync(base)) walk(base, 0);
  } catch (e) { /* best-effort discovery only */ }

  // Unique-server tally, so the slot count above can never be mistaken for a surface size.
  if (pkgRoots.length) {
    const uniq = new Set();
    for (const root of pkgRoots) {
      for (const d of fs.readdirSync(root)) {
        const mj = path.join(root, d, ".mcp.json");
        if (!fs.existsSync(mj)) continue;
        try {
          for (const s of Object.keys(JSON.parse(fs.readFileSync(mj, "utf8")).mcpServers || {})) uniq.add(s);
        } catch (e) { /* unreadable */ }
      }
    }
    if (uniq.size) lines.push(`Plugin MCP servers, UNIQUE across all plugins: ${uniq.size} (this is the real surface size)`);
  }

  if (!pkgRoots.length) {
    lines.push("  ·  Plugin packages not found on this machine — inline-MCP check skipped (not a failure)");
  } else {
    const inline = [];
    let scanned = 0;
    for (const root of pkgRoots) {
      for (const d of fs.readdirSync(root)) {
        const pj = path.join(root, d, ".claude-plugin", "plugin.json");
        if (!fs.existsSync(pj)) continue;
        scanned++;
        let meta;
        try { meta = JSON.parse(fs.readFileSync(pj, "utf8")); } catch (e) { continue; }
        for (const name of Object.keys(meta.mcpServers || {})) {
          const spec = meta.mcpServers[name] || {};
          const cmd = [spec.command, ...(spec.args || [])].filter(Boolean).join(" ");
          inline.push(`${meta.name} declares "${name}" inline (${cmd})`);
        }
      }
    }
    if (inline.length) {
      lines.push(`  ⚠  Plugin-INLINE MCP servers (a plugin re-registers these even after you remove them from the host configs): ${inline.join("; ")}`);
    } else {
      lines.push(`  ✓  No plugin declares an MCP server inline in plugin.json (${scanned} packages scanned)`);
    }
  }

  // 4c. GATE-SHADOWING — a plugin shipping a server whose NAME matches a host-registered
  //     server. Plugin servers are namespaced (mcp__plugin_<plugin>_<server>__*) and never
  //     shadow the host one (mcp__<server>__*), so the two COEXIST: the plugin's copy is a
  //     parallel path to the same third party, with none of the host wrapper's protections.
  //     Found 2026-07-28: the engineering plugin ships `github` -> api.githubcopilot.com
  //     (plain HTTP OAuth) while ~/.claude.json's `github` is github-mcp-keychain-wrapper.sh
  //     (YubiKey-sealed PAT, fail-closed arm, per-unseal PIN+touch, --read-only, Falcon-FIM'd).
  //     Authorizing the plugin copy would stand up a bypass of that gate. Same shape as the
  //     desktop-commander inline-MCP finding: a plugin re-providing a deliberately gated surface.
  try {
    const hostCfg = path.join(os.homedir(), ".claude.json");
    if (fs.existsSync(hostCfg) && pkgRoots.length) {
      const hostServers = Object.keys(JSON.parse(fs.readFileSync(hostCfg, "utf8")).mcpServers || {});
      const shadows = [];
      let inertShadows = 0;
      for (const root of pkgRoots) {
        for (const d of fs.readdirSync(root)) {
          const mj = path.join(root, d, ".mcp.json");
          const pj = path.join(root, d, ".claude-plugin", "plugin.json");
          if (!fs.existsSync(mj) || !fs.existsSync(pj)) continue;
          let pname, servers;
          try {
            pname = JSON.parse(fs.readFileSync(pj, "utf8")).name;
            servers = Object.keys(JSON.parse(fs.readFileSync(mj, "utf8")).mcpServers || {});
          } catch (e) { continue; }
          // Only a REACHABLE shadow is a finding. Most plugins ship `gmail` and
          // `google calendar` as `{"type":"http","url":""}` — unfilled placeholders
          // the template expects a deployment to populate. Flagging those would fire
          // 7 false alarms here and train the reader to ignore the check, so they are
          // counted quietly instead. Verified 2026-07-28: of 15 name-collisions, 14
          // are empty-url placeholders and exactly one (engineering/github) is live.
          for (const s of servers) {
            if (!hostServers.includes(s)) continue;
            const spec = (JSON.parse(fs.readFileSync(mj, "utf8")).mcpServers || {})[s] || {};
            const reachable = Boolean(spec.command) || Boolean(spec.url);
            if (reachable) shadows.push({ plugin: pname, server: s });
            else inertShadows++;
          }
        }
      }
      if (shadows.length) {
        // Deny rules are cumulative across scopes, so check BOTH: the user-global
        // settings and this repo's own .claude/settings.json. The repo copy is the
        // one that is version-controlled and survives a global settings reset —
        // ~/.claude/settings.json is outside the repo and no commit can protect it.
        const scopes = [
          { label: "user (~/.claude/settings.json)", file: path.join(os.homedir(), ".claude", "settings.json") },
          { label: "repo (.claude/settings.json)", file: path.join(ROOT, "..", ".claude", "settings.json") },
        ];
        const denyIn = {};
        for (const sc of scopes) {
          try {
            denyIn[sc.label] = (JSON.parse(fs.readFileSync(sc.file, "utf8")).permissions || {}).deny || [];
          } catch (e) { denyIn[sc.label] = []; }
        }
        for (const sh of shadows) {
          const want = `mcp__plugin_${sh.plugin}_${sh.server}__*`;
          const covering = Object.keys(denyIn).filter((k) => denyIn[k].includes(want));
          if (!covering.length) {
            lines.push(`  ⚠  GATE SHADOW UNCONTAINED: plugin "${sh.plugin}" ships "${sh.server}", which also exists as a host MCP server — add "${want}" to permissions.deny`);
          } else {
            lines.push(`  ✓  Gate-shadow contained: plugin "${sh.plugin}" ships its own "${sh.server}" alongside the host one; ${want} denied in ${covering.length} scope(s): ${covering.join(" + ")}`);
            if (!covering.some((k) => k.startsWith("repo"))) {
              lines.push(`     ·  only the user-global scope carries it — add it to the repo's .claude/settings.json too so it is version-controlled`);
            }
          }
        }
      } else {
        lines.push("  ✓  No plugin ships a REACHABLE MCP server whose name collides with a host-registered one");
      }
      if (inertShadows) {
        lines.push(`  ·  ${inertShadows} further name-collisions are inert placeholders (empty url) — no action needed unless a plugin update fills one in`);
      }
    }
  } catch (e) { /* best-effort */ }

  // 5. Installed-but-unbound plugins are decisions; both files should say so.
  const regNotBound = (surfaces.installed_not_bound || []).map((p) => p.id).sort();
  const bindNotBound = Object.keys((bindings.installed_not_bound || {}).plugins || {}).sort();
  if (regNotBound.join(",") !== bindNotBound.join(",")) {
    lines.push(`  ⚠  installed_not_bound disagrees — registry: [${regNotBound.join(", ")}] vs bindings: [${bindNotBound.join(", ")}]`);
  } else if (regNotBound.length) {
    lines.push(`Installed but deliberately NOT bound (recorded decision): ${regNotBound.join(", ")} ✓`);
  }

  // 6. Removed plugins are tombstones — a removal that silently reverses is the
  //    failure mode they exist to catch, so re-check that each is really gone.
  const removedIds = (surfaces.removed || []).map((p) => p.id).sort();
  const bindRemoved = Object.keys((bindings.removed || {}).plugins || {}).sort();
  if (removedIds.join(",") !== bindRemoved.join(",")) {
    lines.push(`  ⚠  removed-plugin tombstones disagree — registry: [${removedIds.join(", ")}] vs bindings: [${bindRemoved.join(", ")}]`);
  } else if (removedIds.length) {
    const resurrected = [];
    for (const root of pkgRoots) {
      for (const d of fs.readdirSync(root)) {
        const pj = path.join(root, d, ".claude-plugin", "plugin.json");
        if (!fs.existsSync(pj)) continue;
        try {
          const n = JSON.parse(fs.readFileSync(pj, "utf8")).name;
          if (removedIds.includes(n)) resurrected.push(n);
        } catch (e) { /* unreadable package */ }
      }
    }
    lines.push(resurrected.length
      ? `  ⚠  REMOVED plugin is back on disk: ${resurrected.join(", ")} — uninstall again via the Claude Desktop plugin UI`
      : `Removed plugins (tombstoned, verified still absent): ${removedIds.join(", ")} ✓`);
  }

  return lines;
}

function main() {
  const registry = loadJson(REGISTRY_PATH);
  const prefetch = loadJson(PREFETCH_PATH);
  const buckets = classify(registry);
  const crosscheck = crossCheckPrefetch(registry, prefetch);
  console.log(renderReport(registry, buckets, crosscheck, auditPluginSurfaces(registry, prefetch)));
  if (writeDriftTickets) {
    maybeWriteDriftTickets(registry, buckets);
  }
  process.exit(0);
}

main();
