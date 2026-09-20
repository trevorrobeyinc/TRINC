# Google Workspace — Canonical Platform Record

> **THE Google Workspace file.** Single source of truth for the business's Google Workspace
> platform, assembled 2026-07-22 from repo ground truth (formation docs, connector registry,
> engine code sweep), live DNS (authoritative dig against Cloudflare NS), the live Admin
> console, and the migration as it actually happened. Companion doc:
> [`setup-runbook.md`](./setup-runbook.md) — the *how it was built* narrative + cutover
> tracker. Update THIS file when platform facts change; leave the runbook as the dated record.

## 1 · Account & identity

| Fact | Value |
|---|---|
| Organization | Trevor Robey Intelligence Network Citations LLC (CA LLC, entity B20260217250; principal office 8161 Oahu Dr, Fair Oaks, CA 95628-3745) |
| Super-admin | **trevor@trevorobeyinc.com** (sole user, 1 seat) |
| Created | 2026-07-22 (signup by operator) |
| Edition | **Google Workspace Enterprise Standard** — Active, annual plan (monthly payment), 1 license assigned / 0 available. Verified live 2026-09-13 in Admin console → Billing → Subscriptions. Path: Business Starter trial (07-22 → ~08-05) → Business Plus → **Enterprise Standard (operator upgrade 2026-09-12)**; no Business Plus row remains, so there is no double subscription. *(Superseded 2026-09-13: "Business Starter, 14-day trial — trial ends ~2026-08-05; ~$7/user/mo annual after.")* |
| Other subscriptions | **Chrome Enterprise Core** (Active, free) · **Android Enterprise** (Active, free) · **AI Expanded Access** add-on (Active, flexible plan, 1 assigned — keep/cancel decision open). Device and browser *security posture* from these (which browser is enrolled, which policies reach which Chrome profile, the phone's work profile) is recorded in the Security Everything repo, not here. **Android Enterprise feature-by-feature gap matrix (2026-09-16):** `~/Security Everything/mobile/google-workspace/android-enterprise-gap-matrix.md` (relocated 2026-09-19 — different repo, so this is a path, not a link) — every Google endpoint management capability vs this tenant's S24 work profile (tenant values read live 2026-09-16 18:52–19:00 PDT), twelve numbered proposals M1–M12 awaiting per-item confirms (M1 = turn on "Chrome on Android" so the P1–P8 Chrome policies reach the phone), and the list of what is already in place or out of reach by Google's design. |
| Chrome Enterprise Premium | **60-day trial started 2026-09-14** (Billing → Subscriptions: 5,000 trial licenses, **1 assigned** to trevor@, auto-assign OFF). It licenses the DLP rules and the Chrome content-analysis connectors (upload / download / paste / print scanning). By the operator's 2026-09-14 decision that coverage now reaches **every Chrome profile on the Mac mini, personal profiles included**, through machine-scope inheritance from the work OU (this supersedes the 09-13 scope-down); proven 2026-09-14 by a paste in a personal profile producing a rule event. Trial ends **~2026-11-13** — keep-or-cancel decision open (§8); what the connectors do when a Premium trial lapses has not been verified, so decide before then. **Re-checked live 2026-09-15 evening (Billing → Subscriptions → the Premium row's detail page):** it reads *Active · Since Sep 14, 2026 · Payment plan: Contracted pricing · 5,000 purchased · 4,999 available, 1 assigned · Auto-assign OFF · Estimated monthly bill: Contracted pricing* and **shows no trial end date anywhere** (the subscriptions list also carries no "trial" wording), so ~11-13 remains a derived figure (start + 60 days), not a console fact — confirm it from the signup email or Google's billing support before relying on it. **Superseded 2026-09-16: the end date IS a console fact — Chrome browser → Reports → Security insights carries the banner "Your trial ends in 58 days on Nov 13, 2026" (read 2026-09-16; the Billing page still shows nothing). Still unstated anywhere: whether Nov 13 is a lapse or a conversion to paid — Google's Help says features stop, the Billing row says Contracted pricing; ask billing support.** The browser OU's Upload-content-analysis panel reads **Chrome Enterprise Premium**, inherited from the root OU; its red "You need a Chrome Enterprise Premium license" line is still displayed and is static boilerplate (its own text says "If you already have one, please disregard"), not a license check. Security detail (OU inheritance, the two DLP rules, the mgmtwatch/OSSEC watch) lives in `~/Security Everything`. **Feature-by-feature gap matrix (2026-09-16):** `~/Security Everything/mobile/google-workspace/chrome-enterprise-premium-gap-matrix.md` (relocated 2026-09-19 — different repo, so this is a path, not a link) — every Premium-licensed capability vs this tenant (tenant values read live 2026-09-16), eleven numbered proposals awaiting per-item confirms, and the keep/cancel recommendation (§5 there). Licensing fact from Google's Help (read 2026-09-16): at trial end Premium features "stop working immediately", no grace period, settings persist unenforced; buying does not auto-assign licenses. |
| Primary domain | trevorobeyinc.com — **Verified · Gmail activated** (Admin console → Account → Domains → Manage domains) |
| Admin console | admin.google.com — sign in as trevor@trevorobeyinc.com ONLY (personal Gmails have no console) |
| Password | operator's Bitwarden (recovered 2026-07-22 via Bitwarden *generator history* after an unsaved-password lockout scare — generator history retains every generated password) |
| 2SV | **Enforced via YubiKeys — both keys enrolled 2026-07-22** (Security → 2-Step Verification) |
| Recovery email | trevoralexanderrobey@gmail.com |
| EIN / phone | Not provided at signup (LLC EIN still an open business TODO — unrelated to Workspace) |

