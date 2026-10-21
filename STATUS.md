# Status — Trevor Robey, INC.

> One page: where the business stands and what moves it next. Updated **2026-10-21**.
> Keep it short and true; the running story lives in [`_continuity/CONTINUITY.md`](_continuity/CONTINUITY.md),
> the last full handoff in [`_continuity/handoffs/HANDOFF-2026-10-21.md`](_continuity/handoffs/HANDOFF-2026-10-21.md).

## Where it stands

| | |
|---|---|
| Revenue | **$0.** Nothing listed on AWS yet; no calls or deals on record. |
| Entity | Trevor Robey Intelligence Network Citations LLC — CA No. B20260217250, approved 2026-06-18 |
| Compliance | **Behind.** EIN not applied for; LLC-12 (due 2026-09-16) and $800 FTB 3522 (due 2026-08-15) not done → [`compliance-calendar.md`](Trevor%20Robey%20Intelligence%20Network%20Citations/00-business-formation/compliance/compliance-calendar.md) |
| Engine | Works. Run #6 (2026-10-08) delivered 45/45 verified citations. Business-research lane built and unit-tested, **never run live**. |
| First product | Trial Graveyard Feed on AWS Data Exchange. 2026-10-21 refresh staged: **12 areas, 7,373 stopped trials, ~90% with a sponsor-stated reason**; breast cancer hit a 2,000-record cap (not a complete census). Not promoted, not listed. |
| Repo | One production source. `ops/tr-suite/verify.sh` = 0 FAIL; every deployed plugin byte-identical to source (`ops/tr-suite/deploy.sh --all`). |

## Operator queue (only you can do these)

1. **File the three compliance items** — EIN (free) → LLC-12 ($20) → FTB 3522 ($800). Two are past due.
2. **AWS listing gates** — accept AWS's StandardDSA. (The root email moved off the `.edu` address on 2026-10-21: it is now `aws@trevorobeyinc.com`, a Workspace group; R1 closed in `77bfc27`.)
3. **Review the refreshed feed** (`…/trial-graveyard-feed/refresh-2026-10-21/`) and decide what to promote.
4. **Price the feed** — `offers.md` still says `[DECIDE]`. The biomedical tier ladder ($0 / $99 / $249 / $499) is your decision of 2026-10-20; custom any-field prices are on hold by your call (2026-10-21).
5. **First live business-lane run** (arm `operator-approve` first) — needed before any custom sale.
6. **CI decision** — free/local options are on the table; nothing built yet.

## Build queue (agent work, not started)

- Finalize the listing files from the reviewed refresh (coverage table, per-area copy; breast cancer needs a narrower query or an honest "partial" label).
- `ops/paths.env` + generate both `.mcp.json` files from it.
- Gate `trinc-content` behind the PreToolUse hook AND strip both Zoho servers from the gate: one release, validated 2026-10-21 and waiting on your touches (signing + one sudo-gate). Patch and landing script in `/Users/myhome/.claude/plans/trinc-zoho-release/`; the 11 steps in the side-session note `HANDOFF-trinc-content-gate-zoho-retire-2026-10-21.md`.
- Retire Zoho everywhere (operator decision 2026-10-21; plan `PLAN-zoho-to-google-workspace-2026-10-21.md` in the same notes folder). Done: the nightly digest is file-only (SE `33d0ad1`), AWS on `aws@` (R1 closed), business records updated. Still open: the gate release above, the Zoho account shutdown + DNS + phone apps (console session), the opencode config, and Falcon rule 219's exclusion (propose-only).
- Brand one-pager + sample; monetization write-up; turn on one social channel via `trinc-content`.

## Not doing right now (by decision)

- New infrastructure (two-week freeze from the 2026-10-20 audit, until the first AWS product ships).
- Selling the amendment-risk band — paused since 2026-10-08 (ClinicalTrials.gov refuses the history endpoint).
- Absorbing the Security Bridge (`:8801`) — stays in Security Everything by decision.
