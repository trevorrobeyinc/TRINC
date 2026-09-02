# Handoff → opencode: Copilot Agent Mode + OpenClaw pipeline

**Written 2026-08-14 for the opencode app.** Self-contained: a fresh session can act on this
without any prior conversation. Everything below was verified live on that date; anything
unproven is marked UNVERIFIED.

---

## 1. What you are running inside

Obsidian's **Copilot plugin** (private fork, manifest pinned `99.4.0`, upstream base `4.0.0`)
exposes an **Agent Mode** chat. That chat drives **opencode** over **ACP** (Agent Client
Protocol) as a subprocess:

    Copilot Agent chat --ACP/stdio--> opencode --MCP/stdio--> openclaw-stdio-proxy.mjs
                                                                    |
                                                            HTTPS JSON-RPC
                                                                    v
                                                    Command Center bridge :8799
                                                                    |
                                                              spawns engine
                                                                    v
                                                    node scripts/run-workflow.js

- opencode binary (plugin-managed): `/Users/myhome/.obsidian-copilot/opencode/1.18.16/bin/opencode`
- Session cwd — **this is the AGENTS.md search root**: `/Users/myhome/My Digital Garden`
- Models available: **8 Copilot Plus relay models** served by `models.brevilabs.com` on the
  operator's lifetime license — `copilot-plus-flash`, `kimi-k2.6`, `glm-5.2`, `kimi-k2.7-code`,
  `deepseek-v4-pro`, `deepseek-v4-flash-0731`, `mimo-v2.5`, `minimax-m2.7`. These cost nothing
  beyond the operator's existing quota. **Never select an `opencode/*` (Zen) or `opencode-go/*`
  model here** — those meter opencode's own gateway and were deliberately removed from this picker.

## 2. Your tool surface

Two MCP servers are attached to every ACP session (updated 2026-08-16):
**`command-center`** serving **11 tools**, and **`viz-studio`** (bridge
`https://127.0.0.1:8800`, plugin `trinc-viz-studio`) serving **7 visualization tools** —
`viz_health`, `viz_mermaid`, `viz_chart`, `viz_render_svg`, `viz_canvas`,
`viz_graph_snapshot`, and `viz_guided` (Guided Learning explainer card: staged diagram +
legend + step-by-step key composed into one SVG — the right tool when TEACHING a multi-stage
concept). Viz tools render locally and WRITE INTO THE VAULT under
`Visualizations/`; each returns `{path, embed}` — insert the `![[embed]]` string into a
note to display the result (images never render in chat). Mermaid/chart validation errors
come back with exact positions so you can correct and retry. Auth + allow-set details for
viz-studio mirror command-center's (token at `~/.config/trinc-viz-studio/bridge-token`).

**OpenClaw pipeline (4):**

| Tool | Purpose |
|---|---|
| `obsidian_openclaw_templates` | List workflow templates and their required inputs |
| `obsidian_openclaw_run_workflow` | Start a workflow. Returns IMMEDIATELY with a task id |
| `obsidian_openclaw_status` | Poll a running workflow |
| `obsidian_openclaw_results` | Retrieve output once complete |

**Vault (7):** `obsidian_health`, `obsidian_open_vault`, `obsidian_read_note`,
`obsidian_search_notes`, `obsidian_execute_command`, `obsidian_create_note`,
`obsidian_append_note`.

### The 7 workflow templates (verified live)

| Template id | Required inputs |
|---|---|
| `clinical-trial-landscape` | `therapeutic_area` |
| `drug-discovery-full` | `compound_name`, `indication` |
| `general-research-pack` | `topic` |
| `pharmacovigilance-report` | `drug_class` |
| `rare-disease-brief` | `disease_name` |
| `target-validation-pack` | `target_gene` |
| `trial-design-benchmark` | `indication` |

Definitions live in
`/Users/myhome/TrevClaw-Obsidianodus/Trevor Robey Intelligence Network Citations/config/workflow-templates/`
as one JSON per template. Dropping a new JSON there adds a template automatically — the tool
list is generated from the folder.

**Workflows are ASYNC and take 5–10 minutes.** `run_workflow` returning quickly is success, not
failure. Correct pattern: run → report the task id → poll `status` → present only what `results`
returns. Never describe a report you have not retrieved.

## 3. How the wiring works, and why it is shaped this way

Read this before "fixing" anything that looks unusual.

- **The fork used to send an empty server list.** Three ACP call sites (`session/new`,
  `session/resume`, `session/load`) hardcoded `mcpServers: []`, so Agent Mode had no tools at
  all. The fix is `acpMcpServersFromSettings()` in
  `/Users/myhome/TrevClaw-Obsidianodus/Copilot-Everything/repos/obsidian-copilot-mcp-v4/src/agentMode/acp/acpMcpServers.ts`.
