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

# Step 4: Sync dependencies
echo "[4/5] Syncing ToolUniverse dependencies..."
cd "$TU_DIR"
# No browser automation on this host (operator decision 2026-09-18). The engine never calls the
# URL tools that need this library, and ToolUniverse loads tools lazily, so nothing else changes.
uv sync --python 3.12 --no-install-package playwright
echo "  Dependencies synced."

# Step 5: Verify installation
echo "[5/5] Verifying installation..."
# --no-sync: a bare `uv run` re-syncs the project and would reinstall playwright.
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
