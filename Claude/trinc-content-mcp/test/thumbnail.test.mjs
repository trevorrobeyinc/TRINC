import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildDraft } = require("../src/draft.js");
const { listSources } = require("../src/sources.js");
const { paths } = require("../src/config.js");

const repoPresent = fs.existsSync(paths().releases);
const options = repoPresent ? {} : { skip: "monorepo not present at the configured path" };

describe("thumbnail spec", options, () => {
  const richest = () => {
    const releases = listSources().releases;
    return releases.find((entry) => entry.has_search_coverage) || releases[0];
  };

  it("emits a spec shaped exactly like the viz_stat_tiles contract", () => {
    const draft = buildDraft({ channel: "tiktok", source_ref: richest().source_ref });
    assert.equal(draft.thumbnail.tool, "viz_stat_tiles");
    assert.ok(draft.thumbnail.spec);
    assert.ok(Array.isArray(draft.thumbnail.spec.tiles));
    for (const tile of draft.thumbnail.spec.tiles) {
      assert.equal(typeof tile.label, "string");
      assert.equal(typeof tile.value, "number");
      // The renderer's contract is {label, value, unit?, delta?, direction?, spark?, meter?}.
      // Anything else would be silently dropped, so do not invent fields.
      assert.deepEqual(
        Object.keys(tile).filter((k) => !["label", "value", "unit", "delta", "direction", "spark", "meter"].includes(k)),
        []
      );
    }
  });

  // The whole point: a thumbnail is where an invented number is least checkable.
  it("shows ONLY values the draft actually used, each with its source file", () => {
    const draft = buildDraft({ channel: "tiktok", source_ref: richest().source_ref });
    const usedValues = new Set(draft.claims_used.map((entry) => entry.value));
    for (const tile of draft.thumbnail.spec.tiles) {
      assert.ok(usedValues.has(tile.value), `tile value ${tile.value} must come from claims_used`);
      assert.ok(draft.text.includes(String(tile.value)), "and must also appear in the post body");
    }
    assert.equal(draft.thumbnail.sources.length, draft.thumbnail.spec.tiles.length);
    for (const source of draft.thumbnail.sources) {
      assert.ok(source.source_file.startsWith("deliverables/"));
    }
  });

  it("shrinks rather than pads when a bundle supports fewer numbers", () => {
    const releases = listSources().releases;
    const thin = releases.find((entry) => !entry.has_search_coverage);
    const rich = releases.find((entry) => entry.has_search_coverage);
    if (!thin || !rich) return;

    const thinDraft = buildDraft({ channel: "youtube", source_ref: thin.source_ref });
    const richDraft = buildDraft({ channel: "youtube", source_ref: rich.source_ref });
    assert.ok(
      thinDraft.thumbnail.spec.tiles.length < richDraft.thumbnail.spec.tiles.length,
      "fewer claims must mean fewer tiles, never a filler number"
    );
  });

  it("carries the brand tokens so the image matches the report", () => {
    const draft = buildDraft({ channel: "instagram", source_ref: richest().source_ref });
    assert.equal(draft.thumbnail.style.background, "#0a0a0f");
    assert.equal(draft.thumbnail.style.accent, "#4a90d9");
    assert.match(draft.thumbnail.style.rules, /No stock photography/);
  });

  it("is a spec, not a render — it never calls the bridge", () => {
    const draft = buildDraft({ channel: "tiktok", source_ref: richest().source_ref });
    assert.match(draft.thumbnail.note, /Pass `spec` straight to the viz_stat_tiles tool/);
    assert.equal(draft.thumbnail.rendered, undefined);
    assert.equal(draft.thumbnail.path, undefined);
  });
});
