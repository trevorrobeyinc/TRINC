# Copilot MCP Integration Guide

> **Status: IMPLEMENTED** -- Zero modifications to existing Copilot code. Disabled by default.

## Overview

The Medical Zettelkasten MCP enhances the existing Copilot MCP's Zettelkasten commands with graph-powered analysis when processing biomedical content from your Obsidian vault.

## Implementation Details

### Copilot-Side Files

| File | Purpose |
|------|---------|
| `tools/zettelkasten-graph-enhancer.mjs` | ESM module that spawns the Medical Zettelkasten MCP as a subprocess and exposes all 10 tools to the Copilot bridge |
| `configs/zettelkasten-graph-enhancer.json` | Configuration file. **Disabled by default** -- set `"enabled": true` to activate |

### MCP Server Entry

`.mcp.json` includes a `zettelkasten-graph` server entry that exposes all 10 Medical Zettelkasten tools to Claude. When the server is active, Claude can invoke any tool (find_gaps, break_echo_chamber, cross_domain_connect, etc.) directly during a conversation.

### Architecture

- `tools/zettelkasten-graph-enhancer.mjs` is a standalone ESM module that spawns the Medical Zettelkasten MCP as a child process
- Communication happens over stdio using the MCP protocol
- The subprocess is managed independently -- no modifications to any existing Copilot source files were required
- All 10 tools are registered and available when the enhancer is enabled

## Configuration

Edit `configs/zettelkasten-graph-enhancer.json` to enable:

```json
{
  "enabled": true
}
```

## Output Format

The Obsidian formatter produces:
- `[[wikilinks]]` for every concept node
- Dataview properties: `relationship:: [[Target]]`
- Tag suggestions: `#feedback-loop`, `#hub-spoke`, etc.
- MOC-compatible structure with hierarchical sections

## Demo

```bash
node scripts/demo-copilot-pipeline.js
```

Demonstrates: Obsidian note -> graph analysis -> Obsidian-formatted output with wikilinks and suggestions.

## Tests

10 unit tests in `tools/zettelkasten-graph-enhancer.test.mjs` covering subprocess lifecycle, tool registration, all 10 tool invocations, error handling, and config-disabled behavior.
