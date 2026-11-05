import Compression
import Foundation

/// Errors raised while reading a ZIP archive.
public enum ZipError: Error, Equatable, CustomStringConvertible {
    case notAZip
    case unsupported(String)
    case corrupt(String)
    case tooLarge(String)

    public var description: String {
        switch self {
        case .notAZip: return "This file is not a ZIP archive."
        case .unsupported(let why): return "This ZIP uses a feature the reader does not support: \(why)."
        case .corrupt(let why): return "This ZIP is damaged: \(why)."
        case .tooLarge(let why): return "This ZIP is too large to open here: \(why)."
        }
    }
}

/// One file or folder inside a ZIP archive, as its central directory describes it.
public struct ZipEntry: Sendable, Hashable {
    public let path: String
    public let method: UInt16
    public let compressedSize: Int
    public let uncompressedSize: Int
    public let crc32: UInt32
    let localHeaderOffset: Int

    public var isDirectory: Bool { path.hasSuffix("/") }
}

/// A minimal, read-only ZIP reader: stored (0) and deflate (8) entries, no ZIP64, no encryption.
///
/// That covers the sealed bundle the engine writes and what Finder or the Files app produce when
/// a buyer re-zips a folder. Every entry is checked against its CRC-32 after decompression, so a
/// damaged archive is reported, never silently shown.
public struct ZipArchive: Sendable {
    /// Upper bound for a single decompressed entry (guards against decompression bombs).
    public static let maxEntrySize = 256 * 1024 * 1024

    public let entries: [ZipEntry]
    private let bytes: [UInt8]

    public init(data: Data) throws {
        let bytes = [UInt8](data)
        self.bytes = bytes
        self.entries = try Self.readCentralDirectory(bytes)
    }

    public func entry(at path: String) -> ZipEntry? {
        entries.first { $0.path == path }
    }

    /// Returns the decompressed contents of `entry`, verified against its CRC-32.
    public func contents(of entry: ZipEntry) throws -> Data {
        if entry.isDirectory { return Data() }
        guard entry.uncompressedSize <= Self.maxEntrySize else {
            throw ZipError.tooLarge("\(entry.path) expands to \(entry.uncompressedSize) bytes")
        }
        let o = entry.localHeaderOffset
        guard try Self.u32(bytes, o) == 0x0403_4B50 else {
            throw ZipError.corrupt("local header missing for \(entry.path)")
        }
        let nameLength = Int(try Self.u16(bytes, o + 26))
        let extraLength = Int(try Self.u16(bytes, o + 28))
        let start = o + 30 + nameLength + extraLength
        let end = start + entry.compressedSize
        guard start >= 0, end <= bytes.count, start <= end else {
            throw ZipError.corrupt("data for \(entry.path) runs past the end of the file")
        }
        let raw = Array(bytes[start..<end])

        let output: [UInt8]
        switch entry.method {
        case 0:
            output = raw
        case 8:
            output = try Self.inflate(raw, expectedSize: entry.uncompressedSize, path: entry.path)
        default:
            throw ZipError.unsupported("compression method \(entry.method) in \(entry.path)")
        }
        guard output.count == entry.uncompressedSize else {
            throw ZipError.corrupt("\(entry.path) expanded to \(output.count) bytes, expected \(entry.uncompressedSize)")
        }
        guard CRC32.checksum(output) == entry.crc32 else {
            throw ZipError.corrupt("checksum mismatch in \(entry.path)")
        }
        return Data(output)
    }

    // MARK: - Parsing

