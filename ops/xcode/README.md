# Xcode and Claude for TRINC — decision record (2026-11-05)

Status: **applied 2026-11-05** on the operator's word ("apply it … create 'Trevor Robey Intelligence Network
Citations' project from the monorepo and help me create an app for buyers"). Everything Xcode needs lives in this
monorepo except the three items in "What cannot live in the repo" below.

## 1 · Decisions

| # | Decision | Who | Reverses |
|---|---|---|---|
| X1 | **An Xcode project exists**: `Xcode/Trevor Robey Intelligence Network Citations.xcodeproj`, with a buyer app (`TRINCReader`) and its logic package (`Xcode/TRINCKit`). | operator | Claude's earlier recommendation of "no Xcode project yet" (below) |
| X2 | **Claude Code builds the project from its shell** (`xcodebuild`, `swift build`, `swift test`), with every Security Everything hook and gate still on. Nothing to install. | Claude's call, operator-approved | — |
| X3 | **Xcode's tools (`xcode-tools`, `xcrun mcpbridge`) are NOT registered in this repo's `.mcp.json`.** The gated route is the Security Everything lane `mcp-xcode`, **released 2026-11-05** (`bd2c253`, `550eb8d`), with its first armed run (`2ada6d2`), pin edit (`b054daa`) and end-to-end record (`289b062`) in `~/Security Everything/mcp-gates/XCODE-LANE.md`. It is registered in that repo only. TRINC sessions do not need it, because Claude Code builds from the shell (X2). | operator-approved | a TRINC need for Xcode's tools |
| X4 | **Xcode's built-in Claude Agent gets the third-party-agent posture**: not sandboxed, asks before acting, and hard-refused on credential and ceremony surfaces. The rules are `ops/xcode/claude-agent-settings.json`, deployed as a real copy by `install-claude-agent-settings.sh`. | operator-approved | — |
| X5 | **Hooks inside Xcode's agent are a Security Everything decision**, not set from TRINC (`XCODE-LANE.md` §7 lists the two routes). The installer refuses a source that adds `hooks`. | operator-approved | that repo |

**The superseded recommendation, kept so it is not rediscovered as a gap.** On 2026-11-05 Claude recommended no
Xcode project yet: TRINC had no Swift code, and its products (citation-traced report bundles, AWS Data Exchange
datasets) reach buyers as files with no app on their side. The operator chose to build a buyer app anyway. The app's
scope was picked to fit that fact: it adds nothing to the delivery path and only helps a buyer read and check what
they already received.

## 2 · The buyer app (TRINCReader)

An offline reader and verifier for what a buyer receives.
- **Opens** the sealed ZIP as delivered, its unzipped folder, or a single `.md` / `.csv`.
- **Report:** renders the Markdown deliverables, with the main report first.
- **Citations:** lists every cited identifier from `deliverables/reproducibility-manifest.json` with its
  delivery-time status, the gate record, and a link to the record page (PubMed, ClinicalTrials.gov, doi.org).
- **Seal:** recomputes every file's SHA-256 against `manifest.json` (schema `phase19-release-manifest-v1`) and
  names any file that does not match or is not covered.
- **Data:** previews CSV datasets with a filter.
- **Samples:** ships the two current proven-SKU samples by reference from
  `Trevor Robey Intelligence Network Citations/workspace/collateral/samples/`; they are not copied.

**Posture, checked by `ops/tr-suite/verify.sh`.** The macOS build runs in the App Sandbox with read-only access to
files the user picks and **no network entitlement**: it cannot open a connection, and it opens no listener (so the
HTTPS-only invariant has nothing to cover). Registry links open in the buyer's browser. No PHI and no accounts.

**Proven on 2026-11-05:**
- `swift test`: 26 tests pass. A hand-mutation pass killed 7 of 8 mutants; the survivor was dead code, now removed.
- The opt-in real-bundle test against the sealed NSCLC export (`offer-2bc4ee4a…-export.zip`):
  - 25 files, all 22 sealed fingerprints match, 45/45 VERIFIED, decision DELIVER;
  - `release-approval.json` is reported as not covered, because it is written after sealing.
