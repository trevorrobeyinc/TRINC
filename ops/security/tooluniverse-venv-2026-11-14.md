# ToolUniverse venv lock: 4 OSV advisories cleared (2026-11-14)

The engine's ToolUniverse venv (`Trevor Robey Intelligence Network Citations/vendor/tooluniverse/.venv`) is built
from the repo-owned lock `Trevor Robey Intelligence Network Citations/security/tooluniverse-venv.lock.txt` by
`scripts/setup-tooluniverse.sh`, since `aeb2c7f`. That is decision 5 of
[`dependency-audit-2026-10.md`](dependency-audit-2026-10.md).

Dependabot cannot see this lock: its filename is not a manifest name Dependabot reads, and the venv belongs to the
`vendor/tooluniverse` submodule. So none of these 4 advisories was among the 54 alerts after the 2026-11-14 push,
which are handled on their own branch. OSV found them, published between 2026-10-30 and 2026-11-13. The work ran in a
worktree on 2026-11-14 PST, on the operator's go, with every check run on 2026-11-15 between 04:26Z and 04:41Z.

## Result in one paragraph

OSV finds **0** advisories in the lock (106 pins) and **0** in the rebuilt venv (107 installed packages), down from
4 in each. Exactly 4 pins moved: version plus the wheel and sdist hash, 12 lines. The other 102 blocks, the header and
every `# via` line are byte-identical. Engine `npm test`, `phase29:verify`, `secrets:verify` and `build:verify` give
the same results before and after. ToolUniverse still loads 2,719 tools. In the live check of the 24 prefetch entries
that reach ToolUniverse, every entry that answered at both venvs came out byte-identical: 20 in the main run, plus
scout's Semantic Scholar entry on a re-run. The other 3 are Semantic Scholar entries that drew the anonymous pool's
429 at both venvs, the upstream condition decision 5 documented (see [Live check](#live-check)).

## Advisory → action

| Advisory | Package | Severity (CVSS 3.1) | Affected → first fix | Reachable as used? | Action |
|---|---|---|---|---|---|
| GHSA-vvf4-9x63-8xvv / CVE-2026-128089. The WKS rdata text parser does not bound the service number, so a crafted zone file forces huge allocations | dnspython 2.9.0 | High (A:H) | `< 2.9.2`; 2.9.1 is still affected | No. It needs zone-file text parsing. dnspython arrives only through email-validator (pydantic's `email` extra), and ToolUniverse never imports `dns` | **2.9.0 → 2.9.2** |
| GHSA-mpqx-q82w-9x46 / CVE-2026-119286. Every aborted validation grows one shared error's traceback, leaking memory | graphql-core 3.3.0 | High (A:H) | `3.3.0a3 .. < 3.3.1` | No. `tooluniverse/graphql_tool.py` only parses and validates ToolUniverse's own fixed queries, and the leak needs more than 100 validation errors per document | **3.3.0 → 3.3.2** |
| GHSA-mmhr-3c5m-f64f / CVE-2026-126190. The descendant combinator is polynomial-time on deep nesting | soupsieve 3.0.4 | High (A:H) | `< 4.0`; there is no 3.x fix | No. ToolUniverse's six bs4 modules use `find`/`find_all` and never call `.select()`/`.css.select` (the only `.select(` hits are JavaScript `d3.select` inside web-UI strings) | **3.0.4 → 4.1** |
| GHSA-mf5v-w3w3-f6cg / CVE-2026-126360. `traceparent` parsing in `TraceContextTextMapPropagator.extract()` backtracks quadratically | opentelemetry-api 1.45.1 | Moderate (A:L) | `< 1.45.2` | No. The server runs over stdio, so there is no HTTP carrier, and a conforming header value cannot hold the newline it needs | **1.45.1 → 1.45.2** |

All four are denial-of-service class (ATT&CK T1499.004), and none is reachable as ToolUniverse v1.5.7 is used. This
is scanner hygiene and defence in depth, not an incident.

## Version choice

The rule: **the newest release that is at least 3 days old.** Ages are as of 2026-11-15 04:20Z.

| Package | Chosen | Released | Not chosen |
|---|---|---|---|
| dnspython | 2.9.2 | 2026-11-03 | (the only fixed release) |
| graphql-core | 3.3.2 | 2026-11-06 | 3.3.1 (10-25), the first fix. 3.3.2 fixes four more validator and parser DoS bugs, and its release notes say their advisories follow coordinated disclosure with GraphQL.js, so 3.3.1 would likely reopen alerts |
| soupsieve | 4.1 | 2026-11-10 | 4.0 (11-03), the first fix, and 4.0.1. Both lack later quadratic-path fixes: `:has()`, the child combinator, `[attr*=v]`/`[attr$=v]`, `:lang()`, and a compile race. 4.1.1 (11-14 17:23Z) adds more (`nth … of S`, `:placeholder-shown`) but was under a day old |
| opentelemetry-api | 1.45.2 | 2026-10-29 | (the only fixed release) |

Checked for each chosen version:
- **OSV:** 0 advisories. Of every candidate checked, only dnspython 2.9.1 carries one.
- **Wheels:** a `py3-none-any` wheel, so `--no-build` holds, and `requires_python` accepts CPython 3.12.13.
- **No new dependencies:** no core `Requires-Dist` was added.
- **Declared ranges:** every dependent's range is met:
  - beautifulsoup4 4.15.0: `soupsieve>=1.6.1`;
  - email-validator 2.3.0: `dnspython>=2.0.0`;
  - tooluniverse: `graphql-core>=3.2.0`; rcsb-api: any version;
  - fastapi 0.162.0: `opentelemetry-api>=1.44.0`; fastmcp-slim: `>=1.20.0` (extras only).
- **Provenance:** a PyPI Trusted-Publishing attestation from the same repository and workflow as the version it
  replaced:
  - `rthalley/dnspython` `publish.yml`;
  - `graphql-python/graphql-core` `publish.yml`;
  - `facelessuser/soupsieve` `deploy.yml`.

  opentelemetry-api has no attestation at either 1.45.1 or 1.45.2, so assurance is unchanged.
- **Breaking changes:**
  - soupsieve 4.0's two BREAK items (`template` contents are no longer part of the document; `iframe` contents are no
    longer a separate document) change only matcher behaviour, which ToolUniverse never calls. bs4 4.15.0 reaches
    soupsieve only through its public API.
  - graphql-core 3.3.2's behaviour changes (nesting deeper than 200 is rejected, a validation work budget, empty
    selection sets allowed) touch only parse and validate. The live check exercises them through
    `OpenTargets_get_drug_id_description_by_name`.

## How

All of it ran in a TRINC worktree, branch `claude/tooluniverse-venv-advisories-2026-11-14` from `d37bbb1`, and the
production venv was not touched:
- **Submodule:** a local clone of `.git/modules/trevor-robey-inc-agents/vendor/tooluniverse`, detached at
  `f2006162`. Nothing was fetched from GitHub and the shared `.git/config` was not changed.
- **Engine dependencies:** `npm ci --offline --ignore-scripts` from the tracked `.ci/npm-cache`.
- **Venv:** built with `bash scripts/setup-tooluniverse.sh`. Its baseline `uv pip freeze` equals production's, entry
  for entry, apart from the editable path.

The lock was changed with this command, run from the engine folder (uv 0.11.17):

```bash
uv pip compile vendor/tooluniverse/pyproject.toml --python 3.12 --no-build --generate-hashes \
  -o security/tooluniverse-venv.lock.txt \
  -P dnspython==2.9.2 -P graphql-core==3.3.2 -P soupsieve==4.1 -P opentelemetry-api==1.45.2 \
  --custom-compile-command 'uv pip compile vendor/tooluniverse/pyproject.toml --python 3.12 --no-build --generate-hashes -o security/tooluniverse-venv.lock.txt'
```

- **Why it moves only those pins:** `uv pip compile` takes the existing `-o` file's pins as preferences, so `-P`
  moves only the named packages.
- **Why the header is unchanged:** `--custom-compile-command` keeps it equal to the regeneration command documented
  in `setup-tooluniverse.sh`, which is still the command to use after the next submodule bump.
- **Checks on the result:**
  - A structural check against `HEAD` passed: same header, the same 106 names in the same order, 102 blocks
    byte-identical, and the 4 named blocks moved with their `# via` lines kept.
  - Each new wheel hash equals PyPI's published sha256.
  - The result is byte-identical to a dry run made before the go.
- **The venv:** re-running `setup-tooluniverse.sh` made `uv pip sync --require-hashes --no-build` swap exactly the
  4 wheels and reinstall the editable `tooluniverse`.

## Tests and gates, before and after

Everything ran from the worktree's engine folder.

| Check | Before (old lock) | After (new lock) |
|---|---|---|
| `npm test` (no `--test-force-exit`) | 1439 tests: 1438 pass, 0 fail, 1 skipped (178 suites) | 1439 tests: 1438 pass, 0 fail, 1 skipped (178 suites) |
| `npm run phase29:verify` | ALL CHECKS PASSED, 58/58 | ALL CHECKS PASSED, 58/58 |
| `npm run secrets:verify` | "Secret scan passed via ripgrep regex" | same |
| `npm run build:verify` | "Deterministic build verification passed" | same |
| ToolUniverse tools loaded | 2,719 | 2,719 |
| Package touches: bs4 `select()` (soupsieve), `build_schema`/`parse`/`validate` (graphql-core), traceparent `extract()` (opentelemetry-api), `dns.rdata.from_text` (dnspython) | all OK | all OK |
| OSV, lock | 4 of 106 | **0 of 106** |
| OSV, installed venv | 4 of 107 | **0 of 107** |

The skipped test is the same in both runs: `refuses run #7's sealed release for its retired wording only` skips
because "run #7's release is not on this machine". A fresh worktree does not carry that runtime artifact. The
engine's ToolUniverse suites run against stubs and fixtures, not the venv: `phase29-tooluniverse-mcp`,
`phase29-policy-gate`, and the runtime-level tests' stub `execute` or mock provider. So the live check below is the
functional proof.

## Live check

**Method** (decision 5's): the engine's own `tool-prefetch.js`, `tooluniverse-mcp.js` and `tu-process-manager.js`
were run against the worktree venv.
- **Scope:** the 24 entries of `config/tool-prefetch-map.json` that reach ToolUniverse (14 tools; `executeTool` and
  not a local fetcher wired in `scripts/_workflow-runtime.js`).
- **Inputs:** metformin / type 2 diabetes.
- **Warm-up:** the ToolUniverse process was started through the handshake (`ensureProcess()`) first, so cold start
  does not count against the 30 s per-call timeout. It took 1.8 s both times.
- **Per entry, recorded:** the coverage status and records, the rows with text, the citation ids that the engine's
  `CITATION_PATTERNS` find in the rendered content, and that content's sha256 with the `Retrieved:` line removed.

| Run | Window (UTC, 2026-11-15) | Returned | Failed | Records | Rows with text | Citation ids |
|---|---|---|---|---|---|---|
| Before | 04:29:06–04:29:42 | 21 | 3 | 151 | 136 | 119 |
| After | 04:30:47–04:31:20 | 20 | 4 | 143 | 131 | 112 |
| After, re-run of scout's Semantic Scholar entry only | 04:32:30–04:40:55, 8 tries | 1 (the 8th try) | 7 tries drew 429 | 8 | 5 | 7 |

Per entry:
- **Byte-identical: 21 entries, every one that answered at both venvs.** The rendered content is identical, and so
  are the records, the rows with text and the citation ids.
  - 20 in the main run: PubMed ×3, ClinicalTrials.gov ×3, OpenTargets (the GraphQL path), FDA drug names,
    EuropePMC ×2, FAERS ×2, DailyMed ×3, Orange Book ×2, OpenFDA enforcement, OpenAlex and DOAJ.
  - Scout's `SemanticScholar_search_papers`. It returned at the baseline (8 records, 5 with text, 7 ids) and drew a
    429 in the main after-run. It was re-run on the new venv, alone, once a minute. It drew a 429 at 04:32:30Z and
    on six more tries from 04:34:20Z to 04:39:43Z, then returned at 04:40:47Z, byte-identical to the baseline.
- **Upstream at both venvs: 3 entries.** These are the other `SemanticScholar_search_papers` calls (analyst,
  literature_reviewer and competitive_intel_analyst). Each failed with `TU_UPSTREAM_ERROR … Semantic Scholar API
  error 429` before and after, so there is no answer to compare. No moved package is on that tool's path: it imports
  `requests` and the standard library, and its optional `markitdown` is not installed. The cause is the shared
  anonymous rate limit decision 5 described.

The comparison rule is evidence-level: the same status, records, rows with text and citation ids, which is what the
citation gate and `search-coverage.md` consume. A failure counts as upstream only when its error names a remote
condition (429, 5xx or a timeout). The harness and the compare script lived in the session scratchpad and are not
part of the repo.

## Not deployed by this commit

- **The production venv.** `Trevor Robey Intelligence Network Citations/vendor/tooluniverse/.venv` in the main
  checkout keeps the old 4 wheels until it is re-synced from the merged lock. To re-sync it:
  1. Park it first: `cp -cR` (an APFS clone) to `~/.local/share/trinc-rollback/tooluniverse-venv-v1.5.7-pre-2026-11-14`.
  2. Run `bash scripts/setup-tooluniverse.sh` from main's engine folder.
  3. Run OSV and the live check against production.
- **The board entry.** `_continuity/CONTINUITY.md` has uncommitted work in main, so the entry is left to whoever
  lands this branch. A branch edit to that file would make `merge --ff-only` refuse.

## Rollback

- **Before landing:** remove the worktree and the branch.
- **After landing:** revert this commit and re-run `setup-tooluniverse.sh`. `uv pip sync --require-hashes` restores
  exactly the old 4 wheels, which are hash-pinned and still in uv's cache.
- **Instant, once parked:** move the parked copy back to `vendor/tooluniverse/.venv`. It is the same path, so its
  absolute shebangs still work.

## Found on the way (no change made)

- **The editable install is not hash-pinned.** `setup-tooluniverse.sh` runs `uv pip install --no-deps -e .`, which
  builds `tooluniverse` with `setuptools` and `wheel` taken unpinned from PyPI (the submodule's `[build-system]`).
  Every other wheel in the venv is hash-pinned. It is a candidate for `--build-constraints` with hashes.
- **The old rollback venv is still parked.** `~/.local/share/trinc-rollback/tooluniverse-venv-v1.1.10` (1.2 GB) is
  still there. Decision 5 said to delete it once the v1.5.7 venv had served a real run.

## Reproduce

Query OSV's `/v1/querybatch` with the `(name, version)` pairs of the lock, or of `uv pip freeze` on the venv, in the
PyPI ecosystem (the method in `dependency-audit-2026-10.md`, "Reproduce"). Expect 0.
