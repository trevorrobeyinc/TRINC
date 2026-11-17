import Foundation

/// `deliverables/reproducibility-manifest.json`: the delivery-time re-resolution of every cited
/// identifier against its issuing registry, plus the run's citation-gate record.
///
/// Field names follow the engine's `openclaw-bridge/core/reproducibility-manifest.js`
/// (`buildReproducibilityManifest`). Every field a bundle sealed before a field existed may lack is
/// optional: `flag_reasons` arrived with Q8 (2026-07), `attribution_check` and per-citation
/// `attribution` on 2026-11-04; the retraction screen's `unscreened_ids` and `cited` and
/// `reresolution_completed` with Tier 1 (2026-11-14); per-citation `sections`, `by_section` and
/// `retracted_pmcids` with Tier 2a (2026-11-16).
public struct ReproducibilityManifest: Codable, Sendable {
    public let citations: [Citation]
    public let summary: Summary

    public static func decode(_ data: Data) throws -> ReproducibilityManifest {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(ReproducibilityManifest.self, from: data)
    }

    public struct Counts: Codable, Sendable, Equatable {
        public let total: Int
        public let verified: Int
        public let unresolved: Int
        public let unchecked: Int

        public init(total: Int, verified: Int, unresolved: Int, unchecked: Int) {
            self.total = total
            self.verified = verified
            self.unresolved = unresolved
            self.unchecked = unchecked
        }
    }

    public struct RetractionScreen: Codable, Sendable {
        public let checked: Bool?
        public let retractedDois: [String]?
        public let retractedPmids: [String]?
        /// T2-16: written only when a cited PMCID was found retracted (through the PMID or DOI its
        /// PubMed Central record lists).
        public let retractedPmcids: [String]?
        /// T1-7: the cited DOIs, PMIDs and PMCIDs the screen could not screen, as `TYPE:ID`
        /// ("DOI:10.1/x"). Every manifest the engine has written since carries it, empty or not.
        public let unscreenedIds: [String]?
        /// T1-7: how many DOIs, PMIDs and PMCIDs the report cites, the screen's whole scope.
        public let cited: Int?

        /// Retracted works in all three classes; each one blocks delivery.
        public var retractedCount: Int {
            (retractedDois?.count ?? 0) + (retractedPmids?.count ?? 0) + (retractedPmcids?.count ?? 0)
        }

        /// True when the screen records its coverage (T1-7). Only then does `checked == false` carry
        /// the flag `retraction_screen_incomplete`; an older bundle's incomplete screen carried none.
        public var recordsCoverage: Bool { unscreenedIds != nil }
    }

    public struct GateCrosscheck: Codable, Sendable {
        public let cited: Int?
        public let grounded: Int?
        public let ungrounded: Int?
        public let groundedRatio: Double?
        public let minGroundedRatio: Double?
    }

    public struct Thresholds: Codable, Sendable {
        public let maxUncheckedRatio: Double?
        public let blockOnUnresolved: Bool?
    }

    public struct Environment: Codable, Sendable {
        public let offline: Bool?
    }

    public struct Summary: Codable, Sendable {
        public let reportId: String?
        public let deliveryId: String?
        public let resolverTableVersion: String?
        public let asOf: String?
        public let verificationStartedAt: String?
        public let verificationCompletedAt: String?
        /// Every row of the ledger. Since T2-6 that includes the NCT numbers the graveyard memo and the
        /// design benchmark list, so the report's own figures are `reportCounts`.
        public let counts: Counts
        public let byType: [String: Counts]?
        /// T2-6: the same counts per deliverable (`report`, `graveyard-memo`, `design-benchmark`), an
        /// identifier in two deliverables counted in each. Present only when the engine tagged rows.
        public let bySection: [String: Counts]?
        public let verifiedRatio: Double?
        public let deliveryDecision: String?
        public let blockReasons: [String]?
        public let flagReasons: [String]?
        public let retractionScreen: RetractionScreen?
        public let gateCrosscheck: GateCrosscheck?
        public let thresholds: Thresholds?
        public let environment: Environment?
        public let attributionCheck: AttributionCheck?
        /// T1-8: false only on the fallback manifest the engine seals when its re-resolution pass
        /// crashed (no identifier was looked up); the engine's delivery tools refuse that bundle.
        public let reresolutionCompleted: Bool?

