# AWS account access & authentication (canonical)

> **Single source of truth for how anyone — or anything — authenticates to the
> Trevor Robey, INC. AWS account.** All AWS work (AWS Marketplace seller
> operations, AWS Data Exchange product creation, S3 delivery for enterprise
> clients, routine read-only inspection) authenticates through the model
> described here. The platform runbooks
> ([`setup-guide.md`](setup-guide.md), [`seller-registration.md`](seller-registration.md),
> [`public-seller-profile.md`](public-seller-profile.md)) point back to this file
> for the access details so they never drift.
>
> **Last verified live: 2026-05-26** (via read-only `aws organizations
> describe-organization`, `aws sso-admin list-instances`,
> `aws sso-admin describe-permission-set`, `aws sts get-caller-identity`).
>
> **Drift found 2026-10-21:** the `aws` CLI (`/opt/homebrew/bin/aws`), `~/.aws/` and the AWS API
> MCP Server extension are **not present on this Mac** any more (the only Claude extension installed
> is the filesystem one). "CLI configuration" and "The AI / MCP server" below describe the
> 2026-05-26 setup, not today's. Until someone decides to reinstall them, AI read-only access to AWS
> is the Claude Browser pane signed in to the SSO portal with the **ReadOnlyAccess** role.

## Why this doc exists

The access model changed on **2026-05-26**. The earlier runbooks assumed a
classic "root + IAM user with long-lived access keys" setup. That was **never
realized** and is now obsolete. The account is accessed exclusively through
**IAM Identity Center (SSO) + a YubiKey FIDO2 hardware key**, with **no
long-lived AWS keys stored anywhere on disk**. This file records the real
architecture so the seller-onboarding runbooks describe how login actually
works today.

## Account & organization

