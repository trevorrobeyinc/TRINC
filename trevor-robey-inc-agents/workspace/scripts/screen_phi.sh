#!/usr/bin/env bash
# screen_phi.sh — PHI/PII screening gate for OpenClaw research packs.
#
# Runs Microsoft Presidio's HIPAA Safe Harbor 18-PHI-type recognizers over a
# deliverable PDF (or text file) and FAILS THE BUILD if any high-confidence
# match (>0.6) is found outside the cited-author allowlist.
#
# Required:
#   pip install presidio-analyzer presidio-anonymizer pdfminer.six
#   python -m spacy download en_core_web_lg
#
# Usage:
#   bash screen_phi.sh path/to/pack.pdf
#   bash screen_phi.sh path/to/pack.md
#   bash screen_phi.sh path/to/pack.pdf authors.txt   # allowlist file
#
# Exit codes:
#   0  = clean (no high-confidence PHI matches)
#   1  = PHI found OR tooling missing
#   2  = bad usage

set -euo pipefail

if [ $# -lt 1 ] || [ $# -gt 2 ]; then
  echo "usage: $0 <pack.pdf|pack.md> [authors-allowlist.txt]" >&2
  exit 2
fi

INPUT="$1"
ALLOWLIST="${2:-}"

if [ ! -f "$INPUT" ]; then
  echo "input file not found: $INPUT" >&2
  exit 2
fi

# 1) Extract text. PDF via pdftotext if available, else fall back to python.
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT
TXT="$WORKDIR/pack.txt"

case "${INPUT##*.}" in
  pdf|PDF)
    if command -v pdftotext >/dev/null 2>&1; then
      pdftotext -layout "$INPUT" "$TXT"
    else
      python3 -c "
from pdfminer.high_level import extract_text
import sys
sys.stdout.write(extract_text('$INPUT'))
" > "$TXT"
    fi
    ;;
  *)
    cp "$INPUT" "$TXT"
    ;;
esac

# 2) Run Presidio analyzer. HIPAA Safe Harbor 18 PHI types map to these
#    Presidio entity types (subset shown — full set passed via --entities).
PHI_ENTITIES="PERSON,EMAIL_ADDRESS,PHONE_NUMBER,US_SSN,US_DRIVER_LICENSE,US_PASSPORT,US_BANK_NUMBER,CREDIT_CARD,IP_ADDRESS,LOCATION,DATE_TIME,MEDICAL_LICENSE,IBAN_CODE,URL,US_ITIN"

python3 - "$TXT" "$ALLOWLIST" <<'PY'
import json, sys, pathlib
from presidio_analyzer import AnalyzerEngine

txt_path = pathlib.Path(sys.argv[1])
allowlist_path = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2] else None
allow = set()
if allowlist_path and allowlist_path.exists():
    allow = {l.strip().lower() for l in allowlist_path.read_text().splitlines() if l.strip()}

text = txt_path.read_text(encoding="utf-8", errors="ignore")
engine = AnalyzerEngine()
results = engine.analyze(text=text, language="en")

THRESHOLD = 0.6
hits = []
for r in results:
    if r.score < THRESHOLD:
        continue
    snippet = text[r.start:r.end].strip()
    if r.entity_type == "PERSON" and snippet.lower() in allow:
        continue   # cited author, allowed
    hits.append({
        "entity": r.entity_type,
        "score": round(r.score, 3),
        "match": snippet,
        "offset": [r.start, r.end],
    })

report = {"checked_chars": len(text), "matches": len(hits), "hits": hits[:50]}
print(json.dumps(report, indent=2))
sys.exit(0 if not hits else 1)
PY

EXIT=$?
if [ $EXIT -ne 0 ]; then
  echo "" >&2
  echo "❌ PHI/PII screening FAILED — review hits above. Pack must be redacted before ship." >&2
  exit 1
fi

echo "" >&2
echo "✅ PHI/PII screening PASSED — zero high-confidence matches outside allowlist." >&2
exit 0
