import Foundation
import Observation
import TRINCKit
import UniformTypeIdentifiers

/// The bundles the buyer has open, plus the bundled sales samples.
@MainActor
@Observable
final class Library {
    var opened: [DeliverableBundle] = []
    var samples: [DeliverableBundle] = []
    var selection: UUID?
    var isImporterPresented = false
    var isLoading = false
    var errorMessage: String?

    static let openableTypes: [UTType] = [
        .zip, .folder, .commaSeparatedText, UTType(filenameExtension: "md") ?? .plainText, .plainText,
    ]

    init() {
        loadSamples()
    }

    func bundle(id: UUID?) -> DeliverableBundle? {
        guard let id else { return nil }
        return opened.first { $0.id == id } ?? samples.first { $0.id == id }
    }

    func open(_ result: Result<[URL], Error>) {
        switch result {
        case .failure(let error):
            errorMessage = error.localizedDescription
        case .success(let urls):
            Task { await open(urls) }
        }
    }

    func open(_ urls: [URL]) async {
        isLoading = true
        defer { isLoading = false }
        for url in urls {
            do {
                let snapshot = try await Task.detached(priority: .userInitiated) { try Self.read(url) }.value
                let bundle = DeliverableBundle(snapshot: snapshot)
                opened.insert(bundle, at: 0)
                selection = bundle.id
            } catch {
                errorMessage = "\(url.lastPathComponent): \(Self.describe(error))"
            }
        }
    }

    func close(_ id: UUID) {
        opened.removeAll { $0.id == id }
        if selection == id { selection = nil }
    }

    /// Reads everything while the sandbox grants access to the buyer's file, then lets it go.
    nonisolated static func read(_ url: URL) throws -> BundleSnapshot {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let isDirectory = (try? url.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) ?? false
        if isDirectory {
            return try BundleSnapshot.load(folder: url)
        }
        if url.pathExtension.lowercased() == "zip" {
            let data: Data
            do { data = try Data(contentsOf: url) } catch { throw BundleLoadError.unreadable(url.lastPathComponent) }
            return try BundleSnapshot.load(zip: data, name: url.lastPathComponent)
        }
        return try BundleSnapshot.load(singleFile: url)
    }

    nonisolated static func describe(_ error: Error) -> String {
        switch error {
        case let e as BundleLoadError: return e.description
        case let e as ZipError: return e.description
        case let e as CSVError: return e.description
        default: return error.localizedDescription
        }
    }

    private func loadSamples() {
        let urls = (Bundle.main.urls(forResourcesWithExtension: "md", subdirectory: nil) ?? [])
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
        samples = urls.compactMap { try? BundleSnapshot.load(singleFile: $0) }
            .map { DeliverableBundle(snapshot: $0, isSample: true) }
    }
}
