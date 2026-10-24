---
name: continuity-board
description: Read from and append to the shared cross-surface continuity board at `_continuity/CONTINUITY.md` for the Trevor Robey, INC. / TRINC stack. This is the ONE living file all four Claude surfaces (CLI Claude Code, Desktop Claude Code, Cowork, Claude Chat) share to know what's being worked on. Trigger at the START of substantive work in this repo (read the board first), and whenever the user says "update the continuity board", "log this to continuity", "what's the current focus", "what are we working on", "check the board", "hand this off", "log progress", "continuity", or any close variant. Also trigger before stopping meaningful work to append a Log entry. This is a repo-scoped file convention, not a service.
---

# continuity-board — shared cross-surface work log

The board `_continuity/CONTINUITY.md` (repo root) is the single source of truth for *what is
being worked on right now* across all four Claude surfaces. Full docs: `_continuity/README.md`.

## When to use

- **Session start / picking up work in this repo** → READ the board first.
- **Meaningful progress or a handoff** → APPEND a Log entry.
- **User asks** "what are we working on / current focus / update the board / log this / hand off".

## Read (session start)

Read `_continuity/CONTINUITY.md`. Absolute path:
`/Users/myhome/TRINC/_continuity/CONTINUITY.md`.
Report back **Current focus** + the top 3–5 Log entries — that's the live state. Then do the work.

## Append (progress / handoff)

1. **Probe first** — read the file immediately before editing. The board moved to the internal
   FileVault disk on 2026-07-26, so the old external-SSD hazards (disksleep `EPERM`, a wedged
   Filesystem MCP) no longer apply; the reason to probe now is **concurrency** — four surfaces
   share this one file and another may be mid-edit.
2. **Update "Current focus"** to the truth of now (overwrite that one section).
3. **Prepend one Log entry** (newest at top) using the template below.
4. **Verify** — re-read the top and confirm the entry landed.
5. Keep it additive — never rewrite another surface's Log entries.

### Entry template

```markdown
### <UTC, `date -u +%Y-%m-%dT%H:%MZ`> · <this surface> · <short title>
- **Did:** <decisions + actions>
- **State:** working | blocked | handed-off | done
- **Next:** <concrete next action, file:line where useful>
- **Touches:** <key files>
- **For whoever's next:** <the one must-know thing, or nothing>
```

Name the surface honestly: from the CLI it's `CLI Claude Code`; from the Desktop Code tab it's
`Desktop Claude Code`.

## Rollover

If the Log is long (> ~30 entries), archive the older tail into `_continuity/log/CONTINUITY-<date>.md`
(keep ~5–10 recent on the live board) and leave a pointer. See `_continuity/README.md`.

## Don't

- **Don't log work unrelated to the business.** The board is **business-scoped**: the citation
  engine, offerings/revenue/brand/legal, or this repo's own infra/topology (the `:8798` bridge,
  vault, connectors, plugins). Home-network / Security Everything / personal work goes to
  `~/.claude/handoffs/`, memory, or its own repo — not here. (Repo infra *does* count.)
- Don't duplicate business canon here — point to `CLAUDE.md`, `SYSTEM-REALITY.md`,
  `THE-WHOLE-SYSTEM.md`.
- Don't work around a hung write by writing to a *different* file — retry the board write; a
  fragmented board defeats the whole point.
- Don't confuse this with the global `session-handoff` skill (one-shot conversation resume) — this
  is the *persistent, shared, multi-writer* board.
