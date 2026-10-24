# LEARNINGS — TRINC (formerly TrevClaw-Obsidianodus)

Workspace-local learnings log. See global ~/.claude/CLAUDE.md "Self-Improvement System" section for templates and promotion rules.

---

## [LRN-20260502-001] best_practice

**Logged**: 2026-05-02T03:26:00-07:00
**Priority**: medium
**Status**: resolved
**Area**: docs

### Summary
Drift scanners that truncate per-pattern output (`head -10`) can hide real hits behind the truncation marker. After any drift-fix batch, ALWAYS re-run the scanner to surface previously-truncated remainder before declaring clean.

### Details
While running the trevor-robey-inc-brand-guardian scanner on 2026-05-02, the first scan reported "(20 hits)" for `OpenClaw Research Intelligence` but only displayed the first 10 lines, with `... (10 more)` as a truncation marker. I read the visible 10 lines, fixed those, and prematurely treated the work as complete. The second scan revealed 7 more genuine drift files (email-quant-analyst, vendor-application, prospect-targeting-guide, two more PV teaser HTMLs, kaggle-seo-breadcrumb, gumroad pv-ici-teaser) that had been hidden behind the truncation marker.

The scanner's `head -10` cap is intentional for readability and the `... (N more)` line correctly fires; the failure mode was on the human/agent side — not re-running after the first fix batch.

### Suggested Action
Promoted as a rule into `~/.claude/skills/trevor-robey-inc-brand-guardian/references/drift-detection.md` (workflow already says "scan, fix, re-run" but the re-run step deserves emphasis): the scanner is iterative, not single-pass.

### Metadata
- Source: error
- Related Files: ~/.claude/skills/trevor-robey-inc-brand-guardian/scripts/scan-for-drift.sh, ~/.claude/skills/trevor-robey-inc-brand-guardian/references/drift-detection.md
- Tags: drift-scanning, scanner-truncation, brand-guardian, iterative-cleanup
- See Also: change-log v1.1 entry in ~/.claude/skills/trevor-robey-inc-brand-guardian/references/change-log.md

---

## [LRN-20260504-001] correction

**Logged**: 2026-05-04T00:00:00-07:00
**Priority**: high
**Status**: promoted
**Area**: docs

### Summary
Hallucinated a Datarade self-serve provider path. Inferred from datarade.ai's Publishing Policies that providers could sign in at `datarade.ai/users/sign-in`, build a Profile, and submit Listings without the sales meeting. The actual flow: Datarade gates provider status behind team review (the May 20 meeting is part of that review), and post-approval all provider work happens on Monda (`app.monda.ai`) — Datarade's exclusive partner vendor portal — not on datarade.ai itself. `datarade.ai/users/sign-in` is a buyer login, not the provider dashboard.

### Details
On 2026-05-03 I told the user the Datarade meeting was optional and they could self-serve list immediately. The user pushed back and provided the actual flow on 2026-05-04: review-gate → Monda portal. Tavily verification of `monda.ai/partners/datarade` confirms: "Datarade is partnered exclusively with Monda. The integration between the two platforms mean that data providers can publish on Datarade instantly via their Monda portal."

The failure mode was inferring product flow from policy-page content instead of running a Tavily search to verify the actual relationship between Datarade and its vendor portal. Tavily was available the whole time — I just didn't use it before asserting.

### Suggested Action
Promoted to `~/.claude/CLAUDE.md` as a new top-level section: **"No Hallucinations — Verify via Tavily MCP"** with concrete trigger conditions, fallback order when Tavily is unavailable, and explicit forbidden behaviors (inferring from analogy, constructing URLs by pattern-matching, restating training data as current fact). The rule fires on any external/factual claim about products, URLs, pricing, partnerships, or processes.

Also rewrote `~/.claude/projects/-Users-trevorrobey-TrevClaw-Obsidianodus-trevor-robey-inc/memory/datarade_self_serve_path.md` to reflect the corrected flow and explicitly mark the prior file's claims as wrong.

### Metadata
- Source: user_feedback
- Related Files: ~/.claude/CLAUDE.md, ~/.claude/projects/-Users-trevorrobey-TrevClaw-Obsidianodus-trevor-robey-inc/memory/datarade_self_serve_path.md, ~/.claude/projects/-Users-trevorrobey-TrevClaw-Obsidianodus-trevor-robey-inc/memory/MEMORY.md
- Tags: hallucination, verification, tavily, datarade, monda, external-facts
- See Also: ~/.claude/CLAUDE.md "No Hallucinations — Verify via Tavily MCP" section

## [LRN-20260507-001] policy_change

**Logged**: 2026-05-07T18:40:00-04:00
**Priority**: medium
**Status**: resolved
**Area**: infra

### Summary
Miyo (`/Applications/Miyo.app`, :8742) was removed from the "loopback HTTP is acceptable" carve-out in the monorepo HTTPS-only invariant. A TLS-terminating proxy now fronts it on :8743.

