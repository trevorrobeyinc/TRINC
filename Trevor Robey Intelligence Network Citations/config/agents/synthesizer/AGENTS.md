# AGENTS — synthesizer

- **role:** synthesizer
- **recommended backend:** `claude-code` (Claude **Opus 4.8**, `claude-opus-4-8`) — heaviest reasoning, best citation discipline, 1M context
- **active backend:** **`claude-code` (Claude Opus 4.8)** as of 2026-06-22 (upgraded from `claude-sonnet-4-6`), with LM Studio `qwen/qwen3.5-9b` as the synthesizer's small **helper** (evidence-triage pre-pass) and emergency fallback (fail-soft; no-ops until LM Studio is loaded).
- **collaborates with:** consumes `scout` + `analyst` outputs; its markdown becomes the deliverable `report.md` (the packager + Command Center note-gen read downstream).
- **session log:** `config/agents/synthesizer/sessions/`.
- **notes:** this role intentionally stays on Claude so the heaviest step never competes for the 16GB local RAM.
