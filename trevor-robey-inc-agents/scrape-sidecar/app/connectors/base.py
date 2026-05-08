"""Connector contract.

Output shape matches the existing openclaw-bridge provenance-tracker fields:
  source_url, retrieved_at, data_source, citation_hash, plus a target-specific
  payload object. This way the Node side can ingest scraper output through the
  same pipeline as the API-based MCP connectors.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, ClassVar, Protocol

from ..engines.base import FetchResult


@dataclass(frozen=True)
class NormalizedRecord:
    source_url: str
    retrieved_at: str
    data_source: str
    citation_hash: str
    license: str
    payload: dict[str, Any]
    engine: str
    engines_tried: list[str]

    def as_json(self) -> dict[str, Any]:
        return {
            "source_url": self.source_url,
            "retrieved_at": self.retrieved_at,
            "data_source": self.data_source,
            "citation_hash": self.citation_hash,
            "license": self.license,
            "payload": self.payload,
            "engine": self.engine,
            "engines_tried": self.engines_tried,
        }


class Connector(Protocol):
    target_id: ClassVar[str]
    license_spdx: ClassVar[str]
    domain: ClassVar[str]

    def build_url(self, params: dict[str, Any]) -> str: ...
    def parse(self, fetch: FetchResult) -> dict[str, Any]: ...


def make_citation_hash(source_url: str, payload: dict[str, Any]) -> str:
    canonical = source_url + "|" + str(sorted(payload.items()))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def utc_now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat(timespec="seconds")
