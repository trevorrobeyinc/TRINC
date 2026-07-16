# Contextual Wiki Definitions (Obsidian Plugin)

Automatically creates precise, context-grounded definitions when you follow a new `[[Wiki Link]]`. The plugin infers meaning from the originating note and inserts a clean Markdown definition template into the new note.

## What happens when you click a wiki link
- If the target note doesn’t exist, Obsidian creates and opens an empty note.
- This plugin detects that event, grabs the previously active note as the “origin note,” and uses its content as context.
- It asks the Copilot API (using your license) to produce a definition following a strict template.
- The returned content replaces the empty note contents (one-time insertion).

## Definition template
The model receives this exact template and must produce output that matches it:

Role: You are a Feynman-style teacher. Explain the linked term in plain language using only the origin note’s context.

Output format (exact headings; no extra sections):
```
---
aliases: ["<Term>"]
tags: ["wiki", "auto", "feynman"]
origin: "[[<Origin Note Title>]]"
generated: true
confidence: "0-100"
sense: "one short phrase"
---

## Term - [[<Term>]]

## Feynman Summary
- (2–3 simple sentences, no jargon)

## Intuitive Analogy
- (Vivid analogy in everyday terms)

## One-Sentence Definition
- (≤30 words)

## Key Points
- (4–6 bullets)

## Why This Matters
- (2–3 sentences)

## Building Blocks
- (2–4 prerequisites, use [[wiki links]] when possible)

## Example / Use (In this note's domain)
- (2–3 concrete examples)

## Common Misconceptions
- (2–3 bullets; start each with "It's NOT...")

## Boundaries (Not to confuse with)
- (2–3 near-miss concepts)

## Related Concepts
- (4–8 items; use [[wiki links]])

## Source Context (From the Note)
- From: [[<Origin Note Title>]]
> (Quote EXACTLY 1–2 lines from the origin note)

## Self-check
- (2 application-style questions)
```

Guidelines:
- Use ONLY the originating note context.
- Use concise, high-signal prose and plain Markdown only.
- Keep the section order unchanged.

## Setup
1) Enable community plugins in Obsidian.
2) Install/enable “Contextual Wiki Definitions”.
3) Open Settings → Contextual Wiki Definitions → paste your Copilot believer/plus license key.
   - The license key field is masked by default (password type) for security.
   - Use the "Reveal" button to temporarily show the key if needed.

## Settings
- **Auto-insert on file open**: When enabled, empty notes opened from a wiki link are automatically filled with a definition.
- **Require origin link to trigger**: Only generate when the origin note actually contains a wiki link to the new note (prevents generation for unrelated empty notes).
- **Definitions folder**: All new definition notes are created/relocated into this single vault folder (created automatically if missing). Default: `Contextual Wiki Definitions`. You can then move each note wherever you like — the wiki link still resolves by name.

## Usage

### One command / hotkey: "Define selection or regenerate definition"
Bind a hotkey to **Contextual Wiki Definitions: Define selection or regenerate definition** (Settings → Hotkeys). It does one of two things depending on context:

- **Text selected → Define selection.** Highlight a word or phrase in a note and press the hotkey. The plugin wraps the selection as a `[[wiki link]]` in that note, creates the definition note **in the configured Definitions folder** (see Settings), generates the context-grounded definition from the origin note, and opens the new note. Move the note wherever you like afterward — the link still resolves by name. If a note for that term already exists, it is opened (never overwritten).
- **No selection → Regenerate.** Rebuilds the current note's definition using the previously-active note as origin. If no distinct origin is known, a quick picker lets you choose one.

### Click-to-define (automatic)
- Type a wiki link like `[[Your Term]]` in a note, then click it.
- When the empty note opens, the plugin inserts a completed definition template using the origin note as context. (Governed by the "Auto-insert on file open" setting.)
- **Graph / Local Graph clicks are supported too (v1.4.0).** Clicking a node in the Graph or Local Graph view counts as an intentional "define this," so the note is generated even when the note you were last reading isn't the one that links the term. The plugin first tries to use a note that actually links the term as context; if none does, it falls back to the note you were last viewing (usually the same topical neighbourhood). With "Require origin link to trigger" ON, normal empty notes (e.g. a fresh daily note) are still skipped — only wiki-link and graph-node opens generate.

## How it works (technical)
- Listens to `file-open` events; when an empty Markdown file opens, it treats the previously active note as the origin context.
- Sends a single prompt (with the template + origin content) to the Copilot API and writes the returned Markdown into the new note.

## Privacy & Security

### Data Sent to API
- **Origin note content**: The full text of the previously active note (up to 20,000 characters) is sent as context.
- **Term being defined**: The basename of the new note (the `[[term]]` you clicked).
- **No other vault data**: Only the single origin note and term are transmitted. No other files, settings, or vault metadata are sent.

### Output Sanitization (Security)
By default, the plugin sanitizes all API responses before writing them to your notes to prevent code injection:

- **Code blocks stripped by default**: All fenced code blocks (including `dataviewjs`, `javascript`, `typescript`, `bash`, etc.) are removed from generated definitions. This prevents execution of potentially dangerous code.
- **HTML tags stripped by default**: Dangerous HTML tags (`<script>`, `<iframe>`, `<object>`, `<embed>`) are removed.
- **Output length limit**: Generated definitions are capped at 60,000 characters (configurable) to prevent huge writes.

**To customize sanitization:**
- Open Settings → Contextual Wiki Definitions
- Toggle "Allow code blocks in output" to preserve code blocks (not recommended unless you trust the API)
- Toggle "Allow raw HTML in output" to preserve HTML tags (not recommended)
- Adjust "Maximum output length" if needed

**Why sanitization matters:** The remote API response is untrusted content. Without sanitization, malicious code blocks (especially `dataviewjs`) could execute when Obsidian renders your notes, potentially accessing your vault data or performing unwanted actions.

### Network Requests
- The plugin uses Obsidian's `requestUrl()` API when available (better integration, mobile support).
- Falls back to standard `fetch()` if `requestUrl()` is unavailable or fails.
- Requests time out after a configurable "API timeout" (default 180 seconds — full Feynman generations were measured at ~107s on copilot-plus-flash, so the old 30s ceiling aborted every real request and produced fallback-template "pending" notes).
- **Streaming first (v1.4.2):** the API is tried in SSE-streaming mode first, then non-stream, then the non-flash model. Measured on 2026-07-16: the identical generation that hung past 180s as a non-stream request completed in ~66s via SSE.
- **Zettelkasten sections fill progressively (v1.4.2):** the five Vault Zettelkasten trait sections are computed serially by the local model and can take several minutes each (measured 2–6.5 min per run). Results are never discarded — each section updates automatically whenever its trait finishes; after 3 minutes a section still in progress says so explicitly.
- Error responses are logged with truncated bodies (first 300 chars) to reduce sensitive data exposure.

## Troubleshooting
- Nothing happens: ensure the new note is empty and you clicked a freshly created wiki link. (Since v1.4.0, clicking a node in the Graph / Local Graph view also triggers generation — you no longer need the previously-open note to contain the link.)
- API errors: verify your Copilot license key in settings and that you have network access.
- Double insertion: if you undo/redo and the note becomes empty again, the plugin may re-trigger on reopen.

## Debugging
- Open the developer console (Cmd+Opt+I on macOS) and check logs under "[Contextual Wiki Definitions]".
- The plugin shows progress/failure via Obsidian notices (top-right toasts).

## License
MIT