| Element | Value |
|---|---|
| AWS account ID | `833390816446` (account name as the console shows it 2026-10-21: "Trevoralexanderrobey"; this row said "Trevor Robey Inc" until then) |
| Account / management email (root) | **`aws@trevorobeyinc.com`** since 2026-10-21 (a Google Workspace group, owner/member trevor@; was `Trevor.Robey@my.strayer.edu`, risk R1, now closed — see [Root email → `aws@` runbook](#root-email--aws-runbook-risk-r1)). Root has MFA, **no** access keys. |
| Alternate contacts | Billing + Operations = `aws@trevorobeyinc.com`; Security = `trevor@trevorobeyinc.com` (all: Trevor Robey, Founder & CEO, +1 2792200923). Payment-preferences billing contact email: not set, so invoices go to root + the Billing contact. |
| AWS Organization | `o-dram9st6t2` (FeatureSet `ALL`); this account is the **management account** |
| Home region | `us-east-1` |
| Legal entity | Trevor Robey Intelligence Network Citations LLC (California) — wordmark **"Trevor Robey, INC."** (INC = Intelligence Network Citations) |
| Seller-profile primary email | `trevor@trevorobeyinc.com` |

> The AWS Organization was created as a side effect of enabling the IAM Identity
> Center **Organization** instance. An *Account* instance was tried first and
> deleted — account instances only support app assignments and **cannot** grant
> AWS-account access via permission sets, and cannot be converted to an org
> instance. Only the Organization instance gives the SSO → CLI / console
> credential flow used here.

## Root email → `aws@` runbook (risk R1)

**Why a group.** The root email is the account's recovery path and the only address that receives
listing-review outcomes, payout failures and policy notices (the Marketplace *Notifications* tab
shows the root email and cannot be edited separately). A Workspace **group** keeps that mail from
depending on one mailbox's sign-in, and a second member can be added later.

**Done 2026-10-21 (Google side, verified):** `aws@trevorobeyinc.com` converted from an alias of
trevor@ into the Google Group "AWS" (owner and only member trevor@, anyone on the web may post,
spam posts to the group instead of queueing). Details: `../google-workspace/google-workspace.md` §8.

**✅ DONE 2026-10-21 02:47–03:02 PDT (AWS side), in the Claude Browser pane on the operator's
choice:** the operator signed in as root inside the pane and typed the password, root MFA and the
emailed code; Claude filled the new address, the two contact emails and did the clicks, one go per
item. Results, each read back: root email `aws@trevorobeyinc.com` (Organizations › AWS accounts,
management account row; Marketplace › Settings › Notifications), Billing + Operations contacts
`aws@` ("Successfully updated …" on the page after each save), Security unchanged `trevor@`,
Payment-preferences billing contact blank (left alone, as agreed). The code arrived through the group
within minutes. Root was signed out of the console and the Marketplace portal afterwards.
**Gotchas** (also in the browser-session log, 2026-10-21): the Account page's *Update email address
and password* item is an `<a target=_blank>` to `https://signin.aws.amazon.com/updateaccount?redirect_uri=…`,
which the pane blocks as a new tab, so open that URL in the same tab; right after the change that
page demands a fresh sign-in, while the console session keeps working; the Marketplace portal's
*Sign out* ends only the Marketplace session, so sign out from the console's account menu too.
Not done: no fresh-load re-read of the contacts after root signed out (verify with the SSO
ReadOnlyAccess role next time you're in the console).

**The click paths (for reference, or for a future root-email change):**

1. **Root email** (management account: root only, console only, no CLI/API path;
   [AWS doc](https://docs.aws.amazon.com/accounts/latest/reference/manage-acct-update-root-user-email.html)):
   console.aws.amazon.com → *Root user* sign-in (current root email + password + root MFA) → account
   name (top right) → **Account** → *Account details* → **Actions** → **Update email address and
   password** → *Email address* **Edit** → new address `aws@trevorobeyinc.com` twice + current
   password → **Save and continue** → the code arrives at the NEW address from
   `no-reply@verify.signin.aws` (≤ 5 min, through the group into trevor@'s Gmail) → **Confirm
   updates**. Password and MFA do not change; root sign-in uses the new email afterwards. AWS allows
   up to 4 hours to propagate.
2. **Alternate contacts** (same Account page; also editable later by the SSO
   `AdministratorAccess` role): *Alternate contacts* → **Edit** → **Billing** and **Operations** →
   `aws@trevorobeyinc.com`; **Security stays `trevor@trevorobeyinc.com`** (operator decision
   2026-10-21) → **Update**.
3. **Invoice recipients.** There is no separate invoice-email field: AWS sends invoices to the root
   email and the Billing alternate contact, and a **billing contact on Billing and Cost Management →
   Payment preferences**, if one is set, replaces root as a recipient
   ([AWS doc](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/billing-pref.html)). Check
   Payment preferences: if a billing contact shows the Strayer address, change it to `aws@`; if none
   is set, leave it.
4. **Marketplace notifications:** nothing to edit. Settings → *Notifications* shows the root email
   and follows step 1; `aws@` has been the custom-notifications recipient since 2026-07-23.

**Read-only verification afterwards** (Claude, pane + SSO): sign in to the access portal with the
**ReadOnlyAccess** role tile, then read Account → Alternate contacts, Organizations → the management
account's email, Payment preferences, and Marketplace → Settings → Notifications.

**After it lands:** the Strayer → Gmail forwarding stopgap, its `Via-Strayer` label and the monthly
calendar check (`../google-workspace/workspace-operations.md` §1b, §2) can be retired, but keep the
Strayer mailbox alive for a few weeks in case AWS mails the old address about the change.

## Identity provider — IAM Identity Center (SSO)

| Element | Value |
|---|---|
| Instance ARN | `arn:aws:sso:::instance/ssoins-722314a77ded4856` |
| Identity store | `d-90660e72bc` |
| Status / created | `ACTIVE`, created `2026-05-26` |
| **Access portal (sign-in URL)** | **`https://d-90660e72bc.awsapps.com/start`** |
| Identity source | Identity Center directory (built-in) |
| SSO user | `Trevoralexanderrobey` (Enabled) |
| MFA devices (FIDO2) | **2 keys enrolled** — primary **YubiKey 5 NFC FIPS** (USB-A) + backup **YubiKey 5C NFC FIPS** (USB-C, added 2026-05-28). Either key independently completes sign-in. |

Signing in to the access portal requires the username/password **and** a
physical tap of one of the registered YubiKeys. There is no SMS/TOTP fallback
— a FIDO2 key is the second factor. This makes the account
**phishing-resistant**: credentials alone cannot complete a login.

The **backup YubiKey was enrolled 2026-05-28** so a single lost or damaged key
cannot lock the account. For that redundancy to actually protect the account,
the two keys must be stored **physically separately** (one daily-carry,
one off-site / safe / safe-deposit box). Both keys in the same drawer doesn't
protect against fire, theft, or losing the same bag.

## The two roles (permission sets)

Two AWS-managed permission sets are assigned to the SSO user on account
`833390816446`. **Each has a 1-hour session** (`PT1H`) — sessions expire hourly
and are refreshed with `aws sso login` + a YubiKey tap.

| Permission set | ARN suffix | Who uses it | Why |
|---|---|---|---|
| **`ReadOnlyAccess`** | `ps-72231cd6a1728639` | The **AI / MCP server** (and any automation) — via the `default` CLI profile | Read/describe/list only. Cannot create, modify, or delete anything. |
| **`AdministratorAccess`** | `ps-7223172b9594202e` | **The operator only** — via the access portal or the `admin` CLI profile | Full control for consequential seller / Data Exchange / S3 actions. |

### Hard rule — keep the AI ReadOnly (carried over from the setup session)

- **The AI / MCP server stays `ReadOnlyAccess` by default.** The YubiKey gates
  *authentication*; it does **not** govern what an already-authenticated session
  can *do*. An admin-scoped AI session could be steered by prompt injection to
  create / modify / delete. **Least privilege at the IAM layer is the real
  blast-radius control** — CrowdStrike Falcon is endpoint EDR and does **not**
  govern AWS cloud-side authorization.
- The AI may use the `admin` profile / `AdministratorAccess` **only** with the
  operator's **explicit, written, per-action permission in chat**. "Go ahead"
  on one action never authorizes the next. Standing AI access is ReadOnly.
- **Never** wire AWS **root** credentials, and never store long-lived keys on
  disk. SSO issues short-lived credentials cached under `~/.aws/sso/cache/`.

## CLI configuration

The CLI is `aws-cli/2.34.52` (Homebrew, `/opt/homebrew/bin/aws`). `~/.aws/config`:

```
[default]
sso_session = trevor-robey-sso
sso_account_id = 833390816446
sso_role_name = ReadOnlyAccess
region = us-east-1
output = json

[profile admin]
sso_session = trevor-robey-sso
sso_account_id = 833390816446
sso_role_name = AdministratorAccess
region = us-east-1
output = json

[sso-session trevor-robey-sso]
sso_start_url = https://d-90660e72bc.awsapps.com/start
sso_region = us-east-1
sso_registration_scopes = sso:account:access
```

The **`default`** profile is intentionally the ReadOnly role so that any tool
using the boto3 / AWS default credential chain (including the AWS API MCP
Server, which has no env-config UI) resolves to ReadOnly with no extra wiring.

## Daily use

### Refresh an expired SSO session (read-only / AI)

```
aws sso login
aws sts get-caller-identity
```

- `aws sso login` — opens the access portal in the browser to refresh the
  short-lived credentials for the `default` (ReadOnly) profile; tap the YubiKey
  if the portal session has expired. If the portal session is still live it
  completes with no prompt.
- `aws sts get-caller-identity` — verifies the refresh. Expect an ARN containing
  `AWSReservedSSO_ReadOnlyAccess_…/Trevoralexanderrobey`.

### Operator assumes Admin (consequential console / CLI work)

```
aws --profile admin sso login
aws --profile admin sts get-caller-identity
```

- `aws --profile admin sso login` — refreshes credentials for the
  `AdministratorAccess` role; tap the YubiKey.
- `aws --profile admin sts get-caller-identity` — expect an ARN containing
  `AWSReservedSSO_AdministratorAccess_…`. Use this profile only for actions that
  must create / modify / delete (seller registration, listing creation, S3
  revisions, private offers). For console work, the operator can instead sign in
  at the access portal and pick the AdministratorAccess role tile.

## The AI / MCP server

- **Server**: awslabs **AWS API MCP Server** v1.3.3 (Claude Desktop extension at
  `~/Library/Application Support/Claude/Claude Extensions/ant.dir.gh.awslabs.aws-api-mcp-server/`).
  Tools: `call_aws`, `suggest_aws_commands`.
- It uses the boto3 default credential chain → the `default` profile →
  **`ReadOnlyAccess`**. The IAM role is the enforcing control (the extension has
  no `READ_OPERATIONS_ONLY` UI), so even an attempted write is denied AWS-side.
- **Useful for runbook automation**: the AI can *read* live AWS state to support
  these runbooks — confirm the account/org/SSO config, check whether a
  Marketplace/Data Exchange seller registration or product exists, inspect IAM
  roles, verify a listing's status after the operator publishes it. It **cannot**
  perform any seller / listing / S3 mutation; those remain operator-only and
  manual, consistent with the engine's manual-only external-action posture.

## Relationship to seller onboarding

This file is **account access** only. Seller onboarding is a separate business
process that is now **complete: the account is APPROVED and cleared for paid
selling as of 2026-07-22** (disbursement method added; Marketplace status =
"Publish paid and free products"). *(History: the ADX/provider application was
rejected 2026-05-03; AWS re-engaged; approved; disbursement was blocked ~2.5
months by a stalled account review, cleared 2026-07-22.)* That trail lives in
[`correspondence-2026-05.md`](correspondence-2026-05.md); channel status is
tracked in the Commercial Launch Playbook §2 #2. The remaining work is
product-side (publish a paid listing), not account access.

## Provenance

Every value above was confirmed against live AWS read-only API calls on
2026-05-26 and the verbatim `~/.aws/config`. Setup narrative:
`context-handoff-aws-mcp-yubikey-sso-setup.md` (archived locally in `.archive/context-handoffs/`,
gitignored) and the 2026-05-27 entry in the monorepo `CLAUDE.md`
**Browser Session History**.
