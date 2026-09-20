"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  ENTITY_DISCLOSURE,
  COMPANY_TAGLINE,
  FOUNDER_LOCKUP,
  createSocialContentAdapter
} = require("../../openclaw-bridge/monetization/adapters/social-content-adapter.js");
const {
  createDefaultPublisherAdapterRegistry
} = require("../../openclaw-bridge/monetization/publisher-adapter-registry.js");
const { validatePlatformTargets } = require("../../openclaw-bridge/monetization/offer-schema.js");
const platformTargetsConfig = require("../../config/platform-targets.json");

const SOCIAL_CHANNELS = ["youtube", "tiktok", "instagram", "facebook_page"];

const OFFER = {
  offer_id: "offer-test",
  offer_title: "Clinical trial landscape for heart failure (biomedical research packs)",
  product_line: "biomedical_research_packs",
  tier: "standard"
};

function sourceContext(chars) {
  return {
    source_kind: "mission",
    source_id: "mission-test",
    artifacts: chars > 0 ? [{ output_full: "x".repeat(chars) }] : []
  };
}

// Captures what the adapter emits without touching disk, mirroring how
// submission-pack-generator supplies emitJson/emitText.
function run(channel, context, overrides) {
  const emitted = {};
  const targetConfig = Object.assign(
    {},
    platformTargetsConfig.platform_targets[channel],
    overrides || {}
  );
  const adapter = createSocialContentAdapter({ platform_target: channel });
  const result = adapter.generateArtifacts({
    offer: OFFER,
    source_context: context,
    target_config: targetConfig,
    emitJson: (name, content) => { emitted[name] = content; return `submission/${channel}/${name}`; },
    emitText: (name, content) => { emitted[name] = content; return `submission/${channel}/${name}`; }
  });
  return { result, emitted };
}

