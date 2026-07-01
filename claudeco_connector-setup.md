# claudeco_connector-setup.md — Connector Authorization Checklist

> Built 2026-07-01 by the Cowork operator. Scope chosen with you: **research
> connectors + the installed connectors that match how the business actually
> operates** (decided from repo evidence, not assumption). Companion to
> `claudeco_project.md` and `claudeco_vault-index.md`.

## What I can and cannot do here

- **I cannot complete any OAuth/login from this Cowork session** — it's non-interactive.
  Every "needs authorization" connector below must be authorized by you interactively
  (claude.ai → Settings → Connectors, or `/mcp` in an interactive Claude session).
  Never paste tokens or auth codes into Cowork.
- **I did not fabricate engine config.** The engine's subprocess connectors live in
  `config/connector-registry.json` + `config/data-source-credentials.json`. Adding
  entries for connectors that have **no adapter** would create the exact "connector
  drift" your 2026-06-10 audit warns about, so I didn't. Where an adapter already
  exists (Owkin), it's noted as already-aligned.

## Two connector layers (don't conflate them)

1. **Cowork / claude.ai connectors** — what you install in Claude. Chat/operator-side.
   Owkin, Wiley, Synapse, BioRender, BigQuery all live here.
2. **Engine subprocess connectors** — `run-workflow.js` spawns these from
   `openclaw-bridge/mcp/*`. Only **Owkin** (of your target set) exists at this layer.

## Decision table — set up vs skip (evidence-based)

| Connector | Category | Repo evidence | Verdict |
|-----------|----------|---------------|---------|
| **Owkin** | Research (digital pathology) | Engine-wired (`owkin-mcp`, `OWKIN_API_KEY`); strong biomedical fit | **Set up** |
| **BigQuery** | Business ops (enterprise delivery) | Heavily referenced as an enterprise dataset-delivery channel (REVENUE_PLAYBOOK, product catalog, pricing, AWS/Datarade listings) | **Set up** |
| **Wiley** | Research (licensed journals) | Appears only as a paywall you don't bypass; **no engine adapter** | **Set up if licensed** |
| **Synapse** | Research (Sage Bionetworks data) | No repo footprint; no engine adapter | **Optional** |
| **BioRender** | Report figures | Listed as an unauthenticated connector; a figure tool, not a data source | **Optional** |
| Amplitude / Amplitude-EU | Product analytics | **No repo footprint** | **Skip (recommended)** |
| Atlassian | PM / docs | **No repo footprint** | **Skip (recommended)** |
| Definite | BI / analytics | **No repo footprint** | **Skip (recommended)** |
| Hex | Data notebooks | **No footprint** ("Hex" in repo = brand color tokens only) | **Skip (recommended)** |

## Authorization steps (you, interactively)

For each: open **claude.ai → Settings → Connectors** (or run `/mcp` in an interactive
session), find the connector, click **Connect/Authorize**, complete the provider's login
in the browser popup, and confirm it flips from "needs authorization" to connected.

1. **Owkin** — authorize the Cowork connector. Prerequisite: an Owkin platform account
   with API access. *Engine side:* already wired — additionally export `OWKIN_API_KEY`
   in the engine's runtime environment (the shell/launchd env that runs
   `scripts/run-workflow.js`) so the `owkin-mcp` subprocess can use it. This is the only
   connector wired end-to-end.
2. **BigQuery** — authorize with the Google Cloud account that owns your delivery
   project. Prerequisite: a GCP project + BigQuery API enabled + the dataset you deliver
   from. *Engine side:* none — BigQuery is an **operator/delivery-side** tool here
   (matches your "enterprise private delivery" model), not part of `run-workflow.js`.
3. **Wiley** — authorize **only if you hold a Wiley license / TDM token**. Without a
   subscription the connector will authenticate to nothing useful, and your source-license
   policy forbids paywall bypass — this connector is the *licensed* path, use it that way.
   *Engine side:* none (no adapter). Cowork/chat-supervisory only for now.
4. **Synapse** (optional) — authorize with a Sage Bionetworks Synapse account if you plan
   to pull controlled or open biomedical datasets. *Engine side:* none.
5. **BioRender** (optional) — authorize if you want figure generation for report collateral.
   Not a data source; won't affect citation traceability. *Engine side:* none.

## Skip list — and why

Amplitude, Amplitude-EU, Atlassian, Definite, Hex have **no reference anywhere in the
repo**. They're generic business-analytics/PM tools that don't match how this
citation-traced biomedical business currently operates. Leaving them unauthorized keeps
your connector surface honest (a recommendation your own `CONNECTOR-ALIGNMENT.md` makes).
If you adopt one operationally later, authorize it then.

## Already live — no action needed

Verified live this session: **PubMed, ClinicalTrials.gov, ChEMBL, bioRxiv/medRxiv,
Consensus, Open Targets, NPI, ICD-10, Hugging Face, Gmail.** These connect without a
login step and are ready to use.

## If you later want engine-side Wiley / BigQuery

Those would be **build tasks**, not config toggles: write an `openclaw-bridge/mcp/wiley-mcp/`
(or `bigquery-mcp/`) adapter, register it in `connector-registry.json`, add its
env-var-name entry to `data-source-credentials.json`, and bind it to the relevant roles/
workflow steps. Say the word and I'll scope that separately.
