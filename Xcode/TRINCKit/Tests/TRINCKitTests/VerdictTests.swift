import Foundation
import Testing
@testable import TRINCKit

/// A ledger built from inline JSON in the engine's snake_case layout.
private func ledger(_ json: String) throws -> ReproducibilityManifest {
    try ReproducibilityManifest.decode(Data(json.utf8))
}

private func summaryJSON(decision: String?, blocks: String = "[]", flags: String? = "[]",
                         counts: String = #"{"total": 2, "verified": 2, "unresolved": 0, "unchecked": 0}"#,
                         extra: String = "") -> String {
    var fields = [#""counts": \#(counts)"#, #""block_reasons": \#(blocks)"#]
    if let decision { fields.append(#""delivery_decision": "\#(decision)""#) }
    if let flags { fields.append(#""flag_reasons": \#(flags)"#) }
    if !extra.isEmpty { fields.append(extra) }
    return "{" + fields.joined(separator: ", ") + "}"
}

private func citationsJSON(_ statuses: [String]) -> String {
    "[" + statuses.enumerated().map { i, s in
        #"{"id": "0000000\#(i)", "type": "PMID", "status": "\#(s)"}"#
    }.joined(separator: ", ") + "]"
}

@Suite("Delivery verdict")
struct VerdictTests {
    @Test func aPreQ8FlagRecordedAsABlockReasonIsReadAsAFlag() throws {
        // The layout of the July 2026 releases: a shipped report with its flag under block_reasons
        // and no flag_reasons key at all.
        let l = try ledger(#"{"citations": \#(citationsJSON(["VERIFIED", "UNCHECKED"])), "summary": \#(summaryJSON(decision: "DELIVER_WITH_FLAGS", blocks: #"["unchecked_over_threshold"]"#, flags: nil, counts: #"{"total": 2, "verified": 1, "unresolved": 0, "unchecked": 1}"#))}"#)
        let verdict = DeliveryVerdict(summary: l.summary)
        #expect(verdict.decision == .deliverWithFlags)
        #expect(verdict.flags == ["unchecked_over_threshold"])
        #expect(verdict.blockReasons.isEmpty)
        #expect(verdict.usesLegacyLayout)
        #expect(LedgerCheck.findings(in: l).isEmpty)
    }

    @Test func aBlockKeepsItsReasonsAsBlockReasons() throws {
        let l = try ledger(#"{"citations": \#(citationsJSON(["VERIFIED", "UNRESOLVED"])), "summary": \#(summaryJSON(decision: "BLOCK", blocks: #"["unresolved_present"]"#, counts: #"{"total": 2, "verified": 1, "unresolved": 1, "unchecked": 0}"#))}"#)
        let verdict = DeliveryVerdict(summary: l.summary)
        #expect(verdict.decision == .block)
        #expect(verdict.blockReasons == ["unresolved_present"])
        #expect(verdict.flags.isEmpty)
        #expect(!verdict.usesLegacyLayout)
        #expect(verdict.ships == false)
        #expect(LedgerCheck.findings(in: l).isEmpty)
    }

    @Test func unknownAndMissingDecisionsAreNotGuessed() throws {
        let other = try ledger(#"{"citations": [], "summary": \#(summaryJSON(decision: "HOLD", counts: #"{"total": 0, "verified": 0, "unresolved": 0, "unchecked": 0}"#))}"#)
        #expect(DeliveryVerdict(summary: other.summary).decision == .other("HOLD"))
        #expect(DeliveryVerdict(summary: other.summary).ships == nil)
        let none = try ledger(#"{"citations": [], "summary": \#(summaryJSON(decision: nil, counts: #"{"total": 0, "verified": 0, "unresolved": 0, "unchecked": 0}"#))}"#)
        #expect(DeliveryVerdict(summary: none.summary).decision == .unrecorded)
        #expect(DeliveryVerdict(summary: none.summary).recordedValue == nil)
    }
}

@Suite("Ledger agrees with its decision")
struct LedgerCheckTests {
    @Test func aShippedReportWithAnUnresolvedIdIsAContradiction() throws {
        let l = try ledger(#"{"citations": \#(citationsJSON(["VERIFIED", "UNRESOLVED"])), "summary": \#(summaryJSON(decision: "DELIVER", counts: #"{"total": 2, "verified": 1, "unresolved": 1, "unchecked": 0}"#))}"#)
        #expect(LedgerCheck.findings(in: l) == [.shippedWithUnresolved(1)])
    }

    @Test func blockOnUnresolvedSwitchedOffIsRespected() throws {
        let l = try ledger(#"{"citations": \#(citationsJSON(["VERIFIED", "UNRESOLVED"])), "summary": \#(summaryJSON(decision: "DELIVER", counts: #"{"total": 2, "verified": 1, "unresolved": 1, "unchecked": 0}"#, extra: #""thresholds": {"max_unchecked_ratio": 0, "block_on_unresolved": false}"#))}"#)
        #expect(LedgerCheck.findings(in: l).isEmpty)
    }

    @Test func aRetractionOnAShippedReportIsAContradiction() throws {
        let l = try ledger(#"{"citations": \#(citationsJSON(["VERIFIED", "VERIFIED"])), "summary": \#(summaryJSON(decision: "DELIVER", extra: #""retraction_screen": {"checked": true, "retracted_dois": ["10.0000/x"], "retracted_pmids": []}"#))}"#)
        #expect(LedgerCheck.findings(in: l) == [.shippedWithRetraction(1)])
    }

    @Test func fullStrengthWithAnUncheckedIdNeedsTheFlag() throws {
        let l = try ledger(#"{"citations": \#(citationsJSON(["VERIFIED", "UNCHECKED"])), "summary": \#(summaryJSON(decision: "DELIVER", counts: #"{"total": 2, "verified": 1, "unresolved": 0, "unchecked": 1}"#))}"#)
        #expect(LedgerCheck.findings(in: l) == [.missingFlag("unchecked_over_threshold")])
    }

    @Test func beforeTier1TheUncheckedRatioWasRounded() throws {
        // Before T1-6 the engine compared the ratio rounded to three places: 1 of 2,001 reads 0.000,
        // which it did not flag at max_unchecked_ratio 0.
        var statuses = Array(repeating: "VERIFIED", count: 2_000)
        statuses.append("UNCHECKED")
        let l = try ledger(#"{"citations": \#(citationsJSON(statuses)), "summary": \#(summaryJSON(decision: "DELIVER", counts: #"{"total": 2001, "verified": 2000, "unresolved": 0, "unchecked": 1}"#))}"#)
        #expect(LedgerCheck.findings(in: l).isEmpty)
    }

    @Test func sinceTier1AnyUncheckedIdNeedsTheFlag() throws {
        // T1-6 (2026-11-14): decided on integers. A manifest with Tier 1's fields is judged that way.
        var statuses = Array(repeating: "VERIFIED", count: 2_000)
        statuses.append("UNCHECKED")
        let l = try ledger(#"{"citations": \#(citationsJSON(statuses)), "summary": \#(summaryJSON(decision: "DELIVER", counts: #"{"total": 2001, "verified": 2000, "unresolved": 0, "unchecked": 1}"#, extra: #""reresolution_completed": true"#))}"#)
        #expect(LedgerCheck.findings(in: l) == [.missingFlag("unchecked_over_threshold")])
        // A ceiling above 0 is compared on integers too: exactly half is not over 0.5.
        let half = try ledger(#"{"citations": \#(citationsJSON(["VERIFIED", "UNCHECKED"])), "summary": \#(summaryJSON(decision: "DELIVER", counts: #"{"total": 2, "verified": 1, "unresolved": 0, "unchecked": 1}"#, extra: #""reresolution_completed": true, "thresholds": {"max_unchecked_ratio": 0.5, "block_on_unresolved": true}"#))}"#)
        #expect(LedgerCheck.findings(in: half).isEmpty)
    }

    @Test func anIncompleteScreenNeedsItsFlagOnlyWhereTheScreenRecordsItsCoverage() throws {
        // Before T1-7 an incomplete screen (checked false) carried no flag and no coverage fields.
        let before = try ledger(#"{"citations": \#(citationsJSON(["VERIFIED"])), "summary": \#(summaryJSON(decision: "DELIVER", counts: #"{"total": 1, "verified": 1, "unresolved": 0, "unchecked": 0}"#, extra: #""retraction_screen": {"checked": false, "retracted_dois": [], "retracted_pmids": []}"#))}"#)
        #expect(LedgerCheck.findings(in: before).isEmpty)
        let since = try ledger(#"{"citations": \#(citationsJSON(["VERIFIED"])), "summary": \#(summaryJSON(decision: "DELIVER", counts: #"{"total": 1, "verified": 1, "unresolved": 0, "unchecked": 0}"#, extra: #""retraction_screen": {"checked": false, "retracted_dois": [], "retracted_pmids": [], "unscreened_ids": ["DOI:10.0000/x"], "cited": 1}"#))}"#)
        #expect(LedgerCheck.findings(in: since) == [.missingFlag("retraction_screen_incomplete")])
    }

    @Test func countsThatAreNotTheTallyAreReported() throws {
        let l = try ledger(#"{"citations": \#(citationsJSON(["VERIFIED", "UNCHECKED"])), "summary": \#(summaryJSON(decision: "DELIVER_WITH_FLAGS", flags: #"["unchecked_over_threshold"]"#))}"#)
        #expect(LedgerCheck.findings(in: l) == [.countsDisagree(
            recorded: .init(total: 2, verified: 2, unresolved: 0, unchecked: 0),
            tallied: .init(total: 2, verified: 1, unresolved: 0, unchecked: 1))])
    }

    @Test func emptyReasonListsAreContradictions() throws {
        let block = try ledger(#"{"citations": \#(citationsJSON(["VERIFIED"])), "summary": \#(summaryJSON(decision: "BLOCK", counts: #"{"total": 1, "verified": 1, "unresolved": 0, "unchecked": 0}"#))}"#)
        #expect(LedgerCheck.findings(in: block) == [.blockWithoutReason])
        let flagged = try ledger(#"{"citations": \#(citationsJSON(["VERIFIED"])), "summary": \#(summaryJSON(decision: "DELIVER_WITH_FLAGS", counts: #"{"total": 1, "verified": 1, "unresolved": 0, "unchecked": 0}"#))}"#)
        #expect(LedgerCheck.findings(in: flagged) == [.flaggedWithoutReason])
    }
}

@Suite("Engine formats")
struct EngineFormatUnitTests {
    @Test func aFileThatIsNotValidUTF8IsFingerprintedLikeNode() {
        // Node: crypto.createHash("sha256").update(buf.toString("utf8")) for these bytes, measured 2026-11-05.
        let bytes = Data([0x61, 0xFF, 0x62, 0xE2, 0x82, 0x63, 0xF0, 0x9F, 0x98, 0xED, 0xA0, 0x80, 0x64, 0xC0, 0xAF])
        #expect(IntegrityVerifier.engineSHA256(bytes)
            == "fc7b8b13809cea30335725da7ab4f73d5fbf06694a89614cbe9a8ef72f3335b0")
        #expect(IntegrityVerifier.engineSHA256(Data("abc".utf8))
            == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    }

    @Test func aTextSealedFileWithInvalidBytesMatchesAsText() {
        let bytes = Data([0x61, 0xFF, 0x62])
        let manifest = ReleaseManifest(schemaVersion: nil, files: [
            .init(file: "x.md", sha256: IntegrityVerifier.engineSHA256(bytes)),
        ])
        let report = IntegrityVerifier.verify(BundleSnapshot(name: "t", files: ["x.md": bytes]), against: manifest)
        #expect(report.rows.first?.status == .textMatch)
        #expect(report.textMatched == 1)
        #expect(report.isIntact)
    }

    @Test func theApprovalHashMatchesJavaScriptsJSONStringify() {
        // Node: sha256("phase19-release-bundle-v1|" + JSON.stringify(files)), measured 2026-11-05.
        let hash = IntegrityVerifier.bundleHash([
            (file: "a\"b/\u{FC}\\c\u{01}.md", sha256: String(repeating: "0", count: 64)),
            (file: "deliverables/report.md", sha256: String(repeating: "f", count: 64)),
        ])
        #expect(hash == "80672db8b37e099532925e5173c9f2de64d68a97e4ad3366d5e3323bc3adbacb")
    }

    @Test func postSealRecordsAreTheEnginesOwn() {
        #expect(IntegrityVerifier.isPostSealRecord("release-approval.json"))
        #expect(IntegrityVerifier.isPostSealRecord("submission-evidence/ledger.json"))
        #expect(IntegrityVerifier.isPostSealRecord("delivery-evidence/verify-status.json"))
        #expect(!IntegrityVerifier.isPostSealRecord("deliverables/release-approval.json"))
        #expect(!IntegrityVerifier.isPostSealRecord("submission/datarade/checklist.md"))
    }

    @Test func checksumLinesThatAreNotTheEnginesShapeAreNamed() {
        let manifest = ReleaseManifest(schemaVersion: nil, files: [.init(file: "a.md", sha256: String(repeating: "a", count: 64))])
        let text = String(repeating: "a", count: 64) + "  a.md\nnot a checksum line\n"
        #expect(IntegrityVerifier.compareChecksums(Data(text.utf8), with: manifest)
            == .disagrees(["line 2 is not \"<fingerprint>  <file>\""]))
        #expect(IntegrityVerifier.compareChecksums(Data((String(repeating: "A", count: 64) + "  a.md\r\n").utf8), with: manifest)
            == .agrees(count: 1))
    }

    @Test func aChangedFingerprintInChecksumsIsCaught() {
        let manifest = ReleaseManifest(schemaVersion: nil, files: [.init(file: "a.md", sha256: String(repeating: "a", count: 64))])
        let text = String(repeating: "b", count: 64) + "  a.md\n"
        #expect(IntegrityVerifier.compareChecksums(Data(text.utf8), with: manifest)
            == .disagrees(["a.md has a different fingerprint in checksums.txt"]))
    }

    @Test func inlineMarksAreFoundWhole() {
        let text = "x doi: 10.1/a [ATTRIBUTION MISMATCH: registry lists Lee et al., 2020] y\n"
            + "z [ATTRIBUTION MISMATCH: registry lists Kim, 2019] PMID 1 [UNVERIFIED] and [UNVERIFIED]\n"
            + "dangling [ATTRIBUTION MISMATCH: no close"
        #expect(InlineMarks.attributionMarks(in: text) == [
            "[ATTRIBUTION MISMATCH: registry lists Lee et al., 2020]",
            "[ATTRIBUTION MISMATCH: registry lists Kim, 2019]",
        ])
        #expect(InlineMarks.unverifiedCount(in: text) == 2)
    }

    @Test func aWrittenYearMayBeANumberAStringOrNull() throws {
        let decoder = JSONDecoder()
        #expect(try decoder.decode(WrittenAttribution.self, from: Data(#"{"name": "Chio", "year": 2022}"#.utf8)).label == "Chio, 2022")
        #expect(try decoder.decode(WrittenAttribution.self, from: Data(#"{"name": "Chio", "year": "2022"}"#.utf8)).year == 2022)
        #expect(try decoder.decode(WrittenAttribution.self, from: Data(#"{"name": "Chio", "year": null}"#.utf8)).label == "Chio")
    }

    @Test func aChemblIdLinksOnlyWhereTheBundleShowsACompound() throws {
        #expect(Registry.recordURL(type: "ChEMBL", identifier: "CHEMBL5314564", chemblEntityType: "COMPOUND")?.absoluteString
            == "https://www.ebi.ac.uk/chembl/explore/compound/CHEMBL5314564")
        #expect(Registry.recordURL(type: "ChEMBL", identifier: "CHEMBL5314564") == nil)
        #expect(Registry.recordURL(type: "ChEMBL", identifier: "CHEMBL203", chemblEntityType: "TARGET") == nil)
        #expect(Registry.recordURL(type: "ChEMBL", identifier: "CHEMBL", chemblEntityType: "COMPOUND") == nil)
        #expect(Registry.recordURL(type: "ChEMBL", identifier: "CHEMBL12x", chemblEntityType: "COMPOUND") == nil)
        // What each resolver writes: the molecule endpoint (before T2-3) echoes compounds only; the id
        // lookup (T2-3) names the entity type; an UNRESOLVED id carries neither.
        let rows = #"[{"id": "CHEMBL25", "type": "ChEMBL", "status": "VERIFIED", "evidence": {"molecule_chembl_id": "CHEMBL25"}}, "#
            + #"{"id": "CHEMBL25", "type": "ChEMBL", "status": "VERIFIED", "evidence": {"chembl_id": "CHEMBL25", "entity_type": "COMPOUND"}}, "#
            + #"{"id": "CHEMBL203", "type": "ChEMBL", "status": "VERIFIED", "evidence": {"chembl_id": "CHEMBL203", "entity_type": "TARGET"}}, "#
            + #"{"id": "CHEMBL203", "type": "ChEMBL", "status": "UNRESOLVED", "evidence": {"reason": "chembl_404"}}]"#
        let l = try ledger(#"{"citations": \#(rows), "summary": \#(summaryJSON(decision: "BLOCK", blocks: #"["unresolved_present"]"#, counts: #"{"total": 4, "verified": 3, "unresolved": 1, "unchecked": 0}"#))}"#)
        #expect(l.citations.map(\.evidence?.chemblEntityType) == ["COMPOUND", "COMPOUND", "TARGET", nil])
        #expect(l.citations.map { $0.registryURL?.absoluteString } == [
            "https://www.ebi.ac.uk/chembl/explore/compound/CHEMBL25",
            "https://www.ebi.ac.uk/chembl/explore/compound/CHEMBL25",
            nil, nil,
        ])
    }
}
