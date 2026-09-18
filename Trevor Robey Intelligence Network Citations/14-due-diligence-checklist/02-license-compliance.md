# Item 2 — License compliance (regex gate on DrugBank IDs)

This gate fails the build if any deliverable carries identifiers from sources that are not licensed for our use, or if the source domain has not been registered.

## What the gate checks

1. **DrugBank ID regex on every row.** Any output containing `DB\d{5}` is blocked unless `source_overrides` in `config/dataset-license-rules.json` records an active commercial license.
2. **Source domain present in `domain_rules`.** Any record whose `source_url` resolves to a host not enumerated in `config/dataset-license-rules.json` is treated under `default_unknown_state` (currently `blocked`).
3. **License identifier known.** Any record whose declared license is missing from `license_rules` falls through to the same `default_unknown_state`.

## Where it runs

- Build-time, inside `openclaw-bridge/dataset/license-review.js:classifyBuild()`.
- Pre-publication, again, before any release adapter (`openclaw-bridge/distribution/`) emits a file.

## Reproduce locally

```
node -e "const r=require('./openclaw-bridge/dataset/license-review').createLicenseReview(); console.log(r.getConfigSnapshotHash());"
```

`node -e ...` - prints the SHA-256 of the loaded license rules. If this hash differs across environments, configs have drifted and the gate cannot be trusted.

## Failure modes

| Condition | Reason code | Action |
|---|---|---|
| Output contains `DB\d{5}` | `PHASE20_LICENSE_DOMAIN_BLOCKED` | Confirm DrugBank commercial license is active; if so, add `source_overrides` entry. Otherwise, redact. |
| Unknown source domain | `PHASE20_LICENSE_UNKNOWN_BLOCKED` | Add a deliberate `domain_rules` entry. Do not relax the default. |
| Unknown license identifier | `PHASE20_LICENSE_UNKNOWN_BLOCKED` | Add a deliberate `license_rules` entry tied to a sign-off in `09-source-licenses/`. |
