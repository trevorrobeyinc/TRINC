# DrugBank — 🚩 STOP-SHIP unless commercial license signed; ToS updated Sept 17, 2025

> **Posture (2026-06-10): NO DrugBank commercial license is held. DrugBank data must not ship in any deliverable, sample, or marketing asset.** DrugBank's academic/free tier prohibits commercial redistribution; the commercial license (ToS updated Sept 17, 2025) is required before any DrugBank-derived field can be sold or shown to a buyer.

## Rule

1. **No DrugBank content in public or paid output.** No `DB#####` accession IDs, no DrugBank-sourced drug/target/interaction fields, no DrugBank-derived tables — in packs, teasers, the landing page, cold emails, or marketplace listings.
2. **Do not advertise a "DrugBank-licensed pack" as if it exists.** It does not. Until a commercial license is signed, the correct buyer-facing statement is: *DrugBank is not included; a DrugBank-derived engagement is possible only after we license it commercially.* (This corrected an over-claim in the [`../03-platforms/datarade/vendor-application.md`](../03-platforms/datarade/vendor-application.md) source-license register on 2026-06-10.)
3. **The build gate enforces this mechanically** — see [`drugbank-regex-gate.md`](drugbank-regex-gate.md): any `DB\d{5}` match fails the build unless a license flag is active.
4. **Use the substitute sources instead** — see [`drugbank-alternative-stack.md`](drugbank-alternative-stack.md) for the license-free stack (ChEMBL, OpenFDA, RxNorm, PubChem, UniProt) that covers most DrugBank use cases.

## To do before any DrugBank use

- Sign the DrugBank **commercial license** (Wishart Group / OMx Personal Health Analytics). Record license ID, scope (redistribution vs. internal-use-only), and expiry here.
- Flip the build-gate license flag (`drugbank-regex-gate.md`) only after the signed license is on file.
- Update every buyer-facing Source License Register row from "❌ NOT INCLUDED" to the licensed scope.

## References

- Playbook §5 item 1 (DrugBank removal from public packs) — [`../trevor-robey-inc Commercial Launch Playbook.md`](../trevor-robey-inc%20Commercial%20Launch%20Playbook.md)
- License-free substitutes: [`drugbank-alternative-stack.md`](drugbank-alternative-stack.md)
- Regex build-gate: [`drugbank-regex-gate.md`](drugbank-regex-gate.md)
