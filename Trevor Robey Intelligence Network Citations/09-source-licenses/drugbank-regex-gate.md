# DB-ID regex gate — fail build on `DB\d{5}` match unless commercial license active

> **Intent (2026-06-10).** A pre-publication build gate that hard-fails any deliverable containing a DrugBank accession ID (`DB` followed by 5 digits) while no DrugBank commercial license is on file. This mechanically enforces the STOP-SHIP posture in [`drugbank-stop-ship-unless-licensed.md`](drugbank-stop-ship-unless-licensed.md).

## Gate logic

- **Pattern:** `DB\d{5}` (DrugBank accession format, e.g. `DB00945`).
- **Where it runs:** the pre-publication quality pass (the same stage that runs the Presidio PHI screen and citation-density check) — see the due-diligence checklist [`../14-due-diligence-checklist/`](../14-due-diligence-checklist/) (the placeholder `10-quality-pipeline/` folder was removed 2026-11-04). It must run on the rendered deliverable (PDF/markdown + structured appendix), not just source notes.
- **Default state:** license flag **OFF** → any `DB\d{5}` match is a **build failure** (non-zero exit; deliverable does not ship).
- **Licensed state:** when a signed DrugBank commercial license is recorded in `drugbank-stop-ship-unless-licensed.md`, set the license flag ON to allow matches within the licensed scope.

## Status

- **License flag: OFF** (no commercial license held as of 2026-06-10).
- Implementation status of the automated check: **verify** — the regex gate is specified here; confirm it is wired into the quality pipeline before relying on it (do not assume a documented gate is an executing gate).

## References

- Posture: [`drugbank-stop-ship-unless-licensed.md`](drugbank-stop-ship-unless-licensed.md)
- Playbook §6 item 2 (DrugBank regex gate)
