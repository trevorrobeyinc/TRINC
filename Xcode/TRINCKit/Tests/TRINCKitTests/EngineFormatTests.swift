import Foundation
import Testing
@testable import TRINCKit

// The engine-built fixture (Scripts/make-engine-fixtures.js): every format-bearing file in it was
// written by the engine's own code, so these tests pin the reader to the engine, not to a copy of it.
// Expected values are literals read from the generated files, never the module's constants.

private func fixture(_ name: String) throws -> URL {
    let root = try #require(Bundle.module.url(forResource: "Fixtures", withExtension: nil))
    return root.appendingPathComponent(name)
}

private func flaggedFolder() throws -> DeliverableBundle {
    DeliverableBundle(snapshot: try BundleSnapshot.load(folder: fixture("engine-flagged")))
}

private func flaggedZip() throws -> DeliverableBundle {
    let data = try Data(contentsOf: fixture("engine-flagged.zip"))
    return DeliverableBundle(snapshot: try BundleSnapshot.load(zip: data, name: "engine-flagged.zip"))
}

private let sealedFiles = [
    "deliverables/citation-integrity.md",
    "deliverables/report.md",
    "deliverables/reproducibility-manifest.json",
    "deliverables/reproducibility-manifest.md",
    "metadata.json",
]

@Suite("Engine-built bundle (DELIVER_WITH_FLAGS, attribution_mismatch)")
struct EngineFlaggedTests {
    @Test func theEnginesZipOpensWithTheSameSealedFilesAsTheFolder() throws {
        let folder = try flaggedFolder(), zip = try flaggedZip()
        #expect(folder.problems.isEmpty)
        #expect(zip.problems.isEmpty)
        #expect(zip.snapshot.paths == ["checksums.txt"] + sealedFiles.prefix(4) + ["manifest.json", "metadata.json", "release-approval.json"])
        for path in sealedFiles {
            #expect(folder.snapshot.files[path] == zip.snapshot.files[path], "\(path)")
        }
        #expect(folder.manifest?.schemaVersion == "phase19-release-manifest-v1")
        #expect(folder.metadata?.schemaVersion == "phase21-release-metadata-v1")
        #expect(folder.title == "Fixture flagged benchmark (synthetic)")
    }

    @Test func everySealCheckPassesAndPostSealRecordsAreNamed() throws {
        let folderSeal = try #require(try flaggedFolder().verifySeal())
        #expect(folderSeal.isIntact)
        #expect(folderSeal.fingerprints.rows.map(\.file) == sealedFiles)
        #expect(folderSeal.fingerprints.matched == 5)
        #expect(folderSeal.fingerprints.uncovered.isEmpty)
        #expect(folderSeal.fingerprints.postSeal == ["release-approval.json", "submission-evidence/export-events.json"])
        #expect(folderSeal.checksums == .agrees(count: 5))
        #expect(folderSeal.approval == .matches(approvedAt: "2026-11-05T00:00:00.000Z"))

        let zipSeal = try #require(try flaggedZip().verifySeal())
        #expect(zipSeal.isIntact)
        #expect(zipSeal.fingerprints.postSeal == ["release-approval.json"])
        #expect(zipSeal.approval == .matches(approvedAt: "2026-11-05T00:00:00.000Z"))
    }

    @Test func theVerdictIsAFlaggedDeliveryForAWrongAttribution() throws {
        let bundle = try flaggedFolder()
        let verdict = try #require(bundle.verdict)
        #expect(verdict.decision == .deliverWithFlags)
        #expect(verdict.recordedValue == "DELIVER_WITH_FLAGS")
        #expect(verdict.flags == ["attribution_mismatch"])
        #expect(verdict.blockReasons.isEmpty)
        #expect(!verdict.usesLegacyLayout)
        #expect(verdict.ships == true)
        #expect(verdict.hasAttributionFlag)
        #expect(bundle.ledgerFindings.isEmpty)
        let counts = try #require(bundle.citations?.summary.counts)
        #expect(counts == .init(total: 3, verified: 3, unresolved: 0, unchecked: 0))
    }

