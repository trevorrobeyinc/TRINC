# Upstream Sync

## Current Repo State

Fork workspace repo:
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/repos/obsidian-copilot-mcp`

Current branch:
- `master`

Current remote:
- `upstream -> git@github.com:logancyang/obsidian-copilot.git`

The clone originally used `origin` for the official upstream. That remote was renamed to `upstream` so the eventual personal fork can use `origin`.

## Recommended Remote Layout

- `upstream`: official project
- `origin`: your personal fork

When your fork exists, add it with:

```bash
git -C "/Users/trevorrobey/THE Copilot in Obsidian Everything/repos/obsidian-copilot-mcp" remote add origin <your-fork-url>
```

## Branch Policy

- Keep `master` aligned with `upstream/master`.
- Do feature work on topic branches prefixed with `codex/`.
- Rebase feature branches on top of updated `master` unless you intentionally want a merge bubble.

Recommended flow:

```bash
git -C "/Users/trevorrobey/THE Copilot in Obsidian Everything/repos/obsidian-copilot-mcp" fetch upstream
git -C "/Users/trevorrobey/THE Copilot in Obsidian Everything/repos/obsidian-copilot-mcp" checkout master
git -C "/Users/trevorrobey/THE Copilot in Obsidian Everything/repos/obsidian-copilot-mcp" rebase upstream/master
git -C "/Users/trevorrobey/THE Copilot in Obsidian Everything/repos/obsidian-copilot-mcp" checkout -b codex/<topic>
```

## Conflict Strategy

The fork-specific conflict surface should remain concentrated in:
- `manifest.json`
- `package.json`
- `src/constants.ts`
- `src/settings/model.ts`
- `src/settings/v2/components/CopilotPlusSettings.tsx`
- `src/settings/v2/components/McpSettings.tsx`
- `src/settings/v2/SettingsMainV2.tsx`
- `src/settings/SettingsPage.tsx`
- `src/backend/*`
- `src/mcp/*`
- workspace deploy and migration scripts under `/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts`

When pulling upstream:
- Keep upstream bug fixes and feature work by default.
- Re-apply the fork identity (`copilot-mcp`) intentionally.
- Preserve the backend adapter split and never reintroduce direct Brevilabs calls outside the hosted adapter.
- Preserve `backendMode=self_host` no-fallback behavior.
- Preserve MCP as a separate tool-provider layer.

## Release Pull Checklist

1. `git fetch upstream`
2. Review upstream release notes and changed files.
3. Rebase or merge onto `upstream/master`.
4. Re-run `scripts/dev-build.sh`
5. Re-run `scripts/dev-deploy.sh --with-official`
6. Re-run namespace audit checks from `/Users/trevorrobey/THE Copilot in Obsidian Everything/docs/NAMESPACE_AUDIT.md`
7. Re-run stale path search with `/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/stale-path-search.sh`
8. Update workspace docs if new upstream files expand the conflict surface
