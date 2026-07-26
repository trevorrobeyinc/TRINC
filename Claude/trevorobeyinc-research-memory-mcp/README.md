# trevorobeyinc-research-memory-mcp

Long-term vector memory of Trevorobeyinc research packs. Stdio MCP server backed by Qdrant + in-process `nomic-embed-text-v1` ONNX embeddings (via `@xenova/transformers`).

## Architecture

Full design spec: [/Users/myhome/.claude/plans/trevorobeyinc-research-memory-mcp.md](/Users/myhome/.claude/plans/trevorobeyinc-research-memory-mcp.md)

## Tools exposed

| Tool | Direction | Purpose |
|---|---|---|
| `pack_ingest` | write | Embed + store a completed research pack (idempotent on content hash) |
| `pack_search` | read | Hybrid semantic + metadata search across all packs |
| `pack_related` | read | Find conceptually adjacent prior packs to a given `pack_id` |
| `pack_list` | read | Metadata-only listing with filters / sort / pagination |
| `pack_diff` | read | Section-keyed comparison of two packs (returns skeleton, not full bodies) |
| `pack_get_section` | read | Lazy-fetch the body of a single section (companion to `pack_diff`) |

## Quick start

```
npm install
npm run build
npm test
npm run mcp     # start stdio MCP server
```

## Environment

| Var | Default | Purpose |
|---|---|---|
| `QDRANT_URL` | `https://127.0.0.1:6433` | Qdrant REST endpoint via TLS proxy (upstream `http://127.0.0.1:6333`) |
| `QDRANT_COLLECTION` | `trevorobeyinc-packs` | Target collection |
| `EMBED_MODEL` | `Xenova/nomic-embed-text-v1` | HuggingFace model id (Xenova-quantized ONNX) |
| `LOG_FILE` | `~/Claude/.logs/research-memory.log` | JSON line log |
| `SECTION_HEADING_LEVEL` | `2` | H-level used by `pack_diff` section parser |

## Registering with Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` → `mcpServers`:

```json
"trevorobeyinc-research-memory": {
  "command": "/Users/myhome/.nvm/versions/node/v22.13.1/bin/node",
  "args": ["/Users/myhome/TrevClaw-Obsidianodus/Claude/trevorobeyinc-research-memory-mcp/dist/index.js"],
  "env": {
    "QDRANT_URL": "https://127.0.0.1:6433",
    "QDRANT_COLLECTION": "trevorobeyinc-packs",
    "EMBED_MODEL": "Xenova/nomic-embed-text-v1",
    "LOG_FILE": "/Users/myhome/TrevClaw-Obsidianodus/Claude/.logs/research-memory.log"
  }
}
```

## Status

**Scaffold only.** Tool implementations queued for the next session. See the plan file's "Implementation effort estimate" section for the work breakdown.
