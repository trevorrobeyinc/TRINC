> **Status (2026-05-06):** Historical handoff snapshot. Superseded by both (a) the 2026-04-30 rebrand and (b) the 2026-05-06 full InfraNodus removal. Current brand stack and offerings live in `trevor-robey-inc-agents/REVENUE_PLAYBOOK.md` and `trevor-robey-inc/OFFERINGS.md`. Where this file refers to "we make research reports", the old pricing ladder, OR the InfraNodus webview handoff / MCP integration, treat the current canonical sources (`TrevClaw-Obsidianodus/CLAUDE.md`) as authoritative — InfraNodus is fully out of the stack as of 2026-05-06.

```xml
<context_handoff>
  <meta>
    <source>Claude (Anthropic) — Sonnet 4.6</source>
    <date>2026-04-26</date>
    <turns>~80 (multi-day arc covering architecture cleanup, brand system, commercial launch prep)</turns>
    <topic>Trevor Robey Inc. — full pre-launch state ahead of Tue 2026-04-28 Datarade vendor application</topic>
    <subsequent_updates>This handoff is a 2026-04-26 snapshot. Updates since: (a) the repo `OpenClaw-Research-Agents` was renamed to `trevor-robey-inc-agents` on 2026-04-27 (merged to main as `4bc633f`); GitHub repo also renamed (old URL auto-redirects); local directory moved to `/Users/trevorrobey/trevor-robey-inc-agents/`. (b) The persistent OpenClaw gateway on :18789 was removed 2026-04-27 (it was actually an unrelated homebrew openclaw consumer product). (c) Pricing model expanded to 4 tiers (Standard $2,500–$4,950, Premium $4,950–$14,950, Custom $15,000–$35,000, Enterprise $60,000–$120,000+ ARR); the 3-tier numbers below are pre-Premium-tier. (d) ToolUniverse tool count is `~2,116` per the current dossier (this doc says 2,173). (e) The contact email used in launched outbound is being moved to `trevor@trevorobeyinc.com`. For current state see `trevor-robey-inc-agents/{TREVOR_ROBEY_INC_AGENTS_DOSSIER.md,REVENUE_PLAYBOOK.md,NOTICE.md,README.md}`.</subsequent_updates>
  </meta>

  <summary>
    Trevor Robey (solo operator, Trevor Robey Inc., trevor@trevorrobey.com) operates the OpenClaw biomedical research intelligence stack at /Users/trevorrobey/TrevClaw-Obsidianodus/ and is launching commercial sales of citation-backed research packs. This conversation completed: (a) major architecture cleanup of the OpenClaw stack — retired TrevNodus, replaced InfraNodus MCP/API with webview handoff, removed AdisInsight, fixed three OpenClaw bugs that blocked workflows from running via Obsidian; (b) full brand system + live website at https://trevorobeyinc.com on Cloudflare Workers; (c) Datarade vendor application drafted and saved, with Variant B (alt-data quant framing) chosen for the storefront pitch. Trevor's next concrete action is Tue 2026-04-28: paste the drafted application blocks into Datarade's intake form. The 30-day commercial launch plan is queued in the todo list.
  </summary>

  <key_decisions>
    1. **Path B (Obsidian Copilot chat → :8799 → plugin → InfraNodus webview) is the production research workflow.** No fork of the InfraNodus Obsidian plugin — Trevor's "fork to bypass API tokens" idea was investigated and rejected because the only paywalled features that justify a fork are the ones that require InfraNodus AI tokens server-side; the free `?text=` URL handoff path is already what OpenClaw uses. Webview verified live-end-to-end with a 5/5-step `general-research-pack` workflow on topic "caffeine and sleep".

    2. **TrevNodus / InfraNodus-Visual at HTTPS :3000 was retired** from the workflow on 2026-04-25. Codebase preserved at /Users/trevorrobey/Claude/InfraNodus-Visual/ but launchd plist not loaded. Visualization is delegated to InfraNodus SaaS via webview + the official InfraNodus AI Graph View Obsidian plugin.

    3. **InfraNodus MCP server fully removed** from both `/Users/trevorrobey/.claude.json` and `/Users/trevorrobey/Library/Application Support/Claude/claude_desktop_config.json` (timestamped `.bak.cleanup.*` backups preserved). The webview handoff replaces it entirely. Trevor's API key (sha256 f5584586bb30, prefix 20415:) was removed from all surfaces.

    4. **DrugBank stripped from all 13 collateral files** because DrugBank's 2025 commercial-use ToS prohibits derivative datasets/fee-for-service reporting without a paid license. Substituted RxNorm RxCUIs (US public-domain) across samples, catalog, one-pagers, teasers, outbound emails, LinkedIn templates, and the landing page. License Register stub added to public deliverables stating "DrugBank: NOT INCLUDED — separate licensed pack available."

    5. **FAERS → AEMS migration copy applied** across all pharmacovigilance copy + the landing page. First mention per file gets parenthetical "AEMS (formerly FAERS, daily updates since Aug 2025; migration completed Mar 11, 2026)"; subsequent mentions are bare "AEMS".

    6. **AdisInsight integration scaffolding removed** because it requires institutional subscription (5–6 figure ARR) and Trevor as a solo operator with a Strayer .edu email cannot access it. Removed: openclaw-bridge/mcp/adisinsight-mcp/ directory and config/data-source-credentials.json adisinsight key. Backups at .bak.cleanup.* preserved.

    7. **Live commercial site is at https://trevorobeyinc.com** (Cloudflare Worker `shy-grass-fccd`, account `f3b10bacc7e94c72e445b078433aa1d4`). Old https://trevorrobeyinc.github.io is retired/superseded. Cloudflare-Registrar-owned domain, Universal SSL active, www subdomain also attached. NOT GitHub Pages.

    8. **Brand: TR monogram (not TRI)** chosen for ticker-symbol cadence + 16px favicon legibility + balance with "TREVOR ROBEY INC" wordmark. Geometric, sharp 90° corners, 140×64 viewBox, single-color via `currentColor`. Inline SVG ships in the live HTML.

    9. **Typography: IBM Plex Sans + IBM Plex Mono** (SIL OFL, free commercial) over Inter+JetBrains Mono. Voice match — Plex reads institutional-engineering, not consumer-SaaS. Loaded via Google Fonts CDN with `font-display: swap`.

    10. **Datarade vendor pitch: Variant B (alt-data hedge fund framing)** chosen for the storefront free-text. Reasons: 2-6 week sales cycle vs 3-9 month pharma procurement, reproducibility differentiator strongest in this audience, $15K-$50K price-per-deal sweet spot for solo ops. Variants A (pharma CI) and C (boutique/academic) repurposed for Week 2 cold emails.

    11. **Figma file kept as visual reference only**, not as production source. All shipped pixels at trevorobeyinc.com came from inline SVG + CSS in the HTML at /Users/trevorrobey/trevor-robey-inc-agents/workspace/collateral/landing-page/index.html. The Figma file at https://www.figma.com/design/cAlmeot0lXqqcIDecpQjdO contains 4 pages (Tokens, Logo, Typography, Components) with a Variable Collection of 7 color tokens and the TR monogram in 5 variants — useful for future contractor handoff but not on the critical path.

    12. **Old Starter-team Figma file at https://www.figma.com/design/PyuQFMuru0qC1xwMfxNKG5 is superseded** — Trevor created a trevorobeyinc-team education-Pro team and a new file (cAlmeot0lXqqcIDecpQjdO) lives there. Old file can be trashed at user's leisure.

    13. **Commercial Launch Playbook from claude.ai is the 30-day source of truth** — saved at /Users/trevorrobey/Downloads/OpenClaw Commercial Launch Playbook.md. Three launch-blockers it surfaced (DrugBank, FAERS, ChEMBL share-alike) — DrugBank and FAERS already resolved; ChEMBL counsel opinion still pending and bundled with Week 1 attorney work.

    14. **Three OpenClaw bugs were found and fixed** during end-to-end workflow verification: (a) llm-adapter fallback path leaked Claude model name into LM Studio request causing HTTP 400; (b) Obsidian-spawned subprocess inherited a minimal PATH lacking ~/.local/bin so claude binary couldn't be found; (c) 17KB synthesizer URL exceeded InfraNodus's URI limit (HTTP 414) — fixed with 6000-char truncation + pointer to vault note.

    15. **Path B verified working end-to-end**: workflow-048e74355142bade0f6410d9 ran 5/5 steps in ~4.5 min, generated 5 vault notes at /Volumes/ExtraCurricular/My Digital Garden/OpenClaw/general-research-pack/2026-04-26 workspaceresearch-inputsample caffeine and sleep/, auto-fired the InfraNodus webview handoff with synthesizer markdown pre-filled.
  </key_decisions>

  <technical_context>
    ## Workspace structure

    Meta-workspace at /Users/trevorrobey/TrevClaw-Obsidianodus/ with three symlinked sub-projects:
    - Claude/ → /Users/trevorrobey/Claude/ (TrevNodus archived, Zettelkasten MCP, OpenClaw Command Center plugin source)
    - Copilot-Everything/ → /Users/trevorrobey/THE Copilot in Obsidian Everything/ (canonical MCP bridge :8798, backend emulator, Miyo)
    - trevor-robey-inc-agents/ → /Users/trevorrobey/trevor-robey-inc-agents/ (multi-agent research pipeline, gateway :18789, all collateral)

    Obsidian vault at /Volumes/ExtraCurricular/My Digital Garden/ (ExtraCurricular volume must be mounted).

    ## Key file paths

    | File | Purpose |
    |---|---|
    | /Users/trevorrobey/TrevClaw-Obsidianodus/context-handoff-biomedical-research-stack-architecture.md | Full architecture handoff for the biomedical research stack |
    | /Users/trevorrobey/trevor-robey-inc-agents/CLAUDE.md | OpenClaw operator guide (provider config, deploy recipes) |
    | /Users/trevorrobey/trevor-robey-inc-agents/REVENUE_PLAYBOOK.md | Internal commercial ops playbook (Apr 2026) |
    | /Users/trevorrobey/trevor-robey-inc-agents/workspace/collateral/ | All buyer-facing collateral (catalog, samples, one-pagers, outbound, platform-guides, landing-page) |
    | /Users/trevorrobey/trevor-robey-inc-agents/workspace/collateral/brand-system.md | Brand tokens, type scale, logo SVG, usage rules per surface |
    | /Users/trevorrobey/trevor-robey-inc-agents/workspace/collateral/landing-page/index.html | Production HTML source — edit here, copy to deploy dir, upload |
    | /Users/trevorrobey/trevor-robey-inc-agents/workspace/collateral/outbound/datarade-application.md | The drafted Datarade vendor application — paste-ready for Tuesday submission |
    | /Users/trevorrobey/openclaw-landing-deploy/ | Staged deploy directory for Cloudflare Worker uploads |
    | /Users/trevorrobey/openclaw-landing-deploy/assets/openclaw-pharmacovigilance-teaser.html | Rendered teaser ready for Cmd+P → Save as PDF |
    | /Users/trevorrobey/Downloads/OpenClaw Commercial Launch Playbook.md | The Claude.ai-generated 30-day playbook |
    | /Users/trevorrobey/Claude/obsidian-openclaw-command-center/src/main.ts | Plugin source — `activateInfranodusWebview()`, `ingestToInfranodus()` at lines 716-743 |
    | /Users/trevorrobey/Claude/obsidian-openclaw-command-center/src/subprocess/openclaw-runner.ts | Plugin runner — PATH-enrichment fix at lines 73-89 |
    | /Users/trevorrobey/trevor-robey-inc-agents/openclaw-bridge/core/llm-adapter.js | OpenClaw LLM adapter — fallback-model fix at lines 382-388 |

    ## Live infrastructure

    - **trevorobeyinc.com** — Cloudflare Worker `shy-grass-fccd` in account `f3b10bacc7e94c72e445b078433aa1d4`, education-Pro team `trevorobeyinc-team` (teamId 1630113137550497413). Deploy: drag /Users/trevorrobey/openclaw-landing-deploy/ folder into the Cloudflare dashboard "New deployment" UI.
    - **Obsidian vault**: /Volumes/ExtraCurricular/My Digital Garden/
    - **OpenClaw Command Center plugin**: deployed at /Volumes/ExtraCurricular/My Digital Garden/.obsidian/plugins/openclaw-command-center/, source at /Users/trevorrobey/Claude/obsidian-openclaw-command-center/
    - **InfraNodus AI Graph View Obsidian plugin**: deployed at /Volumes/ExtraCurricular/My Digital Garden/.obsidian/plugins/infranodus-graph-view/ (Trevor configured the API key in the plugin's settings; this surface is independent of the OpenClaw webview handoff)
    - **Figma**: https://www.figma.com/design/cAlmeot0lXqqcIDecpQjdO ("Trevor Robey Inc — Brand System") in trevorobeyinc-team

    ## Brand tokens (live in :root of trevorobeyinc.com HTML)

    | Token | Hex |
    |---|---|
    | --color-bg-base | #0a0a0f |
    | --color-surface-raised | #12121a |
    | --color-border-subtle | #1e1e2a |
    | --color-text-primary | #e8e8ec |
    | --color-text-muted | #8888a0 |
    | --color-accent-primary | #4a90d9 |
    | --color-accent-hover | #5da0e9 |

    Fonts: IBM Plex Sans (400/500/600/700) + IBM Plex Mono (400/500), loaded via Google Fonts CDN with `font-display: swap`.

    ## TR monogram canonical SVG (140×64 viewBox)

    ```html
    <svg viewBox="0 0 140 64" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="64" height="12"/>
      <rect x="26" y="12" width="12" height="52"/>
      <rect x="76" y="0" width="12" height="64"/>
      <rect x="88" y="0" width="40" height="12"/>
      <rect x="116" y="12" width="12" height="24"/>
      <rect x="88" y="24" width="40" height="12"/>
      <polygon points="104,36 116,36 128,64 116,64"/>
    </svg>
    ```

    ## Workflow trigger paths (research → vault notes → InfraNodus graph)

    | Trigger | Surface | Status |
    |---|---|---|
    | Click OpenClaw Pipeline ribbon icon | Obsidian | ✅ works |
    | Type research request in Obsidian Copilot chat (chosen production path) | Obsidian via :8799 MCP bridge | ✅ works (Path B) |
    | Direct CLI: `node scripts/run-workflow.js ...` | Terminal | ✅ works but auto-handoff doesn't fire (plugin tracker isn't watching) |

    ## Source-license register (proactive in every deliverable)

    AEMS, ClinicalTrials.gov, PubChem, RxNorm, OpenFDA = US public domain. UniProt = CC BY 4.0. ChEMBL = CC BY-SA 3.0 (derived analyses with version cited; raw rows not redistributed). PubMed = free metadata + PMC OA full-text. **DrugBank = NOT INCLUDED**, separate licensed pack available.

    ## Pricing tiers

    - Standard pack: $2,500 – $4,950 per single-topic report (72-hour secure email)
    - Custom Mission: $15,000 – $35,000 per project (Snowflake/AWS/BigQuery delivery)
    - Enterprise Subscription: $60,000 – $120,000+ ARR (API access, SLA)
  </technical_context>

  <action_items>
    1. [pending] Mon Apr 27 — Confirm Trevor Robey Inc. LLC operating docs (registered agent, EIN, separate bank account at Mercury or Relay)
    2. [pending] Mon Apr 27 — Open parallel insurance quote requests from Vouch + Hiscox + Embroker for $1M/$2M E&O + $1M Cyber, asking explicitly: "Does the policy cover claims arising from AI/LLM-generated content?"
    3. [pending] Mon Apr 27 — Render the 2-page teaser HTML to PDF (open /Users/trevorrobey/openclaw-landing-deploy/assets/openclaw-pharmacovigilance-teaser.html in Safari → Cmd+P → Save as PDF). Or install BasicTeX with `brew install --cask basictex` and re-run pandoc.
    4. [in-progress] **Tue Apr 28 — Submit Datarade vendor application** at https://datarade.ai/company/contact/data-providers. Paste blocks from /Users/trevorrobey/trevor-robey-inc-agents/workspace/collateral/outbound/datarade-application.md. Use Variant B (alt-data quant framing) for the free-text "describe your data" field. Attach the rendered teaser PDF.
    5. [pending] Wed Apr 29 — Datarade vendor onboarding call (auto-scheduled within 1-3 business days of submission); confirm exact commission terms. Create HuggingFace org `trevorobeyinc-inc` + gated dataset `openclaw-pharmacovigilance-teaser` with extra_gated_fields. Build citation-reproducibility validator (Python ≤200 lines) — DOI HEAD checks, NCBI E-utilities efetch, Crossref metadata-match, Unpaywall OA → JSON Reproducibility Manifest.
    6. [pending] Thu Apr 30 — AWS Marketplace seller registration + file Data Exchange qualification request (starts the 2-6 week clock). Run validator + Microsoft Presidio (PHI/PII) across redacted pharmacovigilance sample. Engage contracts attorney for fixed-fee MSA + SOW + DPA pair off Common Paper standards (~$1,500-$3,500 flat, target turnaround Wed May 13). **Bundle ChEMBL CC BY-SA 3.0 share-alike opinion into this engagement.**
    7. [pending] Fri May 1 — Push Datarade storefront live (assuming approval); push HuggingFace gated dataset live; bind insurance policy with Vouch (first choice) or Hiscox.
    8. [pending] Week 2 (May 4-8) — Cold email + LinkedIn outbound to all 12 named accounts from Playbook Section 1 (60 emails + 30 LinkedIn touches). Use Variant A (pharma CI) for AbbVie/AstraZeneca/GSK, Variant B (alt-data) for Citadel/Point72/RA Capital, Variant C (boutique) for ClearView/Trinity/Clarivate. Reference specific job posting/partnership URL in each email's first sentence. AWS Data Exchange product-creation work (DSA draft, dataset hierarchy, refund policy). Build second pack (drug discovery template) end-to-end through validator + Presidio + freshness check.
    9. [pending] Week 3 (May 11-15) — Receive MSA + SOW + DPA back from attorney; redline + post Common Paper Cover Page on landing site. Pre-build SIG-Lite + CAIQ-Lite vendor-security questionnaire answers. Stand up Stripe Invoicing (ACH 0.8% capped at $5; card 2.9%+30¢). Wire Ragas (LLM-as-judge faithfulness/answer-relevance/context-precision) into validator pipeline. If AWS DX qualification clears: create first product (pharmacovigilance pack as PDF + Parquet appendix), list at $4,950 + $25K/yr 6-pack subscription private offer.
    10. [pending] Week 4 (May 18-22) — Publish target-validation pack (highest ICP overlap with AI-bio cohort: Recursion, Isomorphic, Iambic, Xaira, Formation, EvolutionaryScale). Drop free target-validation sample on Kaggle as SEO/credibility breadcrumb pointing to paid Datarade + AWS listings. Second outbound wave to Persona 2 (RA Capital, Citadel, Point72) emphasizing alt-data utility.
    11. [pending] Month-end review against KPIs: 3/3 listings live (Datarade + HF + AWS), ≥3 discovery calls held, ≥1 signed NDA in pipeline.
    12. [pending] If a $50K+ inquiry lands at any point — run Playbook Section 5 risk-mitigation checklist end-to-end before quoting (License Register, citation audit, Common Paper NDA, fixed-fee SOW with milestones, 50/50 payment terms, refund boilerplate, OFAC screen, HIPAA assessment, COI ready).
    13. [pending] After 24h of clean HTTPS at trevorobeyinc.com — turn ON Cloudflare → SSL/TLS → Always Use HTTPS + Automatic HTTPS Rewrites + Min TLS 1.2. Do NOT enable HSTS preload until 24h+ of clean operation.
    14. [pending — optional] Move old Starter-team Figma file at https://www.figma.com/design/PyuQFMuru0qC1xwMfxNKG5 to trash; delete the Strayer Education student team if not needed.
  </action_items>

  <constraints_and_preferences>
    - **Solo operator capacity**: 4 focused hours/day, Mon-Fri. No support staff. Keep recommendations realistic for solo ops.
    - **Voice**: technical, citation-dense, zero marketing hyperbole. Lead with verifiability, not AI. No "synergy / unlock / revolutionary / AI-powered" without qualifiers.
    - **Path B is the production research workflow** (Obsidian Copilot chat → :8799 MCP bridge → plugin → vault notes → InfraNodus webview). Don't propose other paths.
    - **No autonomous external publishing**. Marketplace submissions, browser automation, account creation are manual-only — Trevor does the final click.
    - **Plan-first**: Enter plan mode for non-trivial tasks. Verify before declaring done.
    - **Self-improvement loop**: After any correction, update /Users/trevorrobey/.learnings/LEARNINGS.md.
    - **No Figma round-trip required**. Figma file is reference only; production assets are inline SVG + CSS in the HTML.
    - **Public-domain-only citations** are the buyer-facing differentiator. DrugBank stays excluded unless a customer specifically wants it as a paid licensed pack.
    - **Pricing is transparent** on landing page — buyers self-qualify. Don't hide pricing.
    - **Cloudflare-only hosting**, not GitHub Pages. The old https://trevorrobeyinc.github.io is retired; never redirect new work there.
    - **No InfraNodus AI tokens**. Webview handoff stays on /import/editor?text= which uses InfraNodus's local non-LLM graph algorithms (zero cost).
    - **No autonomous trades/transfers/payments**. If a $50K inquiry arrives, the user runs the risk checklist before quoting.
    - **All file references use absolute paths**.
    - **Terminal code blocks**: clean copy-paste-ready commands first, explanations after in backticks.
  </constraints_and_preferences>

  <conversation_arc>
    1. Started with an architecture audit of the biomedical research stack — confirmed 4 active systems (after retiring TrevNodus and unwiring InfraNodus MCP).
    2. Verified the Path B workflow end-to-end: discovered three OpenClaw bugs (llm-adapter fallback model leak, Obsidian PATH inheritance, InfraNodus URI 414), fixed all three, confirmed workflow `general-research-pack` topic="caffeine and sleep" runs 5/5 steps and auto-fires the InfraNodus webview handoff.
    3. Investigated whether the InfraNodus AI Graph View Obsidian plugin could be forked to bypass API tokens — concluded no; the only paywalled features are server-side, free features already exist via `?text=` URL.
    4. Cleaned all DrugBank IDs from 13 collateral files, applied FAERS→AEMS migration, deployed cleaned landing page to Cloudflare Workers as project `shy-grass-fccd`.
    5. Stood up trevorobeyinc.com as the production domain (Trevor confirmed spelling — intentional, not a typo). Cloudflare Pages → Worker, custom domain attached, SSL active. Hit and resolved a regex bug from the FAERS→AEMS substitution and a duplicate RxNorm in source list during deploy verification.
    6. Built brand system: TR monogram in Figma + as inline SVG in production HTML, IBM Plex Sans/Mono via Google Fonts CDN, 7 formalized color tokens, brand-system.md doc. Re-verified Trevor wants Cloudflare-only (not mixed with GitHub Pages).
    7. Migrated Figma work from old Starter team (3-page cap blocked) to new trevorobeyinc-team education-Pro team. New file cAlmeot0lXqqcIDecpQjdO has 4 pages (Tokens, Logo, Typography, Components) and color Variables.
    8. Confirmed the Figma file isn't required for any of the next 30-day work — production assets are code-side.
    9. Removed AdisInsight scaffolding (not wired into runtime, never used, requires institutional license unviable for solo ops). Backups at .bak.cleanup.*.
    10. Drafted the Datarade vendor application based on the Claude.ai Commercial Launch Playbook + cleaned collateral. Trevor asked me to decide between three pitch variants — picked Variant B (alt-data quant framing) for the storefront, repurposed A and C for Week 2 cold-email outreach.
    11. Rendered 2-page teaser to HTML at /Users/trevorrobey/openclaw-landing-deploy/assets/openclaw-pharmacovigilance-teaser.html (LaTeX PDF engine not installed; user does Cmd+P → Save as PDF in Safari, or installs BasicTeX).
    12. User asked for this handoff to seed a fresh Claude Code session.
  </conversation_arc>

  <raw_artifacts>
    ## Datarade application — paste-ready blocks (full source at /Users/trevorrobey/trevor-robey-inc-agents/workspace/collateral/outbound/datarade-application.md)

    Form-field-mapped sections: Company info, Geographic coverage, Data categories (Pharma Data + Drug Discovery Data + Pharmacovigilance Data + Clinical Trial Data + Biomedical Research Data), Products (6 packs), Use cases, Delivery methods (PDF + Parquet for Standard, native cloud for Custom, API for Enterprise), Pricing model (3 tiers), Sample availability (public 2-page teaser + full sample post-NDA), Update frequency, Compliance posture, Source license register, Vendor pitch (✅ Variant B chosen), Attachments, Submission notes, Post-submission expectations.

    ## Variant B (the chosen Datarade storefront free-text)

    > Citation-grounded biomedical intelligence for biotech-focused alt-data and quant teams. Every signal — pipeline phase, adverse event ROR, target-disease evidence score, trial enrollment trend — resolves to public-domain identifiers (NCT, PMID, AEMS report IDs) with timestamped Reproducibility Manifests so every claim is independently replayable. Six standardized pack templates plus custom missions. Standard $2.5K–$4.95K per single-topic report, 72-hour delivery; Custom $15K–$35K with native cloud delivery; Enterprise subscriptions $60K+ ARR with API access and SLA.

    ## 15 named target accounts from Playbook Section 1

    Persona 1 (pharma CI): AstraZeneca, AbbVie, GSK
    Persona 2 (alt-data quants): Citadel (Surveyor + Data Strategies Group), Point72 (MI-Data + Cubist), RA Capital (TechAtlas + QR&S)
    Persona 3 (target discovery): Recursion, Isomorphic Labs, Iambic Therapeutics
    Persona 4 (boutique consultancy): Trinity Life Sciences, Clarivate (Cortellis), ClearView Healthcare Partners
    Wild cards: Xaira Therapeutics, Formation Bio, EvolutionaryScale

    ## Pricing benchmarks confirmed by Playbook Section 3

    - GlobalData Thematic Reports: $995-$1,950 per single-user PDF (Trevor's Standard tier is 2-3× higher; differentiate on citation depth)
    - DealForma: $18K Individual / $32K Premium per year (Trevor's Custom tier $15K-$35K is at parity)
    - Citeline Pharmaprojects: ~$50K-$90K per module/yr (Trevor's Standard is 10-20× lower; positioning is "single-question substitute")
    - Cortellis Drug Discovery Intelligence: ~$200K-$1M ACVs (Trevor's Enterprise $60K-$120K is well below)
    - Definitive Healthcare Atlas: ~$25K-$40K starter, $100K redline (Trevor's Custom sits at parity)
  </raw_artifacts>

  <handoff_instructions>
    You are continuing work for Trevor Robey, solo operator of Trevor Robey Inc. / OpenClaw Research Intelligence. The biomedical research stack is fully operational and verified end-to-end. The brand and live website are shipped at https://trevorobeyinc.com. The Datarade vendor application is drafted and ready to submit Tuesday April 28.

    Your role going forward is to help Trevor execute the 30-day Commercial Launch Playbook on schedule. The next concrete action is the Tuesday Datarade submission — Trevor will do that himself; your help is needed on (a) Mon Apr 27 LLC docs check + insurance quote requests, (b) Wed-Fri week-1 ops (HuggingFace gated dataset, citation validator, AWS Marketplace registration, contracts attorney engagement), (c) Week 2 cold-email outbound to the 15 named accounts, (d) Week 3-4 ongoing platform listings + pack #2 + pack #3.

    Read /Users/trevorrobey/Downloads/OpenClaw Commercial Launch Playbook.md for full strategic context. Read /Users/trevorrobey/trevor-robey-inc-agents/workspace/collateral/outbound/datarade-application.md for the submitted-or-about-to-be-submitted Datarade application. Read /Users/trevorrobey/trevor-robey-inc-agents/workspace/collateral/brand-system.md for visual/typographic standards to apply to any new collateral. Read /Users/trevorrobey/TrevClaw-Obsidianodus/context-handoff-biomedical-research-stack-architecture.md for full stack architecture if needed.

    Respect the constraints listed above — solo-operator capacity, no AI hyperbole, public-domain citations only, Cloudflare-not-GitHub for hosting, plan-first for non-trivial work, no autonomous publishing. The user values verifiability over polish.

    If something Trevor asks for is out of scope or unwise, say so plainly with the rationale. You're a senior advisor, not a yes-man.
  </handoff_instructions>
</context_handoff>
```
