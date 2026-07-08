# Cowork Handoff: OpenClaw Command Center Plugin

End-to-end test checklist for the OpenClaw Command Center Obsidian plugin. Run these steps inside Obsidian on Trevor's Mac.

## Prerequisites

| Service | Expected State | Verify |
|---------|---------------|--------|
| Node.js 22.13.1 | Installed via nvm | `~/.nvm/versions/node/v22.13.1/bin/node --version` |
| Miyo (via TLS proxy :8743 → upstream :8742) | Running | `curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:8743/v0/health` |
| Qdrant (via TLS proxy :6433 → upstream :6333) | Running (Miyo backend) | `curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:6433/` |
| OpenClaw repo | Present at `/Users/trevorrobey/OpenClaw-Research-Agents` | `ls /Users/trevorrobey/OpenClaw-Research-Agents/scripts/run-workflow.js` |
| Zettelkasten MCP | Present at `/Users/trevorrobey/Claude/Medical-Zettelkasten-MCP/src/server.js` | `ls` the path |

## Step 1: Verify Plugin is Installed

Open Obsidian. Go to Settings > Community plugins. Confirm "OpenClaw Command Center" appears in the list and is **enabled**.

If not listed:
- Check that these 3 files exist in `/Volumes/ExtraCurricular/My Digital Garden/.obsidian/plugins/openclaw-command-center/`:
  - `main.js` (34KB+)
  - `manifest.json`
  - `styles.css`
- Restart Obsidian and re-enable

## Step 2: Verify Plugin Settings

Go to Settings > OpenClaw Command Center. Confirm:

| Setting | Expected Value |
|---------|---------------|
| OpenClaw path | `/Users/trevorrobey/OpenClaw-Research-Agents` |
| Zettelkasten MCP server path | `/Users/trevorrobey/Claude/Medical-Zettelkasten-MCP/src/server.js` |
| Node.js path | `/Users/trevorrobey/.nvm/versions/node/v22.13.1/bin/node` |
| Output folder | `OpenClaw` |
| Auto-generate notes | ON |
| Auto-run Zettelkasten | ON |
| Enable Miyo | ON |
| Miyo port | `8742` |
| Similarity threshold | `0.5` |
| Max results | `10` |
| Bridge status | "Running on port 8798" (green) |
| Enable on startup | ON |
| Bridge port | `8798` |
| Poll interval | `2000` |
| Workflow timeout | `600000` |

Verify the green "OpenClaw path verified." message appears below the OpenClaw path field.

## Step 3: Verify Commands in Command Palette

Open the command palette (Cmd+P). Search for "OpenClaw". Confirm these 4 commands appear:

1. **OpenClaw: Run Workflow**
2. **OpenClaw: Cancel Running Workflow**
3. **OpenClaw: Toggle Pipeline Status Sidebar**
4. **OpenClaw: Run Zettelkasten Analysis on Current Note**

## Step 4: Verify Pre-Generated Test Notes

Navigate in the file explorer to:

```
OpenClaw/target-validation-pack/2026-04-01 oncology TP53/
```

Confirm 6 notes exist:

| Note | Type | Key Content |
|------|------|-------------|
| `Overview.md` | Workflow overview | Pipeline table (6/6 completed), wikilinks to all agents |
| `Scout.md` | Agent output | ~20K chars, OpenTargets/UniProt/STRING scout report |
| `Analyst.md` | Agent output | ~33K chars, target validation framework |
| `Synthesizer.md` | Agent output | ~33K chars, cross-domain synthesis |
| `Quality Audit.md` | Quality report | Confidence: 1.00, 289/765 verified claims, PASS |
| `Dataset Card.md` | Dataset metadata | Dataset ID, 320 rows |

For each note, check:
- [ ] YAML frontmatter parses (Reading view shows metadata, not raw YAML)
- [ ] `type` field starts with `openclaw/`
- [ ] `tags` field is an array starting with `openclaw`
- [ ] Wikilinks resolve to other notes in the same folder (click them)

## Step 5: Verify Dataview Integration

Open the Overview note. In a new note (or the Obsidian console), run this Dataview query:

````
```dataview
TABLE type, quality_confidence, status, template
FROM "OpenClaw"
WHERE type = "openclaw/workflow"
```
````