        /// True when the engine recorded per-deliverable counts (T2-6).
        public var isSectioned: Bool { !(bySection ?? [:]).isEmpty }

        /// The report's own counts, read the way the engine's packager reads them: `by_section.report`
        /// when the manifest records per-deliverable counts, otherwise `counts` (every row was the report's).
        public var reportCounts: Counts {
            guard let bySection, !bySection.isEmpty else { return counts }
            return bySection[Deliverables.report] ?? .init(total: 0, verified: 0, unresolved: 0, unchecked: 0)
        }

        /// The other deliverables' counts in the engine's reading order; empty without per-deliverable counts.
        public var otherDeliverables: [DeliverableCounts] {
            guard let bySection else { return [] }
            return Deliverables.inReadingOrder(bySection.keys.filter { $0 != Deliverables.report })
                .compactMap { name in bySection[name].map { DeliverableCounts(section: name, counts: $0) } }
        }

        /// The manifest records the fields the engine has written since Tier 1 (2026-11-14), when the
        /// delivery decision also began to be taken on integers (T1-6).
        var writtenSinceTier1: Bool { reresolutionCompleted != nil || retractionScreen?.recordsCoverage == true }
    }
}

/// The deliverables the engine tags each identifier with (T2-6, `workflow-engine.js`).
public enum Deliverables {
    public static let report = "report"
    public static let graveyardMemo = "graveyard-memo"
    public static let designBenchmark = "design-benchmark"

    /// The engine's names in its reading order (`reproducibility-manifest.js` `sectionOrder`); any
    /// other name follows them, alphabetically.
    public static func inReadingOrder<S: Sequence>(_ names: S) -> [String] where S.Element == String {
        let known = [report, graveyardMemo, designBenchmark]
        return Set(names).sorted { a, b in
            let ia = known.firstIndex(of: a) ?? known.count, ib = known.firstIndex(of: b) ?? known.count
            return ia != ib ? ia < ib : a < b
        }
    }
}

/// One deliverable's rows in the ledger (T2-6) and what re-resolution recorded for them.
public struct DeliverableCounts: Sendable, Equatable, Identifiable {
    /// The engine's name for the deliverable, such as `graveyard-memo`.
    public let section: String
    public let counts: ReproducibilityManifest.Counts
    public var id: String { section }

    public init(section: String, counts: ReproducibilityManifest.Counts) {
        self.section = section
        self.counts = counts
    }
}

/// `summary.attribution_check` (engine, 2026-11-04): the author and year a report writes beside each
/// VERIFIED DOI / PMID, compared with the registry record. Present only when the check ran over at
/// least one DOI or PMID, or could not run at all.
public struct AttributionCheck: Codable, Sendable {
    public struct Counts: Codable, Sendable, Equatable {
        public let cited: Int?
        public let checked: Int?
        public let matched: Int?
        public let mismatched: Int?
        public let mismatchedWorks: Int?
        public let notChecked: Int?
    }

    public struct Mismatch: Codable, Sendable, Hashable, Identifiable {
        public let id: String
        public let type: String
        /// `author_mismatch` or `year_mismatch`.
        public let kind: String
        public let written: WrittenAttribution?
        public let registryLabel: String?

        public var key: String { "\(type):\(id)" }
        public var isYearOnly: Bool { kind == "year_mismatch" }
    }

    public let checked: Bool?
    public let counts: Counts?
    public let mismatches: [Mismatch]?
    /// Lines the engine actually marked `[ATTRIBUTION MISMATCH: …]` in the shipped sections.
    public let markedLines: Int?
    /// A fixed reason code when the check could not run (never an exception message).
    public let error: String?

