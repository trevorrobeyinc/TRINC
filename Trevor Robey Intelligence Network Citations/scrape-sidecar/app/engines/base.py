"""Engine abstract base.

Every engine returns the same FetchResult shape so the connector layer never
sees engine-specific quirks.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class FetchResult:
    url: str
    status_code: int
    final_url: str
    html: str
    headers: list[tuple[str, str]]
    engine: str
    elapsed_ms: int


class Engine(Protocol):
    name: str

    def fetch(self, url: str, *, timeout_seconds: float, user_agent: str) -> FetchResult: ...
