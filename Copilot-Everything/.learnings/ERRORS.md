## [ERR-20260509-001] obsidian_sigsegv_on_v8_async_cleanup_one_off

**Logged**: 2026-05-09T14:41:00-07:00
**Resolved**: 2026-05-09T15:17:00-07:00
**Priority**: medium
**Status**: resolved
**Resolution**: Obsidian upgraded 1.12.4 → 1.12.7 (Electron v39.8.3) + IdempotencyLedger.close() wired into bridge shutdown to drain `node:sqlite` cleanly before SIGTERM
**Area**: frontend

### Summary
Obsidian (1.12.4, build 0.14.8) SIGSEGV'd on its main thread during V8/Node async-resource cleanup at 03:59:03 PDT. Crash was a one-off — did not recur on a clean manual relaunch with all 14 community plugins enabled and both bridge children spawned.

### Error
```
Exception: EXC_BAD_ACCESS (SIGSEGV)
Subtype: KERN_INVALID_ADDRESS at 0x0000000000000000
faultingThread: 0 (CrBrowserMain, com.apple.main-thread, triggered=true)
procName: Obsidian pid: 69094 parentProc: node parentPid: 68725
responsiblePid: 68725 (node)
```

Faulting thread (frames 0–22, the meaningful prefix):
```
[ 0] Electron Framework: v8::Symbol::GetIterator
[ 1] Electron Framework: uv_get_constrained_memory
[ 2] Electron Framework: uv_get_constrained_memory
[ 3] Electron Framework: node::AsyncWrap::~AsyncWrap
[ 4] Electron Framework: node::AsyncWrap::~AsyncWrap
[ 5] Electron Framework: node::AsyncWrap::~AsyncWrap
[ 6] Electron Framework: node::AsyncWrap::~AsyncWrap
[ 7] img=8 (V8 JIT — blank name+path, NOT plugin-attributable)  +0x15f450398
[ 8] img=8 (V8 JIT)                                              +0x15f44e3cc
[ 9] img=8 (V8 JIT)                                              +0x15f56a2d8
[10] img=8 (V8 JIT)                                              +0x15f47d18c
[11] img=8 (V8 JIT)                                              +0x15f44b2b4
[12] Electron Framework: v8::Function::NewInstanceWithSideEffectType
[13] Electron Framework: v8::MicrotasksScope::~MicrotasksScope
[14] Electron Framework: v8::MicrotasksScope::~MicrotasksScope
[15] Electron Framework: v8::Isolate::SetIdle
[16] Electron Framework: node::InternalCallbackScope::Close
[17] Electron Framework: node::CallbackScope::~CallbackScope
[18] Electron Framework: node::sqlite::UserDefinedFunction::xDestroy   ← signature root
[19] Electron Framework: node::AsyncWrap::~AsyncWrap
[20] Electron Framework: node::AsyncWrap::~AsyncWrap
[21] Electron Framework: node::AsyncWrap::~AsyncWrap
[22] Electron Framework: node::inspector::InspectorSocket::Shutdown
```

Crash report: `/Users/trevorrobey/Library/Logs/DiagnosticReports/Obsidian-2026-05-09-035903.ips`

### Context
- User reported "on startup, obsidian starts and stops" symptom on 2026-05-09.
- Obsidian was launched as a child of `node` PID 68725 — i.e., spawned by a Node parent rather than directly by launchd. Possible parents: the `raycast-obsidian-mcp` bridge's `runtimeSupport.ts` LaunchServices launch path, or a Raycast extension command.
- **Correction to first-pass analysis**: an earlier diagnostic snapshot claimed `contextual-wiki-definitions` was the binary at `imageIndex 8`. Reading the `.ips` directly disproves that — `usedImages[8]` has blank `name` and blank `path`, which is V8 JIT-compiled JavaScript code that no longer maps to a loaded image at the time of report generation. Frames 7–11 are JIT'd JS callbacks, not plugin binary frames; we cannot attribute them to a specific plugin from this crash report alone.
- The actual symbolicated cluster around the JIT (frames 13–22) is a Node.js teardown signature: `MicrotasksScope` destruction, `InternalCallbackScope::Close`, `node::sqlite::UserDefinedFunction::xDestroy`, multiple `AsyncWrap` destructors, `InspectorSocket::Shutdown`. This is consistent with a Node context being torn down (Obsidian shutting down or a Node-using plugin unloading) while a SQLite UDF callback was still outstanding — a use-after-free or null-deref during cleanup, not a plugin onload bug.
- A grep across all 14 enabled community plugins for `require('node:sqlite')`, `Database(`, `prepare(`, `registerFunction` showed only `copilot/main.js` matching `prepare(` (1 hit, likely unrelated to SQLite). No plugin in the active set is a clear `node::sqlite` UDF user, so the failing UDF was almost certainly Obsidian's own internal SQLite (vault index) machinery, not plugin code.

