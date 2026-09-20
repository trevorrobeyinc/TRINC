"use strict";

/**
 * Builds a channel-shaped draft from a source bundle's extracted claims, and writes it into
 * the existing collateral tree.
 *
 * Nothing here invents a figure. A claim that exists is stated with its source file; a figure
 * the bundle does not support becomes a [VERIFY:n] slot naming the deliverable to read it from.
 * That asymmetry is the whole design: an unfilled slot is visible, a fabricated number is not.
 *
 * @module draft
 */

const fs = require("node:fs");
const path = require("node:path");

const { ENTITY_DISCLOSURE, paths } = require("./config.js");
const { voiceRules } = require("./brand.js");
const { extractClaims } = require("./sources.js");
const { checkDraft } = require("./check.js");

const CHANNEL_SHAPE = {
  youtube: { caption_limit: 5000, form: "long-form video description + script" },
  tiktok: { caption_limit: 2200, form: "short-form vertical video script" },
  instagram: { caption_limit: 2200, form: "short-form vertical video or carousel" },
  facebook_page: { caption_limit: 63206, form: "company page post" },
  aws_data_exchange: { caption_limit: 4000, form: "marketplace listing copy" }
};

function byId(claims) {
  const map = new Map();
  for (const entry of claims) map.set(entry.id, entry);
  return map;
}

/**
 * A stated value when the bundle supports it, a VERIFY slot when it does not.
 *
 * Records the claim in `used` at substitution time rather than inferring it afterwards by
 * searching the finished text: a substring search reports `0` as "used" because it occurs
 * inside `50`, which would make the audit trail wrong in exactly the direction that matters.
 */
function valueOrSlot(map, id, slots, used, wants, readFrom, note) {
  const entry = map.get(id);
  if (entry && (typeof entry.value === "number" || typeof entry.value === "string")) {
    used.push({ id: entry.id, value: entry.value, source_file: entry.source_file });
    return { text: String(entry.value), sourced: true, source_file: entry.source_file };
  }
  const slotId = slots.length + 1;
  slots.push({ id: slotId, wants, read_from: readFrom, note: note || null });
  return { text: `[VERIFY:${slotId}]`, sourced: false, source_file: null };
}

function buildBody(channel, voice, claimMap, slots, used) {
  const isFounder = voice === "founder";

  const grounded = valueOrSlot(claimMap, "citations_grounded", slots, used,
    "count of cited identifiers grounded in fetched evidence",
    "deliverables/citation-integrity.md",
    "Use the grounded count, not the total cited. The gap between them is the honest part.");
  const stopped = valueOrSlot(claimMap, "stopped_programs", slots, used,
    "count of prior terminated/withdrawn/suspended programs in this indication",
    "deliverables/graveyard-memo.md",
    "The memo states its own census size; quote that.");
  const zeros = valueOrSlot(claimMap, "zero_result_searches", slots, used,
    "count of sources that returned an honest zero",
    "deliverables/search-coverage.md",
    "A zero-result source is a finding. Do not confuse it with a failed source.");

  const indicationEntry = claimMap.get("indication");
  const indication = indicationEntry ? String(indicationEntry.value) : null;
  if (indicationEntry) {
    used.push({
      id: indicationEntry.id,
      value: indicationEntry.value,
      source_file: indicationEntry.source_file
    });
  }

  const subject = indication
    ? `programs in ${indication}`
    : "programs in this indication";

  const hook = isFounder
    ? "Most people never ask what happened to the drugs that failed. I went and looked."
    : `What the failed ${subject} already told us — with the receipts.`;

  const lines = [hook, ""];

  lines.push(
    `${grounded.text} cited identifiers in this report were checked back against the source `
    + `records actually retrieved for it. Anything that did not check out is flagged in the `
    + `document itself rather than quietly dropped.`
  );
  lines.push("");
  lines.push(
    `It names ${stopped.text} prior ${subject} that were terminated, withdrawn or suspended — `
    + `each with the sponsor's own stated reason, or an explicit "none stated" where the sponsor `
    + `gave none.`
  );
  lines.push("");
  lines.push(
    `And where a source returned nothing, it says so: ${zeros.text} came back empty. `
    + `Absence of evidence gets reported, not papered over.`
  );
  lines.push("");
  lines.push(isFounder ? voiceRules(channel).use : voiceRules(channel).use);
  lines.push("");
  lines.push(ENTITY_DISCLOSURE);

  return lines.join("\n");
}

/**
 * @param {object} options { channel, source_ref, angle?, write? }
 */
function buildDraft(options = {}) {
  const channel = String(options.channel || "");
  const sourceRef = String(options.source_ref || "");
  const shape = CHANNEL_SHAPE[channel];
  if (!shape) {
    const error = new Error(
      `unknown channel '${channel}' — expected one of ${Object.keys(CHANNEL_SHAPE).join(", ")}`
    );
    error.code = "TRINC_CONTENT_CHANNEL_UNKNOWN";
    throw error;
  }

  const rules = voiceRules(channel);
  if (!rules.known) {
    const error = new Error(
      `channel '${channel}' declares no trinc_voice in config/platform-targets.json`
    );
    error.code = "TRINC_CONTENT_VOICE_UNKNOWN";
    throw error;
  }

  const extracted = extractClaims(sourceRef);
  const claimMap = byId(extracted.claims);
  const slots = [];
  const used = [];
  const text = buildBody(channel, rules.voice, claimMap, slots, used);

  // The draft is checked by the same gate a publish would run. A tool that drafted without
  // checking would just move the problem downstream.
  const verdict = checkDraft({ channel, text }, { claims: extracted.claims });

  const result = {
    channel,
    voice: rules.voice,
    source_ref: sourceRef,
    form: shape.form,
    text,
    characters: text.length,
    caption_limit: shape.caption_limit,
    over_limit: text.length > shape.caption_limit,
    claims_used: used,
    verify_slots: slots,
    unfilled_slot_count: slots.length,
    files_read: extracted.files_read,
    missing_deliverables: extracted.missing_deliverables,
    check: verdict
  };

  if (options.write) {
    const dir = paths().drafts;
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${sourceRef}--${channel}.md`);
    const frontMatter = [
      "---",
      `channel: ${channel}`,
      `voice: ${rules.voice}`,
      `source_ref: ${sourceRef}`,
      `check_verdict: ${verdict.verdict}`,
      `unfilled_verify_slots: ${slots.length}`,
      "# This front matter is a record, not an authorization. publish_* re-runs the check.",
      "---",
      ""
    ].join("\n");
    fs.writeFileSync(file, frontMatter + text + "\n", "utf8");
    result.written_to = file;
  }

  return result;
}

module.exports = { CHANNEL_SHAPE, buildDraft };
