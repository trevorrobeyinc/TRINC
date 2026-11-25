# searxng-search-mcp

A free, self-hosted, **Tavily-style AI web-search connector** for Claude Desktop and
Claude Code. It pairs a private, **Docker-free** [SearXNG](https://docs.searxng.org)
metasearch instance (bound to `127.0.0.1:8890`, reached over HTTPS via the in-monorepo
TLS proxy at `127.0.0.1:8891`) with a small stdio MCP server that
exposes three Tavily-compatible tools, plus two added on 2026-11-24 for the research engine:

| Tool | What it does |
|------|--------------|
| `search`  | Web search → ranked results (title, url, snippet, score, engine). Each result additively carries a `citations[]` array of `{type,id}` ids (pmid/doi/nct/pmcid/chembl/drugbank/uniprot) harvested from its text. Pass `topic:"science"` for the tuned scholarly engines. Cache + transient-retry + cross-engine dedup are built in. Optional `include_raw_content` fetches + cleans each page; optional `rerank` reorders via a local model. Tavily-shaped output. **Since 1.1.0 every answer is judged** (`quality`, `relevance` per row): on `general`/`news`, off-topic rows go to `off_topic_results`, and a degraded answer falls back to `docs_search` and other engines (`engines_tried`). |
| `extract` | Fetch URL(s) → clean markdown/text via Mozilla Readability. Returns `results[]` + `failed_results[]`. |
| `map`     | Enumerate a site's URLs: the page's own same-domain links, then the site's sitemaps (robots.txt, `/sitemap.xml`, or the docs registry's sources), kept under the given url's directory. `query` ranks them locally (no search engine) and adds `ranked[]` with titles. |
| `docs_search` | **Vendor documentation without a search engine.** Searches the registry in [`src/doc-sites.js`](src/doc-sites.js) (Aruba TechDocs and Developer Hub, CrowdStrike Developer Center, Firewalla Help Center and MSP docs, Samsung Knox docs) from each site's sitemaps, llms.txt, crawl seeds or Zendesk search API; ranks locally (BM25), reads the best pages through `extract`'s SSRF guard, returns the best passage per page. |
| `search_health` | **Relevance canary.** Asks each engine, by name, a common and a niche known-answer query and reports ok / weak / junk / silent_zero / blocked per engine, plus a one-line `summary`. |

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
  (still true of that volume; note the monorepo itself moved to the internal disk on 2026-07-26,
  so staging is now belt-and-braces rather than strictly required)
  (TCC `EPERM`). Only this connector's JS (which Claude Desktop/Code launches, not launchd)
  lives in the repo — which, since 2026-07-26, is itself on the internal disk.

## Layout