### Bisect (Phase C-2, 2026-05-09 14:51–14:54 PDT)
- Backed up `community-plugins.json`, removed three primes (`contextual-wiki-definitions`, `obsidian-bridge-launcher`, `vault-zettelkasten`), relaunched Obsidian. 60s soak with 11 plugins: stable, no crash, no warnings. `:8798` correctly absent (its launcher plugin was disabled).
- Restored original 14-plugin config. 60s soak with full stack: Obsidian PID 24813 alive; bridge child PID 24822 listening on `:8798`; Command Center on `:8799`; raycast-mcp (LaunchAgent) on `:18799`; `https://127.0.0.1:8798/healthz` ok; no new crash report.
- **Conclusion**: short-soak bisect did not trigger a recurrence in either configuration, which is expected for a single-occurrence crash 11 hours stale. The bisect rules out gross instability with the current plugin set, but cannot pinpoint a culprit because the trigger is not reproducible on demand. No plugin was identified as the cause.

### Suggested Fix
- No code change to chase given the unreproducible single occurrence. The Node-teardown signature points at Obsidian's internal SQLite or a Node-resource-using plugin's cleanup, not an onload regression in plugin code.
- If recurrences appear with the same crash signature (`node::sqlite::UserDefinedFunction::xDestroy` in the stack), capture multiple `.ips` files and look for which plugin's main.js is loaded near the JIT frame range. A per-plugin enable/disable schedule over multiple days (one-prime-out at a time) would be a stronger bisect than a 60s soak.
- If a node-parent launch path keeps showing up in future crashes, instrument `bridges/raycast-obsidian-mcp/src/cli/runtimeSupport.ts` to log when it invokes `/usr/bin/open -a Obsidian` so we can correlate parent=node crashes back to the raycast launch path.
- Watch the Obsidian release notes for SQLite-related fixes; this signature has been reported upstream against Electron + Node 22.x with `node:sqlite` UDFs that hold JS callbacks.

### Metadata
- Reproducible: no (single occurrence; bisect did not trigger over short soak)
- Related Files: `Copilot-Everything/bridges/raycast-obsidian-mcp/src/cli/runtimeSupport.ts`, `/Volumes/ExtraCurricular/My Digital Garden/.obsidian/plugins/{obsidian-bridge-launcher,vault-zettelkasten,contextual-wiki-definitions}/`, `/Volumes/ExtraCurricular/My Digital Garden/.obsidian/community-plugins.json`
- Tags: obsidian, sigsegv, electron, node-sqlite, async-wrap-teardown
- See Also: ERR-20260509-002

---

## [ERR-20260509-002] raycast_bridge_logger_stale_path_at_shutdown

**Logged**: 2026-05-09T14:41:00-07:00
**Resolved**: 2026-05-09T15:17:00-07:00
**Priority**: medium
**Status**: resolved
**Resolution**: `appendFileSync` in `src/observability/logger.ts` now wrapped in try/catch in BOTH bridges (raycast-obsidian-mcp + obsidian-copilot-bridge), with stderr fallback. Shutdown logger can no longer escalate ENOENT into an unhandled exception. Stale residual dir at `/Users/trevorrobey/THE Copilot in Obsidian Everything/` left in place; Tier-3 cleanup deferred until verified no remaining process references it.
**Area**: backend

### Summary
On SIGTERM the `raycast-obsidian-mcp` bridge tries to append a final log line and fails with ENOENT because some bridge instances have an absolute log path baked in that points to the **stale** `/Users/trevorrobey/THE Copilot in Obsidian Everything/...` location (no `Code/` prefix, not the current TrevClaw-Obsidianodus path). The shutdown error is non-fatal but pollutes stderr and trips any monitor that watches the err log.

