"use strict";

/**
 * Posting cadence.
 *
 * The cadence is NOT invented here. It comes from the business's own integrated marketing
 * communications plan (MKT500 Part C, 2026-09), quoted verbatim below. That plan predates the
 * TikTok / Instagram / Facebook Page accounts and names LinkedIn as the primary channel with
 * YouTube as a searchable archive.
 *
 * So this module does the same thing the rest of the server does with a figure it cannot
 * source: it states what IS documented, and marks the rest as an operator decision rather than
 * quietly manufacturing a schedule. A cadence nobody chose, presented as if someone had, is the
 * same defect as an invented follower count — just harder to notice.
 *
 * @module calendar
 */

const fs = require("node:fs");
const path = require("node:path");

const { CHANNELS, paths } = require("./config.js");
const { channelVoices } = require("./brand.js");

const PLAN_PATH =
  "/Users/myhome/My Digital Garden/Learning/Strayer Classes/MKT500/Week 10/"
  + "Robey_Trevor_MKT500_MarketingPlan_PartC_Final.md";

/** Verbatim from the plan's Timing paragraph. Quoted so the rhythm below is auditable. */
const CADENCE_SOURCE_QUOTE =
  "two posts a week on the founder profile (Tuesday and Thursday mornings Eastern time, "
  + "because Part B placed the primary geography in Boston–Cambridge), one archive post a week "
  + "on the company page, a monthly newsletter, and two peaks around J.P. Morgan in January and "
  + "BIO in June, when the video launches";

/**
 * The documented rhythm: two founder slots (Tue/Thu) and one company slot (Wed) per week.
 * Weekdays are 0=Sun..6=Sat.
 */
const RHYTHM = [
  { weekday: 2, day: "Tuesday", voice: "founder", kind: "founder post" },
  { weekday: 3, day: "Wednesday", voice: "company", kind: "company archive post" },
  { weekday: 4, day: "Thursday", voice: "founder", kind: "founder post" }
];

/** Months the plan names as peaks, 1-indexed. */
const PEAK_MONTHS = { 1: "J.P. Morgan Healthcare Conference", 6: "BIO" };

function planPresent() {
  try {
    return fs.statSync(PLAN_PATH).isFile();
  } catch {
    return false;
  }
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

/** Parse YYYY-MM-DD as UTC so a schedule never shifts with the machine's timezone. */
function parseStart(value) {
  if (!value) return new Date(Date.now());
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!match) {
    const error = new Error(`start must be YYYY-MM-DD, got '${value}'`);
    error.code = "TRINC_CONTENT_START_INVALID";
    throw error;
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

/**
 * @param {object} options { weeks?, start?, channels? }
 */
function buildCalendar(options = {}) {
  const weeks = Math.min(Math.max(Number(options.weeks) || 4, 1), 26);
  const start = parseStart(options.start);
  const voices = channelVoices();

  const requested = Array.isArray(options.channels) && options.channels.length > 0
    ? options.channels.map(String)
    : CHANNELS.slice();

  const unknown = requested.filter((name) => !CHANNELS.includes(name));
  if (unknown.length > 0) {
    const error = new Error(
      `unknown channel(s): ${unknown.join(", ")} — expected ${CHANNELS.join(", ")}`
    );
    error.code = "TRINC_CONTENT_CHANNEL_UNKNOWN";
    throw error;
  }

  const byVoice = { founder: [], company: [] };
  for (const channel of requested) {
    const voice = voices[channel];
    if (voice) byVoice[voice].push(channel);
  }

  const slots = [];
  // Walk from the first occurrence of each rhythm weekday on/after `start`.
  for (let week = 0; week < weeks; week += 1) {
    for (const beat of RHYTHM) {
      const date = new Date(start.getTime());
      const delta = (beat.weekday - start.getUTCDay() + 7) % 7;
      date.setUTCDate(start.getUTCDate() + delta + week * 7);

      const channelsForBeat = byVoice[beat.voice];
      if (channelsForBeat.length === 0) continue;

      // Rotate through the channels of that voice so neither is starved.
      const channel = channelsForBeat[week % channelsForBeat.length];
      const month = date.getUTCMonth() + 1;

      slots.push({
        date: isoDate(date),
        day: beat.day,
        channel,
        voice: beat.voice,
        kind: beat.kind,
        peak: PEAK_MONTHS[month] || null
      });
    }
  }
  slots.sort((left, right) => left.date.localeCompare(right.date));

  // Channels the source plan never covered. Naming them is the point.
  const documentedChannels = ["linkedin (primary)", "youtube (archive)"];
  const extrapolated = requested.filter((name) => name !== "youtube");

  return {
    weeks,
    start: isoDate(start),
    slot_count: slots.length,
    slots,
    cadence: {
      rhythm: "2 founder posts per week (Tue/Thu) + 1 company archive post (Wed)",
      source: PLAN_PATH,
      source_present: planPresent(),
      source_quote: CADENCE_SOURCE_QUOTE,
      timezone_note:
        "The plan specifies Eastern-time mornings because Part B placed the primary geography "
        + "in Boston–Cambridge. Dates here are UTC calendar days; pick the hour locally."
    },
    peaks: Object.entries(PEAK_MONTHS).map(([month, name]) => ({ month: Number(month), event: name })),
    documented_for: documentedChannels,
    extrapolated_to: extrapolated,
    // The honest caveat, surfaced in the payload so it cannot be skimmed past.
    caveat:
      "The source plan names LinkedIn as primary and YouTube as a searchable archive. It predates "
      + "the TikTok, Instagram and Facebook Page accounts, so applying this rhythm to them is an "
      + "EXTRAPOLATION, not a documented decision. Treat the slots for those channels as a "
      + "proposal for the operator to accept, change, or drop — the plan does not cover them.",
    monthly: "The plan also calls for a monthly newsletter. No newsletter tooling is bound in "
      + "this stack (PLUGIN-BINDINGS.md: email marketing is UNBOUND), so it is not scheduled here."
  };
}

/** Optional on-disk record, alongside the drafts. */
function writeCalendar(calendar) {
  const dir = paths().drafts;
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `calendar-${calendar.start}-${calendar.weeks}w.md`);
  const lines = [
    `# Posting calendar — ${calendar.weeks} week(s) from ${calendar.start}`,
    "",
    `**Rhythm:** ${calendar.cadence.rhythm}`,
    "",
    `**Source:** \`${calendar.cadence.source}\``,
    `> ${calendar.cadence.source_quote}`,
    "",
    `**Caveat:** ${calendar.caveat}`,
    "",
    "| Date | Day | Channel | Voice | Kind | Peak |",
    "|---|---|---|---|---|---|",
    ...calendar.slots.map((slot) =>
      `| ${slot.date} | ${slot.day} | ${slot.channel} | ${slot.voice} | ${slot.kind} | ${slot.peak || "—"} |`),
    "",
    calendar.monthly,
    ""
  ];
  fs.writeFileSync(file, lines.join("\n"), "utf8");
  return file;
}

module.exports = { CADENCE_SOURCE_QUOTE, PLAN_PATH, RHYTHM, buildCalendar, writeCalendar };
