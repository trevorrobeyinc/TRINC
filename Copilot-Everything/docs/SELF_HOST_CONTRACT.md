# Self-Host Contract

Date: 2026-03-19

> **Contract amendment (2026-07-31).** The bridge behind `/mcp/tool` has been **REST-only
> since 2026-05-09** — `RestApiBackend` (Obsidian Local REST API plugin, `:27124`) is the
> sole backend and the CLI subprocess backend no longer exists. Wherever `backendHint`
> appears in this contract it is optional and accepts **only the literal `"restApi"`**;
> the old `"cli"` value is rejected HTTP `400` (`invalid_literal` — see
> `bridges/obsidian-copilot-bridge/src/server/dispatcher.ts`). The Copilot fork stopped
> sending `backendHint` entirely on 2026-07-31, and the two `"backendHint": "cli"`
> examples below were updated to `"restApi"` the same day. Emulator-era text is otherwise
> preserved as written (the backend emulator itself was retired 2026-04-11, deleted
> 2026-05-08).

## Scope

This document separates three things:

1. Observable contracts that already existed in the workspace before the emulator.
2. The new canonical fork-owned self-host shim for `copilot-mcp`.
3. Secondary alias routes for official `copilot` compatibility.

There was no preexisting `copilot-mcp` self-host chat backend contract before this work. The canonical contract is now the fork-owned `v1/self-host/*` shim below.

## Current Observable Contracts Before The Emulator

### Bridge HTTP Contract

Used by:
- `copilot-mcp` direct MCP mode
- backend emulator bridge client

Routes:
- `GET /healthz`
  - Auth: none
  - Response: bridge health JSON
- `POST /mcp/tool`
  - Auth:
    - `Authorization: Bearer <token>` when configured
    - `X-MCP-Token: <token>` when configured
  - Required replay headers:
    - `X-MCP-Timestamp`
    - `X-MCP-Nonce`
    - `X-MCP-Body-Sha256`
  - Body:
    - `{ tool, operation?, backendHint?, input? }`
    - `backendHint` is optional and accepts **only the literal `"restApi"`** (REST-only
      since 2026-05-09 — the CLI subprocess backend was removed; a stale `"cli"` value is
      rejected HTTP `400` `invalid_literal`). Current callers omit the field — the Copilot
      fork stopped sending it entirely on 2026-07-31.
  - Success envelope:
    - `{ ok: true, data, meta }`
  - Error envelope:
    - `{ ok: false, error, meta }`

### Miyo / Official Self-Host Observable Surface

Observed from official plugin code and settings:
- `GET /v0/health`
- `POST /v0/search`
- `POST /v0/search/related`
- `POST /v0/parse-doc`
- `POST /v0/index/upsert`
- `DELETE /v0/index/by_path`
- `POST /v0/index/clear`
- `GET /v0/index/files`
- `GET /v0/index/stats`
- `GET /v0/index/documents`

This workspace does not implement hosted or undocumented Miyo internals. The emulator now aliases the open and self-host-visible `/v0/*` Miyo surface as a secondary compatibility layer that forwards to the real Miyo service.

### Local Provider APIs

Observed self-host provider surfaces used by the fork:
- Ollama:
  - `POST /api/chat`
- OpenAI-compatible providers:
  - `POST /v1/chat/completions`
- LM Studio:
  - `POST /v1/chat/completions`

## Canonical Fork-Owned Contract

Contract version:
- `v1/self-host`

Execution mode:
- `exact_backend_emulator`

### `GET /healthz`

Used by:
- `copilot-mcp`
- smoke and runbook scripts

Auth:
- optional `Authorization: Bearer <SELF_HOST_API_KEY>`
- health still works without auth when `SELF_HOST_API_KEY` is unset

Response:

```json
{
  "ok": true,
  "status": "ready",
  "contractVersion": "v1/self-host",
  "bridgeOk": true,
  "bridge": {},
  "ts": "2026-03-19T00:00:00.000Z"
}
```

### `POST /v1/self-host/agent-turn`

Used by:
- `copilot-mcp` exact backend emulator mode

Required headers:
- `Content-Type: application/json`

Optional headers:
- `Authorization: Bearer <SELF_HOST_API_KEY>`

Auth scheme:
- bearer token only
- current implementation rejects invalid auth with an error envelope and HTTP `400`

Request body:

```json
{
  "requestId": "uuid",
  "executionMode": "exact_backend_emulator",
  "runtimeLane": "fork_dev",
  "chainType": "copilot_plus",
  "rawUserMessage": "user text",
  "originalUserMessage": "optional original text",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "model": {
    "key": "llama3-groq-tool-use:latest|ollama",
    "name": "llama3-groq-tool-use:latest",
    "provider": "ollama",
    "baseUrl": "https://127.0.0.1:11435",
    "apiKey": "optional",
    "temperature": 0.1,
    "maxTokens": 6000,
    "reasoningEffort": "low",
    "verbosity": "medium",
    "stream": true,
    "streamUsage": false
  },
  "tools": [
    {
      "runtimeName": "mcp_local-obsidian-mcp_obsidian_health",
      "displayName": "Obsidian MCP Health",
      "description": "Checks bridge health",
      "category": "mcp",
      "bridge": {
        "toolName": "obsidian_health",
        "backendHint": "restApi",
        "serverId": "local-obsidian-mcp",
        "httpEndpoint": "https://127.0.0.1:8798",
        "vaultName": "dev-vault",
        "vaultRoot": "/Users/trevorrobey/THE Copilot in Obsidian Everything/dev-vault"
      }
    }
  ],
  "responseStyle": {
    "stream": true,
    "includeReasoning": true
  },
  "contextEnvelope": {},
  "retrieval": {
    "mode": "vault_qa",
    "sources": []
  },
  "project": {
    "id": "optional",
    "name": "optional"
  },
  "debug": true
}
```

