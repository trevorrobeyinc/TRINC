"""Playwright engine wrappers — Firefox and Chromium, fresh isolated profile per fetch.

Replaces the retired Camoufox + SeleniumBase engines (archived 2026-05-11 with the
browser-MCP toolkit downsize). Each fetch launches a bundled Playwright browser with
no persistent profile, mirroring the global "Playwright MCP --isolated" posture
documented in ~/.claude/CLAUDE.md "Browser MCP Strategy and Context Persistence".

Firefox is retained as the default to preserve Firefox-engine fingerprint diversity;
Chromium provides the fall-through path when Firefox returns a thin response.
"""

from __future__ import annotations

import time

from .base import FetchResult


def _fetch_with(browser_kind: str, engine_name: str, url: str, *, timeout_seconds: float, user_agent: str) -> FetchResult:
    from playwright.sync_api import sync_playwright

    started = time.monotonic()
    with sync_playwright() as p:
        launcher = getattr(p, browser_kind)
        browser = launcher.launch(headless=True)
        try:
            context = browser.new_context(user_agent=user_agent)
            try:
                page = context.new_page()
                page.set_default_navigation_timeout(timeout_seconds * 1000)
                response = page.goto(url, wait_until="domcontentloaded")
                html = page.content()
                status = response.status if response else 0
                headers = list(response.headers.items()) if response else []
                final_url = page.url
            finally:
                context.close()
        finally:
            browser.close()
    elapsed_ms = int((time.monotonic() - started) * 1000)
    return FetchResult(
        url=url,
        status_code=int(status),
        final_url=final_url,
        html=html,
        headers=headers,
        engine=engine_name,
        elapsed_ms=elapsed_ms,
    )


class PlaywrightFirefoxEngine:
    name = "playwright-firefox"

    def fetch(self, url: str, *, timeout_seconds: float, user_agent: str) -> FetchResult:
        return _fetch_with("firefox", self.name, url, timeout_seconds=timeout_seconds, user_agent=user_agent)


class PlaywrightChromiumEngine:
    name = "playwright-chromium"

    def fetch(self, url: str, *, timeout_seconds: float, user_agent: str) -> FetchResult:
        return _fetch_with("chromium", self.name, url, timeout_seconds=timeout_seconds, user_agent=user_agent)
