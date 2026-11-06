import CryptoKit
import Foundation

/// `manifest.json` at the root of a sealed delivery bundle: every file with its SHA-256,
/// written by the engine's packager when the bundle was sealed (schema `phase19-release-manifest-v1`).
public struct ReleaseManifest: Codable, Sendable {
    public struct FileEntry: Codable, Sendable, Hashable {
        public let file: String
        public let sha256: String

        public init(file: String, sha256: String) {
            self.file = file
            self.sha256 = sha256
        }
    }

    public let schemaVersion: String?
    public let files: [FileEntry]

    public init(schemaVersion: String?, files: [FileEntry]) {
        self.schemaVersion = schemaVersion
        self.files = files
    }

    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version"
        case files
    }
}

/// `release-approval.json`: the operator's approval record, written AFTER sealing
/// (`release-approval-manager.js`, schema `phase21-release-approval-v1`).
public struct ReleaseApproval: Codable, Sendable {
    public let schemaVersion: String?
    public let offerId: String?
    public let approvedAt: String?
    public let approvedPlatformTargets: [String]?
    public let hashOfReleaseBundle: String?
}

/// The result of recomputing every fingerprint the manifest lists.
public struct IntegrityReport: Sendable {
    public enum Status: Sendable, Equatable {
        case match
        /// Matches only after decoding the file as UTF-8, the way the engine read it when sealing.
        /// The file holds bytes that are not valid UTF-8, so a byte-exact match is not proven.
        case textMatch
        case mismatch(actual: String)
        case missing
    }

    public struct Row: Sendable, Identifiable {
        public var id: String { file }
        public let file: String
        public let expected: String
        public let status: Status
        /// The fingerprint computed with the engine's rule, when the file is present.
        public let actual: String?
    }

    public let rows: [Row]
    /// Records the engine adds to a bundle after sealing it (the approval record and the submission
    /// and delivery evidence). The seal does not cover them, by design.
    public let postSeal: [String]
    /// Every other file that is in the bundle but not listed in the manifest. The seal says
    /// nothing about these; a bundle as the engine wrote it has none.
    public let uncovered: [String]

    public var matched: Int { rows.filter { $0.status == .match || $0.status == .textMatch }.count }
    public var textMatched: Int { rows.filter { $0.status == .textMatch }.count }
    public var mismatched: Int { rows.filter { if case .mismatch = $0.status { return true }; return false }.count }
    public var missing: Int { rows.filter { $0.status == .missing }.count }
    /// True only when the manifest listed at least one file and every listed file matched.
    public var isIntact: Bool { !rows.isEmpty && matched == rows.count }
}

/// `checksums.txt` compared with `manifest.json`. The packager writes both from one list, so any
/// difference means one of them was edited after sealing.
public enum ChecksumsComparison: Sendable, Equatable {
    case agrees(count: Int)
    case disagrees([String])
    case absent
    case unreadable(String)

    public var isProblem: Bool {
        switch self {
        case .agrees, .absent: return false
        case .disagrees, .unreadable: return true
        }
    }
}

/// `release-approval.json`'s `hash_of_release_bundle` recomputed from the files in hand.
public enum ApprovalCheck: Sendable, Equatable {
    /// The sealed files are exactly the set, byte for byte, that the operator approved.
    case matches(approvedAt: String?)
    case differs(expected: String, actual: String)
    /// A file the manifest lists is missing, so the hash cannot be recomputed.
    case incomplete
    case absent
    case unreadable

    public var isProblem: Bool {
        switch self {
        case .differs, .unreadable: return true
        case .matches, .incomplete, .absent: return false
        }
    }
}

/// Every check the app can make on a bundle's seal, from the files alone.
public struct SealReport: Sendable {
    public let fingerprints: IntegrityReport
    public let checksums: ChecksumsComparison
    public let approval: ApprovalCheck

    /// True when every fingerprint matches and neither cross-check found a contradiction. An absent
    /// `checksums.txt` or approval record is shown, not counted against the bundle.
    public var isIntact: Bool { fingerprints.isIntact && !checksums.isProblem && !approval.isProblem }
}

public enum IntegrityVerifier {
    /// Files that describe the seal rather than carry content.
    public static let describingFiles: Set<String> = ["manifest.json", "checksums.txt"]
    /// The engine's post-seal records: excluded from the seal by `finalizeBundle` and from the
    /// approval hash by `collectBundleFiles` (deliverable-packager.js, release-approval-manager.js).
    public static let postSealFiles: Set<String> = ["release-approval.json"]
    public static let postSealFolders = ["submission-evidence/", "delivery-evidence/"]
    /// The domain prefix of the approval record's bundle hash (release-approval-manager.js).
    public static let bundleHashDomain = "phase19-release-bundle-v1|"

    public static func isPostSealRecord(_ path: String) -> Bool {
        postSealFiles.contains(path) || postSealFolders.contains { path.hasPrefix($0) }
    }

