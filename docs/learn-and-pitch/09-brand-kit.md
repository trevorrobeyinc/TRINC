# 09 — Brand kit

## Words

| Element | Use exactly |
|---|---|
| Wordmark | **Trevor Robey, INC.** |
| Expansion | INC = Intelligence Network Citations |
| Disclosure (on any customer-facing piece with the wordmark) | *Trevor Robey, INC. is the wordmark of Trevor Robey Intelligence Network Citations LLC, a California limited liability company.* |
| Tagline (company voice) | *Every claim, sourced. Every risk, named. In days, not weeks.* |
| Elevator (company voice) | *Citation-traced biomedical due diligence for biotech investors and pharma BD. Five days. Every citation grounded and retraction-screened. Audit trail included.* |
| Engine credit | *Powered by OpenClaw (open-source agent framework).* |
| Contact | trevor@trevorobeyinc.com · https://trevorobeyinc.com |

[src: `ENGINE/OFFERINGS.md` lines 3–7; `HOW-IT-WORKS.md` header; `ENGINE/CLAUDE.md` → Brand Identity]

## Voice

**Technical · citation-dense · zero marketing hyperbole. Lead with verifiability, not AI.** The audience lives
in Bloomberg, Reuters, Eikon and Cortellis terminals; the brand mirrors that visual language. Every claim maps
to a verifiable identifier. [src: `ENGINE/01-brand-system/brand-system.md` → Brand voice]

### Company voice vs founder voice (never mix them)

| Voice | Line | Where |
|---|---|---|
| **Company** (Trevor Robey, INC. speaking) | *Every claim, sourced. Every risk, named. In days, not weeks.* | Pitches, listings, the website, offer sheets |
| **Founder** (Trevor the person speaking) | *Truth Seeker, Receipt Keeper. — Real data beats sweet hallucination. You decide.* | An "about the founder" slide, a founder's note, his LinkedIn and email signature |

[src: `ENGINE/01-brand-system/personal-brand.md` → "Company vs. founder"]

Pitches speak in company voice. A single "about the founder" slide may use the founder lockup. Use the
**primary lockup only**: the personal-brand file also lists alternates containing "No hallucinations", and
those clash with the company's 2026-07-13 decision to retire that claim, so this pack does not use them.
[src: `ENGINE/01-brand-system/brand-identity-2026-07-29.md` §2, drift item 1]

### Never write

"Zero hallucinations", "no hallucinations", "hallucination-free", "100% accurate", "guaranteed correct",
"AI that never lies", "clinical decision support" (except to say it is *not* that), "all trials" or
"complete" for a partial census, and the name of the unlicensed drug database (see `08`). Avoid hype words
("revolutionary", "game-changing", "cutting-edge"). Lead with what was checked and how, not with "AI".

## Colours

The seven brand tokens, live in the website's CSS. [src: `ENGINE/01-brand-system/brand-system.md` → Color tokens;
confirmed in `ENGINE/workspace/collateral/landing-page/index.html` on 2026-10-23]

| Token | Hex | Role |
|---|---|---|
| `--color-bg-base` | `#0a0a0f` | Page / slide background |
| `--color-surface-raised` | `#12121a` | Cards, panels |
| `--color-border-subtle` | `#1e1e2a` | Dividers, hairlines |
| `--color-text-primary` | `#e8e8ec` | Body text |
| `--color-text-muted` | `#8888a0` | Captions, secondary metadata |
| `--color-accent-primary` | `#4a90d9` | Links, key data highlights, the one accent |
| `--color-accent-hover` | `#5da0e9` | Hover / emphasis on accent surfaces |

For status colours (PASS, BLOCK) in diagrams, keep them muted and always pair them with a word; the palette
has no official red or green, so any you add are diagram-only, not brand colours. `[UNVERIFIED]` addition,
not in the brand files.

## Type

- **IBM Plex Sans** for text, **IBM Plex Mono** for identifiers, data and code (both free, SIL Open Font
  License). Fallbacks: Inter / Helvetica Neue for text; JetBrains Mono, SF Mono, Fira Code for data.
- Scale: display 48/56 bold · heading-1 32/40 semibold · heading-2 24/32 semibold · heading-3 20/28 medium ·
  body 16/24 · caption 12/16 medium all-caps · data-mono 14/20 for citation ids (PMID, NCT).

[src: `ENGINE/01-brand-system/brand-system.md` → Typography] (Some older notes name Inter + SF Mono as the
brand fonts; the brand system and the live site use IBM Plex. Use Plex.)

## Shape

Dark mode. Sharp, rectangular, dense. **No gradients, no drop shadows, no rounded corners** (0–2 px at most).
Spacing scale 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 px. [src: `ENGINE/01-brand-system/brand-system.md` → Logo usage rules, Spacing scale]

## Logo: the TR monogram

Geometric, single colour, sharp 90° corners, equal stroke widths; it reads like a ticker symbol. The canonical
inline SVG (140 × 64), which inherits its colour from the surrounding text:

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

[src: `ENGINE/01-brand-system/brand-system.md` → Logo]

- **Primary:** white mark on the dark background. **Inverted:** dark on white. **Wordmark:** the mark with
  "TREVOR ROBEY INC" beneath in Plex Sans Bold, letter-spacing 0.24em. **Accent underline:** a 2 px
  `#4a90d9` bar between mark and wordmark.
- Clear space: the height of the T's top bar on every side. Never rotate, skew, recolour outside the palette,
  or add effects.

### Image files

| File | Notes |
|---|---|
| `ENGINE/01-brand-system/logo-300x150-transparent-inc.png` | 300 × 150, blue TR + "TREVOR ROBEY , INC." on transparent. Usable. |
| `ENGINE/01-brand-system/logo-300x150-transparent.png` | 300 × 150, **the text is clipped** at the right edge ("TREVOR / CITATION-"). Do not use. |
| `ENGINE/01-brand-system/google-business-profile/trevor-robey-inc google cover photo.png` | Google Business Profile cover |

Prefer the inline SVG above for slides: it is sharp at any size and takes the palette colours directly.
A Figma brand file exists (`ENGINE/01-brand-system/figma-reference.md`), but this pack does not depend on it.
