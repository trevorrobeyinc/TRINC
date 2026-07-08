You are Claude Design."

You are Claude Design. Generate a single, complete, self-contained HTML file — all CSS and JavaScript inline, zero external dependencies except one Google Fonts `<link>` tag, zero backend, zero form action endpoints. When saved and opened in a browser, the file must render correctly and be fully functional with no build step and no assets other than the Google Fonts request.

---

CRITICAL ACCURACY RULE — ENFORCE THROUGHOUT, NO EXCEPTIONS

This form represents a real commercial product with a real, codebase-backed audit-trail methodology. Every capability statement must be exactly as true as the ground truth states — no more. The following prohibitions are absolute. Before writing any sentence of form copy, verify it does not violate these rules:

- Do NOT write "zero hallucinations" as a factual guarantee. The only permitted phrasing is "machine-gated to block ungrounded citations below threshold."
- Do NOT write "every citation is verified against its source database." Citations are grounded against records retrieved in the same run; the Reproducibility Manifest re-resolver checks identifier existence — not scientific correctness.
- Do NOT write "retraction-checked" without the qualifier: only cited DOIs go through Crossref (which carries Retraction Watch data); PMIDs and NCTs are not retraction-screened by a separate path.
- Do NOT write "fully automated delivery." External publication, marketplace submission, customer delivery, and authentication actions are manual-only by architectural design.
- Do NOT write "amendment-risk band is predictive." It is a historical signal derived from median protocol version counts of past stopped trials.
- Do NOT write "reports in hours." The turnaround claim is "days, not weeks"; the specific SLA is a written Speed SLA on Investor Pre-Mortem deliveries only — not other SKUs.
- Do NOT write "the Reproducibility Manifest proves scientific correctness." It confirms the identifier resolves — not that the scientific reasoning or attribution is correct.
- Do NOT claim the grounding ratio threshold guarantees quality. The configured default minimum threshold (0.34, set in workflow-engine.js) is a delivery floor, not a quality target. A passing report may still have a majority of cited identifiers not in the fetched evidence.
- Do NOT say the 0.34 threshold value comes from citation-gate.js. The citation-gate.js function-level default is 0.5; the 0.34 value is the configured runtime default set in workflow-engine.js from researchRuntime.config.minGroundedCitationRatio.
- Do NOT use adjectives like "revolutionary," "cutting-edge," "best-in-class," "industry-leading," "unprecedented," "powerful," or any marketing hyperbole. Brand voice: technical, citation-dense, zero marketing hyperbole. Lead with verifiability, not AI.
- The tagline "Every claim, sourced. Every risk, named. In days, not weeks." may appear verbatim in the page title block (hero pillar strip) and at the bottom of Panel H1 only — do not repeat it elsewhere.
- Do NOT say "AI-powered" as a feature claim. Cite the methodology instead: ToolUniverse, PubMed, ClinicalTrials.gov, Crossref DOI screen.
- Do NOT claim "100% citation verification."
- Do NOT use "Zero hallucinations" anywhere in the output HTML, even in the elevator-pitch framing. Permitted substitute: "machine-gated to block ungrounded citations below threshold."
- SPEED AND COST CLAIMS — the following additional guardrails apply to every speed/cost statement in the form:
  - The written Speed SLA applies to Investor Pre-Mortem deliveries ONLY. Do NOT assert a written Speed SLA for any other SKU.
  - The general turnaround claim for all SKUs is "days, not weeks" — never "hours."
  - Do NOT invent or quote specific McKinsey, Causaly, or AlphaSense prices unless citing them verbatim from the ground-truth docs. The only permitted McKinsey comparison is: "McKinsey runs 2–6 weeks at $150K–$750K" (sourced from REVENUE_PLAYBOOK.md §0 hero positioning). Do NOT add competitor numbers beyond this single permitted comparison.
  - Do NOT say "a fraction of McKinsey's price" without the specific grounded claim. The grounded claim is: "a fifth of the time at a tenth of the price" (REVENUE_PLAYBOOK.md §0 hero positioning, point 2).
  - Do NOT claim the Speed SLA is "refund-backed" — only the Citation-Audit SLA is described as refund-backed in the source docs. Keep those two SLA claims separate and never conflate them.
  - The Conference Synthesis Brief 24–48 hour turnaround is a specific SKU claim from OFFERINGS.md — it applies only to that SKU and must not be generalized.
  - Do NOT generalize any single-SKU speed claim to the full offering.

When in doubt, say less and be more specific. Technical precision is the brand voice.

---

GOOGLE FONTS (the only permitted external dependency)

