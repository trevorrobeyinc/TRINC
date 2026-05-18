# Transcribe & Save — Architecture & Operations

The **Transcribe & Save** Raycast command takes a video URL, hands it to Downie 4
to download, transcribes the resulting MP4 with Whisper, and asks the Obsidian
Copilot plugin's `Summarize` custom prompt to produce a polished structured
note. Both the source/transcript and the summary land in the user's vault.

This document captures the architecture, the files that constitute it, the
one-time setup that has to be in place on the host machine, the per-stage
runtime workflow with timing data from a known-good run, and the troubleshooting
playbook for the failure modes we hit while building it.

Last updated: 2026-05-06.

> **2026-05-06 — End-to-end HMAC.** The bridge no longer dispatches via the
> un-authed Obsidian CLI binary by default. A new `plugin` backend
> (`InprocPluginBackend`) forwards every operation to the `claude-mcp-inproc`
> Obsidian community plugin over an HMAC-authenticated UDS at
> `/tmp/claude-mcp-inproc.sock`. CLI remains as automatic fallback if the
> plugin is unavailable. This change is transparent to Transcribe & Save and
> every other bridge consumer (see
> [`docs/HMAC_PLUGIN_BACKEND.md`](../HMAC_PLUGIN_BACKEND.md)).

---

## Overview

```
User pastes Wiley URL into Raycast → Bridge gate → Downie download →
poll vault folder → Whisper transcribe → bridge writes source note →
bridge writes summary draft → Obsidian opens summary draft →
bridge triggers copilot:summarize → Copilot rewrites note →
poll until stable → done.
```

The command is implemented as a Raycast extension command that delegates to a
flow function. Every stage emits a structured JSONL log line so a halt can be
diagnosed without re-running the workflow.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Raycast extension (~/.config/raycast/extensions/obsidian/)                  │
│  ┌──────────────────────────┐                                               │
│  │ videoTranscribeCommand   │  Form: Video URL + Title (optional)           │
│  │ .tsx (entry component)   │                                               │
│  └────────────┬─────────────┘                                               │
│               │ submit                                                       │
│               ▼                                                              │
│  ┌──────────────────────────┐                                               │
│  │ runVideoTranscribeCommand│ ◄── tools/videoTranscribeFlow.ts             │
│  └────┬─────────┬─────────┬─┘                                               │
│       │         │         │                                                 │
│       │         │         └─► transcribeLogger ─► ~/.claude/logs/           │
│       │         │                                  raycast-transcribe-save  │
│       │         │                                  .jsonl                   │
│       │         ▼                                                           │
│       │   MCPClient (HTTPS, mkcert, replay-protected)                       │
│       │      │                                                              │
│       ▼      ▼                                                              │
│  spawn shortcuts run                                                        │
│   ↓ on error fallback                                                       │
│  spawn open -a "Downie 4" <url>                                             │
└──────┼──────────────────────────────────────────────────────────────────────┘
       │                       ▲
       ▼                       │
┌─────────────┐         ┌──────┴──────────────────────────────────────────────┐
│ Downie 4    │         │ obsidian-copilot-bridge (HTTPS :8798)               │
│ writes mp4  │         │ child process spawned by obsidian-bridge-launcher   │
│ to vault    │         │ Obsidian plugin                                     │
│ Video       │         │  ┌────────────────────────────────────┐             │
│ Downloads/  │         │  │ obsidian_health, obsidian_create_  │             │
└─────────────┘         │  │ note, obsidian_read_note,          │             │
                        │  │ obsidian_execute_command, ...      │             │
                        │  └─────────────────┬──────────────────┘             │
                        └────────────────────┼──────────────────────────────┘
                                             │
                                             ▼ (CLI dispatch via Obsidian's
                                                command-line interface)
                        ┌────────────────────────────────────────────────────┐
                        │ Obsidian.app                                       │
                        │  ┌──────────────────────────────┐                  │
                        │  │ Copilot plugin (custom prompt│                  │
                        │  │ Summarize)                   │                  │
                        │  └──────────────────────────────┘                  │
                        │  ┌──────────────────────────────┐                  │
                        │  │ Claude Console Mirror plugin │                  │
                        │  │ → ~/.claude/logs/obsidian-   │                  │
                        │  │   console.jsonl              │                  │
                        │  └──────────────────────────────┘                  │
                        └────────────────────────────────────────────────────┘
```

Key invariants:

- **Bridge is owned by Obsidian**: the canonical MCP bridge on `https://127.0.0.1:8798`
  is spawned as a child process by the `obsidian-bridge-launcher` Obsidian plugin —
  no separate pm2/launchd daemon. Bridge dies with Obsidian.
