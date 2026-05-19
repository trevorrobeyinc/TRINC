"""Policy gate for scraped output.

Aligns to existing trevor-robey-inc commitments:
  - OFFERINGS.md      : no PHI; research artifacts only
  - 09-source-licenses: DrugBank stop-ship without commercial license
  - Citation-Audit SLA: every row carries a real source identifier

This module does not enforce robots.txt or per-request TOS checks. Scraping
targets are vetted at registration time (config-level allow-list); the gate
here catches the artifacts that would breach an existing brand commitment if
they reached the dataset pipeline downstream.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable


DRUGBANK_ID = re.compile(r"\bDB\d{5}\b")

# 18 HIPAA Safe Harbor identifier classes — surface-level regex screen only.
# This is a fast pre-filter; the canonical PHI/PII screen is the Presidio gate
# at trevor-robey-inc/10-quality-pipeline/presidio-phi-pii-screening/.
SSN_LIKE = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
MRN_LIKE = re.compile(r"\bMRN[:#\s-]?\d{4,}\b", re.IGNORECASE)
EMAIL_LIKE = re.compile(r"\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b")
PHONE_LIKE = re.compile(r"\b\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b")


@dataclass(frozen=True)
class PolicyVerdict:
    allowed: bool
    reason_code: str
    detail: str


def screen_text(text: str, *, license_allows_drugbank: bool = False) -> PolicyVerdict:
    if not license_allows_drugbank and DRUGBANK_ID.search(text):
        return PolicyVerdict(
            allowed=False,
            reason_code="DRUGBANK_LICENSE_REQUIRED",
            detail="Output contains DrugBank IDs (DB\\d{5}); commercial license required.",
        )
    if SSN_LIKE.search(text):
        return PolicyVerdict(
            allowed=False,
            reason_code="PHI_SSN_PATTERN",
            detail="Output contains SSN-like pattern; refer to Presidio screen.",
        )
    if MRN_LIKE.search(text):
        return PolicyVerdict(
            allowed=False,
            reason_code="PHI_MRN_PATTERN",
            detail="Output contains medical record number; refer to Presidio screen.",
        )
    return PolicyVerdict(allowed=True, reason_code="OK", detail="No surface PHI/license violations.")


def detect_paywall_signals(status_code: int, headers: Iterable[tuple[str, str]], body_preview: str) -> str | None:
    if status_code in (401, 402):
        return f"HTTP {status_code} response indicates auth/paywall."
    location = ""
    for name, value in headers:
        if name.lower() == "location":
            location = value.lower()
            break
    if location and ("login" in location or "signin" in location or "subscribe" in location):
        return f"Redirect to login/subscribe page: {location}"
    needle = body_preview.lower()
    paywall_markers = ("subscribe to read", "create a free account", "institutional sign-in required", "purchase article")
    for marker in paywall_markers:
        if marker in needle:
            return f"Paywall marker in body: {marker!r}"
    return None
