# Claude Console Mirror (Obsidian plugin)

Mirrors the Obsidian renderer console (log/warn/error, uncaught errors, unhandled
rejections) to `~/.claude/logs/obsidian-console.jsonl` so Claude Code can tail it
while debugging. Rotates at 10 MB.

Absorbed into the monorepo on 2026-10-21 from the in-vault copy (it previously had no
source anywhere else). `main.js` is the source; there is no build step.

Deploy: copy `main.js` and `manifest.json` to
`<vault>/.obsidian/plugins/claude-console-mirror/`, then reload the plugin.
`ops/tr-suite/verify.sh` checks the deployed copy matches this one.
