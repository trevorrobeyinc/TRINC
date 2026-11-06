import Foundation
import Testing
@testable import TRINCKit

/// The engine's real delivered releases, read IN PLACE from the monorepo's
/// `Trevor Robey Intelligence Network Citations/workspace/releases/` (run output, gitignored: nothing is
/// copied into this package). Each `offer-…` folder is checked, and so is its `offer-…-export.zip`
/// when present. Set `TRINC_RELEASES_DIR` to read another folder. With no releases on disk (a clean
/// checkout) the suite is skipped.
enum RealReleases {
    static let directory: URL = {
        if let path = ProcessInfo.processInfo.environment["TRINC_RELEASES_DIR"], !path.isEmpty {
            return URL(fileURLWithPath: path, isDirectory: true)
        }
        // #filePath is …/TRINC/Xcode/TRINCKit/Tests/TRINCKitTests/RealReleaseTests.swift
        var repo = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { repo.deleteLastPathComponent() }
        return repo.appendingPathComponent("Trevor Robey Intelligence Network Citations/workspace/releases", isDirectory: true)
    }()

    static let offers: [String] = {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
        return names.filter { name in
            var isDir: ObjCBool = false
            return name.hasPrefix("offer-") && !name.hasSuffix("-export")
                && FileManager.default.fileExists(atPath: directory.appendingPathComponent(name).path, isDirectory: &isDir)
                && isDir.boolValue
        }.sorted()
    }()

    static func folder(_ offer: String) throws -> DeliverableBundle {
        DeliverableBundle(snapshot: try BundleSnapshot.load(folder: directory.appendingPathComponent(offer)))
    }

    static func zip(_ offer: String) throws -> DeliverableBundle? {
        let url = directory.appendingPathComponent("\(offer)-export.zip")
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        return DeliverableBundle(snapshot: try BundleSnapshot.load(zip: Data(contentsOf: url), name: url.lastPathComponent))
    }

    /// Facts about specific releases, read from their files on 2026-11-05. Checked only when that
    /// release is on disk, so discarding a release never breaks the suite.
    struct Expected {
        let decision: DeliveryVerdict.Decision?
        let verified: Int
        let total: Int
        var legacyLayout = false
        var flags: [String] = []
    }

    static let expected: [String: Expected] = [
        // Heart-failure landscape, July 2026: the pre-Q8 layout (flag recorded under block_reasons).
        "offer-2af242bc1548229c102fee55": .init(decision: .deliverWithFlags, verified: 29, total: 34,
                                                legacyLayout: true, flags: ["unchecked_over_threshold"]),
        "offer-9466b46ea592d818549a917f": .init(decision: .deliverWithFlags, verified: 36, total: 47,
                                                flags: ["unchecked_over_threshold"]),
        // June 2026: sealed before the reproducibility manifest existed.
        "offer-bcaf2746298f5280fde747f0": .init(decision: nil, verified: 0, total: 0),
        // NSCLC trial-design benchmarks.
        "offer-3dec35098e8e47e2d0a72012": .init(decision: .deliverWithFlags, verified: 44, total: 50,
                                                flags: ["unchecked_over_threshold"]),
        "offer-7e373eb2de36a7a2e73e7c1c": .init(decision: .deliver, verified: 48, total: 48),
        "offer-2bc4ee4a8cfd54e0a788a0b0": .init(decision: .deliver, verified: 45, total: 45),
        // ALS benchmark, run #7 (2026-11-04): sealed hours BEFORE the attribution check shipped, so it
        // carries no attribution_check although the later live check found 6 misattributed works in it.
        "offer-6e024a207af1d5e62c6a15ef": .init(decision: .deliver, verified: 38, total: 38),
    ]
}