### Error
```
Error: ENOENT: no such file or directory, open
  '/Users/trevorrobey/THE Copilot in Obsidian Everything/bridges/raycast-obsidian-mcp/logs/raycast-obsidian-mcp-18799.log'
    at StructuredLogger.log (.../dist/observability/logger.js:35:27)
    at StructuredLogger.info (.../dist/observability/logger.js:47:14)
    at shutdown (.../dist/index.js:69:16)
```

### Context
- Three locations exist:
  1. Real:    `/Users/trevorrobey/TrevClaw-Obsidianodus/Copilot-Everything/bridges/raycast-obsidian-mcp/`
  2. Symlink: `/Users/trevorrobey/Code/THE Copilot in Obsidian Everything/` → (1)
  3. **Stale residual**: `/Users/trevorrobey/THE Copilot in Obsidian Everything/` (only contains `bridges/obsidian-copilot-bridge/logs/`)
- Current `config/raycast-obsidian-mcp.local.json` has `logging.file = "/Users/trevorrobey/Code/THE Copilot in Obsidian Everything/bridges/raycast-obsidian-mcp/logs/raycast-obsidian-mcp-18799.log"` (the symlink path, fine for current PID).
- Older bridge processes had the no-`Code/` path baked in; their shutdown handlers still reference it.
- LaunchAgent plist `WorkingDirectory` is the symlink path, so new processes follow it correctly via `path.resolve(process.cwd(), "logs/...")` in `src/config/loader.ts:59`.

### Suggested Fix
1. Delete the stale residual directory `/Users/trevorrobey/THE Copilot in Obsidian Everything/` (verify nothing else depends on it first).
2. In `bridges/raycast-obsidian-mcp/src/observability/logger.ts`, wrap `appendFileSync` in a try/catch on shutdown so a missing log dir cannot escape an `unhandledException`. The shutdown path should never crash on a side-effect log write.
3. Drop the absolute `logging.file` from `config/raycast-obsidian-mcp.local.json` — it's redundant given the loader's `path.resolve(process.cwd(), "logs/...")` default, and a relative default makes the bridge portable across the symlink/canonical path split.

### Metadata
- Reproducible: yes (every `launchctl bootout` triggers it via SIGTERM)
- Related Files: `Copilot-Everything/bridges/raycast-obsidian-mcp/src/observability/logger.ts`, `Copilot-Everything/bridges/raycast-obsidian-mcp/src/config/loader.ts`, `Copilot-Everything/bridges/raycast-obsidian-mcp/config/raycast-obsidian-mcp.local.json`
- Tags: bridge, logging, monorepo-consolidation
- See Also: ERR-20260509-001

---

## [ERR-20260321-005] helper_app_compile_command_policy_rejection

**Logged**: 2026-03-21T02:31:00-07:00
**Priority**: low
**Status**: resolved
**Area**: config

### Summary
A helper app compile command was rejected when it was chained with `rm -rf`, even though the actual goal was just to rebuild the `.app` bundle in place.

### Error
```
Rejected: blocked by policy
```

### Context
- Operation attempted: rebuild `/Users/trevorrobey/Applications/Obsidian Markdown Opener.app` from `/Users/trevorrobey/Applications/Obsidian Markdown Opener.applescript`.
- The first command combined an app-bundle cleanup step with `osacompile`.
- Retrying with a direct non-destructive `osacompile -o ...` command worked immediately.

### Suggested Fix
Avoid destructive-style command chains when recompiling helper apps. Prefer direct `osacompile -o ...` or move old bundles aside with a non-destructive name if replacement is needed.

### Metadata
- Reproducible: yes
- Related Files: /Users/trevorrobey/Applications/Obsidian Markdown Opener.applescript, /Users/trevorrobey/Applications/Obsidian Markdown Opener.app, /Users/trevorrobey/bin/obsidian-markdown-opener

---

## [ERR-20260317-001] obsidian_dev_vault_registration

**Logged**: 2026-03-17T19:05:00-07:00
**Priority**: medium
**Status**: resolved
**Area**: config

