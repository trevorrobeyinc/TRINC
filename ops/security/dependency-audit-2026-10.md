# Dependency audit, 2026-10 (Dependabot alerts on `main` at `b7f4ff9`)

GitHub reported **497 alerts** on `trevorrobeyinc/TRINC` after the push of `b7f4ff9` (18 critical, 159 high,
276 moderate, 44 low). This file is the local rebuild of that picture, what was fixed on 2026-10-24, and what
is left for an operator decision. Raw audit JSON stays in the session scratchpad; every number here can be
re-derived with the commands in [Reproduce](#reproduce).

## Result in one paragraph

Locally, `npm audit` across the 11 tracked lockfiles finds **489** advisory-per-package records (16 critical,
158 high, 272 moderate, 43 low), the unit Dependabot counts. After in-range lockfile refreshes in nine
packages, **207** remain (11 / 79 / 98 / 19). **158 of those are in the vendored Copilot fork**, left untouched
on purpose; outside the fork the count went from **331 to 49**. No `package.json` range changed, no direct
dependency crossed a major version, no rebuilt plugin `main.js` differs from the deployed one, and every
gate is green (see [Gates](#gates)). Everything that is left needs a major bump, a replacement, the fork, or
the submodule, and is listed under [Decisions for the operator](#decisions-for-the-operator).

**Update, later on 2026-10-24 (the operator's "do now" batch, majors approved):** vitest 5 in the bridge and
research-memory, `@mozilla/readability` 0.6 in searxng, the adapter's SDK floor raised to `^1.32.2`, and both
staged copies re-installed. Local total **185** (6 / 77 / 86 / 16); outside the fork **27**. The live
staged copies now audit at 1 (searxng: zod) and 0 (trinc-content). Details are marked **Done** under
decisions 2, 8, 9, 10 and 11.

**Update, decision 5 (same day):** the ToolUniverse submodule moved from v1.1.10 to v1.5.7 and its venv
was rebuilt from a repo-owned, hashed lock: **252 known vulnerabilities in 214 packages → 0 in 107**,
2,173 → 2,719 tools, no Playwright. Its live before/after found three result gaps present at both versions:
two are fixed engine-side (an upstream error is now a failed search, not a returned record; OpenTargets'
drug lookup now yields its hits), and the third (Semantic Scholar's 429) needs an API key, written up as an
option. Details under decision 5.

## Inventory

| Manifest | Lockfile | Runs as |
|---|---|---|
| `Trevor Robey Intelligence Network Citations/` (engine) | yes, plus the LOCKED cache `.ci/npm-cache` | the engine; only dependency is `zod` (exact 3.24.1) |
| `Claude/Medical-Zettelkasten-MCP` | yes | loaded in-process by the engine (`Graph Analysis.md`); also `zettelkasten-graph` in `Copilot-Everything/.mcp.json` |
| `Claude/trevorobeyinc-research-memory-mcp` | yes | `dist/cli.js`, called by the engine for research-memory ingest |
| `Claude/searxng-search-mcp` | yes | **staged copy** `~/.claude/mcp-servers/searxng-search` (its own `node_modules`) |
| `Claude/trinc-content-mcp` | yes | **staged copy** `~/.claude/mcp-servers/trinc-content` (its own `node_modules`) |
| `Copilot-Everything/bridges/obsidian-copilot-bridge` | yes | the `:8798` bridge, `dist/index.js` spawned by the launcher from this folder |
| `Copilot-Everything/bridges/obsidian-stdio-adapter` | **no** | `openclaw-obsidian`, Claude's one door. Its `node_modules` is a **tracked symlink to the bridge's `node_modules`**, so the bridge's lockfile is the adapter's real lockfile |
| `Claude/obsidian-{bridge-launcher,command-center,vault-zettelkasten,viz-studio}` | yes | Obsidian plugins; runtime deps are bundled into `main.js` at build, everything else is build tooling |
| `Copilot-Everything/repos/obsidian-copilot-mcp-v4` | yes | the vendored Copilot fork (upstream 4.0.0 + the MCP module), bundled into its `main.js` |
| `…/vendor/tooluniverse` (submodule, `3833b0e`) | `pyproject.toml` + `uv.lock` (upstream's) | Python; local `.venv` built from that `uv.lock` |

There are no tracked Python manifests outside the submodule.

## Triage table

Counts are npm advisories per vulnerable package (c / h / m / l). "Runtime / dev-only" comes from
`npm audit --omit=dev`; "Fix" is npm's own classification before any change.

| Manifest | Before c / h / m / l (total) | Runtime / dev-only | Fix: in-range / major / none | After c / h / m / l (total) |
|---|---|---|---|---|
| `Trevor Robey Intelligence Network Citations` | 0 / 1 / 0 / 0 (1) | 1 / 0 | 0 / 1 / 0 | 0 / 1 / 0 / 0 (1) |
| `Claude/Medical-Zettelkasten-MCP` | 2 / 17 / 47 / 5 (71) | 71 / 0 | 65 / 1 / 5 | 1 / 3 / 2 / 0 (6) |
| `Claude/obsidian-bridge-launcher` | 0 / 0 / 1 / 0 (1) | 0 / 1 | 1 / 0 / 0 | 0 / 0 / 0 / 0 (0) |
| `Claude/obsidian-command-center` | 0 / 0 / 2 / 0 (2) | 0 / 2 | 1 / 1 / 0 | 0 / 0 / 1 / 0 (1) |
| `Claude/obsidian-vault-zettelkasten` | 0 / 1 / 1 / 0 (2) | 1 / 1 | 1 / 1 / 0 | 0 / 1 / 0 / 0 (1) |
| `Claude/obsidian-viz-studio` | 0 / 0 / 2 / 0 (2) | 0 / 2 | 1 / 1 / 0 | 0 / 0 / 1 / 0 (1) |
| `Claude/searxng-search-mcp` | 1 / 13 / 23 / 4 (41) | 41 / 0 | 39 / 2 / 0 | 0 / 1 / 0 / 1 (2) |
| `Claude/trevorobeyinc-research-memory-mcp` | 5 / 33 / 58 / 9 (105) | 84 / 21 | 75 / 30 / 0 | 4 / 11 / 14 / 1 (30) |
| `Claude/trinc-content-mcp` | 0 / 5 / 6 / 2 (13) | 13 / 0 | 13 / 0 / 0 | 0 / 0 / 0 / 0 (0) |
| `Copilot-Everything/bridges/obsidian-copilot-bridge` | 4 / 27 / 55 / 7 (93) | 1 / 92 ¹ | 92 / 1 / 0 ² | 2 / 1 / 3 / 1 (7) |
| `Copilot-Everything/repos/obsidian-copilot-mcp-v4` | 4 / 61 / 77 / 16 (158) | 72 / 86 | 105 / 53 / 0 | 4 / 61 / 77 / 16 (158) |
| **Total** | 16 / 158 / 272 / 43 (489) | 284 / 205 | 393 / 91 / 5 | 11 / 79 / 98 / 19 (207) |

¹ npm calls the bridge's MCP SDK "dev" because it is a devDependency, but through the adapter's symlink it
is **runtime for Claude's door**. ² npm listed the bridge's vitest fix as in-range; in fact no vitest 3.x
clears it (the fix is vitest 5), so it is counted under the decisions below.

**Reconciling with GitHub (489 local vs 497):** the 8-alert gap (2 c, 1 h, 4 m, 1 l) could not be closed
locally. Likely sources are Dependabot reading the adapter's lockfile-less `package.json` and timing
differences in the advisory database. The YubiKey-gated read-only `github` MCP cannot help: none of its 24
pinned tools reads Dependabot alerts, so it was not armed. The counts on GitHub refresh on the next push;
read them on the Dependabot page then.

**Submodule (Python), not part of the 497:** Dependabot does not scan inside a submodule. The local
`vendor/tooluniverse/.venv` (214 packages, identical to upstream's `uv.lock` at `3833b0e`) was checked
against OSV, the database `pip-audit` uses: **252 unique vulnerabilities in 39 packages** (12 critical, 105
high, 92 moderate, 31 low, 12 unrated). The largest are `pillow` 11.3.0 (58), `aiohttp` 3.12.15 (40),
`virtualenv` 20.34.0 (20), `PyJWT` 2.10.1 (17), `Authlib` 1.6.3 (10), `transformers` 4.56.1 (10),
`fastmcp` 2.12.3 (8), `torch` 2.8.0 (8), `urllib3` 2.5.0 (6, all high), `starlette` 0.47.3 (6) and
`mcp` 1.14.0 (4). These are upstream's alerts; nothing in the submodule was edited.

## What was fixed (2026-10-24)

Method: `npm audit fix` (never `--force`), with `--ignore-scripts` and a scratch npm cache, then a lockfile
diff that flags any package whose major version moved. Where `npm audit fix` took a transitive package
across a major because the parent's range allows both majors, the package was held on the patched release
of its current major (installed as a direct dependency to pin the lockfile node, then uninstalled, so no
`overrides` block is needed). npm's re-serialization of `package.json` (it un-escapes `—` in an
`author` field) was reverted, so **only lockfiles changed**.

| Package | Advisories | Notable moves (all within existing ranges) |
|---|---|---|
| `trinc-content-mcp` | 13 → 0 | MCP SDK 1.30.0 → 1.32.2, zod 4.6.5 → 4.6.7 (transitive, already v4), body-parser 2.4.0, fast-uri 3.1.9, hono 4.13.13, ip-address 10.7.4, qs 6.16.1 |
| `searxng-search-mcp` | 41 → 2 | MCP SDK 1.29.0 → 1.32.2 (its nested zod 4.4.3 → 4.6.7), proxy-addr 2.0.8, hono 4.13.13, `@hono/node-server` 1.19.17 (held on 1.x; `audit fix` wanted 2.1.5) |
| `Medical-Zettelkasten-MCP` | 71 → 6 | MCP SDK 1.32.2, mongoose 9.4.1 → 9.11.4 and mongodb 7.7.0 (pulled in by `natural`), uuid 13.0.2, `@hono/node-server` 1.19.17 (held) |
| `trevorobeyinc-research-memory-mcp` | 105 → 30 | MCP SDK 1.32.2, undici 6.29.1, protobufjs 6.11.6, nanoid 3.3.20, postcss 8.5.31, `@hono/node-server` 1.19.17 (held). Patched in place, not `npm ci`: its native `sharp` binary must survive, and it did |
| `obsidian-copilot-bridge` (and so the adapter) | 93 → 7 | MCP SDK 1.27.1 → 1.32.2, vitest 3.2.4 → 3.2.7, vite 7.3.7, path-to-regexp 8.4.2, picomatch 4.0.7, esbuild 0.27.7 (held; `audit fix` wanted 0.28.2), `@hono/node-server` 1.19.17 (held) |
| the four Obsidian plugins | 7 → 3 | dev-only: `obsidian` typings 1.12.3/1.13.1 → 1.14.4, moment 2.31.0, CodeMirror typings |

**Not rebuilt, not deployed, nothing for obsidianwatch:** each plugin was built and its `main.js` compared
with the deployed copy. All four are byte-identical, and the original files were put back. The bridge's and
research-memory's `tsc` output, compiled into a scratch folder, is identical to the old dependency tree's, so
their live `dist/` folders were left alone.

**Not yet live for two servers:** `searxng-search` and `trinc-content` run from staged copies with their own
`node_modules`, which keep the old dependencies until each `install-connector.sh` is re-run (decision 9).

**Process note:** some of the hold-back install commands ran with lifecycle scripts enabled (zsh does not
word-split an unquoted `$VAR` holding several flags, so `--ignore-scripts` never reached npm). The scripts
that ran were `esbuild`'s own `install.js` in the bridge and `core-js`'s banner in Medical-Zettelkasten, both
from the registry packages already in the lockfiles (and `esbuild`'s again in a scratch copy). Both trees
were then reinstalled from the committed lockfiles with `npm ci --ignore-scripts`, and every test was re-run
on the clean trees. `trinc-content-mcp/node_modules`, installed only to run its tests, was removed afterwards
so its installer behaves as before.

## Tests, before and after

| Package | Before | After | Note |
|---|---|---|---|
| engine (`npm test`) | 1331 / 1331 | 1331 / 1331 | engine lockfile and cache untouched |
| Medical-Zettelkasten (`npm test`) | 120 / 121 | 120 / 121 | pre-existing: `lists 12 tools` expects 12, the server has 10 |
| research-memory (`vitest run`, live Qdrant, its own test collection) | 23 / 23 | 23 / 23 | needs `NODE_EXTRA_CA_CERTS` |
| trinc-content (`npm test`) | 55 / 56 | 55 / 56 | pre-existing: thumbnail "shrinks rather than pads" |
| searxng (`npm test`, live SearXNG) | 13 / 14 | 14 / 14 (twice) | the one miss is upstream search variability |
| bridge (`vitest run`, `tsc`, `lint:transport`) | 27 / 27, OK | 27 / 27, OK | |
| adapter (`npm run test:profiles`) | — | 43 PASS, 0 FAIL, 3 SKIP | Obsidian closed: the live `:8799`/`:8800` checks skip loudly |
| command-center (`npm test`, `lint:transport`, `tsc`) | 32 / 32 | 32 / 32, OK | 4 pre-existing `tsc` errors in `workflow-modal.ts`, present on the old lockfile too |
| plugins (`npm run build`) | — | builds; `main.js` identical | |

## Gates

`bash scripts/lint-transport-monorepo.sh --strict` OK; `bash ops/tr-suite/verify.sh` 0 FAIL, 0 WARN; engine
`npm test` 1331/1331 (includes `tests/supply-chain`, whose cache check still passes: `.ci/npm-cache` was
never written, every audit used a scratch cache); `npm run lint:transport` OK in the bridge and Command
Center; `npm run test:profiles` as above. **Still to run with Obsidian open:** `npm run test:profiles`
(the live checks).

## Decisions for the operator

Ranked by exposure as first written. **Decided 2026-10-24:** 2, 8, 9 and 11 done the same day (below);
6 accepted (the operator dismisses the alerts on GitHub); 10 kept; then, one change each, 5 first, 1
second, 3 third; 4 and 7 go into the next plugin deploy, so obsidianwatch needs one bless.

1. **zod 3 → 4** (high, GHSA-mrhx-c7xc-m3w5, memory exhaustion on oversized constrained collections; no 3.x
   fix exists). It affects the engine (exact 3.24.1), Medical-Zettelkasten and searxng (3.24.1),
   research-memory, vault-zettelkasten (bundled into its `main.js`) and the bridge, one alert per lockfile
   (6), plus the adapter at runtime through the bridge's tree. Callers are local, so exposure is low. *Recommendation:* one planned migration, servers
   first and the engine last. The engine needs a cache rebuild with `Cache-Rebuild-Reason` in
   `security/dependency-review.md`, and vault-zettelkasten needs a rebuild, deploy and bless. The Copilot
   fork's port to 4.0.0 found that zod v4 changes `z.record()`.
2. **vitest → 5** in the bridge and research-memory (dev-only). It clears tinypool's two critical RCE
   gadgets in both, the mock-redirect file read, and in research-memory (still on vitest 2) the UI-server
   critical plus the old vite/esbuild chain: 20 alerts (5 critical, 2 high, 12 moderate, 1 low). The UI
   server is never started here. *Recommendation:* do it; the test suites prove it.
   **Done:** vitest 5.0.5 in both (vite 8.3.5 comes with it). Bridge 27/27 and research-memory 23/23, both
   compiling to the same output, and the adapter's `test:profiles` 43/0/3; no runtime package moved.
   Two things it needed: the bridge got a `vitest.config.ts` limiting tests to `src/**/*.spec.ts`, because
   vitest 4+ no longer excludes `dist/` and picked up the compiled CommonJS copies; and research-memory
   needed vitest 2 uninstalled first (its vite 5 tree blocked vitest 5's vite peer), with no `--force`.
3. **research-memory: `@xenova/transformers` 2.x → `@huggingface/transformers` 3.x** (protobufjs: 1
   critical, 5 high, 5 moderate; sharp: 3 high; none fixable inside 2.x). As used, protobufjs comes in
   through `onnxruntime-web`'s `onnx-proto` (the Node path runs `onnxruntime-node` on a trusted cached
   model), and sharp only processes images, never called for text embeddings. *Recommendation:* a planned
   port that proves the embeddings for the same model are unchanged, or re-embeds `trevorobeyinc-packs`.
4. **The Copilot fork (158).** 105 could be fixed by an in-range lockfile refresh without touching source;
   53 need majors (electron 27 → 45 for dev, eslint-plugin-boundaries 7.3, diff 9). Runtime criticals:
   `handlebars` 4.7.9 (via `@langchain/classic`) and `proxy-addr` (via the Claude agent SDK's MCP SDK).
   *Recommendation:* a lockfile-only refresh as its own change, batched with the next fork rebuild and
   deploy (one obsidianwatch bless); leave the majors for the next upstream re-sync.
5. **`vendor/tooluniverse` (252 in its venv, outside Dependabot).** Real exposure: these tools call remote
   biomedical APIs, so `urllib3`/`aiohttp`/`requests`/`pillow` parse untrusted responses. *Recommendation:*
   bump the submodule pin to a newer upstream release and re-sync the venv as its own change, gated by the
   Phase 29 tests and startup integrity. Never edit it in place.
   **Done (operator's choice: v1.5.7 + own lock):**
   - Pin `3833b0e` (v1.1.10) → `f2006162` (v1.5.7, 2026-10-13, upstream's newest release). No file inside
     the submodule was edited.
   - Upstream's v1.5.7 `uv.lock` is stale against its own pyproject (it still records eleven packages v1.5.4
     moved behind extras), so `uv sync` would have rewritten it and `--frozen` would have installed 200 known
     vulnerabilities. The venv is instead built from `security/tooluniverse-venv.lock.txt`: a fresh
     resolution of the core dependencies for CPython 3.12 on macOS arm64, wheels only, 106 packages, every
     file hash-pinned (`scripts/setup-tooluniverse.sh` does it; the regeneration command is in that script).
     Result: **0 known vulnerabilities (OSV) in 107 installed packages**, down from 252 in 214.
   - **Playwright is not installed and not needed.** It is the optional `browser` extra since v1.5.4; only
     `get_webpage_text_from_url` uses it, for HTML pages, and without it that tool returns a clear "needs a
     browser" error (checked live). `get_webpage_title` and that tool's PDF/file path work over plain
     `requests`. The engine calls neither. For page text without a browser, the stack's scraper is the
     searxng-search `extract` tool (jsdom → Readability → Markdown).
   - **Live before/after of the 14 ToolUniverse tools the engine names** (engine's own adapter, fixed
     queries): every tool answers at both versions. v1.5.7 changed two outputs, both fixed engine-side:
     PubMed abstracts became opt-in (`include_abstract: true` added to the three PubMed prefetch entries),
     and the FAERS case-report tool moved its rows to a top-level `reports` array (the adapter now treats a
     single top-level row array in a `success` envelope as the records, and the normalizer gives FAERS rows
     a title and a reactions/seriousness/drugs summary; 5 new tests). Net: PubMed 8 records with abstracts as
     before; FAERS 5 per-report records instead of one JSON blob; DailyMed's adverse-reaction parse 154
     records (65 with text) instead of 114 (8).
   - Same at both versions, so not caused by the bump: EuropePMC answers HTTP 503 as one "Error" row inside
     a `success` envelope (the engine counts it as returned); OpenTargets' drug lookup returns a nested object
     the normalizer flattens to one empty record; Semantic Scholar answers 429 without an API key.
     **The first two fixed engine-side the same day** (`tooluniverse-mcp.js`, `tu-record-normalizer.js`; 9 tests
     added to `tests/core/tu-record-normalizer-payload.test.js`):
     - *Error rows.* The 503 row is `{title: "Error", error: "Europe PMC API error 503", retryable: true,
       abstract: null, doi: null, …}`; the engine rendered it into the prompt as "### Error" and
       `search-coverage.md` counted it as a returned record. A row that carries an `error` and normalizes to no
       payload (no abstract text, no citation id) is now dropped, and a call left with nothing else throws
       `TU_UPSTREAM_ERROR`: tool-prefetch records the search as `failed` (source unreachable, inconclusive) and
       renders nothing. A record that only carries an `error` note beside real content is kept. The same rule
       covers an error envelope with no rows, which is how Semantic Scholar's 429 arrives (`{status: "error",
       error: "Semantic Scholar API error 429"}`): it too had been rendered as a hollow record counted returned.
     - *OpenTargets.* The rows are `data.search.hits`, each `{id: "CHEMBL1431", name: "METFORMIN", description:
       "Small molecule drug with …"}` (names read off the live response). The adapter unwraps the hits; the
       normalizer titles a hit by `name` (ahead of the description-first rule for tool cards, keyed on the
       ChEMBL-shaped id) and carries `id` as its ChEMBL id, which the citation gate can ground and the
       re-resolver checks against ChEMBL.
     - *Live A/B* (inputs metformin / type 2 diabetes, all 24 ToolUniverse entries of the prefetch map, the
       engine's adapter and tool-prefetch): replaying the envelopes captured before the change through the new
       code changes exactly 7 entries. EuropePMC ×2 and Semantic Scholar ×4 go from `returned/1` to `failed/0`,
       with nothing rendered; OpenTargets goes from 1 empty record to 5 (5 with text, 5 ChEMBL ids). The other
       17 are identical in records, rows with text and citation ids. A fresh live pass after the change agrees:
       EuropePMC 503 again on both calls (now `failed/0`), OpenTargets 5 records, the 17 others unchanged, and
       Semantic Scholar answered 2 of 4 calls (8 and 10 records) and drew 429 on the other 2 (now `failed/0`).
   - **Option for the operator: a Semantic Scholar API key** (nothing requested or configured). Without one the
     shared anonymous pool throttles the engine's four `SemanticScholar_search_papers` entries (scout, analyst,
     literature_reviewer, competitive_intel_analyst): 429 on 4 of 4 calls in the first pass on 2026-10-24, 2 of 4
     in the second. Since the fix above those calls count as failed searches and the literature roles fall back
     on PubMed, EuropePMC and OpenAlex.
     - *How v1.5.7 reads it:* `SemanticScholarTool` asks `BaseTool.credential("SEMANTIC_SCHOLAR_API_KEY")`
       (`credentials.get_credential`), which uses a request-scoped credential context when one is active and
       otherwise the process environment. The engine's server (`tooluniverse-smcp-stdio --compact-mode`) runs each
       call through `execute_tool` → `run_one_function` with no credentials, so no context is active and the
       environment variable decides. The tool config lists it under `optional_api_keys`; the key is sent as the
       `x-api-key` header on the search and on the per-paper abstract lookups that `include_abstract: true` makes
       for rows that arrive without one.
     - *How it would reach the tool:* `tu-process-manager.js` spawns ToolUniverse with the engine's environment
       (only `GOOGLE_DRIVE_*` and `GOOGLE_CLIENT_SECRET` are removed), so it only has to be in the environment
       of whatever starts `run-workflow.js`; no code or config change. Same route as the business lane's free
       keys (`docs/business-research-lane.md`, "P2 activation"): Keychain → LaunchAgent `launchctl setenv`, then
       quit and reopen Obsidian so a Command Center-dispatched run inherits it. Never in git or a config file.
     - *What it changes:* with a key, ToolUniverse paces Semantic Scholar at 1 request a second (the quota new
       keys start on) instead of the throttled anonymous pool. The largest entry (literature_reviewer, `limit`
       10) is then at most 11 requests, about 11 s, inside tool-prefetch's 30 s per-call timeout.
     - *To get one:* the request form at https://www.semanticscholar.org/product/api (its license terms were not
       reviewed here). To check it afterwards, one live `SemanticScholar_search_papers` call should return a
       `success` envelope with rows instead of `Semantic Scholar API error 429`.
   - The old venv imported ToolUniverse through `/Users/myhome/TrevClaw-Obsidianodus/…` (an editable install
     made before the rename), so removing that compatibility symlink would have broken the engine's
     ToolUniverse lane. The rebuilt venv points at `/Users/myhome/TRINC/…`.
   - Rollback: the old venv is parked at `~/.local/share/trinc-rollback/tooluniverse-venv-v1.1.10`; to go
     back, check out `3833b0e` in the submodule and move it back to `vendor/tooluniverse/.venv`. Delete it
     once the new venv has served a real run.
6. **Medical-Zettelkasten `locutus` (critical, no fix).** `phpmorphy-locutus` (last published 2022) requires
   `locutus ^2`. Overriding to locutus 3.0.36 was tried in a scratch copy: locutus 3 dropped the
   `locutus/php` entry point, phpmorphy fails to load, the lemmatizer silently falls back to `compromise`,
   lemmas change (`running` → `run`) and a test fails. None of the four advisories is reachable as used:
   phpmorphy never calls `create_function`, its `call_user_func` callbacks are internal, and `unserialize`
   reads only its bundled dictionaries. *Recommendation:* accept and dismiss on GitHub as "vulnerable code
   not used"; replacing phpmorphy would change every run's `Graph Analysis.md`, so treat that as a product
   decision.
7. **esbuild 0.24 → 0.28** in command-center and viz-studio (dev-only, moderate; the advisory is the
   `esbuild --serve` dev server, which these builds never start). *Recommendation:* bump with the next planned
   plugin deploy, since the bundle may change.
8. **`@mozilla/readability` 0.5 → 0.6** in searxng (low, ReDoS, runtime). *Recommendation:* bump, smoke-test,
   re-run the installer. **Done:** 0.6.0 (no API change for `new Readability(doc).parse()`); `test:unit`
   57/57, live smoke 14/14.
9. **Deploy the two staged copies:** re-run `Claude/searxng-search-mcp/install-connector.sh` and
   `Claude/trinc-content-mcp/install-connector.sh`. The trinc-content installer skips its tests when the
   repo copy has no `node_modules` (the state it is in now); with `node_modules` present it runs `npm test`
   under `set -e`, and the pre-existing thumbnail failure stops it. **Done:** both re-run; each staged
   lockfile matches the repo's. Staged searxng is on SDK 1.32.2 and readability 0.6.0, and a stdio
   `initialize` + `tools/list` handshake answers `search, extract, map`. Staged trinc-content is on SDK
   1.32.2 and zod 4.6.7, checked by the installer's load test only (it is gated, so it was not spawned).
   Server processes started before the re-run keep their old code until their session reconnects.
10. **The holds:** `@hono/node-server` stays on 1.19.17 (patched; 2.x is allowed by the SDK) and the bridge's
    esbuild on 0.27.7 (one low advisory, Windows-only dev server). *Recommendation:* keep both until a
    planned refresh. **Update:** vite 8 removed esbuild from the bridge's tree, so only the
    `@hono/node-server` hold remains.
11. **The adapter has no lockfile.** It resolves through the symlink to the bridge's tree (MCP SDK 1.32.2
    now), while its `package.json` still says `^1.27.1`. *Recommendation:* raise its floor to `^1.32.2` so
    the manifest matches what runs, and keep the symlink documented in `ops/tr-suite/manifest.json`.
    **Done:** floor raised by hand (npm was not run there, since an install would write into the bridge's
    tree); version left at 0.4.0, since nothing that runs changed.

## Found on the way (not dependency issues)

- `Claude/trinc-content-mcp/test/thumbnail.test.mjs:51`: "shrinks rather than pads" fails on the
  committed code.
- `Claude/Medical-Zettelkasten-MCP/tests/mcp-server.test.js:11` expects 12 tools; the server and its
  `CLAUDE.md` say 10.
- `Claude/obsidian-command-center/src/workflow/workflow-modal.ts`: 4 `tsc` errors (the build uses esbuild,
  which does not typecheck).
- `Copilot-Everything/bridges/obsidian-copilot-bridge/dist/backends/operationPolicy.js` is in the live `dist/`
  but no current source compiles to it: a stale build artifact.
- `Copilot-Everything/bridges/obsidian-stdio-adapter/CHANGELOG.md` stops at 0.3.0, while `package.json` and the
  MCP handshake say 0.4.0.
- The staged `~/.claude/mcp-servers/trinc-content` holds a leftover `test/` folder; its installer stages only
  `src/`, the package files and `README.md`, and says the runtime copy carries no tests.
- `Claude/searxng-search-mcp` has an offline `npm run test:unit` (57 tests) besides the live `npm test` smoke;
  both pass.
- `openalex_literature_search` and `DOAJ_search_articles` (literature_reviewer) reach the engine as
  `{result: [...]}`: ToolUniverse's `execute_tool` wraps a tool's bare list that way, and the adapter does not
  unwrap `result`. Each renders as one record whose abstract is the serialized JSON of every row, cut at 20,000
  characters, and the coverage ledger counts 1 record instead of 8 and 6. Inside that JSON only OpenAlex's
  DOIs still matched the citation pattern (they are resolver URLs); DOAJ's bare DOIs did not, so none of its 6
  reached the grounding gate. Seen in the 2026-10-24 live A/B; not fixed with decision 5's gaps. **Fixed**
  later on 2026-10-24: the adapter sends a `result` array down the same row path as every other list, and the
  normalizer maps the two tools' rows (`venue` is the journal, OpenAlex's resolver-URL DOI is carried bare, and
  a placeholder the tool itself flags false in `data_quality`, such as "Abstract not available", is dropped).
  Replaying the envelopes captured live before the change: OpenAlex 1 → 8 records (3 with an abstract; the
  other 5 have none upstream), DOAJ 1 → 6 (all with text), DOI ids 5 → the same 5 and 0 → 6. The other 22
  ToolUniverse entries render byte-identical prompt content.

## Reproduce

```bash
cd /Users/myhome/TRINC/Claude/searxng-search-mcp && npm audit --json --cache "$TMPDIR/npm-audit-cache"
```

Run that in each manifest folder (add `--omit=dev` for the runtime split). For the engine, always pass a
scratch `--cache`: its `.npmrc` points at the locked `.ci/npm-cache`. Count one record per (package,
advisory `source`) in `vulnerabilities[*].via` to match Dependabot's unit. For the submodule, query OSV's
`/v1/querybatch` with the `(name, version)` pairs from `vendor/tooluniverse/.venv`.