    /// Distinct cited works with a wrong attribution (a "PMID …; doi …" pair counts once).
    public var mismatchedWorks: Int {
        if let n = counts?.mismatchedWorks, n > 0 { return n }
        return mismatches?.count ?? 0
    }
}

/// The byline the report wrote beside an identifier. The engine writes `year` as a number or null;
/// a string year is accepted too, so one odd value never makes the whole ledger unreadable.
public struct WrittenAttribution: Codable, Sendable, Hashable {
    public let name: String?
    public let year: Int?

    public init(name: String?, year: Int?) {
        self.name = name
        self.year = year
    }

    enum CodingKeys: String, CodingKey { case name, year }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name = try? c.decodeIfPresent(String.self, forKey: .name)
        if let n = try? c.decodeIfPresent(Int.self, forKey: .year) {
            year = n
        } else if let s = try? c.decodeIfPresent(String.self, forKey: .year) {
            year = Int(s)
        } else {
            year = nil
        }
    }

    /// "Chio, 2022" — the way the engine's manifest Markdown renders it.
    public var label: String {
        let who = name ?? ""
        guard let year else { return who }
        return who.isEmpty ? String(year) : "\(who), \(year)"
    }
}

/// One cited identifier and what the registry said about it at delivery.
public struct Citation: Codable, Sendable, Hashable, Identifiable {
    /// What the re-resolver recorded besides the status. The engine writes different keys per
    /// registry; only the ones a buyer can use are read.
    public struct Evidence: Codable, Sendable, Hashable {
        /// Why an identifier is UNCHECKED or UNRESOLVED (`rate_limited`, `timeout`, `resource_not_found`, …).
        public let reason: String?
        /// `doi.org-head` when a DOI was confirmed through the doi.org fallback.
        public let resolvedVia: String?
        public let note: String?
        /// ChEMBL, since T2-3: the entity type ChEMBL's id lookup returned (COMPOUND, TARGET, ASSAY, ...).
        public let entityType: String?
        /// ChEMBL, before T2-3: the id echoed by ChEMBL's molecule endpoint, which knows compounds only.
        public let moleculeChemblId: String?

        /// The ChEMBL entity type this record shows, or nil when it shows none.
        public var chemblEntityType: String? {
            if let entityType, !entityType.isEmpty { return entityType.uppercased() }
            return moleculeChemblId == nil ? nil : "COMPOUND"
        }
    }

    /// The per-identifier attribution result (DOI and PMID only).
    public struct Attribution: Codable, Sendable, Hashable {
        /// `match`, `author_mismatch`, `year_mismatch` or `not_checked`.
        public let status: String
        public let reason: String?
        public let written: WrittenAttribution?
        public let registryLabel: String?

        public var isMismatch: Bool { status == "author_mismatch" || status == "year_mismatch" }
    }

    /// The identifier as cited (a PMID, an NCT number, a DOI, ...).
    public let identifier: String
    /// PMID, PMCID, NCT, ISRCTN, EudraCT, DOI, ChEMBL, or a business-lane type such as WEB or SEC.
    public let type: String
    /// VERIFIED, UNRESOLVED or UNCHECKED, exactly as the manifest records it.
    public let status: String
    public let checkedAt: String?
    public let groundedInRun: Bool?
    public let resolverType: String?
    public let httpStatus: Int?
    public let evidence: Evidence?
    public let attribution: Attribution?
    /// T2-6: the deliverables the identifier appears in (`report`, `graveyard-memo`,
    /// `design-benchmark`). Absent on an untagged row, which the engine counts as the report's.
    public let sections: [String]?

    enum CodingKeys: String, CodingKey {
        case identifier = "id"
        case type, status, checkedAt, groundedInRun, resolverType, httpStatus, evidence, attribution, sections
    }

