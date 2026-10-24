#!/bin/zsh
# Launcher for Raycast's MCP client: Raycast's Install Server form takes a
# command with no environment fields, so the env contract lives here instead.
export OBSIDIAN_STDIO_PROFILE=raycast
export NODE_EXTRA_CA_CERTS="$HOME/Library/Application Support/mkcert/rootCA.pem"

NODE="$HOME/.nvm/versions/node/v22.13.1/bin/node"
[ -x "$NODE" ] || NODE="$(command -v node)"

exec "$NODE" "/Users/myhome/TRINC/Copilot-Everything/bridges/obsidian-stdio-adapter/index.mjs"
