#!/usr/bin/env bash
# run-workflow.sh — convenience wrapper around scripts/run-workflow.js.
#
# Sets NODE_EXTRA_CA_CERTS to the mkcert root CA so the `local` (Ollama) provider can trust
# the :11435 TLS proxy without you having to type it. All arguments are passed straight
# through to run-workflow.js.
#
# Usage (after arming the gate — operator-approve-gate arm):
#   scripts/run-workflow.sh --template general-research-pack \
#     --inputs '{"topic":"low-dose aspirin"}' --operator-approve --confirm
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Respect an already-exported CA path; otherwise default to the mkcert root CA.
export NODE_EXTRA_CA_CERTS="${NODE_EXTRA_CA_CERTS:-$HOME/Library/Application Support/mkcert/rootCA.pem}"
cd "$ROOT"
exec node scripts/run-workflow.js "$@"
