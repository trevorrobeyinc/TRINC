import Foundation

public enum CSVError: Error, Equatable, CustomStringConvertible {
    case unterminatedQuote(line: Int)
    case notText

    public var description: String {
        switch self {
        case .unterminatedQuote(let line): return "A quoted field opened on line \(line) is never closed."
        case .notText: return "This file is not UTF-8 text."
        }
    }
}

/// An RFC 4180 CSV file: comma-separated, double-quoted fields, `""` for a literal quote,
/// CRLF / LF / CR line endings, and line breaks allowed inside quoted fields.
public struct CSVTable: Sendable, Equatable {
    public let header: [String]
    public let rows: [[String]]

    public init(header: [String], rows: [[String]]) {
        self.header = header
        self.rows = rows
    }

    public init(data: Data) throws {
        guard let text = String(data: data, encoding: .utf8) else { throw CSVError.notText }
        try self.init(parsing: text)
    }

    public init(parsing text: String) throws {
        // Unicode scalars, not Characters: Swift treats "\r\n" as ONE Character, which would hide
        // the line break from a Character-level scanner.
        var records: [[String]] = []
        var record: [String] = []
        var field = String.UnicodeScalarView()
        var inQuotes = false
        var quoteOpenedOnLine = 1
        var line = 1
        var atFieldStart = true
        var scalars = text.unicodeScalars.makeIterator()
        var pending: Unicode.Scalar? = nil

        func endField() {
            record.append(String(field))
            field = String.UnicodeScalarView()
            atFieldStart = true
        }
        func endRecord() {
            endField()
            if !(record.count == 1 && record[0].isEmpty) { records.append(record) }
            record = []
        }

        while let c = pending ?? scalars.next() {
            pending = nil
            if inQuotes {
                if c == "\"" {
                    let next = scalars.next()
                    if next == "\"" {
                        field.append("\"")
                    } else {
                        inQuotes = false
                        pending = next
                    }
                } else {
                    if c == "\n" { line += 1 }
                    field.append(c)
                }
                continue
            }
            switch c {
            case "\"" where atFieldStart:
                inQuotes = true
                quoteOpenedOnLine = line
                atFieldStart = false
            case ",":
                endField()
            case "\r":
                let next = scalars.next()
                if next != "\n" { pending = next }
                line += 1
                endRecord()
            case "\n":
                line += 1
                endRecord()
            default:
                field.append(c)
                atFieldStart = false
            }
        }
        if inQuotes { throw CSVError.unterminatedQuote(line: quoteOpenedOnLine) }
        if !field.isEmpty || !record.isEmpty { endRecord() }

        if records.first?.first?.hasPrefix("\u{FEFF}") == true {
            records[0][0].removeFirst() // byte-order mark from spreadsheet exports
        }
        self.header = records.first ?? []
        self.rows = Array(records.dropFirst())
    }
}
