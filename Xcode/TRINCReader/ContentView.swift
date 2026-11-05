import SwiftUI
import TRINCKit

struct ContentView: View {
    @Environment(Library.self) private var library

    var body: some View {
        @Bindable var library = library
        NavigationSplitView {
            SidebarView()
        } detail: {
            if let bundle = library.bundle(id: library.selection) {
                BundleView(bundle: bundle).id(bundle.id)
            } else {
                WelcomeView()
            }
        }
        .fileImporter(
            isPresented: $library.isImporterPresented,
            allowedContentTypes: Library.openableTypes,
            allowsMultipleSelection: true
        ) { result in
            library.open(result)
        }
        .dropDestination(for: URL.self) { urls, _ in
            Task { await library.open(urls) }
            return !urls.isEmpty
        }
        .alert("Could not open", isPresented: Binding(
            get: { library.errorMessage != nil },
            set: { if !$0 { library.errorMessage = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(library.errorMessage ?? "")
        }
        .overlay {
            if library.isLoading { ProgressView("Reading bundle…").padding().background(Theme.panel) }
        }
        #if os(macOS)
        .frame(minWidth: 900, minHeight: 600)
        #endif
    }
}

struct SidebarView: View {
    @Environment(Library.self) private var library
    @State private var showAbout = false

    var body: some View {
        @Bindable var library = library
        List(selection: $library.selection) {
            if !library.opened.isEmpty {
                Section("Opened") {
                    ForEach(library.opened) { bundle in
                        BundleRow(bundle: bundle)
                            .tag(bundle.id)
                            .contextMenu {
                                Button("Close", role: .destructive) { library.close(bundle.id) }
                            }
                    }
                }
            }
            Section("Samples") {
                ForEach(library.samples) { bundle in
                    BundleRow(bundle: bundle).tag(bundle.id)
                }
            }
        }
        .navigationTitle(Brand.wordmark)
        .toolbar {
            ToolbarItem {
                Button { library.isImporterPresented = true } label: {
                    Label("Open Bundle", systemImage: "folder.badge.plus")
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            Button("About and legal") { showAbout = true }
                .buttonStyle(.borderless)
                .font(.footnote)
                .padding(10)
        }
        .sheet(isPresented: $showAbout) {
            AboutView()
        }
    }
}

struct BundleRow: View {
    let bundle: DeliverableBundle

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(bundle.title).lineLimit(2)
            Text(subtitle).font(.caption).foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }

    private var subtitle: String {
        if bundle.isSample { return "Sample excerpt" }
        if let counts = bundle.citations?.summary.counts {
            return "\(counts.verified) of \(counts.total) cited identifiers VERIFIED"
        }
        return bundle.snapshot.name
    }
}

struct WelcomeView: View {
    @Environment(Library.self) private var library

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text(Brand.wordmark).font(.largeTitle.bold())
                Text(Brand.tagline).font(.title3).foregroundStyle(Theme.accent)
                Text(Copy.welcome)
                Button {
                    library.isImporterPresented = true
                } label: {
                    Label("Open Bundle", systemImage: "folder.badge.plus")
                }
                .buttonStyle(.borderedProminent)
                Text(Brand.privacy).font(.callout).foregroundStyle(.secondary)
                Divider()
                Text(Brand.researchOnly).font(.footnote).foregroundStyle(.secondary)
                Text(Brand.disclosure).font(.footnote).foregroundStyle(.secondary)
            }
            .padding(32)
            .frame(maxWidth: 720, alignment: .leading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.background)
    }
}

struct AboutView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text(Brand.wordmark).font(.title.bold())
                    Text(Brand.tagline).foregroundStyle(Theme.accent)
                    Text(Brand.elevator)
                    Divider()
                    Text("What this app does").font(.headline)
                    Text(Copy.welcome)
                    Text(Brand.privacy)
                    Divider()
                    Text(Brand.researchOnly)
                    Text(Brand.engineCredit)
                    Text(Brand.contact).font(.system(.body, design: .monospaced))
                    Text(Brand.disclosure).font(.footnote).foregroundStyle(.secondary)
                    Text("Version \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "–")")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                .padding(24)
                .frame(maxWidth: 640, alignment: .leading)
            }
            .navigationTitle("About")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
        #if os(macOS)
        .frame(minWidth: 520, minHeight: 560)
        #endif
    }
}