- **stdio, not remote/http — deliberate.** opencode's remote-MCP client speaks HTTP+SSE and
  rejects the bridge with `Invalid content type, expected "text/event-stream"`, because the
  bridge answers `application/json`. Stdio is the baseline transport and avoids negotiation
  entirely.
- **The proxy answers `initialize` locally.** Forwarding the handshake to the bridge stalled on a
  connect timeout during agent preload — the bridge lives *inside* the Obsidian plugin and is not
  listening yet — which froze the UI on **"Loading agent models…"**. Answering locally decouples
  MCP readiness from bridge readiness. **Do not make `initialize` forward again.**
  Source: `/Users/myhome/TrevClaw-Obsidianodus/Copilot-Everything/bridges/openclaw-stdio-proxy/index.mjs`
  Deployed: `/Users/myhome/My Digital Garden/.obsidian/plugins/copilot/openclaw-stdio-proxy.mjs`
- **The `:8798` bridge is EXCLUDED on purpose.** It serves a custom REST surface with no JSON-RPC
  handler; declaring it would fail your MCP handshake. The allow-set is `command-center` +
  `viz-studio` (added 2026-08-16 — the Viz Studio bridge speaks full JSON-RPC, verified live).
- **Auth:** the bridge tokens live at `~/.config/openclaw-command-center/bridge-token` and
  `~/.config/trinc-viz-studio/bridge-token` (mode 0600) and reach the proxy via environment.
  command-center token rotated 2026-08-14. Never print, copy, or log them.

## 4. Hard boundaries — not preferences

1. **Never add these tools to opencode's GLOBAL config** (`~/.config/opencode/opencode.jsonc`).
   That file is shared with a free, web-browsing delegation worker whose MCP surface was
   deliberately stripped on 2026-08-06 (allowlist: read-only AND public-data AND no-exfil).
   Vault-write and workflow-runner tools reaching it would rebuild the exact risk that hardening
   closed. These tools are attached **per ACP session** precisely so that cannot happen.
2. **HTTPS-only.** Every network listener in this stack is HTTPS with no plaintext fallback.
   Never introduce an `http://` path or a degrade-to-plaintext branch.
3. **No privileged operations.** No sudo, no credential entry, no security-gate ceremonies. Root
   work goes through the operator's own gated lane, never through an agent.
4. **Propose, don't perform, for consequential actions** — publishing, sending, deleting, or
   changing security configuration. Surface it and let the operator decide.

## 5. Escape hatch

If Agent Mode hangs or the MCP server misbehaves: in Copilot settings set the `command-center`
MCP server to **disabled**. Reverts cleanly, no rebuild required. A known-good config snapshot
sits at `/Users/myhome/My Digital Garden/.obsidian/plugins/copilot/data.json.pre-mcp-revert`.

## 6. YOUR TASK: author `AGENTS.md`

Copilot's settings now state: *"Agent Mode now reads your instructions from AGENTS.md."*

- **Location:** `/Users/myhome/My Digital Garden/AGENTS.md` — the ACP session cwd.
- **Current state (verified 2026-08-14):** **no AGENTS.md exists there.** You are creating it,
  not editing it. Nothing gets overwritten.
- **Source material to fold in:**
  `/Users/myhome/My Digital Garden/copilot/system-prompts/openclaw.md` (5,415 bytes, titled
  "OpenClaw Research Pipeline Assistant"). It already documents the pipeline tools well —
  migrate its substance rather than reinventing it.

### Draft to adapt

```markdown
# AGENTS.md — Obsidian vault agent instructions

You operate inside the operator's Obsidian vault (My Digital Garden) via Copilot Agent Mode.

## Research pipeline
You have direct access to the OpenClaw biomedical research pipeline through MCP tools. To run
research: call `obsidian_openclaw_templates` to confirm the template id and its required
inputs, then `obsidian_openclaw_run_workflow`. Workflows are asynchronous and take 5–10
minutes — report the task id, poll `obsidian_openclaw_status`, and present findings only after
`obsidian_openclaw_results` returns them. Never describe a report you have not retrieved.

## Vault work
Search before answering from memory — the vault is the source of truth. Use
`obsidian_search_notes` and `obsidian_read_note` to ground answers; create and extend notes
with `obsidian_create_note` and `obsidian_append_note`.

## Standing rules
- Cite the note or workflow result behind each claim. This operator's product is
  citation-traced due diligence, so an unsourced assertion is a defect, not a style issue.
- Research artifacts only — not validated for clinical decision support. No PHI is handled.
- Never perform privileged or system-level operations; surface them for the operator instead.
- Prefer the fewest tool calls that fully answer the question.
```

Tune the wording freely; keep the tool names, the async contract, and the standing rules exact.

## 7. Status at handoff

**Verified live:** the MCP server attaches to every session; `session ready` is reached; no
`server unavailable` errors since the fix; `obsidian_openclaw_templates` executed and returned
all 7 templates with their inputs.

**UNVERIFIED:** a model actually *choosing* to call one of these tools inside a chat turn. That
requires a real conversation to confirm.
