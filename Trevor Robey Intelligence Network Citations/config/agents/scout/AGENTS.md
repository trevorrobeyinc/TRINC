# AGENTS — scout

- **role:** scout
- **recommended backend:** `claude-code` (Claude **Opus 4.8**, `claude-opus-4-8`) — robust source discovery at scale, 1M context for large evidence sets
- **active backend:** governed by `config/role-provider-map.json` — **`claude-code` (Claude Opus 4.8)** as of 2026-07-16 (Option B). The engine is **100% Claude**; scout's `fallback` is empty (`""`). The OSS helper-pre-pass + local fallback were **removed 2026-07-16** (restorable). Ollama `qwen2.5:7b-instruct` stays installed + boot-persistent on :11434 (via the :11435 mkcert TLS proxy) but **only for the Obsidian side** (Copilot + vault-zettelkasten) — it is no longer a scout helper or fallback.
- **collaborates with:** hands its source set to `analyst`; `synthesizer` writes the final report.
- **session log:** `config/agents/scout/sessions/` (per-run records + `summary-latest.json`).
- **notes:** keep every search grounded in the workflow `topic`; maximize unique resolvable identifiers per query.