Place exactly these two tags in `<head>`, in this order:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
```

---

DESIGN SYSTEM — EXACT VALUES, NO DEVIATION

Declare these as CSS custom properties in `:root`:

```css
:root {
  --color-bg-base:        #0a0a0f;
  --color-surface-raised: #12121a;
  --color-border-subtle:  #1e1e2a;
  --color-text-primary:   #e8e8ec;
  --color-text-muted:     #8888a0;
  --color-accent-primary: #4a90d9;
  --color-accent-hover:   #5da0e9;
  --color-error:          #c0392b;
  --font-body:            "IBM Plex Sans", "Inter", "Helvetica Neue", Arial, sans-serif;
  --font-data:            "IBM Plex Mono", "JetBrains Mono", "SF Mono", "Fira Code", "Consolas", monospace;
}
```

Layout and aesthetic rules — no exceptions:

- Global reset: `* { box-sizing: border-box; margin: 0; padding: 0; }` Body: background `var(--color-bg-base)`, color `var(--color-text-primary)`, font-family `var(--font-body)`, font-size 15px, line-height 1.6.
- **No `border-radius` anywhere in the stylesheet.** Not on inputs, not on buttons, not on panels, not on tables, not on cards, not on selects.
- **No `box-shadow` anywhere.**
- **No gradients anywhere.** No `linear-gradient`, no `radial-gradient`.
- Cards/panels: `background: var(--color-surface-raised); border: 1px solid var(--color-border-subtle); padding: 28px;`
- Section labels: `font-family: var(--font-data); font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: var(--color-text-muted);`
- Data values (prices, grades, NCT-style identifiers, gate codes, template IDs): `font-family: var(--font-data); color: var(--color-accent-primary);`
- Body text: `font-family: var(--font-body); font-size: 15px; color: var(--color-text-primary);`
- Muted annotation text: `font-size: 12px; color: var(--color-text-muted); font-family: var(--font-data);`
- Max container width: 1080px, `margin: 0 auto`, `padding: 0 24px`.
- Two-column layout using CSS Grid: `grid-template-columns: 58fr 40fr; gap: 40px`. At `max-width: 899px`: `grid-template-columns: 1fr` (single column, right-column panels stack below the form section they reinforce).
- All `<input>`, `<textarea>`, `<select>`: `background: var(--color-bg-base); border: 1px solid var(--color-border-subtle); color: var(--color-text-primary); font-family: var(--font-body); font-size: 14px; padding: 10px 12px; width: 100%; display: block;` — no border-radius. On focus: `border-color: var(--color-accent-primary); outline: none;`
- Field error state: `border-color: var(--color-error);` with a `<span class="field-error">` immediately below: `font-size: 11px; color: var(--color-error); font-family: var(--font-data); display: block; margin-top: 4px;`
- Field labels: `display: block; font-family: var(--font-data); font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--color-text-muted); margin-bottom: 6px; margin-top: 18px;`
- Submit/CTA button: `background: var(--color-accent-primary); color: #0a0a0f; font-family: var(--font-data); font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; border: none; padding: 14px 28px; cursor: pointer; width: 100%;` — no border-radius. Hover: `background: var(--color-accent-hover);`
- `<select>` elements: same styling as inputs; use `appearance: none; -webkit-appearance: none;` and position a `▾` character as a pseudo-element or an absolutely positioned span inside a wrapper div.
- Grade-band table: `width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 12px;` Cells: `padding: 6px 8px; border: 1px solid var(--color-border-subtle);` Header row: `background: var(--color-bg-base); font-family: var(--font-data); font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--color-text-muted);` Grade column: `font-family: var(--font-data); color: var(--color-accent-primary);` No border-radius on any table element.
- Inline code references (gate codes, file names, identifiers): `<code>` styled as `font-family: var(--font-data); font-size: 12px; color: var(--color-accent-primary); background: var(--color-bg-base); padding: 1px 4px;`
- Bullet lines in highlight panels: use `·` (middle dot U+00B7) as the bullet character, not `•` or `–`.
- Capability highlight panels (right column): `background: var(--color-surface-raised); border: 1px solid var(--color-border-subtle); padding: 24px; margin-bottom: 20px;` No border-radius. Panel title: `font-family: var(--font-data); font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: var(--color-text-muted); margin-bottom: 14px; border-left: 3px solid var(--color-accent-primary); padding-left: 10px;`
- `select` wrapper: position relative, so the `▾` arrow can be positioned absolutely at right: 12px, center-vertical, color `var(--color-text-muted)`, pointer-events none.

---

PAGE STRUCTURE

```
<html>
  <head>
    <!-- meta charset, viewport, title -->
    <!-- Google Fonts link tags -->
    <style><!-- ALL CSS --></style>
  </head>
  <body>
    <!-- HEADER (full-width) -->
    <!-- DOUBLE RULE (accent bar) -->
    <!-- PAGE TITLE BLOCK with THREE-PILLAR HERO STRIP (inside container) -->
    <!-- TWO-COLUMN GRID (inside container): left = form, right = highlights -->
    <!-- FOOTER (full-width) -->
    <script><!-- ALL JS --></script>
  </body>
</html>
```

---

HEADER

Full-width bar: `background: var(--color-surface-raised); border-bottom: 1px solid var(--color-border-subtle); padding: 20px 24px;` Use a flex container between left group and right contact.

Left group:
- Wordmark: `Trevor Robey, INC.` — `font-family: var(--font-body); font-weight: 600; font-size: 18px; color: var(--color-text-primary);`
- Immediately after (same line, with em-space separator): `— Intelligence Network Citations` — `font-family: var(--font-data); font-size: 13px; color: var(--color-text-muted);`

Right group:
- `trevor@trevorobeyinc.com` — `font-family: var(--font-data); font-size: 13px; color: var(--color-accent-primary);` as a `mailto:trevor@trevorobeyinc.com` anchor.

Below the header, immediately, two stacked full-width rules:
```html
<div style="border-top: 2px solid #4a90d9;"></div>
<div style="border-top: 1px solid #1e1e2a;"></div>
```

---

PAGE TITLE BLOCK (inside 1080px container, padding-top 32px, padding-bottom 24px)

This block replaces any single-headline approach with a THREE-PILLAR HERO STRIP that gives co-equal visual weight to all three brand pillars. Render it in this exact order:

```
[section label: CLIENT INTAKE — font-data 11px uppercase muted, margin-bottom 16px]

[THREE-PILLAR STRIP — a CSS Grid with three equal columns, gap 0, border 1px solid var(--color-border-subtle), margin-bottom 24px]
```

The three-pillar strip is a full-width grid container: `display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0; border: 1px solid var(--color-border-subtle);` Each pillar cell: `padding: 20px 24px; border-right: 1px solid var(--color-border-subtle);` (last child: no right border). On `max-width: 899px`, collapse to `grid-template-columns: 1fr` with each cell having a `border-bottom: 1px solid var(--color-border-subtle)` instead (last child: no bottom border).

