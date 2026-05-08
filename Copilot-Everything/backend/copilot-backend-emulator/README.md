# Copilot Backend Emulator

Canonical self-host backend emulator for the `copilot-mcp` fork.

Primary routes:

- `GET /healthz`
- `POST /v1/self-host/agent-turn`
- `POST /v1/self-host/agent-turn/stream`

Zettelkasten commands:

- `POST /v1/self-host/zettelkasten/serendipity`
- `POST /v1/self-host/zettelkasten/cross-domain`
- `POST /v1/self-host/zettelkasten/echo-chamber`
- `POST /v1/self-host/zettelkasten/semantic-linker`
- `POST /v1/self-host/zettelkasten/orphan-rescue`
- `POST /v1/self-host/zettelkasten/health`
- `POST /v1/self-host/zettelkasten/pipeline`

Secondary alias compatibility:

- `GET /v0/health`
- `POST /v0/search`
- `POST /v0/search/related`
- `POST /v0/parse-doc`
- `POST /v0/index/upsert`
- `DELETE /v0/index/by_path`
- `POST /v0/index/clear`
- `GET /v0/index/files` _(deprecated in Miyo v4 — returns 501)_
- `GET /v0/index/stats` _(deprecated in Miyo v4 — returns 501)_
- `GET /v0/index/documents` _(deprecated in Miyo v4 — returns 501)_

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Contract

The canonical shim is versioned under `v1/self-host/*`. Golden fixtures live in `tests/fixtures`.

Alias compatibility forwards to a real Miyo instance. Configure either:

- `MIYO_BASE_URL`
- or a local Miyo `service.json` discovery file

Optional downstream auth:

- `MIYO_AUTH`

## Zettelkasten Data Sources

The Zettelkasten commands use a hybrid data strategy:

- **Vault filesystem** (`VaultFileSystem`) — file listing, content reading, wikilink extraction (60s TTL cache)
- **Miyo search** (`/v0/search`, `/v0/search/related`) — semantic similarity queries
- **Qdrant** (`QdrantScrollClient`, port 6333) — fallback chunk retrieval when file reads fail
- **LM Studio** (via `ModelGateway`) — LLM analysis calls

Vault root defaults to `DEFAULT_VAULT_ROOT` env var (`/Volumes/ExtraCurricular/My Digital Garden`).
