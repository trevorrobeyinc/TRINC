# AGENTS — scout

- **role:** scout
- **recommended backend:** `claude-code` (Claude **Opus 4.8**, `claude-opus-4-8`) — robust source discovery at scale, 1M context for large evidence sets
- **active backend:** governed by `config/role-provider-map.json` — **`claude-code` (Claude Opus 4.8)** as of 2026-06-22. Ollama `qwen2.5:7b-instruct` was **retired as the scout primary** and is now scout's small **helper** (an evidence-triage pre-pass that runs before Opus) **and** emergency fallback — kept installed + boot-persistent on :11434 (via the :11435 mkcert TLS proxy), on the back burner. The helper is fail-soft: if Ollama is down the pre-pass is skipped and Opus runs alone.
- **collaborates with:** hands its source set to `analyst`; `synthesizer` writes the final report.
- **session log:** `config/agents/scout/sessions/` (per-run records + `summary-latest.json`).
- **notes:** keep every search grounded in the workflow `topic`; maximize unique resolvable identifiers per query.
