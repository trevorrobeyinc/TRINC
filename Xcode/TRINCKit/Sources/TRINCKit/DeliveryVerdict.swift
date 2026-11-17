import Foundation

/// The delivery decision a bundle's reproducibility manifest records, read the way the engine's
/// policy defines it (`openclaw-bridge/core/reproducibility-manifest.js`):
///
/// - `DELIVER`: ships with the full-strength claim (every cited id re-resolved VERIFIED, nothing retracted,
///   no attribution mismatch).
/// - `DELIVER_WITH_FLAGS`: ships, with a restricted claim. `flag_reasons` says why.
/// - `BLOCK`: a hard stop. The engine does not export a blocked report, so a buyer holding one has a
///   bundle that should not have left the operator.
public struct DeliveryVerdict: Sendable, Equatable {
    public enum Decision: Sendable, Equatable {
        case deliver
        case deliverWithFlags
        case block
        /// A value this app does not know (a newer engine), shown as written.
        case other(String)
        case unrecorded
    }

    /// The engine's reason codes (stable strings written into sealed bundles).
    public enum Reason {
        public static let uncheckedOverThreshold = "unchecked_over_threshold"
        public static let attributionMismatch = "attribution_mismatch"
        /// T1-7 (2026-11-14): the retraction screen could not screen every cited DOI, PMID and PMCID.
        public static let retractionScreenIncomplete = "retraction_screen_incomplete"
        public static let unresolvedPresent = "unresolved_present"
        public static let retractedDoi = "retracted_doi"
        public static let retractedPmid = "retracted_pmid"
        /// T2-16 (2026-11-16).
        public static let retractedPmcid = "retracted_pmcid"
        public static let gateFail = "gate_fail"
    }

    public let decision: Decision
    /// Soft disclosures that restrict the claim but still ship.
    public let flags: [String]
    /// Hard stops. Empty for any decision that ships.
    public let blockReasons: [String]
    /// True when a shipped report recorded its flags under `block_reasons`, the layout used before
    /// the engine's Q8 change (2026-07). Those reasons are read as flags here, because the engine's
    /// own rule is that a report that ships never lists a block reason.
    public let usesLegacyLayout: Bool
    /// True on the fallback manifest the engine seals when its re-resolution pass crashed
    /// (`reresolution_completed: false`, T1-8): no identifier was looked up, and the engine's delivery
    /// tools refuse the bundle, although the recorded decision reads DELIVER_WITH_FLAGS.
    public let reresolutionIncomplete: Bool

    public init(summary: ReproducibilityManifest.Summary) {
        let raw = summary.deliveryDecision?.trimmingCharacters(in: .whitespaces) ?? ""
        let decision: Decision
        switch raw.uppercased() {
        case "DELIVER": decision = .deliver
        case "DELIVER_WITH_FLAGS": decision = .deliverWithFlags
        case "BLOCK": decision = .block
        case "": decision = .unrecorded
        default: decision = .other(raw)
        }
        var flags = summary.flagReasons ?? []
        var blocks = summary.blockReasons ?? []
        var legacy = false
        if decision == .deliverWithFlags, flags.isEmpty, !blocks.isEmpty {
            flags = blocks
            blocks = []
            legacy = true
        }
        self.decision = decision
        self.flags = flags
        self.blockReasons = blocks
        self.usesLegacyLayout = legacy
        self.reresolutionIncomplete = summary.reresolutionCompleted == false
    }

    /// The manifest's own spelling of the decision ("DELIVER_WITH_FLAGS"), or nil when none was recorded.
    public var recordedValue: String? {
        switch decision {
        case .deliver: return "DELIVER"
        case .deliverWithFlags: return "DELIVER_WITH_FLAGS"
        case .block: return "BLOCK"
        case .other(let value): return value
        case .unrecorded: return nil
        }
    }

    /// True when the engine let the report ship; nil when the decision is missing or unknown. False
    /// after a crashed re-resolution pass, which the delivery tools refuse whatever the decision says.
    public var ships: Bool? {
        if reresolutionIncomplete { return false }
        switch decision {
        case .deliver, .deliverWithFlags: return true
        case .block: return false
        case .other, .unrecorded: return nil
        }
    }