### Summary
Obsidian CLI and `obsidian://open?path=...` could not resolve the workspace dev vault even after adding it to the global vault registry.

### Error
```
Unable to find a vault for the URL obsidian://open?path=%2FUsers%2Ftrevorrobey%2FTHE%20Copilot%20in%20Obsidian%20Everything%2Fdev-vault
Vault not found.
```

### Context
- Operation attempted: register `/Users/trevorrobey/THE Copilot in Obsidian Everything/dev-vault` as a CLI-targetable vault and verify `copilot-mcp` reload via Obsidian CLI.
- Environment: Obsidian app was already running with the production vault open.
- A backup of `/Users/trevorrobey/Library/Application Support/obsidian/obsidian.json` was created before editing the registry.

### Suggested Fix
Open the dev vault interactively inside Obsidian or restart Obsidian so it reloads the updated vault registry, then retry `obsidian vault="dev-vault" plugin:reload id="copilot-mcp"`.

### Metadata
- Reproducible: yes
- Related Files: /Users/trevorrobey/Library/Application Support/obsidian/obsidian.json, /Users/trevorrobey/THE Copilot in Obsidian Everything/docs/MIGRATION_REPORT.md, /Users/trevorrobey/THE Copilot in Obsidian Everything/docs/RISKS.md

---

## [ERR-20260317-002] bridge_cli_probe_mismatch

**Logged**: 2026-03-17T20:30:00-07:00
**Priority**: medium
**Status**: resolved
**Area**: backend

### Summary
Bridge diagnostics and standalone probe results diverged because the probe harness was not executing under the same effective runtime environment as the bridge process.

### Error
```
health.cli.available=true
standalone probe (generic shell) timed out in shell-mode CLI probing
```

### Context
- Operation attempted: validate the isolated MCP bridge on `http://127.0.0.1:8798` using the signed helper script `/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/mcp-health-check.js`.
- `obsidian_health` now forces `selector.refresh(true)` and uses the same effective CLI probe logic as runtime routing.
- The bridge process environment and a generic shell environment are not equivalent for probe timing behavior.
- A direct probe aligned to bridge runtime env now matches health output (`cli.available=true`).

