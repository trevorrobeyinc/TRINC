# AGENTS — synthesizer

- **role:** synthesizer
- **recommended backend:** `claude-code` (keep — heaviest reasoning, best citation discipline, zero local RAM cost)
- **active backend:** `claude-code` (the global default; no change needed).
- **collaborates with:** consumes `scout` + `analyst` outputs; its markdown becomes the deliverable `report.md` (the packager + Command Center note-gen read downstream).
- **session log:** `config/agents/synthesizer/sessions/`.
- **notes:** this role intentionally stays on Claude so the heaviest step never competes for the 16GB local RAM.
