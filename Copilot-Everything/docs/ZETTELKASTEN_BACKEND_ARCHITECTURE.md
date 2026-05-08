# Zettelkasten Backend Architecture

> **Created**: 2026-03-29
> **Updated**: 2026-03-30 — Migrated off deprecated Miyo v4 endpoints
> **Status**: Implemented (Phase 1-3) + Miyo v4 migration complete
> **Layer**: Backend emulator (port 8789)

---

## Overview

Five Zettelkasten commands are implemented as backend-native capabilities in the emulator's `ZettelkastenService`. Each command orchestrates direct vault filesystem access, Miyo semantic search, and LLM calls to produce vault-grounded analysis — unlike the original prompt-only versions which relied solely on the LLM's training data.

### Miyo v4 Migration (2026-03-30)

Miyo v4 deprecated three index endpoints (`/v0/index/files`, `/v0/index/stats`, `/v0/index/documents` — all return 501). The Zettelkasten backend now uses a hybrid approach:

- **Vault filesystem** (`VaultFileSystem`) — Direct disk access for file listing, content reading, and wikilink extraction. 60-second TTL cache on the file list.
- **Qdrant** (`QdrantScrollClient`) — Direct HTTP to local Qdrant (port 6333, collection `miyo`) as a fallback for chunk retrieval when filesystem reads fail.
- **Miyo search** (`/v0/search`, `/v0/search/related`) — Still used for semantic similarity queries. These endpoints are unaffected by the v4 deprecation.

## Endpoints

All endpoints are under `POST /v1/self-host/zettelkasten/*` and require `Authorization: Bearer <SELF_HOST_API_KEY>`.

| Endpoint | Command | Description |
|---|---|---|
| `/serendipity` | Serendipity Generator | Surface unexpected connections, "On This Day", random catalysts |
| `/cross-domain` | Cross-Domain Connector | Identify structural isomorphisms across knowledge domains |
| `/echo-chamber` | Echo Chamber Breaker | Challenge assumptions with vault-grounded counterarguments |
| `/semantic-linker` | Semantic Linker | Classify typed relationships with Dataview syntax output |
| `/orphan-rescue` | Orphan Rescuer | Single-note or batch vault-wide orphan detection + rescue |
| `/health` | Vault Health | Connectivity metrics: orphan ratio, avg links, staleness |
| `/pipeline` | Pipeline Composition | Chain up to 5 commands sequentially with output forwarding |

## Request Schema

```json
{
  "notePath": "Ideas/Emergence.md",
  "noteContent": "...",
  "vault": "My Digital Garden",
  "model": { "key": "...", "name": "...", "provider": "lm-studio", "baseUrl": "..." },
  "options": {
    "limit": 10,
    "batchMode": false,
    "writeReport": false
  }
}
```

- `notePath` or `noteContent` — at least one required (except for health/batch)
- `vault` — defaults to `MIYO_DEFAULT_VAULT` or `DEFAULT_VAULT_NAME` from env
- `model` — optional, defaults to LM Studio qwen2.5-coder-7b-instruct
- `options.batchMode` — orphan-rescue only; triggers vault-wide scan

## Response Schema

```json
{
  "ok": true,
  "command": "serendipity",
  "content": "# Serendipity Analysis\n...",
  "suggestions": [
    {
      "targetNote": "Ideas/Feedback Loops.md",
      "wikilink": "[[Ideas/Feedback Loops]]",
      "rationale": "...",
      "relationship": "supports",
      "confidence": 0.85
    }
  ],
  "relationships": [...],
  "healthScore": {...},
  "metadata": {
    "durationMs": 4200,
    "notesAnalyzed": 15,
    "miyoQueries": 6,
    "llmCalls": 2,
    "filesScanned": 643,
    "vault": "My Digital Garden"
  }
}
```

## Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  routes/zettelkasten.ts                                     │
│  7 Fastify POST handlers                                    │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────┐
│  services/ZettelkastenService.ts                            │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │ serendipity  │  │ crossDomain  │  │ echoChamber        │ │
│  │ semanticLink │  │ orphanRescue │  │ vaultHealth        │ │
│  │ pipeline     │  │              │  │                    │ │
│  └──────┬──────┘  └──────┬───────┘  └─────────┬──────────┘ │
│         │                │                     │            │
│  ┌──────▼────────────────▼─────────────────────▼──────────┐ │
│  │ Shared Helpers                                         │ │
│  │ extractConcepts, buildLinkGraph, resolveNoteContent,   │ │
│  │ miyoSearch, miyoSearchRelated, selectRandomNotes,      │ │
│  │ findOnThisDay, classifyByDomain,                       │ │
│  │ inferTransitiveRelationships                           │ │
│  └──┬──────────────┬───────────────────┬──────────────────┘ │
└─────┼──────────────┼───────────────────┼────────────────────┘
      │              │                   │
┌─────▼─────┐ ┌─────▼──────┐   ┌───────▼───────┐
│ VaultFile │ │ ModelGatwy │   │ MiyoCompat    │
│ System    │ │ (LLM calls)│   │ Client        │
│ (disk)    │ │            │   │ (search only) │
└─────┬─────┘ └────────────┘   └───────────────┘
      │
