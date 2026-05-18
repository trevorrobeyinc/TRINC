#!/usr/bin/env bash
# RETIRED 2026-05-09 — bridge consolidation
#
# Zettelkasten orchestration moved in-process to the vault-zettelkasten
# Obsidian plugin (Claude/obsidian-vault-zettelkasten/) when the backend
# emulator at :8789 was retired (2026-04-11). Smoke testing now happens
# through the plugin's own UI / commands or the canonical bridge.

echo "ERROR: zettelkasten-smoke-test.sh was retired 2026-05-09. ZettelkastenService now runs in-process inside the vault-zettelkasten Obsidian plugin." >&2
exit 1
