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
| `BLS: <series id>` | BLS Public Data API (Evidence Desk) | from the BLS fetcher | re-requests the series: data = VERIFIED, "Series does not exist" = UNRESOLVED, a refusal = UNCHECKED |
| `EUROSTAT: <dataset>` | Eurostat dissemination API (Evidence Desk) | from the Eurostat fetcher | SDMX dataflow: `<s:Dataflow id>` = VERIFIED, 404 = UNRESOLVED |
| `CENSUS: cbp/<year>/<NAICS>` | Census County Business Patterns (Evidence Desk P2, needs key) | from the Census fetcher | re-queries with the key; no key = UNCHECKED `no_api_key` |
| `EIA: <series id>` | EIA API v2 (Evidence Desk P2, needs key) | from the EIA fetcher | `/v2/seriesid/<id>` with the key; no key = UNCHECKED `no_api_key` |
| `doi: 10.x/...` | OpenAlex (has_doi only) | existing DOI path | existing Crossref path + retraction screen |

## Where it lives
- `openclaw-bridge/core/research-profiles.js` — the profile table (prefetch map, SOUL file, citation instruction, section-gate topic and primary domains, derived inputs, desk-authored roles).
- `openclaw-bridge/mcp/business-sources/` — `web-snapshot-store.js`, `web-evidence.js`, `sec-filings.js`, `world-bank.js`, `openalex.js`, `search-terms.js`, and the Evidence Desk: `polite-http.js`, `series-map.js`, `bls.js`, `eurostat.js`, `census.js`, `eia.js`, `passage-condenser.js`, `evidence-desk.js`.
- `config/tool-prefetch-map.business.json`, `config/business-series-map.json`, `config/agents/{scout,analyst,synthesizer}/SOUL.business.md`.
- Templates: `business-research-pack`, `cost-reduction-analysis`, `market-landscape`.
- Seams: `citation-extractor.js` (7 patterns), `citation-reresolver.js` (7 resolvers), `tool-prefetch.js` (`requires`, `local_only`, attached records), `agent-context-loader.js`, `role-router.js`, `agent-engine.js` (desk-authored roles), `citation-gate.js` (model-text-only ratio), `research-output-manager.js` (`authored_by`), `workflow-engine.js` (defaults and derived inputs, quality audit, section gate, packager hand-off), `workflow-schema.js`, `section-gate.js`, `scripts/_workflow-runtime.js`.
- Packaging: `deliverable-packager.js` picks business wording (sources, registries, disclaimer) and ships every cited web page under `deliverables/sources/` (a page that trips the license screen is withheld and named, not shipped).
- Registry: `config/connector-registry.json` entries `bls-series`, `eurostat-series`, `census-business-patterns`, `eia-energy-prices`.
- Tests: `tests/core/business-research-lane.test.js` and `tests/core/evidence-desk.test.js` (offline, injected fakes).

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

## Evidence Desk (built 2026-10-21)
The specialized, deterministic evidence back end the operator asked for before the first live run. No
new model and no new listener: the engine stays 100% Claude, and every piece below is deterministic code
with offline tests (`tests/core/evidence-desk.test.js`).

**Operator decisions (2026-10-21, AskUserQuestion):** Brave Search API **later** (P3 not built); free
Census + EIA keys **yes**, the operator registers them (P2 built, dormant until then); the business scout
is **replaced** by a deterministic brief; P1 confirmed as an exception to the 2026-10-20 freeze; the
citation gate **judges model text only**; the business section gate uses the **`science`** topic until
Brave exists (SearXNG's science category then; Europe PMC + Crossref queried directly since 2026-11-15).

### 1. Official statistics with re-resolvable series ids
| Source | Fetcher | Applies when | Access | Live check (2026-10-21) |
|---|---|---|---|---|
| BLS (wages, employment, prices by industry) | `bls.js`, tool `bls_series` | U.S. run (`us_scope`) | keyless v1: 25 queries a day, 25 series a query; optional `BLS_API_KEY` → v2 (500 a day) | all 23 mapped series returned data in ONE batched POST; an invented id answered "Series does not exist for Series …" with an empty data array |
| Eurostat (non-household electricity and gas prices, hourly labour cost by NACE) | `eurostat.js`, tool `eurostat_series` | European run (`eurostat_geo`) | keyless | every mapped filter returned exactly one value for DE and EU27_2020; an invented dataset answered 404 `ERR_NOT_FOUND_4` |
| Census County Business Patterns (establishments, employees, payroll) | `census.js`, tool `census_business_patterns` | U.S. run, **and** `CENSUS_API_KEY` set | free key | CBP 2023 and its variables confirmed from keyless metadata; a keyless data call answers **HTTP 200 with an HTML "Missing Key" page**, so a 200 is never trusted without JSON |
| EIA (retail electricity and natural-gas prices) | `eia.js`, tool `eia_energy_prices` | U.S. run, **and** `EIA_API_KEY` set | free key | **not live-verified** (every request needs a key) |

Which series a run pulls comes from `config/business-series-map.json`, never from the model: nine
industries (warehousing, trucking, manufacturing, retail, health care and social assistance, food
services, construction, professional services, information), each with its NAICS code, nearest NACE
section and BLS series, plus default series every run gets (CPI all items, CPI electricity,
unemployment rate; the two Eurostat energy datasets). An industry matches by a word-start term in the
`industry` input first, then in the `topic`; an unmatched run gets only the defaults. Every id in the map
was requested from its API before it was committed, and the file says how (`reviewed`). Titles and units
come from the map because BLS returns values only; the employment levels BLS returned confirmed each
industry's scope (CES6562000001 = 23.96 million is health care **and social assistance**, so it is
titled that way).

