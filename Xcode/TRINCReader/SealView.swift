import SwiftUI
import TRINCKit

/// Recomputes every file's SHA-256 and compares it with the bundle's manifest.json.
struct SealView: View {
    let bundle: DeliverableBundle
    @State private var report: IntegrityReport?

    var body: some View {
        if bundle.manifest == nil {
            EmptyNote(
                title: "No seal",
                text: bundle.isSample ? Copy.sampleNoSeal
                    : "This bundle has no manifest.json, so its files cannot be checked against a seal."
            )
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if let report {
                        verdict(report)
                        Text(Copy.sealMeaning).font(.callout).foregroundStyle(.secondary)
                        rows(report)
                        if !report.uncovered.isEmpty {
                            Text("Not covered by the seal").font(.headline).padding(.top, 6)
                            Text(Copy.uncoveredMeaning).font(.callout).foregroundStyle(.secondary)
                            ForEach(report.uncovered, id: \.self) { path in
                                Text(path).font(.system(.callout, design: .monospaced))
                            }
                        }
                    } else {
                        ProgressView("Checking fingerprints…")
                    }
                }
                .padding()
                .frame(maxWidth: 960, alignment: .leading)
            }
            .task {
                let bundle = bundle
                report = await Task.detached(priority: .userInitiated) { bundle.verifyIntegrity() }.value
            }
        }
    }

    @ViewBuilder
    private func verdict(_ report: IntegrityReport) -> some View {
        if report.isIntact {
            Label("All \(report.rows.count) sealed files match their fingerprints.", systemImage: "checkmark.seal")
                .font(.title3.bold())
                .foregroundStyle(Theme.good)
        } else {
            let bad = report.mismatched + report.missing
            Label("\(bad) of \(report.rows.count) sealed files do not match the seal.", systemImage: "xmark.seal")
                .font(.title3.bold())
                .foregroundStyle(Theme.bad)
        }
    }

    private func rows(_ report: IntegrityReport) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(report.rows) { row in
                HStack(spacing: 10) {
                    switch row.status {
                    case .match:
                        Image(systemName: "checkmark").foregroundStyle(Theme.good)
                    case .mismatch:
                        Image(systemName: "xmark").foregroundStyle(Theme.bad)
                    case .missing:
                        Image(systemName: "questionmark").foregroundStyle(Theme.caution)
                    }
                    Text(row.file).font(.system(.callout, design: .monospaced))
                    Spacer()
                    Text(detail(row)).font(.system(.caption, design: .monospaced)).foregroundStyle(.secondary)
                }
            }
        }
    }

    private func detail(_ row: IntegrityReport.Row) -> String {
        switch row.status {
        case .match: return String(row.expected.prefix(16)) + "…"
        case .mismatch(let actual): return "expected \(row.expected.prefix(12))…, found \(actual.prefix(12))…"
        case .missing: return "missing from the bundle"
        }
    }
}