Success response:

```json
{
  "ok": true,
  "mode": "exact_backend_emulator",
  "requestId": "uuid",
  "assistant": {
    "content": "<!--AGENT_REASONING:complete:0:[\"...\"]-->\n\nFinal answer",
    "reply": "Final answer",
    "sources": [],
    "trace": {
      "reasoning": [{ "summary": "Analyzing request" }],
      "toolCalls": []
    },
    "tokenUsage": {
      "inputTokens": 1,
      "outputTokens": 1,
      "totalTokens": 2
    }
  },
  "responseMetadata": {
    "wasTruncated": false,
    "tokenUsage": {
      "inputTokens": 1,
      "outputTokens": 1,
      "totalTokens": 2
    }
  },
  "meta": {
    "modelProvider": "ollama",
    "modelName": "llama3-groq-tool-use:latest",
    "executionMode": "exact_backend_emulator",
    "toolCount": 1,
    "usedTools": true
  }
}
```

Error response:

```json
{
  "ok": false,
  "mode": "exact_backend_emulator",
  "requestId": "optional",
  "error": {
    "code": "agent_turn_failed",
    "message": "human readable error",
    "retryable": false,
    "details": {}
  }
}
```

Status code behavior:
- `200` on success
- `400` on auth, validation, execution, or provider errors in the current implementation

Runtime lane policy:
- `runtimeLane=production_official`
  - forced buffered mode (`responseStyle.stream=false`)
- `runtimeLane=raycast`
  - forced buffered mode (`responseStyle.stream=false`)
- `runtimeLane=fork_dev`
  - may use streaming when `responseStyle.stream=true`

Pre-flight vault context behavior:
- before planner/tool loop, vault-intent messages may trigger `miyo_search_context`
- compact results are injected into a `<vault_context ...>` block for the final answer step
- Miyo pre-flight failures are non-fatal and the turn continues without hard failure

### `POST /v1/self-host/agent-turn/stream`

Used by:
- `copilot-mcp` exact backend emulator mode when plugin streaming is enabled

Required headers:
- `Content-Type: application/json`

Optional headers:
- `Authorization: Bearer <SELF_HOST_API_KEY>`

Transport:
- SSE

Event order:
- `reasoning_step`
- `tool_call_start`
- `tool_call_result`
- `assistant_delta`
- `final`
- `error`

Event payload shapes:
- `reasoning_step`
  - `{ summary, displayContent }`
- `tool_call_start`
  - `{ toolName, displayName, args, displayContent }`
- `tool_call_result`
  - `{ toolName, success, displayResult, displayContent }`
- `assistant_delta`
  - `{ delta, displayContent }`
- `final`
  - canonical success envelope
- `error`
  - canonical error envelope

Streaming semantics:
- the plugin updates chat UI from `displayContent`
- `displayContent` already includes the reasoning marker format the current fork UI parses
- streaming requests are rejected unless:
  - `runtimeLane=fork_dev`
  - `responseStyle.stream=true`

Current validation note:
- the streaming route is implemented and fixture-tested
- the live dev-vault proof currently uses the non-stream route because the Obsidian-safe transport path is buffered via `requestUrl`

### `POST /v1/self-host/tool-call`

Used by:
- Raycast backend-first deterministic command dispatch

Required headers:
- `Content-Type: application/json`

Optional headers:
- `Authorization: Bearer <SELF_HOST_API_KEY>`

Request body:

```json
{
  "tool": "obsidian_execute_command",
  "operation": "execute_command",
  "backendHint": "restApi",
  "input": {
    "vault": "dev-vault",
    "id": "copilot:refresh-prompts"
  }
}
```

Behavior:
- validates request shape
- forwards to bridge `/mcp/tool`
- returns the bridge tool envelope directly

## Secondary Alias Routes

These are intentionally non-canonical.

### `GET /v0/health`

Used by:
- official `copilot` Miyo health checks

Behavior:
- validates alias auth when configured
- forwards to real Miyo `GET /v0/health`
- preserves downstream status and JSON body

Validated response example:

```json
{
  "status": "ok",
  "service": "running",
  "qdrant": "connected"
}
```

### `POST /v0/search`
### `POST /v0/search/related`
### `POST /v0/parse-doc`
### `POST /v0/index/upsert`
### `DELETE /v0/index/by_path`
### `POST /v0/index/clear`
### `GET /v0/index/files`
### `GET /v0/index/stats`
### `GET /v0/index/documents`

Behavior:
- these are alias routes only
- request bodies and query shapes are validated with zod
- the emulator forwards them to the configured real Miyo instance
- downstream `2xx`, `4xx`, and `5xx` status codes are preserved
- downstream JSON bodies are preserved on pass-through success and pass-through failure
- emulator-generated validation failures use:

```json
{
  "ok": false,
  "error": {
    "code": "invalid_request",
    "message": "Compatibility request for '/v0/...' did not match the documented contract.",
    "retryable": false,
    "details": []
  }
}
```

Validated examples:
- `POST /v0/search` -> `200` with `results`, `query`, `count`, `execution_time_ms`
- `POST /v0/search/related` -> pass-through `404` with `{ "detail": "No indexed chunks found for file_path" }`
- `POST /v0/parse-doc` -> `200` with `text`, `format`, `source_path`, nullable `title`, and `page_count`

Full official-plugin Miyo route details now live in:
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/docs/OFFICIAL_MIYO_CONTRACT.md`
