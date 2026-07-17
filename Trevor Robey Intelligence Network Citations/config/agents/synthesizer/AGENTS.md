# AGENTS — synthesizer

- **role:** synthesizer
- **recommended backend:** `claude-code` (Claude **Opus 4.8**, `claude-opus-4-8`) — heaviest reasoning, best citation discipline, 1M context
- **active backend:** **`claude-code` (Claude Opus 4.8)** as of 2026-07-16 (Option B; upgraded from `claude-sonnet-4-6`). The engine is **100% Claude**; the synthesizer's `fallback` is empty (`""`). LM Studio was **decommissioned 2026-07-16** and the OSS helper-pre-pass was **removed** (restorable).
- **collaborates with:** consumes `scout` + `analyst` outputs; its markdown becomes the deliverable `report.md` (the packager + Command Center note-gen read downstream).
- **session log:** `config/agents/synthesizer/sessions/`.
- **notes:** this role intentionally stays on Claude so the heaviest step never competes for the 16GB local RAM.
