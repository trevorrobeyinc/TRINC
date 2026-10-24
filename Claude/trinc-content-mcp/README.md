# trinc-content

Content creation for the Trevor Robey, INC. channels — **YouTube · TikTok · Instagram ·
Facebook Page · AWS Data Exchange**.

A local stdio MCP server. No network listener, no TCP port, no telemetry.

## Why this exists

An LLM can write a caption unaided. What it cannot do reliably is **refuse** to write one.

This business sells citation-traced due diligence — its product *is* the claim that its claims
are checkable. Marketing copy that invents a figure is that failure mode pointed inward. So this
server's job is not generation, it is **mechanical enforcement of rules the business already
wrote down and previously enforced nowhere**:

| Rule | Where it lives | What this server does |
|---|---|---|
| Company voice ≠ founder voice | `01-brand-system/personal-brand.md` "do not mix" table | Each channel declares `trinc_voice`; drafting reads it, the gate fails a mixed lockup |
| Entity disclosure, verbatim | Cal. Bus. & Prof. Code §17910.5(a) | Pinned as a constant; a paraphrase fails |
| Retired claims stay retired | `OFFERINGS.md` (commit `7801443`) | "Zero hallucinations" and friends fail, with where each was retired |
| No unmeasurable metric | `PLUGIN-BINDINGS.md` — marketing analytics is **UNBOUND** | Any follower/engagement/reach figure fails |
| No figure without a source | the zero-fabrication doctrine | Every number must trace to a deliverable, or it fails |

## The anti-fabrication spine

`content_extract_claims` parses a release bundle's own deliverables and returns the **only**
figures a post about it may assert — each with the file it came from and the verbatim line as
evidence.

`content_draft` states a figure when the bundle supports it, and otherwise emits a
`[VERIFY:n]` slot naming the deliverable to read it from. That asymmetry is the design: **an
unfilled slot is visible; a fabricated number is not.**

`content_check` re-verifies independently rather than trusting a draft's own front matter.

Parsers match the *actual* rendered formats (read from shipped bundles 2026-09-19), not an
assumed schema. If a renderer changes shape, the claim goes missing and degrades to a VERIFY
slot — a safe failure, and `test/parsers.test.mjs` fails loudly so it is also a visible one.

## Tools

| Tool | Does |
|---|---|
| `content_brand_context` | The canon as structured data — voice rules, disclosure, taglines, visual tokens |
| `content_source_inventory` | Release bundles and workflow runs available to repurpose |
| `content_extract_claims` | The only figures a post may assert, each with its source file |
| `content_channel_profile` | Voice, caption limit, form, and live publish readiness |
| `content_draft` | Draft for one channel from one bundle; gates its own output, and emits a thumbnail spec bound by the same claims |
| `content_check` | Run any copy through the gate — hand-written included |
| `content_calendar` | Posting schedule from the cadence the marketing plan documents, with the un-documented channels labelled as extrapolation |
| `content_aws_listing` | AWS Data Exchange listing copy, company voice |
| `publish_youtube` · `publish_tiktok` · `publish_instagram` · `publish_facebook_page` | Per-channel publish, two-call handshake |

## Publishing is inert, on purpose

No channel has a credential. Each publish tool refuses independently and says exactly what is
missing and how the **operator** fixes it. Five independent layers must clear:

1. **Credential** — a minimum-scope token in the Keychain (`trinc-content-<channel>`). Claude
   never creates, reads, types or transports it.
2. **Allowlist** — `TRINC_CONTENT_PUBLISH` must name the channel. Currently empty.
3. **Handshake** — call one returns the exact payload and a nonce and sends nothing; call two
   echoes the nonce back. The operator says yes in between.
4. **Host gate** — the PreToolUse gate keeps its own list of publish tool names and requires an
   armed scope. It does not trust this server's word.
5. **Re-check** — the compliance gate runs again at publish. A recorded PASS is a record, not an
   authorization.

There is deliberately **no network send path** in this version. The engine's own submission lane
is structurally manual-only (`offer-schema.js` throws `PHASE19_PLATFORM_TARGET_MANUAL_ONLY` for
any target that is not `manual_only`), and this surface must not quietly become the exception.
Wiring a real send is a separate, reviewed change, per channel.

## Layout

```
src/config.js     paths, disclosure, retired claims, unmeasurable metrics, allowlist
src/brand.js      reads the brand canon; channel -> voice (never guessed)
src/sources.js    the anti-fabrication spine: bundle -> claims with evidence
src/draft.js      channel-shaped drafting; figures or VERIFY slots
src/check.js      the compliance gate
src/calendar.js   posting cadence from the marketing plan; extrapolation labelled as such
src/publish.js    per-channel publish, five-layer pin, inert
src/tools.js      MCP tool definitions + dispatch
src/server.js     stdio entry point
```

## Run

```bash
npm test     # 56 unit + integration tests
npm run smoke  # real MCP handshake against the running server
```

Registered in `/Users/myhome/TRINC/.mcp.json`, which is git-tracked — so **no
secret may ever go in that stanza**. `TRINC_CONTENT_REPO` points at the monorepo and is also what
lets tests target a fixture.

## Related, deliberately not duplicated

- **Layer A, in the monorepo:** the same four channels exist as phase21 publisher adapters
  (`openclaw-bridge/monetization/adapters/`), producing deterministic submission packs inside a
  release bundle. That is the engine-side lane; this is the authoring lane.
- **Visuals:** the `trinc-viz-studio` Obsidian plugin on `:8800` already renders on-brand charts,
  diagrams and stat tiles. `content_draft` emits a **`viz_stat_tiles` spec**, ready to hand to
  that tool — it does not render, and it deliberately does **not proxy the bridge**. Proxying
  would put one renderer behind two doors and make this server depend on Obsidian being open,
  for no new capability; it is the same reasoning that declined merging the `:8798` and `:8799`
  bridges. The tiles are built only from claims the draft actually used, so the image is bound
  by the same evidence as the words — a thumbnail is where an invented number is most tempting
  and least checkable.
- **Skills:** `trinc-business:brand-check`, `trinc-marketing:collateral-audit` and
  `trinc-marketing:outbound-draft` remain the human-driven audit lane. `content_check` is the
  machine gate that runs on every draft. Compose, do not reimplement.
