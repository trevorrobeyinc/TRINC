import Foundation

/// The block structure of a Markdown deliverable. Inline formatting (bold, links, code spans)
/// stays inside the strings; the app renders it with `AttributedString(markdown:)`.
public enum MarkdownBlock: Sendable, Equatable {
    case heading(level: Int, text: String)
    case paragraph(String)
    case bulletList([String])
    case orderedList([String])
    case quote(String)
    case code(String)
    case table(header: [String], rows: [[String]])
    case rule
}

/// A line-based parser for the subset of Markdown the engine's deliverables use.
public enum MarkdownParser {
    public static func blocks(from text: String) -> [MarkdownBlock] {
        let lines = text.replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
            .components(separatedBy: "\n")
        var blocks: [MarkdownBlock] = []
        var paragraph: [String] = []
        var i = 0

        func flushParagraph() {
            if !paragraph.isEmpty {
                blocks.append(.paragraph(paragraph.joined(separator: " ")))
                paragraph = []
            }
        }

        while i < lines.count {
            let line = lines[i]
            let trimmed = line.trimmingCharacters(in: .whitespaces)

            if trimmed.isEmpty {
                flushParagraph(); i += 1; continue
            }
            if trimmed.hasPrefix("```") || trimmed.hasPrefix("~~~") {
                flushParagraph()
                let fence = String(trimmed.prefix(3))
                var body: [String] = []
                i += 1
                while i < lines.count, !lines[i].trimmingCharacters(in: .whitespaces).hasPrefix(fence) {
                    body.append(lines[i]); i += 1
                }
                blocks.append(.code(body.joined(separator: "\n")))
                i += 1
                continue
            }
            if let heading = heading(trimmed) {
                flushParagraph(); blocks.append(heading); i += 1; continue
            }
            if isRule(trimmed) {
                flushParagraph(); blocks.append(.rule); i += 1; continue
            }
            if trimmed.hasPrefix("|"), i + 1 < lines.count, isTableSeparator(lines[i + 1]) {
                flushParagraph()
                let header = cells(trimmed)
                var rows: [[String]] = []
                i += 2
                while i < lines.count {
                    let row = lines[i].trimmingCharacters(in: .whitespaces)
                    guard row.hasPrefix("|") else { break }
                    rows.append(cells(row)); i += 1
                }
                blocks.append(.table(header: header, rows: rows))
                continue
            }
            if trimmed.hasPrefix(">") {
                flushParagraph()
                var quoted: [String] = []
                while i < lines.count {
                    let q = lines[i].trimmingCharacters(in: .whitespaces)
                    guard q.hasPrefix(">") else { break }
                    quoted.append(String(q.dropFirst()).trimmingCharacters(in: .whitespaces)); i += 1
                }
                blocks.append(.quote(quoted.filter { !$0.isEmpty }.joined(separator: " ")))
                continue
            }
            if bulletItem(trimmed) != nil {
                flushParagraph()
                var items: [String] = []
                while i < lines.count, let item = bulletItem(lines[i].trimmingCharacters(in: .whitespaces)) {
                    items.append(item); i += 1
                }
                blocks.append(.bulletList(items))
                continue
            }
            if orderedItem(trimmed) != nil {
                flushParagraph()
                var items: [String] = []
                while i < lines.count, let item = orderedItem(lines[i].trimmingCharacters(in: .whitespaces)) {
                    items.append(item); i += 1
                }
                blocks.append(.orderedList(items))
                continue
            }
            paragraph.append(trimmed)
            i += 1
        }
        flushParagraph()
        return blocks
    }

    static func heading(_ line: String) -> MarkdownBlock? {
        let hashes = line.prefix { $0 == "#" }.count
        guard (1...6).contains(hashes) else { return nil }
        let rest = line.dropFirst(hashes)
        guard rest.first == " " else { return nil }
        return .heading(level: hashes, text: rest.trimmingCharacters(in: .whitespaces))
    }

    static func isRule(_ line: String) -> Bool {
        let compact = line.replacingOccurrences(of: " ", with: "")
        guard compact.count >= 3, let first = compact.first, "-*_".contains(first) else { return false }
        return compact.allSatisfy { $0 == first }
    }

    static func isTableSeparator(_ line: String) -> Bool {
        let t = line.trimmingCharacters(in: .whitespaces)
        guard t.hasPrefix("|"), t.contains("-") else { return false }
        return t.allSatisfy { "|-: ".contains($0) }
    }

    static func cells(_ line: String) -> [String] {
        var t = line
        if t.hasPrefix("|") { t.removeFirst() }
        if t.hasSuffix("|") && !t.hasSuffix("\\|") { t.removeLast() }
        var cells: [String] = []
        var current = ""
        var escaped = false
        for ch in t {
            if escaped { current.append(ch); escaped = false; continue }
            if ch == "\\" { escaped = true; current.append(ch); continue }
            if ch == "|" { cells.append(current); current = ""; continue }
            current.append(ch)
        }
        cells.append(current)
        return cells.map { $0.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "\\|", with: "|") }
    }

    static func bulletItem(_ line: String) -> String? {
        for marker in ["- ", "* ", "+ "] where line.hasPrefix(marker) {
            return String(line.dropFirst(2)).trimmingCharacters(in: .whitespaces)
        }
        return nil
    }

    static func orderedItem(_ line: String) -> String? {
        let digits = line.prefix { $0.isNumber }
        guard !digits.isEmpty, digits.count <= 3 else { return nil }
        let rest = line.dropFirst(digits.count)
        guard rest.hasPrefix(". ") || rest.hasPrefix(") ") else { return nil }
        return String(rest.dropFirst(2)).trimmingCharacters(in: .whitespaces)
    }
}
