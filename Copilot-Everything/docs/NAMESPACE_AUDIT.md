# Namespace Audit

## Verified Isolation

Verified side-by-side separation for the fork:
- Plugin folder id: `copilot-mcp`
- Manifest id: `copilot-mcp`
- Manifest name: `Copilot MCP`
- Command namespace constant: `copilot-mcp`
- Chat view type: `copilot-mcp-chat-view`
- Apply view type: `copilot-mcp-apply-view`
- Event names: `copilot-mcp:*`
- Selection highlight ids: `copilot-mcp-selection-highlight`, `copilot-mcp-chat-selection-highlight`
- Command-related storage keys: `copilot-mcp-command-*`
- System prompt keys: `copilot-mcp-system-prompt-*`
- Collapsible DOM prefix: `copilot-mcp-collapsible`
- Draggable modal data attribute: `data-copilot-mcp-draggable-modal`
- Quick Ask overlay and mobile drawer classes now use `copilot-mcp-*` variants
- Semantic index paths: `.copilot-mcp-index` and `copilot-mcp-index-*`
- Vault content defaults: `copilot-mcp/copilot-conversations`, `copilot-mcp/copilot-custom-prompts`, `copilot-mcp/system-prompts`

## Intentional Legacy/Compatibility Holdovers

These remain on purpose:
- `{copilot-selection}` placeholder for custom command compatibility
- `obsidian-copilot-v1` encryption key constant in `/Users/trevorrobey/THE Copilot in Obsidian Everything/repos/obsidian-copilot-mcp/src/encryptionService.ts`
- `copilot-plus*` model ids and provider names, because they refer to hosted model families rather than plugin identity

## Residual Risks

Residual namespace risk still exists in non-id CSS class names and internal strings:
- Many UI classes still use `.copilot-*`
- Some quick-ask and citation styles remain globally named for CSS convenience
- The bridge workspace targets backend-first command dispatch (`/v1/self-host/tool-call`) and `copilot:*` prompt commands for compatibility when backend fallback is needed

These do not currently block build or deployment, but they remain the main side-by-side audit area for future cleanup.

## Checks Run

Key searches used:

```bash
rg -n 'copilot[-_:]' "/Users/trevorrobey/THE Copilot in Obsidian Everything/repos/obsidian-copilot-mcp/src"
rg -n 'data-copilot-draggable-modal|copilot-keyboard-open|copilot-quick-ask-overlay-host|copilot-quick-ask-overlay-pos|copilot-quick-ask-resizing' "/Users/trevorrobey/THE Copilot in Obsidian Everything/repos/obsidian-copilot-mcp/src"
```

## Side-by-Side Test State

Installed together in the same dev vault:
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/dev-vault/.obsidian/plugins/copilot`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/dev-vault/.obsidian/plugins/copilot-mcp`

The filesystem layout is collision-free. Live Obsidian in-app coexistence still requires the dev vault to be opened successfully inside the Obsidian app session.