@Suite("Real engine releases (read in place)", .enabled(if: !RealReleases.offers.isEmpty))
struct RealReleaseTests {
    @Test(arguments: RealReleases.offers)
    func theDeliveredFolderVerifiesEndToEnd(offer: String) throws {
        let bundle = try RealReleases.folder(offer)
        #expect(bundle.problems.isEmpty, "\(bundle.problems)")
        #expect(bundle.manifest?.schemaVersion == "phase19-release-manifest-v1")
        #expect(bundle.metadata?.schemaVersion == "phase21-release-metadata-v1")
        #expect(bundle.metadata?.offerId == offer)

        let seal = try #require(bundle.verifySeal())
        #expect(seal.fingerprints.isIntact, "mismatched \(seal.fingerprints.mismatched), missing \(seal.fingerprints.missing)")
        #expect(seal.fingerprints.textMatched == 0, "every engine file so far is valid UTF-8")
        #expect(seal.fingerprints.uncovered.isEmpty, "unexpected files: \(seal.fingerprints.uncovered)")
        #expect(seal.fingerprints.postSeal.contains("release-approval.json"))
        #expect(seal.checksums == .agrees(count: seal.fingerprints.rows.count))
        guard case .matches = seal.approval else {
            Issue.record("\(offer): approval record \(seal.approval)")
            return
        }
        #expect(seal.isIntact)

        if bundle.citations != nil {
            #expect(bundle.ledgerFindings.isEmpty, "\(offer): \(bundle.ledgerFindings)")
            #expect(bundle.verdict?.ships == true, "a release on disk was exported, so it shipped")
        }
        let summary = bundle.citations.map { s in
            "\(s.summary.counts.verified)/\(s.summary.counts.total) \(bundle.verdict?.recordedValue ?? "-") flags \(bundle.verdict?.flags ?? [])"
        } ?? "no ledger"
        print("REAL RELEASE \(offer): \(seal.fingerprints.rows.count) sealed, post-seal \(seal.fingerprints.postSeal.count), \(summary)")
    }

    @Test(arguments: RealReleases.offers)
    func theExportZipHoldsTheSameSealedBytes(offer: String) throws {
        guard let zip = try RealReleases.zip(offer) else { return }
        let folder = try RealReleases.folder(offer)
        #expect(zip.problems.isEmpty)
        let seal = try #require(zip.verifySeal())
        #expect(seal.isIntact)
        #expect(seal.fingerprints.uncovered.isEmpty)
        // The export ZIP is cut before the submission and delivery evidence are recorded.
        #expect(seal.fingerprints.postSeal == ["release-approval.json"])
        for row in seal.fingerprints.rows {
            #expect(zip.snapshot.files[row.file] == folder.snapshot.files[row.file], "\(row.file)")
        }
        #expect(zip.verdict == folder.verdict)
    }

    @Test(arguments: RealReleases.offers)
    func knownFactsHold(offer: String) throws {
        guard let want = RealReleases.expected[offer] else { return }
        let bundle = try RealReleases.folder(offer)
        guard let decision = want.decision else {
            #expect(bundle.citations == nil)
            #expect(bundle.verdict == nil)
            return
        }
        let verdict = try #require(bundle.verdict)
        #expect(verdict.decision == decision)
        #expect(verdict.usesLegacyLayout == want.legacyLayout)
        #expect(verdict.flags == want.flags)
        #expect(verdict.blockReasons.isEmpty)
        let counts = try #require(bundle.citations?.summary.counts)
        #expect(counts.verified == want.verified)
        #expect(counts.total == want.total)
        #expect(bundle.citations?.summary.attributionCheck == nil, "no release on disk was sealed after 2026-11-04")
    }

    @Test func everyCitedTypeInTheReleasesHasARecordPage() throws {
        var types = Set<String>()
        for offer in RealReleases.offers {
            for c in try RealReleases.folder(offer).citations?.citations ?? [] {
                types.insert(c.type)
                #expect(c.registryURL != nil, "\(offer): no record page for \(c.type) \(c.identifier)")
            }
        }
        #expect(types.isSubset(of: ["PMID", "NCT", "DOI", "ChEMBL"]), "\(types)")
    }
}
