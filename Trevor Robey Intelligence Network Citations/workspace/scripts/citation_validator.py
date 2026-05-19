#!/usr/bin/env python3
"""
citation_validator.py — Reproducibility Manifest builder for OpenClaw research packs.

Extracts every citable identifier from a pack (PMID, NCT, DOI, RxCUI, ChEMBL ID,
PubChem CID, UniProt ID), validates each against its source database, and emits
a JSON Reproducibility Manifest with per-citation {id, type, source_url, verified,
evidence, confidence, timestamp}.

Usage:
    python citation_validator.py path/to/pack.md > manifest.json
    python citation_validator.py path/to/pack.pdf --pdf > manifest.json
    python citation_validator.py path/to/pack.md --strict   # nonzero exit on any failure

Dependencies:
    pip install httpx[http2] pypdf

Source authorities used:
    - PMID  → NCBI E-utilities efetch (https://eutils.ncbi.nlm.nih.gov)
    - NCT   → ClinicalTrials.gov v2 API (https://clinicaltrials.gov/api/v2/studies)
    - DOI   → Crossref REST + Unpaywall OA check
    - RxCUI → RxNav (https://rxnav.nlm.nih.gov)
    - ChEMBL ID → ChEMBL REST (https://www.ebi.ac.uk/chembl/api/data)
    - PubChem CID → PubChem PUG REST
    - UniProt → UniProt REST
"""

from __future__ import annotations
import argparse, asyncio, json, re, sys, datetime, pathlib, os
from typing import Iterable

try:
    import httpx
except ImportError:
    sys.exit("missing dep: pip install httpx[http2]")

UA = "OpenClawCitationValidator/1.0 (mailto:trevor@trevorobeyinc.com)"
TIMEOUT = httpx.Timeout(15.0, connect=10.0)
UNPAYWALL_EMAIL = os.environ.get("UNPAYWALL_EMAIL", "trevor@trevorobeyinc.com")

PATTERNS = {
    "PMID":      re.compile(r"\bPMID[: ]\s*(\d{4,9})\b", re.I),
    "NCT":       re.compile(r"\bNCT0\d{7}\b"),
    "DOI":       re.compile(r"\b10\.\d{4,9}/[-._;()/:A-Z0-9]+\b", re.I),
    "RxCUI":     re.compile(r"\bRxCUI[: ]\s*(\d{1,8})\b", re.I),
    "ChEMBL":    re.compile(r"\bCHEMBL\d{1,9}\b", re.I),
    "PubChem":   re.compile(r"\bCID[: ]\s*(\d{1,10})\b", re.I),
    "UniProt":   re.compile(r"\b[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9](?:[A-Z][A-Z0-9]{2}[0-9]){1,2}\b"),
}

def extract_text(path: pathlib.Path, pdf_mode: bool) -> str:
    if pdf_mode or path.suffix.lower() == ".pdf":
        from pypdf import PdfReader  # lazy import
        return "\n".join(p.extract_text() or "" for p in PdfReader(str(path)).pages)
    return path.read_text(encoding="utf-8", errors="ignore")

def extract_ids(text: str) -> list[dict]:
    seen, ids = set(), []
    for kind, pat in PATTERNS.items():
        for m in pat.finditer(text):
            raw = m.group(0)
            value = m.group(1) if m.groups() else raw
            key = (kind, value)
            if key in seen: continue
            seen.add(key)
            ids.append({"type": kind, "id": value})
    return ids

async def check_pmid(client, value: str) -> dict:
    url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id={value}&retmode=json"
    r = await client.get(url, headers={"User-Agent": UA})
    ok = r.status_code == 200 and value in r.text and '"error"' not in r.text
    return {"verified": ok, "source_url": f"https://pubmed.ncbi.nlm.nih.gov/{value}/", "evidence": "esummary returned record" if ok else "esummary missing or error"}

