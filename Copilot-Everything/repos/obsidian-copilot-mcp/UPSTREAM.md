# obsidian-copilot-mcp — Upstream lineage

This directory is a **vendored fork** of `logancyang/obsidian-copilot`, captured at a specific SHA when the TrevClaw-Obsidianodus monorepo was consolidated on 2026-05-07. The fork's nested `.git` was removed during consolidation per the monorepo "single root, no nested .git" policy.

## Provenance

| Field | Value |
|---|---|
| Upstream repo | `https://github.com/logancyang/obsidian-copilot.git` |
| Vendored SHA | `df6153867e162a251a3ab1634ac269d27de17fa6` |
| Fork branch (at time of vendor) | `codex/post-validated-mcp-baseline` |
| Fork tip commit message | `feat: establish copilot-mcp backend adapters and MCP tool layer baseline` |
| Vendored on | 2026-05-07 |
| Owner | trevoralexanderrobey |

## Recent fork history (last 10 commits at vendor time)

```
df61538 feat: establish copilot-mcp backend adapters and MCP tool layer baseline   <-- VENDOR HEAD
95d23b2 release: v3.2.8 (#2369)
2e3d6ba feat(miyo): add toggle to search all indexed content (#2353)
1960d86 release: v3.2.7 (#2352)
d8890ad refactor(miyo): rename folder_path request param to folder_name (#2349)
c350f37 refactor(miyo): rename folderPath to folderName and send relative path in parse-doc (#2348)
8577705 fix(debug): remove idx column from search results debug table (#2344)
ccf687b Use vault name for Miyo requests (#2342)
7084705 release: v3.2.6 (#2335)
81fd4e5 feat(miyo): add remote vault folder path override for remote servers (#2334)
```

## How to re-sync from upstream

```
git clone https://github.com/logancyang/obsidian-copilot.git /tmp/obsidian-copilot-upstream
cd /tmp/obsidian-copilot-upstream
git log df61538..HEAD --oneline
```

Inspect the diff between the vendor SHA and upstream `master`. Apply manually or rebase the fork branch (`codex/post-validated-mcp-baseline`) on a temporary clone, then `cp -R` into this directory.

## Why vendored, not submodule

The fork carries local-only changes on `codex/post-validated-mcp-baseline` that have not been pushed to a public fork repo. Vendoring keeps everything in one place; the trade-off is no automatic upstream tracking. If/when this fork is published as its own GitHub repo, this directory should be converted to a `git submodule add`.