    @Test func theAttributionCheckIsReadInFull() throws {
        let ledger = try #require(try flaggedFolder().citations)
        let check = try #require(ledger.summary.attributionCheck)
        #expect(check.checked == true)
        #expect(check.markedLines == 1)
        #expect(check.mismatchedWorks == 1)
        #expect(check.counts?.matched == 1)
        #expect(check.counts?.notChecked == 0)
        let mismatch = try #require(check.mismatches?.first)
        #expect(mismatch.id == "10.0000/fixture.2")
        #expect(mismatch.type == "DOI")
        #expect(mismatch.kind == "author_mismatch")
        #expect(mismatch.written?.label == "Chio, 2022")
        #expect(mismatch.registryLabel == "Feldman et al., 2022")

        let doi = try #require(ledger.citations.first { $0.identifier == "10.0000/fixture.2" })
        #expect(doi.hasAttributionMismatch)
        #expect(doi.attribution?.registryLabel == "Feldman et al., 2022")
        let pmid = try #require(ledger.citations.first { $0.identifier == "00000002" })
        #expect(pmid.attribution?.status == "match")
        #expect(!pmid.hasAttributionMismatch)
        let nct = try #require(ledger.citations.first { $0.type == "NCT" })
        #expect(nct.attribution == nil)
        #expect(nct.httpStatus == 200)
        #expect(nct.resolverType == "primary")
        #expect(ledger.summary.resolverTableVersion == "2026-06-19")
        #expect(ledger.summary.thresholds?.maxUncheckedRatio == 0)
        #expect(ledger.summary.environment?.offline == false)
    }

    @Test func theInlineMarkInTheReportIsFound() throws {
        let bundle = try flaggedFolder()
        #expect(bundle.attributionMarks(in: "deliverables/report.md")
            == ["[ATTRIBUTION MISMATCH: registry lists Feldman et al., 2022]"])
        #expect(bundle.attributionMarks(in: "deliverables/citation-integrity.md").isEmpty)
        #expect(bundle.documents == [
            "deliverables/report.md", "deliverables/citation-integrity.md", "deliverables/reproducibility-manifest.md",
        ])
    }
}

// Fixtures/engine-manifests/ (also from make-engine-fixtures.js): the fields Tier 1 (2026-11-14) and
// Tier 2a (2026-11-16) added, each manifest written by the engine's own builder.

private func engineManifestData(_ name: String) throws -> Data {
    try Data(contentsOf: fixture("engine-manifests/\(name).json"))
}

private func engineManifest(_ name: String) throws -> ReproducibilityManifest {
    try ReproducibilityManifest.decode(engineManifestData(name))
}

/// A bundle holding only that manifest, where a delivered bundle keeps it.
private func manifestBundle(_ data: Data) -> DeliverableBundle {
    DeliverableBundle(snapshot: BundleSnapshot(name: "m", files: ["deliverables/reproducibility-manifest.json": data]))
}

/// The fixture's manifest with `change` applied to its summary.
private func editedSummary(_ name: String, _ change: (inout [String: Any]) throws -> Void) throws -> Data {
    var root = try #require(try JSONSerialization.jsonObject(with: engineManifestData(name)) as? [String: Any])
    var summary = try #require(root["summary"] as? [String: Any])
    try change(&summary)
    root["summary"] = summary
    return try JSONSerialization.data(withJSONObject: root)
}