Expected: 1 row showing `target-validation-pack`, confidence `1`, status `completed`.

Also try:

````
```dataview
TABLE agent_role, provider, model, token_count
FROM "OpenClaw"
WHERE type = "openclaw/agent-output"
SORT token_count DESC
```
````

Expected: 3 rows (scout, analyst, synthesizer) with `claude-code` provider and `claude-sonnet-4-6` model.

## Step 6: Test Sidebar

1. Click the **activity** ribbon icon (left sidebar) or run **OpenClaw: Toggle Pipeline Status Sidebar**
2. The right sidebar should show "OpenClaw Pipeline" with an idle state
3. Verify no console errors (Cmd+Option+I > Console tab)

## Step 7: Test "Analyze Current Note" Command

1. Open `OpenClaw/target-validation-pack/2026-04-01 oncology TP53/Synthesizer.md`
2. Run command palette > **OpenClaw: Run Zettelkasten Analysis on Current Note**
3. Expected behavior:
   - Status bar shows "OpenClaw: analyzing note..."
   - The Zettelkasten MCP server starts as a subprocess
   - After 10-30 seconds, a "Zettelkasten Graph Intelligence" section is appended to the note
   - The section should contain 1-5 of: Cross-Domain Connections, Blind Spots, Semantic Relationships, Orphan Rescue Proposals, Serendipitous Connections
   - If Miyo is running, a "Semantic Connections (Miyo)" section should also appear with `[[note title]] (similarity: 0.XX)` links
   - Status bar returns to "OpenClaw: idle"
4. If it fails, check the dev console (Cmd+Option+I) for error messages

**Note**: This command spawns the Zettelkasten MCP server as a child process. If the MCP server has never been run before, you may need to run `npm ci` in `/Users/trevorrobey/Claude/Medical-Zettelkasten-MCP/` first.

## Step 8: Test "Run Workflow" (Burns Claude Tokens)

**WARNING**: This step uses real Claude Max Pro tokens (~300K tokens per workflow). Only proceed if you intend to generate new research output.

1. Run command palette > **OpenClaw: Run Workflow**
2. A modal should appear showing template cards (6 templates)
3. Select **drug-discovery-full**
4. Fill in:
   - `compound_name`: `aspirin`
   - `indication`: `pain`
5. Click **Run**
6. Expected:
   - Sidebar shows pipeline progress (step-by-step)
   - Status bar shows current step name and progress (e.g., "research (1/6)")
   - After 5-10 minutes, "Workflow complete" notice appears
   - New notes auto-generated in `OpenClaw/drug-discovery-full/2026-04-04 aspirin pain/`
   - If Auto-run Zettelkasten is ON, Zettelkasten analysis is appended to the Synthesizer note
   - Overview note opens automatically

To cancel mid-run: command palette > **OpenClaw: Cancel Running Workflow**

**Note (citation-integrity gate)**: As of the post-research engine work, the underlying `run-workflow.js` engine runs a report-level citation gate before shipping. A workflow can now legitimately HARD-FAIL with `PHASE30_CITATION_UNVERIFIED` (the grounded-citation ratio fell below `minGroundedCitationRatio`, agent-config default `0.34` — i.e. too many cited identifiers were not present in the evidence actually retrieved at runtime) or `PHASE30_CITATION_RETRACTED` (a cited DOI is flagged retracted by the Crossref retraction screen). If a run errors with one of these codes, that is the gate refusing to ship a report, not a plugin bug. On a passing run, the mission bundle also includes two new deliverables — `deliverables/citation-integrity.md` (graded provenance ledger) and `deliverables/graveyard-memo.md` (prior terminated/withdrawn/suspended trials in the indication + protocol amendment-risk band).

## Step 9: Check Obsidian Dev Console for Errors

Open Cmd+Option+I > Console tab. Look for:
- [ ] No red errors from the plugin
- [ ] No "Module not found" or "Cannot read property" errors
- [ ] `[OpenClaw]` log messages show expected lifecycle events

## Step 10: Produce Validation Report

Create a new note at `OpenClaw/VALIDATION_REPORT.md` with:

