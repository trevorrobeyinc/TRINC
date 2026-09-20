# S24 — personal-profile → work-profile app migration plan (2026-09-17)

> **Status: v0.3 — 2026-09-18 02:47 PDT. Round 1 APPLIED end to end on the console side: all 14 §3.1 apps added (09-17 23:32 → 09-18 00:01) and switched to FORCE INSTALL (09-18 ≈02:35–02:45, each fresh-load verified); TikTok (§3.7, operator's decision) added and Force install; M14 applied to Facebook/Messenger/Instagram/TikTok; WireGuard's work-store entry deleted (§3.0). **09-18 ≈04:55: Varo (§3.3, operator's decision) added as Force install; ≈05:1x Google Gemini added, then Force install; the Gemini app does not run in an Android work profile (its own message), so its store entry was deleted ≈14:2x and Gemini is used through the work-profile Chrome instead; ≈17:50 PingID (§3.4, round 2 MFA) added as Force install; ≈18:15 Microsoft SwiftKey added as Force install; ≈18:20 Google Keep switched Available → Force install; ≈18:45 Propel (§3.3, operator's decision) added as Force install; ≈18:52 Amazon Shopping re-added work-side as Force install; ≈19:12–19:15 YouTube and YouTube Music added as Force install; ≈19:26–19:28 Google Clock and Google Maps added as Force install — all of this batch confirmed on the device by ≈19:29 (410 packages); ≈19:43 the Google app (already a preload in the work profile) added as Force install; ≈19:55–20:00 Google Wallet and Google Photos added as Force install; ≈20:10–20:45 audit fixes A1–A3 applied (Docs/Sheets/Slides/Chat/Meet + Calendar/Chrome/Facebook/Messenger/Firewalla → Force install; Google Calculator added) and **uninstall prevention ON for every store app** — store = 45 apps, all Force install + uninstall prevention ON, each verified from a fresh load (see §5.1).** Next: the operator checks each app work-side, removes the personal copies, and one Falcon arm proves the `AppUninstalled` events. Every app in the work profile runs through Falcon's always-on VPN — an app that needs inbound LAN traffic (Netflix casting is the likely one) may need adding to *Apps bypassing VPN*.**
> Business platform record. It names the operator's personal apps because he authorized a one-time Falcon
> read of the personal-side inventory for exactly this purpose ("use falcon to probe the current apps i have
> in my personal profile"). Per standing decision 4 the names live ONLY here and in the matrix's migration
> log (row M2b) — never in `~/Security Everything`, alertdesk, IOCs or proposals. **This file is in the
> private monorepo; if the operator would rather not have his banking / health / benefits app names in git,
> say so and the list moves out of the repo.**

## 1 · Where the baseline came from (read-only, one Falcon session, ≈18:00 PDT)

- **Personal-side sensor** `cdf05db4` (aid `c6e37c63…540c`): `MobileAppIdentifiers` rows since 2026-09-16 —
  installer breakdown **Play 38 apps · Samsung preload (OMC agent) 12 · Galaxy Store 1 · T-Mobile 3 ·
  System 493**; no rows without installer info, i.e. **nothing sideloaded**. The latest full snapshot is the
  daily one at 2026-09-16 ≈18:25 PDT; later rows are install/update events.
- **`AppUninstalled` on the personal side since 09-16 (8):** Facebook 21:25 · Messenger 21:25 · Meta
  Attribution 21:53 · WireGuard 22:59 · Roku 23:00 (all 09-16) · Tubi 09-17 04:03 · **Firewalla 09-17 17:59 ·
  Amazon Shopping 09-17 18:00** (the operator was removing by hand while this was written).
- **Work-side sensor** `7cf52885` (aid `daa44247…d91c`): 13 non-System apps installed — Android System Key
  Verifier · SafetyCore · Authenticator · Bitwarden · Calendar · CrowdStrike · Device Policy · Drive ·
  Facebook · **Firewalla (installed 17:36 PDT, i.e. BEFORE the personal copy was removed — correct order)** ·
  Messenger · Roku · WireGuard. Gmail/Chrome/Docs etc. run as the work profile's own system copies and do not
  appear as installs. Zero `AppUninstalled` events on the work side.
- **Managed store** (Admin console, fresh load 17:12 PDT): 18 apps, 7 Force install, uninstall prevention on
  WireGuard + Roku; store = *Only allowed apps* (M3), so **every app to migrate must be added to the store
  first.**

## 2 · The loop, per app (what each step is and who does it)

| # | Step | Who | Proof |
|---|---|---|---|
| 1 | Add the app to the managed store (Available unless "force install" is asked) | Claude, on a named instruction, one `cic` arm per batch | fresh `/ac/apps/unified` count + the app's settings page |
| 2 | Install it from the **work-profile** Play Store; sign in / re-pair / transfer data; check it works | operator | the app opens and works in the work profile |
| 3 | Uninstall the personal copy | operator (neither Google's console nor Falcon can touch the personal side) | Falcon `AppUninstalled` on `cdf05db4`; the next 18:25 PDT inventory no longer lists it |
| 4 | Record it here (§5 table) and in matrix row M2b | Claude | — |

Falcon **cannot** disable or remove anything, and it emits **no event for "disabled"** — a disabled
preload still appears in the inventory. Only uninstalls are provable.

## 3 · Buckets — every non-System app on the personal side, with a recommended action

**Legend:** MOVE = add to store, install work-side, remove personal copy · KEEP = stays on the personal side
· DECIDE = operator's call, recommendation given · REMOVE = uninstall, do not move.

### 3.0 Already done (operator, 09-16/17)
Facebook, Messenger, Roku, Firewalla — **moved** (present work-side). Tubi, Amazon
Shopping, Meta Attribution — **removed**, not moved. **WireGuard — REVERSED, now KEEP-personal:** moved
work-side 09-16, moved back to the personal side ≈19:1x PDT 09-17 so Falcon could take the work profile's
VPN slot (it holds the personal VPN slot, Firewalla client "Personal VPN" `.2`); its work-store entry was
**DELETED 2026-09-18 ≈02:3x PDT** on the operator's instruction ("remove wireguard since i have it for my
personal profile now") — fresh `/ac/apps/unified` Apps (33) → (32), no WireGuard row.

### 3.1 MOVE — ordinary apps that work anywhere (round 1)
| App | Package | Note |
|---|---|---|
| LinkedIn | `com.linkedin.android` | business use anyway |
| LinkedIn Learning | `com.linkedin.android.learning` | — |
| Zoho Mail | `com.zoho.mail` | business mail → belongs in the work profile |
| Outlook | `com.microsoft.office.outlook` | school mail (Strayer) — fine in the work profile |
| Netflix | `com.netflix.mediaclient` | DRM works in work profiles |
| Shazam | `com.shazam.android` | — |
| Walmart | `com.walmart.android` | — |
| DoorDash | `com.dd.doordash` | — |
| CVS Health | `com.cvs.launchers.cvs` | health-adjacent; contents stay inside the app's own login |
| Xfinity | `com.xfinity.digitalhome` | — |
| QR & Barcode Scanner | `com.gamma.scan` | needs the camera — allowed (B3) |
| Teleprompter | `com.biff.float.teleprompter.prompt.script` | — |
| Yubico Authenticator | `com.yubico.yubioath` | stateless (reads the YubiKey over NFC/USB) — install work-side, remove personal |
| Instagram | `com.instagram.android` | Meta app — gets the **M14** runtime-permission treatment (Contacts + Files = Deny) together with Facebook/Messenger |

### 3.2 DECIDE — tied to the personal Google Account (the app is not the problem; the account is)
| App | Package | Recommendation |
|---|---|---|
| Photos | `com.google.android.apps.photos` | **KEEP personal.** The work-profile copy would show trevor@'s (empty) library; the personal library cannot be moved into a Workspace account except by export + re-upload. — **09-18 ≈20:00: a work-side copy ALSO added (Force install) on the operator's instruction, told first that it opens trevor@'s empty library and that work-profile photos back up to the business account; the personal copy keeps the personal library (see §5).** |
| YouTube Music | `com.google.android.apps.youtube.music` | **KEEP personal** — subscription and library are on the personal account. — **09-18 ≈19:15: a work-side copy ALSO added (Force install) on the operator's instruction, told first that it signs in as trevor@ only (D4 blocks personal accounts in the work profile), so it has neither the personal Premium nor the library; the personal copy stays for those (see §5).** |
| Google Wallet | `com.google.android.apps.walletnfcrel` | **KEEP personal** — tap-to-pay and the saved cards are personal; NFC payment from a work profile is not something to rely on. — **09-18 ≈19:55: a work-side copy ALSO added (Force install) on the operator's instruction, told first that payments may be restricted for a Workspace account and the work copy may serve passes/tickets only; the personal Wallet keeps the cards and tap-to-pay (see §5).** |
| Google Calendar / Drive | `com.google.android.calendar` / `…apps.docs` | Work copies already exist under trevor@. Keep the personal copies only if the personal calendar/files must stay reachable on the phone; otherwise remove them last. |
| *(the alternative for all four)* | — | a secondary, unmanaged personal account inside the work profile would need the D4 block lifted (would be proposal **M16**, not raised) and puts personal-account data under the work profile's wipe rules. Not recommended. |

### 3.3 DECIDE — money, identity, benefits
| App | Package | Recommendation |
|---|---|---|
| Cash App | `com.squareup.cash` | **KEEP personal** (or move knowingly: under M5/M7 a work-profile wipe takes the session and local data) |
| Varo | `com.varomoney.bank` | **KEEP personal**, same reason — **superseded 09-18 ≈04:55: MOVED by the operator's decision, Force install (see §5)** |
| Propel | `com.propel.ebenefits` | **KEEP personal**, same reason — **superseded 09-18 ≈18:45: MOVED by the operator's decision ("download the propel app"), Force install (see §5)** |
| Samsung Wallet | `com.samsung.android.spay` (preload) | **KEEP** if used for tap-to-pay; it cannot be moved |

### 3.4 Security, MFA, management — handle with care
| App | Package | Action |
|---|---|---|
| CrowdStrike | `com.crowdstrike.falconmobile` | **KEEP — never remove.** This is the personal-side sensor (`cdf05db4`); the work profile has its own (`7cf52885`). |
| Device Policy | `com.google.android.apps.work.clouddpc` | **KEEP — never remove.** This is the work profile's management agent; removing it removes the work profile. |
| Android System Key Verifier · SafetyCore | `com.google.android.contactkeys` · `…safetycore` | **KEEP** — Google system components delivered via Play; the work side has its own. |
| Google Authenticator | `com.google.android.apps.authenticator2` | Work copy is already installed. **Re-enroll each site in the work-side copy** (cleanest; consider moving TOTP into Bitwarden or the YubiKey while at it). The app's transfer QR cannot be scanned by the same phone; the shortcut is to photograph it with the Mac, show it on the Mac screen, scan with the work-side app. Remove the personal copy only after every code works work-side. |
| PingID | `prod.com.pingidentity.pingid` | MFA bound to an identity provider (most likely the school). **KEEP until re-enrolled**: add to the store, enroll the work-side copy with the IdP, verify a sign-in, then remove the personal copy. **Step 1 done 09-18 ≈17:50 — in the store as Force install (see §5).** |
| Bitwarden | `com.x8bit.bitwarden` | Work copy installed and set as the work profile's password manager. **Keep the personal copy until the personal side has no logins left; remove it last.** |
| Intercept X (Sophos) | `com.sophos.smsec` | **DECIDE** — a second security product on the personal side. If it is not required by a school or employer, **REMOVE** (two AV agents on one side buy nothing); if it is required, keep it personal-side only. |

### 3.5 Keyboard and shared input
| App | Package | Action |
|---|---|---|
| Microsoft SwiftKey | `com.touchtype.swiftkey` | **KEEP personal.** Keyboards installed on the personal side are offered to the work profile by Android; no move needed. (Add to the store only if the work profile refuses it.) — **superseded 09-18 ≈18:15: a work-side copy added as Force install on the operator's instruction (keeps work typing and what the keyboard learns from it inside the work profile); see §5.** |

### 3.6 Samsung / T-Mobile preloads — the "settings apps"
These are OEM/carrier preloads. **They cannot be moved**: the work profile already carries its own copies of
every system app Google allows (the 377-package read of 09-16). On the personal side they can only be
disabled or, for some, uninstalled by hand in Settings → Apps; Falcon proves only the uninstalls.

| App | Package | Recommendation |
|---|---|---|
| T-Mobile Diagnostics | `com.tmobile.echolocate` | **disable** (carrier telemetry) |
| Samsung Kids | `com.sec.android.app.kidshome` | **uninstall/disable** if unused |
| Samsung News | `com.samsung.android.app.spage` | **uninstall/disable** if unused |
| SmartThings | `com.samsung.android.oneconnect` | **disable** unless it controls something |
| Samsung Notes · Reminder · Samsung Calendar | `…app.notes` · `…app.reminder` · `…android.calendar` | **decide** — duplicates of Keep/Calendar; disable if unused |
| Clock · Calculator · language packs · on-device resources | `com.sec.android.app.clockpackage` · `…popupcalculator` · `…nmt.apps.t2t…` · `…bixby.ondevice.*` | **keep** (basic, harmless) |

### 3.7 REMOVE — contradicts the operator's own posture
| App | Package | Why |
|---|---|---|
| TikTok | `com.zhiliaoapp.musically` | The TikTok PWA and all its data were deliberately purged from the Mac on 2026-07-19. Moving it INTO the container that holds business Gmail/Drive goes the other way. Recommendation: uninstall, don't migrate. Operator's call. **DECIDED 2026-09-18 00:1x PDT: MOVE** — the operator named it ("put tiktok on there next"); added to the store as Available. Mitigation offered: the M14 runtime-permission denial (Contacts + Files/Storage). |

## 4 · Order of work

1. **Round 1 — store adds (Claude, one cic arm, ≈1 min per app):** the §3.1 list, on the operator's named
   instruction (trim it as he likes). Then he installs each from the work Play Store, signs in, removes the
   personal copy. Instagram gets M14 when M14 is confirmed.
2. **Round 2 — MFA:** PingID (add → enroll work-side → verify → remove personal) and Google Authenticator
   (re-enroll work-side → remove personal). Bitwarden personal copy last of all.
3. **Round 3 — decisions:** §3.2 Google-account apps, §3.3 money apps, Intercept X, TikTok, the preloads.
4. **Done looks like:** the personal side holds only system packages + CrowdStrike + Device Policy + the two
   Google system components + the keyboard + whatever the operator chose to keep in §3.2/3.3. Falcon's Play
   count on `cdf05db4` drops from 38 to roughly 8–12, and every removal has an `AppUninstalled` event.

## 5 · Tracking (update per app; Falcon columns are proof, not intent)

| App | Bucket | Store (date) | Work-side installed (Falcon) | Personal removed (Falcon) |
|---|---|---|---|---|
| Facebook | done | 09-16 21:15 Available | 09-16 | 09-16 21:25 |
| Messenger | done | 09-16 21:26 Available | 09-16 | 09-16 21:25 |
| Roku | done | 09-16 22:49 Force | 09-16 | 09-16 23:00 |
| WireGuard | **reversed → KEEP-personal** | 09-16 22:52 Force → (operator, 09-17) Available → **store entry DELETED 09-18 ≈02:3x** | 09-16 (work copy removed by the operator 09-17 ≈19:1x) | 09-16 22:59 (then reinstalled personal-side 09-17) |
| Firewalla | done | 09-17 17:12 Available | 09-17 17:36 | 09-17 17:59 |
| Tubi · Amazon Shopping · Meta Attribution | removed, not moved (Amazon Shopping later re-added work-side 09-18 — see its own row) | — | — | 09-17 04:03 · 09-17 18:00 · 09-16 21:53 |
| LinkedIn | 3.1 | 09-17 23:36 Available → **09-18 02:4x Force install** (fresh-load verified) | — | — |
| LinkedIn Learning | 3.1 | 09-17 23:4x Available → **09-18 02:4x Force install** (fresh-load verified) | — | — |
| Zoho Mail | 3.1 | 09-17 23:4x Available → **09-18 02:4x Force install** (fresh-load verified) | — | — |
| Outlook | 3.1 | 09-17 23:4x Available (first save eaten by a passkey re-auth; re-added) → **09-18 02:4x Force install** (fresh-load verified) | — | — |
| Netflix | 3.1 | 09-17 23:4x Available → **09-18 02:4x Force install** (fresh-load verified) | — | — |
| Shazam | 3.1 | 09-17 23:5x Available → **09-18 02:4x Force install** (fresh-load verified) | — | — |
| Walmart | 3.1 | 09-17 23:5x Available → **09-18 02:4x Force install** (fresh-load verified) | — | — |
| DoorDash | 3.1 | 09-17 23:5x Available → **09-18 02:4x Force install** (fresh-load verified) | — | — |
| CVS Health | 3.1 | 09-17 23:5x Available → **09-18 02:4x Force install** (fresh-load verified) | — | — |
| Xfinity | 3.1 | 09-17 23:5x Available → **09-18 02:4x Force install** (fresh-load verified) | — | — |
| QR & Barcode Scanner | 3.1 | 09-17 23:5x Available → **09-18 02:4x Force install** (fresh-load verified) | — | — |
| Teleprompter (listing "Teleprompter for Video Scripts") | 3.1 | 09-18 00:0x Available → **09-18 02:4x Force install** (fresh-load verified) | — | — |
| Yubico Authenticator | 3.1 | 09-18 00:0x Available → **09-18 02:4x Force install** (fresh-load verified) | — | — |
| Instagram | 3.1 | 09-18 00:01 Available — M14 applied (Contacts + External storage = Deny) → **09-18 02:4x Force install** (fresh-load verified) | — | — |
| Varo | 3.3 → MOVE by operator decision ("add my varo bank to my work profile … and then install it for me"), overriding the KEEP-personal recommendation knowingly | **09-18 ≈04:55 Force install** (`com.varomoney.bank`; the search's second row, "Varo Bank UAT" = `com.varomoney.bank.uat`, is a test build and was excluded by the package guard; one cb arm 04:50; All users → Force install · uninstall prevention OFF · widgets ON · always-on VPN OFF; verified from the saved settings page and the store list: Apps (32) → **(33)**, one Varo row). Caution stands: a work-profile wipe (M5/M7) takes the Varo session and local data | — | — |
| Google Gemini | not in the plan — new work-side add on the operator's instruction ("add 'gemini' app") | **09-18 ≈05:2x Available** (`com.google.android.apps.bard`; the search also returned Gemini Enterprise `com.google.android.apps.agentspace` — a separate paid product — and Gemini on Wear OS `com.google.android.wearable.assistant`, both excluded by the package guard); All users · Available · uninstall prevention OFF · widgets ON · always-on VPN OFF, read back from the saved settings page; store **Apps (33) → (34)**. Tenant side already allows it: Generative AI → Gemini app = ON for everyone, "regardless of license". → **≈05:1x Force install** (operator: "force install gemini"; fresh-load verified Force install · uninstall prevention OFF · widgets ON · always-on VPN OFF). **Then the app itself refused:** "the Gemini mobile app currently isn't supported by Android work profile" (operator, 09-18) — so the forced install parks a non-working app in the work profile; the working path is gemini.google.com in the work-profile Chrome under trevor@. **Store entry DELETED 09-18 ≈14:2x** (operator "apply … G6"; dialog named Google Gemini; fresh `/ac/apps/unified` **Apps (34) → (33)**, no Gemini row, Varo intact). **CORRECTION 09-18 ≈17:55: deleting the store entry does NOT uninstall the app** — the console's own M3 panel note says "Installed apps not in the app list stay on devices", and the device's Installed-apps list (synced < 1 h) still shows **Gemini 1.0.971139365** in the work profile (the earlier "leaves the work profile at the next sync" was wrong). There is no admin-side uninstall (Access method offers only Available / Force install); the operator removes it on the phone — long-press the briefcase Gemini icon → App info → Uninstall (or Disable, if Samsung's preload offers only that); uninstall is allowed because it is no longer forced. Same batch hardened Gemini web: Avatar OFF (G2), Gem sharing OFF (G4), Safe Browsing locked on for Chrome incl. Android (R2), CAA Monitor on the Gemini app (R1) — see the Android matrix "CAA on Android" row | — | n/a |
| PingID | 3.4 — round 2 (MFA), on the operator's instruction ("add 'ping ID' and install it") | **09-18 ≈17:50 Force install** (`prod.com.pingidentity.pingid`; the search returned exactly one row, package confirmed before Select by the `window.open` capture; All users · Force install · uninstall prevention OFF · widgets ON · always-on VPN OFF · managed configuration Default, read back from the saved settings page; store **Apps (33) → (34)**, one PingID row). **The FINISH click was the operator's own** — the auto-mode classifier refused Claude's click as a "[Permission Grant]"; the wizard stayed open with every choice set and he pressed it in the pane. **Installed on the device already — PingID 3.8.1(13972) in the work profile's Installed-apps list at ≈17:55 (402 packages).** Next (§3.4): enroll the work-side copy with the IdP, verify a sign-in, then remove the personal copy | 09-18 ≈17:55 (Google device inventory) | — |
| Microsoft SwiftKey | 3.5 → work-side copy by operator decision ("download and install microsoft swiftkey keyboard app") | **09-18 ≈18:15 Force install** (`com.touchtype.swiftkey`, listing "Microsoft SwiftKey AI Keyboard"; the search's second row "Microsoft SwiftKey Beta" `com.touchtype.swiftkey.beta` excluded by the package guard); All users · Force install · uninstall prevention OFF · widgets ON · always-on VPN OFF, read back from the saved settings page; store **Apps (34) → (35)**. FINISH pressed by the operator (Claude left it to him after the PingID classifier refusal). **Installed: SwiftKey 9.13.14.5 in the work profile's Installed-apps list at ≈18:17 (403 packages).** The personal copy stays (§3.5) unless he decides otherwise | 09-18 ≈18:17 (Google device inventory) | — |
| Google Keep | not in the plan — the operator asked for "a notes app"; Keep chosen because it is already in the store (M2, Available since 09-16) and signs in with trevor@ under Workspace terms (Samsung Notes / OneNote would sync to personal Samsung / Microsoft accounts) | **09-18 ≈18:20 Available → Force install** (`com.google.android.keep`; Access-method option picked by ref, guarded save on Force install / OFF / ON / OFF + "2 unsaved changes", toast "Settings for … updated", fresh-load verified; the classifier did NOT object to this settings-page save). No notes app was installed in the work profile before (403-package read ≈18:17). **Installed: Keep Notes 5.26.365.00.90 in the work profile at ≈18:47** | 09-18 ≈18:47 (Google device inventory) | n/a |
| Propel | 3.3 → MOVE by operator decision ("download the propel app"), overriding the KEEP-personal recommendation knowingly | **09-18 ≈18:45 Force install** (`com.propel.ebenefits`, listing "Propel EBT & SNAP Benefits"; the search returned six rows — the other five are unrelated apps: Propel Tracker, Propel Swim Academy, Propell, Propeller Mobile, "Propel: ADHD Games" — excluded by the package guard); All users · Force install · uninstall prevention OFF · widgets ON · always-on VPN OFF, read back from the saved settings page; store **Apps (35) → (36)**. FINISH pressed by the operator. **Installed: Propel 9.2.0 in the work profile at ≈18:47 (405 packages).** Caution stands: a work-profile wipe (M5/M7) takes the Propel session and local data | 09-18 ≈18:47 (Google device inventory) | — |
| Amazon Shopping | re-added work-side by operator decision ("download amazon next"; he had removed the personal copy 09-17 18:00 without moving it) | **09-18 ≈18:52 Force install** (`com.amazon.mShop.android.shopping`; the search returned exactly one row, package confirmed before Select); All users · Force install · uninstall prevention OFF · widgets ON · always-on VPN OFF, read back from the saved settings page; store **Apps (36) → (37)**. A Google sign-in challenge interrupted the session first — the operator signed in himself in the pane. FINISH pressed by the operator. Not yet in the work-profile inventory at ≈18:53 (still 405 packages; `com.amazon.appmanager` "Mobile Device Information Provider" is a carrier preload, not this app) — the device's last check-in was 18:46, before the add, and the console has no "sync now" (its device menu offers only Wipe account / Delete device / View audit info), so the operator installed it from the work Play Store. **Installed: Amazon Shopping 32.17.0.100 in the work profile by ≈19:07 (406 packages)** | 09-18 ≈19:07 (Google device inventory) | n/a (no personal copy) |
| YouTube | not in the plan — work-side add on the operator's instruction ("download youtube and youtube music") | **09-18 ≈19:12 Force install** (`com.google.android.youtube`; the search returned ten rows including THREE named "YouTube" — the phone app, `…apps.automotive.youtube` and `…apps.youtube.xr` — so the package guard picked by package, not name); All users · Force install · uninstall prevention OFF · widgets ON · always-on VPN OFF, read back; store **Apps (37) → (38)**; the tenant's *YouTube* additional service is ON for everyone. FINISH pressed by the operator. **Installed: YouTube 21.35.447 in the work profile by ≈19:16 (407 packages).** Signs in as trevor@ — personal subscriptions/history stay on the personal copy | 09-18 ≈19:16 (Google device inventory) | — |
| YouTube Music | 3.2 → work-side copy ALSO, by operator decision (see §3.2 note) | **09-18 ≈19:15 Force install** (`com.google.android.apps.youtube.music`; two listings are named "YouTube Music" — the other is the TV app `com.google.android.youtube.tvmusic` — and "YouTube Music for Chromebook" `…music.pwa` was the third; package guard picked the phone app); All users · Force install · uninstall prevention OFF · widgets ON · always-on VPN OFF, read back; store **Apps (38) → (39)**. FINISH pressed by the operator. Not yet on the device at ≈19:16; **installed: YouTube Music 9.37.54 in the work profile by ≈19:29 (410 packages)** | 09-18 ≈19:29 (Google device inventory) | — (personal copy stays) |
| Clock (Google) | not in the plan — work-side add on the operator's instruction ("add maps and clock" → "just do google clock") | **09-18 ≈19:26 Force install** (`com.google.android.deskclock`; the search returned three listings named just "Clock" — Samsung `com.sec.android.app.clockpackage`, Google, ColorOS `com.coloros.alarmclock` — package guard picked Google's; the first query "Clock Google" returned nothing, "Clock" worked); All users · Force install · uninstall prevention OFF · widgets ON · always-on VPN OFF, read back; store **Apps (39) → (40)**. FINISH pressed by the operator. **Installed: Clock 9.1 in the work profile by ≈19:29** | 09-18 ≈19:29 (Google device inventory) | n/a |
| Google Maps | not in the plan — work-side add on the operator's instruction ("add maps and clock") | **09-18 ≈19:28 Force install** (`com.google.android.apps.maps`; "Google Maps Go" `…apps.mapslite` excluded); All users · Force install · uninstall prevention OFF · widgets ON · always-on VPN OFF, read back; store **Apps (40) → (41)**. FINISH pressed by the operator. **Installed: Maps 26.37.05 in the work profile by ≈19:29.** Signs in as trevor@ — saved places on the personal account stay with the personal copy | 09-18 ≈19:29 (Google device inventory) | — (personal copy stays) |
| Google (the Google app) | not in the plan — work-side add on the operator's instruction ("next add the google app") | **09-18 ≈19:43 Force install** (`com.google.android.googlequicksearchbox`; the "Google" search's first row, package confirmed before Select — Google Go `…apps.searchlite` and the other Google apps in the results excluded); All users · Force install · uninstall prevention OFF · widgets ON · always-on VPN OFF, read back; store **Apps (41) → (42)**. FINISH pressed by the operator. **Already present in the work profile as a Samsung/Google preload** — Google 17.58.16 in the inventory with the package count unchanged at 410 — so the Force install makes it managed (kept enabled and updated through the work store) rather than adding a new package | 09-18 ≈19:44 (Google device inventory; preload) | n/a |
| Google Wallet | 3.2 → work-side copy ALSO, by operator decision (see §3.2 note) | **09-18 ≈19:55 Force install** (`com.google.android.apps.walletnfcrel`, one search row). The first FINISH was eaten by a Google re-verification (the wizard closed, store stayed at 42 — same trap as the 09-17 Outlook passkey re-auth); redone after the operator signed in. All users · Force install · uninstall prevention OFF · widgets ON · always-on VPN OFF, read back; store **Apps (42) → (43)**; tenant *Google Pay* service ON for everyone. **Present in the work profile by ≈20:04** | 09-18 ≈20:04 (Google device inventory) | — (personal Wallet stays) |
| Google Photos | 3.2 → work-side copy ALSO, by operator decision (see §3.2 note) | **09-18 ≈20:00 Force install** (`com.google.android.apps.photos`; "PhotoScan by Google Photos" excluded); All users · Force install · uninstall prevention OFF · widgets ON · always-on VPN OFF, read back; store **Apps (43) → (44)**; tenant *Google Photos* service ON for everyone. **Present in the work profile by ≈20:04** (411 packages — one of Wallet/Photos was a new install, the other a preload) | 09-18 ≈20:04 (Google device inventory) | — (personal Photos stays) |

### 5.1 · Work-profile audit, 2026-09-18 ≈20:04 (read-only; operator asked "make sure all of the system apps on work profile side are setup correctly")

The console can report which packages exist in the work profile (411) but **not whether a Samsung system app is enabled or what its permissions are**; it can manage only apps distributed through managed Play. Findings:

- **Store vs device:** 39 of the 44 store apps are installed. **Not installed: Google Docs, Sheets, Slides, Chat, Meet** — the five M2 apps that are still *Available* and were never installed from the work Play Store.
- **Core system apps present work-side:** Play Store, Play services, Device Policy 166.38.0, Camera, Gallery, My Files, Files (DocumentsUI), Contacts (Samsung), Settings, Samsung Keyboard, System WebView, Package installer — plus Google Clock, Keep, Chrome, Calendar, Photos, Maps from the store.
- **Absent work-side (by design or covered):** Phone / Messages (telephony stays personal on a personally-owned phone); Samsung Calendar, Samsung Clock, Samsung Notes, Samsung Internet (Google Calendar, Clock, Keep and Chrome cover them); Gboard (SwiftKey + Samsung Keyboard present).
- **Gaps:** no **calculator** in the work profile (neither Samsung's nor Google's); **Gemini** still installed (store entry deleted; removal is the operator's on the phone).
- **Proposed:** (A1) switch Docs, Sheets, Slides, Chat, Meet to Force install; (A2) add Google Calculator (`com.google.android.calculator`) as Force install; (A3) switch the remaining *Available* store apps (Calendar, Chrome, Facebook, Messenger, Firewalla — per the records) to Force install for one uniform policy; (A4) operator-side: remove Gemini, and in the work profile set SwiftKey as the keyboard and Chrome as the browser if wanted.
- **APPLIED 2026-09-18 ≈20:10–20:45 on the operator's typed "apply A1 A2 A3 and make each app so no one can uninistall them for all of my apps":** (A1 + A3) the ten *Available* apps switched to **Force install**; (A2) Google Calculator added as Force install with uninstall prevention ON in the wizard (FINISH pressed by the operator; the search's "Calculator" rows include Samsung's `com.sec.android.app.popupcalculator` and several third-party apps — Google's picked by package); and **"Prevent users from uninstalling the app" = ON for ALL 45 store apps** (Roku and Varo were already ON). Method per app: settings page → snapshot of every listbox → one trusted click per dropdown + in-page option pick → save only if every value except Access method / uninstall prevention equals the snapshot → "Settings … updated". **Verified afterwards from fresh loads of all 45 settings pages: every app reads Force install · uninstall prevention ON**, widgets ON, always-on VPN OFF — except CrowdStrike Falcon (always-on VPN ON + managed configuration "Falcon work profile - enrollment and Roku bypass", unchanged) and Bitwarden (Android 15+ password-manager switch ON, unchanged); store **Apps (45)**. Consequence: no app in the work store can be uninstalled on the phone; removing one now starts with switching its uninstall prevention OFF (or deleting it) in the console. A4 remains the operator's.
| TikTok | 3.7 → MOVE by operator decision ("put tiktok on there next") | 09-18 00:1x Available (`com.zhiliaoapp.musically`; Apps (33)) — M14 applied by the operator (Contacts + Microphone + External storage = Deny) → **09-18 02:31 Force install** (operator's choice; uninstall prevention OFF, always-on VPN OFF; fresh-load verified) | — | — |
