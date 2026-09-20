"use strict";

/**
 * Reads the brand canon out of the monorepo and returns it as structured data.
 *
 * The canon already exists as prose in 01-brand-system/. This module's job is to make the one
 * rule that actually gets broken — the company-voice / founder-voice split — machine-readable,
 * so a drafting tool cannot quietly mix them.
 *
 * @module brand
 */

const fs = require("node:fs");

const {
  COMPANY_TAGLINE,
  ENTITY_DISCLOSURE,
  FOUNDER_LOCKUP,
  paths
} = require("./config.js");

function readIfPresent(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Channel -> voice, read from config/platform-targets.json rather than guessed.
 * A channel with no declared `trinc_voice` is reported as unknown, never defaulted: defaulting
 * is precisely how the two voices get mixed.
 */
function channelVoices() {
  const config = readJsonIfPresent(paths().platformTargets);
  const targets = (config && config.platform_targets) || {};
  const voices = {};
  for (const [name, definition] of Object.entries(targets)) {
    const voice = definition && definition.trinc_voice;
    if (voice === "founder" || voice === "company") {
      voices[name] = voice;
    }
  }
  return voices;
}

/**
 * The lockup a given surface must use, and the one it must NOT contain.
 * personal-brand.md states the rule as "if the sentence is spoken by Trevor the person, use the
 * personal brand; if by the company, use the business tagline" — this encodes that.
 */
function voiceRules(channel) {
  const voice = channelVoices()[channel] || null;
  if (!voice) {
    return { channel, voice: null, use: null, forbid: null, known: false };
  }
  return {
    channel,
    voice,
    known: true,
    use: voice === "founder" ? FOUNDER_LOCKUP : COMPANY_TAGLINE,
    forbid: voice === "founder" ? COMPANY_TAGLINE : FOUNDER_LOCKUP
  };
}

/** Everything a drafting call needs in one read, so no tool has to go hunting. */
function brandContext() {
  const p = paths();
  const personalBrand = readIfPresent(p.personalBrand);
  const voices = channelVoices();

  return {
    disclosure: ENTITY_DISCLOSURE,
    disclosure_is_required_by:
      "Cal. Bus. & Prof. Code §17910.5(a) — the wordmark 'Trevor Robey, INC.' is not an "
      + "incorporated entity, so customer-facing material must state what it is.",
    company_tagline: COMPANY_TAGLINE,
    founder_lockup: FOUNDER_LOCKUP,
    voice_rule:
      "Company voice and founder voice do not mix. The company speaks the business tagline; "
      + "Trevor-the-person speaks the founder lockup. See 01-brand-system/personal-brand.md.",
    channel_voices: voices,
    visual_tokens: {
      background: "#0a0a0f",
      accent: "#4a90d9",
      typography: "IBM Plex (Sans / Mono)",
      rules: "No gradients. No rounded corners on data elements. No stock photography."
    },
    voice_description:
      "Plain-spoken, no-BS, underdog, skeptic. Give it straight even when the outcome is not "
      + "what the reader wanted. No grandiosity, no buzzwords, zero marketing hyperbole.",
    canon_files_read: {
      personal_brand: personalBrand ? p.personalBrand : null,
      platform_targets: Object.keys(voices).length > 0 ? p.platformTargets : null
    },
    // Surfaced so a caller can see when the canon was unreadable rather than silently getting
    // defaults that look authoritative.
    warnings: [
      personalBrand ? null : `could not read ${p.personalBrand}`,
      Object.keys(voices).length > 0 ? null : `could not read channel voices from ${p.platformTargets}`
    ].filter(Boolean)
  };
}

module.exports = { brandContext, channelVoices, voiceRules };
