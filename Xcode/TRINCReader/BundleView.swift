import SwiftUI
import TRINCKit

enum BundleTab: String, CaseIterable, Identifiable {
    case report = "Report"
    case citations = "Citations"
    case seal = "Seal"
    case data = "Data"
    case files = "Files"
    var id: String { rawValue }
}

struct BundleView: View {
    let bundle: DeliverableBundle
    @State private var tab: BundleTab = .report

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            BundleHeader(bundle: bundle)
                .padding([.horizontal, .top])
            Picker("Section", selection: $tab) {
                ForEach(BundleTab.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .padding()
            Divider()
            Group {
                switch tab {
                case .report: DocumentsView(bundle: bundle)
                case .citations: CitationsView(bundle: bundle)
                case .seal: SealView(bundle: bundle)
                case .data: DatasetView(bundle: bundle)
                case .files: FilesView(bundle: bundle)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .background(Theme.background)
        .navigationTitle(bundle.title)
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
    }
}

struct BundleHeader: View {
    let bundle: DeliverableBundle

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(bundle.title).font(.title2.bold()).textSelection(.enabled)
            HStack(spacing: 8) {
                if bundle.isSample {
                    Badge(text: "SAMPLE EXCERPT", color: Theme.caution)
                }
                if let line = bundle.metadata?.productLine {
                    Badge(text: line.replacingOccurrences(of: "_", with: " ").uppercased())
                }
                if let tier = bundle.metadata?.tier {
                    Badge(text: tier.uppercased())
                }
                if let verdict = bundle.verdict {
                    VerdictLine(verdict: verdict)
                }
            }
            if let summary = bundle.citations?.summary {
                Text(Copy.reportVerified(summary) + Copy.whenAssembled(summary.asOf))
                    .font(.callout)
                if !summary.otherDeliverables.isEmpty {
                    Text(Copy.otherDeliverables(summary.otherDeliverables))
                        .font(.callout).foregroundStyle(.secondary)
                }
                if bundle.verdict?.reresolutionIncomplete == true {
                    Label(Copy.reresolutionIncompleteShort, systemImage: "exclamationmark.octagon")
                        .foregroundStyle(Theme.bad).font(.callout)
                }
            }
            ForEach(bundle.problems, id: \.self) { problem in
                Label(problem, systemImage: "exclamationmark.triangle").foregroundStyle(Theme.caution).font(.callout)
            }
            if !bundle.ledgerFindings.isEmpty {
                Label(Copy.ledgerContradiction + " (see Citations).", systemImage: "exclamationmark.octagon")
                    .foregroundStyle(Theme.bad).font(.callout)
            }
        }
    }
}

struct DocumentsView: View {
    let bundle: DeliverableBundle
    @State private var selected: String?
    @State private var blocks: [MarkdownBlock] = []

    var body: some View {
        if bundle.documents.isEmpty {
            EmptyNote(title: "No report", text: "This bundle carries no Markdown documents. Its other files are listed under Files.")
        } else {
            VStack(alignment: .leading, spacing: 0) {
                if bundle.documents.count > 1 {
                    Picker("Document", selection: Binding(get: { current }, set: { selected = $0 })) {
                        ForEach(bundle.documents, id: \.self) { path in
                            Text(label(path)).tag(path)
                        }
                    }
                    .pickerStyle(.menu)
                    .fixedSize()
                    .padding([.horizontal, .top])
                }
                MarkdownView(blocks: blocks)
            }
            .task(id: current) {
                let text = bundle.text(current) ?? ""
                blocks = await Task.detached { MarkdownParser.blocks(from: text) }.value
            }
        }
    }

    private var current: String { selected ?? bundle.documents[0] }

    /// The file name (with its folder outside `deliverables/`), plus how many attribution marks it carries.
    private func label(_ path: String) -> String {
        let name = path.hasPrefix("deliverables/") ? String(path.dropFirst("deliverables/".count)) : path
        let marks = bundle.attributionMarks(in: path).count
        return marks == 0 ? name : "\(name) — \(marks) attribution mark\(marks == 1 ? "" : "s")"
    }
}

struct FilesView: View {
    let bundle: DeliverableBundle

    var body: some View {
        List(bundle.snapshot.paths, id: \.self) { path in
            HStack {
                Text(path).font(.system(.callout, design: .monospaced)).textSelection(.enabled)
                Spacer()
                Text(ByteCountFormatter.string(fromByteCount: Int64(bundle.snapshot.files[path]?.count ?? 0), countStyle: .file))
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .scrollContentBackground(.hidden)
    }
}