describe("phase21 social content adapter", () => {
  it("registers all four social channels through the default registry", () => {
    const registry = createDefaultPublisherAdapterRegistry({
      platformTargets: platformTargetsConfig
    });
    for (const channel of SOCIAL_CHANNELS) {
      const adapter = registry.resolve(channel);
      assert.equal(adapter.platform_target, channel);
      assert.equal(adapter.adapter_id, `phase21.social.${channel}`);
      assert.equal(adapter.adapter_version, "phase21-social-v1");
    }
  });

  it("keeps the platform-targets config schema-valid with the social channels added", () => {
    const normalized = validatePlatformTargets(platformTargetsConfig);
    for (const channel of SOCIAL_CHANNELS) {
      assert.ok(normalized.platform_targets[channel], `${channel} present`);
    }
  });

  it("emits the three declared artifacts for every channel", () => {
    for (const channel of SOCIAL_CHANNELS) {
      const { result, emitted } = run(channel, sourceContext(26000));
      assert.deepEqual(Object.keys(emitted).sort(), [
        "checklist.md", "copy-blocks.json", "post-fields.json"
      ]);
      assert.equal(result.generated_files.length, 3);
      // generated_files must be sorted — the phase21 snapshot hash depends on it.
      const sorted = result.generated_files.slice().sort((a, b) => a.localeCompare(b));
      assert.deepEqual(result.generated_files, sorted);
      assert.equal(result.refs.platform_metadata, `submission/${channel}/post-fields.json`);
    }
  });

  it("satisfies every copy block each channel declares it requires", () => {
    for (const channel of SOCIAL_CHANNELS) {
      const { emitted } = run(channel, sourceContext(26000));
      const required = platformTargetsConfig.platform_targets[channel].copy_block_requirements;
      for (const key of required) {
        assert.ok(
          emitted["copy-blocks.json"][key],
          `${channel} copy block '${key}' must be present and non-empty`
        );
      }
    }
  });

  it("carries the entity disclosure verbatim, never paraphrased", () => {
    for (const channel of SOCIAL_CHANNELS) {
      const { emitted } = run(channel, sourceContext(26000));
      assert.equal(emitted["copy-blocks.json"].disclosure, ENTITY_DISCLOSURE);
      assert.ok(emitted["copy-blocks.json"].description.includes(ENTITY_DISCLOSURE));
      assert.ok(emitted["checklist.md"].includes(ENTITY_DISCLOSURE));
    }
  });

  it("uses each channel's declared voice and never mixes the two lockups", () => {
    const founderChannels = ["tiktok", "instagram"];
    const companyChannels = ["youtube", "facebook_page"];

    for (const channel of founderChannels) {
      const { emitted } = run(channel, sourceContext(26000));
      const blocks = emitted["copy-blocks.json"];
      assert.equal(blocks.voice, "founder");
      assert.ok(blocks.caption.includes(FOUNDER_LOCKUP), `${channel} uses the founder lockup`);
      assert.ok(
        !blocks.caption.includes(COMPANY_TAGLINE),
        `${channel} must NOT carry the company tagline — personal-brand.md forbids mixing`
      );
    }
    for (const channel of companyChannels) {
      const { emitted } = run(channel, sourceContext(26000));
      const blocks = emitted["copy-blocks.json"];
      assert.equal(blocks.voice, "company");
      assert.ok(blocks.caption.includes(COMPANY_TAGLINE), `${channel} uses the company tagline`);
      assert.ok(
        !blocks.caption.includes(FOUNDER_LOCKUP),
        `${channel} must NOT carry the founder lockup — personal-brand.md forbids mixing`
      );
    }
  });

  it("refuses a target config that is not manual_only", () => {
    assert.throws(
      () => run("youtube", sourceContext(26000), { manual_only: false }),
      (error) => error.code === "PHASE21_ADAPTER_MANUAL_ONLY_REQUIRED"
    );
  });

  it("refuses a channel that declares no voice rather than guessing one", () => {
    assert.throws(
      () => run("tiktok", sourceContext(26000), { trinc_voice: "" }),
      (error) => error.code === "PHASE21_ADAPTER_VOICE_REQUIRED"
    );
    assert.throws(
      () => run("tiktok", sourceContext(26000), { trinc_voice: "casual" }),
      (error) => error.code === "PHASE21_ADAPTER_VOICE_REQUIRED"
    );
  });

  it("refuses when a declared copy block would be empty", () => {
    assert.throws(
      () => run("tiktok", sourceContext(26000), {
        copy_block_requirements: ["hook", "script", "caption", "hashtags", "disclosure", "subtitle"]
      }),
      (error) => error.code === "PHASE21_ADAPTER_COPY_BLOCK_MISSING"
    );
  });

  // The anti-fabrication guarantee, stated as a test rather than a comment.
  it("never states a figure it cannot derive — unknowns become VERIFY slots", () => {
    const { emitted } = run("tiktok", sourceContext(26000));
    const blocks = emitted["copy-blocks.json"];
    const fields = emitted["post-fields.json"];

    assert.ok(blocks.script.includes("[VERIFY:1]"), "citation count is a slot, not a number");
    assert.ok(blocks.script.includes("[VERIFY:2]"), "graveyard count is a slot, not a number");
    assert.ok(blocks.script.includes("[VERIFY:3]"), "honest-zero is a slot, not a number");

    // Every slot names the bundle file the operator must read it from.
    assert.ok(fields.claim_slots.length >= 3);
    for (const slot of fields.claim_slots) {
      assert.ok(slot.read_from.startsWith("deliverables/"), "slot names a bundle file");
      assert.ok(slot.wants.length > 0);
    }
    assert.equal(fields.unfilled_claim_slot_count, fields.claim_slots.length);
  });

  it("derives page count only when artifact text was actually supplied", () => {
    const withText = run("tiktok", sourceContext(26000));
    assert.ok(
      withText.emitted["copy-blocks.json"].script.includes("13+ pages"),
      "26000 chars / 2000 = 13 pages"
    );

    // No artifacts => no derivable length => a slot, never a guess.
    const withoutText = run("tiktok", sourceContext(0));
    const script = withoutText.emitted["copy-blocks.json"].script;
    assert.ok(script.includes("[VERIFY:4] pages"), "length becomes a slot when underivable");
    assert.ok(!/\d+\+ pages/.test(script), "no invented page count");
    assert.equal(withoutText.emitted["post-fields.json"].claim_slots.length, 4);
  });

  it("states no engagement metric — this business has no analytics binding", () => {
    for (const channel of SOCIAL_CHANNELS) {
      const { emitted } = run(channel, sourceContext(26000));
      const text = JSON.stringify(emitted["copy-blocks.json"]).toLowerCase();
      for (const banned of ["followers", "subscribers", "impressions", "engagement rate", "views so far"]) {
        assert.ok(!text.includes(banned), `${channel} must not claim '${banned}'`);
      }
    }
  });

  it("is deterministic — identical inputs produce identical bytes", () => {
    for (const channel of SOCIAL_CHANNELS) {
      const first = JSON.stringify(run(channel, sourceContext(26000)).emitted);
      const second = JSON.stringify(run(channel, sourceContext(26000)).emitted);
      assert.equal(first, second, `${channel} output must be stable for snapshot hashing`);
    }
  });

  it("requires a platform_target at construction", () => {
    assert.throws(
      () => createSocialContentAdapter({}),
      (error) => error.code === "PHASE21_ADAPTER_PLATFORM_TARGET_REQUIRED"
    );
  });

  it("requires emitJson and emitText in the adapter context", () => {
    const adapter = createSocialContentAdapter({ platform_target: "tiktok" });
    assert.throws(
      () => adapter.generateArtifacts({
        offer: OFFER,
        source_context: sourceContext(26000),
        target_config: platformTargetsConfig.platform_targets.tiktok
      }),
      (error) => error.code === "PHASE21_ADAPTER_CONTEXT_INVALID"
    );
  });
});
