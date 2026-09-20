import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildCalendar, CADENCE_SOURCE_QUOTE } = require("../src/calendar.js");

describe("posting calendar", () => {
  it("lands slots on the weekdays the plan specifies", () => {
    const calendar = buildCalendar({ weeks: 1, start: "2026-09-21" }); // a Monday
    assert.deepEqual(calendar.slots.map((slot) => slot.day), ["Tuesday", "Wednesday", "Thursday"]);
    assert.deepEqual(calendar.slots.map((slot) => slot.date),
      ["2026-09-22", "2026-09-23", "2026-09-24"]);
  });

  it("gives two founder slots and one company slot per week", () => {
    const calendar = buildCalendar({ weeks: 3, start: "2026-09-21" });
    const founder = calendar.slots.filter((slot) => slot.voice === "founder");
    const company = calendar.slots.filter((slot) => slot.voice === "company");
    assert.equal(founder.length, 6);
    assert.equal(company.length, 3);
  });

  it("puts each channel on its own declared voice, never the other one", () => {
    const calendar = buildCalendar({ weeks: 4, start: "2026-09-21" });
    const expected = {
      tiktok: "founder", instagram: "founder",
      youtube: "company", facebook_page: "company"
    };
    for (const slot of calendar.slots) {
      assert.equal(slot.voice, expected[slot.channel], `${slot.channel} voice`);
    }
  });

  it("rotates between the channels of a voice so neither is starved", () => {
    const calendar = buildCalendar({ weeks: 4, start: "2026-09-21" });
    const founderChannels = new Set(
      calendar.slots.filter((s) => s.voice === "founder").map((s) => s.channel)
    );
    assert.deepEqual([...founderChannels].sort(), ["instagram", "tiktok"]);
  });

  it("flags the two peaks the plan names", () => {
    const january = buildCalendar({ weeks: 1, start: "2027-01-11" });
    assert.ok(january.slots.every((slot) => slot.peak === "J.P. Morgan Healthcare Conference"));
    const june = buildCalendar({ weeks: 1, start: "2027-06-07" });
    assert.ok(june.slots.every((slot) => slot.peak === "BIO"));
    const quiet = buildCalendar({ weeks: 1, start: "2026-09-21" });
    assert.ok(quiet.slots.every((slot) => slot.peak === null));
  });

  it("quotes its source and says whether the plan file is actually on disk", () => {
    const calendar = buildCalendar({ weeks: 1, start: "2026-09-21" });
    assert.equal(calendar.cadence.source_quote, CADENCE_SOURCE_QUOTE);
    assert.match(calendar.cadence.source, /MKT500/);
    assert.equal(typeof calendar.cadence.source_present, "boolean");
  });

  // The honesty requirement: the source plan does not cover three of the four channels.
  it("labels the three channels the plan never covered as an extrapolation", () => {
    const calendar = buildCalendar({ weeks: 1, start: "2026-09-21" });
    assert.deepEqual(calendar.extrapolated_to.sort(), ["facebook_page", "instagram", "tiktok"]);
    assert.match(calendar.caveat, /EXTRAPOLATION/);
    assert.match(calendar.caveat, /proposal for the operator/);
  });

  it("does not schedule the newsletter, because no tooling is bound for it", () => {
    const calendar = buildCalendar({ weeks: 4, start: "2026-09-21" });
    assert.match(calendar.monthly, /UNBOUND/);
    assert.ok(calendar.slots.every((slot) => !/newsletter/i.test(slot.kind)));
  });

  it("honours a channel subset", () => {
    const calendar = buildCalendar({ weeks: 2, start: "2026-09-21", channels: ["tiktok"] });
    assert.ok(calendar.slots.every((slot) => slot.channel === "tiktok"));
    assert.ok(calendar.slots.every((slot) => slot.voice === "founder"));
    assert.equal(calendar.slots.length, 4, "no company slots when no company channel is requested");
  });

  it("is deterministic for a given start date", () => {
    const first = JSON.stringify(buildCalendar({ weeks: 4, start: "2026-09-21" }));
    const second = JSON.stringify(buildCalendar({ weeks: 4, start: "2026-09-21" }));
    assert.equal(first, second);
  });

  it("refuses a malformed start date and an unknown channel", () => {
    assert.throws(
      () => buildCalendar({ start: "21-09-2026" }),
      (error) => error.code === "TRINC_CONTENT_START_INVALID"
    );
    assert.throws(
      () => buildCalendar({ channels: ["mastodon"] }),
      (error) => error.code === "TRINC_CONTENT_CHANNEL_UNKNOWN"
    );
  });

  it("clamps weeks to a sane range", () => {
    assert.equal(buildCalendar({ weeks: 999, start: "2026-09-21" }).weeks, 26);
    assert.equal(buildCalendar({ weeks: 0, start: "2026-09-21" }).weeks, 4);
  });
});
