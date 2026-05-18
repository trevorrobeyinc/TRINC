# scrape-sidecar

Manual-invocation HTTPS sidecar that fetches JS-rendered open-access biomedical pages and emits provenance-tagged JSON to `openclaw-bridge`. Adds two capabilities the existing API-only ingestion stack cannot reach: JavaScript rendering and engine diversity (Firefox alongside Chromium).

## Why this exists

The 8 project MCP servers + ToolUniverse cover API-accessible biomedical sources. They miss:
- JS-rendered article landing pages (eLife, PLOS, Frontiers, F1000Research)
- Public regulatory dashboards (FDA, EMA, WHO) with no programmatic API
- Conference abstract sites (ASCO, AACR, ASH) — web-only

This sidecar fills those gaps using Playwright with two bundled browsers: Firefox (default — preserves non-Chromium fingerprint diversity) and Chromium (fall-through). Each fetch launches a fresh browser with no persistent profile, matching the global "Playwright MCP --isolated" posture in `~/.claude/CLAUDE.md` "Browser MCP Strategy and Context Persistence". The retired Camoufox + SeleniumBase engines (archived 2026-05-11 with the browser-MCP toolkit downsize) are no longer used.

## Posture

- **Lifecycle bound to a research session.** The sidecar is auto-started when `scripts/run-research-task.js` or `scripts/run-workflow.js` runs and is stopped when the script exits — see `openclaw-bridge/core/scrape-sidecar-lifecycle.js`. There is no launchd entry, no PM2 entry, no boot-time startup. The sidecar exists only while a research session is in flight. Aligns to `trevor-robey-inc-agents/CLAUDE.md`: "External publishing, uploads, marketplace submissions, customer delivery, login automation, and browser automation are all manual-only." Operator manually invokes the research session; the sidecar's lifecycle inherits from that.
- **Manual start still works.** For ad-hoc dev, run `bash scripts/start-sidecar.sh` directly. The lifecycle module detects an already-running sidecar and attaches to it (does not stop it on session exit).
- **Disable auto-start.** Set `OPENCLAW_AUTOSTART_SCRAPE_SIDECAR=0` in the environment to disable the lifecycle entirely. Useful for CI or when running without TLS certs.
- **HTTPS only.** Listens on TLS via mkcert. Refuses to start without certs. Aligns to monorepo HTTPS-only invariant in `TrevClaw-Obsidianodus/CLAUDE.md`.
- **Allow-list only.** Targets are registered in `app/connectors/`. Unknown targets return 404. Adding a new target requires an entry in `trevor-robey-inc/09-source-licenses/scraping-targets.md`.
- **Brand-aligned ethics floor**: refuses paywalled responses (HTTP 401/402, login redirects), refuses output containing DrugBank IDs (`DB\d{5}`) or surface PHI patterns, tags every record with `license`, `source_url`, `retrieved_at`, `citation_hash`. The canonical PHI screen remains the Presidio gate at `trevor-robey-inc/10-quality-pipeline/presidio-phi-pii-screening/`.

## Setup (one-time bootstrap)

The first time, the start script downloads browser binaries (~hundreds of MB). After that, every subsequent boot is fast.

```
brew install uv
cd scrape-sidecar
bash scripts/start-sidecar.sh
```

`brew install uv` - installs the Python package manager used to create the sidecar's venv.
`cd scrape-sidecar` - enter the sidecar project folder.
`bash scripts/start-sidecar.sh` - creates the venv, installs Python deps, downloads the Playwright Firefox + Chromium binaries on first run, then boots the sidecar with mkcert TLS.

After that one-time bootstrap, you don't run this script by hand again — `scripts/run-research-task.js` and `scripts/run-workflow.js` auto-start the sidecar via `openclaw-bridge/core/scrape-sidecar-lifecycle.js`.

If mkcert is not installed:

```
brew install mkcert nss
mkcert -install
mkcert localhost 127.0.0.1
```

`mkcert -install` - installs the mkcert CA into the system keychain. `mkcert localhost 127.0.0.1` - generates `localhost.pem` and `localhost-key.pem` in the current directory; move them to `~/.local/share/mkcert/` to match the env defaults.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Engine availability + TLS confirmation |
| GET | `/targets` | List registered connectors (target id, domain, license) |
| POST | `/scrape` | Fetch + parse + normalize one record |

### Request shape

```
POST /scrape
{
  "target": "elife",
  "params": { "article_id": "83456" },
  "prefer_engine": "playwright-firefox",
  "bypass_cache": false
}
```

### Response shape

```
{
  "record": {
    "source_url": "https://elifesciences.org/articles/83456",
    "retrieved_at": "2026-05-07T...",
    "data_source": "elife",
    "citation_hash": "<sha256>",
    "license": "cc-by-4.0",
    "engine": "playwright-firefox",
    "engines_tried": ["playwright-firefox"],
    "payload": { "title": "...", "doi": "...", "abstract": "...", "authors": [...], "figures": [...], "supplementary_links": [...] }
  },
  "cache_hit": false,
  "engines_tried": ["playwright-firefox"]
}
```

## Calling from `openclaw-bridge`

The Node side calls the sidecar via the new `scrapeSidecarRequest()` helper in `openclaw-bridge/core/https-client.js`. `NODE_EXTRA_CA_CERTS` must be set to the mkcert root CA so Node trusts the sidecar's cert.

```
NODE_EXTRA_CA_CERTS=/Users/trevorrobey/Library/Application\ Support/mkcert/rootCA.pem \
  node scripts/run-research-task.js --task "..."
```

## Adding a new connector

1. Add a new file `app/connectors/<target>.py` implementing `Connector` (build_url, parse, target_id, license_spdx, domain).
2. Register it in `app/connectors/__init__.py:REGISTRY`.
3. Add a `domain_rules` entry for the target's hostname in `config/dataset-license-rules.json`.
4. Add a license-registry entry in `trevor-robey-inc/09-source-licenses/scraping-targets.md`.
5. Run the verification curl (`/scrape`) and confirm the record passes downstream provenance + license review.

## Cache

Disk cache at `var/cache/`, keyed by SHA-256 of `(target, params)`. 24h TTL. Cache hits preserve the original `retrieved_at` so the audit ledger reflects when the page was actually fetched.

## What this sidecar will *not* do

- Bypass paywalls, even when technically possible
- Scrape sites whose TOS explicitly forbid automation (vetted at registration time, not per request)
- Collect PHI / patient-identifiable data
- Run on a schedule or as a background daemon
