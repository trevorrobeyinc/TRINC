# Xcode for TRINC — the buyer app's decision record (2026-11-05)

Status: **applied 2026-11-05** on the operator's word ("apply it … create 'Trevor Robey Intelligence Network
Citations' project from the monorepo and help me create an app for buyers").

**Business only (2026-11-05, evening).** The security side of the Xcode setup moved to `~/Security Everything/xcode-agent/` on
the operator's word, because security stays out of the business monorepo. That covers:
- the rules for Xcode's built-in Claude Agent and their installer;
- the checks on that agent, on TRINC's MCP approvals as it sees them, and on Xcode's unsafe modes;
- the checks that hold the buyer app offline (sandbox, network entitlement, networking-API scan);
- the record behind them.

Run them with `bash "/Users/myhome/Security Everything/xcode-agent/check-trinc-xcode.sh"`. This record keeps the app,
how it is built and tested, and what it reads.

## 1 · Decisions

| # | Decision | Who | Reverses |
|---|---|---|---|
| X1 | **An Xcode project exists**: `Xcode/Trevor Robey Intelligence Network Citations.xcodeproj`, with a buyer app (`TRINCReader`) and its logic package (`Xcode/TRINCKit`). | operator | Claude's earlier recommendation of "no Xcode project yet" (below) |
| X2 | **Claude Code builds the project from its shell** (`xcodebuild`, `swift build`, `swift test`), with every Security Everything hook and gate still on. Nothing to install. | Claude's call, operator-approved | — |
| X3–X5 | Xcode's tools (`xcrun mcpbridge`, not registered in this repo's `.mcp.json`), the rules for Xcode's built-in Claude Agent, and hooks inside it. These are security decisions, recorded in `~/Security Everything/xcode-agent/README.md` since 2026-11-05. | operator-approved | — |
| X6 | **The Xcode setup's security rules and checks live in Security Everything, not here** (2026-11-05). | operator | — |

**The superseded recommendation, kept so it is not rediscovered as a gap.** On 2026-11-05 Claude recommended no
Xcode project yet: TRINC had no Swift code, and its products (citation-traced report bundles, AWS Data Exchange
datasets) reach buyers as files with no app on their side. The operator chose to build a buyer app anyway. The app's
scope was picked to fit that fact: it adds nothing to the delivery path and only helps a buyer read and check what
they already received.

## 2 · The buyer app (TRINCReader)

An offline reader and verifier for what a buyer receives.
- **Opens** the sealed ZIP as delivered, its unzipped folder, or a single `.md` / `.csv`.
- **Report:** renders the Markdown deliverables, with the main report first and the marketplace submission pack last.
  The engine's inline marks (`[ATTRIBUTION MISMATCH: …]`, `[UNVERIFIED]`) are drawn in the caution colour, and the
  document picker says how many attribution marks each document carries.
- **Citations:** opens with the **delivery verdict** (DELIVER / DELIVER_WITH_FLAGS / BLOCK), each flag or block reason
  explained in plain words, and the **attribution check** (the engine's mismatches: what the report says, what the
  registry lists). When a bundle carries no attribution check, the panel says so rather than implying one passed.
  Bundles sealed before Q8 (July 2026) put a shipped report's flag under `block_reasons`; the panel reads it as a flag
  and says why. The app also re-derives the engine's delivery policy from the per-identifier ledger
  (`LedgerCheck`) and names any contradiction. Then every cited identifier with its delivery-time status, why it was
  UNCHECKED, any attribution mismatch, and a link to the record page (PubMed, ClinicalTrials.gov, doi.org, ChEMBL).
- **Seal:** three checks. (1) Every file's SHA-256 against `manifest.json` (schema `phase19-release-manifest-v1`),
  hashed as the engine does (as UTF-8 text). (2) `checksums.txt` agrees with `manifest.json` entry for entry.
  (3) `release-approval.json`'s `hash_of_release_bundle` recomputed from the files in hand. The engine's post-seal
  records (`release-approval.json`, `submission-evidence/`, `delivery-evidence/`) are listed apart from unknown
  files. The tab states the limit: these are consistency checks, not a signature, since the bundle carries no key.
- **Data:** previews CSV datasets with a filter.
- **Samples:** ships the two current proven-SKU samples by reference from
  `Trevor Robey Intelligence Network Citations/workspace/collateral/samples/`; they are not copied.

