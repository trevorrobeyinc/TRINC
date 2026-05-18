"""FastAPI sidecar.

Listens on HTTPS only (mkcert certs). The monorepo invariant is that every
TCP listener is HTTPS — see TrevClaw-Obsidianodus/CLAUDE.md "HTTPS-only
invariant". Plaintext fallback is forbidden.

This service is *manually invoked*. It does not register a launchd entry, a
PM2 entry, or any auto-start hook. Each scrape is operator-triggered, parallel
to a researcher manually opening a browser tab.
"""

from __future__ import annotations

import logging
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .cache import DiskCache
from .config import SidecarConfig, load_config
from .connectors import REGISTRY, NormalizedRecord
from .connectors.base import make_citation_hash, utc_now_iso
from .engines.router import EngineRouter
from .policy import detect_paywall_signals, screen_text


logger = logging.getLogger("scrape_sidecar")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


class ScrapeRequest(BaseModel):
    target: str = Field(..., description="Connector ID, e.g. 'elife'")
    params: dict[str, Any] = Field(default_factory=dict)
    prefer_engine: str | None = Field(default=None, description="playwright-firefox | playwright-chromium")
    bypass_cache: bool = False


class ScrapeResponse(BaseModel):
    record: dict[str, Any]
    cache_hit: bool
    engines_tried: list[str]


def create_app(config: SidecarConfig | None = None) -> FastAPI:
    cfg = config or load_config()
    app = FastAPI(
        title="trevor-robey-inc scrape-sidecar",
        version="0.1.0",
        description="Manual-invocation HTTPS sidecar for JS-rendered open-access biomedical pages.",
    )
    router = EngineRouter(default_engine=cfg.default_engine)
    cache = DiskCache(cfg.cache_dir)

    app.state.config = cfg
    app.state.router = router
    app.state.cache = cache

    @app.get("/health")
    def health() -> dict[str, Any]:
        return {
            "status": "ok",
            "engines": router.available_engines(),
            "default_engine": cfg.default_engine,
            "tls": True,
            "cache_dir": str(cfg.cache_dir),
        }

    @app.get("/targets")
    def targets() -> dict[str, Any]:
        return {
            "targets": [
                {
                    "target_id": connector.target_id,
                    "license": connector.license_spdx,
                    "domain": connector.domain,
                }
                for connector in REGISTRY.values()
            ]
        }

    @app.post("/scrape", response_model=ScrapeResponse)
    def scrape(request: ScrapeRequest) -> ScrapeResponse:
        connector = REGISTRY.get(request.target)
        if connector is None:
            raise HTTPException(status_code=404, detail=f"unknown target: {request.target}")

        try:
            url = connector.build_url(request.params)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        if not request.bypass_cache:
            entry = cache.get(request.target, request.params)
            if entry is not None:
                return ScrapeResponse(record=entry.payload, cache_hit=True, engines_tried=[])

        try:
            routed = router.fetch(
                url,
                timeout_seconds=cfg.request_timeout_seconds,
                user_agent=cfg.user_agent,
                prefer=request.prefer_engine,
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        paywall = detect_paywall_signals(
            routed.result.status_code, routed.result.headers, routed.result.html[:2000]
        )
        if paywall is not None:
            raise HTTPException(status_code=451, detail=f"paywall detected; refusing: {paywall}")

        payload = connector.parse(routed.result)
        scan = " ".join(str(value) for value in payload.values() if isinstance(value, str))
        verdict = screen_text(scan, license_allows_drugbank=False)
        if not verdict.allowed:
            raise HTTPException(status_code=422, detail={"reason_code": verdict.reason_code, "detail": verdict.detail})

        record = NormalizedRecord(
            source_url=url,
            retrieved_at=utc_now_iso(),
            data_source=connector.target_id,
            citation_hash=make_citation_hash(url, payload),
            license=connector.license_spdx,
            payload=payload,
            engine=routed.result.engine,
            engines_tried=routed.engines_tried,
        )
        as_json = record.as_json()
        cache.put(request.target, request.params, as_json)
        return ScrapeResponse(record=as_json, cache_hit=False, engines_tried=routed.engines_tried)

    return app


app = create_app()


def main() -> None:
    cfg = app.state.config
    uvicorn.run(
        "app.main:app",
        host=cfg.host,
        port=cfg.port,
        ssl_certfile=str(cfg.ssl_certfile),
        ssl_keyfile=str(cfg.ssl_keyfile),
        log_level="info",
    )


if __name__ == "__main__":
    main()