```markdown
---
type: openclaw/validation
validated_by: cowork
validated_at: <ISO timestamp>
---

# OpenClaw Plugin Validation Report

## Checklist
- [ ] Plugin loads without errors
- [ ] Settings tab renders all fields
- [ ] 4 commands appear in palette
- [ ] Test notes have valid frontmatter
- [ ] Wikilinks resolve between notes
- [ ] Dataview queries return expected data
- [ ] Sidebar renders idle state
- [ ] Analyze Current Note produces Zettelkasten appendix
- [ ] Miyo semantic connections appear (if Miyo running)
- [ ] Run Workflow modal shows templates (visual check only, or full run)

## Issues Found
<!-- List any bugs, rendering problems, or unexpected behavior -->

## Notes
<!-- Any observations about performance, UX, or suggestions -->
```

---

## Architecture Quick Reference

### Plugin Structure

```
src/
  main.ts              — Plugin entry point, 4 commands, orchestration, bridge lifecycle + startBridge/stopBridge
  types.ts             — All TypeScript interfaces
  constants.ts         — Defaults, view types, step labels
  settings.ts          — Settings tab UI (Paths, Vault, Behavior, Miyo, Copilot Bridge w/ Start/Stop, Advanced)
  bridge/
    mcp-bridge-server.ts — In-plugin HTTP bridge (port 8798), 7 obsidian_* tools via direct API
  subprocess/
    openclaw-runner.ts — Spawns run-workflow.js as child process
    zettelkasten-client.ts — MCP JSON-RPC 2.0 client for ZK server
  workflow/
    workflow-modal.ts  — Template picker + input form
    workflow-tracker.ts — Polls workflow.json for progress
    workflow-history.ts — Scans past workflow runs
  notes/
    note-generator.ts  — Reads OpenClaw output, creates vault notes
    frontmatter.ts     — YAML frontmatter for all note types
    content-builder.ts — Markdown body for all note types
  views/
    workflow-sidebar.ts — Pipeline progress sidebar
  copilot-integration/
    miyo-client.ts     — HTTP client for Miyo semantic search
  zettelkasten/
    linker.ts          — Runs 5 ZK commands + Miyo, appends to notes
  util/
    json-reader.ts     — Safe JSON file reading
    path-resolver.ts   — OpenClaw workspace path resolution
```

### Data Flow

```
User picks template → WorkflowModal
  → OpenClawRunner.run() spawns node run-workflow.js
  → WorkflowTracker polls workflow.json every 2s
  → Sidebar shows real-time progress
  → On complete:
    → generateWorkflowNotes() reads output files → creates 6 vault notes
    → runZettelkastenLinking() spawns MCP server → 5 graph commands + Miyo search
    → Results appended to Synthesizer note
    → Overview note opened automatically
```

### Key Subprocess Details