@Suite("Engine-built manifests (Tier 1 and Tier 2a fields)")
struct EngineManifestTests {
    @Test func theReportsOwnCountsComeFromItsSection() throws {
        let summary = try engineManifest("tagged").summary
        // Every row, the memo's and the benchmark's NCT numbers included.
        #expect(summary.counts == .init(total: 8, verified: 7, unresolved: 0, unchecked: 1))
        #expect(summary.isSectioned)
        #expect(summary.reportCounts == .init(total: 5, verified: 5, unresolved: 0, unchecked: 0))
        #expect(summary.otherDeliverables == [
            DeliverableCounts(section: "graveyard-memo", counts: .init(total: 3, verified: 2, unresolved: 0, unchecked: 1)),
            DeliverableCounts(section: "design-benchmark", counts: .init(total: 2, verified: 2, unresolved: 0, unchecked: 0)),
        ])
        // A manifest without per-deliverable counts: every row is the report's.
        let untagged = try #require(try flaggedFolder().citations?.summary)
        #expect(!untagged.isSectioned)
        #expect(untagged.reportCounts == untagged.counts)
        #expect(untagged.otherDeliverables.isEmpty)
    }

    @Test func eachRowNamesTheDeliverablesItAppearsIn() throws {
        let citations = try engineManifest("tagged").citations
        let shared = try #require(citations.first { $0.identifier == "NCT00000002" })
        #expect(shared.sections == ["report", "graveyard-memo"])
        #expect(shared.appears(in: "report") && shared.appears(in: "graveyard-memo"))
        #expect(!shared.appears(in: "design-benchmark"))
        let memoOnly = try #require(citations.first { $0.identifier == "NCT00000003" })
        #expect(memoOnly.sections == ["graveyard-memo"])
        #expect(!memoOnly.appears(in: "report"))
        #expect(memoOnly.evidence?.reason == "rate_limited")
        #expect(citations.filter { $0.appears(in: "report") }.map(\.type) == ["NCT", "PMID", "PMCID", "ISRCTN", "EudraCT"])
        let untagged = try #require(try flaggedFolder().citations?.citations.first)
        #expect(untagged.sections == nil)
        #expect(untagged.appears(in: "report"))
    }

    @Test func theDecisionStillJudgesEveryRow() throws {
        let bundle = manifestBundle(try engineManifestData("tagged"))
        #expect(bundle.problems.isEmpty)
        let verdict = try #require(bundle.verdict)
        // The report's own five are VERIFIED; the memo's UNCHECKED NCT number forfeits DELIVER all the same.
        #expect(verdict.decision == .deliverWithFlags)
        #expect(verdict.flags == ["unchecked_over_threshold", "retraction_screen_incomplete"])
        #expect(verdict.blockReasons.isEmpty)
        #expect(!verdict.reresolutionIncomplete)
        #expect(verdict.ships == true)
        #expect(bundle.ledgerFindings.isEmpty)
    }

    @Test func theRetractionScreenNamesWhatItCouldNotScreen() throws {
        let summary = try engineManifest("tagged").summary
        let screen = try #require(summary.retractionScreen)
        #expect(screen.checked == false)
        #expect(screen.recordsCoverage)
        #expect(screen.unscreenedIds == ["PMCID:PMC0000002"])
        #expect(screen.cited == 2)
        #expect(screen.retractedPmcids == nil, "written only when a PMCID was found retracted")
        #expect(screen.retractedCount == 0)
        #expect(summary.reresolutionCompleted == true)
    }

    @Test func theNewIdentifierTypesLinkToTheirRecordPages() throws {
        let citations = try engineManifest("tagged").citations
        func link(_ type: String) -> String? { citations.first { $0.type == type }?.registryURL?.absoluteString }
        #expect(link("PMCID") == "https://pmc.ncbi.nlm.nih.gov/articles/PMC0000002/")
        #expect(link("ISRCTN") == "https://www.isrctn.com/ISRCTN00000002")
        #expect(link("EudraCT") == "https://www.clinicaltrialsregister.eu/ctr-search/search?query=2020-000002-02")
    }

    @Test func aRetractedPMCIDBlocks() throws {
        let bundle = manifestBundle(try engineManifestData("retracted-pmcid"))
        let verdict = try #require(bundle.verdict)
        #expect(verdict.decision == .block)
        #expect(verdict.blockReasons == ["retracted_pmcid"])
        #expect(verdict.flags.isEmpty)
        #expect(verdict.ships == false)
        let screen = try #require(bundle.citations?.summary.retractionScreen)
        #expect(screen.retractedPmcids == ["PMC0000003"])
        #expect(screen.retractedCount == 1)
        #expect(bundle.ledgerFindings.isEmpty)
    }

    @Test func aRetractedPMCIDBesideAShippedDecisionIsAContradiction() throws {
        let data = try editedSummary("retracted-pmcid") { summary in
            summary["delivery_decision"] = "DELIVER"
            summary["block_reasons"] = [String]()
        }
        #expect(manifestBundle(data).ledgerFindings == [.shippedWithRetraction(1)])
    }

    @Test func aCrashedReResolutionPassIsNotClearedForDelivery() throws {
        let bundle = manifestBundle(try engineManifestData("crashed-pass"))
        let ledger = try #require(bundle.citations)
        #expect(ledger.summary.reresolutionCompleted == false)
        #expect(ledger.summary.resolverTableVersion == nil)
        #expect(ledger.summary.environment?.offline == false, "a crash is not an offline registry")
        #expect(ledger.citations.allSatisfy { $0.status == "UNCHECKED" && $0.evidence?.reason == "reresolution_error" })
        let verdict = try #require(bundle.verdict)
        // The engine's decision reads DELIVER_WITH_FLAGS; its delivery tools refuse the bundle all the same.
        #expect(verdict.decision == .deliverWithFlags)
        #expect(verdict.flags == ["unchecked_over_threshold"])
        #expect(verdict.reresolutionIncomplete)
        #expect(verdict.ships == false)
        #expect(bundle.ledgerFindings.isEmpty)
    }

    @Test func droppingTheIncompleteScreenFlagIsCaught() throws {
        let data = try editedSummary("tagged") { summary in summary["flag_reasons"] = ["unchecked_over_threshold"] }
        #expect(manifestBundle(data).ledgerFindings == [.missingFlag("retraction_screen_incomplete")])
    }

    @Test func aDeliverablesCountsEditedAwayFromItsRowsAreCaught() throws {
        let data = try editedSummary("tagged") { summary in
            var sections = try #require(summary["by_section"] as? [String: Any])
            sections["graveyard-memo"] = ["total": 3, "verified": 3, "unresolved": 0, "unchecked": 0]
            summary["by_section"] = sections
        }
        #expect(manifestBundle(data).ledgerFindings == [.sectionCountsDisagree(
            section: "graveyard-memo",
            recorded: .init(total: 3, verified: 3, unresolved: 0, unchecked: 0),
            tallied: .init(total: 3, verified: 2, unresolved: 0, unchecked: 1))])
    }
}

