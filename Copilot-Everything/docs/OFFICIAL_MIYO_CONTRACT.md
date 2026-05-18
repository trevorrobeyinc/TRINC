# Official Miyo Contract

Date: 2026-03-19

## Current Runtime Note

The current target runtime for the official `copilot` plugin uses native Miyo via HTTPS proxy at `https://127.0.0.1:8743` (upstream `http://127.0.0.1:8742`) together with `direct_plugin_mcp` and the shared HTTPS MCP server at `https://127.0.0.1:8798`.

Any emulator references in this document should be read as historical compatibility or rollback detail, not as the normal runtime path for the official plugin.

## Scope

This document maps the official plugin's open and self-host-visible Miyo surface from:

- `/Users/trevorrobey/THE Copilot in Obsidian Everything/repos/obsidian-copilot-mcp/src/search/RetrieverFactory.ts`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/repos/obsidian-copilot-mcp/src/search/miyo/MiyoSemanticRetriever.ts`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/repos/obsidian-copilot-mcp/src/miyo/MiyoClient.ts`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/repos/obsidian-copilot-mcp/src/miyo/MiyoServiceDiscovery.ts`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/repos/obsidian-copilot-mcp/src/search/findRelevantNotes.ts`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/repos/obsidian-copilot-mcp/src/search/indexBackend/MiyoIndexBackend.ts`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/repos/obsidian-copilot-mcp/src/tools/FileParserManager.ts`
- the installed side-by-side bundle at `/Users/trevorrobey/THE Copilot in Obsidian Everything/dev-vault/.obsidian/plugins/copilot/main.js`

The currently validated stable bundle is `3.2.5`.

## Retriever And Backend Selection

### Search selection

Miyo semantic retrieval is selected when all three are true:

- `enableMiyo`
- `enableSemanticSearchV3`
- `isSelfHostAccessValid()`

That decision is visible in:

- `RetrieverFactory.shouldUseMiyo(...)`
- `RetrieverFactory.isMiyoActive()`
- `VectorStoreManager.shouldUseMiyo(...)`

### Related-note selection

Related-note scoring uses Miyo when:

- `enableMiyo`
- `enableSemanticSearchV3`
- `isSelfHostAccessValid()`

Visible caller:

- `calculateSimilarityScoreFromMiyo(...)` in `src/search/findRelevantNotes.ts`

### PDF parse selection

`/v0/parse-doc` is used only when:

- self-host mode is valid
- `enableMiyo` is true
- file extension is `pdf`

Visible caller:

- `SelfHostPdfParser.parsePdf(...)` in `src/tools/FileParserManager.ts`

### Index backend selection

The semantic index backend switches from Orama to Miyo when:

- `enableMiyo`
- `enableSemanticSearchV3`
- `isSelfHostAccessValid()`

Visible caller:

- `VectorStoreManager.getBackendKey(...)`

## Base URL Resolution

Visible resolution order from the frontend:

1. `miyoServerUrl` setting if non-empty
2. platform service discovery file via `MiyoServiceDiscovery`
3. official plugin bundle currently contains a localhost fallback in its own discovery logic

The emulator compatibility layer does not hardcode that fallback. It uses:

1. `MIYO_BASE_URL` when configured
2. local `Miyo/service.json` discovery file when present

## Source ID Resolution

Visible source ID resolution from the installed `3.2.5` bundle:

1. `miyoVaultName` when it is non-empty
2. filesystem base path for the active vault when available
3. vault display name as a final fallback

A targeted runtime probe against the refreshed `3.2.5` bundle confirmed that setting `miyoVaultName = "codex-stable-3-2-5-vault-id"` changes `miyoBackend.getSourceId()` to that exact string.

## Header And Auth Contract

### Official plugin observable behavior

From the installed `3.2.5` `copilot` bundle, `buildHeaders()` now sends:

- `Authorization` only
- no `X-API-Key`

Observed runtime evidence from `/Users/trevorrobey/THE Copilot in Obsidian Everything/configs/validation/official-plugin-miyo-runtime.json`:

- `headerProbe.keys = ["Authorization"]`
- `headerProbe.hasAuthorization = true`
- `headerProbe.hasApiKey = false`

GitHub release `3.2.5` also calls out "Miyo: customizable vault name, remote backend mobile re-indexing, license auth header." Source inspection and runtime probing together support the inference that this `Authorization` header is the new license-backed path.

### Emulator compatibility behavior

The emulator keeps canonical `v1/self-host/*` routes pinned to `SELF_HOST_API_KEY`.

For official Miyo compatibility aliases on `/v0/*`, the emulator now accepts:

- the canonical `Authorization: Bearer <SELF_HOST_API_KEY>`
- the older `X-API-Key: <SELF_HOST_API_KEY>` path
- any non-empty bearer token on the localhost-only compatibility surface so the stable official plugin's new header shape can pass through to downstream Miyo unchanged

## Route Inventory