    public static func sha256Hex(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    /// The fingerprint as the engine computes it: `sha256(fs.readFileSync(path, "utf8"))`. Node decodes
    /// the bytes as UTF-8 (invalid sequences become U+FFFD) and hashes the re-encoded text, so for a
    /// valid UTF-8 file this is the plain byte hash, and for anything else it is the hash of the
    /// decoded text.
    public static func engineSHA256(_ data: Data) -> String {
        sha256Hex(engineBytes(data))
    }

    static func engineBytes(_ data: Data) -> Data {
        if String(data: data, encoding: .utf8) != nil { return data }
        return Data(String(decoding: data, as: UTF8.self).utf8)
    }

    public static func verify(_ snapshot: BundleSnapshot, against manifest: ReleaseManifest) -> IntegrityReport {
        var listed = Set<String>()
        let rows = manifest.files.map { entry -> IntegrityReport.Row in
            listed.insert(entry.file)
            guard let data = snapshot.files[entry.file] else {
                return .init(file: entry.file, expected: entry.sha256, status: .missing, actual: nil)
            }
            let expected = entry.sha256.lowercased()
            let raw = sha256Hex(data)
            if raw == expected {
                return .init(file: entry.file, expected: entry.sha256, status: .match, actual: raw)
            }
            let asText = engineSHA256(data)
            if asText != raw && asText == expected {
                return .init(file: entry.file, expected: entry.sha256, status: .textMatch, actual: asText)
            }
            return .init(file: entry.file, expected: entry.sha256, status: .mismatch(actual: asText), actual: asText)
        }
        let rest = snapshot.paths.filter { !listed.contains($0) && !describingFiles.contains($0) }
        return IntegrityReport(
            rows: rows,
            postSeal: rest.filter(isPostSealRecord),
            uncovered: rest.filter { !isPostSealRecord($0) }
        )
    }

    /// Parses `checksums.txt` (`<sha256>  <path>` per line, as `finalizeBundle` writes it) and
    /// compares it with the manifest, entry by entry.
    public static func compareChecksums(_ data: Data?, with manifest: ReleaseManifest) -> ChecksumsComparison {
        guard let data else { return .absent }
        guard let text = String(data: data, encoding: .utf8) else { return .unreadable("not UTF-8 text") }
        var listed: [String: String] = [:]
        var problems: [String] = []
        // Split on Character.isNewline: in Swift "\r\n" is ONE Character, so splitting on "\n" alone
        // would leave a CRLF line (a checksums file saved on Windows) unsplit.
        for (number, trimmed) in text.split(omittingEmptySubsequences: false, whereSeparator: \.isNewline).enumerated() {
            if trimmed.isEmpty { continue }
            guard let gap = trimmed.range(of: "  ") else {
                problems.append("line \(number + 1) is not \"<fingerprint>  <file>\"")
                continue
            }
            let hash = String(trimmed[..<gap.lowerBound]).lowercased()
            let file = String(trimmed[gap.upperBound...])
            guard hash.count == 64, hash.allSatisfy(\.isHexDigit), !file.isEmpty else {
                problems.append("line \(number + 1) is not \"<fingerprint>  <file>\"")
                continue
            }
            if listed[file] != nil { problems.append("\(file) is listed twice") }
            listed[file] = hash
        }
        for entry in manifest.files {
            switch listed.removeValue(forKey: entry.file) {
            case nil: problems.append("\(entry.file) is in manifest.json but not in checksums.txt")
            case let hash? where hash != entry.sha256.lowercased():
                problems.append("\(entry.file) has a different fingerprint in checksums.txt")
            default: break
            }
        }
        for file in listed.keys.sorted() {
            problems.append("\(file) is in checksums.txt but not in manifest.json")
        }
        return problems.isEmpty ? .agrees(count: manifest.files.count) : .disagrees(problems)
    }

    /// Recomputes the approval record's `hash_of_release_bundle` the way `computeBundleHash` does:
    /// `sha256("phase19-release-bundle-v1|" + JSON.stringify([{file, sha256}, …]))` over the sealed
    /// files, in the manifest's order (the engine sorts both lists the same way), with each file's
    /// fingerprint taken from the bytes in hand.
    public static func checkApproval(_ snapshot: BundleSnapshot, manifest: ReleaseManifest) -> ApprovalCheck {
        guard let data = snapshot.files["release-approval.json"] else { return .absent }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        guard let approval = try? decoder.decode(ReleaseApproval.self, from: data),
              let expected = approval.hashOfReleaseBundle?.lowercased(), !expected.isEmpty
        else { return .unreadable }
        var entries: [(String, String)] = []
        for entry in manifest.files {
            guard let bytes = snapshot.files[entry.file] else { return .incomplete }
            entries.append((entry.file, engineSHA256(bytes)))
        }
        let actual = bundleHash(entries)
        return actual == expected ? .matches(approvedAt: approval.approvedAt) : .differs(expected: expected, actual: actual)
    }

    /// The approval hash for `(file, sha256)` pairs, already in the engine's order.
    public static func bundleHash(_ entries: [(file: String, sha256: String)]) -> String {
        let body = entries.map { "{\"file\":\(jsonString($0.file)),\"sha256\":\(jsonString($0.sha256))}" }
        let text = bundleHashDomain + "[" + body.joined(separator: ",") + "]"
        return sha256Hex(Data(text.utf8))
    }

    /// A string literal exactly as JavaScript's `JSON.stringify` writes it.
    static func jsonString(_ s: String) -> String {
        var out = "\""
        for scalar in s.unicodeScalars {
            switch scalar {
            case "\"": out += "\\\""
            case "\\": out += "\\\\"
            case "\u{08}": out += "\\b"
            case "\u{0C}": out += "\\f"
            case "\n": out += "\\n"
            case "\r": out += "\\r"
            case "\t": out += "\\t"
            default:
                if scalar.value < 0x20 {
                    out += String(format: "\\u%04x", scalar.value)
                } else {
                    out.unicodeScalars.append(scalar)
                }
            }
        }
        return out + "\""
    }
}
