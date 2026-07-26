# TrevClaw-Obsidianodus — Recovery Phase 1 (executed plan)

Driven from `trevclaw-recovery-phase1.prompt.xml` + `MIGRATION.md`, **adapted to this machine**
(user `myhome`, repo at `/Users/myhome/TrevClaw-Obsidianodus`, not `/Users/trevorrobey/...` (was `/Volumes/ExtraCurricular/TrevClaw-Obsidianodus` until 2026-07-26)).

## Reasoning trace — machine reality vs. plan assumptions
- **Goal:** bring the stack from code-only checkout to runnable, excluding the custom Claude↔Desktop
  orchestration layer (retire the cli-bridge).
- **Discovery:** the plan assumed `/Users/trevorrobey` + Phase 0 done. Reality: user is `myhome`; the
  repo dir was empty; no Node/nvm/Homebrew/mkcert; bundle present on IronKey `/Volumes/TrevClaw-Pa`.
- **Choice (user-approved):** full bootstrap + Phase 1, all paths adapted to this machine.

## Phase 0 — Bootstrap
- [~] **0a. Toolchain** — ✅ nvm v0.40.4 + **Node 22.13.1** (npm 10.9.2) installed at
      `/Users/myhome/.nvm/versions/node/v22.13.1/bin/node`; `~/.zshrc` nvm block written. ⏳ PENDING
      (interactive, you): **Homebrew** (sudo), **mkcert + CA + localhost cert** (needs brew + Keychain),
      **standalone `claude` CLI + SSO login** (not installed; engine's primary LLM provider). Xcode CLT
      and system `python3 3.9.6` already present.
- [x] **0b. Restore repo from bundle** — cloned `TrevClaw-Obsidianodus-20260529-2158.bundle`; recovered
      stash `a7fc6a0` (reflog rebuilt so `git stash list` shows it); created local branches for all 3
      non-main branches; all 5 tags present; removed `origin` (no remotes); ToolUniverse submodule
      checked out at v1.1.10.

## Phase 1 — Tasks
- [x] **Task 1 — Retire claude-cli-bridge.** `git mv` → `Claude/.archive/claude-cli-bridge/`; wrote
      `ARCHIVED.md`; edited root `CLAUDE.md` topology + added deletion-log entry; edited `ARCHITECTURE.md`
      topology; annotated the remaining descriptive references (`Claude/CLAUDE.md` section + table rows,
      `Copilot-Everything/CLAUDE.md`, `.specify/specs/003-copilot-everything/{spec,plan}.md`).
      *Deviation:* historical `.specify` specs were annotated with section/file-level RETIRED banners
      rather than rewritten line-by-line (minimal-diff / no-drive-by bar) — so a raw grep for the string
      still matches inside those preserved historical FRs by design.
- [x] **Task 2 — Dependencies (Node side).** All 10 non-archived packages installed (`npm ci`, exit 0;
      engine + canonical bridge + 5 hub MCP servers + 2 adapters + vendored copilot-mcp fork). Engine
      smoke `node scripts/verify-node-runtime.js` → `{"ok":true,"actual":"22.13.1"}`.
      ⚠️ **FLAGGED:** ToolUniverse Python deps NOT installed — `vendor/tooluniverse` requires
      `requires-python >=3.10`, but only system `python3 3.9.6` is present. Run after Homebrew:
      `brew install python@3.12 && cd <repo> && python3.12 -m venv .venv && . .venv/bin/activate && pip install -e "Trevor Robey Intelligence Network Citations/vendor/tooluniverse"`.
- [x] **Task 3 — Global ~/.claude.** Wrote `~/.claude/CLAUDE.md` (Browser MCP Strategy + Security triad,
      with `[TODO: verify]` markers) and scaffolded `~/.claude/skills/security-orchestration/`
      (`SKILL.md` + `references/trevclaw-stack-profile.md`). No cli-bridge / `claude mcp serve` wiring.
- [x] **Task 4 — Claude Desktop MCP.** Backed up `claude_desktop_config.json` → `.bak.recovery.<epoch>`;
      surgically added only `mcpServers.obsidian-bridge` (adapted paths; matches committed `.mcp.json`),
      preserving existing Cowork `preferences`. *Deviation:* filesystem + AWS API MCP are Desktop
      **Extensions** (UI-managed, like the biomedical connectors), not `mcpServers` JSON — flagged for
      re-add via Settings → Extensions rather than fabricated. Excludes cli-bridge / `claude mcp serve`.
      Inert until Phase 2: needs `~/.config/obsidian-bridge/obsidian-cli-mcp.local.json` (HMAC secret+URL,
      wiped), the `:8798` bridge running (Obsidian), and the mkcert CA.
- [x] **Task 5 — launchd TLS proxies.** Wrote all 4 `/Users/myhome/Library/LaunchAgents/com.trevorrobey.*-tls-proxy.plist`
      (adapted node path + mkcert CA; RunAtLoad+KeepAlive; logs `~/.{svc}-tls-proxy.log`). All pass
      `plutil -lint`. *Deviation (safety):* did NOT `launchctl load` — they'd crash-loop under KeepAlive
      against the not-yet-created mkcert cert. **Load after `mkcert -install`** with:
      `for s in miyo qdrant lm-studio ollama; do launchctl load ~/Library/LaunchAgents/com.trevorrobey.$s-tls-proxy.plist; done`
- [x] **Task 6 — Verify.** `lint-transport-monorepo.sh --strict` → **exit 0** (0 violations, 555 files).
      Engine workflow tests **42 pass / 0 fail** (`phase30-workflow-engine`, `phase30-workflow-schema`,
      `phase31-workflow-scheduler`) — substituted for the documented `phase35-parallel-workflow.test.js`,
      which **does not exist** post-flat-merge (no phase35 test in `tests/core/`). `node --check`: no
      `.mjs` was edited this recovery (only `.md`/`.json`/`.plist`). DEFERRED (Phase-2-pending): HTTPS
      health checks on :8798 (Obsidian bridge) and :8743 (Miyo).
- [x] **Task 7 — RECOVERY-REPORT.md** written at repo root. Re-backup (optional) **deferred** until the
      interactive Phase-0a items complete (backing up now would capture an incomplete state).

## Flagged items
- **ToolUniverse Python deps blocked** on Python ≥3.10 (system is 3.9.6). Install via Homebrew, then
  re-run the venv + `pip install -e` step (command above).
- **Interactive toolchain pending (you):** Homebrew, mkcert+CA, standalone `claude` CLI + SSO login.
