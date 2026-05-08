#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_command npm

cd "$WORKSPACE_ROOT/backend/copilot-backend-emulator"
npm run contract