    public init(identifier: String, type: String, status: String, checkedAt: String? = nil,
                groundedInRun: Bool? = nil, resolverType: String? = nil, httpStatus: Int? = nil,
                evidence: Evidence? = nil, attribution: Attribution? = nil, sections: [String]? = nil) {
        self.identifier = identifier
        self.type = type
        self.status = status
        self.checkedAt = checkedAt
        self.groundedInRun = groundedInRun
        self.resolverType = resolverType
        self.httpStatus = httpStatus
        self.evidence = evidence
        self.attribution = attribution
        self.sections = sections
    }

    public var id: String { "\(type):\(identifier)" }
    public var isVerified: Bool { status == "VERIFIED" }
    public var registryURL: URL? {
        Registry.recordURL(type: type, identifier: identifier, chemblEntityType: evidence?.chemblEntityType)
    }
    /// True when the registry lists a different author or year than the report wrote.
    public var hasAttributionMismatch: Bool { attribution?.isMismatch == true }
    /// True when the identifier appears in `section`; an untagged row belongs to the report.
    public func appears(in section: String) -> Bool {
        (sections ?? [Deliverables.report]).contains(section)
    }
}

/// Human-readable record pages for the identifier types the delivery check re-resolves.
/// (The manifest's own `resolved_url` points at machine APIs; a buyer wants the record page.)
public enum Registry {
    /// `chemblEntityType` is what the bundle records about a ChEMBL id (`Citation.Evidence.chemblEntityType`).
    public static func recordURL(type: String, identifier: String, chemblEntityType: String? = nil) -> URL? {
        let id = identifier.trimmingCharacters(in: .whitespaces)
        guard !id.isEmpty else { return nil }
        let upper = id.uppercased()
        switch type.uppercased() {
        case "PMID":
            guard id.allSatisfy(\.isNumber) else { return nil }
            return URL(string: "https://pubmed.ncbi.nlm.nih.gov/\(id)/")
        case "PMCID":
            // The engine's form: "PMC" and 1 to 9 digits (citation-extractor.js).
            guard upper.hasPrefix("PMC"), (4...12).contains(upper.count), digits(upper.dropFirst(3)) else { return nil }
            return URL(string: "https://pmc.ncbi.nlm.nih.gov/articles/\(upper)/")
        case "ISRCTN":
            guard upper.hasPrefix("ISRCTN"), upper.count == 14, digits(upper.dropFirst(6)) else { return nil }
            return URL(string: "https://www.isrctn.com/\(upper)")
        case "EUDRACT":
            // YYYY-NNNNNN-NN. The EU Clinical Trials Register's search, which lists the trial's protocols.
            let parts = id.split(separator: "-", omittingEmptySubsequences: false)
            guard parts.count == 3, parts.map(\.count) == [4, 6, 2], parts.allSatisfy(digits),
                  parts[0].hasPrefix("19") || parts[0].hasPrefix("20") else { return nil }
            return URL(string: "https://www.clinicaltrialsregister.eu/ctr-search/search?query=\(id)")
        case "NCT":
            guard id.uppercased().hasPrefix("NCT"), id.dropFirst(3).allSatisfy(\.isNumber) else { return nil }
            return URL(string: "https://clinicaltrials.gov/study/\(id.uppercased())")
        case "DOI":
            // `.urlPathAllowed` keeps "/" and escapes "?" and "#", which DOIs may contain.
            guard id.hasPrefix("10."),
                  let path = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)
            else { return nil }
            return URL(string: "https://doi.org/\(path)")
        case "CHEMBL":
            // A ChEMBL id may name a compound, a target, an assay or a document, and since T2-3 the
            // engine resolves every kind. Only a compound's record page is linked, and only when the
            // bundle shows the id is one; any other id gets no link rather than a wrong page.
            guard chemblEntityType?.uppercased() == "COMPOUND",
                  upper.hasPrefix("CHEMBL"), upper.count > 6, upper.dropFirst(6).allSatisfy(\.isNumber) else { return nil }
            return URL(string: "https://www.ebi.ac.uk/chembl/explore/compound/\(upper)")
        default:
            return nil
        }
    }

    private static func digits(_ text: Substring) -> Bool {
        !text.isEmpty && text.allSatisfy { $0.isASCII && $0.isNumber }
    }
}
