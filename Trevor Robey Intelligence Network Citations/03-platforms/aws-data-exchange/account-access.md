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
| AWS account ID | `833390816446` ("Trevor Robey Inc") |
| Account / management email (root) | `Trevor.Robey@my.strayer.edu` — root has MFA, **no** access keys |
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

## Identity provider — IAM Identity Center (SSO)

| Element | Value |
|---|---|
| Instance ARN | `arn:aws:sso:::instance/ssoins-722314a77ded4856` |
| Identity store | `d-90660e72bc` |
| Status / created | `ACTIVE`, created `2026-05-26` |
| **Access portal (sign-in URL)** | **`https://d-90660e72bc.awsapps.com/start`** |
| Identity source | Identity Center directory (built-in) |
| SSO user | `Trevoralexanderrobey` (Enabled) |
| MFA device | **YubiKey 5 NFC FIPS** — FIDO2 "Security keys" |

Signing in to the access portal requires the username/password **and** a
physical tap of the YubiKey. There is no SMS/TOTP fallback — the FIDO2 key is
the second factor. This makes the account **phishing-resistant**: credentials
alone cannot complete a login.

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

This file is **account access** only. Becoming an approved **AWS Data Exchange
data provider** is a separate, still-in-progress business process (application
rejected 2026-05-03; AWS re-engaged; follow-up #3 sent 2026-05-23). That trail
lives in [`correspondence-2026-05.md`](correspondence-2026-05.md); channel status
is tracked in the Commercial Launch Playbook §2 #2. Having this hardware-gated
access in place is a prerequisite for acting the moment qualification clears.

## Provenance

Every value above was confirmed against live AWS read-only API calls on
2026-05-26 and the verbatim `~/.aws/config`. Setup narrative:
`context-handoff-aws-mcp-yubikey-sso-setup.md` (archived locally in `.archive/context-handoffs/`,
gitignored) and the 2026-05-27 entry in the monorepo `CLAUDE.md`
**Browser Session History**.