async def check_nct(client, value: str) -> dict:
    url = f"https://clinicaltrials.gov/api/v2/studies/{value}?fields=NCTId,BriefTitle"
    r = await client.get(url, headers={"User-Agent": UA})
    return {"verified": r.status_code == 200, "source_url": f"https://clinicaltrials.gov/study/{value}", "evidence": f"v2 API status {r.status_code}"}

async def check_doi(client, value: str) -> dict:
    cr = await client.get(f"https://api.crossref.org/works/{value}", headers={"User-Agent": UA})
    cr_ok = cr.status_code == 200
    up_oa = None
    try:
        up = await client.get(f"https://api.unpaywall.org/v2/{value}?email={UNPAYWALL_EMAIL}", headers={"User-Agent": UA})
        if up.status_code == 200:
            up_oa = bool(up.json().get("is_oa"))
    except Exception:
        pass
    return {"verified": cr_ok, "source_url": f"https://doi.org/{value}", "evidence": f"crossref={cr.status_code}; unpaywall_oa={up_oa}"}

async def check_rxcui(client, value: str) -> dict:
    url = f"https://rxnav.nlm.nih.gov/REST/rxcui/{value}/properties.json"
    r = await client.get(url, headers={"User-Agent": UA})
    return {"verified": r.status_code == 200 and "properties" in r.text, "source_url": f"https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm={value}", "evidence": f"rxnav status {r.status_code}"}

async def check_chembl(client, value: str) -> dict:
    url = f"https://www.ebi.ac.uk/chembl/api/data/molecule/{value}.json"
    r = await client.get(url, headers={"User-Agent": UA})
    return {"verified": r.status_code == 200, "source_url": f"https://www.ebi.ac.uk/chembl/compound_report_card/{value}/", "evidence": f"chembl status {r.status_code}"}

async def check_pubchem(client, value: str) -> dict:
    url = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/{value}/property/Title/JSON"
    r = await client.get(url, headers={"User-Agent": UA})
    return {"verified": r.status_code == 200, "source_url": f"https://pubchem.ncbi.nlm.nih.gov/compound/{value}", "evidence": f"pubchem status {r.status_code}"}

async def check_uniprot(client, value: str) -> dict:
    url = f"https://rest.uniprot.org/uniprotkb/{value}.json"
    r = await client.get(url, headers={"User-Agent": UA})
    return {"verified": r.status_code == 200, "source_url": f"https://www.uniprot.org/uniprotkb/{value}", "evidence": f"uniprot status {r.status_code}"}

CHECKERS = {"PMID": check_pmid, "NCT": check_nct, "DOI": check_doi, "RxCUI": check_rxcui, "ChEMBL": check_chembl, "PubChem": check_pubchem, "UniProt": check_uniprot}

async def validate_all(items: list[dict]) -> list[dict]:
    async with httpx.AsyncClient(timeout=TIMEOUT, http2=True) as client:
        async def one(item):
            try:
                res = await CHECKERS[item["type"]](client, item["id"])
            except Exception as e:
                res = {"verified": False, "source_url": None, "evidence": f"exception: {e}"}
            return {**item, **res, "confidence": 0.95 if res["verified"] else 0.05, "timestamp": datetime.datetime.utcnow().isoformat() + "Z"}
        return await asyncio.gather(*(one(i) for i in items))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path", type=pathlib.Path, help="Path to pack (.md or .pdf)")
    ap.add_argument("--pdf", action="store_true", help="Force PDF parsing")
    ap.add_argument("--strict", action="store_true", help="Exit nonzero if any citation fails")
    args = ap.parse_args()

    text = extract_text(args.path, args.pdf)
    items = extract_ids(text)
    if not items:
        sys.exit("no recognizable citations found")
    results = asyncio.run(validate_all(items))
    failed = [r for r in results if not r["verified"]]
    manifest = {"pack_path": str(args.path), "generated_at": datetime.datetime.utcnow().isoformat() + "Z", "total": len(results), "verified": len(results) - len(failed), "failed": len(failed), "citations": results}
    print(json.dumps(manifest, indent=2))
    if args.strict and failed:
        sys.exit(f"{len(failed)} citation(s) failed validation")

if __name__ == "__main__":
    main()
