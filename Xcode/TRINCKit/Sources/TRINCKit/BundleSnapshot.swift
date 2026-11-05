import Foundation

/// Errors raised while reading what the buyer opened.
public enum BundleLoadError: Error, Equatable, CustomStringConvertible {
    case empty
    case tooLarge(Int)
    case unreadable(String)

    public var description: String {
        switch self {
        case .empty: return "Nothing readable was found in what you opened."
        case .tooLarge(let bytes):
            return "This bundle holds \(bytes / 1_048_576) MB, more than the \(BundleSnapshot.maxTotalBytes / 1_048_576) MB the app reads at once."
        case .unreadable(let why): return "The file could not be read: \(why)."
        }
    }
}

/// Every file of a delivery bundle, read into memory once.
///
/// Reading everything up front means the app can release the sandbox's access to the buyer's file
/// right away, and every later check (fingerprints, citations, previews) works on the same bytes.
public struct BundleSnapshot: Sendable {
    public static let maxTotalBytes = 256 * 1024 * 1024
    public static let maxFiles = 5_000

    public let name: String
    /// Bundle-relative paths ("deliverables/report.md") to contents.
    public let files: [String: Data]

    public init(name: String, files: [String: Data]) {
        self.name = name
        self.files = files
    }

    public var paths: [String] { files.keys.sorted() }

    /// Reads a folder the buyer unzipped. Hidden files (".DS_Store") are skipped.
    public static func load(folder: URL) throws -> BundleSnapshot {
        let root = folder.standardizedFileURL.resolvingSymlinksInPath()
        guard let walker = FileManager.default.enumerator(
            at: root,
            includingPropertiesForKeys: [.isRegularFileKey, .fileSizeKey],
            options: [.skipsHiddenFiles, .skipsPackageDescendants]
        ) else { throw BundleLoadError.unreadable(root.lastPathComponent) }

        var files: [String: Data] = [:]
        var total = 0
        let prefix = root.path.hasSuffix("/") ? root.path : root.path + "/"
        for case let url as URL in walker {
            let values = try? url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
            guard values?.isRegularFile == true else { continue }
            let full = url.standardizedFileURL.resolvingSymlinksInPath().path
            guard full.hasPrefix(prefix) else { continue } // never follow a link out of the folder
            let relative = String(full.dropFirst(prefix.count))
            total += values?.fileSize ?? 0
            if total > maxTotalBytes { throw BundleLoadError.tooLarge(total) }
            if files.count >= maxFiles { throw BundleLoadError.tooLarge(total) }
            do {
                files[relative] = try Data(contentsOf: url)
            } catch {
                throw BundleLoadError.unreadable(relative)
            }
        }
        guard !files.isEmpty else { throw BundleLoadError.empty }
        return BundleSnapshot(name: root.lastPathComponent, files: files)
    }

    /// Reads the sealed ZIP as delivered. If every entry sits under one top-level folder (a bundle
    /// that was unzipped and re-zipped), that folder is stripped so paths match the manifest.
    public static func load(zip data: Data, name: String) throws -> BundleSnapshot {
        let archive = try ZipArchive(data: data)
        let entries = archive.entries.filter { !$0.isDirectory && !isNoise($0.path) }
        guard !entries.isEmpty else { throw BundleLoadError.empty }
        let total = entries.reduce(0) { $0 + $1.uncompressedSize }
        if total > maxTotalBytes || entries.count > maxFiles { throw BundleLoadError.tooLarge(total) }

        let prefix = commonTopFolder(entries.map(\.path))
        var files: [String: Data] = [:]
        for entry in entries {
            let path = String(entry.path.dropFirst(prefix.count))
            files[path] = try archive.contents(of: entry)
        }
        return BundleSnapshot(name: name, files: files)
    }

    /// A single report (.md) or dataset (.csv) opened on its own.
    public static func load(singleFile url: URL) throws -> BundleSnapshot {
        do {
            let data = try Data(contentsOf: url)
            if data.count > maxTotalBytes { throw BundleLoadError.tooLarge(data.count) }
            return BundleSnapshot(name: url.lastPathComponent, files: [url.lastPathComponent: data])
        } catch let error as BundleLoadError {
            throw error
        } catch {
            throw BundleLoadError.unreadable(url.lastPathComponent)
        }
    }

    static func isNoise(_ path: String) -> Bool {
        path.hasPrefix("__MACOSX/") || path.split(separator: "/").last.map { $0.hasPrefix(".") } ?? false
    }

    static func commonTopFolder(_ paths: [String]) -> String {
        guard let first = paths.first, let slash = first.firstIndex(of: "/") else { return "" }
        let top = String(first[...slash])
        guard paths.allSatisfy({ $0.hasPrefix(top) }) else { return "" }
        // Only strip when the manifest is inside that folder; otherwise the layout is the bundle's own.
        return paths.contains(top + "manifest.json") ? top : ""
    }
}