**Engine formats, checked 2026-11-05 (evening).** Every rule above was read from the engine's code
(`deliverable-packager.js` `finalizeBundle`, `release-approval-manager.js` `computeBundleHash`,
`reproducibility-manifest.js`, `citation-attribution.js`, `scripts/_export-zip-util.js`) and confirmed on all seven
releases on disk:
- each folder and each export ZIP verifies its fingerprints, `checksums.txt` and approval hash;
- the export ZIPs are stored (method 0) with no folder entries, and their sealed bytes equal the folder's;
- three releases ship DELIVER_WITH_FLAGS / `unchecked_over_threshold`, one of them (`offer-2af242…`, July) in the
  pre-Q8 layout; three ship DELIVER; the June release (`offer-bcaf27…`) has no reproducibility manifest;
- no release on disk carries `attribution_check`. Run #7 (`offer-6e024a…`, ALS) was sealed hours before the check
  shipped, so its bundle reads DELIVER although the later live check found 6 misattributed works in it. The app says
  "no attribution check is recorded" for such bundles. Whether to re-issue run #7 is the operator's call.

The hand-written fixture had used a free-text block reason (`"1 unresolved identifier"`) where the engine writes
`unresolved_present`; it now uses the engine's code. The new fixture `engine-flagged` (DELIVER_WITH_FLAGS /
`attribution_mismatch`) is produced by the engine's own functions from synthetic content.

**Offline and read-only by design.** The app has no network entitlement, no URLSession and no listener, so the
HTTPS-only invariant has nothing to cover. It runs in the App Sandbox with read-only access to files the user picks.
Registry links open in the buyer's browser (`Link(destination:)`). No PHI and no accounts. The checks that hold it to
this (sandbox, entitlement, and a scan of `Xcode/TRINCReader/` and `Xcode/TRINCKit/Sources/` for networking APIs)
are security tooling. They live in `~/Security Everything/xcode-agent/` (`check-trinc-xcode.sh`). That scan also
reads comments, so a comment naming a networking API fails it: reword the comment.

**Proven on 2026-11-05 (evening, engine integration):**
- `swift test`: 61 tests in 14 suites pass. The real-release suite reads the seven releases in place (folder and ZIP);
  it is skipped where none are on disk (checked with an empty `TRINC_RELEASES_DIR`).
- The opt-in `TRINC_REAL_BUNDLE` check on `offer-2bc4ee4a…-export.zip`: 22/22 fingerprints, `checksums.txt` agrees,
  approval hash matches, 45/45 VERIFIED, DELIVER, `release-approval.json` listed as a post-seal record.
- A hand-mutation pass over the new rules killed 8 of 8 mutants: the post-seal folders, the UTF-8 text hash, the
  approval-hash domain and JSON escaping, the pre-Q8 reading, the attribution flag, the engine's ratio rounding, and
  the `checksums.txt` fingerprint comparison (that one survived the first pass; a test was added).
- `xcodebuild` builds macOS and generic iOS with no warnings; the macOS build launches with no crash report. The new
  views (verdict panel, seal checks, marks) were not driven by Claude: the app takes files only through its picker,
  and computer use is off. The operator's trial below covers them.

**Proven on 2026-11-05 (morning, first build):**
- `swift test`: 26 tests pass. A hand-mutation pass killed 7 of 8 mutants; the survivor was dead code, now removed.
- The opt-in real-bundle test against the sealed NSCLC export (`offer-2bc4ee4a…-export.zip`):
  - 25 files, all 22 sealed fingerprints match, 45/45 VERIFIED, decision DELIVER;
  - `release-approval.json` is reported as not covered, because it is written after sealing.
- `xcodebuild` builds macOS (ad hoc signed) and generic iOS (unsigned).
- The macOS app launches and runs with no crash report.