## 2 · The three Google-adjacent identities (do not confuse)

| Address | What it is |
|---|---|
| **trevor@trevorobeyinc.com** | Workspace super-admin + THE business mailbox (Gmail, primary since 2026-07-22). The same string also still exists as the Zoho mailbox (now archive — §3). One address, two systems, on purpose. |
| **trevoralexanderrobey@gmail.com** | Operator's personal Gmail. OAuth identity of the **cloud gmail MCP connector** (`config/connector-registry.json:488`, prefix `ef0bc6fb…`) AND the **Cloudflare account login** (acct `f3b10bacc7e94c72e445b078433aa1d4`). Workspace recovery email. NOT a business surface. |
| **trevorrobeyinc@gmail.com** | Alias on the Zoho account; may have its own separate consumer inbox (unverified — flagged in `03-platforms/aws-data-exchange/correspondence-2026-05.md:15`). Not part of Workspace. |

## 3 · Email architecture (live as of 2026-07-22)

- **Gmail (Workspace) = primary host**, inbound + outbound, for trevor@trevorobeyinc.com.
  Inbound test **PASSED** 2026-07-22 (personal Gmail → trevor@, delivered to the new inbox).
  Outbound fully authenticated (SPF + DKIM + DMARC aligned).
- **Zoho = archive + secondary sender during transition.** Paid **Mail Lite (~$1/mo)** —
  bought 2026-07-22 solely to unlock IMAP for the migration; **downgrade candidate** once the
  import is verified complete. Pre-cutover history remains readable in Zoho webmail regardless.
- **The address string never changed.** trevor@trevorobeyinc.com stays the AWS seller/legal
  contact, Datarade contact, Gumroad order inbox, outbound-template signature, and the
  API-politeness contact hardcoded in **13 engine-code locations** — zero code changes needed:
  `openclaw-bridge/core/workflow-engine.js:400` · 5 distribution format-adapters
  (`aws-data-exchange:35`, `datarade:42,74`, `huggingface:74`, `kaggle:71`, `data-and-sons:28`)
  · 4 citation/retraction MCP modules (`crossref-retraction:20`, `ctgov-supplemental:34`,
  `citation-reresolver:55`, `pubmed-retraction:68`) · `workspace/scripts/citation_validator.py:37,39`.