Values are shown exactly as the agency published them, with its period, geography and its own flags
(BLS "preliminary", Eurostat "provisional"/"estimated"). A refusal, a daily limit or an HTTP error is
**thrown**, so the search-coverage ledger records the source as *failed*, never as an honest zero.
Nothing retries around a limit. Every request names the requester:
`Trevor Robey Intelligence Network Citations LLC trevor@trevorobeyinc.com` (`polite-http.js`; World Bank
and OpenAlex now send it too, which they did not before).

Scoping is derived, not typed: `research-profiles.js` `deriveBusinessInputs` turns the run's `country`
into `us_scope` (US/USA) and `eurostat_geo` (EU27 plus EFTA ISO codes; Greece → `EL`; `EU` →
`EU27_2020`). Map entries carry `requires: [...]` and `local_only: true`; `tool-prefetch.js` records an
entry whose input is empty, or whose fetcher is not wired, as **skipped** (a configuration no-op) and
never sends it to ToolUniverse. The runtime wires Census and EIA only when their keys exist.

### 2. Extractive passage condenser (the token lever)
`passage-condenser.js`: a web page is split into passages (lines joined up to 600 characters, a blank
line always ends one, over-long lines split at sentence ends), ranked by BM25 against the subject plus
focus words with a capped boost (up to ×1.6) for passages carrying money, percentages and numbers, and
the top 3 are shown **verbatim** with their character offsets: `¶<n> [chars a–b]`, cited as
`WEB: <id> ¶<n>`. The snapshot stored (and so the WEB hash) is still the full page; every passage is
exactly `snapshot.text.slice(a, b)`, so anyone can find the quote in `sources/WEB-<id>.md`. The boost
multiplies BM25, so a footer full of years scores zero. A short term (three letters or fewer) matches a
whole token only, so "per" never matches "percent".

Per page the prompt now carries at most 3 × 600 characters plus a one-line header, against a fixed 2,500
before, and the characters it carries are the ranked ones rather than the page's opening (mostly
navigation). **No saving is quoted yet**: there are no stored business snapshots on disk to measure, so
the first run measures it.

### 3. The scout is the Evidence Desk (no model call)
`evidence-desk.js` builds the business scout's section from the scout's own fetched records: an
official-statistics table (identifier, series, value, unit, period, geography), the ranked web passages
with their `¶` references, published research (DOI, title, opening of the abstract), company filings, and
what every search returned (records / honest zero / failed / not run). `agent-engine.js` uses it for any
role the profile lists in `deskAuthoredRoles` (business: `scout`). Approvals, prefetch,
`fetched_citation_ids` and the grounded-citation check are unchanged; only the model call is replaced
(provider `evidence-desk`, 0 tokens). If the Desk is absent or fails, the role makes its model call as
before. Same records → same brief, byte for byte. Every identifier in the brief comes from a record this
role fetched, so it is grounded by construction. Context-only documents are never used, which is why the
vault read-back moved from the scout to the analyst in the business map. This removes one of three role
calls per business run; the analyst reads the brief instead of a model's summary.

**The gate judges model text only** (operator decision). Because the brief is grounded by construction,
counting it would pad the 0.75 ratio: in the test fixture, model text at 2 of 3 grounded (0.667, blocked)
reads 5 of 6 (0.833, passed) once the brief is counted. So `citation-gate.js` computes the ratio, and
`workflow-engine.js` the citation-density audit, over sections whose metadata is not
`authored_by: "evidence-desk"` (`research-output-manager.js` allowlists the key; unreadable metadata counts
as model text, the strict side). The brief still ships, and is still retraction-screened, re-resolved,
annotated and license-scanned. `citation-verification.json` lists the sections the ratio did not judge
(`desk_authored_sections`). On the biomedical lane nothing changes.

### 4. Section gate on `science`
The quality-audit section gate searched SearXNG `general` for business sections, which returns Bing
junk; junk grades D, and a section with zero A/B/C sources throws `PHASE30_CITATION_COVERAGE_ZERO`
**after** every role call has been paid for. The business profile now uses `science`, with the question
reduced to its content words (`toSearchQuery`), the same grading and the same thresholds. `science` was
SearXNG's science category until 2026-11-15 (its engines: PubMed, Europe PMC, Semantic Scholar, Crossref,
OpenAlex, eLife and OpenAIRE among them; arXiv had been disabled since 2026-09-19), when every one of its
engines timed out at once; it is now Europe PMC + Crossref queried directly
(`openclaw-bridge/mcp/scholarly-search/`, free and keyless). For a business section Crossref carries the
load, since Europe PMC indexes the life sciences only. Two consequences (S1 review, 2026-11-15):
- a Crossref outage cannot fail a business section: one source down while the other found nothing marks
  the section UNCHECKED, never zero coverage;
