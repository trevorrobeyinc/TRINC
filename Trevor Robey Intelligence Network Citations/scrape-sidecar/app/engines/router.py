"""Engine router: tries the configured default first, falls through on failure."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from .base import FetchResult
from .playwright_engine import PlaywrightChromiumEngine, PlaywrightFirefoxEngine


logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RoutedFetch:
    result: FetchResult
    engines_tried: list[str]


class EngineRouter:
    def __init__(self, default_engine: str = "playwright-firefox") -> None:
        self._engines = {
            "playwright-firefox": PlaywrightFirefoxEngine(),
            "playwright-chromium": PlaywrightChromiumEngine(),
        }
        self._fallthrough_order = ["playwright-firefox", "playwright-chromium"]
        if default_engine not in self._engines:
            raise ValueError(f"unknown default engine: {default_engine}")
        order = [default_engine] + [e for e in self._fallthrough_order if e != default_engine]
        self._order = order

    def available_engines(self) -> list[str]:
        return list(self._engines.keys())

    def fetch(self, url: str, *, timeout_seconds: float, user_agent: str, prefer: str | None = None) -> RoutedFetch:
        order = self._order if prefer is None else [prefer] + [e for e in self._order if e != prefer]
        tried: list[str] = []
        last_error: Exception | None = None
        for name in order:
            engine = self._engines[name]
            tried.append(name)
            try:
                result = engine.fetch(url, timeout_seconds=timeout_seconds, user_agent=user_agent)
                if result.html and len(result.html) > 256:
                    return RoutedFetch(result=result, engines_tried=tried)
                logger.warning("engine %s returned thin response (%d bytes); falling through", name, len(result.html))
            except Exception as exc:
                logger.warning("engine %s failed: %s; falling through", name, exc)
                last_error = exc
        raise RuntimeError(
            f"all engines failed for {url}; tried={tried}; last_error={last_error!r}"
        )
