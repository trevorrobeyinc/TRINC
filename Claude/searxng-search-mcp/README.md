# searxng-search-mcp

A free, self-hosted, **Tavily-style AI web-search connector** for Claude Desktop and
Claude Code. It pairs a private, **Docker-free** [SearXNG](https://docs.searxng.org)
metasearch instance (bound to `127.0.0.1:8890`, reached over HTTPS via the in-monorepo
TLS proxy at `127.0.0.1:8891`) with a small stdio MCP server that
exposes three Tavily-compatible tools:

| Tool | What it does |
|------|--------------|
| `search`  | Web search → ranked results (title, url, snippet, score, engine). Each result additively carries a `citations[]` array of `{type,id}` ids (pmid/doi/nct/pmcid/chembl/drugbank/uniprot) harvested from its text. Pass `topic:"science"` for the tuned scholarly engines. Cache + transient-retry + cross-engine dedup are built in. Optional `include_raw_content` fetches + cleans each page; optional `rerank` reorders via a local model. Tavily-shaped output. |
| `extract` | Fetch URL(s) → clean markdown/text via Mozilla Readability. Returns `results[]` + `failed_results[]`. |
| `map`     | Enumerate a site's URLs (same-domain link scrape, optionally augmented by a site-scoped search). |

**Why this exists:** a no-cost replacement for Tavily. No API key, no per-call billing,
no rate limits, no data leaving your machine except the actual web fetches. SearXNG
aggregates Google, Bing, DuckDuckGo, Startpage, Brave, Wikipedia, and ~200 other engines.

---

## Architecture

```
Claude Desktop chat ─┐                                    ┌─[HTTPS]→ searxng-tls-proxy :8891 ─[HTTP loopback]→ SearXNG :8890 ─→ the web
                     ├─[MCP stdio]→ searxng-search (Node) ─┤
Claude Code       ───┘                                    └─[direct HTTP]→ pages (extract/map)
```

- **No Docker.** SearXNG is a native Python app in a `uv` venv on the internal volume
  (`~/.local/share/searxng/`), run by a launchd user-agent.
- **HTTPS to SearXNG (2026-07-06).** SearXNG binds `127.0.0.1:8890`, `limiter: false`
  (no Valkey/Redis), `public_instance: false`. The connector no longer reaches it over
  plaintext: as of 2026-07-06 the `:8890` plaintext-loopback carve-out was removed and
  SearXNG is wrapped by the in-monorepo TLS proxy `com.trevorrobey.searxng-tls-proxy`
  (`https://127.0.0.1:8891` → `:8890`), the same treatment as Miyo/Qdrant/Ollama/LM Studio.
  The connector default `searxngBaseUrl` is now `https://127.0.0.1:8891`, so the launching
  process **must set `NODE_EXTRA_CA_CERTS`** to the mkcert root CA (the Claude MCP configs
  set it; the engine's `run-workflow.js` self-execs with it). This stdio MCP server still
  binds **no TCP port** of its own.
- **Internal-volume rule.** Everything launchd executes (venv python, `settings.yml`)
  lives on the internal volume — a launchd agent cannot read `/Volumes/ExtraCurricular`
  (TCC `EPERM`). Only this connector's JS (which Claude Desktop/Code launches, not launchd)
  lives in the repo on the external volume.

## Layout

```
searxng-search-mcp/
├── src/
│   ├── server.js     stdio MCP entry point
│   ├── tools.js      3 tool defs (JSON Schema) + zod-guarded dispatch
│   ├── searxng.js    SearXNG JSON-API client → Tavily-shaped results
│   ├── extract.js    fetch → jsdom → Readability → Turndown
│   └── config.js     env-driven config (SEARXNG_BASE_URL, timeouts, UA)
├── test/smoke.mjs    end-to-end self-test (needs SearXNG up)
├── install-connector.sh  stages the connector to the internal volume (see "TCC / staging")
└── searxng/
    ├── settings.example.yml              settings.yml template (real one is ~/.config/searxng/)
    ├── com.trevorrobey.searxng.plist.template
    └── install-service.sh                renders + loads the launchd unit
```

## Install (from scratch)

```bash
# 1. Install SearXNG (Docker-free) — clones source, builds a uv venv on the internal volume.
#    (See the one-time recipe below; already done on this machine.)

# 2. Config: ~/.config/searxng/settings.yml  (copy searxng/settings.example.yml, then:)
openssl rand -hex 32          # paste into secret_key

# 3. Connector deps
cd Claude/searxng-search-mcp && npm install

# 4. Stage the connector to the internal volume (REQUIRED — see "TCC / staging" below)
zsh install-connector.sh

# 5. Boot-persistent SearXNG service
zsh searxng/install-service.sh

# 6. Register the connector (see "Registration" below), then restart Claude.
```

## TCC / staging (why the connector runs from `~/.claude/mcp-servers/`)

Claude Desktop / Cowork spawn the MCP server with the nvm `node` binary. macOS TCC's
**"Removable Volumes"** gate denies that binary read access to `/Volumes/ExtraCurricular`,
so a server launched directly from the repo path dies at module load with
`EPERM: operation not permitted, open …/src/server.js`. This is the same failure class as the
launchd TLS-proxy gotcha in the root `CLAUDE.md`.

The fix (repo-canonical, mirrors `Copilot-Everything/scripts/install-tls-proxies.sh`):
`install-connector.sh` stages `src/` + deps to **`~/.claude/mcp-servers/searxng-search/`** on the
internal volume, and all configs point there. The connector does no external-volume I/O at
runtime (only loopback + web), so staging is transparent. **The repo copy stays source-of-truth —
re-run `zsh install-connector.sh` after editing anything under `src/`.**

One-time SearXNG install recipe (Docker-free), for reference / rebuild after a wipe:

```bash
ROOT="$HOME/.local/share/searxng"
git clone --depth 1 https://github.com/searxng/searxng.git "$ROOT/searxng-src"
uv venv --python 3.12 "$ROOT/venv"
VPY="$ROOT/venv/bin/python"
uv pip install --python "$VPY" -U pip setuptools wheel pyyaml msgspec typing-extensions pybind11
uv pip install --python "$VPY" --no-build-isolation -e "$ROOT/searxng-src"
```

## Registration

The connector is registered **separately** for each surface (they read different configs).

**Claude Code** (CLI or Desktop Code tab) — user scope, available in every project:

Point every surface at the **staged** entry point (`~/.claude/mcp-servers/searxng-search/src/server.js`),
never the external-volume repo path (see "TCC / staging").

```bash
claude mcp add searxng-search --scope user \
  -e SEARXNG_BASE_URL=https://127.0.0.1:8891 \
  -e "NODE_EXTRA_CA_CERTS=$HOME/Library/Application Support/mkcert/rootCA.pem" \
  -- /Users/myhome/.nvm/versions/node/v22.13.1/bin/node \
     /Users/myhome/.claude/mcp-servers/searxng-search/src/server.js
```

**Claude Desktop chat** (and Cowork) — add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```jsonc
"searxng-search": {
  "command": "/Users/myhome/.nvm/versions/node/v22.13.1/bin/node",
  "args": ["/Users/myhome/.claude/mcp-servers/searxng-search/src/server.js"],
  "env": {
    "SEARXNG_BASE_URL": "https://127.0.0.1:8891",
    "NODE_EXTRA_CA_CERTS": "/Users/myhome/Library/Application Support/mkcert/rootCA.pem"
  }
}
```

Restart the surface after registering (MCP servers are loaded at startup).

## Service management

```bash
# status / logs
launchctl print gui/$(id -u)/com.trevorrobey.searxng | grep -E 'state|pid'
tail -f ~/.local/share/searxng/searxng.log

# restart / stop
launchctl kickstart -k gui/$(id -u)/com.trevorrobey.searxng
launchctl bootout    gui/$(id -u)/com.trevorrobey.searxng

# health check — plaintext upstream (liveness of the SearXNG process itself)
curl -s 'http://127.0.0.1:8890/search?q=test&format=json' | head -c 120
# health check — through the HTTPS proxy (the path the connector actually uses)
curl -s --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" \
  'https://127.0.0.1:8891/search?q=test&format=json' | head -c 120
```

## Config (env vars on the MCP server)

| Var | Default | Meaning |
|-----|---------|---------|
| `SEARXNG_BASE_URL` | `https://127.0.0.1:8891` | SearXNG base URL — the in-monorepo HTTPS TLS proxy (→ plaintext upstream :8890). Requires `NODE_EXTRA_CA_CERTS` at the mkcert root CA. |
| `SEARXNG_SEARCH_TIMEOUT_MS` | `15000` | Search request timeout |
| `SEARXNG_FETCH_TIMEOUT_MS` | `12000` | Per-URL fetch timeout (extract/map) |
| `SEARXNG_MAX_EXTRACT_CHARS` | `20000` | Char cap per extracted page |
| `SEARXNG_EXTRACT_CONCURRENCY` | `4` | Parallel fetches for multi-URL extract |
| `SEARXNG_CACHE_TTL_MS` | `300000` | Search-response cache TTL (`0` disables) |
| `SEARXNG_CACHE_MAX_ENTRIES` | `500` | Max cached responses (FIFO eviction) |
| `SEARXNG_RETRY_ATTEMPTS` | `3` | Total fetch attempts (transient 429/5xx/network only; timeouts are **not** retried) |
| `SEARXNG_RETRY_BASE_MS` / `SEARXNG_RETRY_CAP_MS` | `400` / `8000` | Backoff base / cap (full jitter) |
| `SEARXNG_RERANK_ENABLED` | `false` | Enable local-LLM listwise reranking (fail-soft) |
| `SEARXNG_RERANK_ENDPOINT` | `https://127.0.0.1:11435/api/chat` | **HTTPS proxy** for the local model (Ollama `:11435` / LM Studio `:1235`) |
| `SEARXNG_RERANK_MODEL` | `qwen2.5:7b-instruct` | Local rerank model id |
| `SEARXNG_RERANK_TIMEOUT_MS` | `4000` | Hard timeout; on expiry native `score` ordering is kept |

## Enhancements (citation-traceable biomedical tuning)

Four fail-soft layers turn the plain Tavily drop-in into a citation-aware biomedical search
tool. Each degrades cleanly to the connector's original behavior on any failure.

1. **Curated scholarly engines** (`settings.yml`). The default consumer engine set is replaced,
   for the `science` category, by weighted biomedical/scholarly engines — **PubMed** (×3.0),
   **Europe PMC** (×2.5, added via `json_engine`), **Semantic Scholar** (×2.5), **Crossref**
   (×2.0, enabled), **OpenAlex** (×2.0, enabled), **OpenAIRE** (`openairepublications`, ×1.5),
   **arXiv** (×1.0) — and **Brave** + **Google Scholar** are disabled (rate-limited / CAPTCHA-prone).
   Pass **`topic:"science"`** to hit them. (Config template:
   [`searxng/settings.example.yml`](searxng/settings.example.yml); the live file is
   `~/.config/searxng/settings.yml`. Reload it with `launchctl bootout … && launchctl bootstrap …`
   — `kickstart -k` can serve stale settings.)
2. **Citation extraction + provenance** ([`src/citation-grammar.js`](src/citation-grammar.js)).
   Every result gets an additive `citations: [{type, id, source, subtype?}]` array parsed
   **per field** (title / snippet / url separately, so a cue in one field can never attach to
   digits in another). Types: `pmid` (requires a `PMID` cue or PubMed URL — never a bare integer),
   `doi` (Crossref pattern, normalized + lowercased; preprint DOIs get `subtype:"preprint"`),
   `nct`, `pmcid`, `chembl`, `drugbank`, `uniprot` (proximity-gated on a nearby `uniprot` cue),
   plus `arxiv`, `geo`, `sra`, `rrid`. **`source`** is `"url"` (the id is part of the page's own
   address → high confidence) or `"text"` (from title/snippet → medium). This is the single source
   of truth for the connector's grammar; a **drift test**
   ([`test/citation-grammar.drift.test.mjs`](test/citation-grammar.drift.test.mjs)) fails if it stops
   agreeing with the engine's report-level gate
   (`…/openclaw-bridge/core/citation-extractor.js`). It's a self-contained copy on purpose — the
   connector runs from a staged internal-volume directory (see "TCC / staging") and cannot
   `require()` across to the engine package at runtime.
3. **Robustness** ([`src/robust.js`](src/robust.js)). A TTL response cache (**never caches a
   zero-result/degraded response** — no stale-empty masking recovery), transient-only retry with
   exponential backoff + full jitter (429/5xx/network — **timeouts are not retried**, to keep
   latency bounded), and cross-engine dedup by canonical URL + **url-derived** citation id. Dedup
   deliberately does NOT merge on text-derived ids: a review that merely *cites* a paper's PMID in
   its snippet is a distinct source and stays its own row. All dependency-free.
4. **Optional local-LLM reranking** ([`src/rerank.js`](src/rerank.js), **off by default**). When
   `SEARXNG_RERANK_ENABLED=true` (or per-call `rerank:true`), the results are listwise-reordered by
   a **local** model through the monorepo **HTTPS proxy** — never a paid API, never plaintext. Any
   anomaly (timeout, non-2xx, malformed JSON, non-permutation) falls straight back to SearXNG's
   native `score` ordering. **Reaching the HTTPS proxy requires `NODE_EXTRA_CA_CERTS`** to point at
   the mkcert rootCA in the connector's env; if it isn't set the TLS handshake fails and rerank
   simply no-ops (fail-soft).
5. **Connector-level gate** — pass **`min_citations:1`** (or higher) to keep only results carrying
   at least that many citation ids. This is a retrieval-side filter ("every result sourced"); it is
   *not* the report-level no-hallucinations gate, which lives in the engine
   (`workflow-engine` → `PHASE30_CITATION_UNVERIFIED`, fail-closed) and cross-checks a finished
   report's cited ids against the evidence actually fetched. The connector supplies grounded,
   provenance-tagged citations; that engine gate enforces on them (once a subprocess adapter wires
   this connector into `run-workflow.js` — see the `searxng-mcp` note in the connector registry).

Run `npm run test:unit` for the grammar + robustness + drift tests (no network); `npm run smoke` for
the live end-to-end (SearXNG must be up).

## Known limitations

- **`answer` is not LLM-synthesized.** SearXNG has no LLM, so `search.answer` is the best
  available instant-answer / infobox text (or `null`), not a Tavily-style generated paragraph.
  Let Claude synthesize from `results[]` instead.
- **Bot-blocked sites (403).** `extract` uses a plain HTTP fetch (no headless browser), so
  Cloudflare-gated / aggressively bot-blocking sites (e.g. ScienceDirect) return `HTTP 403`
  and land in `failed_results`. This is expected. A future enhancement could fall back to the
  repo's Playwright scrape path for those hosts.
- **`time_range`** is `day`/`month`/`year` (SearXNG-native). A legacy `"week"` is still accepted
  and coerced to `"day"`; the search response echoes the value actually applied as
  `applied_time_range` so the coercion is observable.
- **`/etc/hosts` sinkholes** (e.g. `example.com → 0.0.0.0` on this machine) surface as
  `ECONNREFUSED` in `failed_results` — correct behavior, not a bug.

## Test

```bash
# SearXNG must be running first.
npm run smoke
```
