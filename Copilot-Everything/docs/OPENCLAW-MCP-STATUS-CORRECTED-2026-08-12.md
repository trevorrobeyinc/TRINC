# OpenClaw / Obsidian MCP — corrected status, 2026-08-12

Supersedes the breakdown produced by the Obsidian Copilot plugin's own chat on 2026-08-12.

## Why the original was wrong

Copilot answered from **vault content only**. It can read `/Users/myhome/My Digital Garden`,
but the engine, the bridges, and the workflow templates all live **outside** the vault in
`/Users/myhome/TrevClaw-Obsidianodus/`. Everything it could not see, it reported as missing.

A second distortion compounded it: Copilot had just been auto-updated to **stock upstream
4.0.0**, wiping the MCP-capable fork. It was describing a codebase that had lost the very
feature it was being asked about.

**Net result: 5 of 6 "missing" items were not missing.** Acting on the checklist as written
would have rebuilt a plaintext `:8787` bridge that never existed and resurrected a local-model
lane that was deliberately retired.

## Claim-by-claim adjudication

| # | Original claim | Verdict | Evidence |
|---|---|---|---|
| 1 | OpenClaw Obsidian plugin missing; 10 MCP tools absent | **FALSE (misattributed)** | `command-center` plugin is installed and enabled (`main.js` 74,935 B, 2026-07-31). Tool names are wrong: the real ids are `mcp_local-obsidian-mcp_obsidian_*` and `mcp_command-center_*`, not `obsidian_openclaw_*`. The tools are dark because the **fork was wiped**, not because a plugin is absent. |
| 2 | MCP server config missing from `main.js` | **FALSE** | Config lives in `data.json`, never `main.js`, and it is intact: two servers at `https://127.0.0.1:8798` and `https://127.0.0.1:8799`. Already HTTPS. |
| 3 | Bridge server on `:8787` missing | **FALSE PREMISE** | Nothing listens on `:8787` and nothing in this architecture ever did. The real bridges are `:8798` (canonical, launcher-owned) and `:8799` (Command Center). Both returned `200` on `/healthz`. |
| 4 | Workflow templates missing | **FALSE** | All six exist, plus a seventh, in `Trevor Robey Intelligence Network Citations/config/workflow-templates/` — outside the vault. |
| 5 | Pipeline backend missing | **FALSE (outside vault)** | The engine is `Trevor Robey Intelligence Network Citations/`, run on demand via `node scripts/run-workflow.js`. Not a vault artifact and not a persistent service. |
| 6 | Recreate `Modelfile.openclaw` / `openclaw-gemma3` | **TRUE but MUST NOT BE DONE** | Genuinely absent — and so is Open Interpreter (`which interpreter` → nothing) and the `.venv311` it referenced. Rebuilding it would contradict the 2026-07-16 decision that the engine is 100% Claude. Tombstoned instead. |

## What was actually broken

**The Copilot fork was overwritten by an auto-update** on 2026-08-12 02:41. Upstream 4.0.0
sorted above the fork's pinned 3.3.3, so Obsidian updated over it. Upstream has no HTTP MCP
client (`mcp/tool`: 1 → 0, `httpEndpoint`: 4 → 0), so every bridge-backed tool went dark while
its configuration sat untouched in `data.json`.

This is the whole reason Copilot could not find the OpenClaw tools.

## What was fixed on 2026-08-12

- **`scripts/verify_local_openclaw.sh` rewritten** — was probing plaintext `http://…:8787/health`
  and `http://localhost:11434`, and testing a model that does not exist. Now probes `:8798`,
  `:8799`, and `:11435` over HTTPS pinned to the mkcert CA, and exercises `qwen2.5-coder:7b`.
  **Passes: `ALL CHECKS PASSED`.**
- **`scripts/openclaw-interpreter.sh` tombstoned** — all four dependencies verified gone.
- **Ollama re-wrapped in HTTPS** — Ollama.app returned and resumed serving plaintext `:11434`;
  the `:11435` TLS proxy was restored (launchd `com.trevorrobey.ollama-tls-proxy`) and the
  transport lint returns to **0 violations**.
- **CLAUDE.md corrected** — root (5 stale "Ollama fully removed" claims) and Copilot-Everything
  (fork-wipe post-mortem, corrected auto-update guidance).

## Resolved — port complete, same day

The MCP module was **ported onto upstream 4.0.0 and deployed**. New vendored fork at
`repos/obsidian-copilot-mcp-v4` (upstream tag `a78b69b` + the MCP module), manifest `99.4.0`.

Two surprises the touchpoint scan had missed, both caught by `tsc`:

1. **`ToolRegistry.ts` was modified by the fork**, not merely referenced — it adds `providerId?` to
   `ToolMetadata` plus `removeByProvider()` / `replaceByProvider()`. The scan saw only a doc comment.
2. **Zod v3 → v4.** Upstream 4.0.0 ships zod `4.4.3`; `z.record(valueType)` must become
   `z.record(keyType, valueType)`.

`tsc -noEmit` exits 0, `npm run build` exits 0, and the catalog gained **`miyo_search_context`**
(11 → 12 tools), schema mirrored from the bridge's own zod definition.

**Auto-update hardened:** manifest pinned to `99.4.0` with the real base in `upstreamBase: "4.0.0"`.
Obsidian only updates when the registry version sorts higher, so 99.x is never superseded. Matching
upstream exactly is the defense that failed this morning.

**Runtime proof:** after deploy + reload the bridge reports
`"sse_subscribers_total{stream=research}": 1` — the ported `McpEventBridge` holding a live SSE
connection. That counter was empty beforehand.

## Ground truth (verified 2026-08-12)

| surface | address | status |
|---|---|---|
| Obsidian MCP bridge | `https://127.0.0.1:8798/healthz` | 200 |
| OpenClaw Command Center | `https://127.0.0.1:8799/healthz` | 200 |
| Ollama via TLS proxy | `https://127.0.0.1:11435/v1` | 200, `qwen2.5-coder:7b` |
| Local REST API | `https://127.0.0.1:27124` | backing :8798 |
| ~~OpenClaw bridge~~ | ~~`http://127.0.0.1:8787`~~ | **never existed** |
