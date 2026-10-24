#!/usr/bin/env bash
set -euo pipefail

# Setup script for ToolUniverse integration (Phase 29)
# Initializes the git submodule, installs Python 3.12, and syncs dependencies.
# Idempotent — safe to run multiple times.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TU_DIR="$PROJECT_ROOT/vendor/tooluniverse"

echo "=== ToolUniverse Setup ==="
echo "Project root: $PROJECT_ROOT"
echo ""

# Step 1: Initialize submodule
echo "[1/5] Initializing git submodule..."
if [ -f "$TU_DIR/pyproject.toml" ]; then
  echo "  Submodule already initialized."
else
  cd "$PROJECT_ROOT"
  git submodule update --init vendor/tooluniverse
  echo "  Submodule initialized."
fi

# Step 2: Verify uv is available
echo "[2/5] Checking uv..."
if ! command -v uv &>/dev/null; then
  echo "  ERROR: uv is not installed. Install it from https://docs.astral.sh/uv/"
  exit 1
fi
echo "  uv $(uv --version) found."

# Step 3: Install Python 3.12 if not available
echo "[3/5] Ensuring Python 3.12..."
if uv python list 2>/dev/null | grep -q "cpython-3.12"; then
  echo "  Python 3.12 already available."
else
  echo "  Installing Python 3.12 via uv..."
  uv python install 3.12
fi

# Step 4: Build the venv from the engine's own lock (2026-10-24, v1.5.7)
# Never `uv sync` here. Upstream's uv.lock at v1.5.7 is stale against its own pyproject (it still
# records eleven packages v1.5.4 moved behind extras), so a sync would rewrite uv.lock inside the
# submodule and `--frozen` would install packages upstream dropped. The venv instead comes from
# security/tooluniverse-venv.lock.txt: ToolUniverse's core dependencies only (no dev group, no
# extras), wheels only, every file hash-pinned. After moving the pin, regenerate it from the
# engine folder with:
#   uv pip compile vendor/tooluniverse/pyproject.toml --python 3.12 --no-build --generate-hashes -o security/tooluniverse-venv.lock.txt
# No browser automation on this host (operator decision 2026-09-18): Playwright is the optional
# `browser` extra since v1.5.4 and the lock leaves it out. Only get_webpage_text_from_url needs it,
# for HTML pages, and it answers with a clear "needs a browser" error; the engine never calls it.
# For page text without a browser, use the searxng-search connector's `extract` tool.
echo "[4/5] Building the ToolUniverse venv from security/tooluniverse-venv.lock.txt..."
LOCK="$PROJECT_ROOT/security/tooluniverse-venv.lock.txt"
cd "$TU_DIR"
if [ ! -x .venv/bin/python ]; then
  uv venv --python 3.12 .venv
fi
uv pip sync --python .venv/bin/python --require-hashes --no-build "$LOCK"
uv pip install --python .venv/bin/python --no-deps -e .
echo "  Venv built from the lock."

# Step 5: Verify installation
echo "[5/5] Verifying installation..."
# --no-sync: a bare `uv run` would try to sync the project against upstream's stale uv.lock.
if uv run --no-sync python -c "from tooluniverse import ToolUniverse; print('  ToolUniverse import: OK')" 2>/dev/null; then
  echo "  Verification passed."
else
  echo "  ERROR: ToolUniverse import failed."
  exit 1
fi

# Optional: Run doctor
echo ""
echo "=== Running ToolUniverse Doctor (optional) ==="
uv run --no-sync tooluniverse-doctor 2>/dev/null || echo "  Doctor not available or failed (non-critical)."

echo ""
echo "=== Setup Complete ==="
echo "ToolUniverse is ready at: $TU_DIR"
echo "MCP adapter at: $PROJECT_ROOT/openclaw-bridge/mcp/tooluniverse-mcp/"
