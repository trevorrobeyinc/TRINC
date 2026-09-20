"use strict";

/**
 * Tool definitions + dispatch for the trinc-content connector.
 *
 * @module tools
 */

const { CHANNELS, SURFACES, paths } = require("./config.js");
const { brandContext, voiceRules } = require("./brand.js");
const { extractClaims, listSources } = require("./sources.js");
const { CHANNEL_SHAPE, buildDraft } = require("./draft.js");
const { checkDraft } = require("./check.js");
const { confirmPublish, preparePublish, readiness, runbook } = require("./publish.js");

const CHANNEL_ENUM = SURFACES;

function publishTool(channel) {
  return {
    name: `publish_${channel}`,
    description:
      `Publish a checked draft to ${channel}. TWO-CALL HANDSHAKE: call once with `
      + `{draft_text} to get the exact outbound payload plus a nonce — this sends NOTHING. Show `
      + `that payload to the operator, get an explicit yes in chat, then call again with `
      + `{nonce}. Refuses unless all five layers clear: a minimum-scope credential in the `
      + `Keychain, the channel named in TRINC_CONTENT_PUBLISH, the nonce handshake, the host `
      + `gate, and a fresh compliance check. No channel has a credential today, so this `
      + `currently reports what is missing and how the operator fixes it.`,
    inputSchema: {
      type: "object",
      properties: {
        draft_text: { type: "string", description: "The full post text to publish." },
        nonce: { type: "string", description: "Confirmation nonce from the first call." },
        claims: {
          type: "array",
          description: "The claims array from content_extract_claims, so the re-check can verify figures.",
          items: { type: "object" }
        }
      }
    }
  };
}

const TOOLS = [
  {
    name: "content_brand_context",
    description:
      "Read the Trevor Robey, INC. brand canon as structured data: the company-voice vs "
      + "founder-voice do-not-mix rule and which voice each channel uses, the verbatim entity "
      + "disclosure required by Cal. Bus. & Prof. Code §17910.5(a), the taglines, and the visual "
      + "tokens. Call this BEFORE drafting anything customer-facing — the voice split is the rule "
      + "most easily broken by writing from memory.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "content_source_inventory",
    description:
      "List the real engine output available to repurpose into content: every release bundle "
      + "under workspace/releases/ and workflow run under workspace/workflows/, with which "
      + "deliverables each one carries (citation-integrity, graveyard-memo, search-coverage). "
      + "Content is built FROM these, never from imagination.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "content_extract_claims",
    description:
      "Extract the ONLY figures a post about a given bundle is allowed to assert. Parses the "
      + "bundle's own deliverables and returns each claim with its value, the file it came from, "
      + "and the verbatim line as evidence. This is the anti-fabrication spine: content_draft "
      + "will not state a number that did not come from here, and content_check fails a draft "
      + "that does.",
    inputSchema: {
      type: "object",
      properties: {
        source_ref: {
          type: "string",
          description: "A release bundle id (offer-<id>) or workflow id (workflow-<id>)."
        }
      },
      required: ["source_ref"]
    }
  },
  {
    name: "content_channel_profile",
    description:
      "Per-channel constraints: which voice it uses, its caption limit, its content form, and "
      + "its current publish readiness with the exact blockers.",
    inputSchema: {
      type: "object",
      properties: {
        channel: { type: "string", enum: CHANNEL_ENUM, description: "Channel to describe." }
      }
    }
  },
  {
    name: "content_draft",
    description:
      "Draft a post for one channel from one source bundle. Uses the channel's declared voice, "
      + "states only figures the bundle supports, and turns every unsupported figure into a "
      + "[VERIFY:n] slot naming the deliverable to read it from. Runs the compliance gate on its "
      + "own output before returning. Set write:true to save it under "
      + "workspace/collateral/social/.",
    inputSchema: {
      type: "object",
      properties: {
        channel: { type: "string", enum: CHANNEL_ENUM },
        source_ref: { type: "string", description: "offer-<id> or workflow-<id>." },
        write: { type: "boolean", default: false, description: "Write the draft to disk." }
      },
      required: ["channel", "source_ref"]
    }
  },
  {
    name: "content_check",
    description:
      "Run any text through the compliance gate: voice correct for the channel and not mixed, "
      + "entity disclosure present verbatim, no retired claim (e.g. 'zero hallucinations', "
      + "retired from OFFERINGS.md in 2026-07), no metric this stack cannot measure (there is no "
      + "analytics binding, so any follower or engagement figure was invented), and no number "
      + "absent from the supplied claim set. Returns PASS/FAIL with per-finding detail. Use it on "
      + "hand-written copy too, not just generated drafts.",
    inputSchema: {
      type: "object",
      properties: {
        channel: { type: "string", enum: CHANNEL_ENUM },
        text: { type: "string", description: "The copy to check." },
        claims: {
          type: "array",
          description: "Claims from content_extract_claims. Without it, figure checking is advisory only.",
          items: { type: "object" }
        },
        require_disclosure: { type: "boolean", default: true }
      },
      required: ["channel", "text"]
    }
  },
  {
    name: "content_aws_listing",
    description:
      "Draft AWS Data Exchange listing copy for a release bundle, in company voice, gated by the "
      + "same checks. The AWS seller listing is a content surface like any other here.",
    inputSchema: {
      type: "object",
      properties: {
        source_ref: { type: "string", description: "offer-<id> or workflow-<id>." },
        write: { type: "boolean", default: false }
      },
      required: ["source_ref"]
    }
  }
].concat(CHANNELS.map(publishTool));