**Pillar 1 — VERIFIABLE**
- Pillar label: `VERIFIABLE` — font-data 11px uppercase letter-spacing 2px color text-muted, margin-bottom 8px
- Pillar heading: `Every claim, sourced.` — font-body 17px font-weight 600 color text-primary, margin-bottom 6px
- Proof line: `Citation gate hard-fails on ungrounded identifiers — not a warning flag.` — font-data 12px color text-muted, line-height 1.5

**Pillar 2 — FAST & AFFORDABLE**
- Pillar label: `FAST & AFFORDABLE` — font-data 11px uppercase letter-spacing 2px color text-muted, margin-bottom 8px
- Pillar heading: `In days, not weeks.` — font-body 17px font-weight 600 color text-primary, margin-bottom 6px
- Proof line: `Investor Pre-Mortem: written 5–10 business day SLA. A fifth of McKinsey's time at a tenth of the price.` — font-data 12px color text-muted, line-height 1.5

**Pillar 3 — EVERY RISK NAMED**
- Pillar label: `EVERY RISK NAMED` — font-data 11px uppercase letter-spacing 2px color text-muted, margin-bottom 8px
- Pillar heading: `Every risk, named.` — font-body 17px font-weight 600 color text-primary, margin-bottom 6px
- Proof line: `NCT-traced graveyard memo — prior failures in the indication, sponsor stop reasons never invented.` — font-data 12px color text-muted, line-height 1.5

Below the three-pillar strip:

```
[tagline: "Every claim, sourced. Every risk, named. In days, not weeks."
  — font-data 15px color accent-primary, margin-bottom 12px]
[one-sentence framing: "Select the type of analysis you need — the form will show only the relevant entity fields and the corresponding capability evidence panel."
  — font-body 13px color text-muted]
```

---

FORM SECTIONS — LEFT COLUMN

Render as a single `<form id="intake-form">` with no `action` attribute and no `method` attribute. All submission is via JavaScript.

---

SECTION A — QUESTION TYPE

Section header: `// 01 — WHAT DO YOU NEED?` in 11px font-data uppercase muted, with a `1px solid var(--color-border-subtle)` bottom border, padding-bottom 8px, margin-bottom 16px.

Render six styled radio cards in a vertical stack. Each card is a `<label>` element wrapping a visually hidden `<input type="radio" name="question_type">` and the card body. Card styling: `border: 1px solid var(--color-border-subtle); background: var(--color-bg-base); padding: 16px 20px; cursor: pointer; display: block; margin-bottom: 8px;` No border-radius. When the radio inside is `:checked`, the parent label gets: `border-color: var(--color-accent-primary); background: #13131e;`

Each card body contains three lines:
1. Client-facing label — `font-family: var(--font-body); font-size: 15px; font-weight: 600; color: var(--color-text-primary);`
2. SKU name · price — `font-family: var(--font-data); font-size: 12px; color: var(--color-accent-primary); margin-top: 4px;`
3. One-sentence description (no marketing adjectives) — `font-family: var(--font-body); font-size: 12px; color: var(--color-text-muted); margin-top: 4px;`

Radio card definitions (use these exact strings — do not rephrase any of them):

```
value="drug-discovery-full"
  Label:  De-risk a specific asset
  SKU:    Investor Pre-Mortem · $9,950 / $14,950 / $19,950
  Desc:   Per-asset risk dossier: trial design, comparable failures, IP runway. Every claim PMID/NCT/ChEMBL-traced.

value="clinical-trial-landscape"
  Label:  Why did programs fail in this space?
  SKU:    Failed Trial Archaeology · $14,950
  Desc:   Structured post-mortem of Phase 2/3 terminations in a mechanism or indication. NCT-indexed failure pattern matrix with sponsor stop reasons.

value="pharmacovigilance-report"
  Label:  Safety signal or adverse event review
  SKU:    Pharmacovigilance Pack · $2,500–$4,950
  Desc:   FAERS, DailyMed, RxNorm scan at runtime. Reproducibility manifest included; every signal entry carries a source identifier.

value="target-validation-pack"
  Label:  Validate or score a target
  SKU:    Cross-Silo Connector Report · $9,950–$24,950
  Desc:   OpenTargets, UniProt, HPA, InterPro — four orthogonal evidence streams. PPI network mapping included.

value="rare-disease-brief"
  Label:  Rare disease landscape
  SKU:    Rare Disease Brief / Plain-Language Patient Brief · $2,500+
  Desc:   Orphan drug pipeline, genetic basis, OMIM/OrphaNet intelligence. Plain-language patient brief at 8th-grade health-literacy level available.

value="general-research-pack"
  Label:  General biomedical research question
  SKU:    General Research Pack · Quoted on request
  Desc:   Topic not fitting the above categories — scope and pricing discussed directly.
```

Below the radio cards, a dynamic SKU summary line updated by JS: `Selected: {sku} — {price}` in `font-family: var(--font-data); font-size: 12px; color: var(--color-accent-primary);` Hidden until a selection is made.

Inline error anchor for Section A: a `<span id="error-question-type">` in 11px error color font-data, hidden by default.

---

SECTION B — ENTITY FIELDS

Section header: `// 02 — BIOMEDICAL ENTITY` (same style as Section A header).

All entity field groups are in the DOM at all times but toggled via `display: none` / `display: block` by JavaScript based on the selected radio value. Each group is a `<div class="field-group">` with a `data-for` attribute matching the radio value it belongs to.

When no question type is selected, all groups are hidden and a muted placeholder line is shown: `Select an engagement type above to see the relevant entity fields.` — 13px, color `var(--color-text-muted)`, font-family `var(--font-data)`.

