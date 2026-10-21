"use strict";

/**
 * The compliance gate. Every draft goes through it; publishing re-runs it.
 *
 * This is the reason the server exists. An LLM can write a caption unaided — what it cannot do
 * reliably is refuse to write one. The checks below are mechanical applications of rules this
 * business already wrote down and currently enforces nowhere:
 *
 *   - the company/founder voice split      (01-brand-system/personal-brand.md)
 *   - the statutory entity disclosure      (Cal. Bus. & Prof. Code §17910.5(a))
 *   - retired claims that must not return  (OFFERINGS.md, commit 7801443)
 *   - no figure absent from the claim set  (the zero-fabrication doctrine)
 *   - no metric the stack cannot measure   (PLUGIN-BINDINGS.md unbound categories)
 *
 * Severity: "fail" blocks a publish; "warn" is advisory. checkDraft() never throws on content —
 * it reports. Throwing would let a caller lose the findings.
 *
 * @module check
 */

const {
  ENTITY_DISCLOSURE,
  RETIRED_CLAIMS,
  UNBOUNDED_METRICS
} = require("./config.js");
const { voiceRules } = require("./brand.js");

const VERIFY_SLOT = /\[VERIFY:\d+\]/g;

function finding(severity, code, message, detail) {
  return { severity, code, message, detail: detail || null };
}

/**
 * Numbers a draft states, excluding ones that are obviously not claims.
 * Deliberately conservative about what it ignores: a missed number produces a warning the
 * operator can dismiss, whereas over-ignoring would let a fabricated figure through.
 */
function statedNumbers(text) {
  const withoutSlots = text.replace(VERIFY_SLOT, " ");
  const found = [];
  const re = /(?<![\w.])(\d[\d,]*)(?:\.(\d+))?\s*(%|percent)?/g;
  let match;
  while ((match = re.exec(withoutSlots)) !== null) {
    const raw = match[0].trim();
    const numeric = Number(match[1].replace(/,/g, ""));
    if (!Number.isFinite(numeric)) continue;

    const before = withoutSlots.slice(Math.max(0, match.index - 24), match.index);
    // Hex colors, years, and times are not claims about the report.
    if (/#[0-9a-fA-F]*$/.test(before)) continue;
    if (/^(19|20)\d{2}$/.test(match[1]) && !match[3]) continue;
    if (/\bNCT$/.test(before)) continue;
    if (/[:.]\d*$/.test(before)) continue;

    found.push({ raw, value: numeric, isPercent: Boolean(match[3]) });
  }
  return found;
}

/** Values the claim set actually supports, flattened for comparison. */
function allowedValues(claims) {
  const values = new Set();
  for (const entry of claims || []) {
    if (typeof entry.value === "number") {
      values.add(entry.value);
    } else if (Array.isArray(entry.value)) {
      values.add(entry.value.length);
    }
  }
  return values;
}

/**
 * @param {object} draft  { channel, text, claims_used? }
 * @param {object} context { claims?: [], requireDisclosure?: boolean }
 */
function checkDraft(draft = {}, context = {}) {
  const channel = String(draft.channel || "");
  const text = String(draft.text || "");
  const claims = Array.isArray(context.claims) ? context.claims : [];
  const findings = [];

  if (!text.trim()) {
    findings.push(finding("fail", "EMPTY_DRAFT", "Draft is empty."));
    return summarize(findings, text, claims);
  }

  /* ---- voice ---- */
  const rules = voiceRules(channel);
  if (!rules.known) {
    findings.push(finding("fail", "VOICE_UNKNOWN",
      `No declared voice for channel '${channel}'.`,
      "Add trinc_voice to this channel in config/platform-targets.json. The voice is never guessed."));
  } else {
    if (!text.includes(rules.use)) {
      findings.push(finding("warn", "VOICE_LOCKUP_ABSENT",
        `Draft does not carry the ${rules.voice} lockup this channel requires.`,
        rules.use));
    }
    if (text.includes(rules.forbid)) {
      findings.push(finding("fail", "VOICE_MIXED",
        `Draft carries the wrong lockup for a ${rules.voice}-voice channel.`,
        `personal-brand.md's do-not-mix table forbids this. Remove: "${rules.forbid}"`));
    }
  }

  /* ---- disclosure ---- */
  if (context.requireDisclosure !== false && !text.includes(ENTITY_DISCLOSURE)) {
    findings.push(finding("fail", "DISCLOSURE_MISSING",
      "Required entity disclosure is absent or altered.",
      `Must appear verbatim: ${ENTITY_DISCLOSURE}`));
  }

  /* ---- retired claims ---- */
  for (const retired of RETIRED_CLAIMS) {
    const hit = text.match(retired.pattern);
    if (hit) {
      findings.push(finding("fail", "RETIRED_CLAIM",
        `Draft uses a claim this business retired: "${hit[0]}".`,
        `Retired in ${retired.retired}. ${retired.instead}`));
    }
  }

  /* ---- metrics the stack cannot measure ---- */
  const lower = text.toLowerCase();
  for (const metric of UNBOUNDED_METRICS) {
    const re = new RegExp(`\\b\\d[\\d,.]*\\s*(?:\\w+\\s+){0,2}${metric}\\b`, "i");
    const hit = text.match(re) || (lower.includes(`${metric}:`) ? [metric] : null);
    if (hit) {
      findings.push(finding("fail", "UNBOUNDED_METRIC",
        `Draft states '${metric}', which nothing in this stack can measure.`,
        "PLUGIN-BINDINGS.md records marketing analytics as explicitly UNBOUND. "
        + "An unbound category means say so — never produce a number for it."));
    }
  }

  /* ---- figures not in the claim set ---- */
  const allowed = allowedValues(claims);
  const unsupported = [];
  for (const number of statedNumbers(text)) {
    if (!allowed.has(number.value)) {
      unsupported.push(number.raw);
    }
  }
  if (unsupported.length > 0) {
    findings.push(finding(
      claims.length === 0 ? "warn" : "fail",
      "FIGURE_NOT_IN_CLAIM_SET",
      `Draft states figure(s) that did not come from the source bundle: ${unsupported.join(", ")}.`,
      claims.length === 0
        ? "No claims were supplied to check against. Pass the content_extract_claims result as `claims`."
        : "Every figure must trace to a deliverable. Replace it with a [VERIFY:n] slot or remove it."
    ));
  }

  /* ---- unfilled slots are information, not an error ---- */
  const slots = text.match(VERIFY_SLOT) || [];
  if (slots.length > 0) {
    findings.push(finding("warn", "UNFILLED_VERIFY_SLOTS",
      `${slots.length} unfilled VERIFY slot(s) remain: ${Array.from(new Set(slots)).join(", ")}.`,
      "Fill each from the named deliverable before posting. This is a draft, not a defect."));
  }

  return summarize(findings, text, claims);
}

function summarize(findings, text, claims) {
  const fails = findings.filter((entry) => entry.severity === "fail");
  return {
    pass: fails.length === 0,
    verdict: fails.length === 0 ? "PASS" : "FAIL",
    fail_count: fails.length,
    warn_count: findings.length - fails.length,
    findings,
    checked_against_claims: claims.length,
    characters: text.length
  };
}

module.exports = { checkDraft, statedNumbers };
