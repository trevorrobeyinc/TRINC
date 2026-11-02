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

**Update, decision 4 (same day):** the Copilot fork's lockfile refresh took it from 158 advisories to 54
(72 → 1 at runtime); repo-wide 185 → **81** (4 critical, 30 high, 38 moderate, 9 low). Not yet deployed.

**Update, decision 5 (same day):** the ToolUniverse submodule moved from v1.1.10 to v1.5.7 and its venv
was rebuilt from a repo-owned, hashed lock: **252 known vulnerabilities in 214 packages → 0 in 107**,
2,173 → 2,719 tools, no Playwright. Its live before/after found three result gaps present at both versions:
two are fixed engine-side (an upstream error is now a failed search, not a returned record; OpenTargets'
drug lookup now yields its hits), and the third (Semantic Scholar's 429) needs an API key, written up as an
option. Details under decision 5.

**Update, 2026-11-01 (cloud session; merged to `main` at the operator's request):** a fresh audit found
**89**, not 81: one new `@hono/node-server` advisory with no 1.x fix landed in the six trees that held it,
and two more in the fork's dev tree. After the work below, including the engine's zod flip (the operator is
the named reviewer): **89 → 24** (2 critical, 10 high, 10 moderate, 2 low), 20 of them runtime.
- research-memory's 14 need the transformers port on the Mac.
- Medical-Zettelkasten's 5 have no fix (dismiss on GitHub).
- The fork's 5 are dev-only or unreachable.

Details in [2026-11-01 follow-up](#2026-11-01-follow-up-89--24).

## 2026-11-01 follow-up: 89 → 24

Same method as 2026-10-24 (`npm audit`, one record per package × advisory, scripts off, scratch npm cache),
in a Linux cloud container: no Obsidian, Qdrant, SearXNG or Hugging Face, and the ToolUniverse submodule is
not checked out. Every test below was run before and after on the same machine.

| Lockfile | 11-01 before | After | What changed |
|---|---|---|---|
| `Medical-Zettelkasten-MCP` | 7 | 5 | `@hono/node-server` 1.19.17 → 2.1.5; zod 3.24.1 → 4.6.7 (no source file imports zod; the SDK's nested copy merges into it) |
| `searxng-search-mcp` | 2 | 0 | hono 2.1.5; zod 4.6.7 (exact, as before) |
| `trevorobeyinc-research-memory-mcp` | 16 | 14 | hono 2.1.5; zod `^4.6.7` (compiled JS byte-identical, only `.d.ts` differs) |
| `trinc-content-mcp` | 1 | 0 | hono 2.1.1 → 2.1.5 |
| `obsidian-copilot-bridge` (and so the adapter) | 2 | 0 | hono 2.1.5; zod `^4.6.7` with `loader.ts` on `.prefault({})` (below) |
| `obsidian-vault-zettelkasten` | 1 | 0 | zod `^4.6.7`, `.prefault({})` on `options`. **`main.js` rebuilds byte-identical**: the plugin imports only types from its zod module, so zod was never in the bundle (decision 1 below said it was; it is not) |
| `obsidian-command-center` | 1 | 0 | esbuild 0.24.2 → 0.28.2 (decision 7); `main.js` byte-identical |
| `obsidian-viz-studio` | 1 | 0 | esbuild 0.28.2; `main.js` 26 bytes smaller, and the only change is constant folding (`40*2` → `80`, `24*2` → `48`, `14*2` → `28`) |
| `obsidian-copilot-mcp-v4` (fork) | 57 | 5 | hono 2.1.5; dev `electron` `^27.3.2` → `^45.2.1` (−48: Electron and its `extract-zip`); dev `eslint-plugin-boundaries` `^6.0.2` → `^7.4.0` (−3 handlebars). `main.js` and `styles.css` **byte-identical** |
| engine | 1 | 0 | source made zod-4-ready, then zod 3.24.1 → 4.6.7 with the operator as reviewer (below) |
| `obsidian-bridge-launcher` | 0 | 0 | — |

**`@hono/node-server` 2.x.** GHSA-rmxm-3fg6-px4f (`serveStatic` decodes the path twice) covers every 1.19.10+
release, so the 2026-10-24 hold on 1.19.17 (decision 10) is lifted. Each MCP SDK 1.32.2 declares
`^1.19.9 || ^2.0.5`, so `npm update @hono/node-server --package-lock-only` moved one lockfile node per tree.
The SDK still loads, and it uses the package only in its streamable-HTTP server transport, which none of
these servers starts.

**zod 4: the one real trap is `.default({})` on an object.** zod 4 returns that `{}` as it is, so every
inner default is lost; zod 3 parsed it. A minimal bridge config under zod 4 with `.default({})` came back
with no `port`, no timeouts, no queue sizes and no log level. `.prefault({})` is zod 4's spelling of the old
behaviour. The bridge's new `src/tests/configLoader.spec.ts` pins every default: it passes on the old code
with zod 3.25.76, fails on zod 4 with `.default({})` (2 of 3), and passes on the new code. A cross-version
harness ran identical inputs through the same compiled schemas under zod 3.24.1 and 4.6.7. Its control case
does differ, so it can tell the versions apart. It found 0 differences: research-memory's six tool schemas
(36 cases) and the engine's research-API schemas (49 cases, including URL edge cases and coercion).

**Engine: source first, then the version.**
- *Source* (works on both zod 3.24.1 and 4.6.7):
  - The 13 one-argument `z.record(X)` calls are now `z.record(z.string(), X)`, the documented v4 form
    (zod 4.6.7 still accepts the old form at runtime, and the results match).
  - `workflow-schema.js`'s `input_schema` default is a function. zod 4 only shallow-copies a value default,
    so the nested `required: []` and `properties: {}` would be shared by every template that omits
    `input_schema`. A probe confirms it: under v4, a push into one parse's array shows up in the next parse.
- *Why the version waited for the operator:* changing the lockfile and the locked cache needs
  `security/dependency-review.md` to say `Lockfile-Review: approved` with a named `Reviewer`, and it moves
  the supply-chain trust anchor `security/known-good-dependencies.json` (written once in March, never changed
  since). Those are the operator's to sign. The flip was first rehearsed in a git-backed scratch copy whose
  reviewer line said it was a rehearsal.
- *Applied 2026-11-01:* the operator approved it in the session and asked to be named as reviewer. In one
  commit:
  - `package.json` exact `4.6.7`, and the lockfile to match;
  - `.ci/npm-cache` rebuilt from the new lockfile with scripts off (the 3.24.1 blob and index entry out,
    the 4.6.7 pair in; the blob's sha512 equals the lockfile's integrity);
  - `security/npm-cache.lock.json` regenerated;
  - the zod component of `security/known-good-dependencies.json` regenerated from the SBOM generator;
  - `Reviewer: Trevor Robey (operator)`, `Review-Date` and `Cache-Rebuild-Reason` in
    `security/dependency-review.md`, with a note saying Claude Code applied it on the operator's approval.

  It matches the rehearsal hash for hash.
- *Tests:* `npm test` under Node 22.13.1 gives **1352 / 1355 in all five states**: the old source on zod 3,
  the new source on zod 3, the new source on zod 4 swapped into the real checkout, the rehearsed flip, and
  the real flip installed with `npm ci --offline` from the new cache. The 2 failures are the Phase 29
  startup-integrity checks (the submodule is not checked out) and the 1 skip is pre-existing.
- *Gates on the real flip:* `verify-lockfile-review.sh` against the commit itself, plus
  `verify-npm-cache-checksum.sh`, `verify-dependency-integrity.js` (`valid: true`),
  `verify-phase12-policy.sh` and `verify-no-lifecycle-hooks.sh`, all pass. `npm audit` on the engine: 0.

**Fork: Electron and eslint-plugin-boundaries.** The fork marks `electron` external (Obsidian supplies it at
runtime), and the four files that use it `require("electron")` and cast it to a local shape, so the
devDependency provides nothing the code reads. Every package that moved in either bump is dev-only (46
packages removed, 4 added for Electron). `tsc` (inside `npm run build`) passes, and `main.js` and `styles.css`
are **byte-identical to a build from HEAD's lockfile**, so none of today's three fork changes (hono included,
which is not in the bundle) reaches what Obsidian loads. ESLint's full report is identical, message for
message (the same 6 errors and 126 warnings, at the same rules and positions). Handlebars collapses to one
copy, 4.7.10, the patched release `@langchain/classic` already used at runtime. Jest 5,831 / 5,831 with
425 / 426 suites, as on the 10-24 baseline (`customCommandRegister.test.ts` still fails to load). Nothing to
deploy for these; the fork still needs the 10-24 deploy for decision 4.

**Tests, 2026-11-01** (before → after, same container):

| Package | Before | After | Note |
|---|---|---|---|
| bridge (`vitest run`, `tsc`, `lint:transport`) | 46 / 46, OK, OK | 49 / 49, OK, OK | +3 `configLoader.spec.ts`; compiled output differs only in `loader.js` (and the new spec) |
| adapter (`npm run test:profiles`) | — | 43 PASS, 0 FAIL, 3 SKIP | as on 10-24; needs a bridge config and a TLS pair, so a scratch pair from `/tmp` was used |
| searxng (`npm run test:unit`) | 57 / 57 | 57 / 57 | live smoke needs SearXNG; an offline stdio handshake lists `search, extract, map` and rejects bad arguments with the v4 issue text |
| Medical-Zettelkasten (`npm test`) | 120 / 121 | 120 / 121 | the known 12-vs-10 tool count |
| research-memory (`tsc`; offline `hash` + `section_parser`) | OK; 13 / 13 | OK; 13 / 13 | `integration.test.ts` needs live Qdrant: **run it on the Mac** |
| vault-zettelkasten (`tsc`, build) | OK, `main.js` = tracked | OK, `main.js` = tracked | |
| command-center (`npm test`, `lint:transport`, `tsc`) | 47 / 47, OK, 4 errors | 47 / 47, OK, 4 errors | the 4 are the known `workflow-modal.ts` ones |
| viz-studio (`npm test`, `lint:transport`, `tsc`) | 15 / 15, OK, OK | 15 / 15, OK, OK | |
| engine (`npm test`, Node 22.13.1) | 1352 / 1355 | 1352 / 1355 (zod 4.6.7 from the new LOCKED cache) | 2 fail without the submodule; 1 skip |
| fork (build, lint, Jest) | builds; 6 errors, 126 warnings; 5,831 / 5,831 on 10-24 | identical bundle; identical report; 5,831 / 5,831 | Jest was run after the change only, against the 10-24 baseline |

**GitHub after the merge (the operator read the page, 28 open):**
- research-memory 14 and the fork 5, the same records as the local audit.
- Medical-Zettelkasten's locutus alerts are absent (already dismissed).
- **9 for `Trevor Robey Intelligence Network Citations/scrape-sidecar/uv.lock`**: starlette ×5, anyio ×2,
  idna, and a certifi alert opened that day. That folder was deleted from `main` by `a148d9e` on 2026-09-18.
  It is absent from `main` on GitHub (checked), and nothing in the repo refers to it outside history notes.
  GitHub's dependency graph never dropped the lockfile, so its alerts stay open and new advisories keep
  matching it. These were the 10-24 "8-alert gap" (the certifi one is new).

  The local audits missed it because they read only the current tree. The 2026-11-01 cloud clone was also
  shallow, with no history before April.

  *Action:* dismiss the 9 as "This alert is inaccurate or incorrect", noting "manifest deleted in a148d9e".
  Turning the dependency graph off and on would rebuild it, but it also switches Dependabot alerts off, so
  it was not recommended.

**Left after 2026-11-01 (24 by the local audit):**
- **research-memory, 14 (1 critical, 8 high, 5 moderate: protobufjs and sharp):** decision 3. Measured
  here: a lockfile-only scratch swap to `@huggingface/transformers` 4.3.2 (protobufjs 7.6.6, sharp 0.35.5,
  onnxruntime 1.30) audits at **0**. It has to be done on the Mac, because:
  - the model cache moves out of `node_modules/@xenova/transformers/.cache/`, so under the offline default
    every ingest would answer `EMBED_MODEL_NOT_CACHED` until the operator re-downloads the model;
  - `quantized: true` becomes a `dtype` option;
  - `onnxruntime-node` fetches its native binary in an install script;
  - the vectors have to be shown unchanged against `trevorobeyinc-packs`, or the collection re-embedded.
- **Medical-Zettelkasten, 5 (locutus ×4, phpmorphy-locutus):** decision 6, accepted; dismiss on GitHub as
  "vulnerable code not used".
- **Fork, 5:**
  - `glob`, `minimatch` and `deepmerge` come from Jest 29 (dev); clearing them needs Jest 30, which renames
    matchers across 5,800 tests.
  - `moment` 2.29.4 is pinned exactly by the `obsidian` typings (1.2.5 and `eslint-plugin-obsidianmd`'s
    1.12.3). It is dev-only, and Obsidian supplies moment at runtime.
  - `diff` 7 (runtime, low): the advisory is in `parsePatch`/`applyPatch`, and the fork calls only
    `diffArrays` and `diffTrimmedLines`. Dismiss as "vulnerable code not used", or bump at the next upstream
    re-sync.

**On the Mac, in this order.** The repo's `node_modules` folders still hold the old trees after a pull, so
each runtime tree is reinstalled from its lockfile before it is built or run:
1. Quit Obsidian. The `:8798` bridge runs from its folder's `node_modules`, so it must not be running while
   that folder is replaced.
2. `git pull --ff-only origin main`. If it refuses, local commits exist: stop and reconcile first.
3. Engine: `npm ci --offline --ignore-scripts` under Node 22.13.1. It installs zod 4.6.7 from the LOCKED
   cache.
4. Medical-Zettelkasten (loaded in-process by the engine): `npm ci --ignore-scripts`.
5. Bridge, which is also the adapter's tree: `npm ci --ignore-scripts`, then `npm run build`, since
   `loader.js` changed.
6. research-memory: `npm install --ignore-scripts`, **not** `npm ci`, so the native `sharp` binary
   survives (as on 10-24). Then `npm run build` (only its `.d.ts` changed) and its test against Qdrant with
   `NODE_EXTRA_CA_CERTS` set.
7. Re-run the searxng and trinc-content installers. Each runs its own `npm ci` in the staged copy. Claude
   Code sessions pick the new trees up when they restart.
8. Command Center and Viz Studio: `npm ci --ignore-scripts`. `deploy.sh --build` builds with whatever is in
   `node_modules`.
9. `ops/tr-suite/deploy.sh --build --apply command-center trinc-viz-studio copilot`. Command Center's bundle
   is unchanged, Viz Studio's differs only by constant folding, and the fork carries decision 4.
10. Open Obsidian. Then run `npm run test:profiles` in the adapter, `ops/tr-suite/verify.sh` and the
    obsidianwatch bless.
11. Cut a fresh backup bundle (`scripts/trinc-backup.sh`).

**Process note:** esbuild's own `install.js` from the locked `esbuild` package was run once by hand in
vault-zettelkasten. It was not needed, since the platform binary ships as an optional dependency. Every other
install ran with `--ignore-scripts`.

### Clearing the last 18 (2026-11-01, later)

Tracing each package to its parents corrected two assumptions written above. The fork's vulnerable `glob`
came from Tailwind's `sucrase`, not Jest. Its `minimatch` copies come from ESLint plugins.

**Fork, fixed (glob, moment), on `main`:**
- `sucrase` 3.35.0 → 3.35.1, inside Tailwind's `^3.35.0`. That release no longer depends on `glob`, so
  `glob` 10.5.0 and 21 other dev packages leave the tree. `package.json` is unchanged.
- `"moment": "2.31.0"` added to the fork's existing `overrides` block. Both `obsidian` typings packages
  (1.2.5, and 1.12.3 inside `eslint-plugin-obsidianmd`, whose newest release 0.4.2 still pins it) required
  2.29.4 exactly. The fork never imports moment, and Obsidian supplies it at runtime.
- Checks: `main.js` and `styles.css` are byte-identical to the HEAD build, the ESLint report is identical
  message for message, and Jest gives 5,831 / 5,831 with 425 / 426 suites, unchanged
  (`customCommandRegister.test.ts` still fails to load). Nothing to deploy.

**Fork, no fix exists (dismiss on GitHub):**
- **`minimatch`:** all seven copies (3.0.5, 3.1.5, 8.0.7, 9.0.9 ×3, 10.2.5) are below the first fixed
  release, 11.0.1. They belong to ESLint plugins and test tooling written against the v3–v10 APIs, so an
  override to 11 would break them. *Dismiss:* "Risk is tolerable to this project". It is dev-only, and its
  patterns come from the repo's own config.
- **`deepmerge`:** 4.3.1 is its newest release and is inside the range, and Jest 30's `jest-config` still
  depends on it. *Dismiss:* "Risk is tolerable to this project". It merges the repo's own Jest config.
- **`diff`:** *dismiss* as "Vulnerable code is not actually used" (above).

**research-memory: `@huggingface/transformers` 4.3.2. Held on the branch until the Mac parity check
passed; merged 2026-11-02 after the re-embed below.** Changes:
- `@xenova/transformers` 2.17.2 → `@huggingface/transformers` `^4.3.2`. protobufjs goes to 7.6.6, sharp to
  0.35.5 and onnxruntime to 1.30, and `npm audit` gives **0**, down from 14.
- `dtype: "q8"` replaces `quantized: true`. Both load `onnx/model_quantized.onnx` (the suffix map was
  checked); without it v4 would default to fp32, a different file.
- The model cache moves out of `node_modules` to `~/.cache/trevorobeyinc-research-memory/transformers/`
  (`EMBED_CACHE_DIR` overrides it), so `npm ci` can no longer delete it. Its layout is the old one: a probe
  with only `config.json` in place found it and moved on to `onnx/model_quantized.onnx`, so a copy of the old
  cache works and nothing needs downloading.
- Offline-by-default is kept, by probe: a cache miss throws `EMBED_MODEL_NOT_CACHED` naming the folder,
  nothing is downloaded, and the empty cache stays empty.
- **`npm ci` is now safe here.** sharp ≥0.33 ships prebuilt binaries as optional packages (darwin-arm64 is
  in the lockfile), and onnxruntime-node bundles its darwin-arm64 binary; its install script only fetches
  optional CUDA files.

**New: `npm run parity`.** It is read-only (scroll only, never `ensureCollection`). It re-embeds every pack
whose source file is still readable and still hashes to its stored `content_sha256`, and compares the
result with the stored vector (cosine ≥ 0.999). Exit 0 means PASS; 1 means drift, or nothing comparable;
2 means Qdrant or the model is unreachable. Tests:
- `tsc` passes; offline vitest 20 / 20 (7 new for the parity logic);
- the CLI's paging was checked against a scratch Qdrant stand-in (70 points over 2 pages);
- `integration.test.ts` and the parity run itself need the Mac.

**Mac parity run (2026-11-02, operator, from a worktree of the branch): FAIL by the 0.999 bar.** All 6
packs were comparable (sources readable, hashes matching): cosine 0.992867–0.998355, mean 0.995745. The
same model, read with the Hugging Face connector, rules out the big explanations:
- `tokenizer_config.json` gives `model_max_length` 8192, and both library versions truncate at that, so
  neither embeds less of a pack than the other.
- `onnx/model_quantized.onnx` is the one file both versions load.

What remains is arithmetic. The weights are int8, and onnxruntime moved from 1.14 (the @xenova build) to
1.30. Small rounding differences add up over thousands of tokens, which fits a uniform 0.4% drift on long
packs. The vectors are the same model's output; mixing them would only nudge search scores (calibrated
2026-09-22 at on-topic 0.45–0.60 against off-topic ≤ 0.43, threshold 0.5).

*Decision proposed:* re-embed the 6 stored vectors with the new library, so stored packs and new queries
come from one embedder; then parity reads ≈1.0 and stays a guard for future bumps. `npm run parity`
gained `--reembed` and `--restore`:
- `--reembed` writes a backup of the old vectors to `~/.local/share/trinc-rollback/` before it changes
  anything, then replaces vectors only (payloads untouched) and re-checks.
- `--restore <file>` puts a backup back.

Tests: offline vitest 26 / 26 (6 new). They cover that the backup comes first, that a failed backup
changes nothing, that only comparable packs are rewritten, and that a backup from another collection is
refused. Against the scratch stand-in, `--restore` sent one vectors-only update with the right ids, a
wrong-collection backup was refused without a write, and `--reembed` with nothing comparable wrote nothing.

**Applied 2026-11-02T00:55Z (operator, from the worktree): re-embedded 6 of 6.** The after-check gave
**min 0.999999, mean 1.000000: PASS.** The old vectors are in
`/Users/myhome/.local/share/trinc-rollback/research-memory-vectors-2026-11-02T00-55-51-606Z.json`; undo with
`npm run parity -- --restore <that file>`. The port was then merged to `main`. Keep the backup until the new
embedder has served a real run.

**After the merge, on GitHub:** `glob`, `moment` and research-memory's 14 close by themselves. Dismiss the 9
scrape-sidecar alerts, `diff`, `minimatch` and `deepmerge` as above. That leaves 0 open.

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

There are no tracked Python manifests outside the submodule (true since 2026-09-18, when `a148d9e` removed
`scrape-sidecar/` with its `pyproject.toml` and `uv.lock`; GitHub still holds that lockfile, see the
2026-11-01 follow-up).

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
**Resolved 2026-11-01:** the gap is `Trevor Robey Intelligence Network Citations/scrape-sidecar/uv.lock` (see
the 2026-11-01 follow-up). Commit `a148d9e` deleted that folder on 2026-09-18, but GitHub's dependency graph
kept it, so its alerts stayed open and new advisories still match it.

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
   **2026-11-01:** done in the bridge (and so the adapter), searxng, Medical-Zettelkasten, research-memory
   and vault-zettelkasten. Correction: vault-zettelkasten's `main.js` never contained zod (types only), so it
   needs no rebuild, deploy or bless. Engine: done the same day, source first and then the version, with the
   operator as the named reviewer (see the 2026-11-01 follow-up). Decision 1 is complete.
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
   **Done (lockfile only, 2026-10-24):** `npm audit fix` with scripts off; no fork source, `package.json` or
   manifest change. **158 → 54 advisories, and 72 → 1 reaching the runtime bundle**; the fork's own
   runtime critical-level audit (`review:obsidian:audit`) now passes. Three transitive moves needed a call:
   - `@hono/node-server` held on patched 1.19.17 (the MCP SDK allows 1.x or 2.x; npm had picked 2.x).
   - `@langchain/core` 1.1.46 → 1.3.0 and `langsmith` 0.5.4 → 0.11.1 kept: `langsmith`'s 0.5 line ends at its
     last vulnerable release, so its fix needs the newer line.
   - `@langchain/openai` held on 1.5.8 and `@langchain/classic` on 1.0.43 (it clears its own advisory): npm
     had taken them to 1.7.0 / 1.0.55, which moves every OpenAI-compatible provider to OpenAI SDK v7 and
     broke a Jest suite (that SDK reads the global `Response` at import). The hold keeps one `openai`
     6.49.0, the major the fork already ran.
   Tests: Jest 5,831/5,831 with 425/426 suites, unchanged from baseline (the one suite that fails to load,
   `customCommandRegister.test.ts`, already did). Lint unchanged (132 problems, 6 errors, pre-existing);
   `review:obsidian` stops at the same pre-existing manifest key (`upstreamBase`). The production build
   passes (`main.js` 5.29 → 5.53 MB, `styles.css` identical), and the fork's mobile-load smoke test passes
   on the new bundle. **Not deployed:** the repo-side `main.js` was put back, so nothing changes in Obsidian
   (and `verify.sh` shows no drift) until `ops/tr-suite/deploy.sh --build --apply copilot`, then the
   obsidianwatch bless with Obsidian open. Left: 53 need majors (Electron 27 → 45 alone is 46 of them,
   then `eslint-plugin-boundaries`, `diff` 9 and `eslint-plugin-obsidianmd`), 1 has no fix; leave them for
   the next upstream re-sync.
   **2026-11-01:** the dev Electron (27 → 45) and `eslint-plugin-boundaries` (6 → 7.4) bumps were done after
   all, because neither changes the bundle or the lint report; 57 → 5. At the next upstream re-sync, carry
   these two `package.json` lines, or drop them if upstream has moved past them.
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
   **2026-11-01:** bumped to 0.28.2 in both. Command Center's bundle is byte-identical; Viz Studio's differs
   only by constant folding. Ships with the next `deploy.sh --build --apply`.
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
    `@hono/node-server` hold remains. **2026-11-01:** lifted. GHSA-rmxm-3fg6-px4f has no 1.x fix, so every
    tree is on 2.1.5.
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
