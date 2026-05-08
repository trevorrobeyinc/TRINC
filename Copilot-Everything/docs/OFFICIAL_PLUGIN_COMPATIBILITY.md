# Official Plugin Compatibility

Date: 2026-03-24

## Current Runtime Direction

The current target runtime for the official `copilot` plugin is no longer the emulator path described below.

Use this instead:

- `direct_plugin_mcp` in the official plugin
- shared HTTP MCP server at `https://127.0.0.1:8798`
- native Miyo HTTP at `http://127.0.0.1:8742`

The emulator content in this document is retained as historical compatibility evidence and rollback context only. For the live official-plugin runtime, see `/Users/trevorrobey/THE Copilot in Obsidian Everything/docs/OFFICIAL_DIRECT_MCP_MIYO_RUNTIME.md`.

## 2026-03-24 Exact Chat Repair

The installed `copilot` plugin exact-chat path was repaired on 2026-03-24.

What changed:

- `repos/obsidian-copilot-mcp/src/LLMProviders/chainRunner/SelfHostEmulatorChainRunner.ts`
  - exact-mode requests for `copilot-plus` models now decrypt and forward `plusLicenseKey` as the model API key
- `backend/copilot-backend-emulator/src/services/SelfHostExecutionEngine.ts`
  - empty final model text now throws a descriptive error instead of returning a fake success with only hidden reasoning markup

Observed effect:

- before the fix, exact backend emulator mode in the plugin UI could complete the HTTP turn to `/v1/self-host/agent-turn` but render as a blank chat bubble
- after the fix, exact mode can use `copilot-plus-flash|copilot-plus` correctly, and auth problems now surface as explicit errors

This does not change the intended runtime direction for the official plugin. It restores the exact-emulator lane as a working alternate path for rollback, validation, and architecture-proof testing.

## Status

Current fork:

- primary target
- canonical contract remains `v1/self-host/*`
- lane policy enforces buffered mode by default for `production_official` traffic

Official plugin:

- secondary target only
- validated side-by-side against the refreshed stable `3.2.5` bundle in the dev vault
- Miyo-compatible `/v0/*` aliases now work for the open and self-host-visible routes re-tested in this pass

## What Worked

### Direct emulator alias validation

Validated with:

- `cd "/Users/trevorrobey/THE Copilot in Obsidian Everything/backend/copilot-backend-emulator" && MIYO_TEST_VAULT="/Users/trevorrobey/THE Copilot in Obsidian Everything/dev-vault" SELF_HOST_API_KEY="copilot-mcp-dev-self-host-key" EMULATOR_BASE_URL="https://127.0.0.1:8789" npm run official-compat`

Results:

- `GET /v0/health` -> `200`
- `POST /v0/search` -> `200`
- `POST /v0/search/related` -> `404` pass-through when the source note is not indexed
- `POST /v0/parse-doc` -> `200`

Evidence:

- `/Users/trevorrobey/THE Copilot in Obsidian Everything/configs/validation/official-plugin-miyo-http-alias.json`

### Side-by-side official plugin runtime validation

Validated with:

- `/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/official-plugin-miyo-check.sh`

That script temporarily pointed the installed `copilot` plugin at the emulator through `miyoServerUrl`, exercised the official plugin's own Miyo client path, and restored the plugin data file afterward.

Results from the official plugin runtime:

- plugin version was `3.2.5`
- base URL resolved to `https://127.0.0.1:8789`
- active backend key was `miyo`
- the Miyo client header probe exposed `Authorization` only and no `X-API-Key`
- `GET /v0/health` returned `true` to `isBackendAvailable(...)`
- `POST /v0/search` returned a valid results envelope
- `POST /v0/parse-doc` returned parsed PDF text
- `POST /v0/search/related` surfaced the real downstream `404` as `Error: Miyo request failed with status 404`
- a targeted follow-up runtime probe confirmed that a non-empty `miyoVaultName` changes the `sourceId` the official plugin sends

Evidence:

- `/Users/trevorrobey/THE Copilot in Obsidian Everything/configs/validation/official-plugin-miyo-runtime.json`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/configs/validation/official-plugin-miyo-console.txt`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/configs/validation/official-plugin-miyo-sample.pdf`

## Exact Request And Response Summary

Official plugin runtime request payloads:

- header probe:
  - keys: `["Authorization"]`
  - `hasAuthorization: true`
  - `hasApiKey: false`

- health:
  - route: `GET /v0/health`
- search:
  - route: `POST /v0/search`
  - body:
    - `query: "official plugin compatibility smoke test"`
    - `vault: "/Users/trevorrobey/THE Copilot in Obsidian Everything/dev-vault"`
    - `limit: 3`
- related:
  - route: `POST /v0/search/related`
  - body:
    - `file_path: "README.md"`
    - `vault: "/Users/trevorrobey/THE Copilot in Obsidian Everything/dev-vault"`
    - `limit: 3`
- parse-doc:
  - route: `POST /v0/parse-doc`
  - body:
    - `path: "/Users/trevorrobey/THE Copilot in Obsidian Everything/configs/validation/official-plugin-miyo-sample.pdf"`

Observed plugin-visible results:

- search:
  - `results: []`
  - `query: "official plugin compatibility smoke test"`
  - `count: 0`
- parse-doc:
  - `text: "Official plugin Miyo compatibility t"`
  - `format: "pdf"`
  - `page_count: 1`
- related:
  - thrown error string:
    - `Miyo request failed with status 404`

## What Is Implemented But Not Fully Re-Tested In The Official Runtime

The emulator now also aliases these open and self-host-visible index routes as pass-through Miyo compatibility routes:

- `POST /v0/index/upsert`
- `DELETE /v0/index/by_path`
- `POST /v0/index/clear`
- `GET /v0/index/files`
- `GET /v0/index/stats`
- `GET /v0/index/documents`

These were derived from `src/miyo/MiyoClient.ts` and `src/search/indexBackend/MiyoIndexBackend.ts`, but this pass did not run a separate official-plugin runtime smoke for each one.

## Remaining Gaps

### Open and implementable later

- exercise the index-route alias set from the side-by-side official plugin runtime, not just direct emulator validation
- run a related-search success-path smoke once the dev vault has indexed note chunks for the target source note
- run a full end-to-end re-index smoke under a non-default `miyoVaultName`, not just the confirmed `sourceId` override probe

### Intentionally out of scope

- hosted Copilot backend behavior
- undocumented Brevilabs internals
- mutating the canonical fork-owned `v1/self-host/*` schema to match official-plugin aliases

## Conclusion

The emulator can now serve both:

- the fork-owned canonical `v1/self-host/*` boundary for `copilot-mcp`
- the official plugin's open and self-host-visible Miyo `/v0/*` surface for the validated health, search, related-search, and parse-doc paths

The official plugin result is now "validated for the refreshed stable `3.2.5` Miyo compatibility surface exercised in this pass," not "blocked."