┌─────▼──────────┐
│ QdrantScroll   │
│ Client         │
│ (fallback)     │
└────────────────┘
```

## MCP Bridge Integration

The six commands are also available as MCP tools via the emulator's agent-turn orchestration:

| MCP Tool Name | Routes to |
|---|---|
| `zettelkasten_serendipity` | `ZettelkastenService.serendipity()` |
| `zettelkasten_cross_domain` | `ZettelkastenService.crossDomain()` |
| `zettelkasten_echo_chamber` | `ZettelkastenService.echoChamber()` |
| `zettelkasten_semantic_linker` | `ZettelkastenService.semanticLinker()` |
| `zettelkasten_orphan_rescue` | `ZettelkastenService.orphanRescue()` |
| `zettelkasten_vault_health` | `ZettelkastenService.vaultHealth()` |

These are auto-injected by `ToolRouter` when Zettelkasten intent is detected in user messages (keywords: "zettelkasten", "orphan", "serendipity", "knowledge graph", etc.).

Routing: `McpOrchestrator.executeToolCall()` detects `serverId: "zettelkasten-internal"` and delegates to `ZettelkastenService` via late-bound reference (`setZettelkastenService()`).

## Orchestration Patterns

### Multi-Pass LLM (Echo Chamber Breaker)

```
User message → LLM Call 1 (extract assumptions)
            → N × Miyo search (inverted queries per assumption)
            → Miyo search (broad semantic distance)
            → LLM Call 2 (synthesize with vault evidence)
```

### Graph Analysis (Orphan Rescuer, Vault Health)

```
VaultFileSystem.listFiles() → all .md paths (cached 60s)
for each file: VaultFileSystem.readFile() → extract [[wikilinks]] via regex
→ Build in-memory inbound link map
→ Identify files with zero inbound links (orphans)
→ VaultFileSystem.stat() per file → compute staleness from real mtime
→ Compute metrics: orphan ratio, avg connectivity, staleness
```

Note: This replaced the previous Miyo-based approach which made 657+ HTTP calls
(`/v0/index/stats` + paginated `/v0/index/files` + per-file `/v0/index/documents`).
The filesystem approach is faster, more accurate (reads actual file content vs chunks),
and independent of Miyo's index state.

### Transitive Inference (Semantic Linker)

```
If A → B (classified relationship)
and B → C (classified relationship)
then suggest A → C (transitive, confidence = min(A→B, B→C) × 0.8)
```

## Relationship Schema

21 relationship subtypes organized into 6 types:

| Type | Subtypes |
|---|---|
| Hierarchical | is-a, part-of, parent-of, instance-of |
| Causal | causes, enables, prevents, results-in |
| Temporal | precedes, follows, evolves-into |
| Logical | supports, contradicts, refines, extends, relates-to |
| Social | author-of, influenced-by |
| Functional | uses, implements, depends-on |

Output format (Dataview-compatible):
```
[causes:: [[Target Note]]]
[part-of:: [[Parent MOC]]]
[contradicts:: [[Counter Note]]]
```

## Scheduling

PM2 cron entries in `ecosystem.config.js`:

| Schedule | PM2 App | Script Command |
|---|---|---|
| Daily 2:00 AM | `zk-orphan-scan` | `zettelkasten-scheduler.sh orphan-scan` |
| Sunday 9:00 AM | `zk-health-digest` | `zettelkasten-scheduler.sh health-digest` |
| Wednesday 9:00 AM | `zk-serendipity-digest` | `zettelkasten-scheduler.sh serendipity-digest` |

Reports are written to vault as notes under `Zettelkasten/Reports/`.

## Validation

- `scripts/zettelkasten-smoke-test.sh` — 11 checks covering endpoint reachability, response shape, and health score structure
- Integrated into `scripts/full-functional-sweep.sh` as check `ZK-01`

## Key Files

| File | Purpose |
|---|---|
| `backend/.../src/types/zettelkasten.ts` | Zod schemas for all requests, responses, relationships |
| `backend/.../src/services/ZettelkastenService.ts` | All 5 commands + shared helpers + pipeline |
| `backend/.../src/services/VaultFileSystem.ts` | Vault directory walker with 60s TTL cache, wikilink extraction |
| `backend/.../src/services/QdrantScrollClient.ts` | Direct Qdrant HTTP client for chunk retrieval (fallback) |
| `backend/.../src/routes/zettelkasten.ts` | 7 Fastify route handlers |
| `backend/.../src/services/ToolRouter.ts` | Zettelkasten intent detection + builtin tool definitions |
| `backend/.../src/services/McpOrchestrator.ts` | Zettelkasten tool routing via `executeZettelkastenTool()` |
| `backend/.../src/server.ts` | Service wiring + late-binding |
| `scripts/zettelkasten-smoke-test.sh` | 11-check validation suite |
| `scripts/zettelkasten-scheduler.sh` | Scheduled report generation |
| `ecosystem.config.js` | PM2 cron entries for automation |

## Design Decisions

1. **Dedicated endpoints, not enhanced agent-turn** — deterministic multi-step orchestration is hard-coded, not LLM-planned.
2. **Filesystem-first, Miyo for search only** — File listing, content reading, and wikilink extraction use the vault filesystem directly. Miyo is used only for semantic search (`/v0/search`, `/v0/search/related`). This decouples graph analysis from Miyo's index state.
3. **Emulator remains stateless** — link graphs are built per-request from filesystem data with a 60s TTL file-list cache.
4. **Late-bound service injection** — `McpOrchestrator.setZettelkastenService()` avoids circular constructor dependencies.
5. **Wikilink extraction via regex on actual files** — parses `[[links]]` from real `.md` file content (not Miyo chunks). More accurate: captures full file content, not just indexed fragments.
6. **Qdrant as fallback only** — `QdrantScrollClient` (port 6333, collection `miyo`) retrieves chunk text only when direct file read fails. Primary path is always filesystem.

### Deprecated Miyo Wrappers

The following methods still exist in `ZettelkastenService` but are deprecated stubs (return empty results):
- `miyoGetFiles()` — replaced by `VaultFileSystem.listFiles()`
- `miyoGetStats()` — replaced by `VaultFileSystem.listFiles().length`
- `miyoGetDocuments()` — replaced by `VaultFileSystem.readFile()` + `QdrantScrollClient` fallback
