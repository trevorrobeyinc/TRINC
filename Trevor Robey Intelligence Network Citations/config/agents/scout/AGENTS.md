# AGENTS — scout

- **role:** scout
- **recommended backend:** Ollama (`local`) with a 7–9B Q4 instruct model (light retrieval/extraction)
- **active backend:** governed by `config/role-provider-map.json` — **`local` (Ollama `qwen2.5:7b-instruct`)** as of 2026-06-11. Ollama is installed + boot-persistent on :11434 (reached via the :11435 mkcert TLS proxy); falls back to `claude-code` if Ollama errors.
- **collaborates with:** hands its source set to `analyst`; `synthesizer` writes the final report.
- **session log:** `config/agents/scout/sessions/` (per-run records + `summary-latest.json`).
- **notes:** keep every search grounded in the workflow `topic`; maximize unique resolvable identifiers per query.
