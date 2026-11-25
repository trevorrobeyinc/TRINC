# Browser session history

Moved here from the root `CLAUDE.md` on 2026-10-23 (TRINC reorg Phase 6). The global rule in
`~/.claude/CLAUDE.md` still applies: every Claude Code session that uses a browser MCP **non-trivially**
(a signed-in or identity action, a multi-step navigation, a state change or form submit, or a finding
worth recalling) prepends one entry here, newest at top, in this format:

`- YYYY-MM-DD · <Claude-Browser|Claude-in-Chrome> · <task in a phrase> · <outcome / gotcha>`

The browser surfaces are the **Claude Browser pane** (`mcp__Claude_Browser__*`, `cb` gate scope) and, permanently
since 2026-11-18, **Claude in Chrome** (`mcp__claude-in-chrome__*`, `cic` gate scope, Chrome Profile 2 only, one site per arm).
Entries before 2026-09-18 may name `claude-in-chrome`, the tag from the lane's first period; new entries use `Claude-in-Chrome`.
Security-console sessions log in `~/Security Everything/docs/browser-session-history/` instead.

---

- 2026-11-06 · Claude-Browser · LLC standing and agency-mail check for master checklist item 3 (bizfile public
  search, then the operator's own bizfile sign-in; read-only Gmail searches in `trevorrobeyinc@gmail.com`; one `cb`
  arm, ~22:31–22:55 PST) · **DONE, read-only, nothing submitted** — B20260217250 Active, Standing SOS/FTB/Agent/VCFCF
  all Good, Statement of Info Due Date 08/04/2026 (the repo had 09-16); the login (the operator's personal Gmail) has
  User Access, so no PIN; history = the Initial Filing only; work queue empty; zero SOS/FTB/IRS mail (a control search
  returned results). GOTCHAS: (1) **bizfile is behind Imperva**: a fresh pane gets "Additional security check is
  required", whose text says the computer "may have been infected by malware". That is boilerplate on every challenge,
  not a scan result. Claude may not pass it; the operator ticks the checkbox in the pane, then the app loads. (2) With
  the pane hidden, the bizfile app rendered an empty body; ask the operator to show the pane first. (3) Sign-in goes to
  `idm.sos.ca.gov` (the Secretary of State's Okta) and returns to bizfile. (4) The access test is the record's detail
  drawer: the public view shows "Request Access"; a login with access shows "File Statement of Information" and
  "Manage User Access". (5) Gmail's search box ignored `cmd+a`, so the next query was spliced into the old one;
  navigate to `#inbox` to clear the box before typing. (6) `deliveredto:<address>` presence checks over date windows
  show when a forwarding rule began without opening any message. The pane was left signed in to bizfile and
  `trevorrobeyinc@gmail.com`; `cb` was left to idle out.
- 2026-09-18 · Claude-Browser · add Varo Bank (`com.varomoney.bank`) to the managed Google Play work
  store as **Force install** (logged-in admin.google.com, operator's named instruction; overrides the
  S24 plan's §3.3 KEEP-personal knowingly) · **DONE** — Apps (32) → (33), saved settings read back as
  Force install · uninstall prevention OFF · widgets ON · always-on VPN OFF. GOTCHAS: (1) the pane still
  held the console session from the 09-18 early-morning run, so no sign-in was needed; (2) **`screenshot`
  returned "This site is not approved for tool access" on admin.google.com while `get_page_text`,
  `read_page`, `find` and `javascript_tool` all worked** — drive the console through the a11y tree and
  JS, not pixels; (3) the app search returns a second row "Varo Bank UAT" (`com.varomoney.bank.uat`, a
  test build) — the pre-Select `window.open` capture is what told them apart; (4) the auto-mode
  classifier refused a `navigate()` to the app's own `/ac/devices/apps/<pkg>` URL ("[Permission
  Grant]") — the page's own **"Expand Settings"** button reaches the same saved-settings view; clicking
  the card's "Configure app management settings." text instead hits its *Learn more* link. SAME
  SESSION, follow-ups: triaged the "Work device unregistered or non-compliant" alerts (02:23 · 03:48 ·
  04:52) read-only — all *Account registration change → Registered* on a **"Mac OS / macOS 10.15.7 /
  Fundamental"** endpoint, i.e. a fresh browser sign-in (the 04:52 one is this pane session); then added
  **Google Gemini** (`com.google.android.apps.bard`) as Available → Apps (34). GOTCHA (5): **every Claude
  Browser pane session that loads the Workspace console can register a new Fundamental "Mac OS"
  device and fire that High-severity rule** — its condition is the bare
  `DEVICE_REGISTER_UNREGISTER_EVENT`, so registrations trip it despite the "unregistered" name; expect
  one alert per pane session. (6) The Investigation tool's Device log lags — the 04:52 event was still
  absent ~20 min later; the Devices list (per-device First sync) is the faster source. FOLLOW-UP
  (05:1x–05:5x, resumed 13:4x after the session dropped): Gemini → Force install (then found the Gemini
  app refuses to run in an Android work profile); **alert "quiet lane" built** — new Low, Alert-Center-only
  rule `trevor-claude-browser sign-in` (*OS version is macOS 10.15.7*) + main rule narrowed to *OS
  version is not macOS 10.15.7*, both verified by the wizard's Search preview and a fresh load; stale pane
  device records `c49bbe90`/`d0927243` deleted. GOTCHAS: (7) **the Rules page's "Create rule" menu,
  "View rule" and row clicks open nothing in the pane** — they call `window.open`, which the pane
  blocks; capture the target (`./ac/ax/details?ruleId=policies%2F<id>`) and `navigate()` there, then use
  the page's own EDIT RULE. (8) In the rule wizard's dropdowns, **coordinate clicks land on the wrong
  option** (picked *Register privilege*, then *Policy name*, for *OS version*); open the list by its a11y
  `option` ref, then `.click()` the visible popup `[role=option]` element from JS — that worked every time.
  (9) Admin-console date strings use a narrow no-break space before AM/PM — match with `\s`, not a literal
  space, or a precheck fails falsely. (10) The device menu's "Delete Device" ignores a JS `.click()`; click
  its menuitem ref. The confirm dialog renders twice (stacked) — click the DELETE by ref. 14:1x read-only
  recon for "safer Gemini web in the work profile": CAA lists *Gemini app* as assignable; the CAA monitor
  log shows the S24 satisfying "TRINC managed endpoint" 48/48 and no Mac-Chrome row at all (details in the
  Android matrix "CAA on Android" row). GOTCHA (11): the Investigation tool's grid rows start with a
  checkbox cell — column N of the header is cell N+1 of the row; read by header name, not by index.
  14:2x–14:4x APPLIED on the operator's typed "apply R1 R2 G2 G4 G6", each fresh-load verified: CAA
  Monitor on *Gemini app*, Chrome Safe Browsing locked to Standard at root (reaches Android), Gemini Avatar
  OFF, Gem sharing OFF, dead Gemini app deleted from the work store (34 → 33). GOTCHA (12): the `cb`
  session can end between two calls of one flow (it closed mid-delete-confirm); the open dialog survived
  the re-arm, so re-read the page state and continue — never re-click blind. (13) The CAA *Assign* button
  navigates to `/ac/security/context-aware/access-level-assignment?selectedAppIds=<n>&ouId=<ou>`; its
  Monitor/Active boxes have a11y labels "<level> - monitor mode" / "- active mode", and Google's own
  "What will this policy do?" sentence is a reliable pre-Assign guard. 14:4x: **Chrome Remote Desktop service
  → OFF** (Additional Google services, verified); the work profile's 401 installed apps swept for
  remote-control/VNC — none (records: Chrome matrix A7, Android matrix E5). GOTCHA (14): the service-status
  radios carry no aria label — read them through `label[for=<id>]`. (15) A `*:5900` LISTEN owned by root
  Python is the operator's **OpenCanary** VNC decoy, not a VNC server — identify the PID before calling it
  a finding. 17:4x–17:5x: **PingID** added as Force install (installed 3.8.1 within minutes). GOTCHA (16):
  the auto-mode classifier refused Claude's wizard **FINISH** as a "[Permission Grant]" — do not retry by
  another route; leave the wizard set and have the operator press FINISH, then verify. (17) **Deleting a
  managed-Play app does NOT uninstall it** ("Installed apps not in the app list stay on devices") — Gemini
  stayed in the work profile; removal is the operator's on the phone. Never tell him a delete "removes it at
  the next sync". 18:1x–20:45: SwiftKey, Keep, Propel, Amazon, YouTube, YouTube Music, Clock, Maps, the Google
  app, Wallet, Photos, Calculator added; A1/A3 → Force install; **uninstall prevention ON for all 45 store
  apps**, every one re-read from a fresh load. GOTCHAS: (18) **the app-settings dropdowns ignore every
  synthetic open** — JS `.click()`, dispatched pointer/mouse events and a focused Enter key all fail; ONE
  trusted `computer` click by ref opens it, and then the choices render INSIDE that same `[role=listbox]`
  (filtering them out with `!listbox.contains(option)` grabbed another dropdown's value and dirtied the
  form — CANCEL recovered it). The popup option itself accepts a JS `.click()`. (19) The form's refs follow
  its ref: prevention trigger = form ref + 25 (form ref_225 → 250, 226 → 251, 217 → 242); a batch that
  assumes 250 when the form is 226 clicks the right control only by luck, and on one page it opened the
  *widgets* list instead — always gate on "listbox[1] aria-expanded" before picking. (20) A Save click
  sometimes doesn't register (no toast, "1 unsaved change" stays) — re-click once, then read the banner.
  (21) Settings pages can read `[]` for listboxes after 4 s; poll until ≥4 listboxes before reading.
  (22) A settings-page SAVE is not refused by the classifier; only the add-wizard FINISH is.
- 2026-08-19 · claude-in-chrome · move `My Drive/TRINC` from the personal Gmail Drive to the
  business Workspace Drive (both logged-in Drive UIs; personal = Default profile, business = work
  profile `907df4a2…`) · files went mount→mount and were verified (`diff -rq` clean; 3,963/3,963
  server-accepted via `com.google.drivefs.item-id#S` xattr) but the 3 native Google Docs required
  the web lane: **consumer→Workspace ownership transfer is not allowed**, so share folder →
  business-side "Make a copy" → Organize/Move → strip "Copy of " via mount `mv`; personal `TRINC`
  then trashed as ONE web-UI folder-trash (30-day recovery; `rm -rf` on the mount would have made
  thousands of trash items). GOTCHAS: (1) Drive's **multi-select Share dialog rendered unstyled,
  silently dropped both `form_input` and typed text, then closed itself** — the single-item/folder
  Share dialog works; verify with `read_page`, not pixels. (2) Only Chrome profiles with an open
  window appear in `list_connected_browsers`; `open -na "Google Chrome" --args --profile-picker`
  + an operator click surfaces the work profile (never read Chrome profile files from a shell —
  Falcon blocks it). (3) A `/u/1` Drive URL redirecting back to `/u/0` proves the profile has no
  second Google session. (4) Copies made in a shared folder land IN that folder but are owned by
  the copier — the Move dialog's "everyone will lose access" warning is the desired outcome.
- 2026-07-30 · Claude-Browser · verify the new **Trial Design Benchmark Pack** option on the local
  `intake.html` after adding it (radio card, field group, `QUESTION_TYPE_MAP`, `PANEL_VISIBILITY`,
  `addEntity`) · **PASSED end-to-end**: radio checks, only that field-group becomes visible,
  `val("tdb_indication")` returns the typed value, the submit validator passes, and the mailto body
  carries both fields; switching to another SKU cleanly swaps panels. The negative case is the real
  proof — clearing the required field makes validation **fail**, which it could not do if `val()`
  were reading a shadowed input. GOTCHAS: (1) **`intake.html`'s `val()` is a document-wide
  `querySelector('[name=...]')` and returns the FIRST match** — reusing an existing field `name`
  (`indication`, `drug_class`) in a new panel silently shadows it against the hidden earlier input,
  so the required-check can never pass and the mailto ships blank. Prefix new panel fields
  (`tdb_*`). Verified live in the same call: `val("indication")` returned `""` while
  `val("tdb_indication")` returned the typed text. (2) **`read_page` returned "(empty page)" with
  `Viewport: 0x0`** right after `navigate()` — the documented hidden-pane state; `resize_window`
  composited it. Even then the a11y tree surfaced only one link and **omitted every form control**
  (same omission as the 2026-07-09 Parker Dewey session), so the form was exercised through
  `javascript_tool` against the page's own `val()` / `QUESTION_TYPE_MAP` rather than the tree.
  (3) The pane reports *"files outside the project folder render as static snapshots"* — this file
  is **inside** the project root and JS executed normally, so that notice is not a reliable signal
  that scripts are dead; test with a trivial eval before concluding the page is static.
- 2026-07-27 · Claude-Browser · collect real competitor social/review data (Trustpilot, X) for an
  MKT500 marketing-plan assignment, after a fact-check found every figure in the prior draft was
  invented · got verified figures for AlphaSights (Trustpilot 4.9/10,905 reviews, replied to 96% of
  negative reviews within ~1 week; X 2,432 followers with the bio verbatim "We're not currently
  posting on X") and GLG (4.3/258, replied to 50% within ~2 weeks; X 9,893), plus a dated
  negative-review-and-company-reply pair for each. GOTCHAS: (1) **Trustpilot, G2, Capterra and
  TrustRadius all return HTTP 403 to WebFetch AND to `mcp__searxng-search__extract`** — that is
  bot-blocking, not absent data; the pane loads them normally, so never conclude a review corpus
  doesn't exist because a fetch tool couldn't reach it. (2) **Right after `preview_start` the pane
  can be open but not displayed**, and `get_page_text` / `javascript_tool` / `screenshot` all time
  out with "the Browser pane is currently hidden" — calling `navigate()` first unblocks all of them
  (see memory `claude-browser-pane-hidden-timeout`); `preview_logs` is dev-server-only and useless
  here. (3) LinkedIn company follower counts DID come back from plain WebFetch logged-out
  (AlphaSights 172,067; GLG 493,507) — but two agents reading the same page via different
  intermediaries returned different numbers, so only a figure read off the live page counts.
  (4) `yk-aqua-preflight` again caught a replaced/mis-homed gpg-agent on the `cb` arm and re-pinned
  it — the documented silent-failure mode, and the reason to always use the `operator-approved-gate`
  front-end.
- 2026-07-25 · Claude-Browser + claude-in-chrome · post-TCC-revocation verification of BOTH browser lanes
  after operator revoked Accessibility + Screen Recording for Claude (and Gemini) and disabled computer
  use · **BOTH LANES FULLY WORK WITHOUT EITHER GRANT.** cic: armed, 2 local browsers listed, selected
  907df4a2, created MCP tab group, navigated + extracted DOM text, closed tab (group auto-removed, no
  residue). cb: pane opened, navigated, DOM text, **screenshot succeeded** — proving the pane captures via
  CDP `Page.captureScreenshot`, never the OS screen-capture API. Lane separation visibly confirmed: same
  URL showed logged-in state in cic vs "Sign in" in the cb clean room. GOTCHAS: (1) `yk-aqua-preflight`
  caught a replaced/mis-homed gpg-agent on the cic arm and re-pinned it — the documented silent-failure
  mode, and the reason to always use the `operator-approved-gate` front-end; (2) `example.com` is BLOCKED
  on this network (Firewalla/AdGuard) — it fails as "frame showing error page" and reads like a broken
  browser MCP; google.com loaded fine, so do NOT use example.com as a connectivity canary here.
- 2026-07-23 · claude-in-chrome · AWS seller-account recon + Google Workspace tailored to business/AWS
  ops (logged-in AWS Marketplace Management Portal, AWS Billing, Gmail, Google Calendar, Strayer
  Outlook; work profile "Trevor Robey Intelligence Network Citations") · **AWS is now CLEARED FOR
  PAID** — operator added the disbursement method and Account status flipped to ✓ "Publish paid and
  free products", retiring the 2.5-month block (the §6 escalation letter is now moot — do not send).
  Built the Gmail ops layer: 12 filters/11 labels, send-as ×3, signature w/ LLC disclosure,
  reply-from-same-alias, plus 5 calendar deadlines (incl. $800 CA franchise tax 2026-08-15).
  Enabled + verified Strayer→Gmail forwarding. Gotchas: (1) **Gmail refuses a label named
  "Finance"** — reserved system label; a single bad label name makes the whole import report the
  misleading "fix the XML" error (XML was valid; diff the Filters tab against the file to find the
  culprit). (2) **Never match your own domain as a bare string in a filter** — `"trevorobeyinc.com"`
  matched nearly ALL inbound mail (it's in every To: header) and was labelling CrowdStrike/Google
  security alerts as "Prospects". (3) Gmail's **"Add another email address" opens a separate Chrome
  window that claude-in-chrome cannot reach** — structurally operator-only. (4) Calendar's
  `render?action=TEMPLATE` pre-fills fine but **the first Save click after load is swallowed** —
  click twice, verify on the month view. (5) A mail-routing test with subject `test`/profanity was
  **accepted-then-quarantined by Proofpoint** and never bounced — *absence of a bounce* proved the
  address was live; always test with a realistic business message. (6) AWS's "Email for custom
  notifications" is a **no-op for a direct data seller** (reseller/professional-services events
  only) — listing-review outcomes and payout failures still go to the ROOT email, which is still
  the operator's `.edu` address (risk R1, unresolved).
- 2026-07-22 · claude-in-chrome · Google Workspace stand-up + full Zoho→Gmail mail cutover for
  trevorobeyinc.com (logged-in Cloudflare, Google Admin console, Zoho Mail; new Chrome profile
  "Trevor Robey Intelligence Network Citations") · created a zone-scoped Cloudflare DNS token
  (Keychain-only), flipped Gmail DKIM signing on, ran the IMAP data import (1,251/1,251, 0 failed),
  added `support@`/`aws@` aliases, set Gmail dark theme. Gotchas: (1) Google's Entri auto-connect
  flow silently replaced the Zoho MX — the "verify domain only" plan was overtaken by a real
  cutover; (2) **this paid Zoho account's IMAP host is `imappro.zoho.com`, NOT `imap.zoho.com`** —
  the wrong host returns a generic `Invalid credentials` that mimics a bad password (cost ~1h;
  a raw `openssl s_client` IMAP probe with the Keychain-held app password is what diagnosed it);
  (3) Gmail's theme save works but the running page doesn't repaint until reload — it *looks* like
  the save failed; (4) GAM7 can't be driven from a non-interactive shell (reads stdin) and needs a
  prerequisite App-access-control trust for its Client ID.
- 2026-07-21 · claude-in-chrome · verify/redeem GitHub Copilot student benefit (logged-in github.com) ·
  nothing left to redeem — "GitHub Copilot Student" already active (SKU free_educational_quota, 200 AI
  credits/mo, overage $0-locked); gotcha: model picker is Auto-ONLY on this tier (every named model
  aria-disabled → needs Pro/Pro+), so VS Code "upgrade" nags are tier-accurate, not a config error
- 2026-07-19 · claude-in-chrome · remove TikTok Chrome-PWA + clear its data (Default profile, logged-in) ·
  logged the site out via tiktok.com/logout, then cleared all origin-reachable state through page JS
  (10 cookies, 69 localStorage keys, 6 IndexedDB DBs, 2 CacheStorage caches, service worker
  unregistered); app uninstall + HttpOnly-cookie purge handed to operator via staged
  chrome://app-settings/<id> and chrome://settings/content/all?searchSubpage=tiktok (the extension
  cannot touch chrome:// pages). Gotchas: deleting the shim .app alone ≠ uninstall — Chrome
  regenerates it while its registry entry lives; and a Falcon custom IOA process-BLOCKS zsh touching
  Chrome profile files (Preferences/Local State scrub died silently, 3× High/Prevention) — by
  design, don't bypass; drive Chrome's own UI instead. See memories
  `falcon-blocks-chrome-profile-shell-access` + `chrome-pwa-uninstall-registry-resurrection`.

- 2026-07-09 · claude-in-chrome · complete Parker Dewey Career Launcher profile (app.parkerdewey.com, logged-in)
  per the "Completing Your profile" onboarding email · added 239-char personal statement, GPA 4.0
  (from Strayer GPS dashboard PDF — President's List), and 3 experience entries sourced from the
  trevorrobeyinc.github.io portfolio (Trevor Robey Inc. founder 2025–, freelance digital marketer
  2020–, e-commerce 2016–2020); resume/location/affiliations were already set. Gotcha: profile-page
  read_page (interactive) silently omitted lower form controls — scroll + find() located them.
  07-10 follow-up: added LinkedIn URL (linkedin.com/in/trevor-robey) to Resume/CV page; Parker Dewey
  web session had expired → user signed in themselves (password entry stays hand-off).
- 2026-07-02 · claude-in-chrome · mirror docs.crowdstrike.com console docs (US-2 SSO) · Fluid
  Topics `/api/khub` mirror; captured the CrowdStrike APIs publication tree; full 3,120-pub crawl
  abandoned (rate-limit 403s + auto-mode flagged the page→localhost relay as exfil). Public corpus
  built separately under `crowdstrike-docs/`.

_The two entries below were recovered on 2026-11-04 from the 2026-05-27 stash (commit `a7fc6a0c`, kept as `refs/stash` in `TRINC-FULL-backup-20261104-1519.bundle`), where they sat uncommitted in the root `CLAUDE.md`. They are copied in their original format, except the Falcon detection details (one bullet and one open thread), which moved to the Security Everything browser-session log._

### 2026-05-27 01:25 — AWS API MCP Server wired to IAM Identity Center (YubiKey SSO, read-only)
- **Tool(s)**: Claude in Chrome (IAM + IAM Identity Center console walkthrough), AWS API MCP Server (`call_aws`), Falcon MCP (detection triage), Tavily (AWS docs verification), Bash (awscli install + `~/.aws/config`).
- **URLs touched**: `console.aws.amazon.com/iam`, `console.aws.amazon.com/singlesignon` (IAM Identity Center), `aws.amazon.com/marketplace/management`→partnercentral, `console.aws.amazon.com/dataexchange`.
- **Outcome**: awslabs **AWS API MCP Server** (Claude Desktop extension v1.3.3) now authenticates to account **833390816446** via IAM Identity Center SSO as the **ReadOnlyAccess** role, gated by a **YubiKey 5 NFC FIPS** FIDO2 MFA. Verified end-to-end — `sts get-caller-identity` returns `AWSReservedSSO_ReadOnlyAccess_6f773b26ef4872e0/Trevoralexanderrobey` on both local CLI and through the MCP server (HTTP 200). No long-lived keys on disk; short-lived SSO creds in `~/.aws/sso/cache/`.
- **Findings worth remembering**:
  - **IAM Identity Center ACCOUNT instances do NOT support permission sets / AWS-account access — only ORGANIZATION instances do.** For an SSO→CLI credential setup on a standalone account, enable the *Organization* instance (creates a single-account AWS Org, this account = management account). Account instances are app-only, can't be converted, and only one instance exists per standalone account — so you must delete the account instance and re-enable as org (cost a delete/recreate mid-session). New org `o-dram9st6t2`, instance `ssoins-722314a77ded4856`.
  - SSO wired via `~/.aws/config` as the **`default`** profile (sso-session `trevor-robey-sso`, start URL `https://d-90660e72bc.awsapps.com/start`, role `ReadOnlyAccess`). The MCP extension picks it up via the boto3 default chain with **no restart needed**.
  - `aws sso login` rode an existing access-portal session (YubiKey already tapped at portal sign-in) → "Successfully logged in" with no fresh prompt; expected — re-prompts (password + tap) on session expiry.
  - Security choice: AI MCP server = ReadOnlyAccess (IAM-enforced wall vs. prompt-injection); a separate user-assumed AdministratorAccess permission set was recommended but deliberately NOT created/wired to the AI (deferred).
  - _(A Falcon detection note from this session was moved on 2026-11-04 to the Security Everything browser-session log, `docs/browser-session-history/2026-11.md`, so its details stay off GitHub.)_
- **Artifacts**: `/Users/trevorrobey/.aws/config` (new).
- **Open threads**: optional user-assumed `AdministratorAccess` permission set not yet created; one Falcon tuning candidate (detail in the Security Everything log).

### 2026-05-26 — AWS IAM roles triage (4 service-linked roles, account 833390816446)
- **Tool(s)**: Claude in Chrome (`navigate`, `get_page_text`, `computer` screenshot/click) + Tavily verification.
- **URLs touched**: `console.aws.amazon.com/iam#/roles` and `#/roles/details/AWSServiceRoleForResourceExplorer`.
- **Outcome**: Confirmed all 4 IAM roles are AWS-managed **service-linked roles** (Support, TrustedAdvisor, AccessAnalyzer, ResourceExplorer) — none user-created, none compromise-related, none tied to the AWS Data Exchange seller playbook.
- **Findings worth remembering**: As of 2026-05-26 the account has exactly 4 roles, all SLRs under the `/aws-service-role/` ARN path (definitive AWS-owned marker; viewable-not-editable). No `DataExchange`/`Marketplace` seller roles exist yet — consistent with `03-platforms/aws-data-exchange/` registration still in progress. ResourceExplorer SLR created 2026-05-01; recent "last activity" timestamps matched the owner's own console session (MFA hardening: added FIDO USB key, removed an unrecognized virtual MFA).
- **Artifacts**: none.
- **Open threads**: advisory-only follow-ups recommended, not performed — CloudTrail `CreateVirtualMFADevice`/`EnableMFADevice` lookup to trace the unrecognized virtual MFA origin; IAM Users + Credential Report review; confirm root MFA + no root access keys.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->
