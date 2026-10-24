# opencode ↔ Claude delegation bridge — canonical index

**This directory is the single place that tells you where every file of the opencode↔Claude
setup lives and what it does.** It is a **map, not a store**: the operational files stay in the
locations each tool actually reads them from (see "Why the files are not all in this repo"
below). Start here; follow the absolute paths.

Built 2026-08-06. Owner: the operator. Purpose: let Claude delegate cheap mechanical + biomedical
research to opencode's **free** models at $0, safely.

---

## What the bridge is (one paragraph)

Claude calls the `mcp__opencode__*` tools to hand a task to a **free opencode model**, which runs
it and returns the result. A security **guardrail** restricts what that free, web-browsing worker
can touch (read-only public-data tools only). A dedicated **read-only biomedical MCP server**
gives the worker ChEMBL / ClinicalTrials.gov / PubMed / ICD-10 lookups. opencode and Claude
coordinate through the shared **continuity board**.

---

## ⚠️ Why the files are NOT all in this repo (do not "consolidate" them here)

Each location is deliberate; moving these into the monorepo would break the setup or violate a
standing decision:

- **opencode config** must live in `~/.config/opencode/` — that is the only place opencode
  discovers `opencode.jsonc` / `AGENTS.md`. Move it and opencode stops seeing it.
- **The MCP servers** are machine tooling, kept in `~/.claude/mcp-servers/` per the standing rule
  that tooling lives in its proper config location, not the business monorepo. Their MCP
  registrations also hard-code these absolute paths.
- **Security artifacts** live in `~/Security Everything/` per an explicit operator decision.
- **No secrets in git:** `opencode.jsonc` carries a Zoho MCP path-token; config files with
  credentials must not sit in a git tree.
- **The DR backup bundle stays OFF-tree** (`~/Documents/` + external volume): a repo's own backup
  cannot live inside the repo (self-referential, git-bloat, and it would die with the repo it is
  meant to restore).

So this hub **documents and links**; it does not relocate.

---

## The complete file map

### MCP servers (code) — `~/.claude/mcp-servers/`
| Path | Role |
|---|---|
| `~/.claude/mcp-servers/opencode-mcp/` | The delegation server (reviewed `rajib884/opencode-mcp` clone + venv): `server.py`, `runner.py`, `guards.py`, `sessions_store.py`, `README.md`. Exposes `delegate`/`ping`/`models`/`list_sessions`/`forget_session`. venv pinned `mcp<2`. |
| `~/.claude/mcp-servers/biomed-readonly-mcp/` | **New** standalone read-only biomedical server: `server.py`, `sources.py`, `requirements.txt`, `README.md`, `OPENCODE-HANDOFF.md`, venv. 7 GET-only tools (ChEMBL/CT.gov/PubMed/ICD-10) behind a fixed egress allowlist. |

### opencode config — `~/.config/opencode/`
| Path | Role |
|---|---|
| `~/.config/opencode/opencode.jsonc` | Interactive opencode config (the app + CLI). `biomed-readonly` is enabled here so the **app** can use it. 0600 (holds a Zoho token). |
| `~/.config/opencode/delegation-guardrail.json` | The **worker allowlist** applied via `OPENCODE_CONFIG`. Enables only read-only research servers (`searxng-search`, `alphaxiv`, `biomed-readonly`); disables all action/identity/secret servers (`scholar-sidekick` retired 2026-08-27, entry kept as `enabled:false`). 0600. |
| `~/.config/opencode/AGENTS.md` | opencode's global instructions (auto-loaded every session) — points opencode at the continuity board and at THIS hub. |
| `~/.local/share/opencode/auth.json` | opencode free-model auth (Zen key). Do not move or commit. |

### MCP registrations (three surfaces — same server name `opencode`, scopes dedupe)
| Path | Covers |
|---|---|
| `~/.claude.json` | user scope — every Claude Code session (CLI + Desktop Code tab). |
| `TRINC/.mcp.json` | project scope — wins in-repo; adds `OPENCODE_MCP_ALLOWED_DIRS` (write confined to the repo). **The only committed piece.** |
| `~/Library/Application Support/Claude/claude_desktop_config.json` | Desktop Chat twin. |

Every stanza sets `OPENCODE_MCP_BIN=/opt/homebrew/bin/opencode` (GUI servers don't inherit brew's PATH) + `OPENCODE_MCP_MODEL` + `OPENCODE_CONFIG` (the guardrail).

### Security & integrity — `~/Security Everything/opencode-delegation-guard/`
| Path | Role |
|---|---|
| `.../README.md` | Full security writeup: the allowlist model + the **Classification Rule**. |
| `.../verify.sh` | Integrity tripwire for the third-party `opencode-mcp` clone (run before any `git pull`). |
| `.../CODE-MANIFEST.sha256`, `.../BIOMED-MANIFEST.sha256` | Pinned hashes of the reviewed server code. |
| `~/.claude/settings.json` | LLM Guard PostToolUse matcher includes `mcp__opencode__` — scans the worker's web-sourced output on the way back into Claude. |

### Coordination, memory, backups
| Path | Role |
|---|---|
| `TRINC/_continuity/CONTINUITY.md` | Shared board; **opencode** is a participating surface. |
| `~/.claude/projects/<this-project>/memory/opencode-mcp-delegation-lane.md` | Project memory for the lane (+ `biomed-readonly-mcp-server`). |
| Global Perseus vault | `opencode-delegation-worker-mcp-guardrail` (security-invariant) + `biomed-readonly-mcp-server`. |
| `~/Documents/TRINC-FULL-backup-*.bundle` + `/Volumes/ExtraCurricular/Backups/` | DR bundles (git history only — **not** these out-of-repo files). |

---

## Security model (short — full detail in the guard README)

**Classification Rule:** the delegation worker may use an MCP server **only if it is read-only AND
public-data AND cannot exfiltrate.** That keeps the prompt-injection lethal trifecta broken.
Enabled for the worker: `searxng-search`, `alphaxiv`, `biomed-readonly` (`scholar-sidekick` retired 2026-08-27 — service removed everywhere).
Never enabled: `sudo-gate`, `gmail`, `firewalla`, `filesystem-plus`, `phone-gate`, `github`,
`zoho-mail`, `zoho-trinc`, `falcon`, `perseus-business`, `perseus-vault`.

---

## How to test

**From Claude** (new session; already-open sessions need restart):
> delegate: use `biomed-readonly` `ctgov_search` to find one recruiting glioblastoma immunotherapy trial.

**From the opencode app / CLI:**
```bash
opencode run -m opencode/deepseek-v4-flash-free "Use chembl_search_molecule to look up imatinib; report its ChEMBL id."
```
Attach context for the model with `-f ~/.claude/mcp-servers/biomed-readonly-mcp/OPENCODE-HANDOFF.md`.

---

## Maintenance (where to change things)
- **Add a server for the worker:** sort it by the Classification Rule; only if it passes, add
  `"<name>": {"enabled": true}` to `delegation-guardrail.json` (and its definition to
  `opencode.jsonc`). Never enable an action/identity/secret server.
- **Change the default free model:** `OPENCODE_MCP_MODEL` in the three registrations (ids rotate —
  the `models` tool re-checks).
- **After editing the third-party `opencode-mcp` clone or before `git pull`:** run the guard's
  `verify.sh`.
- **Cut a DR backup:** `git bundle create ~/Documents/TRINC-FULL-backup-$(date +%Y%m%d-%H%M).bundle --all`, `git bundle verify` it, copy to `/Volumes/ExtraCurricular/Backups/`, SHA-256-match, and update the pointer in the repo `CLAUDE.md` Hosting line.
