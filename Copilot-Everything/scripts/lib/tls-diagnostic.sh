#!/usr/bin/env bash
# tls-diagnostic.sh — sourced helper, not invoked directly.
#
# Structured root-cause diagnostic for HTTPS-proxy call failures. Emits
# the SAME JSON shape as openclaw-bridge/core/tls-diagnostic.js so a
# future self-healing agent can consume either source uniformly.
#
# HTTPS-only invariant: NEVER fall back to plaintext. If a curl fails,
# this function reports why; the caller must exit non-zero rather than
# retry against the plaintext upstream.
#
# Usage:
#   source "$(dirname "${BASH_SOURCE[0]}")/lib/tls-diagnostic.sh"
#   if ! curl --cacert "$MKCERT_CA" "https://127.0.0.1:8743/v0/health" -fsS >/dev/null 2>&1; then
#     tls_diagnose 8743 8742 com.trevorrobey.miyo-tls-proxy "CURL_FAILED" >&2
#     exit 1
#   fi

MKCERT_CA="${MKCERT_CA:-$HOME/Library/Application Support/mkcert/rootCA.pem}"
MKCERT_CERT="${MKCERT_CERT:-$HOME/.local/share/mkcert/localhost.pem}"
MKCERT_KEY="${MKCERT_KEY:-$HOME/.local/share/mkcert/localhost-key.pem}"

# Emit a one-line JSON diagnostic to stdout. Always returns 0; caller decides
# whether to exit non-zero based on context.
#
# Args:
#   $1 = proxy_port      (e.g. 8743)
#   $2 = upstream_port   (e.g. 8742)
#   $3 = launchd_label   (e.g. com.trevorrobey.miyo-tls-proxy)
#   $4 = error_code      (e.g. CURL_FAILED, JQ_BASEURL_MISMATCH)
tls_diagnose() {
  local proxy_port="${1:-0}"
  local upstream_port="${2:-0}"
  local launchd_label="${3:-unknown}"
  local error_code="${4:-UNKNOWN}"

  local proxy_loaded="false"
  if launchctl list 2>/dev/null | grep -q "$launchd_label"; then
    proxy_loaded="true"
  fi

  local upstream_listening="false"
  if lsof -nP -iTCP:"$upstream_port" -sTCP:LISTEN 2>/dev/null | grep -q LISTEN; then
    upstream_listening="true"
  fi

  local cert_present="false"
  if [[ -f "$MKCERT_CERT" && -f "$MKCERT_KEY" ]]; then
    cert_present="true"
  fi

  local suggestion
  if [[ "$proxy_loaded" == "false" ]]; then
    suggestion="launchctl load ~/Library/LaunchAgents/${launchd_label}.plist"
  elif [[ "$cert_present" == "false" ]]; then
    suggestion="mkcert -install && mkcert localhost 127.0.0.1; move output to ~/.local/share/mkcert/"
  elif [[ "$upstream_listening" == "false" ]]; then
    suggestion="Start the upstream app so it listens on 127.0.0.1:${upstream_port} (Miyo / LM Studio / Ollama / Qdrant). Proxy is up but upstream is unreachable."
  else
    suggestion="Proxy + upstream + cert all healthy. Investigate raw error_code=${error_code}."
  fi

  printf '{"code":"TLS_PROXY_CALL_FAILED","label":"%s","diagnostic":{"proxy_port":%d,"upstream_port":%d,"launchd_label":"%s","proxy_loaded":%s,"upstream_listening":%s,"cert_present":%s,"error_code":"%s","suggestion":"%s"}}\n' \
    "$launchd_label" \
    "$proxy_port" \
    "$upstream_port" \
    "$launchd_label" \
    "$proxy_loaded" \
    "$upstream_listening" \
    "$cert_present" \
    "$error_code" \
    "$suggestion"
}

# Convenience: wrap a curl call with the diagnostic. Args 1..N-1 are the
# proxy descriptor (proxy_port upstream_port launchd_label), then `--` then
# the curl args.
#
#   tls_curl 8743 8742 com.trevorrobey.miyo-tls-proxy -- -fsS "https://127.0.0.1:8743/v0/health"
tls_curl() {
  local proxy_port="$1"; shift
  local upstream_port="$1"; shift
  local launchd_label="$1"; shift
  if [[ "$1" == "--" ]]; then shift; fi

  if curl --cacert "$MKCERT_CA" "$@"; then
    return 0
  else
    local rc=$?
    tls_diagnose "$proxy_port" "$upstream_port" "$launchd_label" "CURL_EXIT_${rc}" >&2
    return "$rc"
  fi
}
