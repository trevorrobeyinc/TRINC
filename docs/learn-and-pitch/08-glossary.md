# 08 — Glossary

## Identifiers the engine can cite

| Id | Stands for | Where it points |
|---|---|---|
| **PMID** | PubMed ID | An article record in PubMed (NCBI) |
| **PMCID** | PubMed Central id, e.g. `PMC7383595` | A full-text article record in PubMed Central (NCBI) |
| **NCT** | ClinicalTrials.gov number, e.g. `NCT07388524` | A registered clinical trial |
| **ISRCTN** | ISRCTN registry number, e.g. `ISRCTN50189673` | A registered clinical trial (the ISRCTN registry) |
| **EudraCT number** | EU trial number, e.g. `2020-001113-21` | A trial in the EU Clinical Trials Register; read only after an `EudraCT` label or in a register URL |
| **DOI** | Digital Object Identifier | A published work (journal article, dataset) |
| **ChEMBL id** | ChEMBL compound or target id | EMBL-EBI's database of bioactive molecules |
| **PubChem CID** | PubChem compound id | NCBI's chemistry database |
| **UniProt accession** | Protein id | The UniProt protein database |
| **`WEB: <12 hex>`** | A stored web-page snapshot (business lane) | The exact text read, from one URL, at one time |
| **`SEC: <cik>/<accession>`** | An SEC EDGAR filing (business lane) | A US public-company filing |
| **`WB: <indicator>`** | A World Bank indicator (business lane) | A development statistics series |
| **`BLS:` / `EUROSTAT:`** | US Bureau of Labor Statistics / EU statistics office series (business lane) | An official statistics series |
| **`CENSUS:` / `EIA:`** | US Census / US Energy Information Administration (business lane, dormant) | Built, switched off until free keys are registered |

The biomedical citations a slide may show are **PMID, PubChem CID, NCT, UniProt, ChEMBL and DOI** (plus the
business-lane ids above). The engine also recognises one further drug database's ids, but only so the
shipment gate can **refuse** them: the business holds no licence to redistribute that content, and any bundle
carrying it is blocked. That database is deliberately not named in this pack; never name or cite it.
[src: `ENGINE/OFFERINGS.md` → Brand Commitments, scope; `ENGINE/CLAUDE.md` → "Instructions must not contradict the shipment gate"]

## The checks and their verdicts

| Term | Meaning |
|---|---|
| **Grounded** | A cited identifier the engine actually retrieved during the run |
| **Ungrounded** | A cited identifier the run did not retrieve; marked `[UNVERIFIED]` inline. It may still be real. |
| **Grounded ratio** | Grounded ÷ cited. The floor is 0.75. |
| **PASS / UNVERIFIED / INSUFFICIENT_EVIDENCE / NO_CITATIONS** | The gate's verdicts. Only PASS ships. |
| **Retraction screen** | Checking every cited paper against Crossref and PubMed for retraction |
| **Re-resolution** | Looking each cited PMID, PMCID, NCT, ISRCTN and EudraCT number, DOI, PubChem CID, UniProt accession and ChEMBL id up again at its issuing registry when the report is assembled (the bundle states the date) |
| **VERIFIED / UNRESOLVED / UNCHECKED** | Re-resolution results. Any UNRESOLVED blocks delivery. |
| **DELIVER / DELIVER_WITH_FLAGS / BLOCK** | The delivery decision. DELIVER needs 100% VERIFIED. |
| **Honest zero** | A search that ran and truly found nothing, recorded as such rather than hidden |
| **Census** | Retrieving every record a registry holds for a query, stated as N of M |
| **Amendment-risk band** | LOW/MODERATE/HIGH from protocol amendment counts; paused since 2026-10-08 |

## The engine

| Term | Meaning |
|---|---|
| **Engine** | The research software in `Trevor Robey Intelligence Network Citations/` |
| **Template** | One of the ten kinds of research run, each with its own inputs |
| **Lane / research profile** | Biomedical (default) or business (`research_profile: business`): same engine, same gate |
| **Scout / analyst / synthesizer** | The three Claude roles that gather, weigh and write |
| **Evidence Desk** | The business lane's code that gathers and condenses evidence, replacing the scout's model call |
| **Prefetch** | Pulling live records before a model writes, so the gate has something to check against |
| **ToolUniverse** | Harvard's set of about 2,116 biomedical tools, used by the engine |
| **Bundle** | The sealed ZIP a customer receives, with a checksum per file |
| **Mock provider** | A practice mode that spends nothing and needs no approval |
| **Run #6** | The 2026-10-08 trial-design benchmark run used as the proof of method |

## The machine

| Term | Meaning |
|---|---|
| **Vault** | Trevor's Obsidian notes (`My Digital Garden`) |
| **Bridge** | A small server inside an Obsidian plugin; the three TRINC bridges answer on private sockets, not network ports |
| **Socket** | The private file a bridge answers on; only Trevor's account can open it, and no web page can reach it |
| **Command Center** | The plugin and bridge (`command-center.sock`) that start runs and receive results |
| **Viz Studio** | The plugin and bridge (`viz-studio.sock`) that draw diagrams into `Visualizations/` |
| **The door** | `openclaw-obsidian`, Claude's single, limited way into Obsidian |
| **Copilot** | The chat and agent plugin inside Obsidian |
| **YubiKey touch** | The physical approval required for real runs and privileged actions |
| **OpenClaw** | The open-source agent framework the engine is built on |

## The business

| Term | Meaning |
|---|---|
| **Trevor Robey, INC.** | The wordmark (INC = Intelligence Network Citations) |
| **TRINC** | Trevor Robey Intelligence Network Citations; also the repository's name |
| **ICP** | Ideal customer profile: a named buyer segment |
| **SKU** | A priced product on the ladder |
| **Ladder** | The priced list in `ENGINE/OFFERINGS.md` |
| **Speed SLA / Citation-Audit SLA** | The written turnaround promise / the refund-backed citation promise |
| **AWS private offer** | A custom-priced AWS Marketplace offer to one buyer, paid through their AWS bill |
| **AWS Data Exchange (ADX)** | AWS's marketplace for data products; where the feed will be listed |
| **PHI** | Protected health information (patient data); never used |