- `xcodebuild` builds macOS (ad hoc signed) and generic iOS (unsigned).
- The macOS app launches and runs with no crash report.

**Before any buyer gets it (the operator's decisions, none taken):**
- An Apple Developer Program membership (a paid account in the business's name).
- A signing team set in Xcode.
- For a Mac copy: Developer ID signing plus notarization. For iPhone/iPad: TestFlight or the App Store.
- An app icon. The brand's IBM Plex fonts are not bundled; the app uses the system font with monospaced identifiers.
- A `brand-check` pass on the final copy and the `first-sale-gate`. All customer-facing strings are in
  `Xcode/TRINCReader/Brand.swift`.

## 3 · Xcode's built-in Claude Agent

Xcode 27 runs Anthropic's Claude Code (2.1.294, Developer ID Anthropic PBC `Q6L2SF6YDW`, downloaded by Xcode into
`~/Library/Developer/Xcode/CodingAssistant/Agents/`) with `CLAUDE_CONFIG_DIR` set to `…/CodingAssistant/ClaudeAgentConfig`.
It therefore never reads `~/.claude/settings.json`, `~/.claude.json` or their MCP servers and plugins: none of the
session-gate PreToolUse hooks and no LLM Guard reach it.
- It **does** load `~/.claude/CLAUDE.md`. Claude Code reads `CLAUDE.md` and `.claude/CLAUDE.md` in every folder above
  its working folder, and at `/Users/myhome` that walk finds `.claude/CLAUDE.md` (seen in its transcript, 2026-11-05).
- It also reads **TRINC's project settings** (`.claude/settings.json` and the machine-local `.claude/settings.local.json`)
  when it works anywhere under TRINC. They outrank its own settings.
- Root-owned managed settings (`/Library/Application Support/ClaudeCode/managed-settings.json`, Remote Control off)
  DO apply to it.

`claude-agent-settings.json`, key by key:
- `permissions.defaultMode: default`: it asks before every edit and command not otherwise allowed. No `allow` list
  exists; the installer refuses one.
- `disableBypassPermissionsMode` and `disableAutoMode`: Xcode's "skip permissions" toggle and the classifier's auto
  mode cannot switch the asking off. Auto mode is fine where the gate hooks back it up; here nothing does.
- `disableClaudeAiConnectors`: the operator's claude.ai account connectors would otherwise load into it, ungated.
- `syncClaudeAiPlugins: false`: a plugin can declare its own MCP servers (the 2026-07-28 desktop-commander lesson in
  `audit-connector-coverage.js`).
- `disabledMcpjsonServers`, listing every server in TRINC's two `.mcp.json` files (plus `perseus-vault`), together
  with `mcp__<name>` deny rules for each: Xcode's launcher passes no `--strict-mcp-config`, so TRINC's project servers
  come along.
  - **Corrected 2026-11-05 (evening).** The first version relied on `enableAllProjectMcpServers: false`. TRINC's
    machine-local `.claude/settings.local.json` set it `true`, and project-local settings outrank the agent's own.
    So when Xcode's agent ran under `TRINC/Xcode` (11:33Z), it **started all four TRINC servers**: perseus-business
    opened the encrypted business vault for about 642 s, and the other three ran until 14:51Z. The deny rules hid
    their tools; they did not stop the processes.
  - In Claude Code 2.1.294, a server listed in `disabledMcpjsonServers` is **rejected before any approval is
    checked**. TRINC's local file does not set that key, so the agent's list holds whatever TRINC approves.
  - TRINC's local settings were fixed the same evening: `enableAllProjectMcpServers` is false, the four servers are
    listed in `enabledMcpjsonServers`, and the `Bash(claude mcp *)` allow is removed.
  - `ops/tr-suite/verify.sh` FAILs if any of this comes back, and the installer refuses a source that misses a server.
- `enableAllProjectMcpServers: false` is kept, but on its own it cannot win against a project-local `true`.
- `autoUploadSessions: false`.
- `deny` rules:
  - reading or editing SSH, GnuPG, the Keychains, AWS, gh, `.mcp-auth`, `~/.config/trevclaw`, Perseus, the mkcert CA and
    localhost keys, `.env*` / `*.pem` / `*.p12` / `*.key`, and `~/.claude.json` and `~/.claude/`;
  - editing Preferences, LaunchAgents, `~/.local/bin`, shell startup files, Security Everything, this folder,
    `ops/tr-suite`, TRINC's `.mcp.json` and `.claude/`, and its own config folder;
  - `sudo`, `security`, `gpg*`, `ssh-add`, `git push`, `claude mcp`, `launchctl`, `defaults write/delete`, `plutil`,
    `xattr`, `spctl`, `csrutil` and `tccutil`;
  - every gate command on `PATH` (2026-11-05: `operator-approved-gate`, `operator-approve-gate`, `cb-gate`,
    `ccu-gate`, `gmail-arm`, `gmail-mcp-seal`, `gh-mcp`, `fw`, `fw-seal` and `fw-armed-write`), plus `sudo-gate` and
    `yk-session-gate`. Bash rules match the command as typed: a gate called by its full path would prompt rather than
    be refused.

**Limit, stated plainly:** `Read(...)` rules govern Claude's file tools, not a shell `cat`. A shell read of a denied
path is still a Bash command, so in this mode it waits for the operator's approval. That is a prompt, not a
refusal: approve shell commands that touch those paths only knowingly.

**A second, separate layer: Xcode's Agent Supervisor.** The operator turned on Xcode › Settings › Intelligence ›
Permissions › "Control file and folder access" (2026-11-05). It is Xcode's own file-access gate and sits beside the
deny list above; neither replaces the other. Its default grants still allow:
- writing to `~/.claude` and `~/Library/Keychains`;
- reading `~/.*`, including `.ssh`, `.config/gh`, `.mcp-auth` and `.perseus-vault`.

The deny list above refuses those for Claude's own file tools. Tightening the supervisor itself is the operator's call,
in Xcode's Permissions UI. Its settings live in Xcode's protected
`~/Library/Group Containers/group.com.apple.dt.Xcode.SecureSettingsContainer/`: **never edit those files directly**,
from this repo or any agent.

## 4 · Xcode's external-agent setting (audit F3, corrected 2026-11-05)

**Done by the operator, about 01:55:** Xcode › Settings › Intelligence › Model Context Protocol › "Allow External Agents
to Use Xcode Tools" = **While Xcode is Open** (the value `XCODE-LANE.md` §5 step 8 wants for the gated lane). Xcode
now asks before an external agent connects.

**Correction.** This record's first version, and the toolchain audit, read the preference
`IDEAllowUnauthenticatedAgents = true` as Xcode's unsafe all-agents mode. The Security Everything session found it
stays `true` after "While Xcode is Open" is chosen, while Xcode's own agent settings record the MCP server as not
enabled. The key is most likely the master "external agents allowed" switch, which the gated lane needs on.
**Do not switch it off or delete it.** The unsafe modes are two other keys, absent as of 2026-11-05:
- `IDEChatInternalAllowUntrustedAgentsWithoutUserInteraction`
- `IDEChatAgenticChatSkipPermissions`

`verify.sh` WARNs only if one of them becomes true; the key list is in `ops/tr-suite/manifest.json` (`xcode_unsafe_keys`).

## 5 · How to check everything

```bash
bash /Users/myhome/TRINC/ops/tr-suite/verify.sh
```
```bash
bash /Users/myhome/TRINC/ops/xcode/install-claude-agent-settings.sh --check
```
```bash
cd /Users/myhome/TRINC/Xcode/TRINCKit && swift test
```
```bash
cd /Users/myhome/TRINC/Xcode && xcodebuild build -project "Trevor Robey Intelligence Network Citations.xcodeproj" -scheme TRINCReader -destination 'platform=macOS'
```

`verify.sh` "== Xcode" FAILs when:
- the deployed rules drift from this folder or become a symlink;
- an MCP server is registered for Xcode's agents (`CodingAssistant/mcp-servers.json`, or `mcpServers` in
  `ClaudeAgentConfig/.claude.json`);
