# Google Workspace — Canonical Platform Record

> **THE Google Workspace file.** Single source of truth for the business's Google Workspace
> platform, assembled 2026-07-22 from repo ground truth (formation docs, connector registry,
> engine code sweep), live DNS (authoritative dig against Cloudflare NS), the live Admin
> console, and the migration as it actually happened. Companion doc:
> [`setup-runbook.md`](./setup-runbook.md) — the *how it was built* narrative + cutover
> tracker. Update THIS file when platform facts change; leave the runbook as the dated record.
>
> **Last reconciled 2026-10-21** against the live Admin console, Gmail and Calendar (Claude Browser
> pane, signed in as trevor@) and `dig`. Headline: 🔴 **the Workspace payment failed — fix the card
> before 2026-11-02 or the business mailbox and the AWS root email (`aws@`) stop** (§8, first item).

## 1 · Account & identity

| Fact | Value |
|---|---|
| Organization | Trevor Robey Intelligence Network Citations LLC (CA LLC, entity B20260217250; principal office 8161 Oahu Dr, Fair Oaks, CA 95628-3745) |
| Super-admin | **trevor@trevorobeyinc.com** (sole user, 1 seat) |
| Created | 2026-07-22 (signup by operator) |
| Edition | **Google Workspace Enterprise Standard** — Active, annual plan (monthly payment), 1 license assigned / 0 available. Verified live 2026-09-13 in Admin console → Billing → Subscriptions, and **re-read 2026-10-21: still Active, but its last payment FAILED. The card on the one payment account (`2016-3940-6176-9809`), Visa •••• 0832, was declined; Admin shows an overdue balance and "To avoid suspension of your service on Nov 2, 2026, please update your payment information." Gmail shows the same banner (first seen 2026-10-16). Suspension would stop trevor@ mail AND the `aws@` group, which is the AWS root email. Fix: §8, first item.** Path: Business Starter trial (07-22 → ~08-05) → Business Plus → **Enterprise Standard (operator upgrade 2026-09-12)**; no Business Plus row remains, so there is no double subscription. *(Superseded 2026-09-13: "Business Starter, 14-day trial — trial ends ~2026-08-05; ~$7/user/mo annual after.")* |
| Other subscriptions | **Chrome Enterprise Core** (Active, free) · **Android Enterprise** (Active, free) · **AI Expanded Access** add-on (flexible plan, 1 assigned — **SUSPENDED as of 2026-10-21** "due to a billing error" (the same declined card) and "scheduled for cancellation on Dec 4, 2026"; keep/cancel decision open, §8). Device and browser *security posture* from these (which browser is enrolled, which policies reach which Chrome profile, the phone's work profile) is recorded in the Security Everything repo, not here. **Android Enterprise feature-by-feature gap matrix (2026-09-16):** `~/Security Everything/mobile/google-workspace/android-enterprise-gap-matrix.md` (relocated 2026-09-19 — different repo, so this is a path, not a link) — every Google endpoint management capability vs this tenant's S24 work profile (tenant values read live 2026-09-16 18:52–19:00 PDT), twelve numbered proposals M1–M12 awaiting per-item confirms (M1 = turn on "Chrome on Android" so the P1–P8 Chrome policies reach the phone), and the list of what is already in place or out of reach by Google's design. |
| Chrome Enterprise Premium | **60-day trial started 2026-09-14** (Billing → Subscriptions: 5,000 trial licenses, **1 assigned** to trevor@, auto-assign OFF). It licenses the DLP rules and the Chrome content-analysis connectors (upload / download / paste / print scanning). By the operator's 2026-09-14 decision that coverage now reaches **every Chrome profile on the Mac mini, personal profiles included**, through machine-scope inheritance from the work OU (this supersedes the 09-13 scope-down); proven 2026-09-14 by a paste in a personal profile producing a rule event. Trial ends **~2026-11-13** — keep-or-cancel decision open (§8); what the connectors do when a Premium trial lapses has not been verified, so decide before then. **Re-checked live 2026-09-15 evening (Billing → Subscriptions → the Premium row's detail page):** it reads *Active · Since Sep 14, 2026 · Payment plan: Contracted pricing · 5,000 purchased · 4,999 available, 1 assigned · Auto-assign OFF · Estimated monthly bill: Contracted pricing* and **shows no trial end date anywhere** (the subscriptions list also carries no "trial" wording), so ~11-13 remains a derived figure (start + 60 days), not a console fact — confirm it from the signup email or Google's billing support before relying on it. **Superseded 2026-09-16: the end date IS a console fact — Chrome browser → Reports → Security insights carries the banner "Your trial ends in 58 days on Nov 13, 2026" (read 2026-09-16; the Billing page still shows nothing). Still unstated anywhere: whether Nov 13 is a lapse or a conversion to paid — Google's Help says features stop, the Billing row says Contracted pricing; ask billing support.** The browser OU's Upload-content-analysis panel reads **Chrome Enterprise Premium**, inherited from the root OU; its red "You need a Chrome Enterprise Premium license" line is still displayed and is static boilerplate (its own text says "If you already have one, please disregard"), not a license check. Security detail (OU inheritance, the two DLP rules, the mgmtwatch/OSSEC watch) lives in `~/Security Everything`. **Feature-by-feature gap matrix (2026-09-16):** `~/Security Everything/mobile/google-workspace/chrome-enterprise-premium-gap-matrix.md` (relocated 2026-09-19 — different repo, so this is a path, not a link) — every Premium-licensed capability vs this tenant (tenant values read live 2026-09-16), eleven numbered proposals awaiting per-item confirms, and the keep/cancel recommendation (§5 there). Licensing fact from Google's Help (read 2026-09-16): at trial end Premium features "stop working immediately", no grace period, settings persist unenforced; buying does not auto-assign licenses. |
| Primary domain | trevorobeyinc.com — **Verified · Gmail activated** (Admin console → Account → Domains → Manage domains) |
| Admin console | admin.google.com — sign in as trevor@trevorobeyinc.com ONLY (personal Gmails have no console) |
| Password | operator's Bitwarden (recovered 2026-07-22 via Bitwarden *generator history* after an unsaved-password lockout scare — generator history retains every generated password) |
| 2SV | **Enforced via YubiKeys — both keys enrolled 2026-07-22** (Security → 2-Step Verification) |
| Recovery email | trevoralexanderrobey@gmail.com (as recorded 2026-07-22; not re-read since). ⚠️ The operator began retiring that account on 2026-10-16 in favour of `trevorrobeyinc@gmail.com`, so the super-admin's recovery address points at an account being phased out — operator check in §8. |
| EIN / phone | Not provided at signup (LLC EIN still an open business TODO — unrelated to Workspace) |

