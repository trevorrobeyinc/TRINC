# Official Direct MCP + Miyo Cutover Report

Date: 2026-03-21

## Outcome

The official `copilot` slot in `My Digital Garden` is now running through:

- hosted/Copilot model
- `direct_plugin_mcp`
- shared HTTP MCP server at `https://127.0.0.1:8798`
- native Miyo via HTTPS proxy at `https://127.0.0.1:8743` (upstream `http://127.0.0.1:8742`)

The emulator is out of the normal official-plugin path.

## Important Runtime Note

The marketplace-installed official `copilot` build in the vault did not actually contain the MCP runtime features required by this cutover. Configuration alone was not enough.

To make the plan real in the official slot, the MCP-capable runtime from the local fork was overlaid into:

- `/Volumes/ExtraCurricular/My Digital Garden/.obsidian/plugins/copilot/main.js`
- `/Volumes/ExtraCurricular/My Digital Garden/.obsidian/plugins/copilot/styles.css`

using:

- `/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/deploy-mcp-runtime-to-official-plugin.sh`

## Validation Summary

Passed:
- `miyo mcp` stdio probe returned tools successfully
- official plugin direct Miyo runtime check passed
- official plugin hosted `copilot_plus` turn successfully called shared MCP health tool
- shared MCP server health check passed
- official plugin exposed all five shared MCP tools at runtime
- full force reindex completed through the Miyo backend
- post-reindex Miyo search still returned results

Artifacts:
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/configs/validation/official-plugin-miyo-runtime.json`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/configs/validation/official-plugin-direct-chat-status.json`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/configs/validation/official-plugin-reindex-status.json`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/configs/validation/official-plugin-reindex-before.json`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/configs/validation/official-plugin-reindex-after.json`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/configs/validation/official-plugin-reindex-search.json`

## Reindex Result

Completed runtime state:

- `status = completed`
- `count = 601`
- `activeBackendKey = miyo`
- `sourceId = /Volumes/ExtraCurricular/My Digital Garden`

Miyo stats:

- before: `1911 chunks / 587 files`
- after: `2139 chunks / 601 files`

## Operational Scripts

- `/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/official-plugin-direct-mcp-cutover.sh`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/deploy-mcp-runtime-to-official-plugin.sh`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/official-plugin-miyo-check.sh`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/official-plugin-direct-chat-check.sh`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/official-plugin-force-reindex.sh`