    public var hasAttributionFlag: Bool { flags.contains(Reason.attributionMismatch) }
}

/// Something in the ledger that contradicts the decision recorded beside it.
public enum LedgerFinding: Sendable, Equatable {
    /// `summary.counts` is not the tally of the per-identifier statuses listed below it.
    case countsDisagree(recorded: ReproducibilityManifest.Counts, tallied: ReproducibilityManifest.Counts)
    /// A deliverable's `summary.by_section` counts are not the tally of the rows tagged with it (T2-6).
    case sectionCountsDisagree(section: String, recorded: ReproducibilityManifest.Counts, tallied: ReproducibilityManifest.Counts)
    /// The report shipped although identifiers are UNRESOLVED (the engine blocks on any).
    case shippedWithUnresolved(Int)
    /// The report shipped although the retraction screen lists retracted works.
    case shippedWithRetraction(Int)
    /// A required flag is missing from a report that shipped.
    case missingFlag(String)
    /// `DELIVER` (the full-strength claim) recorded beside flags.
    case fullStrengthWithFlags([String])
    /// `BLOCK` recorded with no block reason.
    case blockWithoutReason
    /// `DELIVER_WITH_FLAGS` recorded with no flag.
    case flaggedWithoutReason
}

/// Re-derives, from the per-identifier ledger, what the engine's delivery policy requires, and
/// reports every place the recorded decision disagrees. The seal proves the file was not changed
/// after delivery; this proves the decision inside it is the one its own evidence supports.
///
/// The engine's rules (reproducibility-manifest.js, `buildReproducibilityManifest`), over every row
/// of the ledger (since T2-6 that includes the NCT numbers the graveyard memo and the benchmark list):
/// - any UNRESOLVED id blocks, unless `thresholds.block_on_unresolved` is false;
/// - any retracted DOI, PMID or (T2-16) PMCID blocks;
/// - otherwise UNCHECKED ids above `max_unchecked_ratio` (default 0) flag `unchecked_over_threshold`
///   (since T1-6 decided on integers, so any UNCHECKED id at 0; before it, on the ratio rounded to
///   3 places), any attribution mismatch flags `attribution_mismatch`, and (T1-7) a retraction screen
///   that records its coverage but did not screen everything flags `retraction_screen_incomplete`;
/// - `DELIVER` only with no flag. A gate hard-fail also blocks, but the manifest does not record
///   the gate's verdict, so a `gate_fail` BLOCK is taken as written.
public enum LedgerCheck {
    public static func findings(in ledger: ReproducibilityManifest) -> [LedgerFinding] {
        var out: [LedgerFinding] = []
        let summary = ledger.summary
        let verdict = DeliveryVerdict(summary: summary)

        let tallied = tally(ledger.citations)
        if tallied != summary.counts {
            out.append(.countsDisagree(recorded: summary.counts, tallied: tallied))
        }
        // T2-6: each deliverable's counts are the tally of the rows tagged with it (an untagged row is
        // the report's). The report's figure shown to a buyer comes from them, so they are checked too.
        if let recorded = summary.bySection, !recorded.isEmpty {
            var rows: [String: [Citation]] = [:]
            for c in ledger.citations {
                for section in c.sections ?? [Deliverables.report] { rows[section, default: []].append(c) }
            }
            let zero = ReproducibilityManifest.Counts(total: 0, verified: 0, unresolved: 0, unchecked: 0)
            for section in Deliverables.inReadingOrder(Array(recorded.keys) + Array(rows.keys)) {
                let want = recorded[section] ?? zero, got = rows[section].map { tally($0) } ?? zero
                if want != got { out.append(.sectionCountsDisagree(section: section, recorded: want, tallied: got)) }
            }
        }

        let retracted = summary.retractionScreen?.retractedCount ?? 0
        let blocksOnUnresolved = summary.thresholds?.blockOnUnresolved ?? true

        switch verdict.decision {
        case .deliver, .deliverWithFlags:
            if blocksOnUnresolved && tallied.unresolved > 0 { out.append(.shippedWithUnresolved(tallied.unresolved)) }
            if retracted > 0 { out.append(.shippedWithRetraction(retracted)) }
            for flag in requiredFlags(ledger: ledger, tallied: tallied) where !verdict.flags.contains(flag) {
                out.append(.missingFlag(flag))
            }
            if verdict.decision == .deliver && !verdict.flags.isEmpty {
                out.append(.fullStrengthWithFlags(verdict.flags))
            }
            if verdict.decision == .deliverWithFlags && verdict.flags.isEmpty {
                out.append(.flaggedWithoutReason)
            }
        case .block:
            if verdict.blockReasons.isEmpty { out.append(.blockWithoutReason) }
        case .other, .unrecorded:
            break
        }
        return out
    }

