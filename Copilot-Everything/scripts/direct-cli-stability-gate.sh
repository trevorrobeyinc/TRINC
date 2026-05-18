#!/usr/bin/env bash
# RETIRED 2026-05-09 — bridge consolidation
#
# Same retirement as cli-stability-gate.sh. The legacy "direct CLI" probe
# path was tied to the retired :8789 emulator and the now-removed
# inproc-plugin/CLI backend selection.

echo "ERROR: direct-cli-stability-gate.sh was retired 2026-05-09. See cli-stability-gate.sh header for replacement." >&2
exit 1
