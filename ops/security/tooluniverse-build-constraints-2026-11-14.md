# ToolUniverse venv build: the editable install's build dependencies hash-pinned (2026-11-14)

`Trevor Robey Intelligence Network Citations/scripts/setup-tooluniverse.sh` builds the engine's ToolUniverse venv.
Every runtime wheel comes from `security/tooluniverse-venv.lock.txt` with `--require-hashes --no-build`. The one
exception was the last step: `uv pip install --no-deps -e .`.

That step builds ToolUniverse with build isolation. uv resolved the submodule's `[build-system] requires =
["setuptools", "wheel"]` from PyPI with no pin and no hash, then ran them. The gap was found during the advisory fix:
[`tooluniverse-venv-2026-11-14.md`](tooluniverse-venv-2026-11-14.md), "Found on the way", first bullet.

The work ran in a worktree on 2026-11-14 PST (2026-11-15 05:10Z to 05:50Z), on the operator's "Go, use G-toml guard"
and then "Yes, add it" for `--only-binary :all:`.

## Result in one paragraph

The build environment is now exactly the three pinned wheels: **setuptools 84.2.1, wheel 0.48.0 and packaging 26.3**.
These are the versions that built the running venv, and every file is checked against its hash before any build code
runs. The old and new scripts, each run on a fresh venv, give an identical `uv pip freeze` (107 entries) and
byte-identical editable files, and ToolUniverse still loads 2,719 tools. Four kinds of tampering each make the
script refuse:
- a wrong hash;
- a build requirement that drifted from the submodule's;
- a pin without hashes;
- an inherited `UV_NO_VERIFY_HASHES`.

`npm test`, `phase29:verify`, `secrets:verify` and `build:verify` give the same results before and after.

## What changed

- **`security/tooluniverse-build-constraints.in`:** the submodule's `[build-system] requires`, copied from `f2006162`.
- **`security/tooluniverse-build-constraints.txt`:** generated from the `.in` by the command under
  [Regenerate](#regenerate). All 6 hashes equal PyPI's published sha256.
- **`scripts/setup-tooluniverse.sh`, step 4:**
  - **A guard**, run with the venv's `python -I` before `uv pip sync` (so a refusal leaves the venv as it was). It
    refuses unless:
    - the submodule's `[build-system] requires` equal the `.in` lines;
    - the `.txt` has a hashed `name==version` pin for each of them.
  - **The editable install:**
    `uv pip install --no-config --verify-hashes --only-binary :all: --build-constraints ../../security/tooluniverse-build-constraints.txt --no-deps -e .`
    - `--verify-hashes` turns an inherited `UV_NO_VERIFY_HASHES` into an error instead of a silent skip.
    - `--no-config` keeps uv settings from upstream's `pyproject.toml` or a `uv.toml` out of the step.
    - `--only-binary :all:` keeps the build environment to the pinned wheels; the editable itself still builds.
    - The relative path is deliberate: uv 0.11.17 splits `--build-constraints` values on spaces, and the engine
      folder's name has spaces.

The sync line, the runtime lock and the submodule pin are unchanged.

## What uv 0.11.17 does with build-constraint hashes

uv's documentation does not promise this for 0.11.17:
- **0.11.17's `uv help pip install`:** `--build-constraints` constrains versions, and hashes are not mentioned.
- **[pip compatibility](https://docs.astral.sh/uv/pip/compatibility/), "Build constraints":** silent on hashes.
- **[changelogs/0.12.x.md](https://github.com/astral-sh/uv/blob/main/changelogs/0.12.x.md), 0.12.16 (2026-09-17):**
  the first entry: "Allow `build-constraint-dependencies` entries to include hashes for verifying downloaded build
  dependencies" ([#21467](https://github.com/astral-sh/uv/pull/21467); "Build dependencies without supplied hashes
  remain allowed").
- **[CHANGELOG.md](https://github.com/astral-sh/uv/blob/main/CHANGELOG.md), 0.13.0, preview:**
  `--require-build-hashes` adds the require mode ([#21411](https://github.com/astral-sh/uv/pull/21411)).

So it was tested, on 0.11.17, against a throwaway project with the same build requirements and a scratch cache per test:

| Constraints | Result |
|---|---|
| All 3 pins, right hashes | builds |
| All 3 wrong, or only the transitive packaging wrong | `Hash mismatch`, and the build backend is never called |
| setuptools only | builds, with wheel and packaging **unchecked**; hence the guard |
| `--no-verify-hashes` or `UV_NO_VERIFY_HASHES=1` | builds: the check is **silently off**; hence `--verify-hashes` (with it, rc 2) |
| `--require-hashes` on the editable | refused: hash-checking mode does not take editables |
| The wheel's hash wrong, the sdist's right | builds **from the pinned sdist**; with `--only-binary :all:`, `Hash mismatch` |

The sync's `--require-hashes` still holds under `UV_NO_VERIFY_HASHES=1`. uv 0.11.17 rebuilds an editable on every
install, even when its cache holds an earlier build, so every run of the script goes through the hashed build
environment.

## Proof

Everything ran from the worktree's engine folder.
- **Submodule:** a local clone of `.git/modules/trevor-robey-inc-agents/vendor/tooluniverse` at `f2006162`. Nothing
  was fetched from GitHub.
- **Engine dependencies:** `npm ci --offline --ignore-scripts`.
- **The old script** ran with `UV_OFFLINE=1`, so its unpinned step could use only cached files.

| Check | Old script (`c8cc889`) | New script |
|---|---|---|
| Build environment | setuptools 84.2.1, wheel 0.48.0, packaging 26.3, unchecked | the same three, each `py3-none-any.whl`, hash-checked |
| `uv pip freeze` | 107 entries | **identical, entry for entry** (3 fresh runs) |
| Editable files (dist-info, `.pth`, 10 console scripts), site-packages listing | sha256 recorded | **byte-identical** |
| `from tooluniverse import ToolUniverse` / tools loaded | OK / 2,719 | OK / 2,719 |

Negative tests on the final script. Each tampered file was restored afterwards and checked by sha256.

| Tampered input | Result |
|---|---|
| One digit changed in setuptools' wheel hash | rc 1, `Hash mismatch for setuptools==84.2.1`: expected `…589c3`, computed `ca140b45…589c2` |
| `.in` lists `setuptools-scm`, which the submodule does not declare | rc 1 before the sync; venv untouched |
| `.txt` pins wheel without hashes | rc 1 before the sync; venv untouched |
| `UV_NO_VERIFY_HASHES=1` in the environment | rc 2, `'--verify-hashes' cannot be used with '--no-verify-hashes'` |

A refusal at the build step comes after the sync, so it leaves the venv without the editable until the cause is
fixed. Any failed build leaves that same state.

| Gate | Before | After |
|---|---|---|
| `npm test` (no `--test-force-exit`) | 1439 tests: 1438 pass, 0 fail, 1 skipped (178 suites) | the same |
| `npm run phase29:verify` | ALL CHECKS PASSED, 58/58 | the same |
| `npm run secrets:verify` | "Secret scan passed via ripgrep regex" | the same |
| `npm run build:verify` | "Deterministic build verification passed" | the same |

The skip is the usual one: run #7's sealed release is not on a fresh worktree. The engine's suites use stubs, not the
venv, so the venv checks above are the functional proof.

## Pins

| Package | Pin | Newest on PyPI | Released | OSV | Attestation |
|---|---|---|---|---|---|
| setuptools | 84.2.1 | yes | 2026-10-20 | 0 | none (PyPI 404) |
| wheel | 0.48.0 | yes | 2026-08-11 | 0 | `pypa/wheel` `publish.yml`, env `release` |
| packaging | 26.3 | yes | 2026-08-04 | 0 | `pypa/packaging` `publish.yml`, env `pypi` |

- The production editable's `WHEEL` file reads `Generator: setuptools (84.2.1)`.
- packaging 26.3 carries the same two hashes as the runtime lock.

## Regenerate

After moving the submodule pin, or to move a build pin:
1. Copy the submodule's `[build-system] requires` into `security/tooluniverse-build-constraints.in`.
2. From the engine folder, run:

   ```bash
   uv pip compile security/tooluniverse-build-constraints.in --python 3.12 --no-build --generate-hashes -o security/tooluniverse-build-constraints.txt
   ```

   Existing pins are kept as preferences; use `-P name==version` to move one.
3. Check the new hashes against PyPI and OSV, as for the runtime lock.
4. Run the script on a fresh venv and compare `uv pip freeze`.

## Rollback

- **Before landing:** remove the worktree and the branch.
- **After landing:** revert this commit and re-run the script. The venv's contents are the same either way.

## Not deployed by this commit

The production venv is rebuilt only when `setup-tooluniverse.sh` next runs from main's engine folder. The first run
re-downloads the setuptools and wheel wheels to check their hashes, because their cached copies came from the old,
unhashed build. Park a copy of the venv first (`cp -cR`), as for the advisory re-sync.

## Found on the way (no change made)

- **uv ≥ 0.13.0 `--require-build-hashes`** (preview) would make an unlisted build dependency fail natively, without
  the guard. It needs a uv upgrade on this Mac, which is its own decision.
- **Shared uv cache:** test N1 left a setuptools 84.2.1 built from its pinned sdist in the cache. It is unused:
  `--only-binary :all:` never picks it, which was checked on a cache holding one.
