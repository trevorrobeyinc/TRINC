# Trial Graveyard Feed — Sources & Compliance NOTICE

- **Source:** ClinicalTrials.gov (U.S. NIH / NLM) — public domain. Records retrieved via the public API v2 (`/studies`). The change-history endpoint has refused this feed (HTTP 403) since 2026-10-08, so the protocol-history columns are empty; the feed does not work around the refusal. Every row carries its NCT identifier and a resolvable `clinicaltrials.gov/study/<NCT>` URL.
- **Rendering:** **deterministic** — no LLM / model-generated content; the fetched public record IS the artifact, so every value is verifiable against the source.
- **No PHI:** trial-level facts only (NCT, status, phase, sponsor-stated stop reason, protocol version counts/modules). No individually identifiable patient data is included or processed.
- **No DrugBank; ChEMBL not used** in this feed. The engine's shipped-artifact license-allowlist guard enforces DrugBank exclusion and ChEMBL-identifier-only usage across all products.
- **As-of dating:** each revision is stamped with an `as_of` date; ClinicalTrials.gov may update, correct, or withdraw records after that date.
- **Use restriction:** research and informational use only; **not clinical decision support** and not a basis for diagnosis, treatment, or any patient-care decision.
- **Provider:** Trevor Robey, INC. (wordmark of Trevor Robey Intelligence Network Citations LLC, a California limited liability company; CA Entity No. B20260217250).
