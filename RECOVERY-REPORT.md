# RECOVERY-REPORT — TrevClaw-Obsidianodus (Phase 0 + Phase 1)

**Date:** 2026-05-31 → 2026-06-01. **Driven by:** `trevclaw-recovery-phase1.prompt.xml` + `MIGRATION.md`.
**Machine reality (differs from the plan's assumptions):** user **`myhome`** (home `/Users/myhome`); repo
restored to **`/Volumes/ExtraCurricular/TrevClaw-Obsidianodus`** (NOT `/Users/trevorrobey/...`). All
absolute paths in created artifacts were adapted accordingly (user-approved).

---

## ✅ DONE (this session)

| # | Task | Result |
|---|------|--------|
| 0b | Restore repo from bundle | Cloned `TrevClaw-Obsidianodus-20260529-2158.bundle` from IronKey (`/Volumes/TrevClaw-Pa`). `main` + 3 branches + 5 tags + stash `a7fc6a0` recovered (stash reflog rebuilt so `git stash list` shows it). `origin` removed (local-only). ToolUniverse submodule at **v1.1.10**. |
| 0a | Toolchain (partial) | **nvm v0.40.4 + Node 22.13.1** (npm 10.9.2) at `/Users/myhome/.nvm/versions/node/v22.13.1/bin/node`; `~/.zshrc` nvm block written. |
| 1 | Retire claude-cli-bridge | `git mv` → `Claude/.archive/claude-cli-bridge/` (history follows; `git log --follow` works). `ARCHIVED.md` added. Topology blocks in root `CLAUDE.md` + `ARCHITECTURE.md` no longer list the bridge or `claude mcp serve`; deletion-log entry added. All other references annotated RETIRED. **Committed `c9bdaa5`.** |
| 2 | Dependencies (Node) | All 10 non-archived packages `npm ci`/`install` (exit 0). Engine smoke `verify-node-runtime.js` → `{"ok":true,"actual":"22.13.1"}`. |
| 3 | Global `~/.claude` | `~/.claude/CLAUDE.md` (Browser MCP Strategy + Security triad, with `[TODO: verify]`) + `~/.claude/skills/security-orchestration/{SKILL.md,references/trevclaw-stack-profile.md}`. No cli-bridge / `mcp serve`. |
| 4 | Claude Desktop MCP | Backed up config; surgically added `mcpServers.obsidian-bridge` (adapted paths), preserving existing Cowork `preferences`. Excludes cli-bridge / `mcp serve`. |
| 5 | launchd TLS proxies | 4 plists written to `~/Library/LaunchAgents/com.trevorrobey.{miyo,qdrant,lm-studio,ollama}-tls-proxy.plist` (adapted node path + mkcert CA; RunAtLoad+KeepAlive). All pass `plutil -lint`. **Not loaded** (see pending). |
| 6 | Verify | `lint-transport-monorepo.sh --strict` → **exit 0** (0 violations). Engine workflow tests **42 pass / 0 fail**. |

---

## ✅ DONE — Obsidian plugin layer (verified + fixed 2026-06-01, vault survived the wipe)

The vault `/Volumes/ExtraCurricular/My Digital Garden` was NOT lost. All plugins are installed + enabled
(Copilot v3.3.3 fork, Local REST API, obsidian-bridge-launcher, openclaw-command-center, vault-zettelkasten).
Verification found + fixed config drift from the old machine:

- **Built** `Copilot-Everything/bridges/obsidian-copilot-bridge` (`dist/index.js`) and
  `Claude/trevorobeyinc-research-memory-mcp` (`dist/cli.js`) — both were unbuilt; bridge-launcher and
  Command Center spawn those paths.
- **Repointed stale `/Users/trevorrobey/Code/THE Copilot in Obsidian Everything/...` paths** (each
  data.json backed up `.bak.recovery.<epoch>`):
  - `obsidian-bridge-launcher`: `nodePath`, `bridgePackagePath`, `mcpConfigPath`, `caCertPath`.
  - `openclaw-command-center`: `nodePath`, `openclawPath` (→ engine `Trevor Robey Intelligence Network Citations`),
    `zettelkastenServerPath`, `researchMemoryCliPath`.
- **HTTPS-only fixes** (plaintext → TLS proxy): `vault-zettelkasten.llmBaseUrl` and the copilot
  `qwen2.5-coder-7b-instruct|lm-studio` model `baseUrl`: `http://127.0.0.1:1234` → `https://127.0.0.1:1235`.
- **Verified intact:** Local REST API (`:27124` + its own TLS keypair + apiKey), Copilot keychain-only mode
  (`_keychainVaultId 25e28001`), Copilot MCP→`:8798` auth token, Miyo `:8743` / Qdrant `:6433` endpoints.

- **Scaffolded the bridge HMAC config** `…/obsidian-copilot-bridge/config/obsidian-cli-mcp.local.json`
  (mode `0600`, gitignored): transport `127.0.0.1:8798`, `allowedVaultRoots` = the real vault,
  `obsidianCliBinary` = the Obsidian.app CLI, and `security.authToken` **set to match the Copilot MCP token
  already in the vault** (so HMAC verifies). This completes the secret side of the Copilot↔bridge chain.

Still blocked for the Obsidian stack specifically: the `:8798` bridge needs **mkcert** to start, and the
Desktop stdio adapter still needs `~/.config/obsidian-bridge/obsidian-cli-mcp.local.json` (wiped — separate
from the Copilot link above).

## ⏳ PENDING — Phase 0a interactive (you; needs sudo / Keychain / browser SSO)

1. **Homebrew** — `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`
2. **mkcert + CA + cert pair** (needed by every HTTPS service + the 4 proxies):
   ```bash
   brew install mkcert nss
   mkcert -install                       # Keychain prompt
   mkdir -p ~/.local/share/mkcert
   mkcert -cert-file ~/.local/share/mkcert/localhost.pem \
          -key-file  ~/.local/share/mkcert/localhost-key.pem  localhost 127.0.0.1
   ```
3. **Standalone `claude` CLI + login** — not installed (it's the engine's primary LLM provider per
   `config/llm-providers.json`, and backs `claude -p`):
   `curl -fsSL https://claude.ai/install.sh | bash` then `claude` (browser SSO).

## ⏳ PENDING — finish the deferred task steps (after the above)

4. **Load the 4 TLS proxies** (deferred on purpose — they crash-loop under KeepAlive without the cert):
   ```bash
   for s in miyo qdrant lm-studio ollama; do
     launchctl load ~/Library/LaunchAgents/com.trevorrobey.$s-tls-proxy.plist
   done
   launchctl list | grep com.trevorrobey
   ```
5. **ToolUniverse Python deps** — blocked: `vendor/tooluniverse` needs Python ≥3.10, system is 3.9.6:
   ```bash
   brew install python@3.12
   cd "/Volumes/ExtraCurricular/TrevClaw-Obsidianodus"
   python3.12 -m venv .venv && . .venv/bin/activate
   pip install -e "Trevor Robey Intelligence Network Citations/vendor/tooluniverse"
   ```
6. **obsidian-bridge adapter secret** — restore `~/.config/obsidian-bridge/obsidian-cli-mcp.local.json`
   (HMAC secret + bridge URL; wiped). The Desktop `obsidian-bridge` server is registered but inert until
   this + the `:8798` bridge (Obsidian) exist.
7. **Filesystem + AWS API MCP as Desktop *Extensions*** (NOT JSON — re-add via Settings → Extensions;
   AWS as `ReadOnlyAccess`). Same for the biomedical/data connectors (account-tied UI connectors).
8. **Deferred health checks** (run once Phase 2 apps are up):
   ```bash
   curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:8798/healthz
   curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:8743/v0/health
   ```

## ⏳ PENDING — Phase 2 (external apps & accounts; you)
Obsidian (+ reinstall `openclaw-command-center`, `obsidian-bridge-launcher`, `vault-zettelkasten`,
copilot-mcp plugins), Miyo.app, LM Studio, Ollama, Docker/Colima, Raycast. AWS SSO
(`aws configure sso`, acct `833390816446` + YubiKey). Re-enable account-tied Desktop connectors.

## Optional — fresh backup (after the above are green)
`scripts/TrevClaw-Obsidianodus-backup.sh /Volumes/<DRIVE>` — deferred so it captures a *complete* state,
not this mid-recovery one.

---

## Reasoned deviations from the literal plan
- **Paths adapted** `/Users/trevorrobey` → `/Users/myhome` + repo on the ExtraCurricular volume (approved).
- **Task 1:** historical `.specify` specs + CLAUDE.md prose were **annotated** with RETIRED banners, not
  rewritten line-by-line (minimal-diff / no-drive-by bar) — so `grep "claude-cli-bridge"` still matches
  inside preserved historical docs by design. Topology blocks (the explicit acceptance) are clean.
- **Task 4:** filesystem + AWS API MCP are Desktop **Extensions** (UI-managed), not `mcpServers` JSON —
  flagged for UI re-add rather than fabricated (committed `.mcp.json` confirms only custom stdio servers).
- **Task 5:** plists written + linted but **not loaded** (safety — avoids crash-loop before mkcert).
- **Task 6:** documented `phase35-parallel-workflow.test.js` does not exist; ran the actual
  workflow-engine/scheduler tests (42/42) instead.

## Risk items (from MIGRATION.md) — status
- **ExtraCurricular vault** `/Volumes/ExtraCurricular/My Digital Garden` — ✅ present + mounted.
- **Global `security-orchestration` skill** — scaffolded with TODO markers; original detail
  (Kismet/Falcon specifics) still needs rebuilding from memory/other backups.
