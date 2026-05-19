"""Sidecar configuration. mkcert TLS paths are required — no plaintext fallback.

Contracts the surrounding monorepo invariants: every TCP listener owned by code
in this repo must run HTTPS. If certs are missing, the process refuses to start.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class SidecarConfig:
    host: str
    port: int
    ssl_certfile: Path
    ssl_keyfile: Path
    cache_dir: Path
    default_engine: str
    user_agent: str
    request_timeout_seconds: float
    max_response_bytes: int


def load_config() -> SidecarConfig:
    home = Path(os.environ.get("HOME", str(Path.home())))
    certfile = Path(os.environ.get("SCRAPE_SIDECAR_CERT", home / ".local/share/mkcert/localhost.pem"))
    keyfile = Path(os.environ.get("SCRAPE_SIDECAR_KEY", home / ".local/share/mkcert/localhost-key.pem"))
    cache_dir = Path(
        os.environ.get(
            "SCRAPE_SIDECAR_CACHE",
            Path(__file__).resolve().parent.parent / "var" / "cache",
        )
    )

    if not certfile.exists():
        raise RuntimeError(
            f"scrape-sidecar refuses to start: TLS cert not found at {certfile}. "
            "Generate one with `mkcert -install && mkcert localhost 127.0.0.1` "
            "or override SCRAPE_SIDECAR_CERT."
        )
    if not keyfile.exists():
        raise RuntimeError(
            f"scrape-sidecar refuses to start: TLS key not found at {keyfile}. "
            "Generate one with `mkcert -install && mkcert localhost 127.0.0.1` "
            "or override SCRAPE_SIDECAR_KEY."
        )

    cache_dir.mkdir(parents=True, exist_ok=True)

    return SidecarConfig(
        host=os.environ.get("SCRAPE_SIDECAR_HOST", "127.0.0.1"),
        port=int(os.environ.get("SCRAPE_SIDECAR_PORT", "8842")),
        ssl_certfile=certfile,
        ssl_keyfile=keyfile,
        cache_dir=cache_dir,
        default_engine=os.environ.get("SCRAPE_SIDECAR_DEFAULT_ENGINE", "playwright-firefox"),
        user_agent=os.environ.get(
            "SCRAPE_SIDECAR_USER_AGENT",
            "trevor-robey-inc-scrape-sidecar/0.1 (+https://trevorobeyinc.com)",
        ),
        request_timeout_seconds=float(os.environ.get("SCRAPE_SIDECAR_TIMEOUT_SECONDS", "30")),
        max_response_bytes=int(os.environ.get("SCRAPE_SIDECAR_MAX_BYTES", str(2 * 1024 * 1024))),
    )