### Details
On 2026-05-07 the operator opted out of the previous Miyo HTTP carve-out, citing concerns about advancing localhost-targeting attack classes (DNS rebinding, browser-based localhost probing, malicious npm postinstall scripts). Miyo's bundled Node server inside `Contents/Resources/bin/service/server.js` is hardcoded to plain HTTP and the binary is code-signed, so patching it is off the table. Solution chosen: a small `https.createServer` proxy at `Copilot-Everything/scripts/miyo-tls-proxy.mjs` listening on `127.0.0.1:8743`, forwarding to `127.0.0.1:8742`. Owned by launchd unit `~/Library/LaunchAgents/com.trevorrobey.miyo-tls-proxy.plist` (RunAtLoad + KeepAlive on crash). Mkcert pair from `~/.local/share/mkcert/`. Throws on cert load failure per the monorepo HTTPS-only invariant — no plaintext fallback.

Consumers updated to point at `:8743` (HTTPS):
- Copilot plugin: `repos/obsidian-copilot-mcp/src/miyo/MiyoServiceDiscovery.ts` default fallback.
- Command Center plugin: `src/copilot-integration/miyo-client.ts` (switched `import * as http` → `import * as https`, added explicit mkcert root CA via `ca:` option), `src/constants.ts` default port, `src/settings.ts` placeholder text.

Residual risk: Miyo's plaintext :8742 is still listening — we cannot make it stop. A malicious local process could still bypass the proxy by hitting :8742 directly. The documented architecture no longer routes through it; for stricter isolation, a follow-up `pf` rule restricting :8742 inbound to the proxy's UID is the next step.

### Suggested Action
None — change is shipped. If the Miyo app updates and changes its bundled server's bind address or port, the proxy upstream needs to be updated (env vars `MIYO_UPSTREAM_HOST` / `MIYO_UPSTREAM_PORT` allow override without code edits).

### Metadata
- Source: user_feedback
- Related Files: TrevClaw-Obsidianodus/CLAUDE.md, Copilot-Everything/scripts/miyo-tls-proxy.mjs, ~/Library/LaunchAgents/com.trevorrobey.miyo-tls-proxy.plist, Copilot-Everything/repos/obsidian-copilot-mcp/src/miyo/MiyoServiceDiscovery.ts, Claude/obsidian-openclaw-command-center/src/copilot-integration/miyo-client.ts
- Tags: https-invariant, miyo, defense-in-depth, dns-rebinding, mkcert, launchd
- See Also: TrevClaw-Obsidianodus/CLAUDE.md "HTTPS-only invariant" section

## [LRN-20260510-001] correction

**Logged**: 2026-05-10T03:35:00Z
**Priority**: high
**Status**: resolved
**Area**: workflow

### Summary
When user says "remove X" or "replace X with Y", they mean delete X entirely — not preserve X behind an opt-in flag.

### Details
Twice in the obsidian-bridge consolidation, I half-removed things by gating them behind opt-in env vars or preferredOrder lists instead of deleting. User corrected: (1) "you can remove advanced URI then because REST API will take over" → I left aduri.ts in tree as opt-in, was told to delete; (2) "replace the cli fallback with an error message" → I kept CliBackend behind OBSIDIAN_TRANSPORT=cli opt-in, was told to delete the backend AND build a real diagnostic tool.

### Suggested Action
When the user issues a removal/replacement directive in this codebase, the deletion is total. Do not preserve the old code as a "safety net" or "future opt-in" unless the user explicitly requests that pattern. Default behavior: delete the file, delete the type literal, delete the tests, delete the dependent helpers.

### Metadata
- Source: user_feedback
- Related Files: src/backends/cliBackend.ts (deleted), src/server/tools/aduri.ts (deleted)
- Tags: bridge-consolidation, removal-semantics, scope-creep

## [LRN-20260510-002] knowledge_gap

**Logged**: 2026-05-10T10:45:00Z
**Priority**: high
**Status**: resolved
**Area**: backend

### Summary
Node does NOT auto-load `.env` / `.env.local` files. Daemons spawned by another process (e.g., obsidian-bridge-launcher Obsidian plugin) need an explicit env loader before any module reads `process.env`.

### Details
The bridge daemon at port 8798 has its API key sealed in `bridges/obsidian-copilot-bridge/.env.local` (mode 0600, gitignored). I assumed Node would source this automatically. It does not. When the obsidian-bridge-launcher plugin spawned the daemon, `process.env.OBSIDIAN_REST_API_KEY` was undefined and `RestApiBackend.probe()` failed with `config_invalid`. The new `obsidian_health` diagnostic tool flagged this exact case ("config" category, OBSIDIAN_REST_API_KEY missing) — proving its value.

### Suggested Action
Any time a daemon is spawned by another process (Obsidian plugin, launchd, PM2, systemd) and depends on a `.env`-style file, EXPLICITLY load it from disk inside the daemon's main entry point — don't rely on the parent's environment. Use a small no-dep loader (see `src/config/envLocal.ts`) to avoid the dotenv dependency. Load BEFORE any module that reads `process.env` at module-load time.

### Metadata
- Source: tool_result
- Related Files: src/config/envLocal.ts (created), src/index.ts (loadEnvLocal called at top)
- Tags: env-loading, spawn-environment, secrets, dotenv-pitfall
