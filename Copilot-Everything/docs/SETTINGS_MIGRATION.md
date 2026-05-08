# Settings Migration

## Policy

`copilot-mcp` starts clean by default.

It does not assume shared plugin storage with `copilot`, because Obsidian plugin state is keyed by plugin id. The fork therefore exposes an explicit one-time import path instead of silently reusing official-plugin state.

## Real Import Source

Default source:
- `/Volumes/ExtraCurricular/My Digital Garden/.obsidian/plugins/copilot/data.json`

Default target:
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/dev-vault/.obsidian/plugins/copilot-mcp/data.json`

Because the dev-vault plugin folder is a symlink to the runtime bundle, the actual file lives under:
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/deploy/obsidian/plugins/copilot-mcp/data.json`

`scripts/dev-build.sh` was updated to preserve `data.json` during rebuilds.

## Script

Script:
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/settings-import.sh`

Supported modes:

```bash
/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/settings-import.sh dry-run
/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/settings-import.sh apply
/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/settings-import.sh clear
/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/settings-import.sh rollback "<backup-path>"
```

Optional source override for safe testing:

```bash
SETTINGS_IMPORT_SOURCE="/Users/trevorrobey/THE Copilot in Obsidian Everything/configs/copilot-settings-import.redacted.json" \
  /Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/settings-import.sh apply
```

## Validation Performed

Validated with the redacted fixture:
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/configs/copilot-settings-import.redacted.json`

Validated flows:
- Dry run
- Apply
- Rebuild preservation
- Clear
- Rollback
- Final clean-start reset

No live production secrets were copied into the workspace as part of the validation run.

## Current State

After validation, the dev install was returned to a clean-start state:
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/deploy/obsidian/plugins/copilot-mcp/data.json` does not exist.

## Rollback

Backups created during validation:
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/deploy/backups/20260317-185847-settings-copilot-mcp/data.json`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/deploy/backups/20260317-185847-settings-copilot-mcp-clear/data.json`

Use the script's `rollback` mode or the generic restore helper in `/Users/trevorrobey/THE Copilot in Obsidian Everything/docs/ROLLBACK.md`.