**Before any buyer gets it (the operator's decisions, none taken):**
- An Apple Developer Program membership (a paid account in the business's name).
- A signing team set in Xcode.
- For a Mac copy: Developer ID signing plus notarization. For iPhone/iPad: TestFlight or the App Store.
- An app icon. The brand's IBM Plex fonts are not bundled; the app uses the system font with monospaced identifiers.
- A `brand-check` pass on the final copy and the `first-sale-gate`. All customer-facing strings are in
  `Xcode/TRINCReader/Brand.swift`, including the verdict, reason, seal and attribution explanations added on
  2026-11-05 (evening), which no brand pass has read yet.

**Still open after the engine integration (2026-11-05, evening):**
- **[operator, about 2 minutes]** Look at the new views once: open `offer-2af242…-export.zip` (the pre-Q8 flag and the
  legacy note), `offer-2bc4ee4a…-export.zip` (DELIVER and three green seal checks), and the unzipped
  `offer-2bc4ee4a…` folder (its `submission-evidence/` files under "Added after sealing"). To see an attribution
  mismatch, open `Xcode/TRINCKit/Tests/TRINCKitTests/Fixtures/engine-flagged.zip` (synthetic).
- **[operator decision]** Run #7 (`offer-6e024a…`, ALS) shipped as DELIVER before the attribution check existed; the
  later check found 6 misattributed works in it. The app shows "no attribution check recorded" for it; re-running or
  re-issuing it is a business call.
- **[not built]** The app registers no document types, so a buyer cannot double-click a bundle or use "Open With";
  they open it from the app. Adding it is an Info.plist change plus an `onOpenURL` handler.

## 3 · How to build and check it

```bash
cd /Users/myhome/TRINC/Xcode/TRINCKit && swift test
```
```bash
cd /Users/myhome/TRINC/Xcode && xcodebuild build -project "Trevor Robey Intelligence Network Citations.xcodeproj" -scheme TRINCReader -destination 'platform=macOS'
```
```bash
bash /Users/myhome/TRINC/ops/tr-suite/verify.sh
```

`verify.sh` "== Xcode" FAILs when the Xcode project or the Swift package is missing. The security checks of the Xcode
setup run from Security Everything:
```bash
bash "/Users/myhome/Security Everything/xcode-agent/check-trinc-xcode.sh"
```

**Two couplings with that repo.** Xcode's built-in Claude Agent reads this repo's project settings. So:
- A new server in `.mcp.json` or `Copilot-Everything/.mcp.json` must also be added to the agent's rules in
  `~/Security Everything/xcode-agent/`, then redeployed and re-blessed. That repo's checker FAILs until it is.
- This repo's machine-local `.claude/settings.local.json` keeps `enableAllProjectMcpServers` false and lists its
  servers in `enabledMcpjsonServers`.

## 4 · Host traps met while building it

- **Never build or run from `/tmp`.** A launch from the session scratchpad (`/private/tmp/...`) was refused with "Launchd
  job spawn failed"; this host blocks execution there. Use Xcode's default DerivedData.
- **The shared scheme runs and tests without the debugger** ("Debug executable" off), because attaching `lldb` fires
  Falcon Custom-IOA rule 240 (the SIP-off compensating group). Turn it on in Edit Scheme only when needed, and expect
  that detection.
- The package's tests are not reachable from the app's scheme (a hand-written reference to the package test target did
  not resolve). Run them with `swift test`, or open `Xcode/TRINCKit/Package.swift` in Xcode and press Cmd-U.
- Build products (DerivedData) are machine state and stay out of the repo.

## 5 · Rollback

`git rm -r Xcode ops/xcode` and remove the `xcode` entry from `ops/tr-suite/manifest.json`. The security side has its
own rollback in `~/Security Everything/xcode-agent/README.md`.

## 6 · Measured facts behind these decisions (recon 2026-11-05)

The side session's recon note is kept verbatim, uncommitted on purpose (TRINC keeps exploration reports out of git), at
`.archive/xcode/xcode-trinc-recon-2026-11-05.md`. Its security findings are in Security Everything
(`xcode-agent/README.md`, `docs/toolchain-audit-2026-11-05.md` and `mcp-gates/XCODE-LANE.md`).

**Install and toolchain**
- Xcode 27.2 (27B52), App Store, at `/Applications/Xcode.app`; `xcode-select -p` points there; first-launch setup
  done.
- Swift 6.4.2 with `sourcekit-lsp`. SDKs for macOS, iOS, tvOS, watchOS, visionOS and DriverKit 27.2.
- **No simulator runtime installed** (`xcrun simctl list runtimes` is empty), so the iPhone/iPad build runs only on a
  device until one is downloaded (several GB). Developer Mode is off.
- Before 2026-11-05 TRINC tracked no Swift at all; the engine is Node.

**Superseded reading, so it is not re-derived:** "No Xcode project yet" was recommended, then overruled by the
operator (X1).
