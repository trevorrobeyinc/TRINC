# trevorobeyinc-research-memory-mcp

Long-term vector memory of Trevorobeyinc research packs. Stdio MCP server backed by Qdrant + in-process `nomic-embed-text-v1` ONNX embeddings (via `@huggingface/transformers`, `dtype: "q8"`; it was `@xenova/transformers` 2.x until 2026-11-01).

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
npm run parity  # read-only: re-embed each pack's source, compare with its stored vector
```

## Model cache and the parity check

The embedder is offline by default: it reads the model from `EMBED_CACHE_DIR` (default
`~/.cache/trevorobeyinc-research-memory/transformers/`, outside `node_modules`, so `npm ci` cannot delete
it) and fails with `EMBED_MODEL_NOT_CACHED` rather than downloading. Only an operator run with
`EMBED_ALLOW_REMOTE=1` may fetch it. The layout is the one `@xenova/transformers` used inside
`node_modules/@xenova/transformers/.cache/`, so copying that folder fills the new cache.

`npm run parity` scrolls the collection read-only. For each pack whose source file is still readable
and still hashes to its stored `content_sha256`, it re-embeds the text and compares it with the stored
vector (`--min`, default 0.999; `--json` for machine output). It exits 0 on PASS, 1 on drift or when
nothing was comparable, and 2 when Qdrant or the model is unreachable.

## Environment

| Var | Default | Purpose |
|---|---|---|
| `QDRANT_URL` | `https://127.0.0.1:6433` | Qdrant REST endpoint via TLS proxy (upstream `http://127.0.0.1:6333`) |
| `QDRANT_COLLECTION` | `trevorobeyinc-packs` | Target collection |
| `EMBED_MODEL` | `Xenova/nomic-embed-text-v1` | HuggingFace model id (Xenova-quantized ONNX) |
| `EMBED_CACHE_DIR` | `~/.cache/trevorobeyinc-research-memory/transformers` | Model cache (outside `node_modules`) |
| `EMBED_ALLOW_REMOTE` | unset | `1` only for the operator's one-time model fetch |
| `LOG_FILE` | `~/Claude/.logs/research-memory.log` | JSON line log |
| `SECTION_HEADING_LEVEL` | `2` | H-level used by `pack_diff` section parser |

## Registering with Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` → `mcpServers`:

```json
"trevorobeyinc-research-memory": {
  "command": "/Users/myhome/.nvm/versions/node/v22.13.1/bin/node",
  "args": ["/Users/myhome/TRINC/Claude/trevorobeyinc-research-memory-mcp/dist/index.js"],
  "env": {
    "QDRANT_URL": "https://127.0.0.1:6433",
    "QDRANT_COLLECTION": "trevorobeyinc-packs",
    "EMBED_MODEL": "Xenova/nomic-embed-text-v1",
    "LOG_FILE": "/Users/myhome/TRINC/Claude/.logs/research-memory.log"
  }
}
```

## Status

**Scaffold only.** Tool implementations queued for the next session. See the plan file's "Implementation effort estimate" section for the work breakdown.
