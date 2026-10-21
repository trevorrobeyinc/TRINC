#!/usr/bin/env bash
# refresh-graveyard-feeds.sh — rebuild every Trial Graveyard Feed therapeutic area into a dated
# STAGING folder (never over the shipped data/), then print one summary line per area.
# Review the staging folder before promoting it to data/ for an ADX revision.
#
# Usage (from anywhere):
#   bash "/Users/myhome/TrevClaw-Obsidianodus/Trevor Robey Intelligence Network Citations/scripts/refresh-graveyard-feeds.sh" [YYYY-MM-DD]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AS_OF="${1:-$(date -u +%Y-%m-%d)}"
STAGE="$ROOT/workspace/aws-marketplace-listing/trial-graveyard-feed/refresh-$AS_OF"
LOG="$STAGE/refresh.log"

CONDITIONS=(
  # the six areas already staged (2026-07-30)
  "glioblastoma"
  "pancreatic cancer"
  "Alzheimer disease"
  "amyotrophic lateral sclerosis"
  "sickle cell disease"
  "idiopathic pulmonary fibrosis"
  # new areas, named in UPLOAD-RUNBOOK.md and the 2026-09-01 audit
  "non-small cell lung cancer"
  "breast cancer"
  "prostate cancer"
  "Parkinson disease"
  "multiple sclerosis"
  "nonalcoholic steatohepatitis"
)

slug() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g' | cut -c1-60; }

mkdir -p "$STAGE"
cd "$ROOT"
echo "Refreshing ${#CONDITIONS[@]} areas as of $AS_OF into $STAGE" | tee "$LOG"
for c in "${CONDITIONS[@]}"; do
  s="$(slug "$c")"
  echo "--- $c" | tee -a "$LOG"
  if ! node scripts/build-graveyard-feed.js --condition "$c" --asOf "$AS_OF" --teaserRows 5 \
       --out "$STAGE/$s" >>"$LOG" 2>&1; then
    echo "FAILED: $c (see $LOG)" | tee -a "$LOG"
  fi
  sleep 2
done

echo | tee -a "$LOG"
echo "area | rows | complete | no stated reason | churn rows" | tee -a "$LOG"
for d in "$STAGE"/*/; do
  [ -f "$d/summary.json" ] || continue
  node -e '
    const s = require(process.argv[1]); const p = s.paid;
    const complete = /complete\*\*/.test(require("fs").readFileSync(process.argv[2], "utf8")) ? "yes" : "NO";
    console.log(`${s.condition} | ${p.total} | ${complete} | ${p.no_reason_count} | ${p.with_history}`);
  ' "$d/summary.json" "$d/free/SAMPLE-NOTICE.md" | tee -a "$LOG"
done
echo "Done. Staging folder: $STAGE"