Field group definitions (field label | input name | placeholder | optional note shown below input in 12px muted font-data):

**Group: data-for="drug-discovery-full"**
- `COMPOUND / ASSET NAME` | `compound_name` | `e.g. Sotorasib, BMS-986325, MRTX849` | Note: `Used to query ChEMBL, PubMed, and ClinicalTrials.gov at runtime`
- `INDICATION / TARGET DISEASE` | `indication` | `e.g. KRAS G12C NSCLC, HER2+ breast cancer` | Note: `Scopes the trial landscape and comparable failure set`

**Group: data-for="clinical-trial-landscape"**
- `THERAPEUTIC AREA` | `therapeutic_area` | `e.g. oncology – KRAS, metabolic disease` | Note: `Scopes the failed-trial corpus in ClinicalTrials.gov`
- `CLINICAL TRIAL PHASE (OPTIONAL)` | `phase_filter` | `e.g. Phase 3, Phase 2/3` | Note: `Limits ClinicalTrials.gov stop-reason query to this phase`

**Group: data-for="pharmacovigilance-report"**
- `DRUG CLASS OR COMPOUND` | `drug_class` | `e.g. NSAID, PD-1 inhibitor, GLP-1 agonist` | Note: `Used to scope FAERS and DailyMed safety queries`

**Group: data-for="target-validation-pack"**
- `TARGET GENE / PROTEIN` | `target_gene` | `e.g. KRAS, EGFR, BRCA1` | Note: `Queried across OpenTargets, UniProt, HPA, and InterPro`
- `DISEASE CONTEXT (OPTIONAL)` | `disease_context` | `e.g. pancreatic adenocarcinoma` | Note: `Narrows OpenTargets genetic association filter`

**Group: data-for="rare-disease-brief"**
- `RARE DISEASE NAME OR OMIM ID` | `disease_name` | `e.g. Friedreich's Ataxia, OMIM:229300` | Note: `Queried against OMIM, OrphaNet, and ClinicalTrials.gov`
- `FOCUS AREA (OPTIONAL)` | `focus_area` | `e.g. orphan drug pipeline, genetic basis` | Note: `Focuses synthesis scope`

**Group: data-for="general-research-pack"**
- `RESEARCH TOPIC OR QUESTION` | `topic` | `Free-form question or topic` | Note: (none)

Inline error anchor for Section B: a `<span id="error-entity">` in 11px error color font-data, hidden by default, shown below the section header when the required entity field is empty on submit.

---

SECTION C — SCOPE AND LOGISTICS

Section header: `// 03 — SCOPE` (same style). Always visible.

- `DESIRED TURNAROUND` | `<select name="turnaround">`:
  - `""` — `Select...` (disabled placeholder)
  - `"standard"` — `Standard (5–10 business days)`
  - `"expedited"` — `Expedited (discuss timeline)`
  - `"flexible"` — `Flexible / no deadline`
  Wrap in a `<div class="select-wrapper">` with the `▾` indicator.

- `ADDITIONAL CONTEXT OR CONSTRAINTS` | `<textarea name="notes" rows="4">` | Placeholder: `Prior work, specific concerns, internal deal code, target filing date...`

---

SECTION D — CONTACT

Section header: `// 04 — CONTACT` (same style). Always visible.

Fields in order:
- `FULL NAME` | `contact_name` | `type="text"` | Required
- `ORGANIZATION` | `contact_org` | `type="text"` | Required
- `EMAIL` | `contact_email` | `type="email"` | Required
- `ROLE / TITLE (OPTIONAL)` | `contact_role` | `type="text"` | Optional; label note: `Helps route to the right SKU tier`

Each required field has a `<span class="field-error">` immediately below it, hidden by default.

---

SUBMIT BLOCK

`<button type="button" id="submit-btn">SEND INTAKE REQUEST</button>` — flat blue, full width, 14px padding, font-data uppercase 13px letter-spacing 1.5px, no border-radius, no border. Hover: `var(--color-accent-hover)`.

Below the button, in a `<p>` with `font-family: var(--font-data); font-size: 11px; color: var(--color-text-muted); margin-top: 10px;`:
`This opens your email client with all fields pre-filled. No data is transmitted to any server.`

On the next line, same style:
`Citation-Audit SLA — refund-backed.`

---

CAPABILITY HIGHLIGHT PANELS — RIGHT COLUMN

On desktop (≥ 900px): a right-side column. The panels are in a `<div class="highlights-col">`. Apply `position: sticky; top: 24px;` to the highlights column on desktop so panels stay in view as the user scrolls the form.

On mobile (< 900px): the highlights column stacks below the form in normal document flow.

All panels share this card style: `background: var(--color-surface-raised); border: 1px solid var(--color-border-subtle); padding: 24px; margin-bottom: 20px;` No border-radius.

Panel title style: `font-family: var(--font-data); font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: var(--color-text-muted); border-left: 3px solid var(--color-accent-primary); padding-left: 10px; margin-bottom: 14px; display: block;`

Panel body: `font-family: var(--font-body); font-size: 13px; color: var(--color-text-primary); line-height: 1.6;`

Bullet lines: use `·` (U+00B7) as the bullet character. Each bullet on its own line, `display: block; padding-left: 12px; margin-bottom: 6px;`

Inline identifiers, gate codes, file names, ratio numbers: wrap in `<code>` styled as `font-family: var(--font-data); font-size: 12px; color: var(--color-accent-primary); background: var(--color-bg-base); padding: 1px 4px;`

**PANEL ORDER IN THE RIGHT COLUMN (top to bottom):**

