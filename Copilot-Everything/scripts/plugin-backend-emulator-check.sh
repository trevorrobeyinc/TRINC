#!/usr/bin/env bash
# RETIRED 2026-07-31 — exact_backend_emulator lane check (last emulator-era script)
#
# This check drove the fork plugin's exact_backend_emulator chat lane end to
# end: it rewrote the dev-vault plugin data.json to selfHostExecutionMode=
# "exact_backend_emulator" pointed at http://127.0.0.1:8789, redeployed, ran a
# live chat turn via `obsidian eval`, and asserted the /v1/self-host/agent-turn
# route + mcp_local-obsidian-mcp_obsidian_health tool binding in the console/
# capture logs. It cannot pass in any vault, for two independent reasons (both
# verified 2026-07-31):
#   * The backend emulator was retired 2026-04-11 and deleted from the
#     monorepo 2026-05-08. Nothing listens on :8789, and the
#     /v1/self-host/agent-turn contract it asserts exists nowhere.
#   * Both `obsidian eval` payloads looked up
#     app.plugins.plugins["copilot-mcp"] — an id no manifest has declared
#     since 9c7ce09a (2026-05-23): the fork's id is "copilot", and since
#     2026-07-31 the dev lane deploys under that id too. So the eval returned
#     plugin_not_loaded before the dead :8789 half even mattered.
# Retiring this also removes socket-audit.sh's only in-repo caller (the
# require-listeners chain that opened this script); socket-audit.sh stays
# live as the standalone check its 2026-07-31 rewrite made it.
# Sibling retirement, same day + same pattern: backend-bridge-compat-test.sh.
#
# Replacement checks (same pair as that sibling's header):
#   curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" \
#        https://127.0.0.1:8798/healthz
#   curl -k -H "Authorization: Bearer $OBSIDIAN_REST_API_KEY" \
#        https://127.0.0.1:27124/
# Renderer-side state (what the eval payloads were after): the
# obsidian_dev_console_logs tool via bridges/obsidian-stdio-adapter.
#
# This stub exits non-zero so any caller surfaces the retirement.

echo "ERROR: plugin-backend-emulator-check.sh was retired 2026-07-31. The exact_backend_emulator lane it validated (:8789 emulator + plugin id copilot-mcp) no longer exists; see this header for the replacement checks." >&2
exit 1