- **Single MCP server**: the previously-running standalone `raycast-obsidian-mcp`
  on `:18799` was decommissioned; its LaunchAgent is unloaded.
- **Title precedence**: user-supplied form Title > MP4 iTunes-atom title >
  Spotlight `kMDItemTitle` > humanized URL slug from `kMDItemWhereFroms` > filename.
- **Destination precedence**: parent folder of the active markdown editor
  (read from Obsidian's `workspace.json`) > Summary Output Folder preference
  fallback (default `obsidian-copilot-summaries`) > vault root.

---

## Files inventory

### Created during this build

| Path | Size | mtime | Purpose |
|------|------|-------|---------|
| `/Users/trevorrobey/.config/raycast/extensions/obsidian/src/lib/transcribeLogger.ts` | 1601 B | 2026-05-05 03:46 | Fire-and-forget JSONL logger that writes to `~/.claude/logs/raycast-transcribe-save.jsonl`. Never throws. |
| `/Volumes/ExtraCurricular/My Digital Garden/.obsidian/plugins/claude-console-mirror/manifest.json` | 418 B | 2026-05-05 03:55 | Obsidian plugin manifest for the renderer console mirror. |
| `/Volumes/ExtraCurricular/My Digital Garden/.obsidian/plugins/claude-console-mirror/main.js` | 3700 B | 2026-05-05 03:55 | Hooks `console.log/warn/error`, `window.error`, `unhandledrejection` and writes JSONL to `~/.claude/logs/obsidian-console.jsonl`. Idempotent. |
| `/Users/trevorrobey/.claude/snippets/obsidian-console-mirror.runjs.md` | 3902 B | 2026-05-05 03:47 | Documented RunJS snippet for installing the console mirror manually (alternative to the plugin). |
| `/Users/trevorrobey/.claude/plans/between-ports-8789-floating-micali.md` | 12070 B | 2026-05-04 20:47 | Original implementation plan covering the bridge consolidation + Downie rebuild. |

### Modified during this build

| Path | mtime | Change |
|------|-------|--------|
| `/Users/trevorrobey/.config/raycast/extensions/obsidian/src/tools/videoTranscribeFlow.ts` | 2026-05-05 05:25 | Full rewrite. Bridge health gate, Downie shortcut + open-a fallback, polling with race-fuzz, Whisper streaming with progress toast, dynamic destination from `workspace.json`, Title resolution chain, Copilot trigger via bridge, JSONL telemetry per stage. |
| `/Users/trevorrobey/.config/raycast/extensions/obsidian/src/tools/aiSummarizeFlow.ts` | 2026-05-04 20:59 | Dropped `BackendEmulatorService` dual-path. Raycast AI is the canonical summarizer when called through this helper (Transcribe & Save no longer uses it; PDF Summarize still does). |
| `/Users/trevorrobey/.config/raycast/extensions/obsidian/src/tools/pdfSummarizeFlow.ts` | 2026-05-04 21:02 | Dropped retired `BackendEmulatorService.parseDoc` first-attempt; falls straight to local extractors. |
| `/Users/trevorrobey/.config/raycast/extensions/obsidian/src/api/mcp/mcpClient.service.ts` | 2026-05-05 00:13 | Default endpoint now HTTPS. Loads bridge config from canonical path. Replaced undici fetch with `node:https.request` so we can disable cert verification for the localhost mkcert cert. |
| `/Users/trevorrobey/.config/raycast/extensions/obsidian/src/obsidian/internal/obsidian.ts` | 2026-05-05 05:08 | Guard `getVaultsFromPreferences` against undefined `pref.vaultPath` (was throwing "Cannot read properties of undefined (reading 'split')" for users who never set the preference). |
| `/Users/trevorrobey/.config/raycast/extensions/obsidian/src/videoTranscribeCommand.tsx` | 2026-05-05 05:24 | Added optional `videoTitle` Form.TextField after the URL field. |
| `/Users/trevorrobey/.config/raycast/extensions/obsidian/src/tests/backendPlanner.spec.ts` | 2026-05-05 00:14 | Updated mock to shim `node:http(s).request` (matches the new transport in MCPClient) instead of `global.fetch`. |
| `/Users/trevorrobey/.config/raycast/extensions/obsidian/package.json` | 2026-05-05 05:25 | Added extension-level `mcpHttpEndpoint`/`mcpAuthToken`/`mcpConfigPath`/`mcpRequestTimeoutMs` preferences; added `downieShortcutName`/`downieDownloadTimeoutSeconds`/`downieFallbackDownloadsFolder`/`bridgeHealthEndpoint` to videoTranscribeCommand; renamed `summaryOutputFolder` to "Summary Output Folder (Fallback)" with new copy; removed broken `webClipCommand` declaration; removed dead `raycastObsidianMcp*` preferences. |
| `/Volumes/ExtraCurricular/My Digital Garden/.obsidian/community-plugins.json` | 2026-05-05 14:28 | Added `claude-console-mirror` to the enabled-plugins list. |

### Deleted during this build

- `/Users/trevorrobey/.config/raycast/extensions/obsidian/src/api/backend-emulator/` (whole directory) — `BackendEmulatorService` targeted the retired `:8789` backend emulator.

### Decommissioned process / config

- `~/Library/LaunchAgents/com.trevorrobey.raycast-obsidian-mcp.plist` — LaunchAgent unloaded via `launchctl bootout`. Plist preserved on disk; the dead `:18799` daemon no longer listens. Re-bootstrap with `launchctl bootstrap gui/$UID <plist>` if ever needed.

### Telemetry artifacts (write-only, persistent)

| Path | Purpose |
|------|---------|
| `/Users/trevorrobey/.claude/logs/raycast-transcribe-save.jsonl` | One JSON line per stage transition in the Raycast workflow. Tail with `tail -F <path>` `\| jq -c .` |
| `/Users/trevorrobey/.claude/logs/obsidian-console.jsonl` | Mirror of Obsidian renderer console (log/warn/error/window-error/unhandled-rejection). |

---

## One-time setup (already in place on this machine)

Future cold-start of the workflow on a fresh machine requires reproducing these
exactly:

1. **Obsidian "Command-line interface" toggle ON** — Settings → General → Advanced.
   The `obsidian-bridge-launcher` plugin's child bridge cannot dispatch commands
   without it. After flipping the toggle, restart Obsidian so the bridge child
   probes the CLI again.
2. **Downie 4 installed**, signed in (Wiley etc. via Login Browser → menu Browser
   → Show Login Browser → log in once → close).
3. **Downie's global Downloads folder set to** `/Volumes/ExtraCurricular/My Digital Garden/Video Downloads`
   (Downie → Preferences → File). This is what makes the `open -a "Downie 4"`
   fallback land files in the right place.
4. **Whisper installed** — `brew install openai-whisper` puts it at
   `/opt/homebrew/bin/whisper`. The "medium" model is downloaded automatically
   on first use. ffprobe (Homebrew ffmpeg) is also expected at
   `/opt/homebrew/bin/ffprobe`.
5. **macOS Shortcut** named "Downie → Vault Video Downloads" exists in
   Shortcuts.app, wrapping Downie's `DownloadURLs` intent (URLs = Shortcut
   Input, Destination = the vault Video Downloads folder, Postprocessing = MP4).
   Optional — if `shortcuts run` errors with "Error: An unknown error occurred"
   (Automation permission denied), the workflow falls back to `open -a "Downie 4"`.