    /// The flags the engine's policy requires for a report that ships, from the ledger alone.
    static func requiredFlags(ledger: ReproducibilityManifest, tallied: ReproducibilityManifest.Counts) -> [String] {
        var flags: [String] = []
        let summary = ledger.summary
        let maxUnchecked = summary.thresholds?.maxUncheckedRatio ?? 0
        if tallied.total > 0 {
            let over: Bool
            if summary.writtenSinceTier1 {
                // T1-6: on integers, so 1 UNCHECKED id in 2,001 or more is never read as none.
                over = maxUnchecked == 0
                    ? tallied.unchecked > 0
                    : tallied.unchecked * 1000 > Int((maxUnchecked * 1000).rounded()) * tallied.total
            } else {
                let ratio = (Double(tallied.unchecked) / Double(tallied.total) * 1000).rounded() / 1000
                over = ratio > maxUnchecked
            }
            if over { flags.append(DeliveryVerdict.Reason.uncheckedOverThreshold) }
        }
        let summaryMismatches = summary.attributionCheck?.mismatches?.count ?? 0
        let citationMismatches = ledger.citations.filter(\.hasAttributionMismatch).count
        if summaryMismatches > 0 || citationMismatches > 0 {
            flags.append(DeliveryVerdict.Reason.attributionMismatch)
        }
        if let screen = summary.retractionScreen, screen.recordsCoverage, screen.checked == false {
            flags.append(DeliveryVerdict.Reason.retractionScreenIncomplete)
        }
        return flags
    }

    /// The engine's bucket rule: VERIFIED, UNRESOLVED, anything else counts as unchecked.
    static func tally(_ citations: [Citation]) -> ReproducibilityManifest.Counts {
        var verified = 0, unresolved = 0, unchecked = 0
        for c in citations {
            switch c.status {
            case "VERIFIED": verified += 1
            case "UNRESOLVED": unresolved += 1
            default: unchecked += 1
            }
        }
        return .init(total: citations.count, verified: verified, unresolved: unresolved, unchecked: unchecked)
    }
}

/// Inline marks the engine writes into shipped report text.
public enum InlineMarks {
    /// `[ATTRIBUTION MISMATCH: registry lists …]` (citation-attribution.js, 2026-11-04).
    public static let attributionPrefix = "[ATTRIBUTION MISMATCH"
    /// `[UNVERIFIED]` beside a cited id that was not in the run's retrieved evidence (citation-gate.js).
    public static let unverified = "[UNVERIFIED]"

    /// Every attribution mark in `text`, whole (`[ATTRIBUTION MISMATCH: registry lists Feldman et al., 2022]`).
    public static func attributionMarks(in text: String) -> [String] {
        var marks: [String] = []
        var rest = text[...]
        while let start = rest.range(of: attributionPrefix) {
            guard let close = rest[start.upperBound...].firstIndex(of: "]") else { break }
            marks.append(String(rest[start.lowerBound...close]))
            rest = rest[rest.index(after: close)...]
        }
        return marks
    }

    public static func unverifiedCount(in text: String) -> Int {
        text.components(separatedBy: unverified).count - 1
    }
}
