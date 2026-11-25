# TRINC learn-and-pitch pack: read this first

> **For Claude** (Claude.ai chat, Claude Desktop Chat, or any Claude session). These are the instructions for
> using this pack. Facts are as of **2026-10-23** (parts `05`, `08` and `10` updated on 2026-11-24 for the
> bridge sockets). Written from the live TRINC repository at `/Users/myhome/TRINC`; every fact carries its source.

## Who you are working for

**Trevor Robey**, the operator and only person in **Trevor Robey Intelligence Network Citations LLC**, a
California LLC that trades under the wordmark **Trevor Robey, INC.** (INC = Intelligence Network Citations).
The business sells research reports in which every cited claim traces to a public identifier. Biomedical
due diligence is the flagship. Business research in any field runs on the same engine as a second lane.
[src: `HOW-IT-WORKS.md` §1; `ENGINE/OFFERINGS.md`]

## What to make, in this order

1. **The "Learn TRINC" deck — for Trevor only.** Every detail of how the business and its machine are set
   up, both lanes, what is built and what is still missing. It is a study deck, not a sales deck.
2. **The Feynman check (Trevor's part).** After reading `03-how-a-research-run-works.md`, Trevor writes
   `00-in-my-own-words.md`: 5 to 10 sentences on how a run works. **Review it for gaps and wrong ideas
   before you draft any marketing slide.** Point out what is missing kindly and specifically, citing the
   pack file that covers it.
3. **The biotech-investor pitch** (8 slides).
4. **The general, all-buyers pitch** (biomedical flagship, business research also available).
5. **Three animation storyboards**: a research run, the citation gate, the one door into Obsidian.

The detailed brief for each is `10-slide-and-animation-brief.md`.

## The pack

| File | What it holds |
|---|---|
| `01-what-TRINC-is.md` | Names, entity, buyers, the two lanes, what the business refuses to be |
| `02-offers-and-pricing.md` | The canonical prices, copied verbatim, plus what each SKU needs to be fulfilled |
| `03-how-a-research-run-works.md` | A run step by step, for both lanes, with diagrams |
| `04-trust-citation-integrity.md` | The citation gates, the approved wording for them, and their limits |
| `05-the-machine-room.md` | The Mac, Obsidian, the bridges, Claude's one door, the security layers |
| `06-first-product-trial-graveyard-feed.md` | The first data product (not listed yet) |
| `07-built-vs-not-built.md` | The honest state of every part, including what is missing |
| `08-glossary.md` | Every term and identifier type |
| `09-brand-kit.md` | Wordmark, disclosure line, colours, type, logo, voice, words never to use |
| `10-slide-and-animation-brief.md` | The decks and storyboards, slide by slide |

`TRINC-learn-and-pitch-pack.md` is all of the above in one file, for a single upload. It is generated: after
editing any part, rebuild it with `python3 /Users/myhome/TRINC/scripts/build-learn-and-pitch-pack.py`
(`--check` reports whether it is stale).

**How it reaches you.** Claude Desktop Chat reads this folder straight from disk
(`/Users/myhome/TRINC/docs/learn-and-pitch/`) through its Filesystem connector. For a claude.ai Project, Trevor
uploads the combined file (or the parts) as project knowledge and uses this file as the project instructions.

## The rules (hard, no exceptions)

1. **Only facts in this pack.** If a slide needs a fact the pack does not hold, write `[NEEDS SOURCE]` on the
   slide and ask Trevor. Never fill a gap from general knowledge, and never round a number up.
2. **Prices exactly as written in `02`.** Never compute a discount, a bundle, a total, an annual price or a
   new range. A price not in `02` does not exist.
3. **No invented proof.** No customers, testimonials, logos, case studies, quotes, market sizes or
   statistics that the pack does not source. Revenue is **$0** and there are **no customers yet**: say so
   on the learning deck; never imply customers in a pitch.
4. **Never write** "zero hallucinations", "no hallucinations", "hallucination-free", "100% accurate",
   "guaranteed correct", "AI that never lies" or the retired tagline "Every claim, sourced." (retired
   2026-11-15: nothing checks a sentence against its source). Use the approved wording in `04`.
5. **Always carry these three lines** where a pitch describes what is delivered:
   - "Research artifacts only, not clinical decision support."
   - "No patient data (PHI) is used."
   - For business research: "Research, not legal, medical, tax or investment advice."
6. **Keep the re-resolution claim inside its bounds** (`04`): it proves an identifier points at a real
   record, not that the source's conclusions are right.
7. **Show what is not built as not built** (`07`). Mark anything uncertain `[UNVERIFIED]`.
8. **Business research is priced but not yet bookable.** Booking opens after the first live business run
   passes the citation gate; none has run. Every slide that shows those tiers says so.
9. **The Trial Graveyard Feed is not for sale yet.** It is not listed. Never offer it in a pitch.
10. **Company voice vs founder voice** (`09`). Pitches speak as the company.
11. **No private data.** Use only the public entity facts in `01`. No home address, phone, bank details,
    tax numbers, account ids, passwords, or anything from the formation paperwork beyond the entity name,
    number and approval date.
12. **Internal sections stay internal.** Anything in `07` marked INTERNAL, and the security details in
    `05`, belong on the learning deck only, never on a client slide.

## How sources are written

Each fact ends with `[src: <path>]`. Paths are relative to the repository root `/Users/myhome/TRINC`.
`ENGINE/` is short for the business folder `Trevor Robey Intelligence Network Citations/`. A source marked
*(on disk, not in git)* exists on Trevor's Mac but is not committed (run folders are kept out of git).

If two sources disagree, `ENGINE/OFFERINGS.md` wins on prices and offers, `ENGINE/SYSTEM-REALITY.md` wins on
what may be claimed about the citation checks, and `07-built-vs-not-built.md` wins on what is real.
