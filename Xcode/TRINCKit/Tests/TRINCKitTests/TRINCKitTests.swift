import Foundation
import Testing
@testable import TRINCKit

// Expected values are literals measured from the fixtures (Scripts/make-fixtures.py), never the
// module's own constants, so a wrong constant cannot make its own test pass.

private func fixture(_ name: String) throws -> URL {
    let root = try #require(Bundle.module.url(forResource: "Fixtures", withExtension: nil))
    return root.appendingPathComponent(name)
}

private func zipData(_ name: String) throws -> Data {
    try Data(contentsOf: fixture(name))
}

private let bundlePaths = [
    "deliverables/citation-integrity.md",
    "deliverables/report.md",
    "deliverables/reproducibility-manifest.json",
    "deliverables/tables.csv",
    "manifest.json",
    "metadata.json",
]

@Suite("ZIP reader")
struct ZipTests {
    @Test func listsEveryEntryOfADeflatedArchive() throws {
        let archive = try ZipArchive(data: zipData("bundle.zip"))
        #expect(archive.entries.map(\.path).sorted() == bundlePaths)
        #expect(archive.entries.allSatisfy { $0.method == 8 })
    }

    @Test func deflatedAndStoredEntriesMatchTheFolderBytes() throws {
        let folderReport = try Data(contentsOf: fixture("bundle/deliverables/report.md"))
        for name in ["bundle.zip", "bundle-stored.zip"] {
            let archive = try ZipArchive(data: zipData(name))
            let entry = try #require(archive.entry(at: "deliverables/report.md"))
            #expect(try archive.contents(of: entry) == folderReport, "\(name)")
        }
        let stored = try ZipArchive(data: zipData("bundle-stored.zip"))
        #expect(stored.entries.allSatisfy { $0.method == 0 })
    }

    @Test func rejectsSomethingThatIsNotAZip() {
        #expect(throws: ZipError.notAZip) { try ZipArchive(data: Data("plain text, no archive here".utf8)) }
        #expect(throws: ZipError.notAZip) { try ZipArchive(data: Data()) }
    }

    @Test func detectsADamagedEntryByItsChecksum() throws {
        var bytes = [UInt8](try zipData("bundle-stored.zip"))
        let archive = try ZipArchive(data: Data(bytes))
        let entry = try #require(archive.entry(at: "deliverables/report.md"))
        // Flip one byte of the stored payload: local header (30) + name length, then the data.
        let dataStart = entry.localHeaderOffset + 30 + "deliverables/report.md".utf8.count
        bytes[dataStart + 5] ^= 0xFF
        let damaged = try ZipArchive(data: Data(bytes))
        let damagedEntry = try #require(damaged.entry(at: "deliverables/report.md"))
        #expect(throws: ZipError.corrupt("checksum mismatch in deliverables/report.md")) {
            try damaged.contents(of: damagedEntry)
        }
    }

    @Test func crc32MatchesTheStandardCheckValue() {
        #expect(CRC32.checksum(Array("123456789".utf8)) == 0xCBF4_3926)
    }
}

@Suite("Bundle snapshot")
struct SnapshotTests {
    @Test func folderAndZipReadTheSameFiles() throws {
        let folder = try BundleSnapshot.load(folder: fixture("bundle"))
        let zip = try BundleSnapshot.load(zip: zipData("bundle.zip"), name: "bundle.zip")
        #expect(folder.paths == bundlePaths)
        #expect(zip.paths == bundlePaths)
        #expect(folder.files == zip.files)
    }

    @Test func aRezippedBundleLosesItsTopFolder() throws {
        let nested = try BundleSnapshot.load(zip: zipData("bundle-nested.zip"), name: "nested")
        #expect(nested.paths == bundlePaths)
    }

    @Test func hiddenFilesAreSkipped() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("trinckit-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        try Data("x".utf8).write(to: dir.appendingPathComponent(".DS_Store"))
        try Data("# A\n".utf8).write(to: dir.appendingPathComponent("report.md"))
        let snap = try BundleSnapshot.load(folder: dir)
        #expect(snap.paths == ["report.md"])
    }

    @Test func anEmptyFolderIsReportedAsEmpty() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("trinckit-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        #expect(throws: BundleLoadError.empty) { try BundleSnapshot.load(folder: dir) }
    }
}

@Suite("Integrity")
struct IntegrityTests {
    @Test func anUntouchedBundleIsIntact() throws {
        let bundle = DeliverableBundle(snapshot: try BundleSnapshot.load(zip: zipData("bundle.zip"), name: "b"))
        let report = try #require(bundle.verifyIntegrity())
        #expect(report.rows.count == 4)
        #expect(report.matched == 4)
        #expect(report.isIntact)
        #expect(report.uncovered == ["metadata.json"])
    }