1. H1 — Grounded-Citation Gate (always visible) — Pillar 1: Verifiability
2. H_SPEED — Speed and Cost (always visible) — Pillar 2: Speed and cost vs. incumbents
3. H2 — Citation-Integrity Grade (conditional: drug-discovery-full OR clinical-trial-landscape)
4. H3 — Graveyard Memo (conditional: clinical-trial-landscape only)
5. H4 — Safety Signals (conditional: pharmacovigilance-report only)
6. H5 — Four Orthogonal Evidence Streams (conditional: target-validation-pack only)
7. H6 — What You Receive (always visible)

H1, H_SPEED, and H6 are always visible (never hidden by JS). H_SPEED sits between H1 and the conditional panels, giving Pillar 2 co-equal prominence via position and always-on visibility.

---

**H1 — Always visible**

Panel title: `GROUNDED-CITATION GATE — WHAT SHIPS AND WHAT DOESN'T`

Body (exact copy — do not rewrite or paraphrase):

First paragraph: `Every cited identifier (PMID, NCT, ChEMBL CID, DOI) is cross-checked against the union of identifiers actually returned by live database tool calls during the same run — not model memory. If the grounded-citation ratio falls below the configured threshold, the report hard-fails` `<code>PHASE30_CITATION_UNVERIFIED</code>` `and does not ship.`

Second paragraph: `Cited DOIs are screened against Crossref's retraction record before delivery. A report citing any confirmed retracted paper hard-stops` `<code>PHASE30_CITATION_RETRACTED</code>`. `The screen is fail-soft: a Crossref network error yields` `<code>checked:false</code>` `and does not wrongly block a passing report.`

Note line (12px muted font-data, MANDATORY — do not omit): `Retraction screening applies to cited DOIs only — PMIDs and NCTs are not routed through Crossref.`

At the bottom of H1, separated by a 1px border-subtle top rule with 14px padding-top, the tagline in font-data 14px accent-primary:
`Every claim, sourced. Every risk, named. In days, not weeks.`

---

**H_SPEED — Always visible (Pillar 2: Speed and Cost)**

Panel title: `SPEED & COST — WHAT THE NUMBERS ACTUALLY SAY`

Body (exact copy — do not rewrite or paraphrase):

Bullet lines:
`· Investor Pre-Mortem: written 5–10 business day Speed SLA — $9,950 / $14,950 / $19,950`
`· Conference Synthesis Brief: 24–48 hours (500+ ASCO/ESMO/AACR abstracts synthesized) — $4,950`
`· Failed Trial Archaeology: days, not weeks — $14,950`
`· Pharmacovigilance Pack — $2,500–$4,950`
`· Cross-Silo Connector Report — $9,950–$24,950`
`· Other SKUs: timeline confirmed at intake; no written Speed SLA outside Investor Pre-Mortem`

Separator line below the bullets (1px border-subtle top rule, 14px padding-top, 14px padding-bottom):

McKinsey comparison (exact copy — verbatim from REVENUE_PLAYBOOK.md §0; do not modify or extend):
`McKinsey runs 2–6 weeks at $150K–$750K. We run a fifth of the time at a tenth of the price.`
Style: `font-family: var(--font-data); font-size: 12px; color: var(--color-accent-primary);`

Qualifier note immediately below (12px muted font-data, MANDATORY — do not omit):
`The 5–10 business day Speed SLA applies to Investor Pre-Mortem deliveries only. Conference Synthesis Brief 24–48 hr claim is SKU-specific (OFFERINGS.md). The McKinsey comparison is sourced from the internal revenue playbook — not independently verified. Timelines for other SKUs are confirmed at intake.`

---

**H2 — Visible when question_type is `drug-discovery-full` OR `clinical-trial-landscape`; hidden otherwise (display: none by default, toggled by JS)**

Panel title: `CITATION-INTEGRITY GRADE — SHIPPED WITH EVERY REPORT`

Body:

Bullet lines:
`· Every bundle includes a` `<code>citation-integrity.md</code>` `provenance ledger — a deterministic (no LLM) grade computed from the grounding gate's output`
`· Grade` `<code>F / BLOCKED</code>` `if any cited DOI is confirmed retracted via Crossref;` `<code>N/A</code>` `if nothing is cited`
`· The ledger lists every unverified identifier annotated inline — reviewable by your legal or compliance team`

Grade-band table (sharp borders, no border-radius, header in muted monospace 10px uppercase). The grade boundaries in this table must match the live code in `integrity-rating.js` exactly:

| Grade | Grounded ratio | Meaning |
|---|---|---|
| A | ≥ 90% | All major claims traceable to retrieved records |
| B | 75–89% | Solid provenance; minor unverified cites annotated |
| C | 50–74% | Acceptable; unverified cites flagged `[UNVERIFIED]` |
| D | < 50% | Many citations not grounded in fetched evidence |
| F / BLOCKED | any retraction | Retracted DOI cited — delivery blocked |

Grade column cells: `font-family: var(--font-data); color: var(--color-accent-primary);`

Note on grade D: the D row intentionally shows `< 50%` (not "34–49%") because the grading code has no 34% lower bound — D is the else branch for anything below 0.5. The configured workflow gate (default minimum 0.34, set in workflow-engine.js) may block before the report reaches a D grade, but that threshold is configurable and is not encoded into the grading logic itself.

Below the table, a qualifier note in 11px muted font-data (MANDATORY — do not omit):
`The grounded-citation ratio measures citations found in the runtime-fetched evidence set — not independent re-resolution against each live external database. The threshold is a delivery floor, not a quality target.`

---

**H3 — Visible only when question_type is `clinical-trial-landscape`; hidden otherwise**

Panel title: `GRAVEYARD MEMO — EVERY PRIOR FAILURE, TRACED`

