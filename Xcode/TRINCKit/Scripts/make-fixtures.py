"""Regenerate TRINCKit's test fixtures (synthetic data, never a deliverable).

    /usr/bin/python3 -I /Users/myhome/TRINC/Xcode/TRINCKit/Scripts/make-fixtures.py

Writes Tests/TRINCKitTests/Fixtures/: a sealed-bundle folder and four ZIPs built with Python's own
zipfile module, so the Swift ZIP reader is checked against an independent implementation:
  bundle.zip         deflate, entries at the root (the engine's layout)
  bundle-nested.zip  deflate, everything under one top-level folder (a re-zipped bundle)
  bundle-stored.zip  no compression
  tampered.zip       report.md changed AFTER the manifest was written
Fixed timestamps keep the output byte-stable between runs. It replaces only its own outputs: the
engine-built fixture (engine-flagged/ and engine-flagged.zip) comes from make-engine-fixtures.js.
Reason codes are the engine's own (reproducibility-manifest.js), never free text.
"""
import hashlib
import json
import os
import shutil
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "Tests", "TRINCKitTests", "Fixtures")
STAMP = (2026, 11, 5, 0, 0, 0)

REPORT = """# Fixture Report

**FIXTURE — synthetic test data, not a client deliverable.**

## Findings

A paragraph that cites PMID:00000001 and NCT00000000,
continued on a second line.

- first point
- second point

| Program | Phase |
| --- | --- |
| Alpha \\| Beta | 3 |
| Gamma | 2 |

---

> A quoted note.
"""

CITATION_INTEGRITY = """# Citation Integrity & Provenance

**FIXTURE.** Three identifiers, one unresolved.
"""

TABLE = 'name,note\r\n"Alpha, Inc.","said ""ok"""\r\nGamma,"two\nlines"\r\n'

REPRO = {
    "citations": [
        {"id": "00000001", "type": "PMID", "status": "VERIFIED", "checked_at": "2026-11-05T00:00:00Z",
         "grounded_in_run": True},
        {"id": "NCT00000000", "type": "NCT", "status": "VERIFIED", "checked_at": "2026-11-05T00:00:00Z",
         "grounded_in_run": True},
        {"id": "10.0000/fixture.1", "type": "DOI", "status": "UNRESOLVED", "checked_at": "2026-11-05T00:00:00Z",
         "grounded_in_run": False},
    ],
    "summary": {
        "report_id": "mission-fixture",
        "delivery_id": "workflow-fixture",
        "as_of": "2026-11-05",
        "counts": {"total": 3, "verified": 2, "unresolved": 1, "unchecked": 0},
        "by_type": {"PMID": {"total": 1, "verified": 1, "unresolved": 0, "unchecked": 0},
                    "NCT": {"total": 1, "verified": 1, "unresolved": 0, "unchecked": 0},
                    "DOI": {"total": 1, "verified": 0, "unresolved": 1, "unchecked": 0}},
        "delivery_decision": "BLOCK",
        "block_reasons": ["unresolved_present"],
        "flag_reasons": [],
        "retraction_screen": {"checked": True, "retracted_dois": [], "retracted_pmids": []},
        "gate_crosscheck": {"cited": 3, "grounded": 2, "ungrounded": 1, "grounded_ratio": 0.667,
                            "min_grounded_ratio": 0.75},
    },
}

METADATA = {"offer_title": "Fixture benchmark (synthetic)", "product_line": "biomedical_research_packs",
            "tier": "standard", "offer_id": "offer-fixture"}

CONTENT = {
    "deliverables/report.md": REPORT.encode(),
    "deliverables/citation-integrity.md": CITATION_INTEGRITY.encode(),
    "deliverables/tables.csv": TABLE.encode(),
    "deliverables/reproducibility-manifest.json": json.dumps(REPRO, indent=2).encode(),
    "metadata.json": json.dumps(METADATA, indent=2).encode(),
}


def manifest_for(content):
    listed = [p for p in sorted(content) if p != "metadata.json"]  # metadata.json left uncovered on purpose
    return json.dumps({
        "schema_version": "phase19-release-manifest-v1",
        "files": [{"file": p, "sha256": hashlib.sha256(content[p]).hexdigest()} for p in listed],
    }, indent=2).encode()


def write_zip(path, files, method, prefix=""):
    with zipfile.ZipFile(path, "w", compression=method) as z:
        for name in sorted(files):
            info = zipfile.ZipInfo(prefix + name, date_time=STAMP)
            info.compress_type = method
            info.external_attr = 0o644 << 16
            z.writestr(info, files[name])


def main():
    if os.path.isdir(OUT):
        for own in ("bundle", "bundle.zip", "bundle-nested.zip", "bundle-stored.zip", "tampered.zip"):
            p = os.path.join(OUT, own)
            if os.path.isdir(p):
                shutil.rmtree(p)
            elif os.path.exists(p):
                os.remove(p)
    folder = os.path.join(OUT, "bundle")
    sealed = dict(CONTENT)
    sealed["manifest.json"] = manifest_for(CONTENT)
    for name, data in sealed.items():
        p = os.path.join(folder, name)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "wb") as f:
            f.write(data)
    write_zip(os.path.join(OUT, "bundle.zip"), sealed, zipfile.ZIP_DEFLATED)
    write_zip(os.path.join(OUT, "bundle-nested.zip"), sealed, zipfile.ZIP_DEFLATED, prefix="offer-fixture/")
    write_zip(os.path.join(OUT, "bundle-stored.zip"), sealed, zipfile.ZIP_STORED)
    tampered = dict(sealed)
    tampered["deliverables/report.md"] = REPORT.replace("second point", "edited point").encode()
    write_zip(os.path.join(OUT, "tampered.zip"), tampered, zipfile.ZIP_DEFLATED)
    for name in sorted(os.listdir(OUT)):
        print(name)


if __name__ == "__main__":
    main()
