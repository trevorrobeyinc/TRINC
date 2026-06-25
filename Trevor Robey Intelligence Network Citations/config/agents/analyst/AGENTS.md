# AGENTS — analyst

- **role:** analyst
- **recommended backend:** `claude-code` (Claude **Opus 4.8**, `claude-opus-4-8`) — rigorous mechanism / comparative-evidence analysis, 1M context
- **active backend:** governed by `config/role-provider-map.json` — **`claude-code` (Claude Opus 4.8)** as of 2026-06-22, with LM Studio `qwen/qwen3.5-9b` as the analyst's small **helper** (evidence-triage pre-pass) and emergency fallback. The helper is fail-soft and no-ops until LM Studio is started (`lms server start` + `lms load qwen/qwen3.5-9b`).
- **collaborates with:** consumes `scout`'s sources; feeds structured findings to `synthesizer`.
- **session log:** `config/agents/analyst/sessions/`.
- **notes:** never run a heavy local model concurrently with scout's local model on 16GB — see plan Phase 4 §2 (memory contention).
