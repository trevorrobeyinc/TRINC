import SwiftUI
import TRINCKit

/// A read-only preview of a bundle's CSV datasets, with a text filter.
struct DatasetView: View {
    let bundle: DeliverableBundle
    @State private var selected: String?
    @State private var table: CSVTable?
    @State private var error: String?
    @State private var query = ""
    static let shownRows = 2_000
    static let columnWidth: CGFloat = 180

    var body: some View {
        if bundle.datasets.isEmpty {
            EmptyNote(title: "No datasets", text: "This bundle carries no CSV files.")
        } else {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    if bundle.datasets.count > 1 {
                        Picker("Dataset", selection: Binding(get: { current }, set: { selected = $0 })) {
                            ForEach(bundle.datasets, id: \.self) { Text(($0 as NSString).lastPathComponent).tag($0) }
                        }
                        .pickerStyle(.menu)
                        .fixedSize()
                    } else {
                        Text((current as NSString).lastPathComponent).font(.system(.headline, design: .monospaced))
                    }
                    TextField("Filter rows", text: $query)
                        .textFieldStyle(.roundedBorder)
                        .frame(maxWidth: 280)
                    Spacer()
                    if let table {
                        Text("\(filtered(table).count) of \(table.rows.count) rows · \(table.header.count) columns")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                if let error {
                    Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(Theme.caution)
                } else if let table {
                    grid(table)
                } else {
                    ProgressView()
                }
            }
            .padding()
            .task(id: current) {
                table = nil
                error = nil
                guard let data = bundle.snapshot.files[current] else { return }
                do {
                    table = try await Task.detached { try CSVTable(data: data) }.value
                } catch let e as CSVError {
                    error = e.description
                } catch {
                    self.error = error.localizedDescription
                }
            }
        }
    }

    private var current: String { selected ?? bundle.datasets[0] }

    private func filtered(_ table: CSVTable) -> [[String]] {
        guard !query.isEmpty else { return table.rows }
        return table.rows.filter { row in row.contains { $0.localizedCaseInsensitiveContains(query) } }
    }

    private func grid(_ table: CSVTable) -> some View {
        let rows = filtered(table)
        return VStack(alignment: .leading, spacing: 6) {
            ScrollView([.horizontal, .vertical]) {
                LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
                    Section {
                        ForEach(Array(rows.prefix(Self.shownRows).enumerated()), id: \.offset) { _, row in
                            line(row, count: table.header.count)
                        }
                    } header: {
                        line(table.header, count: table.header.count, isHeader: true)
                    }
                }
            }
            if rows.count > Self.shownRows {
                Text("Showing the first \(Self.shownRows) of \(rows.count) matching rows. Narrow the filter to see others; the CSV itself is complete.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func line(_ cells: [String], count: Int, isHeader: Bool = false) -> some View {
        HStack(spacing: 0) {
            ForEach(0..<count, id: \.self) { c in
                Text(c < cells.count ? cells[c] : "")
                    .font(.system(.caption, design: .monospaced).weight(isHeader ? .semibold : .regular))
                    .lineLimit(2)
                    .frame(width: Self.columnWidth, alignment: .leading)
                    .padding(4)
                    .border(Theme.rule, width: 0.5)
            }
        }
        // The pinned header needs an opaque base so rows scrolling under it do not show through.
        .background(isHeader ? Theme.panel : Color.clear)
        .background(isHeader ? Theme.background : Color.clear)
    }
}
