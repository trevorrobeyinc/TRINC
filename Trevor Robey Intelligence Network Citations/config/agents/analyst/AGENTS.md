# AGENTS — analyst

- **role:** analyst
- **recommended backend:** `claude-code` (Claude **Opus 4.8**, `claude-opus-4-8`) — rigorous mechanism / comparative-evidence analysis, 1M context
- **active backend:** governed by `config/role-provider-map.json` — **`claude-code` (Claude Opus 4.8)** as of 2026-07-16 (Option B). The engine is **100% Claude**; the analyst's `fallback` is empty (`""`). LM Studio was **decommissioned 2026-07-16** and the OSS helper-pre-pass was **removed** (restorable: restore a `helper` block, set `fallback` to `local`, and enable `providers.local`).
- **collaborates with:** consumes `scout`'s sources; feeds structured findings to `synthesizer`.
- **session log:** `config/agents/analyst/sessions/`.
- **notes:** never run a heavy local model concurrently with scout's local model on 16GB — see plan Phase 4 §2 (memory contention).
