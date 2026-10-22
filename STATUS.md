# Status — Trevor Robey, INC.

> One page: where the business stands and what moves it next. Updated **2026-10-21 (evening)** from the
> four TR-INC Biz sibling sessions. Keep it short and true; the running story lives in
> [`_continuity/CONTINUITY.md`](_continuity/CONTINUITY.md), the last full handoff in
> [`_continuity/handoffs/HANDOFF-2026-10-21.md`](_continuity/handoffs/HANDOFF-2026-10-21.md).

## Where it stands

| | |
|---|---|
| Revenue | **$0.** Nothing listed on AWS yet; no calls or deals on record. |
| Entity | Trevor Robey Intelligence Network Citations LLC — CA No. B20260217250, approved 2026-06-18 |
| **Workspace** | 🔴 **Payment failed** — the card on file was declined. Google Workspace **suspends 2026-11-02**, taking business mail AND the AWS root email (`aws@`) with it. AI Expanded Access is already suspended (auto-cancels Dec 4). → [`google-workspace.md` §8](Trevor%20Robey%20Intelligence%20Network%20Citations/03-platforms/google-workspace/google-workspace.md) |
| Compliance | **Behind.** EIN not applied for; LLC-12 (due 2026-09-16) and $800 FTB 3522 (due 2026-08-15) not done. No agency email in `trevor@` (all time) — but notices come **by post**, and the Zoho-era mailbox (May–July) was not searched. Every answer pre-filled: [`filing-walkthrough-2026-10.md`](Trevor%20Robey%20Intelligence%20Network%20Citations/00-business-formation/compliance/filing-walkthrough-2026-10.md) |
| Engine | Works. Run #6 (2026-10-08) delivered 45/45 verified citations. Business-research lane **ready for its first live run, never run live yet.** The Evidence Desk is built (`a110f07`, after the pre-flight fixes in `8a0f5c5`): official-statistics ids `BLS:` and `EUROSTAT:` (keyless), with `CENSUS:` and `EIA:` built but dormant until you register their free keys. Also a passage condenser and a deterministic scout brief that replaces the scout's model call; the citation gate judges model-written text only. The business section gate uses SearXNG `science`, because `general` is Bing-only junk; it reverts to `general` once a Brave Search API (deferred by you) is in. Engine suite 1343/1343. Both commits are signed and **not pushed**. |
| First product | Trial Graveyard Feed. 2026-10-21 refresh **reviewed: 0 problems** — 12 areas, 7,373 stopped trials, ~90% with a sponsor-stated reason; breast cancer stopped at 2,000 of 2,034 (not a complete census). Listing files finalized (copy, coverage table, offer terms, console walkthrough in `UPLOAD-RUNBOOK.md`). **Not promoted, not uploaded, not listed.** |
| Repo | One production source. `ops/tr-suite/verify.sh` = 0 FAIL. Plugin bindings + connector registry reconciled (6 plugins bound; 62 connectors incl. the business lane's 4 sources; plugin audit clean). |

## Operator queue (only you can do these)

1. **Fix the Workspace payment before 2026-11-02.** Decide AI Expanded Access first (fixing payment restores it), then replace the card and add a backup. Steps: `google-workspace.md` §8.
2. **File the compliance items — EIN (free) → LLC-12 ($20) → FTB 3522 ($800)**, before any paid product goes Public (a suspended entity cannot sell). Walkthrough above. Two things to have ready: the **bizfile login** (LLC-12 now needs bizfile "User Access" since 2026-08-01 — find the login in Bitwarden under `sos.ca.gov`; fallback is a PIN letter by post) and the **FTB Web Pay entity ID `20260217250`** (not the EIN). Check paper mail at the business address for any notice.
3. **AWS listing decisions** (*deferred by you, 2026-10-21, until the business-engine work is set up*) — breast cancer in v1 or not; which products launch first; promote the refresh into `data/`; the price (back on hold by your call, 2026-10-21; `offers.md` says `[DECIDE]`). There is **no separate DSA acceptance**: choose *Data Exchange default* in each offer's legal-terms step. Also read two AWS "[ACTION REQUIRED]" emails in `trevor@` (Brazil 2P distribution, Oct 1; India Marketplace Operator Phase 2, Aug 28).
4. **Set DMARC to `p=quarantine`** in Cloudflare — record in `google-workspace.md` §8 (a spoof from an outside server was seen 2026-10-11).
5. **Chrome Enterprise Premium trial ends ~2026-11-13** — keep or cancel.
6. **Workspace housekeeping (~10 min):** turn off the Strayer Outlook forward; remove GAM7 (`~/bin/gam7`, `~/.gam`, its `.zshrc` alias); check `trevor@`'s recovery email; decide whether AWS mail should also reach `trevorrobeyinc@gmail.com`.
7. **Re-seal the `gmail` MCP client** (Security Everything lane — the sealed client is malformed, so the lane returns `client_malformed`): `cd '/Users/myhome/Security Everything/gmail-mcp' && .venv/bin/python3 gmail_setup.py --seal-client --replace` with the Desktop client's ID.
8. **After the next commit:** run `node scripts/render-business-context.js --apply` (operator-run only); authorize BioRender if you want it.
9. **First live business-lane run — ready, needs your go.** The Evidence Desk it was parked for is built (`a110f07`). Recommended inputs: `cost-reduction-analysis` with `{"topic":"Where can a mid-size US 3PL warehouse cut labour and energy cost?","industry":"warehousing and logistics","country":"US"}` (rationale in the engine's `docs/business-research-lane.md` § "Recommended first run"). Open Obsidian, arm `operator-approve`, and dispatch through Command Center. Keyless BLS allows 25 queries a day, so avoid repeat runs the same day. Before or after it: **push** `8a0f5c5` + `a110f07`; **bless obsidianwatch** with Obsidian open (6 CRITICAL `protected_plugin_changed` findings — command-center is from this lane's deploy, the other five came earlier; look at `obsidian-local-rest-api` before blessing); register the **free Census + EIA keys** to switch on those two sources. Needed before any custom sale.
10. **CI decision** — free/local options are on the table; nothing built yet.

## Build queue (agent work)

- ~~Apply the two tested sibling patches~~ — APPLIED 2026-10-21: the Graveyard Feed **generator copy fix** (13/13 feed tests; a monthly refresh now writes the corrected copy itself) and the **connector-audit fix** (now cross-checks the business lane's prefetch map too).
- **DEFERRED by the operator (2026-10-21) until the business-engine work is set up** — the listing and generator follow-ups: sort the free sample by `nct_id` so it is the same on every rebuild (a row-selection change); have `build-graveyard-feed.js` pass `maxRecords` (pending the breast-cancer decision); regenerate `refresh-2026-10-21/` with the fixed generator instead of the hand-patched copy before promotion; update the stale `trinc-engineering:feed-refresh` skill (obsolete page-size warning, old 6-area/300-row product); and queue item 3's listing decisions.
- `ops/paths.env` + generate both `.mcp.json` files from it.
- The local `trinc-business:compliance-calendar` skill describes the past (still says R1 is unresolved; lacks the User Access rule and the Web Pay ID).
- Brand one-pager + sample; monetization write-up; turn on one social channel via `trinc-content` (now gated: `operator-approved-gate arm trinc-content`).
- ~~Gate `trinc-content`; strip both Zoho servers from the gate~~ — DONE (Security Everything `07726a0`).
- ~~Retire Zoho~~ — account **closed**, DNS **confirmed clean** (SPF Google-only), records updated, Strayer stopgap retired (filter + calendar series deleted). Left: on-device Zoho app uninstalls (yours), and the Falcon follow-ups in `~/Security Everything/alertdesk/proposals/falcon-219-drop-retired-launchers-2026-10-21.md` § "Noticed, not changed" — you decide and apply those in the Falcon console (two agent attempts stopped at a safety safeguard, correctly).
- ~~Finalize the listing files~~ — DONE 2026-10-21 (not uploaded).

## Not doing right now (by decision)

- New infrastructure (two-week freeze from the 2026-10-20 audit, until the first AWS product ships). One exception, by your decision 2026-10-21: the business lane's Evidence Desk.
- Selling the amendment-risk band — paused since 2026-10-08 (ClinicalTrials.gov refuses the history endpoint).
- Absorbing the Security Bridge (`:8801`) — stays in Security Everything by decision.
- **GAM7** (Workspace admin CLI) — declined 2026-10-21: a super-admin token on disk for a one-user org.
- Custom any-field research prices — on hold by your call (2026-10-21).