    @Test func anEditedFileIsCaught() throws {
        let bundle = DeliverableBundle(snapshot: try BundleSnapshot.load(zip: zipData("tampered.zip"), name: "t"))
        let report = try #require(bundle.verifyIntegrity())
        #expect(!report.isIntact)
        #expect(report.mismatched == 1)
        let edited = try #require(report.rows.first { $0.file == "deliverables/report.md" })
        if case .mismatch = edited.status {} else { Issue.record("report.md should mismatch, got \(edited.status)") }
        #expect(report.matched == 3)
    }

    @Test func aMissingFileIsCaught() throws {
        var files = try BundleSnapshot.load(folder: fixture("bundle")).files
        files["deliverables/tables.csv"] = nil
        let bundle = DeliverableBundle(snapshot: BundleSnapshot(name: "m", files: files))
        let report = try #require(bundle.verifyIntegrity())
        #expect(report.missing == 1)
        #expect(!report.isIntact)
    }

    @Test func anEmptyManifestIsNeverCalledIntact() {
        let report = IntegrityVerifier.verify(BundleSnapshot(name: "e", files: [:]),
                                              against: ReleaseManifest(schemaVersion: nil, files: []))
        #expect(!report.isIntact)
    }

    @Test func sha256HexIsLowercaseAndKnown() {
        #expect(IntegrityVerifier.sha256Hex(Data("abc".utf8))
            == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    }
}

@Suite("Citation ledger")
struct CitationTests {
    @Test func readsTheReproducibilityManifest() throws {
        let data = try Data(contentsOf: fixture("bundle/deliverables/reproducibility-manifest.json"))
        let ledger = try ReproducibilityManifest.decode(data)
        #expect(ledger.citations.count == 3)
        #expect(ledger.citations.filter(\.isVerified).count == 2)
        #expect(ledger.summary.counts == .init(total: 3, verified: 2, unresolved: 1, unchecked: 0))
        #expect(ledger.summary.deliveryDecision == "BLOCK")
        #expect(ledger.summary.byType?["DOI"]?.unresolved == 1)
        #expect(ledger.summary.gateCrosscheck?.groundedRatio == 0.667)
        #expect(ledger.summary.retractionScreen?.checked == true)
        #expect(ledger.citations[0].id == "PMID:00000001")
    }

    @Test func linksGoToTheHumanRecordPage() {
        #expect(Registry.recordURL(type: "PMID", identifier: "00000001")?.absoluteString
            == "https://pubmed.ncbi.nlm.nih.gov/00000001/")
        #expect(Registry.recordURL(type: "NCT", identifier: "nct00000000")?.absoluteString
            == "https://clinicaltrials.gov/study/NCT00000000")
        #expect(Registry.recordURL(type: "DOI", identifier: "10.0000/fixture.1")?.absoluteString
            == "https://doi.org/10.0000/fixture.1")
        #expect(Registry.recordURL(type: "DOI", identifier: "10.0000/a#b")?.absoluteString
            == "https://doi.org/10.0000/a%23b")
    }

    @Test func malformedOrUnknownIdentifiersGetNoLink() {
        #expect(Registry.recordURL(type: "PMID", identifier: "12ab") == nil)
        #expect(Registry.recordURL(type: "NCT", identifier: "NCTXYZ") == nil)
        #expect(Registry.recordURL(type: "DOI", identifier: "fixture") == nil)
        #expect(Registry.recordURL(type: "WEB", identifier: "snapshot-1") == nil)
    }
}

@Suite("CSV")
struct CSVTests {
    @Test func parsesQuotesEscapesAndLineBreaks() throws {
        let table = try CSVTable(data: Data(contentsOf: fixture("bundle/deliverables/tables.csv")))
        #expect(table.header == ["name", "note"])
        #expect(table.rows == [["Alpha, Inc.", "said \"ok\""], ["Gamma", "two\nlines"]])
    }

    @Test func handlesBareLineFeedsAndAByteOrderMark() throws {
        let table = try CSVTable(parsing: "\u{FEFF}a,b\n1,2\n3,\n")
        #expect(table.header == ["a", "b"])
        #expect(table.rows == [["1", "2"], ["3", ""]])
    }

    @Test func reportsAnUnclosedQuote() {
        #expect(throws: CSVError.unterminatedQuote(line: 2)) { try CSVTable(parsing: "a,b\n\"open,2\n") }
    }
}

