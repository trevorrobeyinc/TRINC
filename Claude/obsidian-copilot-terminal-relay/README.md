# ⚰️ RETIRED 2026-08-14 — superseded, do not redeploy

Agent mode (opencode backend) gained a built-in shell with per-command permission cards, which
delivers what this relay was built to approximate — and does it with real execution rather than
staged text. The relay was therefore removed from the vault the same day it was built:
plugin directory deleted, disabled in `community-plugins.json`, inbox note removed.

Source kept as a tombstone, not as a live component. If a future session wants "let the agent
type into a terminal pane", read the security note below FIRST — this was built type-only on
purpose, and the surface it approximates (`term-bridge`) was retired 2026-07-28 as the sharpest
agent escape primitive on this host.

---

# TR-Obsidian Copilot Terminal Relay

Lets the **Copilot agent** stage a shell command into the **Terminal plugin** (polyipseity) pane
inside Obsidian. The relay **types** the command and stops — the operator's Return key runs it.

Built 2026-08-14. No build step: `main.js` IS the source (same convention as
`contextual-wiki-definitions`).

## Why it exists in this shape

`term-bridge` — a shared-tmux MCP shell-exec surface — was **retired 2026-07-28** after the
2026-07-18 re-audit named autonomous agent shell-exec the sharpest escape primitive on this host.
The tmux package was uninstalled as part of that retirement.

This relay is deliberately **not** a revival of it:

- `sanitize()` strips every line terminator — `\r`, `\n`, `U+2028`, `U+2029` — from the payload
  before it reaches the terminal. There is **no code path that can submit a command**.
- Consequently the worst case is text appearing in a terminal the operator is looking at.
- **Do not add an auto-execute setting.** That single toggle would recreate the retired primitive.

Unit-verified: all five line-terminator forms are stripped; see the security property test in the
session scratchpad (`relay-test.js`).

## How the agent drives it

`obsidian_execute_command` (the agent's only command-invoking tool) passes **no arguments**, which
is why the payload travels through a note:

1. Agent writes the command into `copilot/terminal-inbox.md` (fenced block preferred).
2. Agent invokes `copilot-terminal-relay:send-to-terminal`.
3. Relay reads the inbox, sanitizes, and pastes into the newest open terminal view.
4. Operator presses Return.

A ribbon icon triggers the same relay manually.

## Delivery path

Two strategies, tried in order, so a Terminal-plugin version bump does not break this:

1. **xterm instance** — walks the view object (depth ≤ 4, DOM subtrees skipped) for an object
   exposing both `paste` and `write`, then calls `paste()`.
2. **DOM fallback** — dispatches a synthetic `paste` ClipboardEvent at
   `textarea.xterm-helper-textarea`, which xterm turns into PTY input.

Neither depends on the Terminal plugin's internal module names.

## Settings

| Setting | Default | Purpose |
|---|---|---|
| Inbox note | `copilot/terminal-inbox.md` | Vault path the agent writes to |

## Standing rule

This lane carries **ordinary, non-privileged user commands only**. No sudo, no gate ceremonies, no
credential handling — all root goes through `sudo-gate` on the GUI login lane.
