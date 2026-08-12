#!/usr/bin/env bash
# ollama-preload.sh — keep the Obsidian-side local model resident.
#
# WHY THIS EXISTS
# Ollama evicts an idle model after its keep_alive window (default 5 minutes).
# The first Copilot message after a gap then pays a cold load — measured at
# 7.4 s vs 0.5 s warm — which Copilot's request timeout turns into a bare
# "Connection error". Warming on a timer keeps the first message fast.
#
# A per-request keep_alive is NOT sufficient on its own: Copilot's own requests
# omit keep_alive, so each one resets the TTL to Ollama's default. This agent
# therefore re-warms on an interval SHORTER than that default, which keeps the
# model resident no matter what the plugin sends.
#
# COST: the model stays in memory continuously (granite4.1:8b ≈ 6.1 GB resident
# on a 16 GB machine). To stop: launchctl bootout gui/$(id -u)/com.trevorrobey.ollama-preload
#
# TRANSPORT: reaches Ollama only through the HTTPS proxy on :11435, never the
# plaintext :11434 upstream — the monorepo HTTPS-only invariant applies here as
# much as to the proxies themselves.
#
# NOTE: this file deliberately contains no shell pipe characters. A command
# holding a `curl` token and a later `|` is process-blocked by Falcon
# Custom-IOA rule 1, which fails silently with an empty result.
set -uo pipefail

MODEL="${OLLAMA_PRELOAD_MODEL:-granite4.1:8b}"
KEEP_ALIVE="${OLLAMA_PRELOAD_KEEP_ALIVE:-30m}"
PROXY="${OLLAMA_PRELOAD_URL:-https://127.0.0.1:11435}"
CA="${MKCERT_ROOT_CA:-$HOME/Library/Application Support/mkcert/rootCA.pem}"

log() { printf '[ollama-preload] %s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$1"; }

if [[ ! -f "$CA" ]]; then
  log "FATAL: mkcert CA missing at $CA — refusing to fall back to plaintext."
  exit 1
fi

# Wait for the TLS proxy rather than assuming launchd ordering. The proxy and
# Ollama.app both come up at login; either may lose the race.
attempt=0
until [[ $attempt -ge 12 ]]; do
  code="$(curl -s -o /dev/null --cacert "$CA" -w '%{http_code}' --max-time 5 "$PROXY/v1/models")"
  if [[ "$code" == "200" ]]; then
    break
  fi
  attempt=$((attempt + 1))
  sleep 5
done

if [[ "${code:-000}" != "200" ]]; then
  log "proxy not reachable at $PROXY after $attempt attempts (last HTTP ${code:-000}); will retry next tick"
  exit 0
fi

# A 1-token generate is enough to force residency and refresh the TTL.
req="$(mktemp)"
resp="$(mktemp)"
printf '{"model":"%s","prompt":"ok","stream":false,"keep_alive":"%s"}' "$MODEL" "$KEEP_ALIVE" > "$req"

code="$(curl -s -o "$resp" --cacert "$CA" -w '%{http_code}' --max-time 300 -H 'Content-Type: application/json' -d @"$req" "$PROXY/api/generate")"

if [[ "$code" == "200" ]]; then
  log "warm: $MODEL resident, keep_alive=$KEEP_ALIVE"
else
  log "warm FAILED for $MODEL (HTTP $code)"
  head -c 300 "$resp"
  printf '\n'
fi

rm -f "$req" "$resp"
exit 0
