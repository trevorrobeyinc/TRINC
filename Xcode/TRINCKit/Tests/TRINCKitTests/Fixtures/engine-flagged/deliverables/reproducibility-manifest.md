# Reproducibility Manifest

Delivery decision: **DELIVER_WITH_FLAGS** — flags: attribution_mismatch
> The engine's decision lets this report ship with a flag: 1 cited work resolves to a real record, but the author or year written beside it is not the record's. It is marked [ATTRIBUTION MISMATCH] in the report and listed under "Attribution check" below; correct the attribution before relying on it.
As of: 2026-11-05

Citations re-resolved when this report was assembled (as of 2026-11-05): **3 VERIFIED · 0 UNRESOLVED · 0 UNCHECKED** of 3 (verified ratio 1).
Retraction screen: checked; retracted DOIs: 0; retracted PMIDs: 0.

## Attribution check

Author and year written beside each cited DOI / PMID, compared with its registry record (Crossref / NCBI): 2 identifiers checked · 1 match · 1 mismatch · 0 not checkable (no single author named beside the identifier, or no registry author list).

| Type | Identifier | Report says | Registry lists | Result |
|---|---|---|---|---|
| DOI | 10.0000/fixture.2 | Chio, 2022 | Feldman et al., 2022 | author mismatch |

_A citation is checked only where the report names a single author ("X et al.", "X & Y") beside it; a name matches when it is anywhere on the record's author list. This checks who wrote the cited work and when, not what the report says about it._

| Type | Identifier | Status | HTTP | Resolved URL | Checked (UTC) |
|---|---|---|---|---|---|
| NCT | NCT00000002 | VERIFIED | 200 | https://clinicaltrials.gov/api/v2/studies/NCT00000002?format=json | 2026-11-05T00:00:00.000Z |
| DOI | 10.0000/fixture.2 | VERIFIED | 200 | https://api.crossref.org/works/10.0000%2Ffixture.2/agency | 2026-11-05T00:00:00.000Z |
| PMID | 00000002 | VERIFIED | 200 | https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=00000002&retmode=json | 2026-11-05T00:00:00.000Z |

_Each VERIFIED identifier resolved to an existing record in its issuing public registry at the time shown. Verification confirms the identifier RESOLVES — not the scientific correctness of the source. UNCHECKED = no definitive answer this run (reason recorded per identifier); never treated as verified._