Body bullet lines (exact copy):
`· Every Failed Trial Archaeology bundle ships a` `<code>graveyard-memo.md</code>`: `a structured memo of terminated, withdrawn, and suspended programs in the indication, fetched from ClinicalTrials.gov API v2 at run time`
`· Each entry includes the sponsor's stated stop reason — or an explicit "(none stated by sponsor)" when ClinicalTrials.gov has no text; stop reasons are never invented`
`· Protocol amendment-risk band (LOW / MODERATE / HIGH) derived from ClinicalTrials.gov change-history version counts across comparable stopped programs — a historical signal, not a forecast`
`· Every NCT resolves to a live` `<code>clinicaltrials.gov/study/NCT...</code>` `link`
`· Rendered deterministically from live CT.gov records — no LLM narration of stop reasons`

---

**H4 — Visible only when question_type is `pharmacovigilance-report`; hidden otherwise**

Panel title: `SAFETY SIGNALS FROM LIVE DATABASES — NOT MODEL RECALL`

Body bullet lines (exact copy):
`· The pharmacovigilance workflow queries FAERS, DailyMed, RxNorm, and DrugSafetyAnalyzer at runtime via ToolUniverse (~2,116 biomedical tools, Harvard MIMS, Apache-2.0)`
`· Adverse event signals are sourced from the databases actually queried at runtime — not interpolated from training data`
`· A Reproducibility Manifest ships with every bundle: each cited identifier stamped VERIFIED / UNRESOLVED / UNCHECKED with its HTTP status and resolved URL`

Qualifier note (11px muted font-data, MANDATORY — do not omit):
`The Reproducibility Manifest confirms identifier resolution — not the scientific correctness of the underlying evidence.`

---

**H5 — Visible only when question_type is `target-validation-pack`; hidden otherwise**

Panel title: `FOUR ORTHOGONAL EVIDENCE STREAMS — OPENTARGETS, UNIPROT, HPA, INTERPRO`

Body bullet lines (exact copy):
`· Target validation queries four independent databases in parallel: Open Targets (genetic association), UniProt (protein function + disease annotation), Human Protein Atlas (tissue/cell expression), InterPro (domain/family classification)`
`· Confidence threshold for association inclusion:` `<code>0.7</code>` `— higher than clinical-trial or pharmacovigilance workflows`
`· PPI network mapping via ToolUniverse molecular interaction tools`
`· Identifiers introduced by OSS triage models that are not present in the runtime-fetched evidence are still caught as ungrounded by the citation gate`

---

**H6 — Always visible, positioned at the bottom of the right column alongside Section D**

Panel title: `WHAT YOU RECEIVE — SEALED, AUDITABLE BUNDLE`

Body bullet lines:
`· Full research report with inline` `<code>[UNVERIFIED]</code>` `annotations on any citation not grounded in runtime-fetched records`
`·` `<code>citation-integrity.md</code>` `— A–F graded provenance ledger`
`·` `<code>graveyard-memo.md</code>` `— NCT-traced failure archaeology (indication-scoped reports)`
`·` `<code>reproducibility-manifest.json</code>` `— per-identifier resolution record with HTTP status and resolved URL`
`·` `<code>checksums.txt</code>` `+` `<code>manifest.json</code>` `— SHA-256 seals on all deliverable files`
`· Delivered as a ZIP via secure email; enterprise handoff to Snowflake, AWS Data Exchange, or BigQuery available`
`· Citation-Audit SLA — refund-backed`

---

FOOTER

Full-width strip: `background: var(--color-surface-raised); border-top: 1px solid var(--color-border-subtle); padding: 32px 24px; margin-top: 64px;`

Inside the 1080px container, render the following four blocks, each in its own `<p>` with `font-family: var(--font-body); font-size: 12px; color: var(--color-text-muted); margin-bottom: 10px; line-height: 1.6;`

**Block 1 — Legal disclosure (MANDATORY, verbatim, no paraphrase, no condensing):**
`Trevor Robey, INC. is the wordmark of Trevor Robey Intelligence Network Citations LLC, a California limited liability company (California Secretary of State Entity No. B20260217250). INC = Intelligence Network Citations. Powered by OpenClaw open-source agent framework.`

**Block 2 — Research-only disclaimer (MANDATORY, verbatim from NOTICE.md):**
`Reports are research artifacts produced using AI-assisted research synthesis with human editorial oversight; every cited identifier is a real public identifier you can verify in its source database. For research and informational use only — not clinical decision support, and not a basis for prescribing, diagnostic, or regulatory decisions. No PHI is hosted, transmitted, or processed. All data sources queried are public biomedical databases.`

**Block 3 — Manual-only posture (MANDATORY, verbatim from NOTICE.md):**
`External publication, marketplace submission, customer delivery, and authentication actions remain manual-only by architectural design; the system does not act autonomously on external systems.`

**Block 4 — Citation grounding scope qualifier (MANDATORY, verbatim from OFFERINGS.md §Brand Commitments):**
`Citations are grounded in the retrieved source records + DOI retraction-screened via Crossref — they are not independently re-resolved against each live external database.`

Below the four blocks, in the same font but 11px, one line:
`trevor@trevorobeyinc.com · trevorobeyinc.com`

---

JAVASCRIPT — inline `<script>` block before `</body>`, no external libraries, no analytics, no fetch/XHR, no localStorage, no cookies

Implement exactly the following and nothing else:

