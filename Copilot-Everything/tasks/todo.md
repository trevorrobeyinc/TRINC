# Zettelkasten Backend-Native Implementation

> **Created**: 2026-03-29
> **Goal**: Move five Zettelkasten commands from prompt-only to backend-native capabilities
> **Brainstorm**: [docs/ZETTELKASTEN_BACKEND_PLAN.md](../docs/ZETTELKASTEN_BACKEND_PLAN.md)
> **Status**: Phase 1 + Phase 2 complete. Phase 3 (scheduling, SSE streaming) remains.

---

## Phase 1: Quick Wins -- COMPLETE

### 1.1 Skeleton: Service + Types + Routes

- [x] Create `backend/copilot-backend-emulator/src/types/zettelkasten.ts`
  - Zod schemas: `ZettelkastenCommandRequest`, `ZettelkastenCommandResponse`
  - `ActionableSuggestion` type (wikilink, rationale, relationship type)
  - `VaultHealthScore` type
  - `TypedRelationship` type (source, target, type, subtype, confidence, dataviewSyntax)
  - `ZettelkastenPipelineRequest` type
  - **Acceptance**: Types compile, no import errors

- [x] Create `backend/copilot-backend-emulator/src/services/ZettelkastenService.ts`
  - Constructor: `(mcpOrchestrator, miyoClient, modelGateway, env)`
  - Stub methods: `serendipity()`, `crossDomain()`, `echoChamber()`, `semanticLinker()`, `orphanRescue()`, `vaultHealth()`
  - Shared helpers: `extractConcepts()`, `findSemanticNeighbors()`, `readNote()`
  - **Acceptance**: Stubs return mock responses; existing tests still pass

- [x] Create `backend/copilot-backend-emulator/src/routes/zettelkasten.ts`
  - `POST /v1/self-host/zettelkasten/serendipity`
  - `POST /v1/self-host/zettelkasten/cross-domain`
  - `POST /v1/self-host/zettelkasten/echo-chamber`
  - `POST /v1/self-host/zettelkasten/semantic-linker`
  - `POST /v1/self-host/zettelkasten/orphan-rescue`
  - `POST /v1/self-host/zettelkasten/health`
  - `POST /v1/self-host/zettelkasten/pipeline` (stub)
  - **Acceptance**: All endpoints return 200 with stub responses

- [x] Wire into `server.ts`
  - Import and instantiate `ZettelkastenService`
  - Register zettelkasten routes
  - **Acceptance**: Server starts cleanly; `/healthz` still works

- [x] Update `SelfHostContractInventory`
  - Add zettelkasten routes to inventory
  - **Acceptance**: Inventory lists all new routes

### 1.2 Implement Serendipity Generator

- [x] Implement `ZettelkastenService.serendipity()`
  - Step 1: Read note via bridge (`obsidian_read_note`) or use provided content
  - Step 2: `extractConcepts()` — LLM extracts key concepts
  - Step 3: Miyo `/v0/search` with 3 concept queries (limit 5 each)
  - Step 4: Miyo `/v0/index/files` with random offset for catalyst notes
  - Step 5: Miyo `/v0/search` with time filter for "On This Day" (same day-of-year)
  - Step 6: LLM synthesis with serendipity system prompt + all vault context
  - Step 7: Return structured response with `[[wikilinks]]` to real notes
  - **Acceptance**: Given a real note path, returns serendipity suggestions referencing actual vault notes

### 1.3 Implement Cross-Domain Connector

- [x] Implement `ZettelkastenService.crossDomain()`
  - Step 1: Read note content
  - Step 2: LLM extracts structural pattern + domain classification
  - Step 3: Miyo `/v0/search` per identified concept
  - Step 4: Miyo `/v0/search/related` for nearest neighbors
  - Step 5: Classify results by domain (folder path heuristic + tag analysis)
  - Step 6: LLM synthesis with cross-domain system prompt
  - Step 7: Output with real `[[wikilinks]]` and suggested tags
  - **Acceptance**: Returns domain-mapped suggestions with real vault note references

### 1.4 Implement Echo Chamber Breaker

- [x] Implement `ZettelkastenService.echoChamber()`
  - Step 1: Read note content
  - Step 2: LLM extracts core assumptions (structured JSON output)
  - Step 3: Per assumption: construct inverted/negated search query
  - Step 4: Miyo `/v0/search` with each inverted query for contradictory content
  - Step 5: LLM synthesis: counterarguments grounded in vault evidence
  - Step 6: "Semantic distance" connections from low-score but interesting Miyo results
  - **Acceptance**: Returns counterarguments with citations to real vault notes

