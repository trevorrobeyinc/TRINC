"use strict";

/**
 * The four per-platform publish tools.
 *
 * They exist so the workflow is complete, and they are INERT: no platform on this machine has a
 * credential, and each tool refuses independently until one appears. Lighting up a channel is a
 * per-channel act, which is what "one command for each platform" means here.
 *
 * FIVE-LAYER PIN, modeled on the github read-only pin that is already live in this stack:
 *
 *   1. Credential scope        — each channel's token is minted with the narrowest publish scope.
 *                                Claude never creates, reads, types or transports it.
 *   2. Server allowlist        — TRINC_CONTENT_PUBLISH must name the channel, credential or not.
 *   3. Two-call handshake      — the first call returns the exact outbound payload and a nonce;
 *                                nothing leaves the machine until a second call echoes it back.
 *   4. Host hook               — the PreToolUse gate keeps its OWN list of publish tool names and
 *                                requires an armed scope. It does not trust this module's word.
 *   5. Re-check at publish     — the compliance gate runs again here. A recorded PASS in a
 *                                draft's front matter is a record, not an authorization.
 *
 * Nothing in this module performs a network call today. When a channel is eventually wired, the
 * send belongs behind `confirmPublish`, after the re-check, and nowhere else.
 *
 * @module publish
 */

const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const { CHANNELS, keychainService, publishAllowlist } = require("./config.js");
const { checkDraft } = require("./check.js");

/** Pending handshakes, keyed by nonce. In-memory only: a restart voids every pending publish. */
const pending = new Map();

/**
 * Is a credential present for this channel? Reads only whether the Keychain item EXISTS — never
 * its value, which stays in the Keychain where the operator put it.
 */
function credentialPresent(channel) {
  try {
    execFileSync("/usr/bin/security", [
      "find-generic-password", "-s", keychainService(channel)
    ], { stdio: ["ignore", "ignore", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

function readiness(channel) {
  const allowlisted = publishAllowlist().includes(channel);
  const credential = credentialPresent(channel);
  const blockers = [];
  if (!allowlisted) {
    blockers.push({
      layer: 2,
      blocker: "channel not in TRINC_CONTENT_PUBLISH",
      resolve: `Add '${channel}' to TRINC_CONTENT_PUBLISH in this server's .mcp.json env block, `
        + "then restart the Claude app so the server re-reads it."
    });
  }
  if (!credential) {
    blockers.push({
      layer: 1,
      blocker: `no Keychain item '${keychainService(channel)}'`,
      resolve: runbook(channel)
    });
  }
  return { channel, allowlisted, credential_present: credential, ready: blockers.length === 0, blockers };
}

/** What the operator does to light a channel up. Every step is theirs, not Claude's. */
function runbook(channel) {
  const steps = {
    youtube:
      "Create a Google Cloud project, enable the YouTube Data API v3, create an OAuth client, "
      + "and complete the consent screen. videos.insert needs the youtube.upload scope — request "
      + "that one only, not youtube.force-ssl.",
    tiktok:
      "Register a TikTok for Developers app and apply for Content Posting API access. Direct "
      + "Post requires an audited app; unaudited apps can only push to draft.",
    instagram:
      "Create a Meta app, connect the Instagram Professional account to a Facebook Page, and "
      + "pass App Review for instagram_content_publish. Personal accounts cannot publish via API.",
    facebook_page:
      "Create a Meta app, complete Business Verification, and pass App Review for "
      + "pages_manage_posts plus pages_read_engagement."
  };
  return `${steps[channel] || "Register a developer app for this channel."} `
    + `Then store the token yourself: security add-generic-password -s ${keychainService(channel)} `
    + `-a trinc -w  (Claude must not run this, see it, or handle the token).`;
}

/**
 * Call 1 — prepare. Returns the exact payload plus a nonce. Sends nothing.
 */
function preparePublish(channel, draft = {}, context = {}) {
  if (!CHANNELS.includes(channel)) {
    const error = new Error(`unknown publish channel '${channel}'`);
    error.code = "TRINC_CONTENT_CHANNEL_UNKNOWN";
    throw error;
  }

  // Layer 5 first: a draft that fails the gate is never offered for publishing, regardless of
  // whether the channel is otherwise ready.
  const recheck = checkDraft({ channel, text: String(draft.text || "") },
    { claims: Array.isArray(context.claims) ? context.claims : [] });

  const state = readiness(channel);
  const unfilled = (String(draft.text || "").match(/\[VERIFY:\d+\]/g) || []);

  const blocked = [];
  if (!recheck.pass) {
    blocked.push({
      layer: 5,
      blocker: `compliance gate returned ${recheck.verdict}`,
      resolve: "Fix every 'fail' finding and re-run content_check."
    });
  }
  if (unfilled.length > 0) {
    blocked.push({
      layer: 5,
      blocker: `${unfilled.length} unfilled VERIFY slot(s) would be published literally`,
      resolve: "Fill each from the deliverable it names, or remove the sentence."
    });
  }
  blocked.push(...state.blockers);

  if (blocked.length > 0) {
    return {
      channel,
      status: "BLOCKED",
      would_publish: false,
      blockers: blocked,
      check: recheck,
      note: "Nothing was sent. Each blocker is an independent layer; clearing one does not clear "
        + "the others."
    };
  }

  const nonce = crypto.randomBytes(16).toString("hex");
  pending.set(nonce, { channel, text: String(draft.text || ""), claims: context.claims || [] });

  return {
    channel,
    status: "READY",
    would_publish: true,
    nonce,
    payload_preview: String(draft.text || ""),
    check: recheck,
    note: "NOTHING HAS BEEN SENT. Show this payload to the operator and get an explicit yes. "
      + "Only then call the same tool again with this nonce."
  };
}

/**
 * Call 2 — confirm. Re-verifies, then would send. There is no send path yet, by design.
 */
function confirmPublish(channel, nonce) {
  const entry = pending.get(nonce);
  if (!entry) {
    const error = new Error("unknown or expired publish nonce — run the prepare call again");
    error.code = "TRINC_CONTENT_NONCE_UNKNOWN";
    throw error;
  }
  if (entry.channel !== channel) {
    pending.delete(nonce);
    const error = new Error(
      `nonce was issued for '${entry.channel}', not '${channel}' — refusing cross-channel publish`
    );
    error.code = "TRINC_CONTENT_NONCE_CHANNEL_MISMATCH";
    throw error;
  }

  // Re-check rather than trusting that nothing changed between the two calls.
  const recheck = checkDraft({ channel, text: entry.text }, { claims: entry.claims });
  const state = readiness(channel);
  pending.delete(nonce);

  if (!recheck.pass || !state.ready) {
    return {
      channel,
      status: "BLOCKED",
      published: false,
      check: recheck,
      readiness: state,
      note: "State changed between prepare and confirm. Nothing was sent."
    };
  }

  return {
    channel,
    status: "NOT_IMPLEMENTED",
    published: false,
    check: recheck,
    note: "All five layers cleared, and there is deliberately no network send path in this "
      + "version. Wiring one is a separate, reviewed change per channel — the engine's own "
      + "submission lane is structurally manual-only (offer-schema.js throws "
      + "PHASE19_PLATFORM_TARGET_MANUAL_ONLY), and this surface should not quietly become the "
      + "exception. Post it by hand from the payload above."
  };
}

module.exports = { confirmPublish, credentialPresent, preparePublish, readiness, runbook };
