import Foundation

/// `deliverables/reproducibility-manifest.json`: the delivery-time re-resolution of every cited
/// identifier against its issuing registry, plus the run's citation-gate record.
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

    public struct Summary: Codable, Sendable {
        public let reportId: String?
        public let deliveryId: String?
        public let asOf: String?
        public let counts: Counts
        public let byType: [String: Counts]?
        public let deliveryDecision: String?
        public let blockReasons: [String]?
        public let flagReasons: [String]?
        public let retractionScreen: RetractionScreen?
        public let gateCrosscheck: GateCrosscheck?
    }
}

/// One cited identifier and what the registry said about it at delivery.
public struct Citation: Codable, Sendable, Hashable, Identifiable {
    /// The identifier as cited (a PMID, an NCT number, a DOI, ...).
    public let identifier: String
    /// PMID, NCT, DOI, or a business-lane type such as WEB or SEC.
    public let type: String
    /// VERIFIED, UNRESOLVED or UNCHECKED, exactly as the manifest records it.
    public let status: String
    public let checkedAt: String?
    public let groundedInRun: Bool?

    enum CodingKeys: String, CodingKey {
        case identifier = "id"
        case type, status, checkedAt, groundedInRun
    }

    public var id: String { "\(type):\(identifier)" }
    public var isVerified: Bool { status == "VERIFIED" }
    public var registryURL: URL? { Registry.recordURL(type: type, identifier: identifier) }
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
        default:
            return nil
        }
    }
}
