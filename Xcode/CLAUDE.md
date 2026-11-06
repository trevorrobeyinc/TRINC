# Xcode/ — rules for agents working here (Claude Code, and Xcode's own Claude Agent)

The Xcode project **"Trevor Robey Intelligence Network Citations"** and the buyer app it builds. The decision record
is [`../ops/xcode/README.md`](../ops/xcode/README.md). The security side (the rules for Xcode's own Claude Agent and
the checks that hold the app offline) lives in `~/Security Everything/xcode-agent/`. The root `CLAUDE.md` still
applies in full.

## Layout

| Path | What it is |
|---|---|
| `Trevor Robey Intelligence Network Citations.xcodeproj` | Hand-maintained project. `TRINCReader/` is a synchronized folder, so a new `.swift` file there needs no project edit. Shared scheme `TRINCReader`. |
| `TRINCReader/` | The SwiftUI app (macOS and iPhone/iPad). All customer-facing copy is in `Brand.swift`. |
| `TRINCKit/` | The logic, as a Swift package: ZIP reader, bundle snapshot, seal checks (fingerprints, `checksums.txt`, the approval record), citation ledger, delivery verdict and attribution check, CSV and Markdown parsing. |
| `TRINCKit/Scripts/make-fixtures.py` | Regenerates the hand-written synthetic fixtures (`bundle/` and four ZIPs from Python's `zipfile`). |
| `TRINCKit/Scripts/make-engine-fixtures.js` | Regenerates `engine-flagged/` and `engine-flagged.zip`: synthetic content, but every format-bearing file written by the engine's own code (manifest builder, attribution annotator, `finalizeBundle`, the export ZIP writer). |
| `Config/TRINCReader-macOS.entitlements` | App Sandbox plus read-only access to files the user picks. Nothing else. |

## Build and test (from Claude Code's shell; no Xcode UI needed)

```bash
cd /Users/myhome/TRINC/Xcode/TRINCKit && swift test
```
```bash
cd /Users/myhome/TRINC/Xcode && xcodebuild build -project "Trevor Robey Intelligence Network Citations.xcodeproj" -scheme TRINCReader -destination 'platform=macOS'
```
```bash
cd /Users/myhome/TRINC/Xcode && xcodebuild build -project "Trevor Robey Intelligence Network Citations.xcodeproj" -scheme TRINCReader -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO
```

**Real releases are tested in place.** `swift test` also reads every delivered release under
`Trevor Robey Intelligence Network Citations/workspace/releases/` (each `offer-…` folder and its `-export.zip`) straight
from the engine's folder, and checks the seal, `checksums.txt`, the approval hash, ZIP-versus-folder bytes, the verdict
and the ledger, plus known facts per release (`RealReleaseTests.swift`). Nothing is copied into the package. Run output
is gitignored, so in a clean checkout that suite is skipped. `TRINC_RELEASES_DIR=<folder>` points it elsewhere;
`TRINC_REAL_BUNDLE=<an offer-…-export.zip>` with `swift test --filter RealBundle` checks one ZIP from anywhere.

Regenerate the fixtures after an engine format change (both are byte-stable, so a diff is the format change):
```bash
/usr/bin/python3 -I /Users/myhome/TRINC/Xcode/TRINCKit/Scripts/make-fixtures.py
```
```bash
node /Users/myhome/TRINC/Xcode/TRINCKit/Scripts/make-engine-fixtures.js
```

## Invariants

- **The app stays offline.** No network entitlement, no URLSession, no listener of any kind; registry links open in
  the buyer's browser. Security Everything's `xcode-agent/check-trinc-xcode.sh` FAILs on a
  `com.apple.security.network.*` entitlement and on any networking API in the app's own Swift sources (`TRINCReader/`,
  `TRINCKit/Sources/`); a comment naming one trips it too.
- **Read-only.** The app never writes the buyer's files and keeps no copies beyond memory.
- **Copy is canon.** The disclosure, tagline, elevator and research-only line in `Brand.swift` are verbatim from the
  brand canon (the `brand-check` skill). "VERIFIED" appears only beside the reproducibility manifest's own VERIFIED
  count. Re-resolution proves a record exists, not that its conclusions are right; say no more than that.
- **Fixtures are synthetic.** Never copy a real run's bundle into the repo: run output is gitignored for a reason.
  Real releases are read in place by the tests; the engine-built fixture has synthetic content in the engine's formats.
- **No new dependencies** (remote Swift packages included) without a recorded `stack-decision`.
- **Bundle format follows the engine.** What the app reads, and where the engine writes it:
  - `manifest.json` (`phase19-release-manifest-v1`) and `checksums.txt` (`<sha256>  <file>`): `finalizeBundle` in
    `openclaw-bridge/monetization/deliverable-packager.js`. The engine fingerprints each file as UTF-8 **text**
    (`sha256(readFileSync(path, "utf8"))`); TRINCKit hashes the same way (`IntegrityVerifier.engineSHA256`).
  - The post-seal records the seal leaves out on purpose: `release-approval.json`, `submission-evidence/`,
    `delivery-evidence/`. `release-approval.json`'s `hash_of_release_bundle` is
    `sha256("phase19-release-bundle-v1|" + JSON.stringify(files))` (`release-approval-manager.js` `computeBundleHash`).
  - `metadata.json` (`phase21-release-metadata-v1`).
  - `deliverables/reproducibility-manifest.json`: `openclaw-bridge/core/reproducibility-manifest.js`, including
    `flag_reasons`, `summary.attribution_check` and per-citation `attribution` (2026-11-04). Bundles sealed before Q8
    (July 2026) record a shipped report's flag under `block_reasons`; `DeliveryVerdict` reads it as a flag. The app
    re-derives the engine's delivery policy from the ledger (`LedgerCheck`) and shows any contradiction.
  - Inline marks in shipped text: `[ATTRIBUTION MISMATCH: registry lists …]` (`citation-attribution.js`) and
    `[UNVERIFIED]` (`citation-gate.js`).

  If the engine changes any of these, update TRINCKit, regenerate both fixtures and run `swift test` (the real-release
  suite included) together.
- **Never build or run from `/tmp`** (the host refuses execution there), and keep the scheme's "Debug executable" off
  unless you need it: `lldb` fires Falcon Custom-IOA rule 240.
- Shipping to buyers needs the operator's Apple Developer Program membership, signing team and notarization. None is set.