## 4 · DNS (authoritative snapshot 2026-07-22 — Cloudflare zone `8aa049f562ccd2b88119aedcf471134d`)

| Record | Value | Purpose / provenance |
|---|---|---|
| MX `@` | `smtp.google.com` (pri 10, sole record) | Routes all mail to Gmail. Written by Google's Entri auto-connect 2026-07-22. |
| TXT `@` (SPF) | `v=spf1 include:_spf.google.com include:zoho.com ~all` | Dual-sender SPF for the transition. Set via Cloudflare API 2026-07-22. **Tighten to Google-only when Zoho sending retires.** |
| TXT `google._domainkey` | `v=DKIM1;k=rsa;p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQE…` (2048-bit) | Gmail DKIM key, published by Entri; **signing switched ON 2026-07-22**. ⚠️ Never click "Generate new record" on Admin → Gmail → Authenticate email — it would orphan this live key. |
| TXT `zoho._domainkey` | `v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BA…` | Legacy Zoho DKIM — keep while Zoho still sends; remove with the SPF tighten. |
| TXT `_dmarc` | `v=DMARC1; p=none; rua=mailto:trevor@trevorobeyinc.com; pct=100; adkim=r; aspf=r` | Pre-existing. Reports now land in Gmail. **Move `p=none`→`quarantine` after ~2 weeks of clean reports.** |
| TXT `@` | `google-site-verification=MDcTrdSPpIn41SnHOgIkQhTNBqayz9StUBqAOIPILf0` | Domain-ownership proof (keep permanently). |
| TXT `@` | `zoho-verification=zb95731918.zmverify.zoho.com` | Zoho domain proof — keep while the Zoho account exists. |
| AAAA `@`, `www` | `100::` (Cloudflare-proxied) | Landing-page worker `shy-grass-fccd` routing — untouched by the mail work. |

**DNS control:** Cloudflare API token `gws-dns-trevorobeyinc` (Zone.DNS:Edit, scoped to this
zone only), created 2026-07-22 via the Cloudflare dashboard (Claude-in-Chrome-driven; secret
never entered Claude context). Stored ONLY in macOS Keychain, service **`cf-dns-trevorobeyinc`**
— read at use-time: `security find-generic-password -s cf-dns-trevorobeyinc -w`.
Optional hygiene: the one-time Entri↔Cloudflare OAuth grant (used by Google's wizard to write
MX/DKIM/verification) can now be revoked in the Cloudflare dashboard — all further DNS work
goes through the scoped token.

## 5 · Migration record (Zoho → Gmail history import)

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

- **Cloud `gmail` MCP connector** (`config/connector-registry.json:488-501`, prefix
  `ef0bc6fb…`): bound to the operator's **personal** Gmail, draft-only + manual-confirm,
  chat-supervisory, no subprocess adapter by design. **Unchanged by this migration.**
  Re-binding (or adding a second connector) to the Workspace identity = separate future decision.
- **Local YubiKey-gated `gmail_mcp.py`** — the second, independent Gmail auth surface
  (`docs/mcp-connector-gap-analysis-2026-07-10.md:311`). Also personal-account; also unchanged.
- **zoho-mail / zoho-trinc MCP connectors → archive-readers** as of 2026-07-22. Live docs
  reconciled today: `CONNECTOR-ALIGNMENT.md:83`, `THE-WHOLE-SYSTEM.md:134`,
  `docs/mcp-connector-gap-analysis-2026-07-10.md:67` (+ `SYSTEM-REALITY.md:14`,
  `THE-WHOLE-SYSTEM.md:42` earlier the same day). Dated audit reports/changelogs/correspondence
  intentionally NOT rewritten — they are accurate history.
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
| AI Expanded Access add-on | flexible plan, 1 assigned — amount not captured in-repo | keep/cancel decision open (§1) |
| Chrome Enterprise Core · Android Enterprise | $0 (free) | Active |
| Zoho Mail Lite | ~$1/user/mo | temporary — bought for IMAP; downgrade after migration verifies |
| Cloudflare (domain + DNS + worker) | unchanged | no new cost from the mail work |

