import SwiftUI
import TRINCKit

/// Renders the block structure of a deliverable. Long tables are cut at a stated limit, never silently.
struct MarkdownView: View {
    let blocks: [MarkdownBlock]

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                    BlockView(block: block)
                }
            }
            .textSelection(.enabled)
            .padding()
            .frame(maxWidth: 960, alignment: .leading)
        }
    }
}

struct BlockView: View {
    let block: MarkdownBlock

    var body: some View {
        switch block {
        case .heading(let level, let text):
            Text(inlineMarkdown(text))
                .font(level == 1 ? .title.bold() : level == 2 ? .title2.bold() : .headline)
                .padding(.top, level <= 2 ? 10 : 4)
        case .paragraph(let text):
            Text(inlineMarkdown(text))
        case .bulletList(let items):
            VStack(alignment: .leading, spacing: 4) {
                ForEach(items.indices, id: \.self) { i in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text("•").foregroundStyle(Theme.accent)
                        Text(inlineMarkdown(items[i]))
                    }
                }
            }
        case .orderedList(let items):
            VStack(alignment: .leading, spacing: 4) {
                ForEach(items.indices, id: \.self) { i in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text("\(i + 1).").monospacedDigit().foregroundStyle(Theme.accent)
                        Text(inlineMarkdown(items[i]))
                    }
                }
            }
        case .quote(let text):
            Text(inlineMarkdown(text))
                .foregroundStyle(.secondary)
                .padding(.leading, 12)
                .overlay(alignment: .leading) { Rectangle().fill(Theme.accent).frame(width: 3) }
        case .code(let text):
            ScrollView(.horizontal) {
                Text(text).font(.system(.callout, design: .monospaced)).padding(8)
            }
            .background(Theme.panel)
        case .table(let header, let rows):
            MarkdownTable(header: header, rows: rows)
        case .rule:
            Rectangle().fill(Theme.rule).frame(height: 1)
        }
    }
}

struct MarkdownTable: View {
    let header: [String]
    let rows: [[String]]
    static let shownRows = 300

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ScrollView(.horizontal) {
                Grid(alignment: .leading, horizontalSpacing: 0, verticalSpacing: 0) {
                    GridRow {
                        ForEach(header.indices, id: \.self) { c in
                            cell(header[c]).fontWeight(.semibold).background(Theme.panel)
                        }
                    }
                    ForEach(Array(rows.prefix(Self.shownRows).enumerated()), id: \.offset) { _, row in
                        GridRow {
                            ForEach(header.indices, id: \.self) { c in
                                cell(c < row.count ? row[c] : "")
                            }
                        }
                    }
                }
            }
            if rows.count > Self.shownRows {
                Text("Showing the first \(Self.shownRows) of \(rows.count) rows. The full data is in the bundle's files.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func cell(_ text: String) -> some View {
        Text(inlineMarkdown(text))
            .font(.callout)
            .frame(minWidth: 60, maxWidth: 320, alignment: .leading)
            .padding(6)
            .border(Theme.rule, width: 0.5)
    }
}
