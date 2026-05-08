"""eLife pilot connector.

Why eLife as the pilot:
  - CC-BY 4.0 (license_rules in dataset-license-rules.json already maps cc-by-4.0
    to PHASE20_LICENSE_IDENTIFIER_ALLOWED).
  - JS-rendered article pages with figures/supplementary lists not always
    surfaced through PubMed metadata alone.
  - No anti-bot stack to circumvent — the stealth tooling is used purely for
    JS rendering and engine diversity, not evasion.
"""

from __future__ import annotations

import re
from typing import Any, ClassVar

from selectolax.parser import HTMLParser

from ..engines.base import FetchResult


class ELifeConnector:
    target_id: ClassVar[str] = "elife"
    license_spdx: ClassVar[str] = "cc-by-4.0"
    domain: ClassVar[str] = "elifesciences.org"

    def build_url(self, params: dict[str, Any]) -> str:
        article_id = str(params.get("article_id", "")).strip()
        if not re.fullmatch(r"\d{4,7}", article_id):
            raise ValueError("elife article_id must be 4-7 digits")
        return f"https://elifesciences.org/articles/{article_id}"

    def parse(self, fetch: FetchResult) -> dict[str, Any]:
        tree = HTMLParser(fetch.html)
        title = self._text(tree.css_first("h1.content-header__title")) or self._text(
            tree.css_first("h1")
        )
        doi = self._meta(tree, "citation_doi") or self._meta(tree, "DC.identifier")
        abstract = self._text(tree.css_first(".article-section--abstract")) or ""
        authors = [
            self._text(node) for node in tree.css(".article-author-list a") if self._text(node)
        ]
        figures: list[str] = []
        for img in tree.css(".asset-viewer-inline__img, figure img"):
            src = img.attributes.get("src") or img.attributes.get("data-src")
            if src:
                figures.append(src)
        supplementary = [
            (a.attributes.get("href") or "")
            for a in tree.css('a[href*="/download/"], a[href$=".pdf"], a[href$=".docx"]')
        ]
        supplementary = [href for href in supplementary if href]

        return {
            "title": title,
            "doi": doi,
            "abstract": abstract,
            "authors": authors,
            "figures": figures,
            "supplementary_links": supplementary,
            "final_url": fetch.final_url,
        }

    @staticmethod
    def _text(node) -> str:
        return node.text(strip=True) if node is not None else ""

    @staticmethod
    def _meta(tree: HTMLParser, name: str) -> str | None:
        node = tree.css_first(f'meta[name="{name}"]')
        if node is None:
            return None
        content = node.attributes.get("content")
        return content.strip() if content else None