@Suite("Seal cross-checks catch edits the fingerprints alone would not explain")
struct SealCrossCheckTests {
    @Test func anEditedChecksumsFileDisagreesWithTheManifest() throws {
        var files = try flaggedFolder().snapshot.files
        let raw = try #require(files["checksums.txt"])
        let text = try #require(String(data: raw, encoding: .utf8))
        let edited = text.replacingOccurrences(of: "  metadata.json\n", with: "  metadata-renamed.json\n")
        #expect(edited != text)
        files["checksums.txt"] = Data(edited.utf8)
        let seal = try #require(DeliverableBundle(snapshot: BundleSnapshot(name: "c", files: files)).verifySeal())
        #expect(seal.fingerprints.isIntact)
        #expect(!seal.isIntact)
        #expect(seal.checksums == .disagrees([
            "metadata.json is in manifest.json but not in checksums.txt",
            "metadata-renamed.json is in checksums.txt but not in manifest.json",
        ]))
    }

    @Test func aMissingChecksumsFileIsShownButNotCountedAgainstTheSeal() throws {
        var files = try flaggedFolder().snapshot.files
        files["checksums.txt"] = nil
        let seal = try #require(DeliverableBundle(snapshot: BundleSnapshot(name: "c", files: files)).verifySeal())
        #expect(seal.checksums == .absent)
        #expect(seal.isIntact)
    }

    @Test func aFileReSealedByHandStillFailsTheApprovalRecord() throws {
        // Change report.md AND rewrite manifest.json + checksums.txt to match: the fingerprints pass,
        // but the approval record still holds the hash of the files the operator approved.
        var files = try flaggedFolder().snapshot.files
        let changed = Data("# A different report\n".utf8)
        files["deliverables/report.md"] = changed
        let bundle = DeliverableBundle(snapshot: BundleSnapshot(name: "r", files: files))
        let manifest = try #require(bundle.manifest)
        let resealed = ReleaseManifest(schemaVersion: manifest.schemaVersion, files: manifest.files.map {
            $0.file == "deliverables/report.md" ? .init(file: $0.file, sha256: IntegrityVerifier.sha256Hex(changed)) : $0
        })
        let fingerprints = IntegrityVerifier.verify(bundle.snapshot, against: resealed)
        #expect(fingerprints.isIntact)
        guard case .differs = IntegrityVerifier.checkApproval(bundle.snapshot, manifest: resealed) else {
            Issue.record("the approval record should no longer match")
            return
        }
    }

    @Test func aMissingSealedFileLeavesTheApprovalHashIncomplete() throws {
        var files = try flaggedFolder().snapshot.files
        files["metadata.json"] = nil
        let seal = try #require(DeliverableBundle(snapshot: BundleSnapshot(name: "m", files: files)).verifySeal())
        #expect(seal.approval == .incomplete)
        #expect(seal.fingerprints.missing == 1)
        #expect(!seal.isIntact)
    }

    @Test func anUnreadableApprovalRecordIsAProblem() throws {
        var files = try flaggedFolder().snapshot.files
        files["release-approval.json"] = Data("{}".utf8)
        let seal = try #require(DeliverableBundle(snapshot: BundleSnapshot(name: "u", files: files)).verifySeal())
        #expect(seal.approval == .unreadable)
        #expect(!seal.isIntact)
    }

    @Test func aDecisionEditedToFullStrengthContradictsItsOwnLedger() throws {
        var files = try flaggedFolder().snapshot.files
        let path = "deliverables/reproducibility-manifest.json"
        let raw = try #require(files[path])
        let text = try #require(String(data: raw, encoding: .utf8))
        let edited = text
            .replacingOccurrences(of: "\"delivery_decision\": \"DELIVER_WITH_FLAGS\"", with: "\"delivery_decision\": \"DELIVER\"")
            .replacingOccurrences(of: "\"flag_reasons\": [\n      \"attribution_mismatch\"\n    ]", with: "\"flag_reasons\": []")
        #expect(edited.contains("\"delivery_decision\": \"DELIVER\""))
        #expect(edited.contains("\"flag_reasons\": []"))
        files[path] = Data(edited.utf8)
        let bundle = DeliverableBundle(snapshot: BundleSnapshot(name: "d", files: files))
        #expect(bundle.verdict?.decision == .deliver)
        #expect(bundle.ledgerFindings == [.missingFlag("attribution_mismatch")])
        #expect(bundle.verifySeal()?.isIntact == false)
    }
}
