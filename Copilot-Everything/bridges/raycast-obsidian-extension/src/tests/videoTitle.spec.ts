import { expect, describe, it } from "vitest";
import { stripDownieDisambiguationSuffix, stripRunTimestamp } from "@/tools/videoTranscribeFlow";

describe("stripRunTimestamp", () => {
  it("removes the trailing -<ISO run timestamp> the output template appends", () => {
    expect(stripRunTimestamp("My Great Lecture-2026-06-30T12-34-56-789Z")).toBe("My Great Lecture");
  });

  it("keeps hyphens and inner dashes that are part of the real title", () => {
    expect(stripRunTimestamp("Part 1 - Intro to OB-2026-01-02T03-04-05-006Z")).toBe("Part 1 - Intro to OB");
  });

  it("preserves a URL-derived base name (generic-title fallback) minus the timestamp", () => {
    expect(stripRunTimestamp("organizational behavior in context-2026-06-30T00-00-00-000Z")).toBe(
      "organizational behavior in context"
    );
  });

  it("returns the name unchanged when there is no run-timestamp suffix", () => {
    expect(stripRunTimestamp("Already Clean Title")).toBe("Already Clean Title");
  });

  it("only strips a timestamp anchored at the very end, not one embedded mid-title", () => {
    expect(stripRunTimestamp("Recorded 2026-06-30T12-00-00-000Z Session")).toBe(
      "Recorded 2026-06-30T12-00-00-000Z Session"
    );
  });
});

describe("stripDownieDisambiguationSuffix", () => {
  it("strips the re-download suffix observed on 2026-08-19 (with _N counter)", () => {
    expect(stripDownieDisambiguationSuffix("K-means clustering | LinkedIn Learning -  - 2026-08-19 03-58-00_0")).toBe(
      "K-means clustering | LinkedIn Learning"
    );
  });

  it("strips the sidecar-style suffix without a counter", () => {
    expect(stripDownieDisambiguationSuffix("The internet of things | LinkedIn Learning -  - 2026-07-31 16-54-58")).toBe(
      "The internet of things | LinkedIn Learning"
    );
  });

  it("leaves a name without the suffix untouched", () => {
    expect(stripDownieDisambiguationSuffix("Common algorithms | LinkedIn Learning")).toBe(
      "Common algorithms | LinkedIn Learning"
    );
  });

  it("keeps legitimate dashes and dates that are part of the real title", () => {
    expect(stripDownieDisambiguationSuffix("Standup - 2026-08-19 recap - part 2")).toBe(
      "Standup - 2026-08-19 recap - part 2"
    );
  });
});