@Suite("Markdown blocks")
struct MarkdownTests {
    @Test func splitsTheFixtureReportIntoBlocks() throws {
        let text = try String(contentsOf: fixture("bundle/deliverables/report.md"), encoding: .utf8)
        let blocks = MarkdownParser.blocks(from: text)
        #expect(blocks == [
            .heading(level: 1, text: "Fixture Report"),
            .paragraph("**FIXTURE — synthetic test data, not a client deliverable.**"),
            .heading(level: 2, text: "Findings"),
            .paragraph("A paragraph that cites PMID:00000001 and NCT00000000, continued on a second line."),
            .bulletList(["first point", "second point"]),
            .table(header: ["Program", "Phase"], rows: [["Alpha | Beta", "3"], ["Gamma", "2"]]),
            .rule,
            .quote("A quoted note."),
        ])
    }

    @Test func codeFencesAndOrderedListsSurvive() {
        let blocks = MarkdownParser.blocks(from: "1. one\n2) two\n\n```\nlet x = 1\n| not a table\n```\n")
        #expect(blocks == [.orderedList(["one", "two"]), .code("let x = 1\n| not a table")])
    }

    @Test func aHashWithoutASpaceIsNotAHeading() {
        #expect(MarkdownParser.blocks(from: "#hashtag") == [.paragraph("#hashtag")])
    }
}

/// Opt-in check against a real sealed bundle from the engine (its ZIP comes from a different
/// implementation than the fixtures). Run on the Mac with:
///   TRINC_REAL_BUNDLE=/path/to/offer-...-export.zip swift test --filter RealBundle
/// The bundle is gitignored run output, so the test is skipped when the variable is unset.
@Suite("Real bundle (opt-in)", .enabled(if: ProcessInfo.processInfo.environment["TRINC_REAL_BUNDLE"] != nil))
struct RealBundleTests {
    @Test func aSealedEngineBundleOpensAndVerifies() throws {
        let path = try #require(ProcessInfo.processInfo.environment["TRINC_REAL_BUNDLE"])
        let url = URL(fileURLWithPath: path)
        let snapshot = try BundleSnapshot.load(zip: Data(contentsOf: url), name: url.lastPathComponent)
        let bundle = DeliverableBundle(snapshot: snapshot)
        #expect(bundle.problems.isEmpty)
        #expect(bundle.manifest != nil)
        let seal = try #require(bundle.verifySeal())
        let report = seal.fingerprints
        #expect(report.isIntact, "mismatched \(report.mismatched), missing \(report.missing)")
        #expect(seal.isIntact, "checksums \(seal.checksums), approval \(seal.approval)")
        #expect(bundle.ledgerFindings.isEmpty, "\(bundle.ledgerFindings)")
        print("REAL BUNDLE: \(bundle.title) | files \(snapshot.paths.count) | manifest rows \(report.rows.count) "
              + "| intact \(seal.isIntact) | post-seal \(report.postSeal) | uncovered \(report.uncovered) "
              + "| checksums \(seal.checksums) | approval \(seal.approval) "
              + "| citations \(bundle.citations?.summary.counts.verified ?? -1)/\(bundle.citations?.summary.counts.total ?? -1) VERIFIED "
              + "| decision \(bundle.verdict?.recordedValue ?? "-") flags \(bundle.verdict?.flags ?? [])")
    }
}

@Suite("Deliverable bundle")
struct DeliverableBundleTests {
    @Test func presentsTitleDocumentsAndDatasets() throws {
        let bundle = DeliverableBundle(snapshot: try BundleSnapshot.load(folder: fixture("bundle")))
        #expect(bundle.title == "Fixture benchmark (synthetic)")
        #expect(bundle.documents == ["deliverables/report.md", "deliverables/citation-integrity.md"])
        #expect(bundle.datasets == ["deliverables/tables.csv"])
        #expect(bundle.citations?.citations.count == 3)
        #expect(bundle.problems.isEmpty)
    }

    @Test func aBrokenLedgerIsReportedNotHidden() throws {
        var files = try BundleSnapshot.load(folder: fixture("bundle")).files
        files["deliverables/reproducibility-manifest.json"] = Data("{ not json".utf8)
        let bundle = DeliverableBundle(snapshot: BundleSnapshot(name: "x", files: files))
        #expect(bundle.citations == nil)
        #expect(bundle.problems == ["deliverables/reproducibility-manifest.json is present but could not be read."])
    }

    @Test func aSampleTakesItsTitleFromItsFirstHeading() {
        let snap = BundleSnapshot(name: "s.md", files: ["s.md": Data("intro\n\n# Sample Title\n".utf8)])
        #expect(DeliverableBundle(snapshot: snap, isSample: true).title == "Sample Title")
    }
}
