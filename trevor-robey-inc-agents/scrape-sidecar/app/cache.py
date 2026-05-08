"""Disk cache keyed by SHA-256 of (target, normalized params).

24h TTL by default. Cache hits include the original retrieved_at timestamp so
the provenance ledger downstream still reflects when the page was actually
fetched, not when it was served from cache.
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class CacheEntry:
    payload: dict[str, Any]
    cached_at: float


class DiskCache:
    def __init__(self, root: Path, ttl_seconds: int = 24 * 60 * 60) -> None:
        self._root = root
        self._ttl = ttl_seconds
        self._root.mkdir(parents=True, exist_ok=True)

    def _key(self, target: str, params: dict[str, Any]) -> str:
        canonical = json.dumps({"target": target, "params": params}, sort_keys=True, default=str)
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    def _path(self, key: str) -> Path:
        return self._root / f"{key}.json"

    def get(self, target: str, params: dict[str, Any]) -> CacheEntry | None:
        path = self._path(self._key(target, params))
        if not path.exists():
            return None
        try:
            raw = json.loads(path.read_text("utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        cached_at = float(raw.get("__cached_at", 0))
        if time.time() - cached_at > self._ttl:
            return None
        payload = raw.get("payload")
        if not isinstance(payload, dict):
            return None
        return CacheEntry(payload=payload, cached_at=cached_at)

    def put(self, target: str, params: dict[str, Any], payload: dict[str, Any]) -> None:
        path = self._path(self._key(target, params))
        path.write_text(
            json.dumps({"__cached_at": time.time(), "payload": payload}, default=str),
            encoding="utf-8",
        )
