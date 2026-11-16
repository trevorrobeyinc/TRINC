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

**T2-2 (PubMed's editorial notices), saved 2026-11-16, trimmed to `uid`, `pubtype`, `references`, `title`:**

| File | Request | What it pins |
|---|---|---|
| `pubmed-esummary-eoc-25065594.json` | NCBI `esummary.fcgi?db=pubmed&id=25065594` | a paper under an expression of concern: reference type exactly "Expression of concern in", publication type unchanged |
| `pubmed-esummary-retracted-9500320.json` | the same for `id=9500320` (the 1998 Lancet paper) | "Retracted Publication" with the references "Retraction in", "Expression of concern in" and "Comment in" |

A paced probe the same day found no PubMed marker that sets a partial retraction apart: the publication
types "Partial Retraction" and "Retraction of Publication" and the filter "haspartialretractionin" all
return nothing, while "hasretractionin" returns 35,624 records whose samples all carry "Retracted
Publication". So a "Retraction in" link on a record not marked retracted is a ledger flag, never a block.

**T2-6 (NCT numbers in batches), saved 2026-11-16, whole answers (the opaque `nextPageToken` cursor trimmed):**

| File | Request | What it pins |
|---|---|---|
| `ctgov-batch-real-plus-invented.json` | `clinicaltrials.gov/api/v2/studies?filter.ids=NCT04381936,NCT99999998&fields=NCTId&pageSize=2&format=json` | a batch echoes each real number and leaves an invented one out, with no error |
| `ctgov-batch-short-number-padded.json` | the same for `NCT04381936,NCT1234` | the API pads a short number: `NCT1234` came back as `NCT00001234`, so only an EXACT echo counts |

The same paced probe sent the 110 NCT numbers of a shipped graveyard memo in one request (a
1,641-character URL: all 110 echoed, 0.28 s) and 300 of the 1,420 in another shipped memo (4,288
characters: all 300 echoed, 0.41 s). No rate-limit header was returned. A full page carries a
`nextPageToken` even when every number asked for came back, so the resolver never reads the cursor:
a number missing from the echo goes to the one-study request instead.
