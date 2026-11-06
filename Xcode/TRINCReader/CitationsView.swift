import SwiftUI
import TRINCKit

struct CitationsView: View {
    let bundle: DeliverableBundle
    @State private var query = ""
    @State private var status = "All"

    static let attributionFilter = "Attribution mismatch"

    var body: some View {
        if let ledger = bundle.citations {
            ledgerView(ledger)
        } else {
            EmptyNote(
                title: "No citation ledger",
                text: bundle.isSample ? Copy.sampleNoLedger : Copy.noLedger
            )
        }
    }

    private func ledgerView(_ ledger: ReproducibilityManifest) -> some View {
        var statuses = ["All"] + Set(ledger.citations.map(\.status)).sorted()
        if ledger.citations.contains(where: \.hasAttributionMismatch) { statuses.append(Self.attributionFilter) }
        let shown = ledger.citations.filter {
            let statusOK = status == "All"
                || (status == Self.attributionFilter ? $0.hasAttributionMismatch : $0.status == status)
            return statusOK && (query.isEmpty || $0.id.localizedCaseInsensitiveContains(query))
        }
        // One list, so the decision, the summary and the identifiers scroll together.
        return List {
            Section {
                VerdictPanel(bundle: bundle, ledger: ledger)
                    .listRowSeparator(.hidden)
                LedgerSummary(summary: ledger.summary)
                    .listRowSeparator(.hidden)
                Text(Copy.verifiedMeaning).font(.callout).foregroundStyle(.secondary)
            }
            Section {
                ForEach(shown) { citation in
                    CitationRow(citation: citation)
                }
            } header: {
                HStack {
                    TextField("Search identifiers", text: $query)
                        .textFieldStyle(.roundedBorder)
                        .frame(maxWidth: 320)
                    Picker("Status", selection: $status) {
                        ForEach(statuses, id: \.self) { Text($0).tag($0) }
                    }
                    .fixedSize()
                    Spacer()
                    Text("\(shown.count) shown").font(.caption).foregroundStyle(.secondary)
                }
                .padding(.vertical, 4)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
    }
}

struct LedgerSummary: View {
    let summary: ReproducibilityManifest.Summary

    var body: some View {
        Grid(alignment: .leading, horizontalSpacing: 18, verticalSpacing: 6) {
            row("Cited identifiers", "\(summary.counts.total)")
            row("VERIFIED at delivery", "\(summary.counts.verified)", color: Theme.good)
            row("Unresolved", "\(summary.counts.unresolved)", color: summary.counts.unresolved > 0 ? Theme.bad : nil)
            row("Unchecked", "\(summary.counts.unchecked)", color: summary.counts.unchecked > 0 ? Theme.caution : nil)
            if let screen = summary.retractionScreen {
                let retracted = (screen.retractedDois?.count ?? 0) + (screen.retractedPmids?.count ?? 0)
                row("Retraction screen", screen.checked == true ? "checked, \(retracted) retracted" : "not checked",
                    color: retracted > 0 ? Theme.bad : nil)
            }
            if let gate = summary.gateCrosscheck, let cited = gate.cited, let grounded = gate.grounded {
                let ratio = gate.groundedRatio.map { String(format: "%.1f%%", $0 * 100) } ?? "–"
                let floor = gate.minGroundedRatio.map { String(format: "%.0f%%", $0 * 100) } ?? "–"
                row("Grounded in the run's evidence", "\(grounded) of \(cited) (\(ratio); floor \(floor))")
            }
            if let asOf = summary.asOf { row("Checked as of", asOf) }
            if let start = summary.verificationStartedAt, let end = summary.verificationCompletedAt {
                row("Re-resolution ran", "\(start) → \(end)")
            }
            if let table = summary.resolverTableVersion { row("Resolver table", table) }
            if summary.environment?.offline == true {
                row("Registries", "unreachable at delivery (offline)", color: Theme.caution)
            }
        }
        .font(.callout)
    }

    private func row(_ label: String, _ value: String, color: Color? = nil) -> some View {
        GridRow {
            Text(label).foregroundStyle(.secondary)
            Text(value).font(.system(.callout, design: .monospaced)).foregroundStyle(color ?? .primary)
        }
    }
}

struct CitationRow: View {
    let citation: Citation

    var body: some View {
        HStack(spacing: 10) {
            Text(citation.type)
                .font(.system(.caption, design: .monospaced))
                .foregroundStyle(.secondary)
                .frame(width: 44, alignment: .leading)
            Text(citation.identifier)
                .font(.system(.callout, design: .monospaced))
                .textSelection(.enabled)
            if citation.groundedInRun == false {
                Text("not in the run's retrieved evidence").font(.caption).foregroundStyle(Theme.caution)
            }
            if !citation.isVerified, let why = Copy.unchecked(reason: citation.evidence?.reason) {
                Text(why).font(.caption).foregroundStyle(.secondary)
            }
            if let attribution = citation.attribution, attribution.isMismatch {
                Badge(text: attribution.status == "year_mismatch" ? "YEAR MISMATCH" : "AUTHOR MISMATCH", color: Theme.caution)
                    .help("Report says \(attribution.written?.label ?? "–"); registry lists \(attribution.registryLabel ?? "–")")
            }
            Spacer()
            Badge(text: citation.status, color: Theme.statusColor(citation.status))
            if let url = citation.registryURL {
                Link(destination: url) {
                    Image(systemName: "arrow.up.right.square")
                }
                .help("Open this record at its registry in your browser")
            }
        }
        .padding(.vertical, 2)
    }
}
