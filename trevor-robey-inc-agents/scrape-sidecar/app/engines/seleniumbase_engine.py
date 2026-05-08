"""SeleniumBase engine wrapper.

Two modes:
  - UC (Undetected-Chromedriver): patches chromedriver to suppress automation
    signals; suitable for normal JS-rendered pages.
  - CDP: disconnects WebDriver after navigation, drives via Chrome DevTools
    Protocol; falls through here when UC alone returns a degraded page.

Both modes are used for legitimate purposes: rendering JS-heavy public sites
and dodging Chrome-specific behavioral fingerprinting that would otherwise
break on legitimate open-access content.
"""

from __future__ import annotations

import time

from .base import FetchResult


class SeleniumBaseUCEngine:
    name = "seleniumbase-uc"

    def fetch(self, url: str, *, timeout_seconds: float, user_agent: str) -> FetchResult:
        from seleniumbase import SB

        started = time.monotonic()
        with SB(uc=True, headless2=True, agent=user_agent) as sb:
            sb.uc_open_with_reconnect(url, max(2, int(timeout_seconds // 8)))
            html = sb.get_page_source()
            final_url = sb.get_current_url()
        elapsed_ms = int((time.monotonic() - started) * 1000)
        return FetchResult(
            url=url,
            status_code=200,
            final_url=final_url,
            html=html,
            headers=[],
            engine=self.name,
            elapsed_ms=elapsed_ms,
        )


class SeleniumBaseCDPEngine:
    name = "seleniumbase-cdp"

    def fetch(self, url: str, *, timeout_seconds: float, user_agent: str) -> FetchResult:
        from seleniumbase import SB

        started = time.monotonic()
        with SB(uc=True, headless2=True, agent=user_agent) as sb:
            sb.activate_cdp_mode(url)
            sb.sleep(min(3.0, timeout_seconds / 10.0))
            html = sb.cdp.get_page_source()
            final_url = sb.cdp.get_current_url()
        elapsed_ms = int((time.monotonic() - started) * 1000)
        return FetchResult(
            url=url,
            status_code=200,
            final_url=final_url,
            html=html,
            headers=[],
            engine=self.name,
            elapsed_ms=elapsed_ms,
        )
