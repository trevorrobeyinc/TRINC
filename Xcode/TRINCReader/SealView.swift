import SwiftUI
import TRINCKit

/// Recomputes every file's SHA-256 against manifest.json, then cross-checks checksums.txt and the
/// approval record's bundle fingerprint.
struct SealView: View {
    let bundle: DeliverableBundle
    @State private var report: SealReport?

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
                        checks(report)
                        Text(Copy.sealLimit).font(.caption).foregroundStyle(.secondary)
                        Text("Sealed files").font(.headline).padding(.top, 6)
                        Text(Copy.sealMeaning).font(.callout).foregroundStyle(.secondary)
                        rows(report.fingerprints)
                        if report.fingerprints.textMatched > 0 {
                            Text(Copy.textMatchMeaning).font(.caption).foregroundStyle(.secondary)
                        }
                        fileList("Added after sealing", Copy.postSealMeaning, report.fingerprints.postSeal)
                        fileList("Not covered by the seal", Copy.uncoveredMeaning, report.fingerprints.uncovered, warn: true)
                    } else {
                        ProgressView("Checking fingerprints…")
                    }
                }
                .padding()
                .frame(maxWidth: 960, alignment: .leading)
            }
            .task {
                let bundle = bundle
                report = await Task.detached(priority: .userInitiated) { bundle.verifySeal() }.value
            }
        }
    }

    @ViewBuilder
    private func verdict(_ report: SealReport) -> some View {
        let f = report.fingerprints
        if report.isIntact {
            Label("All \(f.rows.count) sealed files match their fingerprints.", systemImage: "checkmark.seal")
                .font(.title3.bold())
                .foregroundStyle(Theme.good)
        } else if !f.isIntact {
            let bad = f.mismatched + f.missing
            Label("\(bad) of \(f.rows.count) sealed files do not match the seal.", systemImage: "xmark.seal")
                .font(.title3.bold())
                .foregroundStyle(Theme.bad)
        } else {
            Label("The files match manifest.json, but the bundle's own records disagree.", systemImage: "xmark.seal")
                .font(.title3.bold())
                .foregroundStyle(Theme.bad)
        }
    }

    private func checks(_ report: SealReport) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            check(
                ok: report.fingerprints.isIntact,
                title: "Fingerprints match manifest.json",
                detail: "\(report.fingerprints.matched) of \(report.fingerprints.rows.count) files match."
            )
            switch report.checksums {
            case .agrees(let count):
                check(ok: true, title: "checksums.txt agrees", detail: "\(count) entries, the same as manifest.json. " + Copy.checksumsMeaning)
            case .disagrees(let problems):
                check(ok: false, title: "checksums.txt disagrees with manifest.json", detail: problems.joined(separator: "\n"))
            case .absent:
                check(ok: nil, title: "No checksums.txt", detail: "The bundle carries no checksums.txt to compare.")
            case .unreadable(let why):
                check(ok: false, title: "checksums.txt could not be read", detail: why)
            }
            switch report.approval {
            case .matches(let at):
                check(ok: true, title: "Matches the approved release",
                      detail: (at.map { "Approved \($0). " } ?? "") + Copy.approvalMeaning)
            case .differs(let expected, let actual):
                check(ok: false, title: "Does not match the approved release",
                      detail: "The approval record holds \(expected.prefix(16))…; these files give \(actual.prefix(16))….")
            case .incomplete:
                check(ok: nil, title: "Approved release not re-checked",
                      detail: "A sealed file is missing, so the approval fingerprint cannot be recomputed.")
            case .absent:
                check(ok: nil, title: "No approval record", detail: "The bundle carries no release-approval.json.")
            case .unreadable:
                check(ok: false, title: "The approval record could not be read", detail: "release-approval.json has no readable bundle fingerprint.")
            }
        }
    }

    /// `ok`: true passed, false failed, nil not available.
    private func check(ok: Bool?, title: String, detail: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: ok == true ? "checkmark" : ok == false ? "xmark" : "minus")
                .foregroundStyle(ok == true ? Theme.good : ok == false ? Theme.bad : Theme.caution)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.callout.weight(.semibold))
                Text(detail).font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private func fileList(_ title: String, _ meaning: String, _ paths: [String], warn: Bool = false) -> some View {
        if !paths.isEmpty {
            Text(title).font(.headline).padding(.top, 6).foregroundStyle(warn ? Theme.caution : .primary)
            Text(meaning).font(.callout).foregroundStyle(.secondary)
            ForEach(paths, id: \.self) { path in
                Text(path).font(.system(.callout, design: .monospaced))
            }
        }
    }

    private func rows(_ report: IntegrityReport) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(report.rows) { row in
                HStack(spacing: 10) {
                    switch row.status {
                    case .match:
                        Image(systemName: "checkmark").foregroundStyle(Theme.good)
                    case .textMatch:
                        Image(systemName: "checkmark").foregroundStyle(Theme.caution)
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
        case .textMatch: return String(row.expected.prefix(16)) + "… (as text)"
        case .mismatch(let actual): return "expected \(row.expected.prefix(12))…, found \(actual.prefix(12))…"
        case .missing: return "missing from the bundle"
        }
    }
}