const HANDLERS = {
  content_brand_context: async () => brandContext(),

  content_source_inventory: async () => {
    const inventory = listSources();
    return {
      ...inventory,
      release_count: inventory.releases.length,
      workflow_count: inventory.workflows.length,
      searched: { releases: paths().releases, workflows: paths().workflows }
    };
  },

  content_extract_claims: async (args) => extractClaims(String(args.source_ref || "")),

  content_channel_profile: async (args) => {
    const channel = String(args.channel || "");
    if (!channel) {
      return {
        channels: CHANNEL_ENUM.map((name) => ({
          channel: name,
          ...voiceRules(name),
          ...CHANNEL_SHAPE[name]
        }))
      };
    }
    const shape = CHANNEL_SHAPE[channel] || null;
    return {
      channel,
      ...voiceRules(channel),
      ...(shape || {}),
      publish: CHANNELS.includes(channel)
        ? { ...readiness(channel), runbook: runbook(channel) }
        : { note: "Not an API-publishable channel — this surface is submitted by hand." }
    };
  },

  content_draft: async (args) => buildDraft({
    channel: String(args.channel || ""),
    source_ref: String(args.source_ref || ""),
    write: args.write === true
  }),

  content_check: async (args) => checkDraft(
    { channel: String(args.channel || ""), text: String(args.text || "") },
    {
      claims: Array.isArray(args.claims) ? args.claims : [],
      requireDisclosure: args.require_disclosure !== false
    }
  ),

  content_aws_listing: async (args) => buildDraft({
    channel: "aws_data_exchange",
    source_ref: String(args.source_ref || ""),
    write: args.write === true
  })
};

for (const channel of CHANNELS) {
  HANDLERS[`publish_${channel}`] = async (args) => {
    if (args.nonce) {
      return confirmPublish(channel, String(args.nonce));
    }
    return preparePublish(
      channel,
      { text: String(args.draft_text || "") },
      { claims: Array.isArray(args.claims) ? args.claims : [] }
    );
  };
}

async function dispatch(name, args) {
  const handler = HANDLERS[name];
  if (!handler) {
    return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
  }
  try {
    const result = await handler(args || {});
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const code = err && err.code ? ` [${err.code}]` : "";
    return {
      isError: true,
      content: [{ type: "text", text: `Error in ${name}${code}: ${err.message || String(err)}` }]
    };
  }
}

module.exports = { HANDLERS, TOOLS, dispatch };
