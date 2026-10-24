# `_continuity/` — Shared cross-surface continuity system

This directory is a **whole file system for keeping every Claude surface on the same page**
about the Trevor Robey, INC. business stack. Its job: any of the four surfaces can sit down,
learn *exactly* what's being worked on and what changed, then contribute — read, adjust, add,
and cooperate — without stepping on each other.

It is a **file convention, not a service.** Nothing runs. It works because every surface reads
one file and appends to it.

```
_continuity/
├── CONTINUITY.md   ← THE living shared board. Read first, append on progress/handoff.
├── README.md       ← this file: the protocol, reachability, write-safety, rollover.
└── log/            ← archive of retired board cycles (keeps the live board lean).
    └── README.md
```

---

## The four surfaces and how each reaches this file

All four reach the repo **directly on disk** — this is repo-canonical, one physical file, no
mirror.

| Surface | Route to `_continuity/CONTINUITY.md` | How it finds the board |
|---|---|---|
| **CLI Claude Code** | Native filesystem (working dir is the repo, or an absolute path). | Auto-reads repo `CLAUDE.md` (has a pointer) + the repo skill `continuity-board` triggers on session start / "handoff" language. |
| **Desktop Claude Code** (Desktop Code tab) | Filesystem MCP / native file tools. | Same as CLI — repo `CLAUDE.md` pointer + `continuity-board` skill. |
| **Cowork** | Filesystem (writes files in this repo directly). | repo `CLAUDE.md` board pointer (top of file). |
| **Claude Chat (Desktop app)** | **Filesystem MCP connector**, allowed roots `/Users/myhome` + `/Volumes/ExtraCurricular`. Reads/writes the repo directly. | The user (or a prior note) points Chat at `_continuity/CONTINUITY.md`. Chat is **not** limited to the `:8798` Obsidian bridge. |

> **Important correction (2026-07-01):** the repo `CLAUDE.md` topology used to imply Chat could
> only reach local notes via the `:8798` Obsidian bridge. That is stale. **Desktop Claude Chat
> has a Filesystem MCP connector** rooted at `/Users/myhome` and `/Volumes/ExtraCurricular`, so
> it reaches the repo filesystem directly. `:8798` is an *extra* semantic path (Obsidian /
> Zettelkasten over `My Digital Garden`), not Chat's only route to disk. This is now recorded in
> `CLAUDE.md` → "Multi-Operator Topology" so the constraint doesn't get re-baked.

---

## The protocol (all surfaces follow this)

1. **Read on start.** Before doing business work, open `CONTINUITY.md`. Read **Current focus**
   and the top few **Log** entries. That is the live state of the whole operation.
2. **Update "Current focus" to the truth of *now*.** It's the one section you *overwrite* rather
   than append — it must always answer "what are we working on this minute?"
3. **Append a Log entry on meaningful progress or handoff.** Prepend (newest at top) using the
   template in `CONTINUITY.md`. A "meaningful chunk" = a decision made, a thing built/fixed, a
   question answered, or a stopping point. Skip it for trivial one-liners.
4. **Append, don't rewrite, others' Log entries.** The history of who-did-what is the value.
5. **Name your surface** in every entry (`CLI Claude Code` / `Desktop Claude Code` / `Cowork` /
   `Claude Chat`) so cooperation is legible.
6. **Point to canon, don't fork it.** This board is a *pointer + state* layer. Deep facts live in
   `CLAUDE.md`, `SYSTEM-REALITY.md`, `HOW-IT-WORKS.md`. Link, don't
   duplicate.

> **Scope gate — business only:** only write to the board when the work relates to the Trevor
> Robey, INC. business — the engine, offerings/revenue/brand/legal, or this repo's own
> infra/topology (the `:8798` bridge, vault, connectors, plugins). Unrelated work (home network,
> Security Everything, personal) goes to `~/.claude/handoffs/`, memory, or its own repo — not here.
> The business repo's *own infrastructure* counts as business-related (e.g. verifying the `:8798`
> bridge is a valid Log entry).

This is deliberately close to the `session-handoff` skill's format, generalized from a one-shot
handoff into a **living, multi-writer board**.

---

## Write safety <a id="write-safety-external-volume"></a>

> **Updated 2026-07-26 — the external-volume hazards below no longer apply.** `CONTINUITY.md` now
> lives at `/Users/myhome/TRINC/_continuity/CONTINUITY.md` on the **internal,
> FileVault-protected APFS disk**: always mounted, journaled, no disksleep. The two failure modes
> this section used to warn about — first-access `EPERM` after the SSD slept, and Chat-side writes
> wedging the Filesystem MCP against `/Volumes/ExtraCurricular` — were **properties of that external
> volume**, not of this file. Retained below as history, because the drive still exists and anything
> still reading from it inherits those hazards.
>
> *Historical:* the board lived on the `/Volumes/ExtraCurricular` external SSD. Disksleep made the
> first access after sleep fail (fix: just retry — a read/write wakes it; never prompt the user to
> re-grant Full Disk Access), and Chat-side writes to that volume **hung** until the Filesystem MCP
> connector was restarted.

**Safe-write pattern for every surface — still the rule, for a different reason.** The hazard now is
not the disk, it is *concurrency*: four surfaces share one file, and Cowork or Chat may be mid-edit.

1. **Probe first.** Do a cheap read of `CONTINUITY.md` immediately before writing, so you are
   editing what is actually there rather than a stale copy.
2. **Prefer append-style edits.** Prepend one self-contained Log entry rather than rewriting the
   whole file. Small, additive edits never clobber another surface's work.
3. **Verify after.** Re-read the top of the file and confirm your entry landed.
4. **Never** work around a failed write by writing to a *different* file — that fragments the board,
   which is the exact problem this system exists to prevent.

> If a surface is still reading the board from `/Volumes/ExtraCurricular`, it is pointed at the
> **stale pre-migration copy**. Repoint it; do not edit that copy.

---

## Keeping the board lean — rollover

When `CONTINUITY.md`'s Log gets long (say > ~30 entries or the file feels heavy):

1. Create `log/CONTINUITY-<YYYY-MM-DD>.md`.
2. Move the **older** Log entries into it (keep the most recent ~5–10 on the live board).
3. Leave a one-line pointer at the bottom of the live Log: *"Older entries archived to
   `log/CONTINUITY-<date>.md`."*
4. **Current focus / Active workstreams / Parking lot stay on the live board** — only the Log
   tail is archived.

Any surface can do a rollover; log it as a normal entry.

---

## Reusing this pattern for other projects

This is intentionally generic. To stand it up in another project/repo: copy `_continuity/`, empty
`CONTINUITY.md`'s live sections, adjust the **Surfaces** table + **Operating posture** to that
project, and add discovery pointers to that repo's entry docs (its `CLAUDE.md`, any Cowork anchor,
etc.). The `continuity-board` skill (`.claude/skills/continuity-board/`) travels with the repo for
the Code surfaces.

---

## Relationship to the other handoff tools (don't confuse them)

- **This board** = a *persistent, shared, cross-surface* state file for one project. Many writers,
  long-lived.
- **`session-handoff` skill** (`~/.claude/skills/session-handoff/`) = a *one-shot* Claude-Code
  handoff capturing a specific conversation's Session ID + `claude --resume` command. Use it to
  resume an *exact* CLI/Code conversation. A session-handoff can *reference* this board; it doesn't
  replace it.
- **`context-handoff` skill** = a paste-ready bundle for a *different* LLM (Gemini/GPT). Unrelated
  to this board.