### `GET /v0/health`

Visible callers:

- `MiyoClient.isBackendAvailable(...)`
- Miyo enable / validation UI flow

Request:

- method: `GET`
- body: none
- headers: observable `Authorization`; no `X-API-Key` seen in the validated `3.2.5` runtime

Success response observed:

```json
{
  "status": "ok",
  "service": "running",
  "qdrant": "connected",
  "llama_server": "running"
}
```

The official plugin only requires `status === "ok"`. Extra fields are tolerated.

### `POST /v0/search`

Visible callers:

- `MiyoSemanticRetriever.searchMiyo(...)`

Request:

```json
{
  "query": "user query",
  "vault": "/absolute/vault/path",
  "limit": 20,
  "filters": [
    {
      "field": "mtime",
      "gte": 1700000000000,
      "lte": 1700600000000
    }
  ]
}
```

Headers:

- observable `Authorization`

Success response shape consumed by the plugin:

```json
{
  "results": [
    {
      "path": "README.md",
      "score": 0.91,
      "chunk_text": "..."
    }
  ]
}
```

Observed real Miyo response includes extra fields such as:

- `query`
- `count`
- `execution_time_ms`

The plugin only depends on `response.results || []`.

Important note:

- the `vault` field can be the active vault filesystem path or a custom `miyoVaultName` override

### `POST /v0/search/related`

Visible callers:

- `calculateSimilarityScoreFromMiyo(...)` in `findRelevantNotes.ts`

Request:

```json
{
  "file_path": "README.md",
  "vault": "/absolute/vault/path",
  "limit": 20,
  "filters": []
}
```

Success response shape consumed by the plugin:

```json
{
  "results": [
    {
      "path": "other-note.md",
      "score": 0.73
    }
  ]
}
```

Observed real Miyo error behavior:

- status: `404`
- body:

```json
{
  "detail": "No indexed chunks found for file_path"
}
```

The official plugin catches this as a thrown `Error("Miyo request failed with status 404")`.

Important note:

- the `vault` field follows the same source-ID resolution rule as search and therefore can also become a custom `miyoVaultName`

### `POST /v0/parse-doc`

Visible callers:

- `SelfHostPdfParser.parsePdf(...)`

Request:

```json
{
  "path": "/absolute/path/to/file.pdf"
}
```

Success response consumed by the plugin:

```json
{
  "text": "parsed content",
  "format": "pdf",
  "source_path": "/absolute/path/to/file.pdf",
  "title": null,
  "page_count": 1
}
```

Important note:

- `title` is nullable in the real Miyo response
- the plugin requires `text` to be a non-empty string for success

Observed real Miyo validation error for non-PDF input:

- status: `415`
- body:

```json
{
  "detail": "Only PDF files are supported"
}
```

### Additional Open-Surface Index Routes

These are visible from `MiyoClient.ts` and `MiyoIndexBackend.ts`, and the emulator aliases them as pass-through compatibility routes:

- `POST /v0/index/upsert`
- `DELETE /v0/index/by_path`
- `POST /v0/index/clear`
- `GET /v0/index/files` — **DEPRECATED in Miyo v4 (returns 501)**
- `GET /v0/index/stats` — **DEPRECATED in Miyo v4 (returns 501)**
- `GET /v0/index/documents` — **DEPRECATED in Miyo v4 (returns 501)**

> **Miyo v4 deprecation note (2026-03-30)**: Miyo v4 removed `/v0/index/files`, `/v0/index/stats`, and `/v0/index/documents`. These now return HTTP 501. Miyo manages indexing internally via its FolderManager with a local SQLite manifest (`index_manifest.db`) and Qdrant vector store. The emulator's `ZettelkastenService` has been migrated to use direct filesystem access (`VaultFileSystem`) and Qdrant (`QdrantScrollClient`) instead. The pass-through aliases still exist but will receive 501 from Miyo.

They are open and self-host-visible, but this pass only re-tested official-plugin runtime calls for:

- `GET /v0/health`
- `POST /v0/search`
- `POST /v0/search/related`
- `POST /v0/parse-doc`

## Status Codes And Error Handling

Frontend-visible behavior from `MiyoClient.requestJson(...)`:

- any status `>= 400` is treated as failure
- the client logs response text
- the thrown error string is `Miyo request failed with status <code>`

That means the official plugin depends primarily on:

- the HTTP status code
- successful JSON on `2xx`

It does not require a special proprietary error envelope.

## Safely Derivable Vs Out Of Scope

### Safely derivable

- route list
- methods
- request body shapes
- optional query parameter shapes
- auth header behavior
- service-discovery behavior
- success envelope fields consumed by the plugin
- downstream status-driven error behavior

### Intentionally out of scope

- undocumented hosted Copilot response logic
- any hosted-only search ranking heuristics
- any hidden Brevilabs backend semantics
- any non-observable Miyo internals beyond the request and response contract the plugin uses
