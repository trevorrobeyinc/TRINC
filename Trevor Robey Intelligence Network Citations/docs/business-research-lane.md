# Business research lane (2026-10-21)

The engine was biomedical-only because the citation gate could only ground and re-resolve
registry identifiers (PMID, NCT, DOI, ChEMBL, CID, UniProt). The business lane removes that
limit **inside the same engine**: same roles, same citation gate, same reproducibility manifest,
same operator approval and sealed bundle. A workflow template opts in with
`"research_profile": "business"`; with no profile, every biomedical path is unchanged.

## Why a module, not a second engine
The value of the product is the gate (claims without a verifiable identifier fail instead of
passing with a warning). A second engine would mean a second gate to keep honest. Instead the
business lane adds new **identifier types** the existing gate already knows how to treat.

## New citable identifiers
| Cite as | Source | Grounding (in the run's evidence) | Re-resolution at delivery |
|---|---|---|---|
| `WEB: <12 hex>` | Any HTTPS page read via SearXNG + extract | id = first 12 hex of sha256(url + "\n" + text) of the exact text the model saw | Re-hash the stored snapshot. Missing or altered = UNRESOLVED. Proves "exactly what was read, from this URL, at this time", **not** that the page is live or correct |
| `SEC: <cik>/<accession>` | SEC EDGAR 10-K / 10-Q / 8-K | from the SEC filings fetcher | EDGAR filing index JSON (404 = UNRESOLVED, 403 = UNCHECKED) |
| `WB: <indicator>` | World Bank Indicators API | from the World Bank fetcher | `/v2/indicator/<id>` |
| `doi: 10.x/...` | OpenAlex (has_doi only) | existing DOI path | existing Crossref path + retraction screen |

## Where it lives
- `openclaw-bridge/core/research-profiles.js` — the profile table (prefetch map, SOUL file, citation instruction, section-gate topic and primary domains).
- `openclaw-bridge/mcp/business-sources/` — `web-snapshot-store.js`, `web-evidence.js`, `sec-filings.js`, `world-bank.js`, `openalex.js`, `search-terms.js`.
- `config/tool-prefetch-map.business.json`, `config/agents/{scout,analyst,synthesizer}/SOUL.business.md`.
- Templates: `business-research-pack`, `cost-reduction-analysis`, `market-landscape`.
- Seams: `citation-extractor.js` (3 patterns), `citation-reresolver.js` (3 resolvers), `tool-prefetch.js`, `agent-context-loader.js`, `role-router.js`, `agent-engine.js`, `workflow-engine.js` (defaults, quality audit, section gate, packager hand-off), `workflow-schema.js`, `section-gate.js`, `scripts/_workflow-runtime.js`.
- Packaging: `deliverable-packager.js` picks business wording (sources, registries, disclaimer) and ships every cited web page under `deliverables/sources/` (a page that trips the license screen is withheld and named, not shipped).
- Tests: `tests/core/business-research-lane.test.js` (offline, injected fakes).

## Searching with keywords, keeping only on-topic pages (2026-10-21)
The templates pass the operator's question as `{{topic}}`. Sent verbatim, it fails as a search:
OpenAlex returned **zero** works for "Where can a mid-size US 3PL warehouse cut labour and energy
cost?" and relevant ones for its content words. `search-terms.js` reduces the subject (plus any focus
words) to its content words; `web-evidence.js` and `openalex.js` search with that. The question itself
stays the mission text the agents read.

The gate proves a `WEB:` id was fetched at runtime; it cannot tell whether the page is about the
question. So `web-evidence.js` `isOnTopic` drops a page unless it mentions at least half of the
subject's content words (matched by a 4-character stem at a word start, so labour~labor and
warehouse~warehousing). A dropped page is neither stored nor shown. Checked live against the junk
the degraded search returned (a utility's homepage, dictionary entries for "can", local warehouse
rental listings): all dropped; on-topic pages kept.

## Live-run status (2026-10-21)
**Zero live runs. The first one is parked by the operator** until a working, specialized evidence back
end exists. Pre-flight found the local SearXNG unusable for general web search: in the `general`
category only Bing answers (DuckDuckGo and Startpage hit CAPTCHAs, the Brave scraper is rate-limited,
Google and Mojeek return nothing), and Bing answers a multi-word query for one of its words. SearXNG
builds the right request, so this is the search engine's response to a scraper; it is not to be worked
around. With the relevance guard the lane degrades honestly (no junk evidence), but a report would rest
on OpenAlex, World Bank and SEC alone. The proposed back end ("Evidence Desk") adds official statistics
with re-resolvable series ids (BLS and Eurostat keyless; Census and EIA with free keys), a legitimate
general-web API, and an extractive passage condenser that cuts role-call input. The run inputs will be
chosen once that exists.

All the other dependencies answered on 2026-10-21: SEC EDGAR full-text search and filing index (with a
declared organisation + contact User-Agent, per SEC fair access), World Bank, OpenAlex, Crossref,
SearXNG `:8891` (reachable), and Miyo.

## Starting one from Copilot chat
Command Center discovers templates from the folder, so the business templates are listed automatically.
Its template list carries `researchProfile` and `optionalInputs` (`company` / `competitors` decide
whether SEC filings fire), and the run tool's input hint names the business inputs. Values must come
from the operator's own words. Live once the rebuilt plugin is deployed (`ops/tr-suite/deploy.sh`).

## Running one (on the Mac; needs the network)
```
cd "/Users/myhome/TrevClaw-Obsidianodus/Trevor Robey Intelligence Network Citations" && scripts/run-workflow.sh --template cost-reduction-analysis --inputs '{"topic":"Where can a mid-size US 3PL warehouse cut labour and energy cost?","industry":"warehousing and logistics","country":"US"}' --operator-approve --confirm
```
Arm the YubiKey approval gate first, as for any run.

## Limits to keep in the copy
- A WEB citation verifies the snapshot, not the page's truth. Guarantee wording must say so.
- Paywalled or JavaScript-only pages are skipped (under 200 characters extracted).
- Not investment, legal, tax or accounting advice.
