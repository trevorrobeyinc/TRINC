# NOTICE — Trevor Robey Inc Agents

This file documents the upstream code, runtimes, tools, and data sources that
trevor-robey-inc-agents depends on, and clarifies the boundaries of authorship.

trevor-robey-inc-agents is authored by Trevor Robey. The components listed below
are not authored by Trevor Robey; they are dependencies and prior art that this
project consumes under their respective licenses.

## Provider entity

The legal entity providing trevor-robey-inc-agents commercial deliverables is
**Trevor Robey Intelligence Network Citations LLC**, a California limited
liability company (filed at the California Secretary of State 2026-05-06,
receipt B20260217250; CA SOS Entity # populated upon approval). The entity
operates under the brand wordmark **"Trevor Robey, INC."** where
**INC = Intelligence Network Citations** (a backronym, not a corporate
suffix). Customer-facing materials pair the wordmark with this disclosure to
satisfy Cal. Bus. & Prof. Code §17910.5(a) and the legal name complies with
Cal. Corp. Code §17701.08(e). The repository name `trevor-robey-inc-agents`
is the product/code-stack slug under that legal entity.

## Upstream patterns

**OpenClaw (open-source agent framework — clean-room derivative)** — OpenClaw
is the open-source engine that powers trevor-robey-inc agents, not a brand
owned by Trevor Robey Intelligence Network Citations LLC. Architectural patterns from the OpenClaw open-source
project line are preserved as a clean-room derivative. The
`openclaw-bridge/openclaw.json` flag `cleanRoomDerivative: true` is the
canonical anchor. The `openclaw-bridge/` directory name is intentionally
retained as upstream attribution. trevor-robey-inc-agents claims no authorship
of OpenClaw and is not affiliated with or endorsed by any OpenClaw-branded
product, including the consumer "Personal AI assistant" distributed at
`openclaw.ai`.

## Major code dependencies

**ToolUniverse** — Apache-2.0 — Harvard MIMS / Zitnik Lab. Vendored under
`vendor/tooluniverse/` as a git submodule. Powers biomedical tool discovery
and execution for all six prebuilt research workflow templates. Cite:

> Gao, S., Zhou, X., Zhao, X., Chen, B., Chen, Z., Doerr, S., Geiger, J.,
> Greenberg, B., Hu, J., et al. "ToolUniverse: A Universal Toolkit for
> Heterogeneous Scientific Tools." arXiv:2509.23426. 2025.

**Node.js** — MIT — Required runtime, version 22.13.1, enforced via
`engines`, `devEngines`, and `.npmrc engine-strict=true`.

**npm packages** — Various permissive licenses (MIT, Apache-2.0, BSD).
Tracked in `package-lock.json`.

**Python (uv-managed)** — PSF License (Python core). Used only as the host
runtime for the vendored ToolUniverse subprocess; no first-party Python code
is shipped by this project.

## Biomedical data sources

The system queries the following databases at runtime via ToolUniverse and the
project's MCP servers. Data licenses, redistribution rules, and citation
requirements vary by source. Buyers must comply with each upstream source's
terms when using outputs derived from these databases.

| Source | Authority | Used by |
| --- | --- | --- |
| PubMed | U.S. National Library of Medicine (NLM) | `pubmed-mcp`, ToolUniverse |
| ClinicalTrials.gov | U.S. National Institutes of Health (NIH) / NLM | `clinicaltrials-gov-mcp`, ToolUniverse |
| ChEMBL | European Bioinformatics Institute (EBI / EMBL) | `chembl-mcp`, ToolUniverse |
| OpenTargets | OpenTargets consortium | ToolUniverse |
| DrugBank | DrugBank, University of Alberta (where applicable; commercial license required for redistribution) | ToolUniverse |
| NPI Registry | U.S. Centers for Medicare & Medicaid Services (CMS) | `npi-mcp` |
| ICD-10 | World Health Organization (WHO) | `icd10-mcp` |
| Owkin pathology | Owkin platform | `owkin-mcp` |
| HuggingFace Hub | HuggingFace, Inc. (metadata queries only — no model weights downloaded or run) | `huggingface-mcp`, ToolUniverse |
| Google Drive | Google LLC (operator-supplied accounts and content only) | `gdrive-mcp` |

## What is NOT in this project's stack

The following components were named in early planning documents but are not
shipped, downloaded, run, or relied on by trevor-robey-inc-agents:

- Qwen2.5-7B-Instruct — not downloaded; not bundled.
- OpenBioLLM-Llama3-8B — not downloaded; not bundled.
- Any other HuggingFace model weights — `huggingface-mcp` queries Hub metadata
  only; no models are pulled to disk and no weights are executed.
- The `openclaw` macOS cask and the `openclaw-cli` Homebrew formula
  (consumer products from `openclaw.ai`) are unrelated to this project.

## Trademarks

OpenClaw is referenced solely for clean-room provenance and is not used as a
trademark of trevor-robey-inc-agents. Other product, organization, and source
names referenced above are trademarks or service marks of their respective
owners. Their use in this NOTICE indicates dependency, not endorsement.

## Disclaimer

trevor-robey-inc-agents produces research artifacts. Outputs are not validated
for clinical decision support, pharmaceutical prescribing, regulatory
submission, or any professional medical use. Buyers using these artifacts in
regulated workflows are responsible for independent verification, validation,
and compliance with all applicable laws, regulations, and licensing terms of
the upstream data sources listed above.

This project does not host, transmit, or process Protected Health Information
(PHI). All data sources queried are public biomedical databases.

External publication, marketplace submission, customer delivery, and
authentication actions remain manual-only by architectural design; the system
does not act autonomously on external systems.
