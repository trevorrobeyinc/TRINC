# AGENTS — analyst

- **role:** analyst
- **recommended backend:** LM Studio with a ~9B Q4_K_M instruct model (e.g. Qwen 3.x 9B, ~6.6GB) for mid-weight analysis
- **active backend:** governed by `config/role-provider-map.json` — currently the global default `claude-code` until LM Studio is installed and the served model id is confirmed.
- **collaborates with:** consumes `scout`'s sources; feeds structured findings to `synthesizer`.
- **session log:** `config/agents/analyst/sessions/`.
- **notes:** never run a heavy local model concurrently with scout's local model on 16GB — see plan Phase 4 §2 (memory contention).
