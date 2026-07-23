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
| Edition | **Business Starter**, 14-day trial — trial ends **~2026-08-05** (verify exact date: Admin console → Billing); ~$7/user/mo annual (~$8.40 flexible) after |
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
| Workspace Business Starter (1 seat) | $0 during trial → ~$7/user/mo annual (~$8.40 flexible) | trial ends ~2026-08-05; payment method on file (operator-entered) |
| Zoho Mail Lite | ~$1/user/mo | temporary — bought for IMAP; downgrade after migration verifies |
| Cloudflare (domain + DNS + worker) | unchanged | no new cost from the mail work |

## 8 · Open items

**Done 2026-07-22:**
- [x] Migration verified complete (1,251/1,251, 0 failed) — §5
- [x] **Aliases `support@trevorobeyinc.com` + `aws@trevorobeyinc.com`** added to the trevor@ user
      (Admin → Users → Trevor Robey → Alternate email addresses; free, no extra seat, up to 30).
      Mail to either now lands in the same Gmail inbox. Origin of the idea:
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
| `SYSTEM-REALITY.md:14` · `THE-WHOLE-SYSTEM.md:42,134` | Ground-truth one-liners → point here |
| `CONNECTOR-ALIGNMENT.md:83` · `docs/mcp-connector-gap-analysis-2026-07-10.md` | Connector-layer view of the mail move |
| `_continuity/CONTINUITY.md` (Log 2026-07-22) | Session-by-session cutover narrative |
| `00-business-formation/llc/certificate-of-formation.md` | Legal identity used at signup |
| `audit/business-reality-2026-06/00-audit-report.md` | Pre-migration email reality (dated 2026-06-10 — historical) |