## 2 · The three Google-adjacent identities (do not confuse)

| Address | What it is |
|---|---|
| **trevor@trevorobeyinc.com** | Workspace super-admin + THE business mailbox (Gmail, primary since 2026-07-22, and since 2026-10-21 the ONLY mail host: the Zoho mailbox that carried the same string was deleted with the Zoho account — §3). |
| **trevoralexanderrobey@gmail.com** | Operator's personal Gmail. **Cloudflare account login** (acct `f3b10bacc7e94c72e445b078433aa1d4`) and Workspace recovery email. It was the OAuth identity of the claude.ai Gmail connector, which was disconnected on 2026-07-09 (`~/Security Everything/gmail-mcp/GMAIL_MCP.md`). NOT a business surface. |
| **trevorrobeyinc@gmail.com** | A separate consumer Google account (not part of Workspace). Since 2026-10-16 it is the one account the local YubiKey-gated `gmail` MCP lane is pinned to (`GMAIL_MCP.md`). It was also a login alias on the Zoho account, which no longer exists. Disposition item in §8. |

## 3 · Email architecture (re-checked 2026-10-21)

- **Gmail (Workspace) = the only mail host**, inbound + outbound, for trevor@trevorobeyinc.com.
  Inbound test **PASSED** 2026-07-22 (personal Gmail → trevor@, delivered to the new inbox).
  Outbound fully authenticated (SPF + DKIM + DMARC aligned).
- **Addresses on the domain:** `trevor@` (the one licensed user), `support@` (an alias on
  trevor@), `aws@` (a Google **Group** since 2026-10-21, owner + only member trevor@, the AWS
  root email; §8). Admin console re-read 2026-10-21: Directory → Users lists only trevor@,
  Directory → Groups lists only aws@ (the alias list was `support@` only at 02:08 the same day).
