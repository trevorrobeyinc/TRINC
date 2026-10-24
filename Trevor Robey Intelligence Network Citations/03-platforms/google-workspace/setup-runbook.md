# Google Workspace — Setup Runbook

> **Dated build record (2026-07-21/22) — current state lives in [`google-workspace.md`](./google-workspace.md).**
> Since then (re-checked 2026-10-21): Zoho is closed and its DNS removed, SPF is Google-only,
> GAM7 was declined, and the Workspace subscription has a failed payment due by 2026-11-02.

> **Status: LIVE — SIGNUP DONE, DOMAIN VERIFIED, MX CUTOVER COMMITTED & IN PROGRESS**
> (2026-07-22). Signup completed by operator; domain verified via `google-site-verification`
> TXT (Entri flow, after one stuck-spinner retry → manual TXT). The wizard's Gmail-activation
> step replaced the Zoho MX with `smtp.google.com` (pri 10); operator then **explicitly chose
> to commit to the full Gmail cutover** (2026-07-22, supersedes the §1 D1 Option-B default —
> §7 is now the active workstream, tracked below). Interim rule: do NOT send from Gmail until
> SPF covers Google and DKIM is live. Zoho keeps sending validly meanwhile.
>
> **§7 cutover tracker (updated 2026-07-22):** MX→Google ✅ · SPF dual-include ✅ (`v=spf1
> include:_spf.google.com include:zoho.com ~all`, applied via CF API, authoritative-verified)
> · Gmail DKIM published ✅ (`google._domainkey` — published by the Entri connect flow) ·
> DKIM signing on ✅ (2026-07-22, via cic-driven Admin console — key matched the Entri-published
> DNS record before the click; button now "Stop authentication") · Zoho IMAP mail migration ✅
> RUNNING (started 2026-07-22 via Admin console Data-import IMAP tool — server
> **`imappro.zoho.com`:993 SSL, NOT imap.zoho.com** [paid-tier host, per Zoho Mail settings →
> Mail Accounts → IMAP]; required Zoho Mail Lite upgrade [free plan has no IMAP] + per-account
> IMAP Access toggle + a fresh app password "Google Console" [Keychain `zoho-app-pw-migration`];
> first status: 81/81 items successful, 0 failed) · YubiKey 2SV on admin ✅ (operator-enrolled
> 2026-07-22) · inbound test ⬜ · docs sweep ✅ (SYSTEM-REALITY.md:14, THE-WHOLE-SYSTEM.md:42 →
> Google Workspace) · connectors sweep ⬜
> · later: tighten SPF, DMARC `p=quarantine`, Google-side aliases (support@/aws@), GAM project.
>
> Cloudflare API access: token `gws-dns-trevorobeyinc` (Zone.DNS:Edit, zone-scoped), created
> 2026-07-22 via cic-driven dashboard session; stored ONLY in macOS Keychain service
> `cf-dns-trevorobeyinc` (read at use-time via `security find-generic-password -w`; the secret
> never enters Claude context or shell history). Zone id `8aa049f562ccd2b88119aedcf471134d`.
>
> Originally: **Status: PREPARED, NOT STARTED** (2026-07-21). This runbook was generated
> programmatically from repo ground truth + live DNS/tooling checks. Steps marked **🔑 OPERATOR** cannot be
> delegated to Claude — account creation, passwords, payment, ToS, OAuth grants, and YubiKey
> touches are operator-only (Claude policy + this stack's manual-only-external-actions posture).
> Everything else is scriptable and Claude can drive it propose-only, per-item "go".

## 0 · Ground truth (verified 2026-07-21)

| Fact | Value | Source |
|---|---|---|
| Legal entity | **Trevor Robey Intelligence Network Citations LLC** (CA LLC, member-managed, sole member Trevor Robey) | `00-business-formation/llc/certificate-of-formation.md` |
| CA entity no. / status | B20260217250 · APPROVED 2026-06-18 | same |
| Principal office | 8161 Oahu Dr, Fair Oaks, CA 95628-3745 | same |
| Wordmark + disclosure | "Trevor Robey, INC." + *"…is the wordmark of Trevor Robey Intelligence Network Citations LLC, a California limited liability company."* | same §Brand wordmark |
| EIN | **none yet** (open TODO — not required for Workspace signup) | `llc/ein-confirmation.md` (placeholder) |
| Business phone | none exists (not required for signup) | repo-wide sweep, no hits |
| Domain | trevorobeyinc.com — **Cloudflare Registrar + Cloudflare DNS**, account `f3b10bacc7e94c72e445b078433aa1d4` (login trevoralexanderrobey@gmail.com); registered 2026-04-25, expires 2027-04-25; site = Worker `shy-grass-fccd` | whois + `CLAUDE.md:320` + `wrangler whoami` |
| Live DNS (dig 2026-07-21) | MX → `mx/mx2/mx3.zoho.com` (10/20/50) · SPF `v=spf1 include:zoho.com ~all` · DKIM at `zoho._domainkey` (rsa) · DMARC `p=none; rua=mailto:trevor@trevorobeyinc.com` · `zoho-verification` TXT · **no `google-site-verification`** | dig |
| Email host | **Zoho Mail** — trevor@trevorobeyinc.com LIVE and embedded everywhere (AWS seller/legal contact, Datarade, Gumroad, outbound templates, 10+ engine code files as API contact email) | email-infra sweep 2026-07-21 |
| Existing Google footprint | none owned — 1 Business Profile cover photo (no documented account), no GCP/API keys/site-verification; engine-side Google Drive connector deliberately REMOVED 2026-07-01 (decision stands) | google-footprint sweep 2026-07-21 |
| Local tooling | wrangler 4.103 authed (OAuth, **zone:read only — cannot edit DNS**); **no GAM, no gcloud** | `wrangler whoami` |

## 1 · Decisions (🔑 OPERATOR — answer before starting)

- **D1 — Mail strategy.** **Recommended: Option B — verify the domain, do NOT touch MX.**
  Workspace gives Drive/Docs/Calendar/Meet/Gemini on @trevorobeyinc.com identities; mail stays
  on Zoho untouched. Option A (full Gmail cutover) is §7 — a separate, later, gated decision.
  Rationale: trevor@trevorobeyinc.com is the live AWS-seller/legal/Gumroad contact; MX cutover
  is the only genuinely risky step and is fully decoupled from getting Workspace running.
- **D2 — Edition/seats.** Recommended: **Business Starter, 1 seat** (14-day trial; ~$7–8.40/user/mo
  after). Upgradeable in-console any time.
- **D3 — Identities.** Admin user: **trevor@trevorobeyinc.com** (same string as the Zoho address —
  different systems, no conflict). "Current email" during signup + recovery:
  **trevoralexanderrobey@gmail.com**. Business name field: the full legal LLC name.

## 2 · Signup (🔑 OPERATOR-ONLY, ~10 min, browser)

At <https://workspace.google.com> → *Get started*. Claude cannot do any of this step
(account creation, password, ToS, payment, possible CAPTCHA/phone-verify). Prefilled values:

| Field | Enter |
|---|---|
| Business name | Trevor Robey Intelligence Network Citations LLC |
| Number of employees | Just you |
| Region | United States |
| Your name | Trevor Robey |
| Current email | trevoralexanderrobey@gmail.com |
| Domain | *"Yes, I have one I can use"* → **trevorobeyinc.com** |
| Admin username | trevor@trevorobeyinc.com |
| Password | operator-only — generate in password manager; YubiKey 2SV comes in §4 |
| Plan / payment / ToS | Business Starter trial → operator enters payment + accepts ToS |

Decline optional data-sharing/marketing toggles. Stop when the setup wizard shows the
**domain-verification TXT record** (`google-site-verification=…`) — hand that token to §3.

## 3 · Domain verification (programmatic — Claude-drivable, propose-only)

> Shortcut: the wizard offers "connect to Cloudflare automatically" (a Cloudflare login grant).
> Operator may click that themselves and skip this whole section. The API path below is the
> repeatable, scripted route and also sets up tokened DNS control for §7/DMARC work later.

**3.1 (🔑 OPERATOR, once, ~3 min) Create a scoped Cloudflare API token** at
<https://dash.cloudflare.com/profile/api-tokens> → *Create Token* → template *Edit zone DNS* →
scope: **Zone.DNS : Edit**, zone = trevorobeyinc.com only. Then store it in Keychain so it never
passes through Claude or shell history (the prompt asks for the token interactively):

```bash
security add-generic-password -a cloudflare -s cf-dns-trevorobeyinc -w
```

**3.2 Add the TXT record** (Claude runs on "go"; `GOOGLE_TOKEN` = the wizard's full
`google-site-verification=…` string):

```bash
CF_API_TOKEN="$(security find-generic-password -s cf-dns-trevorobeyinc -w)"
ZONE_ID=$(curl -s -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones?name=trevorobeyinc.com" | python3 -c 'import sys,json;print(json.load(sys.stdin)["result"][0]["id"])')
curl -s -X POST -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -d '{"type":"TXT","name":"trevorobeyinc.com","content":"google-site-verification=PASTE_TOKEN_VALUE","ttl":3600}'
```

**3.3 Verify:** `dig +short TXT trevorobeyinc.com` shows the token → click **Verify** in the
wizard (operator, or Claude in the Claude Browser pane with the cb gate armed). Propagation is usually <5 min.

## 4 · Post-signup hardening + programmatic admin

1. **🔑 OPERATOR first:** admin.google.com → Security → 2-Step Verification → enroll **both
   YubiKeys** as security keys on trevor@trevorobeyinc.com; add recovery phone/email; then
   enforce 2SV org-wide (Security → 2SV → Enforcement).
2. ⛔ **DECLINED 2026-10-21 (operator) — do not run this step.** GAM7 is not used and is being
   removed; the installer below feeds a download straight into a shell, which this stack never
   does (fetch to a file, checksum, ask). Reason and state: `google-workspace.md` §8.
   *Original step, kept as history:* **Install GAM7** (the Workspace admin CLI — makes everything after this scriptable):
   ```bash
   bash <(curl -s -S -L https://raw.githubusercontent.com/GAM-team/GAM/main/src/gam-install.sh) -l
   ```
   `gam create project` + `gam oauth create` walk through Google Cloud project creation —
   **🔑 OPERATOR consents to 2 OAuth screens** in the browser (signed in as trevor@). After
   that, Claude can run GAM read/config commands propose-only.
3. **Scripted baseline (Claude proposes, operator "go"s):** `gam info domain` (verify state),
   sharing/visibility defaults, disable unused services (e.g. Blogger/Currents-class extras),
   session length, Marketplace app install policy = admin-only.
4. **Console-only leftovers** (no API): billing review, data-region, some Gmail/DKIM screens —
   drive via the **Claude Browser pane** (🔑 OPERATOR says go and Claude runs
   `operator-approved-gate arm cb`: PIN + YubiKey touch; every click that changes state is proposed
   first; the operator signs in inside the pane).

## 5 · Wire into the stack (after live)

- Update: `SYSTEM-REALITY.md` domain/email rows, monorepo `CLAUDE.md`
  website section, and this file's status header.
- claude.ai-level Google Drive/Calendar connectors MAY be re-bound to the new Workspace
  identity (chat-supervisory only). **Engine-side Google Drive stays removed** — the 2026-07-01
  operator decision stands; the env-scrub hardening in the three spawners already guards it.
- Append a `_continuity/CONTINUITY.md` Log entry.
- Leave all repo edits uncommitted for a YubiKey-signed commit by the operator.

## 6 · Verification checklist

- [ ] `dig +short TXT trevorobeyinc.com` contains `google-site-verification=…`
- [ ] Admin console shows domain **Verified**; subscription active (trial end date noted)
- [ ] 2SV enforced; both YubiKeys enrolled; recovery set
- [ ] `gam info domain` returns verified=true
- [x] ~~MX still `mx*.zoho.com` (Option B — untouched)~~ SUPERSEDED by the committed cutover: MX = `smtp.google.com`; inbound test PASSED 2026-07-22 (personal Gmail → trevor@, landed in the new Gmail inbox)
- [ ] Docs + continuity board updated

## 7 · OPTIONAL later phase — Gmail MX cutover (NOT scheduled; own 🔑 decision)

Do NOT fold this into initial setup. When/if chosen: migrate old mail (Admin console → Data
migration, Zoho IMAP `imap.zoho.com:993`), generate DKIM (Admin → Apps → Gmail → Authenticate
email, 2048-bit, publish `google._domainkey` TXT), then swap records via the §3 token: MX →
`smtp.google.com` (priority 1, sole record), SPF → `v=spf1 include:_spf.google.com ~all`,
keep DMARC (tighten `p=none`→`quarantine` only after ≥2 wks of clean reports). Blast radius to
re-verify: AWS seller correspondence, Datarade, Gumroad order mail, the `zoho-mail`/`zoho-trinc`
MCP connectors (would need Gmail-side equivalents), outbound templates. The address string
`trevor@trevorobeyinc.com` never changes — only the host. **Rollback:** restore the three Zoho
MX records + SPF (values snapshotted in §0).

## 8 · Where the operator is personally required (the honest answer)

| Gate | What | Time |
|---|---|---|
| G1 | Decisions D1–D3 | 2 min |
| G2 | Signup: account + password + ToS + payment (+ any CAPTCHA/phone-verify) | ~10 min |
| G3 | Cloudflare API token → Keychain (or click Google's auto-connect instead) | 3 min |
| G4 | Per-item "go" on each DNS mutation Claude proposes | seconds each |
| G5 | GAM: 2 OAuth consent screens | 2 min |
| G6 | YubiKey 2SV enrollment + `cb` arm (PIN + physical touch) for any console driving | 3 min |

Total operator time ≈ **20–25 min**, in two sittings (G1–G3, then G4–G6). A zero-touch setup is
not possible: Google account creation, payment, ToS, OAuth grants, and YubiKey ceremonies are
structurally operator-side. Everything between the gates is scripted/driven by Claude.
