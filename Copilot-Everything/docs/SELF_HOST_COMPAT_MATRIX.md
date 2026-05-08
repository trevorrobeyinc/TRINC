# Self-Host Compat Matrix

Date: 2026-03-19

## Short Route Matrix

| Route | `copilot-mcp` requirement | official `copilot` requirement | Emulator status |
| --- | --- | --- | --- |
| `GET /healthz` | required canonical route | not used | implemented |
| `POST /v1/self-host/agent-turn` | required canonical route | not used | implemented |
| `POST /v1/self-host/agent-turn/stream` | canonical optional stream route | not used | implemented |
| `GET /v0/health` | not required | required by Miyo health checks | implemented and validated |
| `POST /v0/search` | not required | required by Miyo semantic search | implemented and validated |
| `POST /v0/search/related` | not required | required by Miyo related-note scoring | implemented and validated on the real 404 path |
| `POST /v0/parse-doc` | not required | required by Miyo PDF parsing | implemented and validated |
| `POST /v0/index/upsert` | not required | open and self-host-visible | implemented as pass-through alias |
| `DELETE /v0/index/by_path` | not required | open and self-host-visible | implemented as pass-through alias |
| `POST /v0/index/clear` | not required | open and self-host-visible | implemented as pass-through alias |
| `GET /v0/index/files` | not required | **DEPRECATED in Miyo v4 (501)** | pass-through alias (returns 501 from Miyo); ZK service uses VaultFileSystem |
| `GET /v0/index/stats` | not required | **DEPRECATED in Miyo v4 (501)** | pass-through alias (returns 501 from Miyo); ZK service uses VaultFileSystem |
| `GET /v0/index/documents` | not required | **DEPRECATED in Miyo v4 (501)** | pass-through alias (returns 501 from Miyo); ZK service uses VaultFileSystem + QdrantScrollClient |

## Short Envelope Matrix

| Envelope | `copilot-mcp` expectation | official `copilot` expectation | Emulator status |
| --- | --- | --- | --- |
| canonical success `{ ok, assistant, responseMetadata, meta }` | required | not used | implemented |
| canonical error `{ ok:false, mode, error }` | required | not used | implemented |
| canonical SSE events | required for stream path | not used | implemented and fixture-locked |
| Miyo health object with `status` | not used | required | implemented and validated |
| Miyo search object with `results` array | not used | required | implemented and validated |
| Miyo related-search object with `results` array or downstream 404 | not used | required | implemented and validated on 404 pass-through |
| Miyo parse-doc object with `text`, `format`, `source_path`, nullable `title` | not used | required | implemented and validated |

## Header Matrix

| Surface | `copilot-mcp` | official `copilot` | Emulator behavior |
| --- | --- | --- | --- |
| canonical auth | `Authorization: Bearer <SELF_HOST_API_KEY>` | not used | required when configured |
| Miyo alias auth | not required by fork | validated `3.2.5` runtime exposes `Authorization` only and no `X-API-Key` | accepts canonical self-host auth, legacy `X-API-Key`, or a non-empty bearer token for localhost-only official-plugin compatibility |

## Key Contract Differences

### Canonical fork boundary

- versioned under `v1/self-host/*`
- full chat and agent turn
- server-side model and tool loop
- canonical trace and token-usage envelope

### Official plugin observable boundary

- Miyo-style `/v0/*`
- route-level search, related-search, parse-doc, and index operations
- `vault` source ID can be the filesystem path or a custom `miyoVaultName`
- status-driven error handling
- no canonical chat-turn envelope

## Shim Policy

- `v1/self-host/*` remains canonical for `copilot-mcp`
- `/v0/*` remains a compatibility alias surface only
- official-plugin requirements do not redefine the primary fork-owned schema
