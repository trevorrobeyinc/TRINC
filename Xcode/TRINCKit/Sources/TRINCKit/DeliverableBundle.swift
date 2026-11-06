import Foundation

/// `metadata.json` at the root of a sealed bundle (schema `phase21-release-metadata-v1`; only the
/// fields a buyer needs).
public struct BundleMetadata: Codable, Sendable {
    public let schemaVersion: String?
    public let offerTitle: String?
    public let productLine: String?
    public let tier: String?
    public let offerId: String?
}

/// A delivery bundle as the buyer app presents it: the documents, the datasets, the citation
/// ledger and the seal (manifest), all read from one in-memory snapshot.
public struct DeliverableBundle: Sendable, Identifiable {
    public let id: UUID
    public let snapshot: BundleSnapshot
    public let manifest: ReleaseManifest?
    public let metadata: BundleMetadata?
    public let citations: ReproducibilityManifest?
    /// Markdown documents, the main report first.
    public let documents: [String]
    /// CSV datasets.
    public let datasets: [String]
    /// Parts that were present but could not be read, in plain words.
    public let problems: [String]
    /// True for the bundled sales samples (no seal, no ledger by design).
    public let isSample: Bool

    static let documentOrder = [
        "report.md", "citation-integrity.md", "search-coverage.md", "graveyard-memo.md",
        "design-benchmark.md", "reproducibility-manifest.md", "evidence-appendix.md",
    ]

    public init(snapshot: BundleSnapshot, isSample: Bool = false) {
        self.id = UUID()
        self.snapshot = snapshot
        self.isSample = isSample
        var problems: [String] = []

        func json<T: Decodable>(_ type: T.Type, at path: String, snake: Bool) -> T? {
            guard let data = snapshot.files[path] else { return nil }
            let decoder = JSONDecoder()
            if snake { decoder.keyDecodingStrategy = .convertFromSnakeCase }
            do { return try decoder.decode(T.self, from: data) } catch {
                problems.append("\(path) is present but could not be read.")
                return nil
            }
        }

        self.manifest = json(ReleaseManifest.self, at: "manifest.json", snake: false)
        self.metadata = json(BundleMetadata.self, at: "metadata.json", snake: true)
        self.citations = json(ReproducibilityManifest.self, at: "deliverables/reproducibility-manifest.json", snake: true)

        let paths = snapshot.paths
        self.documents = paths
            .filter { $0.lowercased().hasSuffix(".md") }
            .sorted { a, b in
                let ra = Self.documentRank(a), rb = Self.documentRank(b)
                return ra != rb ? ra < rb : a < b
            }
        self.datasets = paths.filter { $0.lowercased().hasSuffix(".csv") }
        self.problems = problems
    }

    /// The named deliverables first (in `documentOrder`), then the rest of `deliverables/`, then
    /// the bundle root (release notes), then everything else (the marketplace submission pack).
    static func documentRank(_ path: String) -> Int {
        let name = (path as NSString).lastPathComponent
        if path.hasPrefix("deliverables/") || !path.contains("/") {
            if let named = documentOrder.firstIndex(of: name) { return named }
        }
        if path.hasPrefix("deliverables/") { return 100 }
        if !path.contains("/") { return 200 }
        return 300
    }

    /// The delivery decision, read with the engine's policy; nil without a citation ledger.
    public var verdict: DeliveryVerdict? {
        citations.map { DeliveryVerdict(summary: $0.summary) }
    }

    /// Every place the recorded decision disagrees with its own ledger (empty when they agree).
    public var ledgerFindings: [LedgerFinding] {
        citations.map(LedgerCheck.findings(in:)) ?? []
    }

    /// The `[ATTRIBUTION MISMATCH: …]` marks the engine wrote into a document.
    public func attributionMarks(in path: String) -> [String] {
        text(path).map(InlineMarks.attributionMarks(in:)) ?? []
    }

    /// Every seal check: fingerprints, `checksums.txt`, and the approval record's bundle hash.
    public func verifySeal() -> SealReport? {
        guard let manifest else { return nil }
        return SealReport(
            fingerprints: IntegrityVerifier.verify(snapshot, against: manifest),
            checksums: IntegrityVerifier.compareChecksums(snapshot.files["checksums.txt"], with: manifest),
            approval: IntegrityVerifier.checkApproval(snapshot, manifest: manifest)
        )
    }

    /// The title a buyer recognises: the offer title when the bundle carries one.
    public var title: String {
        if let t = metadata?.offerTitle, !t.isEmpty { return t }
        if isSample, let first = documents.first, let heading = firstHeading(of: first) { return heading }
        return snapshot.name
    }

    public func text(_ path: String) -> String? {
        snapshot.files[path].flatMap { String(data: $0, encoding: .utf8) }
    }

    /// Recomputes every fingerprint in `manifest.json`; nil when the bundle carries no manifest.
    public func verifyIntegrity() -> IntegrityReport? {
        manifest.map { IntegrityVerifier.verify(snapshot, against: $0) }
    }

    private func firstHeading(of path: String) -> String? {
        guard let text = text(path) else { return nil }
        for block in MarkdownParser.blocks(from: text) {
            if case .heading(_, let t) = block { return t }
        }
        return nil
    }
}
