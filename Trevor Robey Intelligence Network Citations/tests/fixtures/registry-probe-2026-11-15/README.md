# Registry answers behind the T2-16 resolvers (read live, 2026-11-15)

Read-only GET requests with a generic User-Agent and no contact details, made while drafting Tier 2
(`engine-tier2-change-list-2026-11-15.md`, §2) and again when these files were saved on 2026-11-16.
The real ids belong to the RECOVERY trial (ISRCTN50189673, EudraCT 2020-001113-21, NCT04381936) and its
dexamethasone paper (PMID 32678530, PMCID PMC7383595). The invented ids were chosen not to exist.

| File | Request | What it pins |
|---|---|---|
| `pmc-esummary-real-7383595.json` | NCBI `esummary.fcgi?db=pmc&id=7383595&retmode=json` | a PMC docsum echoes its PMCID in `articleids` and lists the paper's PMID and DOI (trimmed to `uid`, `error`, `articleids`, `title`) |
| `pmc-esummary-invented-99999999.json` | the same for `id=99999999` | PMC's definitive "does not exist": `error: "cannot get document summary"` |
| `isrctn-api-real-ISRCTN50189673.xml` | `isrctn.com/api/query/format/default?q=ISRCTN50189673` | `totalCount="1"` and `publicIdentifierCanonical` echoing the id. An EXCERPT: the root and first trial opening tags and the `<isrctn>` element as received, closed by hand (the full answer is about 148 KB) |
| `isrctn-api-invented-ISRCTN98765432.xml` | the same for `ISRCTN98765432` | the whole answer: `totalCount="0"` |
| `euctr-download-real-2020-001113-21.txt` | `clinicaltrialsregister.eu/ctr-search/rest/download/summary?mode=current_page&query=2020-001113-21` | the whole answer: a record that echoes `EudraCT Number: 2020-001113-21` |
| `euctr-download-invented-2020-999999-98.txt` | the same for `2020-999999-98` | the whole answer: an empty 200, which is not a "does not exist" (the register does not publish every EudraCT trial) |

The ISRCTN record page (`isrctn.com/ISRCTN<n>`) answered 200 with the same 1,206-byte page for the real
and the invented id, which is why the resolver reads the query API instead.