```js
const QUESTION_TYPE_MAP = {
  "drug-discovery-full": {
    label:    "De-risk a specific asset",
    sku:      "Investor Pre-Mortem",
    price:    "$9,950 / $14,950 / $19,950",
    required: ["compound_name", "indication"],
    optional: [],
  },
  "clinical-trial-landscape": {
    label:    "Why did programs fail in this space?",
    sku:      "Failed Trial Archaeology",
    price:    "$14,950",
    required: ["therapeutic_area"],
    optional: ["phase_filter"],
  },
  "pharmacovigilance-report": {
    label:    "Safety signal or adverse event review",
    sku:      "Pharmacovigilance Pack",
    price:    "$2,500–$4,950",
    required: ["drug_class"],
    optional: [],
  },
  "target-validation-pack": {
    label:    "Validate or score a target",
    sku:      "Cross-Silo Connector Report",
    price:    "$9,950–$24,950",
    required: ["target_gene"],
    optional: ["disease_context"],
  },
  "rare-disease-brief": {
    label:    "Rare disease landscape",
    sku:      "Rare Disease Brief / Plain-Language Patient Brief",
    price:    "$2,500+",
    required: ["disease_name"],
    optional: ["focus_area"],
  },
  "general-research-pack": {
    label:    "General biomedical research question",
    sku:      "General Research Pack",
    price:    "Quoted on request",
    required: ["topic"],
    optional: [],
  },
};

const PANEL_VISIBILITY = {
  "drug-discovery-full":      ["h2"],
  "clinical-trial-landscape": ["h2", "h3"],
  "pharmacovigilance-report": ["h4"],
  "target-validation-pack":   ["h5"],
  "rare-disease-brief":       [],
  "general-research-pack":    [],
};
```

**On DOM load:**
- Hide all `.field-group` divs.
- Show the "Select an engagement type above..." placeholder line.
- Hide H2, H3, H4, H5.
- H1, H_SPEED, and H6 are always visible (do not hide them).
- Hide the dynamic SKU summary line.

**On radio change (any `input[name="question_type"]` change event):**
- Read selected value.
- Show the SKU summary line with: `Selected: {sku} — {price}` using QUESTION_TYPE_MAP.
- Hide all `.field-group` divs; show only those with `data-for` matching the selected value.
- Hide/show the entity placeholder line accordingly.
- Hide H2, H3, H4, H5; then show the panels listed in `PANEL_VISIBILITY[selectedValue]`.
- H_SPEED is never touched by this handler — it is always visible.
- Apply the `:checked` card highlight: remove the `.card-selected` CSS class from all radio labels; add it to the label wrapping the selected radio.
- Clear all field-error states.

**On submit button click:**

Step 1 — Clear all previous error states: remove error borders, empty and hide all `<span class="field-error">` elements, hide Section A and B error spans.

Step 2 — Validate:
- Get selected radio value. If no radio is checked: show `<span id="error-question-type">` with text `Please select an engagement type.`; set a flag `hasError = true`.
- For `contact_name`, `contact_org`, `contact_email`: if empty, add `border-color: var(--color-error)` to the input and show the field's `<span class="field-error">` with text `Required`; `hasError = true`.
- For `contact_email`: if non-empty but does not match `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, show its error span with `Enter a valid email address`; `hasError = true`.
- If a valid question type is selected: check that at least one of `QUESTION_TYPE_MAP[value].required` fields is non-empty. If all are empty, show `<span id="error-entity">` with text `Enter at least one entity field for the selected analysis type`; `hasError = true`.
- Do NOT use `alert()` anywhere.
- If `hasError`: scroll to the first element with an error state and return.

Step 3 — If no errors: construct the mailto and open it.

**Mailto construction:**

Subject: `[Intake] ` + sku + ` — ` + contact_org value

Body (build as a JS template literal; include only non-empty field lines; use `encodeURIComponent` on the whole assembled body string):

```
Trevor Robey, INC. — Client Intake
===================================

QUESTION TYPE
-------------
Client selection: {label}
Engine template:  {question_type_value}
SKU:              {sku}
Price range:      {price}

BIOMEDICAL ENTITIES
-------------------
[one "Label:  value" line per field, only if value is non-empty; skip empty optional fields]
Compound / asset:     {compound_name}
Indication:           {indication}
Therapeutic area:     {therapeutic_area}
Phase filter:         {phase_filter}
Drug class:           {drug_class}
Target gene:          {target_gene}
Disease context:      {disease_context}
Rare disease:         {disease_name}
Focus area:           {focus_area}
Research topic:       {topic}

SCOPE
-----
Desired turnaround:   {turnaround_label}
Additional context:
{notes}

CONTACT
-------
Name:          {contact_name}
Organization:  {contact_org}
Email:         {contact_email}
Role / title:  {contact_role}

---
Trevor Robey, INC. is the wordmark of Trevor Robey Intelligence Network Citations LLC,
a California limited liability company. trevor@trevorobeyinc.com
```

`{turnaround_label}` resolution: `"standard"` → `"Standard (5–10 business days)"`; `"expedited"` → `"Expedited (discuss timeline)"`; `"flexible"` → `"Flexible / no deadline"`; `""` → `"Not specified"`.

Open: `window.location.href = "mailto:trevor@trevorobeyinc.com?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);`

Step 4 — Button state: change button text to `OPENING YOUR EMAIL CLIENT...`; set `pointer-events: none; opacity: 0.6`. After 2000ms, reset label to `SEND INTAKE REQUEST` and restore pointer-events and opacity.

---

MOBILE LAYOUT (< 900px)

CSS media query `@media (max-width: 899px)`:
- Collapse two-column grid to single column.
- Remove `position: sticky` from highlights column.
- Highlights column (`div.highlights-col`) renders below the form column in normal document flow.
- H1, H_SPEED, and H6 remain visible in the highlights column; conditional panels H2–H5 appear between H_SPEED and H6.
- The three-pillar strip collapses to single column with bottom borders between cells instead of right borders.

---

FINAL CHECKLIST — VERIFY BEFORE OUTPUTTING THE HTML

