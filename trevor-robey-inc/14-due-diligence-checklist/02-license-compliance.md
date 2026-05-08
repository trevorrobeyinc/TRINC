# Item 2 — License compliance (regex gate on DrugBank IDs)

This gate fails the build if any deliverable carries identifiers from sources that are not licensed for our use, or if the source domain has not been registered.

## What the gate checks

1. **DrugBank ID regex on every row.** Any output containing `DB\d{5}` is blocked unless `source_overrides` in `config/dataset-license-rules.json` records an active commercial license.
2. **Source domain present in `domain_rules`.** Any record whose `source_url` resolves to a host not enumerated in `config/dataset-license-rules.json` is treated under `default_unknown_state` (currently `blocked`).
3. **License identifier known.** Any record whose declared license is missing from `license_rules` falls through to the same `default_unknown_state`.
4. **Source override consistency.** The scraper-side override `scrape-sidecar:<connector>` must match an entry in `09-source-licenses/scraping-targets.md`. If the registry omits the connector, this gate fails the build.

## Where it runs

- Build-time, inside `openclaw-bridge/dataset/license-review.js:classifyBuild()`.
- Pre-publication, again, before any release adapter (`openclaw-bridge/distribution/`) emits a file.
- Sidecar-side, once: `scrape-sidecar/app/policy.py:screen_text()` blocks DrugBank IDs and surface PHI patterns from ever entering `workspace/research-raw/` in the first place.

## Reproduce locally

```
node -e "const r=require('./openclaw-bridge/dataset/license-review').createLicenseReview(); console.log(r.getConfigSnapshotHash());"
```

`node -e ...` - prints the SHA-256 of the loaded license rules. If this hash differs across environments, configs have drifted and the gate cannot be trusted.

```
curl -k --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" \
  -X POST https://127.0.0.1:8842/scrape \
  -H "content-type: application/json" \
  -d '{"target":"elife","params":{"article_id":"83456"}}'
```

`curl ...` - sanity check: pilot connector returns a record whose `source_url` matches `elifesciences.org` and whose `license` is `cc-by-4.0`. A planted DrugBank ID in the response payload would fail with HTTP 422 and `reason_code: DRUGBANK_LICENSE_REQUIRED`.

## Failure modes

| Condition | Reason code | Action |
|---|---|---|
| Output contains `DB\d{5}` | `DRUGBANK_LICENSE_REQUIRED` (sidecar) / `PHASE20_LICENSE_DOMAIN_BLOCKED` (build) | Confirm DrugBank commercial license is active; if so, add `source_overrides` entry. Otherwise, redact. |
| Unknown source domain | `PHASE20_LICENSE_UNKNOWN_BLOCKED` | Add a deliberate `domain_rules` entry. Do not relax the default. |
| Unknown license identifier | `PHASE20_LICENSE_UNKNOWN_BLOCKED` | Add a deliberate `license_rules` entry tied to a sign-off in `09-source-licenses/`. |
| Sidecar paywall detection | HTTP 451 from `/scrape` | Confirm the URL is open access; no paywall bypassing under any framing. |
| Sidecar PHI surface match | `PHI_SSN_PATTERN`, `PHI_MRN_PATTERN` | Refer the case to the Presidio screen at `10-quality-pipeline/presidio-phi-pii-screening/`. Do not override at this layer. |
