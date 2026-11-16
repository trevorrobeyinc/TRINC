import SwiftUI
import TRINCKit

/// Fixed customer-facing copy. Wording comes from the brand canon (the brand-check skill and
/// OFFERINGS.md): do not paraphrase it here. The disclosure is a legal requirement
/// (Cal. Bus. & Prof. Code §17910.5(a)) on every customer-facing surface.
enum Brand {
    static let wordmark = "Trevor Robey, INC."
    static let disclosure = "Trevor Robey, INC. is the wordmark of Trevor Robey Intelligence Network Citations LLC, a California limited liability company."
    static let tagline = "Every citation, checked. Every risk, named. In days, not weeks."
    static let elevator = "Citation-traced biomedical due diligence for biotech investors and pharma BD. Five days. Every cited paper and trial checked twice, against the evidence retrieved and at its registry, with retractions screened and anything unconfirmed flagged. Audit trail included."
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
    static let checksumsMeaning = "checksums.txt is the same list in plain text, written at the same moment as manifest.json. The two must agree entry for entry."
    static let approvalMeaning = "release-approval.json holds one fingerprint of the whole set of sealed files, taken when the release was approved. Recomputing it here shows these files are the set that was approved."
    static let sealLimit = "These checks reveal any change made after sealing unless the records were rewritten to match. They are not a digital signature: the bundle carries no key."
    static let textMatchMeaning = "Matched as text: the file holds bytes that are not valid UTF-8, and the engine fingerprints files as decoded text, so the match covers the text, not every byte."
    static let postSealMeaning = "Written by the engine after sealing: the release approval and the records of each export and submission. The seal does not cover them, by design."
    static let uncoveredMeaning = "These files are in the bundle but are neither sealed nor one of the engine's own post-seal records, so the seal says nothing about them. A bundle as the engine wrote it has none."
    static let sampleNoSeal = "Samples are excerpts and carry no seal. A delivered bundle includes manifest.json with a fingerprint for every file."
    static let sampleNoLedger = "Samples are excerpts. A delivered bundle carries its full citation ledger (reproducibility-manifest.json), listed here identifier by identifier."
    static let noLedger = "This bundle has no deliverables/reproducibility-manifest.json, so there is no delivery decision and no per-identifier record to show. Bundles sealed before the manifest existed (July 2026) do not carry one."

    // Delivery decision (the engine's policy, openclaw-bridge/core/reproducibility-manifest.js).
    static let deliverMeaning = "Delivered with the full-strength claim: every cited identifier was re-resolved and recorded VERIFIED at delivery, and none is retracted."
    static let flaggedMeaning = "Delivered with a restricted claim. The report ships; each flag below names the part of the full-strength claim that does not hold."
    static let blockMeaning = "The engine blocked this report. A blocked report is a hard stop and is not meant to reach a buyer. Contact us before relying on any part of it."
    static let unknownDecisionMeaning = "This decision is not one this app knows. It is shown exactly as the bundle records it."
    static let noDecisionMeaning = "The citation ledger records no delivery decision."
    static let legacyLayout = "This bundle records its flag in the earlier layout, under block reasons. The report shipped; the reason is shown here as a flag, which is how the engine records it today."
    static let attributionNotRecorded = "No attribution check is recorded in this bundle (it was sealed before 2026-11-04, when the check was added), so the authors and years written beside its DOIs and PMIDs were not compared with their registry records."
    static let attributionScope = "A citation is checked only where the report names a single author beside it. This checks who wrote the cited work and when, not what the report says about it."
    static let ledgerContradiction = "The decision disagrees with its own ledger"

    /// A plain explanation of one of the engine's reason codes. Unknown codes are shown as written.
    static func reason(_ code: String) -> (title: String, detail: String) {
        switch code {
        case "unchecked_over_threshold":
            return ("Some identifiers were not re-checked",
                    "A registry could not be reached or throttled the check at delivery, so some identifiers are UNCHECKED. UNCHECKED is never counted as VERIFIED, and it is not a failure: only an UNRESOLVED identifier or a retraction blocks delivery.")
        case "attribution_mismatch":
            return ("An author or year does not match the registry",
                    "Each flagged identifier resolves to a real record, but the author or year the report writes beside it is not the record's. Each is listed below and marked [ATTRIBUTION MISMATCH] in the report. Correct the attribution before relying on it.")
        case "unresolved_present":
            return ("An identifier did not resolve", "At least one cited identifier is UNRESOLVED: its issuing registry reports no such record.")
        case "retracted_doi":
            return ("A cited DOI is retracted", "Crossref or PubMed records a cited DOI's work as retracted.")
        case "retracted_pmid":
            return ("A cited PMID is retracted", "PubMed records a cited PMID's work as a retracted publication.")
        case "gate_fail":
            return ("The citation gate failed", "Too few of the report's citations were found in the evidence the run retrieved.")
        default:
            return (code, "A reason code this app does not know, shown as the bundle records it.")
        }
    }

    static func finding(_ finding: LedgerFinding) -> String {
        switch finding {
        case .countsDisagree(let recorded, let tallied):
            return "The summary says \(recorded.verified) of \(recorded.total) VERIFIED, but the identifiers listed tally \(tallied.verified) of \(tallied.total) (\(tallied.unresolved) unresolved, \(tallied.unchecked) unchecked)."
        case .shippedWithUnresolved(let n):
            return "\(n) identifier\(n == 1 ? " is" : "s are") UNRESOLVED, yet the recorded decision lets the report ship. The engine blocks on any."
        case .shippedWithRetraction(let n):
            return "The retraction screen lists \(n) retracted work\(n == 1 ? "" : "s"), yet the recorded decision lets the report ship. The engine blocks on any."
        case .missingFlag(let code):
            return "The ledger requires the flag \"\(code)\" (\(reason(code).title.lowercased())), but the bundle does not record it."
        case .fullStrengthWithFlags(let flags):
            return "DELIVER is recorded beside flags (\(flags.joined(separator: ", "))); the full-strength claim allows none."
        case .blockWithoutReason:
            return "BLOCK is recorded with no block reason."
        case .flaggedWithoutReason:
            return "DELIVER_WITH_FLAGS is recorded with no flag."
        }
    }

    static func unchecked(reason: String?) -> String? {
        switch reason {
        case "rate_limited": return "registry throttled the check"
        case "timeout": return "registry timed out"
        case "network_error": return "registry unreachable"
        case "http_5xx": return "registry error"
        case "unexpected_status": return "unexpected registry answer"
        case "unparseable": return "registry answer unreadable"
        case "resource_not_found": return "no such record"
        case "cannot_get_document_summary": return "no such PubMed record"
        case let other?: return other.replacingOccurrences(of: "_", with: " ")
        case nil: return nil
        }
    }
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

/// Inline Markdown (bold, italics, code spans, links) inside one block of text. The engine's inline
/// marks ("[ATTRIBUTION MISMATCH: …]", "[UNVERIFIED]") are drawn in the caution colour so a reader
/// cannot miss them in a long report.
func inlineMarkdown(_ text: String) -> AttributedString {
    var attributed = (try? AttributedString(markdown: text, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)))
        ?? AttributedString(text)
    for mark in InlineMarks.attributionMarks(in: text) + [InlineMarks.unverified] {
        var searchStart = attributed.startIndex
        while searchStart < attributed.endIndex,
              let found = attributed[searchStart...].range(of: mark) {
            attributed[found].foregroundColor = Theme.caution
            attributed[found].inlinePresentationIntent = .stronglyEmphasized
            searchStart = found.upperBound
        }
    }
    return attributed
}
