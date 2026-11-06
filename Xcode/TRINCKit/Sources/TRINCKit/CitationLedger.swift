import Foundation

/// `deliverables/reproducibility-manifest.json`: the delivery-time re-resolution of every cited
/// identifier against its issuing registry, plus the run's citation-gate record.
///
/// Field names follow the engine's `openclaw-bridge/core/reproducibility-manifest.js`
/// (`buildReproducibilityManifest`). Every field a bundle sealed before a field existed may lack is
/// optional: `flag_reasons` arrived with Q8 (2026-07), `attribution_check` and per-citation
/// `attribution` on 2026-11-04.
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
        public let counts: Counts
        public let byType: [String: Counts]?
        public let verifiedRatio: Double?
        public let deliveryDecision: String?
        public let blockReasons: [String]?
        public let flagReasons: [String]?
        public let retractionScreen: RetractionScreen?
        public let gateCrosscheck: GateCrosscheck?
        public let thresholds: Thresholds?
        public let environment: Environment?
        public let attributionCheck: AttributionCheck?
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
    /// PMID, NCT, DOI, ChEMBL, or a business-lane type such as WEB or SEC.
    public let type: String
    /// VERIFIED, UNRESOLVED or UNCHECKED, exactly as the manifest records it.
    public let status: String
    public let checkedAt: String?
    public let groundedInRun: Bool?
    public let resolverType: String?
    public let httpStatus: Int?
    public let evidence: Evidence?
    public let attribution: Attribution?

    enum CodingKeys: String, CodingKey {
        case identifier = "id"
        case type, status, checkedAt, groundedInRun, resolverType, httpStatus, evidence, attribution
    }

    public init(identifier: String, type: String, status: String, checkedAt: String? = nil,
                groundedInRun: Bool? = nil, resolverType: String? = nil, httpStatus: Int? = nil,
                evidence: Evidence? = nil, attribution: Attribution? = nil) {
        self.identifier = identifier
        self.type = type
        self.status = status
        self.checkedAt = checkedAt
        self.groundedInRun = groundedInRun
        self.resolverType = resolverType
        self.httpStatus = httpStatus
        self.evidence = evidence
        self.attribution = attribution
    }

    public var id: String { "\(type):\(identifier)" }
    public var isVerified: Bool { status == "VERIFIED" }
    public var registryURL: URL? { Registry.recordURL(type: type, identifier: identifier) }
    /// True when the registry lists a different author or year than the report wrote.
    public var hasAttributionMismatch: Bool { attribution?.isMismatch == true }
}

/// Human-readable record pages for the identifier types the delivery check re-resolves.
/// (The manifest's own `resolved_url` points at machine APIs; a buyer wants the record page.)
public enum Registry {
    public static func recordURL(type: String, identifier: String) -> URL? {
        let id = identifier.trimmingCharacters(in: .whitespaces)
        guard !id.isEmpty else { return nil }
        switch type.uppercased() {
        case "PMID":
            guard id.allSatisfy(\.isNumber) else { return nil }
            return URL(string: "https://pubmed.ncbi.nlm.nih.gov/\(id)/")
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
            // The engine re-resolves ChEMBL ids through the molecule endpoint, so they are compounds.
            let upper = id.uppercased()
            guard upper.hasPrefix("CHEMBL"), upper.count > 6, upper.dropFirst(6).allSatisfy(\.isNumber) else { return nil }
            return URL(string: "https://www.ebi.ac.uk/chembl/explore/compound/\(upper)")
        default:
            return nil
        }
    }
}