6. **Obsidian Copilot plugin** at `<vault>/.obsidian/plugins/copilot/` configured
   with a default model and a custom prompt at
   `<vault>/copilot/copilot-custom-prompts/Summarize.md`.
7. **claude-console-mirror plugin enabled** (auto-loads after step 1's restart).

Verifications:

```
curl -sS -k --max-time 3 https://127.0.0.1:8798/healthz
test -x /opt/homebrew/bin/whisper
test -x /opt/homebrew/bin/ffprobe
test -d "/Volumes/ExtraCurricular/My Digital Garden/Video Downloads"
shortcuts list | grep "Downie → Vault Video Downloads"
```

`curl … /healthz` - bridge alive (returns `{"ok":true,...}`)
`test -x …` - whisper and ffprobe binaries are executable
`test -d …` - vault video folder mounted and writable
`shortcuts list | grep …` - the Downie Shortcut exists in Shortcuts.app

---

## Per-stage workflow + measured timing

Numbers below are from the latest known-good run on 2026-05-05 — Raycast PID 17353,
Wiley Ch_9 Long-Lived Assets, 18.8 MB MP4, Whisper medium model.

| Stage | Start (UTC) | Duration | Notes |
|-------|-------------|----------|-------|
| `__run_start__` → `flow_start` | 12:14:47.448 | <1ms | Logger banner + URL captured. |
| `bridge_gate:start` → `bridge_gate:passed` | 12:14:47.448 | 1.327s | `/healthz` (17ms) + `BackendPlanner.refresh` with 8s deadline. Verifies CLI routing on bridge. |
| `baseline_snapshot` | 12:14:48.849 | <1ms | Snapshots vault Video Downloads + `~/Downloads`. |
| `downie_dispatch:start` → `downie_dispatch:returned` | 12:14:48.850 | 0.447s | `shortcuts run` exited 1 (Automation perm), fell back to `open -a "Downie 4"` which exited 0. |
| `poll_for_new_video:start` → `:detected` | 12:14:49.297 | 6.011s | New `Videoplayer.mp4` detected and stable for 3s. |
| `whisper:starting` → `whisper:done` | 12:14:55.309 | **106.238s** | 15 segments, 1147-char transcript. |
| `source_note:write` → `:written` | 12:16:43.047 | 2.426s | `obsidian_create_note` via bridge → CLI. |
| `summary_destination_resolved` | 12:16:45.487 | <1ms | `activeFolder=null` → fallback to `obsidian-copilot-summaries`. |
| `summary_draft:write` → `:written` | 12:16:45.487 | 0.685s | Draft note created via bridge. |
| `obsidian_open:start` → `:returned` | 12:16:46.172 | 0.063s | `obsidian://open?path=...` returned (Obsidian opened the draft). |
| Activation delay | 12:16:46.235 | 1.5s | Hardcoded sleep so Copilot acts on the active note. |
| `copilot:trigger` → `:triggered` | 12:16:47.737 | 0.664s | `obsidian_execute_command` for `copilot:summarize`. |
| `copilot:wait_for_rewrite` → `:rewrite_done` | 12:16:48.401 | **42.249s** | Polls `obsidian_read_note` until note grows past baseline AND stays size-stable for 3s. Final 5154 bytes. |
| **Total wall time** | | **~163s (2:43)** | |

Whisper and Copilot dominate. Everything else is sub-3s.

---

## Telemetry

### Reading logs while debugging

```
tail -F ~/.claude/logs/raycast-transcribe-save.jsonl ~/.claude/logs/obsidian-console.jsonl | jq -c .
```

`tail -F …` - follows both files; re-opens if rotated/recreated.
`jq -c .` - prints each JSON line in compact one-line form.

### Stage names emitted by the Raycast workflow

```
__run_start__
flow_start                                  detail: {videoUrl}
bridge_gate:start
bridge_gate:endpoint_resolved               detail: {endpoint}
bridge_gate:healthz_request
bridge_gate:healthz_ok | :healthz_failed
bridge_gate:planner_construct
bridge_gate:planner_refresh_start
bridge_gate:planner_refresh_returned
bridge_gate:planner_routing_check           detail: {missing, operationMap}
bridge_gate:planner_failed                  detail: {error}
bridge_gate:passed
baseline_snapshot                           detail: {vaultDir, vaultFiles, fallbackDir, fallbackFiles}
downie_dispatch:start                       detail: {shortcutName}
downie_dispatch:fallback_open_a             detail: {videoUrl}
downie_dispatch:shortcut_failed_falling_back detail: {reason}
downie_dispatch:fallback_returned           detail: {code}
downie_dispatch:returned
poll_for_new_video:start                    detail: {timeoutSeconds}
poll_for_new_video:detected                 detail: {primaryVideoFile}
title_resolved                              detail: {title, source}
whisper:starting
whisper:tmpdir_ready                        detail: {whisperTmpDir}
whisper:done                                detail: {segmentCount, elapsedMs, textLen}
source_note:write                           detail: {path}
source_note:written
summary_destination_resolved                detail: {activeFolder, summaryFolder}
summary_draft:write                         detail: {path}
summary_draft:written
obsidian_open:start
obsidian_open:returned
copilot:trigger
copilot:triggered                           detail: {usedCommandId}
copilot:wait_for_rewrite                    detail: {timeoutSeconds}
copilot:rewrite_done                        detail: {finalLen}
flow_failure                                detail: {error, stack}
```

### Obsidian-side capture

`claude-console-mirror` plugin captures every `console.log/warn/error` from the
renderer plus uncaught errors and unhandled promise rejections. Useful for
seeing what Copilot, Miyo, or the bridge-launcher log internally during a run.

---

## Troubleshooting playbook

Map the **last** stage that appeared in the log to the fix:

| Last stage | Diagnosis | Fix |
|------------|-----------|-----|
| `bridge_gate:healthz_ok` then nothing | bridge auth or TLS issue from Raycast's process | Confirm `/Users/trevorrobey/TrevClaw-Obsidianodus/Copilot-Everything/bridges/obsidian-copilot-bridge/config/obsidian-cli-mcp.local.json` is readable; reload Raycast extension. |
| `bridge_gate:planner_routing_check` with `missing` non-empty | Obsidian CLI is disabled OR vault not registered | Settings → General → Advanced → enable "Command-line interface" → restart Obsidian. |
| `bridge_gate:planner_failed` with `did not return within 8000ms` | bridge hung mid-call | Restart Obsidian (kills + respawns the bridge child via the launcher plugin). |
| `downie_dispatch:start` then nothing for >5s and no `:fallback_open_a` | spawn never returned (rare) | Quit and relaunch Raycast. |
| `downie_dispatch:fallback_returned` but no `poll_for_new_video:detected` after 600s | Downie never wrote the file (e.g. UGE login required) | Open Downie, complete UGE for the URL, retry. Verify Downie's global Downloads folder still points at the vault. |
| `whisper:tmpdir_ready` then nothing | Whisper binary missing/unrunnable | `which whisper` → `brew install openai-whisper` if absent. |
| `whisper:done` but no `source_note:written` | Bridge `obsidian_create_note` failed | Check `bridge_gate:planner_routing_check` from earlier in the run; restart Obsidian to re-enable CLI if necessary. |
| `summary_draft:written` then `copilot:trigger` then nothing for >300s | Copilot's apply-prompt didn't run / model errored | Open Obsidian dev console (Cmd+Option+I) — Copilot logs errors there, mirrored to `obsidian-console.jsonl`. Check Copilot plugin has a default model configured. |
| Toast: "Cannot read properties of undefined (reading 'split')" | `pref.vaultPath` undefined and form pre-render hit `getVaultsFromPreferences` (FIXED 2026-05-05) | Re-build extension via `npx ray develop` — the guard added at `obsidian.ts` line ~30 handles unset preference. |
| Toast: 'Downie shortcut "..." exited code 1 during dispatch. Stderr: Error: An unknown error occurred' | Raycast lacks Automation permission for Shortcuts.app (FIXED 2026-05-05) | Workflow now falls back automatically to `open -a "Downie 4"`. If user wants the Shortcut path: System Settings → Privacy & Security → Automation → grant Raycast control of Shortcuts. |

---

## Building / re-building the extension

The extension lives at `/Users/trevorrobey/.config/raycast/extensions/obsidian/`.
Raycast loads compiled JS from that directory, NOT from `src/`. Source changes
require a recompile:

```
cd "/Users/trevorrobey/.config/raycast/extensions/obsidian"
timeout 25 npx ray develop
osascript -e 'tell application "Raycast" to quit' && sleep 2 && open -a Raycast
```

`cd …` - enter extension dir (must run from here).
`timeout 25 npx ray develop` - run the dev compiler. It builds once then watches; we kill at 25s after build.
`osascript … quit && sleep && open` - quit + relaunch Raycast so it loads the new compiled JS bundle.

To skip rebuild during pure-source experimentation, run `npx ray develop` in a
separate terminal and leave it running — it hot-rebuilds on save.

---

## Open questions / future improvements

- **Whisper streaming progress** is parsed from both stdout and stderr; we
  default to medium model. For long videos consider exposing model + language
  prefs.
- **Title auto-derivation** can't reach the parent course page's link text.
  The optional Title form field works but requires user input. A future
  improvement could fetch the page via Tavily and fall back to its returned
  title metadata when the user leaves the field blank.
- **Copilot rewrite detection** relies on file growth + 3s stable window. If
  Copilot writes the same total length as the seed (rare but possible), the
  poller would time out. Consider hashing the seed and waiting for hash change.
- **Active-folder resolution** depends on Obsidian writing `workspace.json` on
  every selection change, which it does — but if the user pastes the URL and
  fires Transcribe & Save before workspace.json rewrites, the resolver may
  pick a stale leaf. Acceptable for now.

---

## References

- Original implementation plan: `/Users/trevorrobey/.claude/plans/between-ports-8789-floating-micali.md`
- Bridge architecture context: `/Users/trevorrobey/TrevClaw-Obsidianodus/Copilot-Everything/CLAUDE.md`
- Bridge launcher plugin: `/Volumes/ExtraCurricular/My Digital Garden/.obsidian/plugins/obsidian-bridge-launcher/manifest.json`
- Copilot Summarize template: `/Volumes/ExtraCurricular/My Digital Garden/copilot/copilot-custom-prompts/Summarize.md`
- Bridge config (auth token + TLS paths): `/Users/trevorrobey/TrevClaw-Obsidianodus/Copilot-Everything/bridges/obsidian-copilot-bridge/config/obsidian-cli-mcp.local.json`