- the buyer app gains a network entitlement or loses the sandbox;
- a server in TRINC's `.mcp.json` or `Copilot-Everything/.mcp.json` is missing from the agent rules'
  `disabledMcpjsonServers` or `mcp__` deny rules;
- TRINC's machine-local `.claude/settings.local.json` sets `enableAllProjectMcpServers: true`, or allows `claude mcp`
  without a prompt.

It WARNs while the unsafe Xcode mode is on.

**Re-test after the 2026-11-05 fix (operator).** Open Xcode's Claude once on the TRINC project. The only folder in
`~/Library/Caches/claude-cli-nodejs/-Users-myhome-TRINC-Xcode/` that may then show a newer time is
`mcp-logs-xcode-tools`. Before the fix (2026-11-06T01:34Z) all five folders were dated 2026-11-05 03:34 PST.

**Every redeploy of the agent rules needs the operator's re-bless (from 2026-11-05).** The Security Everything watcher
`xcodeagentwatch` guards the deployed `ClaudeAgentConfig/settings.json` (alongside Xcode's own agent settings) against
a snapshot the operator blessed. After any `install-claude-agent-settings.sh --apply`, it pages until re-blessed:
- `XA_DRIFT` (high) for an added deny rule;
- `XA_LOOSENED` (critical) when a deny rule is removed, a server is re-enabled, an allow rule is added or a mode
  switch changes.

The re-bless is the **operator's** step. Run it in Terminal (it needs an app with Full Disk Access), right after the
deploy. Review first:
```bash
cd "/Users/myhome/Security Everything" && python3 xcodeagentwatch/xcodeagentwatch.py --bless
```
then, if the summary matches the change you deployed:
```bash
cd "/Users/myhome/Security Everything" && python3 xcodeagentwatch/xcodeagentwatch.py --bless --confirm
```
- The confirm itself pages `XA_BLESSED` (high) on purpose, so that a silent re-bless by another process is seen.
- No agent session can bless on the operator's behalf, and a request from another session is not a bless.
- The 2026-11-05 redeploy (sha256 `72e4a14c…f198`) is already in the snapshot the operator blessed at 18:24 PST.
- Record: `~/Security Everything/mcp-gates/XCODE-LANE.md` §9.2 and `xcodeagentwatch/README.md`.

## 6 · What cannot live in the repo

- **The deployed copy** `~/Library/Developer/Xcode/CodingAssistant/ClaudeAgentConfig/settings.json`: Xcode's agent
  reads only there. It is a copy of this folder's source, never a symlink: with a symlink, anything that can edit the
  repo could change the agent's rules silently.
- **Xcode's own preferences** (`~/Library/Preferences/com.apple.dt.Xcode.plist`): set in Xcode's Settings by the operator.
- **Build products** (DerivedData), plus Xcode's agent binary and its account record: machine state.
- (User skills would live only in `~/.claude/skills/`, per the 2026-07-09 decision. None were needed.)

**Rejected:**
- Xcode's hidden UserDefaults override that moves the agent's config folder: it would put the account record and
  agent transcripts in the monorepo folder, and it is an Xcode preference change.
- Rules in TRINC's own `.claude/settings.json`: they would also bind every normal Claude Code session in TRINC.
- `claude mcp add … xcrun mcpbridge`: ungated, per X3.

## 7 · Host traps met while building it

- **Never build or run from `/tmp`.** A launch from the session scratchpad (`/private/tmp/...`) was refused with "Launchd
  job spawn failed"; this host blocks execution there. Use Xcode's default DerivedData.
- **The shared scheme runs and tests without the debugger** ("Debug executable" off), because attaching `lldb` fires
  Falcon Custom-IOA rule 240 (the SIP-off compensating group). Turn it on in Edit Scheme only when needed, and expect
  that detection.
- The package's tests are not reachable from the app's scheme (a hand-written reference to the package test target did
  not resolve). Run them with `swift test`, or open `Xcode/TRINCKit/Package.swift` in Xcode and press Cmd-U.

## 8 · Rollback

- Agent rules: restore the backup the installer printed (under `~/.claude/backups/xcode-agent/`), or delete the deployed
  file. That returns Xcode's agent to Claude Code's defaults, which is weaker.
- Project: `git rm -r Xcode ops/xcode` and remove the `xcode` entry from `ops/tr-suite/manifest.json`.

## 9 · Measured facts behind these decisions (recon 2026-11-05)

Folded in from the side session's recon note, corrected where later evidence changed it. The note itself is kept
verbatim, uncommitted on purpose (TRINC keeps exploration reports out of git), at
`.archive/xcode/xcode-trinc-recon-2026-11-05.md`. Its Security Everything sections stay in that repo
(`docs/toolchain-audit-2026-11-05.md` and `mcp-gates/XCODE-LANE.md`): the Falcon alerts to attribute, whether
Xcode's agent gets the gate hooks, and Falcon rule 240 on `lldb`.

**Install and toolchain**
- Xcode 27.2 (27B52), App Store, at `/Applications/Xcode.app`; `xcode-select -p` points there; first-launch setup
  done.
- Swift 6.4.2 with `sourcekit-lsp`. SDKs for macOS, iOS, tvOS, watchOS, visionOS and DriverKit 27.2.
- **No simulator runtime installed** (`xcrun simctl list runtimes` is empty), so the iPhone/iPad build runs only on a
  device until one is downloaded (several GB). Developer Mode is off.
- Before 2026-11-05 TRINC tracked no Swift at all; the engine is Node.

**The three ways Claude meets Xcode**
1. **Xcode's built-in Claude Agent.**
   - Xcode downloads Anthropic's own Claude Code (2.1.294, Developer ID Anthropic PBC, signature valid) into the
     user-writable `~/Library/Developer/Xcode/CodingAssistant/Agents/`.
   - It runs that binary with its own `CLAUDE_CONFIG_DIR` (§3). It merges MCP servers from
     `CodingAssistant/mcp-servers.json` (empty).
   - Sign-in is the operator's claude.ai account, held by Xcode.
   - *(Corrected: the first reading called it an Apple binary, launched with `--strict-mcp-config`.)*
2. **Claude Code using Xcode's tools** through `xcrun mcpbridge`: decision X3.
3. **`xcrun mcpbridge run-agent claude`** starts a Claude Code with Xcode's MCP config. Its dry run resolves to:
   - `CLAUDE_CONFIG_DIR=…/ClaudeAgentConfig` and `MCP_XCODE_PID`;
   - `--mcp-config` with the one server `xcode-tools` (= `mcpbridge`);
   - `--settings` with telemetry off;
   - **no `--strict-mcp-config`**, which is why the agent rules deny the TRINC MCP servers by name.

**Settings that bind Xcode's agent**
- Root-owned managed settings (`/Library/Application Support/ClaudeCode/managed-settings.json`) apply to every Claude
  Code on the machine, Xcode's included. On 2026-11-05 they held only the Remote Control lock.
- The setting names used in `claude-agent-settings.json` (`disableBypassPermissionsMode`, `disableAutoMode`,
  `disableClaudeAiConnectors` and the rest) were confirmed present in the 2.1.294 binary before deploying.

**Superseded readings, so they are not re-derived**
- "No Xcode project yet": recommended, then overruled by the operator (X1).
- `IDEAllowUnauthenticatedAgents = true` read as the unsafe all-agents mode: corrected in §4. Leave it on.