---

## Phase 2: Medium Lifts -- COMPLETE

### 2.1 Semantic Linker with Relationship Classification

- [x] Define canonical relationship schema in `types/zettelkasten.ts`
  - Hierarchical: is-a, part-of, parent-of, instance-of
  - Causal: causes, enables, prevents, results-in
  - Temporal: precedes, follows, evolves-into
  - Logical: supports, contradicts, refines, extends
  - Social: author-of, influenced-by
  - Functional: uses, implements, depends-on

- [x] Implement `ZettelkastenService.semanticLinker()`
  - Miyo `/v0/search/related` (limit 15) for broad neighbor set
  - For each neighbor: fetch content snippet via `/v0/index/documents`
  - LLM: classify relationship type for each source-target pair
  - Generate Dataview inline field syntax per classified relationship
  - Transitive inference: if A→B and B→C in results, suggest A→C
  - **Acceptance**: Returns typed relationships with valid Dataview syntax

- [x] Implement `scanExistingDataviewProperties()` helper
  - Query sample of indexed documents, parse for `[property:: value]` patterns
  - Use discovered conventions in output for consistency

### 2.2 Orphan Rescuer with Vault-Wide Scan

- [x] Implement `buildLinkGraph()`
  - Paginate `/v0/index/files`
  - For each file: `/v0/index/documents` → extract `[[wikilinks]]` via regex
  - Build `Map<string, Set<string>>` of inbound links per file
  - Exclude daily notes, templates, config files
  - **Acceptance**: Returns correct orphan count for test vault

- [x] Implement `ZettelkastenService.orphanRescue()`
  - **Single-note mode**: assess one note's connectivity, suggest links
  - **Batch mode**: vault-wide orphan scan, rescue suggestions for top N
  - Per orphan: `/v0/search/related` for semantic neighbors, suggest links

- [x] Implement `ZettelkastenService.vaultHealth()`
  - Orphan ratio, average connectivity, staleness metrics, tag coverage
  - **Acceptance**: Health score returns reasonable metrics for "My Digital Garden"

### 2.3 MCP Bridge Tool Registration

- [x] Register five new tool bindings in `ToolRouter`:
  - `zettelkasten_cross_domain`
  - `zettelkasten_echo_chamber`
  - `zettelkasten_semantic_linker`
  - `zettelkasten_orphan_rescue`
  - `zettelkasten_serendipity`
  - `zettelkasten_vault_health`

- [x] Add Zettelkasten intent detection in `ToolRouter.looksVaultIntent()`
  - Keywords: `zettelkasten`, `orphan`, `serendipity`, `cross-domain`, `echo chamber`, `semantic link`, `link suggestion`, `challenge assumptions`, `vault health`

- [x] Route `zettelkasten_*` tool calls in `McpOrchestrator.executeToolCall()`
  - Detect `zettelkasten_*` prefix → delegate to `ZettelkastenService`
  - **Acceptance**: Claude adapter can invoke `zettelkasten_serendipity` via MCP and receive results

### 2.4 Pipeline Composition

- [x] Implement `ZettelkastenService.pipeline(steps)`
  - Sequential execution with output forwarding
  - Each step receives previous step's results as additional context

- [x] Define pipeline presets:
  - `deep-connect`: Cross-Domain → Semantic Linker → write note
  - `vault-health`: Orphan batch scan → aggregate report
  - `discovery-session`: Serendipity → Echo Chamber → Cross-Domain
  - `assumption-audit`: Echo Chamber → vault search → Semantic Linker
  - `full-rescue`: Orphan Rescuer → Semantic Linker → Cross-Domain

- [x] Wire `POST /v1/self-host/zettelkasten/pipeline` endpoint
  - **Acceptance**: Pipeline executes commands in sequence; combined output is coherent

---

## Phase 3: Heavy Lifts (4+ sessions)

### 3.1 Scheduling & Automation

- [x] Create `scripts/zettelkasten-scheduler.sh`
  - Nightly orphan scan → `Zettelkasten/Reports/Orphan Report YYYY-MM-DD.md`
  - Weekly health digest → `Zettelkasten/Reports/Weekly Health YYYY-WW.md`
  - Weekly serendipity digest → `Zettelkasten/Reports/Discovery YYYY-WW.md`

- [x] Add PM2 cron entries to `ecosystem.config.js`

- [x] Create report note templates

### 3.2 SSE Streaming for Batch Operations