    private static func readCentralDirectory(_ b: [UInt8]) throws -> [ZipEntry] {
        // The end-of-central-directory record is 22 bytes plus a comment of up to 65,535 bytes.
        guard b.count >= 22 else { throw ZipError.notAZip }
        var eocd = -1
        var i = b.count - 22
        let floor = max(0, b.count - 22 - 65_535)
        while i >= floor {
            if b[i] == 0x50, b[i + 1] == 0x4B, b[i + 2] == 0x05, b[i + 3] == 0x06 {
                eocd = i
                break
            }
            i -= 1
        }
        guard eocd >= 0 else { throw ZipError.notAZip }

        let diskNumber = try u16(b, eocd + 4)
        let entryCount = try u16(b, eocd + 10)
        let directorySize = try u32(b, eocd + 12)
        let directoryOffset = try u32(b, eocd + 16)
        if diskNumber != 0 { throw ZipError.unsupported("multi-part archives") }
        if entryCount == 0xFFFF || directorySize == 0xFFFF_FFFF || directoryOffset == 0xFFFF_FFFF {
            throw ZipError.unsupported("ZIP64")
        }

        var entries: [ZipEntry] = []
        entries.reserveCapacity(Int(entryCount))
        var o = Int(directoryOffset)
        for _ in 0..<Int(entryCount) {
            guard try u32(b, o) == 0x0201_4B50 else {
                throw ZipError.corrupt("central directory entry missing")
            }
            let flags = try u16(b, o + 8)
            let method = try u16(b, o + 10)
            let crc = try u32(b, o + 16)
            let compressed = try u32(b, o + 20)
            let uncompressed = try u32(b, o + 24)
            let nameLength = Int(try u16(b, o + 28))
            let extraLength = Int(try u16(b, o + 30))
            let commentLength = Int(try u16(b, o + 32))
            let localOffset = try u32(b, o + 42)
            guard o + 46 + nameLength <= b.count else { throw ZipError.corrupt("entry name runs past the end") }
            if flags & 0x1 != 0 { throw ZipError.unsupported("encrypted entries") }
            if compressed == 0xFFFF_FFFF || uncompressed == 0xFFFF_FFFF || localOffset == 0xFFFF_FFFF {
                throw ZipError.unsupported("ZIP64")
            }
            let nameBytes = Array(b[(o + 46)..<(o + 46 + nameLength)])
            let name = String(bytes: nameBytes, encoding: .utf8)
                ?? String(bytes: nameBytes, encoding: .isoLatin1)
                ?? ""
            if name.isEmpty || name.contains("\0") { throw ZipError.corrupt("an entry has an unreadable name") }
            entries.append(ZipEntry(
                path: name.replacingOccurrences(of: "\\", with: "/"),
                method: method,
                compressedSize: Int(compressed),
                uncompressedSize: Int(uncompressed),
                crc32: crc,
                localHeaderOffset: Int(localOffset)
            ))
            o += 46 + nameLength + extraLength + commentLength
        }
        return entries
    }

    private static func inflate(_ input: [UInt8], expectedSize: Int, path: String) throws -> [UInt8] {
        if expectedSize == 0 { return [] }
        // Apple's COMPRESSION_ZLIB is raw DEFLATE (RFC 1951), which is exactly what ZIP method 8 stores.
        var output = [UInt8](repeating: 0, count: expectedSize)
        let written = output.withUnsafeMutableBufferPointer { dst in
            input.withUnsafeBufferPointer { src in
                compression_decode_buffer(
                    dst.baseAddress!, expectedSize,
                    src.baseAddress!, input.count,
                    nil, COMPRESSION_ZLIB
                )
            }
        }
        guard written == expectedSize else {
            throw ZipError.corrupt("could not decompress \(path)")
        }
        return output
    }

    private static func u16(_ b: [UInt8], _ o: Int) throws -> UInt16 {
        guard o >= 0, o + 2 <= b.count else { throw ZipError.corrupt("truncated archive") }
        return UInt16(b[o]) | UInt16(b[o + 1]) << 8
    }

    private static func u32(_ b: [UInt8], _ o: Int) throws -> UInt32 {
        guard o >= 0, o + 4 <= b.count else { throw ZipError.corrupt("truncated archive") }
        return UInt32(b[o]) | UInt32(b[o + 1]) << 8 | UInt32(b[o + 2]) << 16 | UInt32(b[o + 3]) << 24
    }
}

/// CRC-32 (IEEE 802.3, the polynomial ZIP uses).
public enum CRC32 {
    private static let table: [UInt32] = (0..<256).map { n in
        var c = UInt32(n)
        for _ in 0..<8 { c = (c & 1) != 0 ? 0xEDB8_8320 ^ (c >> 1) : c >> 1 }
        return c
    }

    public static func checksum(_ bytes: [UInt8]) -> UInt32 {
        var c: UInt32 = 0xFFFF_FFFF
        for byte in bytes { c = table[Int((c ^ UInt32(byte)) & 0xFF)] ^ (c >> 8) }
        return c ^ 0xFFFF_FFFF
    }
}
