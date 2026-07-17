# Origin Nest (Obsidian plugin)

Visually groups notes under their **origin** note in the File Explorer — keyed off a
frontmatter link — **without ever moving a file on disk**. Turn the plugin off and the
explorer returns to stock; no note was touched.

Built for the Contextual Wiki Definitions workflow, where each generated definition note
carries `origin: "[[Origin Note]]"`. Instead of exiling those definitions into one flat
folder, Origin Nest keeps them wherever they live and shows the relationship in the
explorer.

## Modes

Set in **Settings → Origin Nest → Mode**.

### Decorate (Tier 1) — safe, non-structural
Decorates existing explorer rows; nothing is reparented.
- **Count badge** on each origin note (`Origin ⟨4⟩`) — how many notes point to it.
- **Accent rail** (and optional indent / dim) on nested child rows.
- **Commands** — *Reveal origin of current note*, *List notes nested under current note*.
- **Right-click menu** items mirroring both commands.

### Nest (Tier 2) — collapsible children beneath the origin
Everything from Decorate, **plus** a collapsible group of the children rendered directly
under the origin note's row:
- A **disclosure triangle** on the origin row; collapse/expand state is remembered per
  origin (and there's a *Collapse / expand all origin groups* command).
- Each child appears as a **plugin-owned row** (click to open, right-click for a native
  file menu with Open / Open in new tab / rename / delete …).
- The child's **real row is hidden in its home folder** (toggle:
  *Hide nested notes in their own folder*), so each definition shows up only under its
  origin, decluttering the flat definitions folder.

Tier 2 renders its own rows and hides the originals rather than moving Obsidian's managed
nodes — so it never fights the explorer's virtual scroller and is fully reversible.

## Reciprocal Definitions backlink (opt-in — the one feature that writes to notes)

Enable **Settings → Origin Nest → Maintain a Definitions list on origin notes** and the
plugin keeps a marker-delimited block on each origin note that links back down to its
children:

```
<!-- origin-nest:definitions -->
## Definitions
- [[Chess AI]]
- [[Pattern Matching]]
- [[The Chinese Room Argument]]
<!-- /origin-nest:definitions -->
```

So the origin↔definition link shows from **both** directions — in the note body, in the
origin's backlinks pane, and in Graph view — not just in the explorer.

- **Accurate & self-healing.** Because Origin Nest holds the full live graph, the list is
  rebuilt whenever definitions are added, removed, or renamed (not a write-once stamp).
- **Idempotent / loop-safe.** The block is only rewritten when its content actually
  changes, so it never ping-pongs against Obsidian's metadata events.
- **Reversible.** Turning the feature off removes every managed block. The markers mean it
  only ever touches its own block — the rest of each note is left untouched.
- The *Rebuild Definitions backlinks now* command forces a resync on demand.

## How it decides what's nested

For every markdown note, the plugin reads the configured frontmatter key (default
`origin`). If its value resolves — via `[[wikilink]]`, `[[link|alias]]`, `[[Note.md]]`, or
a path — to another note, that note becomes the **origin** and this note one of its
**children**.

## Settings

| Setting | Default | Effect |
|---|---|---|
| Origin frontmatter key | `origin` | Which frontmatter field defines the parent link |
| Mode | Decorate | `Decorate` (Tier 1), `Nest` (Tier 2), or `Off` |
| Count badge on origin notes | On | Show the child-count pill |
| Hide nested notes in their own folder | On | *(Nest)* hide each child's real row in its home folder |
| Dim nested notes | On | Mute the color of child rows |
| Indent nested notes | On | *(Decorate)* small left indent on child rows |
| Maintain a Definitions list on origin notes | **Off** | *(Writes to notes)* keep a managed `## Definitions` backlink block on each origin |
| Backlink section heading | `Definitions` | Heading used for the managed list |

## Safety & compatibility

- **View-only by default.** In Decorate/Nest modes no file is moved, renamed, or written;
  `onunload` strips every injected element/class/attribute (badges, toggles, synthetic
  groups) and un-hides real rows. The **one exception** is the opt-in *Maintain a
  Definitions list* feature (off by default), which writes a marker-delimited block into
  origin notes and removes it again when disabled.
- **Graceful degradation.** The explorer internals it reads (`.nav-files-container`,
  `.nav-file-title[data-path]`) are **not** part of Obsidian's public API. If a future
  Obsidian version changes that markup, decoration/nesting silently no-op — the commands
  and right-click items (public API) keep working — rather than breaking the pane.
- **Self-healing.** A single debounced, clean-slate rebuild runs on metadata / vault /
  layout changes, so the view stays consistent through explorer re-renders.
- No build step: `main.js` is the source (plain CommonJS), matching the sibling
  contextual-wiki-definitions plugin.

## Known limitations (Nest mode)

- One level of nesting is modeled; deep origin→origin chains aren't specially handled.
- An origin whose row isn't currently rendered (its folder collapsed or scrolled far out
  of view) won't show its group until that row is on screen.
- Synthetic child rows support click-to-open and a right-click menu, but not native
  drag-and-drop reordering.

## Install (local)

Lives directly in the vault's plugin folder (no symlink):

```
/Volumes/ExtraCurricular/My Digital Garden/.obsidian/plugins/origin-nest/
```

Enable it in **Settings → Community plugins → Origin Nest**, then reload the File Explorer
(toggle it, or reload Obsidian).
