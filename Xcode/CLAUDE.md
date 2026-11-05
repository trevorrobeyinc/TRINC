# Xcode/ — rules for agents working here (Claude Code, and Xcode's own Claude Agent)

The Xcode project **"Trevor Robey Intelligence Network Citations"** and the buyer app it builds. The decision record,
the agent rules and the checks are in [`../ops/xcode/README.md`](../ops/xcode/README.md). The root `CLAUDE.md` still
applies in full.

## Layout

| Path | What it is |
|---|---|
| `Trevor Robey Intelligence Network Citations.xcodeproj` | Hand-maintained project. `TRINCReader/` is a synchronized folder, so a new `.swift` file there needs no project edit. Shared scheme `TRINCReader`. |
| `TRINCReader/` | The SwiftUI app (macOS and iPhone/iPad). All customer-facing copy is in `Brand.swift`. |
| `TRINCKit/` | The logic, as a Swift package: ZIP reader, bundle snapshot, seal check, citation ledger, CSV and Markdown parsing. |
| `TRINCKit/Scripts/make-fixtures.py` | Regenerates the synthetic test fixtures. |
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

The opt-in check against a real sealed bundle: set `TRINC_REAL_BUNDLE=<path to an offer-…-export.zip>` and run
`swift test --filter RealBundle`. Run output is gitignored, so this test never runs in a clean checkout.

## Invariants

- **The app stays offline.** No network entitlement, no URLSession, no listener of any kind; registry links open in
  the buyer's browser. `ops/tr-suite/verify.sh` FAILs on a `com.apple.security.network.*` entitlement.
- **Read-only.** The app never writes the buyer's files and keeps no copies beyond memory.
- **Copy is canon.** The disclosure, tagline, elevator and research-only line in `Brand.swift` are verbatim from the
  brand canon (the `brand-check` skill). "VERIFIED" appears only beside the reproducibility manifest's own VERIFIED
  count. Re-resolution proves a record exists, not that its conclusions are right; say no more than that.
- **Fixtures are synthetic.** Never copy a real run's bundle into the repo: run output is gitignored for a reason.
- **No new dependencies** (remote Swift packages included) without a recorded `stack-decision`.
- **Bundle format follows the engine.** The app reads `manifest.json` (`phase19-release-manifest-v1`),
  `metadata.json` and `deliverables/reproducibility-manifest.json`. If the engine's packager changes them, update
  TRINCKit, the fixtures and the opt-in test together.
- **Never build or run from `/tmp`** (the host refuses execution there), and keep the scheme's "Debug executable" off
  unless you need it: `lldb` fires Falcon Custom-IOA rule 240.
- Shipping to buyers needs the operator's Apple Developer Program membership, signing team and notarization. None is set.
