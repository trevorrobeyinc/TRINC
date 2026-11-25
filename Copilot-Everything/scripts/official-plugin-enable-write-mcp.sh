#!/usr/bin/env bash
# official-plugin-enable-write-mcp.sh — RETIRED on 2026-11-24 by bridges-uds. It refuses to run.
#
# What it did: set readOnlyMode false in the bridge config, ran bridge-restart.sh, and then, through
# `obsidian eval`, replaced the whole "mcp" block of the production Copilot data.json with ONE write-capable
# server, "shared-obsidian-mcp", transport "http" and httpEndpoint http://<transport.host>:<transport.port> taken
# from the bridge config. That dropped the configured bridge servers, copied the bridge's auth token into
# data.json, and printed the resulting block, token included, on stdout.
#
# Why it is retired: the three TRINC bridges left loopback TCP and TLS on 2026-11-24 and serve only on Unix
# sockets in <home>/.local/state/trinc/run. No bridge listens on a TCP port any more, the Copilot fork dials only
# those sockets and migrates its own data.json on load, and an http:// endpoint this script wrote would never be
# dialled. Running it would wipe the migrated socket entries and put the token in the terminal's scrollback.
# This reverses the 2026-10 reorg decision that kept the official-plugin-* scripts as dev tooling
# (ops/reorg/2026-10-cleanup-manifest.md); the bridges-uds decision record (ops/security/bridges-uds-2026-11-24.md)
# carries the operator approval, PENDING, and the tombstone line. The last working version is in git history before
# bridges-uds.
set -euo pipefail

cat >&2 <<'EOF'
official-plugin-enable-write-mcp.sh is retired (bridges-uds, 2026-11-24) and does nothing.
It replaced Copilot's MCP config with a single write-capable http:// server and printed the bridge token, but the
bridges serve only on Unix sockets now, and the Copilot fork migrates its own MCP settings when Obsidian loads it.
Write access stays the bridge config's readOnlyMode, changed by the operator.
See ops/security/bridges-uds-2026-11-24.md (the bridges-uds decision record). The old script is in git history.
EOF
exit 1