```
searxng-search-mcp/
├── src/
│   ├── server.js       stdio MCP entry point
│   ├── tools.js        5 tool defs (JSON Schema) + zod-guarded dispatch
│   ├── searxng.js      SearXNG JSON-API client → Tavily-shaped results, relevance guard, fallback
│   ├── relevance.js    per-row relevance, answer verdict (ok/thin/degraded/empty), junk kinds
│   ├── rank.js         tokenizer + light stemmer, BM25, best-passage selection (dependency-free)
│   ├── doc-sites.js    the docs_search registry (sources checked live 2026-11-24)
│   ├── sitemap.js      robots.txt / sitemap / llms.txt / anchor parsers, bounded sitemap walker
│   ├── docs-search.js  inventory → stage-1 url ranking → stage-2 read + judge
│   ├── health.js       search_health canary
│   ├── extract.js      fetch → jsdom → Readability → Turndown (SSRF-guarded fetchUrl)
│   ├── url-util.js     hostOf / hostMatchesDomain
│   └── config.js       env-driven config (SEARXNG_BASE_URL, timeouts, UA)
├── test/smoke.mjs      end-to-end self-test (needs SearXNG up)
├── test/docs-smoke.mjs live docs_search / map / guard / canary check (`npm run smoke:docs`)
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
| `SEARXNG_FALLBACK` | on | `0`/`false` turns the degraded-answer fallback off (a call naming `engines` never falls back) |
| `SEARXNG_FALLBACK_ENGINES` | `seznam,yandex,mwmbl` | Engines asked one at a time after `docs_search`, skipping any the instance already queries by default |
| `SEARXNG_HEALTH_CACHE_TTL_MS` | `600000` | How long `search_health` reuses a run (`0` always probes) |
| `SEARXNG_DOCS_INVENTORY_TTL_MS` | `86400000` | How long a doc site's url inventory is reused |
| `SEARXNG_DOCS_MAX_SITEMAPS` / `SEARXNG_DOCS_MAX_URLS` | `25` / `20000` | Per-site caps on sitemaps followed and urls kept |
| `SEARXNG_DOCS_MAX_BYTES` | `15000000` | Cap per fetched sitemap or crawl-seed page (streamed, refused beyond) |
| `SEARXNG_DOCS_READ_PAGES` | `6` | Candidate pages `docs_search` reads per call (the `read_pages` default) |

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

- **General web search is weak, and why (measured 2026-11-24).** Bing does NOT read only the first
  word of a query: sent exactly what SearXNG's `bing.py` builds, Bing's own search box and page title
  echo the full query, yet the results are for one word of it ("AOS 10 WIDS containment tarpit" → ASOS,
  the American Orchid Society) or for nothing in it (the same words reversed → Lady Gaga, then
  Stanford University), and the response sets Akamai Bot Manager cookies. That is Bing degrading its
  answers to an automated client; popular queries still come back right. Every other scraped engine
  walls this client: Google (JavaScript redirect) and Mojeek (a "Captcha" page) return zero with NO
  error, DuckDuckGo and Startpage CAPTCHA, Brave 429, Qwant "access denied", Presearch/Yahoo/Yep
  errors. No SearXNG update fixes a bot wall, and evading one is off the table. Seznam and Yandex
  answer honestly and were enabled on 2026-11-24 (operator's choice; Yandex is Russian-operated), but
  both are thin on niche vendor queries. So: every answer now carries `quality`, decoys go to
  `off_topic_results`, vendor documentation goes through `docs_search`, and `search_health` shows the
  engines' state. The legitimate fix for general web is a keyed API (Brave Search API: an account and a
  card, the operator's purchase; SearXNG ships a `braveapi` engine for it).
- **`docs_search` knows only its registry.** Add a site to `src/doc-sites.js` after checking what it
  publishes (robots.txt `Sitemap:` lines, `/sitemap.xml`, `/llms.txt`, a Zendesk Help Center), and add
  its fixture to `test/doc-sites.test.mjs`. A page the site does not list and no seed page links to is
  invisible to it.
- **`answer` is not LLM-synthesized.** SearXNG has no LLM, so `search.answer` is the best
  available instant-answer / infobox text (or `null`), not a Tavily-style generated paragraph.
  Let Claude synthesize from `results[]` instead.
- **Bot-blocked sites (403).** `extract` uses a plain HTTP fetch (no headless browser), so
  Cloudflare-gated / aggressively bot-blocking sites (e.g. ScienceDirect) return `HTTP 403`
  and land in `failed_results`. This is expected; there is deliberately no headless-browser
  fallback on this machine.
- **`time_range`** is `day`/`month`/`year` (SearXNG-native). A legacy `"week"` is still accepted
  and coerced to `"day"`; the search response echoes the value actually applied as
  `applied_time_range` so the coercion is observable.
- **`/etc/hosts` sinkholes** (e.g. `example.com → 0.0.0.0` on this machine) surface as
  `ECONNREFUSED` in `failed_results` — correct behavior, not a bug.

## Test

```bash
# Offline unit tests (no network, no SearXNG):
npm run test:unit
# SearXNG must be running first.
npm run smoke
# Live docs_search / map / guard / canary check (network + SearXNG; NODE_EXTRA_CA_CERTS set):
npm run smoke:docs
```