## 8 · Open items

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
- [ ] **Zoho downgrade off Mail Lite (~$1/mo)** — now SAFE: import verified, MX moved, so the Zoho
      archive is frozen and no delta import is needed. Downgrading kills IMAP; the webmail archive
      remains readable. Operator billing decision.
- [ ] **GAM7 bootstrap** — binary installed (`~/bin/gam7/gam` v7.46.11) but NOT wired to the org.
      Requires an **interactive terminal** (GAM reads stdin; it cannot be driven from a
      non-interactive shell) AND a prerequisite app-trust step discovered 2026-07-22:
      Admin console → Security → Access and data control → **API controls → App access control →
      Configure new app** → search Client ID
      `297408095146-fug707qsjv4ikron0hugpevbrjhkmsk7.apps.googleusercontent.com`
      ("GAM Project Creation") → mark **Trusted**. Then in Terminal.app:
      `~/bin/gam7/gam create project` → `~/bin/gam7/gam oauth create` (2 browser consents as
      trevor@). Unlocks scripted admin/reporting. Low urgency for a 1-user org.

**Open — deliberately deferred (do NOT do early):**
- [ ] SPF tighten (drop `include:zoho.com`) + remove `zoho._domainkey` — only once Zoho sending
      is fully retired; premature removal breaks any mail still sent from Zoho.
- [ ] DMARC `p=none` → `p=quarantine` — needs ~2 weeks of clean `rua` reports first (earliest
      ~2026-08-05). Tightening before the data is in risks quarantining legitimate mail.

**Optional / low value:**
- [ ] Revoke the Entri↔Cloudflare OAuth grant (superseded by the scoped API token)
- [ ] claude.ai Drive/Calendar connectors re-bind to the Workspace identity (chat-level only)
- [ ] `trevorrobeyinc@gmail.com` disposition — signed out of all devices 2026-07-22, **not
      deleted** (deliberate). Before any deletion: record its third-party/linked-apps list, search
      it for the missing AWS Data Exchange seller thread (`03-platforms/aws-data-exchange/
      correspondence-2026-05.md:15` names it as one of two possible locations), and set forwarding
      to trevor@. Note Google auto-deletes accounts inactive 2+ years.

## 9 · Cross-reference index

| Doc | Role |
|---|---|
| [`setup-runbook.md`](./setup-runbook.md) | How the platform was built + dated cutover tracker (historical record — do not "fix" its dated sections) |
| `~/Security Everything/mobile/google-workspace/` | **The device and endpoint half of this tenant, relocated out of this repo 2026-09-19** — S24 work profile / Android Enterprise matrix, Chrome Enterprise Premium matrix, and the personal→work app migration record. It left because `03-platforms/` is a distribution-channel directory and endpoint administration is not business material. Personal app names are redacted there under standing decision 4; the unredacted list stays here. |
| `SYSTEM-REALITY.md:14` · `THE-WHOLE-SYSTEM.md:42,134` | Ground-truth one-liners → point here |
| `CONNECTOR-ALIGNMENT.md:83` · `docs/mcp-connector-gap-analysis-2026-07-10.md` | Connector-layer view of the mail move |
| `_continuity/CONTINUITY.md` (Log 2026-07-22) | Session-by-session cutover narrative |
| `00-business-formation/llc/certificate-of-formation.md` | Legal identity used at signup |
| `audit/business-reality-2026-06/00-audit-report.md` | Pre-migration email reality (dated 2026-06-10 — historical) |