- [ ] Single HTML file; all CSS and JS inline; only the two Google Fonts `<link>` tags as external dependency
- [ ] No border-radius anywhere in the stylesheet
- [ ] No box-shadow anywhere
- [ ] No gradients anywhere
- [ ] Background `#0a0a0f`; cards `#12121a`; borders `#1e1e2a`; accent `#4a90d9`; hover `#5da0e9`
- [ ] IBM Plex Mono / monospace stack used for: section labels, prices, grade letters, gate codes, file names, button labels, panel titles, stat figures
- [ ] Two-column CSS Grid on ≥ 900px; single column on < 900px
- [ ] Highlights column `position: sticky; top: 24px` on desktop
- [ ] Three-pillar hero strip present with exactly three co-equal columns: VERIFIABLE · FAST & AFFORDABLE · EVERY RISK NAMED, each with its pillar label, heading, and proof line
- [ ] Pillar 2 proof line reads: "Investor Pre-Mortem: written 5–10 business day SLA. A fifth of McKinsey's time at a tenth of the price." — not generalized to all SKUs
- [ ] Pillar 3 proof line reads: "NCT-traced graveyard memo — prior failures in the indication, sponsor stop reasons never invented."
- [ ] Six radio cards with correct label / SKU / price / description strings (no rephrasing)
- [ ] Six conditional entity field groups, toggled by JS on radio change
- [ ] H1, H_SPEED, and H6 always visible; H2 shown for drug-discovery-full + clinical-trial-landscape; H3 for clinical-trial-landscape only; H4 for pharmacovigilance-report only; H5 for target-validation-pack only
- [ ] Panel ORDER in right column: H1, H_SPEED, H2 (conditional), H3 (conditional), H4 (conditional), H5 (conditional), H6
- [ ] H_SPEED panel is never touched by the radio-change JS handler — always visible regardless of selection
- [ ] H_SPEED panel title: `SPEED & COST — WHAT THE NUMBERS ACTUALLY SAY`
- [ ] H_SPEED bullet list uses exact grounded turnaround claims: Investor Pre-Mortem 5–10 business days written SLA (not "refund-backed"); Conference Synthesis Brief 24–48 hours; other SKUs: no written SLA claim
- [ ] H_SPEED McKinsey comparison is verbatim: "McKinsey runs 2–6 weeks at $150K–$750K. We run a fifth of the time at a tenth of the price."
- [ ] H_SPEED mandatory qualifier note present: "The 5–10 business day Speed SLA applies to Investor Pre-Mortem deliveries only. Conference Synthesis Brief 24–48 hr claim is SKU-specific (OFFERINGS.md). The McKinsey comparison is sourced from the internal revenue playbook — not independently verified. Timelines for other SKUs are confirmed at intake."
- [ ] H2 grade table present with all five rows; grade boundaries match integrity-rating.js exactly: A ≥ 90%, B 75–89%, C 50–74%, D < 50%, F/BLOCKED any retraction
- [ ] H2 grade D row reads "< 50%" — not "34–49%" (the 34% value is the configurable workflow gate threshold, not a grading boundary)
- [ ] H2 mandatory qualifier note present below grade table
- [ ] H3 graveyard memo bullets present with the "historical signal, not a forecast" qualifier on the amendment-risk band
- [ ] H4 Reproducibility Manifest bullets present with the "confirms identifier resolution — not scientific correctness" qualifier
- [ ] Submit opens `mailto:` only — no fetch, no XHR, no server call
- [ ] Subject: `[Intake] {sku} — {contact_org}`
- [ ] Body includes `Engine template: {question_type_value}` line
- [ ] Validation: required fields highlighted with error border + inline error span text; no `alert()`
- [ ] Submit button: "SEND INTAKE REQUEST" → "OPENING YOUR EMAIL CLIENT..." (2s) → reset
- [ ] Below-button note: "This opens your email client with all fields pre-filled. No data is transmitted to any server."
- [ ] "Citation-Audit SLA — refund-backed." line below submit note
- [ ] All four footer blocks present verbatim
- [ ] "zero hallucinations" does NOT appear anywhere in the output HTML
- [ ] "every citation is verified against its source database" does NOT appear anywhere
- [ ] "fully automated" does NOT appear anywhere
- [ ] "reports in hours" does NOT appear anywhere (the Conference Synthesis Brief 24–48 hr claim is in H_SPEED only, scoped to that SKU explicitly)
- [ ] "amendment-risk band" is qualified as "historical signal, not a forecast" wherever it appears
- [ ] H1 qualifier note present: "Retraction screening applies to cited DOIs only — PMIDs and NCTs are not routed through Crossref."
- [ ] H2 qualifier note present: "The grounded-citation ratio measures citations found in the runtime-fetched evidence set — not independent re-resolution against each live external database. The threshold is a delivery floor, not a quality target."
- [ ] H4 qualifier note present: "The Reproducibility Manifest confirms identifier resolution — not the scientific correctness of the underlying evidence."
- [ ] Tagline appears in the page title block (below the three-pillar strip) and at the bottom of H1 only — not repeated elsewhere
- [ ] No marketing adjectives (revolutionary, cutting-edge, best-in-class, industry-leading, unprecedented, powerful) anywhere in the output
- [ ] The threshold value "0.34" does not appear in any user-visible copy (it is a configurable internal parameter, not a public-facing claim; the prompt says "configured threshold" without specifying the value)
- [ ] Speed SLA never described as "refund-backed" — only the Citation-Audit SLA carries that qualifier; the two must never be conflated
- [ ] No competitor prices invented beyond the single grounded McKinsey comparison ("2–6 weeks at $150K–$750K")
- [ ] "a fifth of the time at a tenth of the price" is the only permitted McKinsey ratio comparison — not paraphrased or rounded
