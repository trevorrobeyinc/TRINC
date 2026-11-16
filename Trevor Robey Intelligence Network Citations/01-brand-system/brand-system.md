# Trevor Robey Inc — Brand System

**Last updated:** 2026-04-26
**Live site:** https://trevorobeyinc.com
**Figma source of truth:** https://www.figma.com/design/cAlmeot0lXqqcIDecpQjdO ("Trevor Robey Inc — Brand System", `trevorobeyinc-team` education-Pro)
**Cloudflare Worker:** `shy-grass-fccd` (account `f3b10bacc7e94c72e445b078433aa1d4`)
**Source HTML:** `/Users/trevorrobey/trevor-robey-inc-agents/workspace/collateral/landing-page/index.html`

## Brand voice

Technical · citation-dense · zero marketing hyperbole. Every claim maps to a verifiable identifier. Lead with verifiability, not AI.

Audience: senior pharma CI directors, biotech-fund quants, target-discovery scientists, boutique consultancies. They live in Bloomberg / Reuters / Eikon / Cortellis terminals — the brand mirrors that visual language.

## Color tokens

CSS custom properties (live at `:root` in the source HTML). Same values are formalized as Figma Variables in the Brand Tokens collection.

| Token | Hex | Role |
|---|---|---|
| `--color-bg-base` | `#0a0a0f` | Page background |
| `--color-surface-raised` | `#12121a` | Cards, panels |
| `--color-border-subtle` | `#1e1e2a` | Dividers, hairlines |
| `--color-text-primary` | `#e8e8ec` | Body text, primary content |
| `--color-text-muted` | `#8888a0` | Captions, secondary metadata |
| `--color-accent-primary` | `#4a90d9` | Links, CTAs, key data highlights |
| `--color-accent-hover` | `#5da0e9` | Hover state on accent surfaces |

Backwards-compat aliases (`--bg`, `--card`, `--text`, `--accent`, etc.) point at the formalized tokens so existing CSS keeps working.

## Typography

**IBM Plex Sans** + **IBM Plex Mono** — both SIL Open Font License (free for commercial use). Loaded via Google Fonts CDN with `font-display: swap`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
```

Fallback stack:
- `--font-body`: `"IBM Plex Sans", "Inter", "Helvetica Neue", "Arial", sans-serif`
- `--font-data`: `"IBM Plex Mono", "JetBrains Mono", "SF Mono", "Fira Code", "Consolas", monospace`

Type scale (Figma Typography page):

| Token | Family | Style | Size / line | Letter-spacing | Use |
|---|---|---|---|---|---|
| `display` | Plex Sans | Bold | 48 / 56 | -0.96px | Hero |
| `heading-1` | Plex Sans | SemiBold | 32 / 40 | -0.32px | Section titles |
| `heading-2` | Plex Sans | SemiBold | 24 / 32 | -0.12px | Subsection |
| `heading-3` | Plex Sans | Medium | 20 / 28 | 0 | Card titles |
| `body-large` | Plex Sans | Regular | 18 / 28 | 0 | Lead paragraphs |
| `body` | Plex Sans | Regular | 16 / 24 | 0 | Body |
| `body-small` | Plex Sans | Regular | 14 / 20 | 0 | Captions, fine print |
| `caption` | Plex Sans | Medium | 12 / 16 | +0.18px | Labels, all-caps |
| `data-mono` | Plex Mono | Regular | 14 / 20 | 0 | Citation IDs (PMID, NCT, RxCUI) |
| `code-mono` | Plex Mono | Regular | 13 / 18 | 0 | Code, source lists |

## Logo

### TR monogram

Geometric, sharp 90° corners, single-color, monospace-style stem widths (vertical = horizontal stroke). Reads as a ticker symbol — pharma analysts process two-letter monograms at a glance.

**Inline SVG (canonical, 140 × 64 viewBox)**:

```html
<svg viewBox="0 0 140 64" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <!-- T -->
  <rect x="0" y="0" width="64" height="12"/>
  <rect x="26" y="12" width="12" height="52"/>
  <!-- R -->
  <rect x="76" y="0" width="12" height="64"/>
  <rect x="88" y="0" width="40" height="12"/>
  <rect x="116" y="12" width="12" height="24"/>
  <rect x="88" y="24" width="40" height="12"/>
  <polygon points="104,36 116,36 128,64 116,64"/>
