import SwiftUI
import TRINCKit

struct CitationsView: View {
    let bundle: DeliverableBundle
    @State private var query = ""
    @State private var status = "All"
    @State private var deliverable = CitationsView.allDeliverables

    static let attributionFilter = "Attribution mismatch"
    static let allDeliverables = "All deliverables"

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
        // T2-6: a graveyard memo can list over a thousand NCT numbers, so the report's own rows can be filtered out.
        let deliverables = ledger.summary.isSectioned
            ? Deliverables.inReadingOrder(ledger.citations.flatMap { $0.sections ?? [Deliverables.report] })
            : []
        let shown = ledger.citations.filter {
            let statusOK = status == "All"
                || (status == Self.attributionFilter ? $0.hasAttributionMismatch : $0.status == status)
            let deliverableOK = deliverable == Self.allDeliverables || $0.appears(in: deliverable)
            return statusOK && deliverableOK && (query.isEmpty || $0.id.localizedCaseInsensitiveContains(query))
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
                    if !deliverables.isEmpty {
                        Picker("Deliverable", selection: $deliverable) {
                            Text(Self.allDeliverables).tag(Self.allDeliverables)
                            ForEach(deliverables, id: \.self) { Text(Copy.deliverableTitle($0)).tag($0) }
                        }
                        .fixedSize()
                    }
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
        // The report's own counts (T2-6: `by_section.report` when recorded); the other deliverables
        // and every row of the ledger follow, each with the manifest's own figures.
        let report = summary.reportCounts
        Grid(alignment: .leading, horizontalSpacing: 18, verticalSpacing: 6) {
            row("Cited in the report", "\(report.total)")
            row("VERIFIED", "\(report.verified)", color: Theme.good)
            row("Unresolved", "\(report.unresolved)", color: report.unresolved > 0 ? Theme.bad : nil)
            row("Unchecked", "\(report.unchecked)", color: report.unchecked > 0 ? Theme.caution : nil)
            ForEach(summary.otherDeliverables) { other in
                row(Copy.deliverableTitle(other.section), Copy.tally(other.counts),
                    color: other.counts.unresolved > 0 ? Theme.bad : other.counts.unchecked > 0 ? Theme.caution : nil)
            }
            if summary.isSectioned {
                row("Every identifier in the ledger", Copy.tally(summary.counts))
                Text(Copy.sectionCountingNote).font(.caption).foregroundStyle(.secondary)
            }
            if let screen = summary.retractionScreen {
                row("Retraction screen", Copy.retractionScreen(screen),
                    color: screen.retractedCount > 0 ? Theme.bad : screen.checked == false ? Theme.caution : nil)
                if let unscreened = screen.unscreenedIds, !unscreened.isEmpty {
                    row("Not screened", unscreened.joined(separator: ", "))
                }
            }
            if let gate = summary.gateCrosscheck, let cited = gate.cited, let grounded = gate.grounded {
                let ratio = gate.groundedRatio.map { String(format: "%.1f%%", $0 * 100) } ?? "–"
                let floor = gate.minGroundedRatio.map { String(format: "%.0f%%", $0 * 100) } ?? "–"
                row("Grounded in the run's evidence", "\(grounded) of \(cited) (\(ratio); floor \(floor))")
            }
            if let asOf = summary.asOf { row("Checked as of", asOf) }
            if summary.reresolutionCompleted == false {
                row("Re-resolution", "did not complete: no identifier was looked up", color: Theme.bad)
            } else if let start = summary.verificationStartedAt, let end = summary.verificationCompletedAt {
                row("Re-resolution ran", "\(start) → \(end)")
            }
            if let table = summary.resolverTableVersion { row("Resolver table", table) }
            if summary.environment?.offline == true {
                row("Registries", "unreachable when the report was assembled (offline)", color: Theme.caution)
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
            if let sections = citation.sections, sections != [Deliverables.report] {
                Text("in " + sections.map(Copy.deliverableName).joined(separator: ", "))
                    .font(.caption).foregroundStyle(.secondary)
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