- Crossref's kept work types are journal articles, preprints, proceedings articles and book chapters, so
  agency technical reports (OSTI, NBER and the like), dissertations and books do not count toward a
  business section's coverage. Whether they should is an open operator decision.

Revert to `general` once a general-web engine is live (Brave's Search API, P3, now needs a card: its free
tier ended in 2026).

## P2 activation (when the operator registers the keys)
1. Register the free keys: Census (api.census.gov/data/key_signup.html), EIA (eia.gov/opendata), and
   optionally BLS (data.bls.gov/registrationEngine), which lifts the keyless 25-queries-a-day limit.
2. Store each in Keychain and expose it to the engine's environment as `CENSUS_API_KEY`, `EIA_API_KEY`,
   `BLS_API_KEY` (the Keychain → LaunchAgent `launchctl setenv` pattern; quit and reopen Obsidian so a
   Command Center-dispatched run inherits it). Never in git, never in a config file.
3. Request each mapped Census and EIA id once and confirm the response shapes `census.js` / `eia.js`
   parse; set `"verified": true` on the EIA ids in the series map only after that.
4. Then add the Census and EIA rows to the business data-sources copy in `deliverable-packager.js`, which
   today names only the sources that run.

## Live-run status (2026-10-21)
**Zero live runs. The first one was parked by the operator** until a working, specialized evidence back
end existed. Pre-flight found the local SearXNG unusable for general web search: in the `general`
category only Bing answers (DuckDuckGo and Startpage hit CAPTCHAs, the Brave scraper is rate-limited,
Google and Mojeek return nothing), and Bing answers a multi-word query for one of its words. SearXNG
builds the right request, so this is the search engine's response to a scraper; it is not to be worked
around. **The Evidence Desk (above) is that back end, P1 built and offline-tested.** The run still needs
the operator's explicit go and a freshly armed `operator-approve` token.

## Recommended first run (for the operator to approve)
`cost-reduction-analysis`, U.S. scope, warehousing:
```
{"topic":"Where can a mid-size US 3PL warehouse cut labour and energy cost?","industry":"warehousing and logistics","country":"US"}
```
Why this set: it is the question already pre-flighted, and every keyless source has real coverage for it.
`industry` matches the warehousing row of the series map, so BLS returns average hourly earnings (all
employees, and production/nonsupervisory), employment, and the general warehousing PPI for NAICS 493,
plus CPI all items, CPI electricity and the unemployment rate: 7 series in one query. OpenAlex returned 8
relevant works for this question's keywords in the pre-flight. World Bank adds the U.S. macro context.
Eurostat, Census and EIA are recorded as skipped (U.S. run, no keys). Web pages are likely to be few or
none while general search is Bing-only, and the relevance guard keeps the junk out. Leave `company`
empty unless the operator names a public company to benchmark (SEC filings fire only then; the value must
be the operator's own words).

Before it: BLS keyless allows 25 queries a day; this run spends 1 at prefetch plus 1 per cited BLS id at
delivery (about 8 in all), so avoid repeated runs the same day without `BLS_API_KEY`, or a rate-limited id
re-resolves UNCHECKED and forfeits the full DELIVER claim. Dispatch through the Command Center lane with
Obsidian open, after a freshly armed `operator-approve` token. Measure on it: per-role prompt sizes and
tokens (the scout should show 0), section-gate coverage on `science`, and how many web pages survived.

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
cd "/Users/myhome/TRINC/Trevor Robey Intelligence Network Citations" && scripts/run-workflow.sh --template cost-reduction-analysis --inputs '{"topic":"Where can a mid-size US 3PL warehouse cut labour and energy cost?","industry":"warehousing and logistics","country":"US"}' --operator-approve --confirm
```
Arm the YubiKey approval gate first, as for any run.

## Limits to keep in the copy
- A WEB citation verifies the snapshot, not the page's truth. Guarantee wording must say so.
- Paywalled or JavaScript-only pages are skipped (under 200 characters extracted).
- A statistics citation (BLS / EUROSTAT / CENSUS / EIA) re-resolves the series or dataset, not the value:
  the value is shown as the agency published it on the retrieval date, and agencies revise.
- The Evidence Brief quotes passages verbatim, so an identifier a *web page itself* printed (a DOI, a
  PMID) becomes a cited identifier of the report and is re-resolved like any other. A malformed one would
  re-resolve UNRESOLVED and block delivery (fail-closed, not a silent pass).
- The brief is shipped under the role label the packager uses for the scout section ("Literature
  Review"); a business-specific label is a follow-up.
- Not investment, legal, tax or accounting advice.