</svg>
```

Renders cleanly at 16/32/48/64/128/256/1024 px. `fill="currentColor"` lets parents control color via CSS `color`.

### Variants (Figma Logo page)

1. **Primary** — white on dark (default for trevorobeyinc.com hero, dark surfaces)
2. **Inverted** — dark on white (marketplace listings: Datarade, AWS, HuggingFace)
3. **Wordmark** — TR mark + "TREVOR ROBEY INC" beneath in IBM Plex Sans Bold, letter-spacing 0.24em
4. **Accent underline** — wordmark variant with a 2px `--color-accent-primary` data bar between mark and wordmark
5. **Scale ladder** — verified renderings at 16, 32, 48, 64, 128 px

### Favicon

Inline SVG `<link rel="icon" type="image/svg+xml">` data URL — geometric TR in `#4a90d9` on `#0a0a0f` square. Source in the production HTML head.

## Logo usage rules

- **Don't** rotate, skew, distort, or recolor outside the token palette.
- **Don't** apply gradients, drop shadows, or rounded corners.
- **Do** use `currentColor` so the SVG inherits parent text color cleanly.
- **Do** preserve a clear-space margin equal to the height of the "T" top bar (12 units in the 140×64 viewBox = ~8.5% of mark height).
- For marketplace listings that require a square logo: pad the 140×64 mark in a square frame with `--color-bg-base` background and 24-unit margin on top/bottom.

## Spacing scale

`4 / 8 / 12 / 16 / 24 / 32 / 48 / 64` (px). Sharp aesthetic — radii kept to 0–2 px max except favicon corner cap.

## Deploy recipe

Source-of-truth is the HTML at `/Users/trevorrobey/trevor-robey-inc-agents/workspace/collateral/landing-page/index.html`. Re-deploy:

```
SRC=/Users/trevorrobey/trevor-robey-inc-agents/workspace/collateral/landing-page/index.html
DST=/Users/trevorrobey/openclaw-landing-deploy/index.html
cp "$SRC" "$DST"
```

Then either:
- **Dashboard upload**: https://dash.cloudflare.com/f3b10bacc7e94c72e445b078433aa1d4/workers/services/view/shy-grass-fccd/production → New deployment → drag the `openclaw-landing-deploy` folder → Deploy
- **Wrangler CLI**: `wrangler deploy --name shy-grass-fccd` (after `wrangler login`)

Cache propagates in ~30s. Verify with:

```
curl -sSI https://trevorobeyinc.com
curl -sS https://trevorobeyinc.com | grep -c -i drugbank   # must be 0
curl -sS https://trevorobeyinc.com | grep -c "IBM+Plex"     # must be 1
```

## Where to use this brand system

- **Datarade vendor profile**: use the inverted (dark-on-white) wordmark variant for the company logo upload; link the storefront "About" link to https://trevorobeyinc.com.
- **AWS Data Exchange seller profile**: same — inverted wordmark, https://trevorobeyinc.com canonical URL.
- **HuggingFace org page**: avatar = inverted square favicon; banner = primary wordmark variant on dark.
- **LinkedIn banner / company page**: primary wordmark with accent underline, 1584×396 banner sized.
- **Email signature**: primary monogram (height 32px) + wordmark + trevor@trevorobeyinc.com + https://trevorobeyinc.com.
- **Cold email + 2-page sample teaser**: header uses the wordmark with accent underline.
- **Datarade / marketplace listing PDF deliverable**: cover page primary wordmark, citation tables in `data-mono` token.

## Personal brand (founder voice)

Trevor's **personal / founder brand** — distinct from the company tagline, and it does **not**
replace it. Full detail: [`personal-brand.md`](./personal-brand.md).

**Lockup:**

> **Truth Seeker, Receipt Keeper.**
> *Real data beats sweet hallucination. You decide.*

- Handle (line 1): who he is — the "receipts" are the citations/evidence.
- Tagline (line 2), or on its own: **Real data beats sweet hallucination. You decide.**

**Company vs. founder (do not mix):**
- **Company voice** keeps the business tagline — *"Every citation, checked. Every risk, named. In days, not weeks."* — in the landing-page hero, marketplace listings, OFFERINGS / README / product-catalog, and legal docs.
- **Founder voice** uses the personal brand — in the personal email signature, LinkedIn personal profile, "about the founder" blurbs, a founder's-note / author byline on deliverables, and personal outbound sign-offs.

**Personal email signature (founder voice):**

```
Trevor Robey
Founder, Trevor Robey, INC. (Intelligence Network Citations)
Truth Seeker, Receipt Keeper. — Real data beats sweet hallucination. You decide.
trevor@trevorobeyinc.com · https://trevorobeyinc.com
```

## Open items

- IBM Plex isn't installed locally on the user's macOS — Figma file falls back to Inter for previews, but the production site loads Plex correctly via Google Fonts CDN. To match Figma to the live site, install IBM Plex Sans + IBM Plex Mono from https://www.ibm.com/plex/ and reload the Figma file.
- Components page in the Figma file is a placeholder; populate when the next round of designs needs reusable components (button, card, citation chip, etc.).
