import SwiftUI

/// Fixed customer-facing copy. Wording comes from the brand canon (the brand-check skill and
/// OFFERINGS.md): do not paraphrase it here. The disclosure is a legal requirement
/// (Cal. Bus. & Prof. Code §17910.5(a)) on every customer-facing surface.
enum Brand {
    static let wordmark = "Trevor Robey, INC."
    static let disclosure = "Trevor Robey, INC. is the wordmark of Trevor Robey Intelligence Network Citations LLC, a California limited liability company."
    static let tagline = "Every claim, sourced. Every risk, named. In days, not weeks."
    static let elevator = "Citation-traced biomedical due diligence for biotech investors and pharma BD. Five days. Every citation grounded and retraction-screened. Audit trail included."
    static let engineCredit = "Powered by OpenClaw, the open-source agent framework."
    static let researchOnly = "Research artifacts only. Not clinical decision support, and never legal, medical, tax or investment advice."
    static let contact = "trevor@trevorobeyinc.com · trevorobeyinc.com"
    static let privacy = "This app has no network access. It reads only the files you open, on this device, and sends nothing anywhere. Registry links open in your web browser."
}

/// Explanations shown beside each check. They state exactly what a check proves, no more
/// (SYSTEM-REALITY.md: re-resolution proves a record exists, not that its conclusions are right).
enum Copy {
    static let welcome = "Open the bundle you received (the sealed .zip, its unzipped folder, or a dataset .csv) to read the report, see the status of every cited identifier, and confirm each file still matches its seal."
    static let verifiedMeaning = "VERIFIED means the identifier was re-resolved against its issuing public registry when the bundle was delivered (PubMed for PMIDs, ClinicalTrials.gov for NCT numbers, Crossref for DOIs). It proves the record exists; it does not prove the source's conclusions are right. Retraction screening covers Crossref and PubMed."
    static let sealMeaning = "Each file's SHA-256 fingerprint is recomputed on this device and compared with manifest.json, which was written when the bundle was sealed. A match means the file is byte for byte what was delivered."
    static let uncoveredMeaning = "These files are in the bundle but were not fingerprinted when it was sealed, so the seal says nothing about them."
    static let sampleNoSeal = "Samples are excerpts and carry no seal. A delivered bundle includes manifest.json with a fingerprint for every file."
    static let sampleNoLedger = "Samples are excerpts. A delivered bundle carries its full citation ledger (reproducibility-manifest.json), listed here identifier by identifier."
}

enum Theme {
    static let background = Color(red: 10 / 255, green: 10 / 255, blue: 15 / 255) // #0a0a0f
    static let accent = Color(red: 74 / 255, green: 144 / 255, blue: 217 / 255)   // #4a90d9
    static let panel = Color.white.opacity(0.06)
    static let rule = Color.white.opacity(0.16)
    static let good = Color(red: 0.36, green: 0.76, blue: 0.48)
    static let bad = Color(red: 0.92, green: 0.40, blue: 0.36)
    static let caution = Color(red: 0.93, green: 0.71, blue: 0.30)

    static func statusColor(_ status: String) -> Color {
        switch status.uppercased() {
        case "VERIFIED", "DELIVER", "PASS": return good
        case "UNRESOLVED", "BLOCK", "FAIL", "RETRACTED": return bad
        default: return caution
        }
    }
}

/// A square-cornered label (the brand keeps data elements sharp: no rounded corners, no shadows).
struct Badge: View {
    let text: String
    var color: Color = Theme.accent

    var body: some View {
        Text(text)
            .font(.system(.caption, design: .monospaced).weight(.semibold))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .foregroundStyle(color)
            .overlay(Rectangle().stroke(color, lineWidth: 1))
    }
}

/// A plain explanation shown where a part of the bundle is absent.
struct EmptyNote: View {
    let title: String
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.headline)
            Text(text).foregroundStyle(.secondary)
        }
        .padding()
        .frame(maxWidth: 640, alignment: .leading)
    }
}

/// Inline Markdown (bold, italics, code spans, links) inside one block of text.
func inlineMarkdown(_ text: String) -> AttributedString {
    (try? AttributedString(markdown: text, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)))
        ?? AttributedString(text)
}
