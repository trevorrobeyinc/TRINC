#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_command npm
require_command node

PACKAGE_DIR="$BRIDGE_REPO"

cd "$PACKAGE_DIR"
npm run --silent build >/dev/null
npm run --silent probe:miyo -- "$@"
