import SwiftUI
import TRINCKit

/// The delivery decision, every flag or block reason explained, the attribution check, and any
/// place the decision disagrees with its own ledger. Shown at the top of the Citations tab.
struct VerdictPanel: View {
    let bundle: DeliverableBundle
    let ledger: ReproducibilityManifest

    var body: some View {
        let verdict = DeliveryVerdict(summary: ledger.summary)
        let findings = bundle.ledgerFindings
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: icon(verdict)).foregroundStyle(color(verdict))
                Text(verdict.recordedValue ?? "No decision recorded")
                    .font(.system(.title3, design: .monospaced).weight(.bold))
                    .foregroundStyle(color(verdict))
            }
            Text(meaning(verdict)).font(.callout)
            if verdict.usesLegacyLayout {
                Text(Copy.legacyLayout).font(.caption).foregroundStyle(.secondary)
            }
            ForEach(verdict.blockReasons, id: \.self) { code in
                ReasonRow(code: code, color: Theme.bad)
            }
            ForEach(verdict.flags, id: \.self) { code in
                ReasonRow(code: code, color: Theme.caution)
            }
            AttributionSection(ledger: ledger)
            if !findings.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Label(Copy.ledgerContradiction, systemImage: "exclamationmark.octagon")
                        .font(.headline).foregroundStyle(Theme.bad)
                    ForEach(Array(findings.enumerated()), id: \.offset) { _, finding in
                        Text("• " + Copy.finding(finding)).font(.callout)
                    }
                }
                .padding(.top, 4)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(Rectangle().stroke(color(verdict).opacity(0.6), lineWidth: 1))
    }

    private func meaning(_ verdict: DeliveryVerdict) -> String {
        switch verdict.decision {
        case .deliver: return Copy.deliverMeaning
        case .deliverWithFlags: return Copy.flaggedMeaning
        case .block: return Copy.blockMeaning + " " + Brand.contact
        case .other: return Copy.unknownDecisionMeaning
        case .unrecorded: return Copy.noDecisionMeaning
        }
    }

    private func icon(_ verdict: DeliveryVerdict) -> String {
        switch verdict.decision {
        case .deliver: return "checkmark.seal"
        case .deliverWithFlags: return "flag"
        case .block: return "xmark.octagon"
        case .other, .unrecorded: return "questionmark.circle"
        }
    }

    private func color(_ verdict: DeliveryVerdict) -> Color {
        switch verdict.decision {
        case .deliver: return Theme.good
        case .block: return Theme.bad
        default: return Theme.caution
        }
    }
}

private struct ReasonRow: View {
    let code: String
    let color: Color

    var body: some View {
        let text = Copy.reason(code)
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 8) {
                Badge(text: code, color: color)
                Text(text.title).font(.callout.weight(.semibold))
            }
            Text(text.detail).font(.callout).foregroundStyle(.secondary)
        }
    }
}

/// The attribution check: the mismatches the engine found, its counts, or why there is none.
private struct AttributionSection: View {
    let ledger: ReproducibilityManifest

    var body: some View {
        if let check = ledger.summary.attributionCheck {
            VStack(alignment: .leading, spacing: 6) {
                Text("Attribution check").font(.headline).padding(.top, 4)
                if check.checked != true {
                    Text("Not completed this run" + (check.error.map { " (\($0))" } ?? "") + ": no attribution is asserted either way.")
                        .font(.callout)
                } else {
                    let k = check.counts
                    Text("\(k?.checked ?? 0) checked · \(k?.matched ?? 0) match · \(k?.mismatched ?? 0) mismatch · \(k?.notChecked ?? 0) not checkable")
                        .font(.system(.callout, design: .monospaced))
                    if let mismatches = check.mismatches, !mismatches.isEmpty {
                        Grid(alignment: .leading, horizontalSpacing: 14, verticalSpacing: 4) {
                            GridRow {
                                Text("Identifier"); Text("Report says"); Text("Registry lists"); Text("")
                            }
                            .font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                            ForEach(mismatches) { m in
                                GridRow {
                                    HStack(spacing: 4) {
                                        Text(m.type).foregroundStyle(.secondary)
                                        if let url = Registry.recordURL(type: m.type, identifier: m.id) {
                                            Link(m.id, destination: url)
                                        } else {
                                            Text(m.id)
                                        }
                                    }
                                    .font(.system(.callout, design: .monospaced))
                                    Text(m.written?.label ?? "–").font(.callout)
                                    Text(m.registryLabel ?? "–").font(.callout)
                                    Badge(text: m.isYearOnly ? "YEAR MISMATCH" : "AUTHOR MISMATCH", color: Theme.caution)
                                }
                            }
                        }
                    }
                    Text(Copy.attributionScope).font(.caption).foregroundStyle(.secondary)
                }
            }
        } else if ledger.citations.contains(where: { $0.type == "DOI" || $0.type == "PMID" }) {
            Text(Copy.attributionNotRecorded).font(.caption).foregroundStyle(.secondary).padding(.top, 2)
        }
    }
}

/// One line for the bundle header: the decision and its flags.
struct VerdictLine: View {
    let verdict: DeliveryVerdict

    var body: some View {
        HStack(spacing: 6) {
            if let value = verdict.recordedValue {
                Badge(text: value, color: Theme.statusColor(value))
            }
            ForEach(verdict.blockReasons, id: \.self) { code in
                Text(Copy.reason(code).title).font(.caption).foregroundStyle(Theme.bad)
            }
            ForEach(verdict.flags, id: \.self) { code in
                Text(Copy.reason(code).title).font(.caption).foregroundStyle(Theme.caution)
            }
        }
    }
}
