# OpenClaw Integration Guide

> **Status: IMPLEMENTED** -- Wired into OpenClaw Phase 34 agentic tool-call loop. Disabled by default.

## Overview

The Medical Zettelkasten MCP enhances OpenClaw's biomedical research pipeline with graph-powered structural analysis. Agents can discover blind spots, cross-domain connections, and novel hypotheses that pure ToolUniverse querying might miss.

## Implementation Details

### OpenClaw-Side Files

All integration code lives in the OpenClaw repo under `openclaw-bridge/mcp/zettelkasten-mcp/` (4 modules):

| Module | Purpose |
|--------|---------|
| `schema.js` | Zod schemas for Zettelkasten tool inputs/outputs |
| `process-manager.js` | Manages the Medical Zettelkasten MCP subprocess lifecycle |
| `mcp.js` | MCP wrapper -- translates tool calls to/from the subprocess |
| `tool-descriptions.js` | Tool metadata exposed to the agentic loop and prompt construction |

### Routing

`openclaw-bridge/core/composite-tool-executor.js` routes tool calls. When an agent emits a `<tool_call>` targeting a Zettelkasten tool, the composite executor delegates to the Zettelkasten MCP wrapper rather than the ToolUniverse SMCP adapter.

### Configuration

`config/zettelkasten-integration.json` controls the integration. **Disabled by default** -- set `"enabled": true` to activate.

### Wiring into Workflows

The integration is wired into `_workflow-runtime.js` via late-binding `configureToolCallLoop()` on the agent engine. When the Zettelkasten integration is enabled in config, the workflow runtime registers Zettelkasten tools alongside ToolUniverse tools in the agentic loop, making them available to any enabled agent role.

> **Note (runtime seams added by the citation-integrity / corpora work):** `_workflow-runtime.js` now also exposes the `ctgovSupplemental` and `crossrefRetraction` instances on `researchRuntime`. The stopped-trial corpus fetcher is routed into role prefetch through a local-fetcher seam in `tool-prefetch.js` (`createToolPrefetch` `options.localFetchers`), registered under tool_name `ctgov_stopped_trials`. This runs alongside the ToolUniverse SMCP path and the Zettelkasten wrapper — Zettelkasten routing is unchanged.

## Usage

### Post-Workflow CLI

Run Zettelkasten analysis on completed workflow output:

```bash
node scripts/analyze-workflow-output.js --workflow-id <id> --tools full_zettelkasten_analysis --confirm
```

### Mid-Task Tool Calls (Phase 34 Agentic Loop)

With the agentic tool-call loop enabled, agents can invoke Medical Zettelkasten tools mid-task via the `<tool_call>` XML protocol:

```xml
<tool_call>
{"tool_name": "medical_zettelkasten", "arguments": {"tool": "find_gaps", "text": "...", "input_type": "tooluniverse_json"}}
</tool_call>
```

The agent receives the result inline and continues reasoning -- no manual intervention required.

## Role-to-Tool Mapping

| OpenClaw Role | Recommended Tools |
|---|---|
| scout | analyze_network, detect_clusters |
| analyst | find_gaps, break_echo_chamber, link_semantically |
| literature_reviewer | full_zettelkasten_analysis |
| molecular_profiler | cross_domain_connect, rescue_orphans |
| safety_signal_detector | break_echo_chamber, find_gaps |
| competitive_intel_analyst | measure_diversity, detect_clusters |

## Workflow

1. Agent pre-fetches ToolUniverse data (existing `tool-prefetch.js`); a local-fetcher seam in the same module can additionally pull the stopped-trial corpus (`ctgov_stopped_trials`)
2. Agent calls Zettelkasten tools via `<tool_call>` or post-workflow CLI
3. Graph analysis identifies gaps and connections
4. Agent uses gap insights to refine next ToolUniverse queries
5. Repeat until coverage is sufficient

## Tests

25 unit tests in `tests/core/phase34-zettelkasten-integration.test.js` covering schema validation, routing, subprocess lifecycle, and end-to-end tool-call round-trips.