- **trevor@ forwards a copy of ALL incoming mail to `trevorrobeyinc@gmail.com`** (Gmail →
  Settings → Forwarding: *Forward a copy … keep Gmail's copy in the Inbox*; POP off). This is
  **intended state**: the operator set it up on 2026-10-16 while moving personal mail to that
  account, and it was proven end to end that night (Security Everything memory
  `email-consolidation-2026-10-16`). Read it before you assume a takeover. **Consequence to
  keep in mind:** because `aws@` delivers to trevor@, AWS root-email mail (sign-in and password
  reset codes) is also copied to that consumer account, so the AWS root's recovery now rests on
  BOTH mailboxes' security. Whether that is acceptable is the operator's call (§8).
- **Zoho: RETIRED and the account CLOSED 2026-10-21** (operator decision). Mail Lite cancelled
  and downgraded immediately, the domain removed, the org "Trevor Robey Inc." (922155859)
  deleted; Zoho mailed "Your Zoho account is closed" at 04:55 PDT. Its DNS records were removed
  the same morning (§4). **The pre-cutover history is gone with it, and Gmail does NOT hold all
  of it:** a read-only check before the delete found only 17 Gmail conversations dated before
  07-22 and no Datarade mail, while Zoho's Sent folder held threads Gmail lacked (AWS Data
  Exchange onboarding request 00881277, CrowdStrike cases 02473127 / 02470898, "Talk to Sales").
  The operator chose to let those go. *(Superseded 2026-10-21: "Zoho = archive + secondary
  sender during transition … Pre-cutover history remains readable in Zoho webmail
  regardless.")* Record: `~/Security Everything/docs/browser-session-history/2026-10.md`,
  entry 2026-10-21 (04:14–.
- **The address string never changed.** trevor@trevorobeyinc.com stays the AWS seller/legal
  contact, Datarade contact, Gumroad order inbox, outbound-template signature, and the
  API-politeness contact hardcoded in **13 engine-code locations** — zero code changes needed:
  `openclaw-bridge/core/workflow-engine.js:400` · 5 distribution format-adapters
  (`aws-data-exchange:35`, `datarade:42,74`, `huggingface:74`, `kaggle:71`, `data-and-sons:28`)
  · 4 citation/retraction MCP modules (`crossref-retraction:20`, `ctgov-supplemental:34`,
  `citation-reresolver:55`, `pubmed-retraction:68`) · `workspace/scripts/citation_validator.py:37,39`.

## 4 · DNS (snapshot 2026-10-21 16:2x PDT, `dig` via 1.1.1.1 — Cloudflare zone `8aa049f562ccd2b88119aedcf471134d`, NS `betty`/`ricardo.ns.cloudflare.com`)

| Record | Value | Purpose / provenance |
|---|---|---|
| MX `@` | `smtp.google.com` (pri 10, sole record) | Routes all mail to Gmail. Written by Google's Entri auto-connect 2026-07-22. |
| TXT `@` (SPF) | `v=spf1 include:_spf.google.com ~all` | Google-only. **Tightened 2026-10-21** by the operator in Cloudflare (dropped `include:zoho.com`), verified with `dig` on both authoritative nameservers at 05:09 PDT. *(Was `v=spf1 include:_spf.google.com include:zoho.com ~all`, set via Cloudflare API 2026-07-22.)* |
| TXT `google._domainkey` | `v=DKIM1;k=rsa;p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArJKh0w…` (2048-bit) | Gmail DKIM key, published by Entri; **signing switched ON 2026-07-22**. ⚠️ Never click "Generate new record" on Admin → Gmail → Authenticate email — it would orphan this live key. |
| TXT `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:trevor@trevorobeyinc.com; pct=100; adkim=r; aspf=r` | **Moved `p=none` → `p=quarantine` 2026-10-21** by the operator in Cloudflare; verified 17:23 PDT with `dig` (one record, TTL 300) on `betty`/`ricardo.ns.cloudflare.com`, 1.1.1.1 and 8.8.8.8. Aggregate reports land at trevor@. Why and how: §8. *(Was `p=none`, pre-existing.)* |
| TXT `@` | `google-site-verification=MDcTrdSPpIn41SnHOgIkQhTNBqayz9StUBqAOIPILf0` | Domain-ownership proof (keep permanently). |
| AAAA `@`, `www` | `100::` (Cloudflare-proxied) | Landing-page worker `shy-grass-fccd` routing — untouched by the mail work. |
| *(absent)* | no MTA-STS (`_mta-sts`), no TLS-RPT (`_smtp._tls`), no BIMI, no CAA | Not proposed (infra freeze until the first AWS product ships). |

**Removed 2026-10-21 with the Zoho retirement** (operator, Cloudflare dashboard; gone on both
authoritative nameservers at 05:06 PDT and still absent at 16:2x): TXT `zoho._domainkey`
(legacy Zoho DKIM) and the apex TXT `zoho-verification=zb95731918.zmverify.zoho.com`.

**DNS control:** Cloudflare API token `gws-dns-trevorobeyinc` (Zone.DNS:Edit, scoped to this
zone only), created 2026-07-22 via the Cloudflare dashboard (Claude-in-Chrome-driven; secret
never entered Claude context). Stored ONLY in macOS Keychain, service **`cf-dns-trevorobeyinc`**
— read at use-time: `security find-generic-password -s cf-dns-trevorobeyinc -w`.
Optional hygiene: the one-time Entri↔Cloudflare OAuth grant (used by Google's wizard to write
MX/DKIM/verification) can now be revoked in the Cloudflare dashboard — all further DNS work
goes through the scoped token.
**How DNS changes are made now (2026-10-21):** by the operator, in the Cloudflare dashboard in
their own browser (Cloudflare's Google sign-in does not complete in the Claude Browser pane), then
verified with `dig` against `betty`/`ricardo.ns.cloudflare.com`. Cloudflare's inline record editor
needs its own Save per row; on 2026-10-21 the first SPF edit did not save until re-saved.

## 5 · Migration record (Zoho → Gmail history import, 2026-07-22 — historical; the source no longer exists)

> **Read this first (2026-10-21).** The Zoho account was closed on 2026-10-21, so nothing below
> can be re-run. The status line "1,251/1,251 … 0 failed" describes the import job, **not what
> Gmail holds**: on 2026-10-21 Gmail held only 17 conversations dated before the cutover (§3). Never
> cite it as proof the old mail is in Gmail. The app password "Google Console" was revoked at Zoho
> the same day, so the Keychain item `zoho-app-pw-migration` below is dead; the operator deletes it
> in **Keychain Access.app** (never the `security` CLI, which Falcon rule 219 watches).

| Fact | Value |
|---|---|
| Tool | Admin console → Data → **Data import** (IMAP) — the 2026 successor of the Data Migration Service |
| Source server | **`imappro.zoho.com`:993 SSL** — ⚠️ the paid-tier Zoho host. `imap.zoho.com` (the free-tier/default host) rejects this account with generic `Invalid credentials`, which mimics a password error. Authoritative source: Zoho Mail → Settings → Mail Accounts → IMAP → server table. |
| Prerequisites (all done 2026-07-22) | Zoho **Mail Lite** paid plan (free plan has no IMAP) → per-account **IMAP Access** toggle ON → fresh **app password** (Zoho name: "Google Console") |
| App password | macOS Keychain service **`zoho-app-pw-migration`** (regenerating it in Zoho invalidates this copy) |
| Mapping | trevor@trevorobeyinc.com (IMAP) → trevor@trevorobeyinc.com (Workspace); start date Dec 31 1999 (= everything) |
| **Final status (2026-07-22)** | ✅ **COMPLETE — 1,251/1,251 items successful · 1,234 emails imported · 0 skipped · 0 warnings · 0 failed · 1 user processed.** Zoho labels (`Newsletter`, `Notification`, `_Archive`) mapped over correctly. |
| Delta import | Console offers "Run delta import" for new/modified messages — **not needed**: MX now points at Google, so the Zoho mailbox receives no new mail and its archive is frozen. |
| Diagnostic pattern (reusable) | Raw-IMAP probe with the Keychain-held secret: `printf 'a1 LOGIN user "pw"\r\n' \| openssl s_client -connect host:993 -quiet` — Zoho's `NO`-response text distinguishes bad-credential vs "IMAP not enabled" vs plan limits. |

## 6 · Workspace ↔ TrevClaw-stack integration

- **No agent connector reads the business mailbox (re-checked 2026-10-21).** The business
  Gmail is reached only through the Gmail web UI: the operator's own browser, or the Claude
  Browser pane (`cb` arm, the operator signs in as trevor@ inside it).
  - The **claude.ai cloud Gmail connector** (bound to the personal Gmail) was disconnected on
    2026-07-09 (`~/Security Everything/gmail-mcp/GMAIL_MCP.md`). *(Superseded: the 07-22 line
    here said it was "unchanged by this migration".)*
  - The **local YubiKey-gated `gmail` MCP** (`~/Security Everything/gmail-mcp/`, scope
    `mcp-gmail`, `gmail.modify`, no send) is pinned to **`trevorrobeyinc@gmail.com`** since
    2026-10-16 (before that the personal Gmail), and its own README records it as out of service
    since 2026-09-05 by operator decision. It cannot see trevor@trevorobeyinc.com.
  - Re-binding any connector to the Workspace identity remains a separate, unmade decision.
- **zoho-mail / zoho-trinc MCP connectors: RETIRED 2026-10-21**, stripped from every Security
  Everything gate list (SE `07726a0`) and marked RETIRED in `config/connector-registry.json`
  (`9d96234`). A Zoho server registered again would arrive ungated: never re-register one.
  *(Superseded: "archive-readers as of 2026-07-22".)* Dated audit reports, changelogs and
  correspondence are intentionally NOT rewritten — they are accurate history.
- **Engine-side Google Drive stays REMOVED** (operator decision 2026-07-01; the
  `GOOGLE_DRIVE_*`/`GOOGLE_CLIENT_SECRET` env-scrub in the three subprocess spawners remains
  as defense-in-depth). This Workspace signup does NOT reopen that door.
- **Manual-only external actions invariant applies to Gmail** exactly as it did to Zoho:
  no autonomous sending; drafts are operator-confirmed.
- **Google Business Profile** (`01-brand-system/google-business-profile/` cover photo) is a
  separate free product, owner account undocumented — unrelated to Workspace; candidate for
  future consolidation under trevor@trevorobeyinc.com.

## 7 · Costs

| Item | Cost | Status |
|---|---|---|
| Workspace **Enterprise Standard** (1 seat) | annual plan, monthly payment — the live amount is not captured in-repo; read it in Admin console → Billing → Subscriptions | Active, verified 2026-09-13. *(Superseded 2026-09-15: "Business Starter — $0 during trial → ~$7/user/mo annual (~$8.40 flexible); trial ends ~2026-08-05." The path was Business Starter → Business Plus → Enterprise Standard, operator upgrade 2026-09-12.)* |
| Chrome Enterprise Premium | $0 during the 60-day trial (started 2026-09-14); list price not captured in-repo | trial ends ~2026-11-13 — keep/cancel decision open (§1, §8) |
| AI Expanded Access add-on | flexible plan, 1 assigned — amount not captured in-repo | **Suspended 2026-10-21 (declined card); auto-cancels Dec 4, 2026** — keep/cancel decision open (§1, §8) |
| Chrome Enterprise Core · Android Enterprise | $0 (free) | Active |
| **Payment status (2026-10-21)** | Visa •••• 0832 declined; overdue balance (amount shown only in Google Payments) | **Workspace suspends Nov 2, 2026 unless the payment method is fixed** — §8 first item |
| Zoho Mail Lite | was $15/yr (renewed 2026-07-22) | **Cancelled and downgraded immediately 2026-10-21; account closed.** *(Superseded: "temporary — bought for IMAP; downgrade after migration verifies".)* |
| Cloudflare (domain + DNS + worker) | unchanged | no new cost from the mail work |

## 8 · Open items

**Reconciled 2026-10-21** (live reads in the Claude Browser pane, signed in as trevor@, plus `dig`;
record in the shared side-session notes `RESULT-google-workspace-2026-10-21.md`). Operator
decisions taken the same day: retire the Strayer forward now, decline and remove GAM7, move
DMARC to `p=quarantine`.

- [ ] 🔴 **Fix the Workspace payment method before 2026-11-02 (operator; payments are never an
      agent action).** Visa •••• 0832 was declined; Enterprise Standard's last payment failed and
      the service suspends on **Nov 2, 2026**. Suspension stops trevor@ mail and the `aws@` group,
      i.e. the AWS root email. Steps: admin.google.com (as trevor@) → **Billing → Payment
      accounts** → account `2016-3940-6176-9809` → update the card (or call the bank if the card
      itself is fine) → pay the overdue balance → **Add a backup payment method** (Admin's own
      suggestion, so one failed card cannot suspend the business again) → reload **Billing →
      Subscriptions** and confirm "issues need your attention" is gone and the Gmail banner
      ("We are unable to renew …") no longer shows. **Decide the AI Expanded Access add-on FIRST**
      (next item): Admin says updating payment info is what restores it.
- [ ] **AI Expanded Access add-on — keep or let it go (operator).** Suspended 2026-10-21 for the
      declined card; scheduled for cancellation **Dec 4, 2026**. To drop it, cancel it in Billing →
      Subscriptions (or let Dec 4 do it) so the card fix does not revive it; to keep it, the card
      fix restores it.
- [ ] **Strayer → Gmail forward: retire at the source (operator, Outlook).** Decided 2026-10-21
      ("retire now"; the AWS root email is `aws@` since 2026-10-21, so the forward carries
      nothing AWS needs). Done by Claude and verified from fresh loads: the Gmail filter
      `to:(Trevor.Robey@my.strayer.edu)` → `Via-Strayer` deleted (12 filters remain) and the monthly
      calendar series "Check: is Strayer → Gmail forwarding still alive?" deleted (all events;
      Calendar search for "Strayer" now returns nothing). Left for the operator: sign in at
      <https://outlook.office.com/mail/options/mail/forwarding> as the Strayer account → *Enable
      forwarding* OFF → Save. The `Via-Strayer` label is empty and still exists (harmless; delete it
      in Gmail → Settings → Labels if wanted). Gmail held NO message addressed to the Strayer
      address on 2026-10-21, so nothing is lost by retiring it.
- [ ] **Recovery email of the super admin (operator check).** Recorded as
      `trevoralexanderrobey@gmail.com`, an account the operator is retiring (2026-10-16). Check
      myaccount.google.com (as trevor@) → Security → *Recovery email* and point it at an account
      the operator keeps (e.g. `trevorrobeyinc@gmail.com`), then update §1.
- [ ] **trevor@ → `trevorrobeyinc@gmail.com` forward — accept the AWS consequence or narrow it
      (operator decision).** Intended state since 2026-10-16 (§3), but it also copies `aws@` mail,
      including AWS root sign-in and reset codes, into a consumer account. Options: keep it (then
      that account needs the same YubiKey-grade 2SV as trevor@), or replace the blanket forward
      with a filter that forwards everything except `to:aws@trevorobeyinc.com`.
- [ ] **Workspace `still-on-OLD` filter (leftover, harmless).** `deliveredto:trevoralexanderrobey@gmail.com`
      → label `still-on-OLD`, created 2026-10-16 for the personal-mail phase-out; that plan has the
      operator deleting this Workspace copy once old → new forwarding works (it was proven
      2026-10-16), and it is still present on 2026-10-21. Not in `gmail-filters.xml` on purpose:
      it is personal-mail routing, not business routing.
- [x] **`Prospects` mislabel sweep — CLOSED 2026-10-21, nothing to sweep.** `in:anywhere
      label:prospects` and the label view both return no conversations; the security alerts the
      07-23 over-broad clause mislabelled are no longer under that label. The live filter is the
      corrected subject-only one (matches `gmail-filters.xml`).
- [x] **Send mail as `aws@` after the alias → group change — row intact 2026-10-21.** Gmail →
      Settings → Accounts lists trevor@ (default), aws@ and support@ with no "unverified" flag. No
      test mail was sent (sending needs the operator's go); the DMARC pre-flight below covers it.
- [x] **Zoho downgrade — MOOT: the Zoho account was CLOSED 2026-10-21** (§3).
- [x] **SPF tighten + remove `zoho._domainkey` — DONE 2026-10-21** (§4).
- [x] **DMARC → `p=quarantine` — DONE 2026-10-21 17:2x PDT** (operator, Cloudflare; verified with `dig`; §4).
- [x] **GAM7 — DECLINED 2026-10-21 (operator).** See the GAM7 item below.

**Done 2026-07-22:**
- [x] Migration verified complete (1,251/1,251, 0 failed) — §5
- [x] **Aliases `support@trevorobeyinc.com` + `aws@trevorobeyinc.com`** added to the trevor@ user
      (Admin → Users → Trevor Robey → Alternate email addresses; free, no extra seat, up to 30).
      Mail to either now lands in the same Gmail inbox.
      **✅ RE-VERIFIED LIVE 2026-07-23** in the Admin console (Users → Trevor Robey → User
      information → "Alternate email addresses (email alias)"): both aliases present, exactly two,
      on the single `trevor@trevorobeyinc.com` Super Admin user. **Implication to remember:** these
      are *aliases on that one user*, not independent mailboxes — there is no separate inbox to
      monitor (use a Gmail filter on `to:aws@trevorobeyinc.com` if you want them visually split),
      and they are **not independently recoverable**: lose the `trevor@` Workspace account and both
      aliases go with it. That matters if `aws@` is ever used as the AWS **root** email, where AWS
      recommends a group/role address precisely so recovery doesn't hinge on one account. Origin of the idea:
      `03-platforms/aws-data-exchange/listing/product-description.md:197`. **Not yet propagated**
      to the AWS seller profile / listing docs — that's a separate content update if the operator
      wants the public support contact changed from trevor@ to support@.
      **⇢ SUPERSEDED for `aws@` on 2026-10-21: it is now a Google GROUP, not an alias.** On the
      operator's choice (group, not a licensed user) the `aws` alias was removed from trevor@ and
      the group **AWS / `aws@trevorobeyinc.com`** created (Admin group id `01mrcu092leksiq`):
      owner + only member trevor@ (subscription *Each email*), Custom access with **Who can post =
      Anyone on the web** (so Amazon can reach it), conversations visible to owners/managers/members
      only, no external members, message moderation off, **spam handling = "Post suspicious messages
      to the group"** (an AWS verification code can never sit unseen in a pending queue; Gmail's own
      spam filter still runs at trevor@). Prerequisite flipped the same session: Apps › Google
      Workspace › Groups for Business › Sharing settings › **"Group owners can allow incoming email
      from outside the organization" = ON** (was off). The address was reusable immediately after the
      alias removal. `support@` is still an alias on trevor@. All verified from fresh loads; record in
      `~/Security Everything/docs/browser-session-history/2026-10.md` (2026-10-21 02:08). Purpose:
      the AWS root-email target for risk R1 — see `../aws-data-exchange/account-access.md`.
- [x] Inbound test passed; YubiKey 2SV enrolled; docs reconciled across 6 files

**Added 2026-07-22 (operator questions → tasks):**
- [ ] **AWS seller public contact → `support@` or `aws@`.** Now possible (aliases exist). Change in
      AWS Marketplace Management Portal → Settings → seller profile/support contact. **Operator-only:**
      the stack's AWS invariant is AI = `ReadOnlyAccess`, mutations need the operator's
      `AdministratorAccess` + YubiKey (monorepo `CLAUDE.md`, AWS access section); no AWS MCP is even
      connected in this session. Also update the listing docs that publish the contact
      (`listing/product-description.md`, `product-creation.md:126`,
      `listing/data-eligibility-and-compliance.md:80`) so repo and portal agree.
- [x] ~~**AWS escalation letter (was UNSENT)**~~ — ✅ **MOOT / RESOLVED 2026-07-22.** The disbursement
      block cleared (operator added the disbursement method; account status = "Publish paid and free
      products"), so the §6 Seller-Operations letter in
      `03-platforms/aws-data-exchange/correspondence-2026-05.md` is no longer needed — do not send it.
- [ ] **Work-profile consolidation** (Chrome profile "Trevor Robey Intelligence Network Citations"):
      bind every business account to the business identity/profile and off the personal one. Map +
      plan: [`../business-identity-map.md`](../business-identity-map.md).

**Open — operator-gated:**
- [ ] **Chrome Enterprise Premium trial — keep or cancel before ~2026-11-13** (started 2026-09-14;
      decide together with the AI Expanded Access add-on). Billing decisions only; the browser/DLP
      coverage that depends on Premium is recorded in `~/Security Everything`.
      **2026-09-16:** the gap matrix is drafted — `~/Security Everything/mobile/google-workspace/chrome-enterprise-premium-gap-matrix.md` (relocated 2026-09-19 — different repo, so this is a path, not a link)
      (research from Google's public docs + the tenant read, both done 2026-09-16; every row carries a
      dated tenant state; proposals P1–P11 — all applied on typed per-item confirms, P9 in Monitor mode, see below; keep/cancel recommendation
      in its §5: keep only if the credential-leak warning rule is adopted, otherwise cancel). The read
      found the connectors set to Chrome Enterprise Premium at root with malware scanning on but
      **scanning in the background only ("Allow immediate …" on all four — no delay-until-scanned;
      corrected 15:05 PDT after a first misread said the opposite)**, Chrome insight scanning already
      ON, and the gaps to be (see below; **P1–P8, P10, P10b and P11 were APPLIED the same afternoon and
      evening on typed per-item confirms — the connectors now hold uploads/pastes/prints/downloads until
      scanned, a warning rule fires on credential pastes/uploads, both Chrome DLP rules also cover Google
      Cloud API keys + GCP credentials, the audit rule no longer emails super admins, Password alert,
      pushed Gen AI defaults, the Gen AI & SaaS report and Chrome OCR are on, the HIGH-risk "Dark Mode –
      Night Eye" extension is blocked for every profile, and P8's blocked-hosts list is down to
      `myaccount.google.com` + `vault.bitwarden.com` after the operator removed `accounts.google.com` by
      hand at ≈15:55 PDT (it had blinded Claude in Chrome on every Google page). P9 followed at 17:30 PDT
      on `confirm P9`: Context-Aware Access is ON with the level "TRINC managed endpoint" in **Monitor mode**
      on Calendar, Drive and Docs, Gmail, Chat and Meet — nothing is enforced until the two-week monitor
      review (~2026-09-30), and the Chrome-browser attributes must be re-checked against the Nov 13 trial
      end before enforcing**)
      OCR for Chrome (off), the Gen AI & SaaS report (not turned on), Gen AI defaults not pushed to the
      personal profiles, Password alert at default, no Chrome threat-event alert rules, Context-Aware
      Access OFF for everyone, and one HIGH-risk extension in the work profile.
- [x] **Android Enterprise adoption — DONE (2026-09-16/17).** M1–M11 and M13 applied; **M12 is the
      one still open**, held for the Chrome Enterprise Premium P9 review. The work profile's Chrome now
      takes the tenant's Chrome policies, the managed-app store is the only install path, work↔personal
      sharing and clipboard are blocked, and auto-wipe, failed-unlock wipe, encryption and the
      screen-capture block are live. **The feature matrix, per-proposal history and console routes left
      this repo on 2026-09-19** — they are device administration, not business material:
      `~/Security Everything/mobile/google-workspace/android-enterprise-gap-matrix.md`.
      Still the operator's, on the phone itself: the seven-point work-profile check.
- [x] ~~**Drive DLP hit to eyeball:** the Google Doc **"Building OpenClaw Research Engine"**~~ — ✅ **CLOSED
      2026-09-15 evening: the operator DELETED the Doc** (operator-reported, not re-verified from the console).
      It had matched the PASSWORD detector during the 2026-09-14 Drive rescan; the other 8 secret-type hits
      were checked (`qdrant.ts`, two `dependency-update-*-sample.json`, test fixtures — all clean). Note: a
      deleted Drive file sits in Trash for 30 days and can still show in the rule log / lock count until
      purged, so the "9 still locked" figure below may read 8 or 9 depending on when it is re-read. If the
      Doc did hold a real credential, rotating it is still the operator's call — deletion alone does not
      rotate anything.
- [ ] **External-sharing lock on ~714 monorepo files in Drive (note, not a task):** on 2026-09-14 the
      Workspace DLP rule "Chrome Enterprise Core - Sensitive uploads" re-scanned Drive after its logic
      was switched to OR and applied its *Block external sharing* action to ~714 files of the
      `TRINC/Monorepo` copy (568 System-log + 188 IP-address matches, none real). The Drive audit log
      showed nothing was actually unshared. Both detectors were removed on 2026-09-15 (14 detectors
      remain). **RESOLVED 2026-09-15 evening (read-only re-check from the Admin console's Rule log
      events search, window "after 2026-09-15 02:21"):** the narrowed rule re-scanned Drive at
      02:48 on 09-15 and the log DOES record the release — grouped by Event it holds exactly two
      kinds, **705 × "Content unmatched"** (content no longer matched a policy or rule) and
      **705 × "Action complete" / Drive Unflag Document**, and **zero new matches** of any kind.
      714 locked files minus the 9 secret-type hits = 705, so every file except those 9 is
      unlocked; the 9 still match the remaining detectors and keep *Block external sharing*
      (`qdrant.ts`, the two `dependency-update-*-sample.json`, the test fixtures, and the Google
      Doc below). Spot-check: the Drive share dialog of an unflagged file (`failure-modes.md`) and
      of a still-locked one (`qdrant.ts`) look identical — owner only, General access
      "Restricted", **no banner about the rule** — so the share panel is not a witness to the
      block either way; the rule log is. Still: do not test by attempting an external share.
- [x] **Alert Center backlog from the 09-14/15 DLP episode — CLOSED 2026-09-15/16 (operator-confirmed
      item A1).** The open set was **69 alerts**, all "Data Loss Prevention (DLP)", High, unassigned,
      none from the 714 Drive matches: 49 × the 09-14 22:53–22:57 email loop ("Rule triggered: …"),
      19 × Falcon "[High] Malicious activity" mails matched by the System-log detector (4 on 09-14
      22:56, 15 on 09-15 00:15–02:01, before the detector was removed at 02:14), and 1 × the deliberate
      T1 proof paste (09-14 22:52, Chrome Premium rule). Alert Center has no false-positive disposition
      and the list's only bulk control is DELETE (permanent), so each alert was closed on its detail
      page: Status → Closed, Feedback → "Not Useful" (68), a one-line cause comment; the T1 alert was
      closed with a "true-positive test" note and no feedback. Verified: a fresh Alert Center load shows
      "You have no alerts at this time"; three random detail pages re-read Closed / Not Useful / comment.
      Nothing was deleted. The loop itself has been dead since 09-14 22:57 (K1 removed the rule's email
      recipient; D2 removed the detector) — this item was only the leftover rows.
- [x] ~~**Zoho downgrade off Mail Lite (~$1/mo)**~~ — **MOOT 2026-10-21:** the Zoho account was
      closed outright (Mail Lite cancelled and downgraded immediately, domain and org deleted; §3).
- [x] ~~**GAM7 bootstrap**~~ — **DECLINED 2026-10-21 (operator decision, when asked). Do not
      re-propose without a concrete job that the Admin console cannot do.** Reason: a bootstrapped
      GAM leaves a super-admin OAuth token (`oauth2.txt`) and a service-account key on disk — a
      new long-lived credential to guard — for a one-user org whose admin work is occasional and
      console-sized; and the stack is in an infra freeze until the first AWS product ships. State
      at the decision: binary at `~/bin/gam7/` (v7.46.11, 57 MB, never connected to the org),
      `~/.gam/` holding only `gam.cfg` + an empty cache (no token, no key), an `alias gam=` line
      at `~/.zshrc:71`; and on the Google side **nothing to undo** — Admin → Security → API
      controls → App access control → *Configured apps* is empty and *Accessed apps* lists no GAM
      client (read 2026-10-21). **Removal is the operator's** (exact steps in the 2026-10-21
      hand-over: move both folders to the Trash, delete the alias line). The old bootstrap steps
      (trust Client ID `297408095146-fug707qsjv4ikron0hugpevbrjhkmsk7.apps.googleusercontent.com`
      "GAM Project Creation", then `gam create project` / `gam oauth create` in an interactive
      Terminal) are kept here only as history. The installer line in `setup-runbook.md` §4 step 2
      must not be re-run: it feeds a download straight into a shell.

**Mail-domain hardening:**
- [x] ~~SPF tighten (drop `include:zoho.com`) + remove `zoho._domainkey`~~ — **DONE 2026-10-21**
      by the operator in Cloudflare after Zoho was closed; `zoho-verification` TXT removed too (§4).
- [x] **DMARC `p=none` → `p=quarantine` — DONE 2026-10-21** (operator, Cloudflare; verified
      17:23 PDT: one `_dmarc` record reading `p=quarantine` on both authoritative nameservers,
      1.1.1.1 and 8.8.8.8; SPF and MX unchanged). Still open from this item: the optional
      Show-original pre-flight below (not reported done), and a look at the aggregate reports
      in ~2 weeks (~2026-11-04) before any talk of `p=reject`. Evidence (read 2026-10-21 from the aggregate reports at trevor@; only two
      reports have arrived since the 07-22 cutover, both from Google):
      - 2026-10-16 — 1 message from `209.85.220.41` (Google), DKIM pass (`d=trevorobeyinc.com`,
        selector `google`), SPF pass, both aligned → legitimate Workspace mail.
      - 2026-10-11 — 1 message from **`213.251.242.61` (`mail.mianstroy.ru`, AS25189 AO
        Countrycom, Russia)**, header From `trevorobeyinc.com`, no DKIM, SPF softfail → DMARC
        **fail**, delivered only because the policy is `none`. That is a spoof of the business's
        domain (it is not in trevor@'s own mailbox, spam or trash included), exactly what
        `p=quarantine` sends to the recipient's spam folder.
      - No legitimate non-Google sender exists any more: Zoho is closed, the nightly security
        digest is file-only (SE `33d0ad1`), and nothing else sends as the domain. **Rule from now
        on: any new service that sends as `@trevorobeyinc.com` (a CRM, Stripe or Gumroad custom
        sender, a form tool) gets SPF/DKIM set up BEFORE its first send, or its mail goes to spam.**
      **Record to set** (Cloudflare → `trevorobeyinc.com` → DNS → Records → the TXT named
      `_dmarc` → Edit → replace Content → the row's own **Save**):
      `v=DMARC1; p=quarantine; rua=mailto:trevor@trevorobeyinc.com; pct=100; adkim=r; aspf=r`
      **Verify** on both authoritative nameservers (they must both print the new value):
      `dig +short TXT _dmarc.trevorobeyinc.com @betty.ns.cloudflare.com` and the same
      `@ricardo.ns.cloudflare.com`. **Optional pre-flight** (two minutes, before or right after):
      from trevor@'s Gmail send one ordinary message *from each* of trevor@, aws@ and support@
      (the From dropdown) to `trevorrobeyinc@gmail.com`; in that inbox open each → ⋮ → *Show
      original* → SPF, DKIM and DMARC must all read PASS. **Rollback:** put `p=none` back in the
      same record. **Later:** watch the reports for ~2 weeks; moving on to `p=reject` is a
      separate decision, not part of this one.

**Optional / low value:**
- [ ] Revoke the Entri↔Cloudflare OAuth grant (superseded by the scoped API token)
- [ ] claude.ai Drive/Calendar connectors re-bind to the Workspace identity (chat-level only)
- [x] ~~`trevorrobeyinc@gmail.com` disposition~~ — **SUPERSEDED 2026-10-16:** that account is
      now the operator's personal primary (it replaces `trevoralexanderrobey@gmail.com`, receives
      both the old account's mail and a copy of trevor@'s, and is the `gmail` MCP lane's pinned
      account), so it is not a deletion candidate. The one part still worth doing: search it for
      the missing AWS Data Exchange seller thread (`03-platforms/aws-data-exchange/
      correspondence-2026-05.md:15` names it as one of two possible locations; Zoho, the other
      candidate store, is gone).

## 9 · Cross-reference index

| Doc | Role |
|---|---|
| [`setup-runbook.md`](./setup-runbook.md) | How the platform was built + dated cutover tracker (historical record — do not "fix" its dated sections) |
| `~/Security Everything/mobile/google-workspace/` | **The device and endpoint half of this tenant, relocated out of this repo 2026-09-19** — S24 work profile / Android Enterprise matrix, Chrome Enterprise Premium matrix, and the personal→work app migration record. It left because `03-platforms/` is a distribution-channel directory and endpoint administration is not business material. Personal app names are redacted there under standing decision 4; the unredacted list stays here. |
| [`workspace-operations.md`](./workspace-operations.md) · [`gmail-filters.xml`](./gmail-filters.xml) | How the mailbox is tailored (filters, send-as, calendar) · the source-controlled filter set |
| `~/Security Everything/docs/browser-session-history/2026-10.md` | Console records for 2026-10-21: the `aws@` group (02:08), the Zoho shutdown + DNS (04:14) |
| `~/Security Everything/gmail-mcp/GMAIL_MCP.md` · memory `email-consolidation-2026-10-16` (Security Everything project) | The `gmail` MCP lane and its pinned account · the 2026-10-16 personal-mail move that set up the trevor@ forward |
| `SYSTEM-REALITY.md:14` · `THE-WHOLE-SYSTEM.md:42,134` | Ground-truth one-liners → point here |
| `CONNECTOR-ALIGNMENT.md:83` · `docs/mcp-connector-gap-analysis-2026-07-10.md` | Connector-layer view of the mail move |
| `_continuity/CONTINUITY.md` (Log 2026-07-22) | Session-by-session cutover narrative |
| `00-business-formation/llc/certificate-of-formation.md` | Legal identity used at signup |
| `audit/business-reality-2026-06/00-audit-report.md` | Pre-migration email reality (dated 2026-06-10 — historical) |
