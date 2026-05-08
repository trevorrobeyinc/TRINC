#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v uv >/dev/null 2>&1; then
  echo "uv not found. Install with: brew install uv" >&2
  exit 2
fi

if [ ! -d ".venv" ]; then
  echo "Creating venv with uv..."
  uv venv .venv --python 3.11
fi

uv sync --extra dev

if ! .venv/bin/playwright --version >/dev/null 2>&1; then
  .venv/bin/playwright install firefox
fi

if ! .venv/bin/python -c "import camoufox" >/dev/null 2>&1; then
  echo "camoufox import failed; reinstall step needed" >&2
  exit 3
fi

.venv/bin/python -m camoufox fetch || true

exec .venv/bin/python -m app.main
