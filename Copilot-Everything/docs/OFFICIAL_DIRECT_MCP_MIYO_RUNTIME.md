# Official Direct MCP + Miyo Runtime

Date: 2026-03-22

## Target Runtime

The official Obsidian `copilot` plugin in `My Digital Garden` now targets this runtime path:

- hosted/Copilot model for chat and agent behavior
- `direct_plugin_mcp` inside the official plugin
- shared HTTP MCP server at `https://127.0.0.1:8798` for tool execution
- native Miyo via HTTPS proxy at `https://127.0.0.1:8743` (upstream `http://127.0.0.1:8742`) for semantic retrieval

The emulator is not part of the intended runtime architecture for the official plugin. If it remains installed locally, treat it as rollback-only.

## Operational Commands

Apply the official-plugin cutover:

```bash
/Users/trevorrobey/THE\ Copilot\ in\ Obsidian\ Everything/scripts/official-plugin-direct-mcp-cutover.sh
```

Enable controlled write support in the official plugin:

```bash
/Users/trevorrobey/THE\ Copilot\ in\ Obsidian\ Everything/scripts/official-plugin-enable-write-mcp.sh
```

If the installed official `copilot` build does not expose MCP tools at runtime, overlay the MCP-capable local runtime into the official plugin slot:

```bash
/Users/trevorrobey/THE\ Copilot\ in\ Obsidian\ Everything/scripts/deploy-mcp-runtime-to-official-plugin.sh
```

Probe `miyo mcp` from the terminal:

```bash
/Users/trevorrobey/THE\ Copilot\ in\ Obsidian\ Everything/scripts/miyo-mcp-probe.sh
```

Validate the official plugin direct path:

```bash
/Users/trevorrobey/THE\ Copilot\ in\ Obsidian\ Everything/scripts/official-plugin-miyo-check.sh
```

Validate a hosted `copilot_plus` turn that calls the shared HTTP MCP server with no emulator route:

```bash
/Users/trevorrobey/THE\ Copilot\ in\ Obsidian\ Everything/scripts/official-plugin-direct-chat-check.sh
```

Validate the controlled write path with prompt-on-write confirmation:

```bash
/Users/trevorrobey/THE\ Copilot\ in\ Obsidian\ Everything/scripts/official-plugin-write-check.sh
```

Run a full force reindex through the official plugin against the Miyo backend:

```bash
/Users/trevorrobey/THE\ Copilot\ in\ Obsidian\ Everything/scripts/official-plugin-force-reindex.sh
```

## Notes

- Miyo service discovery uses the local `service.json` file and falls back to `https://127.0.0.1:8743` (TLS proxy; upstream `http://127.0.0.1:8742`).
- The shared MCP server is now write-capable for the official plugin, with `prompt_on_writes` as the guardrail.
- When `enableAutonomousAgent` is on, the official plugin also needs the runtime MCP tool ids in `autonomousAgentEnabledToolIds`; configuring `mcp.servers[]` alone is not enough for hosted agent turns to use those tools.
- Ollama remains a separate follow-up validation; it is not required for the hosted/Copilot direct-MCP cutover.
- Official plugin write validation currently leaves a timestamped note under `copilot-mcp/validation/` so the create/append/readback artifact is inspectable after the run.
- In this workspace, Raycast prompt execution uses the shared HTTP MCP bridge directly for `execute_command`.
- In this workspace, Raycast active-note summarize is the one deliberate Raycast-side exception: it restores Obsidian focus and invokes the local Obsidian CLI command ids directly so whole-note rewrite behavior stays tied to the real active editor state.
- In this workspace, Raycast PDF and video summaries use backend-first `/v1/self-host/agent-turn` flows with local Raycast AI fallback only if backend summary generation fails, and note writes stay routed through the shared bridge MCP path (CLI-backed when this was written; REST-backed — Obsidian Local REST API `:27124` — since 2026-05-09).
