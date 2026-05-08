"""Camoufox engine wrapper.

Camoufox is a modified Firefox at the C++/engine level: canvas, WebGL, audio,
fonts, navigator, and WebRTC are spoofed coherently. Used as the default
because no other tool in the stack provides Firefox engine diversity.
"""

from __future__ import annotations

import time

from .base import FetchResult


class CamoufoxEngine:
    name = "camoufox"

    def fetch(self, url: str, *, timeout_seconds: float, user_agent: str) -> FetchResult:
        from camoufox.sync_api import Camoufox

        started = time.monotonic()
        with Camoufox(headless=True) as browser:
            page = browser.new_page()
            page.set_default_navigation_timeout(timeout_seconds * 1000)
            response = page.goto(url, wait_until="domcontentloaded")
            html = page.content()
            status = response.status if response else 0
            headers = list(response.headers.items()) if response else []
            final_url = page.url
        elapsed_ms = int((time.monotonic() - started) * 1000)
        return FetchResult(
            url=url,
            status_code=int(status),
            final_url=final_url,
            html=html,
            headers=headers,
            engine=self.name,
            elapsed_ms=elapsed_ms,
        )
