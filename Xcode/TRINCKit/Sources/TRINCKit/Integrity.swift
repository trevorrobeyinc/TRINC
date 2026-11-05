import CryptoKit
import Foundation

/// `manifest.json` at the root of a sealed delivery bundle: every file with its SHA-256,
/// written by the engine's packager when the bundle was sealed (schema `phase19-release-manifest-v1`).
public struct ReleaseManifest: Codable, Sendable {
    public struct FileEntry: Codable, Sendable, Hashable {
        public let file: String
        public let sha256: String
    }

    public let schemaVersion: String?
    public let files: [FileEntry]

    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version"
        case files
    }
}

/// The result of recomputing every fingerprint the manifest lists.
public struct IntegrityReport: Sendable {
    public enum Status: Sendable, Equatable {
        case match
        case mismatch(actual: String)
        case missing
    }

    public struct Row: Sendable, Identifiable {
        public var id: String { file }
        public let file: String
        public let expected: String
        public let status: Status
    }

    public let rows: [Row]
    /// Files present in the bundle that the manifest does not list (the manifest itself and
    /// `checksums.txt` are excluded: they describe the fingerprints rather than carry content).
    public let uncovered: [String]

    public var matched: Int { rows.filter { $0.status == .match }.count }
    public var mismatched: Int { rows.filter { if case .mismatch = $0.status { return true }; return false }.count }
    public var missing: Int { rows.filter { $0.status == .missing }.count }
    /// True only when the manifest listed at least one file and every listed file matched.
    public var isIntact: Bool { !rows.isEmpty && matched == rows.count }
}

public enum IntegrityVerifier {
    public static let describingFiles: Set<String> = ["manifest.json", "checksums.txt"]

    public static func sha256Hex(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    public static func verify(_ snapshot: BundleSnapshot, against manifest: ReleaseManifest) -> IntegrityReport {
        var listed = Set<String>()
        let rows = manifest.files.map { entry -> IntegrityReport.Row in
            listed.insert(entry.file)
            guard let data = snapshot.files[entry.file] else {
                return .init(file: entry.file, expected: entry.sha256, status: .missing)
            }
            let actual = sha256Hex(data)
            let status: IntegrityReport.Status = actual == entry.sha256.lowercased() ? .match : .mismatch(actual: actual)
            return .init(file: entry.file, expected: entry.sha256, status: status)
        }
        let uncovered = snapshot.paths.filter { !listed.contains($0) && !describingFiles.contains($0) }
        return IntegrityReport(rows: rows, uncovered: uncovered)
    }
}
