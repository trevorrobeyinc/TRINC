# HuggingFace — organization & namespace setup

> **Decided (2026-06-10).** HF authenticated user is **`Trevorrobey`** (confirmed via the Hugging Face MCP `hf_whoami`). For a brand-clean public presence, publish under an **organization**, not the personal handle. (This file's old title `trevorrobey-inc` used a hyphenated slug — superseded; use `trevorrobeyinc`, no hyphens, to match the domain.)

## Namespace decision

| Option | Repo id | Verdict |
|---|---|---|
| Personal user | `Trevorrobey/pharmacovigilance-ici-adverse-events` | Fallback only — works today, but mixes personal + business identity. |
| **Organization (recommended)** | `trevorrobeyinc/pharmacovigilance-ici-adverse-events` | **Use this.** Matches the domain `trevorobeyinc.com`; clean org page for future datasets. |

**Do NOT** use the stale `openclaw-pharmacovigilance-teaser` slug or any `openclaw` variant — the OpenClaw-era naming is what got the Gumroad PDF rejected. Canonical org handle: **`trevorrobeyinc`** (no hyphens, matches the domain).

## Steps (operator, ~5 min)

1. huggingface.co → your avatar → **New Organization**. Name/handle: `trevorrobeyinc`. Type: Company. Add the TR logo (`01-brand-system/`), homepage `https://trevorobeyinc.com`, contact `trevor@trevorobeyinc.com`.
2. Confirm you (`Trevorrobey`) are an org admin.
3. Proceed to dataset creation — see [`PUBLISH-STEPS.md`](PUBLISH-STEPS.md). Frontmatter is in [`dataset-yaml-frontmatter.md`](dataset-yaml-frontmatter.md); gated fields in [`extra-gated-fields.md`](extra-gated-fields.md).

> If you skip the org for speed, every repo id becomes `Trevorrobey/...` instead of `trevorrobeyinc/...`. Nothing else changes.