- **run-workflow.js**: Spawned with `--template`, `--inputs '{"..."}' `, `--confirm`. No `--provider` flag. Uses Node.js at the configured path (NOT Electron's node).
- **Zettelkasten MCP**: Spawned as `node server.js` with JSON-RPC 2.0 over stdin/stdout. Protocol version `2025-06-18`.
- **Miyo**: HTTP requests to `127.0.0.1:8742`. Degrades gracefully if not running.

### Engine-Side Citation Integrity (run-workflow.js / openclaw-bridge)

The `run-workflow.js` engine the plugin spawns now enforces a zero-fabrication citation layer before a report ships. This is engine-side, not plugin-side — the plugin just reads the output it produces:

- **Citation gate** (report-level): cross-checks every identifier (PMID/NCT/DOI) cited in the assembled report against the union of identifiers actually retrieved at runtime by tool-prefetch. A cited id present in that fetched evidence is "grounded"; one that is not is "ungrounded" (likely model-introduced). The report is **grounded in the source records actually retrieved at runtime + DOI retraction-screened against Crossref** — it is NOT independently re-resolved against each citation's live source database. Hard-fails with `PHASE30_CITATION_UNVERIFIED` when the grounded ratio is below `minGroundedCitationRatio` (default `0.34`); surviving ungrounded cites are annotated inline `[UNVERIFIED]`. Writes `citation-verification.json` + `report-annotated.md` to the workflow dir. Engages only when there is fetched ground truth.
- **Retraction screen**: each cited DOI is checked against Crossref; a report citing any retracted paper hard-stops with `PHASE30_CITATION_RETRACTED`. Fail-soft — a Crossref network error yields no retractions and can never wrongly block a report.
- **Stopped-trial corpora**: a local ClinicalTrials.gov v2 fetcher pulls TERMINATED/WITHDRAWN/SUSPENDED trials for the indication (each trial's `whyStopped` text + protocol change-history), routed into role prefetch as `ctgov_stopped_trials`. Each record is NCT-traced.
- **New deliverables** (in every passing mission bundle, registered in `manifest.json` + sealed in `checksums.txt`):
  - `deliverables/citation-integrity.md` — graded provenance ledger (grade A/B/C/D from the grounded ratio; F/"BLOCKED" on any retraction; N/A if nothing cited).
  - `deliverables/graveyard-memo.md` — prior terminated/withdrawn/suspended programs in the indication, each NCT-traced with the sponsor's stated stop reason (or an explicit "(none stated by sponsor)" — never invented) and a resolvable `clinicaltrials.gov/study/<NCT>` link, plus a protocol amendment-risk band (LOW/MODERATE/HIGH). Rendered deterministically from the fetched records (no LLM). Memo wiring is fully fail-soft: an absent fetcher / empty indication / fetch error simply omits the memos and never blocks a passing report.

### MCP Bridge (Auto-Start, In-Plugin, Manual Controls)

The plugin includes an HTTP bridge server at `src/bridge/mcp-bridge-server.ts` that runs **inside the plugin process**. It starts automatically when Obsidian loads (gated on `workspace.onLayoutReady`) and stops when the plugin unloads.

**Manual Start/Stop**: Settings > OpenClaw Command Center > Copilot Bridge shows:
- A **live status indicator**: "Running on port 8798" (green) or "Stopped" (red)
- A **Start** button to manually start the bridge
- A **Stop** button (warning-styled) to manually stop the bridge
- An **Enable on startup** toggle to control auto-start behavior

**Key difference from the standalone bridge** (`openclaw-bridge/obsidian-mcp-bridge.js`):
- Uses direct Obsidian API instead of filesystem reads. Advanced URI URL-scheme calls have been fully retired (2026-05-09) in favor of the Obsidian Local REST API plugin (https://127.0.0.1:27124) for any external/out-of-process callers; in-process plugin code uses the Obsidian API directly.
- `obsidian_execute_command` calls `app.commands.executeCommandById()` directly — no `execSync(open ...)` needed
- `obsidian_read_note` calls `app.vault.read()` — no filesystem access needed
- Auto-starts and auto-stops with the plugin lifecycle
- Start/Stop buttons in settings for manual control without reloading Obsidian

**Port conflict**: If the standalone bridge is already running on port 8798, the in-plugin bridge will log `[OpenClaw] Bridge port 8798 is already in use` and skip startup. Stop the standalone bridge first, then reload Obsidian.

**Error resilience**: Start/Stop methods include double-click guards, zombie server cleanup on failed starts, and try/finally patterns ensuring `bridgeServer` is always nulled on stop even if `server.close()` throws.

**Settings**: Enable/disable in Settings > OpenClaw Command Center > Copilot Bridge. Port defaults to 8798 (matching the Copilot MCP config).

### Copilot System Prompt (One-Time Manual Step)

The system prompt file exists at `copilot/system-prompts/openclaw.md` with title "OpenClaw Command Center". The Copilot plugin is configured to read system prompts from that folder.

To enable auto-loading into every Copilot chat:
1. Open Obsidian Settings > Copilot
2. Scroll to "Default System Prompt"
3. Set it to "OpenClaw Command Center"

This is a one-time manual step. The OpenClaw plugin cannot programmatically set another plugin's config.

### Skipped: Copilot Model Integration (Part 4)

Backend emulator (8789) and MCP bridge (8798) are not running. Narrative summaries from the Copilot LLM are a future enhancement. The structured graph analysis data from Zettelkasten is already readable without an LLM wrapper.

### generate-test-notes.js CLI Usage

The test note generator now accepts a workflow ID as a CLI argument:

```bash
node scripts/generate-test-notes.js --workflow-id <workflow-id>
node scripts/generate-test-notes.js <workflow-id>
node scripts/generate-test-notes.js  # uses default: workflow-f8f81f08fb1400c28850a974
```