- [x] Add `POST /v1/self-host/zettelkasten/orphan-rescue/stream`
  - Progress events: `{ event: "progress", data: { scanned, total, orphans_found } }`
  - Per-orphan events: `{ event: "orphan_found", data: { path, suggestions } }`
  - Final event: `{ event: "complete", data: fullReport }`

- [x] Add streaming to pipeline endpoint

### 3.3 Miyo Link-Aware Search (Optional)

- [ ] Propose `POST /v0/search/links` for Miyo
  - Input: `{ file_path, vault }`
  - Output: `{ outbound_links: string[], inbound_links: string[] }`
  - Miyo parses/caches `[[wikilinks]]` during indexing

- [ ] Update `buildLinkGraph()` to prefer this endpoint, fall back to regex

### 3.4 Validation & Testing

- [x] Add Zettelkasten checks to `scripts/full-functional-sweep.sh`
- [x] Create `scripts/zettelkasten-smoke-test.sh`
- [ ] Document in `docs/ZETTELKASTEN_BACKEND_ARCHITECTURE.md`

---

## Dependency Graph

```
1.1 Skeleton ──┬── 1.2 Serendipity (independent)
               ├── 1.3 Cross-Domain  (independent)
               └── 1.4 Echo Chamber  (independent)
                        │
              ┌─────────┴─────────┐
              2.1 Semantic Linker  2.2 Orphan Rescuer
              └─────────┬─────────┘
                        │
              ┌─────────┴─────────┐
              2.3 MCP Bridge Tools 2.4 Pipelines
              └─────────┬─────────┘
                        │
              ┌─────────┼─────────┐
              3.1 Sched  3.2 SSE  3.3 Miyo Links
```

---

## Lessons Preloaded

1. **Use the deferred-write pattern.** Commands that produce report notes should stream LLM output first, then write the polished result. Match existing `SelfHostExecutionEngine` behavior.

2. **Miyo Zod schemas use `.passthrough()`.** Do not assume response shape is exactly what schema defines — Miyo can return extra fields.

3. **Follow the preflight pattern.** `McpOrchestrator.runPreFlightIntentCheck()` fires Miyo search before the main LLM call. Zettelkasten commands should gather vault context first, then prompt.

4. **ToolRouter augmentation is extensible.** `augmentWithWriteIntent()` and `augmentWithReadIntent()` show how to detect intent and inject tool calls. Adding `augmentWithZettelkastenIntent()` follows the same shape.

5. **Hard-code orchestration steps.** Do NOT rely on the LLM planner to discover multi-step sequences. The planner is unreliable for complex chains. Encode step sequences in `ZettelkastenService` methods.

6. **Vault root is already resolved.** `DEFAULT_VAULT_ROOT` in env config flows through the binding chain. Zettelkasten commands inherit this.

7. **Test against the real vault.** Validate against `/Volumes/ExtraCurricular/My Digital Garden`. Add checks to `scripts/full-functional-sweep.sh`.

8. **Watch request timeouts.** `REQUEST_TIMEOUT_MS` defaults to 30s. Batch orphan scans may exceed this. Increase for batch endpoints or use streaming.

9. **Bridge replay protection is automatic.** `BridgeMcpClient` via `HttpMcpTransport` handles signing. But direct Miyo calls (via `MiyoCompatibilityClient`) bypass the bridge — be aware of the distinction.

10. **Do not modify existing constructors.** Wire `ZettelkastenService` as a new dependency in `server.ts`. Don't add parameters to `SelfHostExecutionEngine`, `McpOrchestrator`, or `ToolRouter`.

---

## Critical Files

| File | Role in this work |
|---|---|
| `backend/copilot-backend-emulator/src/server.ts` | Wire new service + routes |
| `backend/copilot-backend-emulator/src/services/SelfHostExecutionEngine.ts` | Reference pattern (do not modify) |
| `backend/copilot-backend-emulator/src/services/McpOrchestrator.ts` | Route zettelkasten_* tools (Phase 2.3) |
| `backend/copilot-backend-emulator/src/services/ToolRouter.ts` | Add intent detection (Phase 2.3) |
| `backend/copilot-backend-emulator/src/services/SelfHostContractInventory.ts` | Register new routes |
| `backend/copilot-backend-emulator/src/types/miyo.ts` | Miyo schema reference |
| `backend/copilot-backend-emulator/src/types/mcp.ts` | McpToolBinding, ExecutedToolCall types |
| `backend/copilot-backend-emulator/src/config/env.ts` | Environment config |
| `backend/copilot-backend-emulator/src/adapters/MiyoCompatibilityClient.ts` | Direct Miyo calls |
