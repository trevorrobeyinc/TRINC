#!/usr/bin/env bash
# RETIRED 2026-05-09 — bridge consolidation
#
# Zettelkasten orchestration moved in-process to the vault-zettelkasten
# Obsidian plugin (Claude/obsidian-vault-zettelkasten/) when the backend
# emulator at :8789 was retired (2026-04-11). Scheduling is now driven by
# the openclaw-command-center plugin's workflow lifecycle, not this script.
#
# No LaunchAgents or cron entries reference this script (verified 2026-05-09).

echo "ERROR: zettelkasten-scheduler.sh was retired 2026-05-09. Scheduling is now driven by the openclaw-command-center plugin." >&2
exit 1