### Suggested Fix
Keep probe comparison tied to bridge runtime env. Use:
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/bridge-health-check.sh`

This script compares:
- signed bridge `obsidian_health` result
- direct `CliBackend.probe()` under bridge runtime env

### Metadata
- Reproducible: no (not when runtime environment is matched)
- Related Files: /Users/trevorrobey/THE Copilot in Obsidian Everything/bridges/raycast-obsidian-extension/mcp-server/src/backends/cliBackend.ts, /Users/trevorrobey/THE Copilot in Obsidian Everything/bridges/raycast-obsidian-extension/mcp-server/src/server/tools/obsidianHealth.ts, /Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/mcp-health-check.js, /Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/bridge-health-check.sh, /Users/trevorrobey/THE Copilot in Obsidian Everything/configs/validation/bridge-health-after-fix.json, /Users/trevorrobey/THE Copilot in Obsidian Everything/configs/validation/direct-cli-probe-with-bridge-runtime-env.json

---

## [ERR-20260318-003] scripted_runChain_completion_stall

**Logged**: 2026-03-18T11:20:00-07:00
**Priority**: low
**Status**: open
**Area**: testing

### Summary
`chainManager.runChain(...)` can continue running in a long-lived async eval context even after the tool call and final response are visible in chat state.

### Error
```
window.__mcpChatSmoke.status="running" for extended polling window
while dev console shows:
- Iteration 1 tool call completed
- Iteration 2 final response emitted
```

### Context
- This was observed in scripted smoke execution via `obsidian eval`.
- In-app behavior still produced a valid chat response and MCP tool execution.
- The issue appears limited to scripted completion bookkeeping, not user-visible chat output.

### Suggested Fix
Prefer smoke-test completion conditions based on observable app state:
- final AI message present in `chatUIState`
- expected MCP completion lines in `dev:console`

Do not rely solely on an awaited `runChain` promise in eval automation.

### Metadata
- Reproducible: intermittently
- Related Files: /Users/trevorrobey/THE Copilot in Obsidian Everything/configs/validation/dev-console-mcp-chat.txt, /Users/trevorrobey/THE Copilot in Obsidian Everything/configs/validation/inapp-chat-after.txt, /Users/trevorrobey/THE Copilot in Obsidian Everything/docs/MCP_CHAT_SMOKE_TEST.md

---

## [ERR-20260319-004] self_host_emulator_dependency_api_mismatch

**Logged**: 2026-03-19T09:20:00-07:00
**Priority**: low
**Status**: resolved
**Area**: build

### Summary
The new exact self-host emulator path initially failed to compile because the fork and backend were using different library API expectations than the versions already pinned in the workspace.

### Error
```text
eventsource-parser callback API mismatch in the fork
fastify logger option mismatch in the backend
```

### Context
- The fork already had an older `eventsource-parser` API shape, so `SelfHostAdapter` needed to use the callback parser form rather than the newer object form.
- Fastify v5 expects `loggerInstance` for a prebuilt pino logger.

### Suggested Fix
When extending this workspace, check the actually installed dependency APIs before assuming the latest upstream examples apply.

### Metadata
- Reproducible: yes
- Related Files: /Users/trevorrobey/THE Copilot in Obsidian Everything/repos/obsidian-copilot-mcp/src/backend/SelfHostAdapter.ts, /Users/trevorrobey/THE Copilot in Obsidian Everything/backend/copilot-backend-emulator/src/server.ts

---

## [ERR-20260319-005] official_miyo_test_textutil_pdf_generation

**Logged**: 2026-03-19T12:22:00Z
**Priority**: low
**Status**: resolved
**Area**: testing

### Summary
The first direct `/v0/parse-doc` compatibility smoke used `textutil -convert pdf`, but that command path was not reliable for generating a temporary PDF fixture inside the automated test.

### Error
```text
Error: Command failed: textutil -convert pdf -output .../compat-sample.pdf .../compat-sample.txt
```

### Context
- Operation attempted: generate a one-off PDF fixture for `backend/copilot-backend-emulator/scripts/official-compat-test.ts`.
- The test only needed a minimal PDF that the real local Miyo server could parse.
- A shell-dependent conversion step added avoidable fragility to the compatibility harness.

### Suggested Fix
Generate the PDF fixture programmatically inside the test script instead of relying on `textutil`.

### Metadata
- Reproducible: yes
- Related Files: /Users/trevorrobey/THE Copilot in Obsidian Everything/backend/copilot-backend-emulator/scripts/official-compat-test.ts, /Users/trevorrobey/THE Copilot in Obsidian Everything/docs/OFFICIAL_PLUGIN_COMPATIBILITY.md

---

## [ERR-20260320-006] functional_sweep_harness_early_exit

**Logged**: 2026-03-20T19:30:19-07:00
**Priority**: medium
**Status**: resolved
**Area**: testing

### Summary
The first run of `scripts/full-functional-sweep.sh` exited after the first failed check because sourcing `scripts/lib.sh` re-enabled `set -e`, which defeated the runner's continue-on-failure design.

### Error
```text
Functional sweep aborted after CORE-07 instead of collecting a complete pass/fail report.
```

### Context
- Operation attempted: run the new full functional checklist and gather a complete report for the current production Obsidian Copilot stack.
- The runner intentionally records failures and continues, but `scripts/lib.sh` sets `-euo pipefail`.
- After the runner sourced `lib.sh`, the shell returned to fail-fast mode and stopped on the first non-zero check.

### Suggested Fix
After sourcing `scripts/lib.sh`, explicitly disable `set -e` in any aggregate runner that is supposed to collect failures and continue.

### Metadata
- Reproducible: yes
- Related Files: /Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/full-functional-sweep.sh, /Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/lib.sh

---

## [ERR-20260321-007] top_level_workspace_git_status

**Logged**: 2026-03-21T08:55:43Z
**Priority**: low
**Status**: resolved
**Area**: config

### Summary
Running `git status` from the umbrella workspace path failed because `/Users/trevorrobey/THE Copilot in Obsidian Everything` is not itself a Git repository.

### Error
```text
fatal: not a git repository (or any of the parent directories): .git
```

### Context
- Operation attempted: inspect working-tree changes after adding the official Copilot Ollama model helper.
- The workspace contains multiple nested repos and deploy artifacts, but the top-level coordination directory is not a Git root.
- Future Git checks need to target the specific nested repo being changed instead of the umbrella path.

### Suggested Fix
When verifying Git state in this workspace, run `git` against the concrete nested repo path or skip Git status entirely for umbrella-level operational changes.

### Metadata
- Reproducible: yes
- Related Files: /Users/trevorrobey/THE Copilot in Obsidian Everything

---

## [ERR-20260321-008] official_plugin_write_check_harness

**Logged**: 2026-03-21T20:32:00Z
**Priority**: medium
**Status**: resolved
**Area**: testing

### Summary
The first official-plugin write smoke harness used a single long `obsidian eval` call and brittle shell quoting, which produced empty or invalid JSON captures instead of reliable write-status output.

### Error
```text
Error: Unexpected string
jq: parse error: Invalid numeric literal
```

### Context
- Operation attempted: validate official-plugin `prompt_on_writes` create/append/readback through scripted modal confirmation.
- The first version embedded multiline content directly into one `obsidian eval` payload and tried to parse its stdout immediately.
- CLI debug lines and shell-escaped newlines polluted the output, and long async modal work was more reliable when launched in the background and polled through a window-scoped status object.

### Suggested Fix
For Obsidian CLI automation that drives async UI work:
- JSON-encode embedded strings before injecting them into `eval` code
- start the async work in `window.__...` state
- poll status with short follow-up `eval` calls instead of trusting one long stdout capture

### Metadata
- Reproducible: yes
- Related Files: /Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/official-plugin-write-check.sh

---
## [ERR-20260322-001] raycast_extension_entrypoint_wrapper

**Logged**: 2026-03-22T17:37:00-07:00
**Priority**: medium
**Status**: pending
**Area**: config

### Summary
Raycast rejected a hand-written replacement command entrypoint as corrupted even though the module export shape looked valid.

### Error
```
The entry point file appears to be corrupted.
Recovery: You may need to reinstall the extension
Command ID: floaty.select-window-to-pin__3fa97205-40c2-4ae8-8253-1fe97388a12d
```

### Context
- Operation attempted: replace a compiled Raycast command bundle with a tiny CommonJS wrapper that re-exported another command bundle
- Affected files: `/Users/trevorrobey/.config/raycast/extensions/616dddb9-95b2-41dc-ad25-eb7ae419688c/select-window-to-pin.js`
- Raycast accepted the manifest change, but refused to load the wrapped entrypoint file.

### Suggested Fix
For installed built extensions, prefer copying a known-good built command bundle wholesale rather than replacing it with a tiny wrapper script.

### Metadata
- Reproducible: yes
- Related Files: /Users/trevorrobey/.config/raycast/extensions/616dddb9-95b2-41dc-ad25-eb7ae419688c/select-window-to-pin.js
- See Also: none

---

## [ERR-20260324-001] codex_shell_missing_node_on_path

**Logged**: 2026-03-24T00:00:00-07:00
**Priority**: low
**Status**: pending
**Area**: environment

### Summary
Ad hoc runtime inspection in the Codex desktop shell hit an unexpected environment mismatch because `node` and `npm` were not on `PATH`, even though this workspace is Node-heavy.

### Error
```text
command -v node
# no result

command -v npm
# no result
```

### Context
- Operation attempted: use quick Node-based inspection while reviewing the OpenClaw and Obsidian workspace stack.
- The Codex shell `PATH` at the time of failure was:
  - `/Users/trevorrobey/.local/bin:/Users/trevorrobey/.codex/tmp/arg0/codex-arg0WuoCqb:/usr/bin:/bin:/usr/sbin:/sbin:/Applications/Codex.app/Contents/Resources`
- This environment did not include the usual Node installation path or shell init hooks.
- Review work continued with `jq`, `sed`, `find`, and direct file reads.

### Suggested Fix
Before relying on ad hoc Node commands in Codex desktop, verify `PATH` and load the expected Node runtime explicitly. If needed, source the relevant shell init or use an absolute Node binary path for one-off inspection commands.

### Metadata
- Reproducible: yes
- Related Files: /Users/trevorrobey/THE Copilot in Obsidian Everything/.learnings/ERRORS.md
