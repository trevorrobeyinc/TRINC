const obsidian = require('obsidian');
const path = require('path');
const { Plugin, PluginSettingTab, Setting, SuggestModal, Notice } = obsidian;
// Import requestUrl safely (may not be available in all Obsidian versions)
let requestUrl;
try {
  requestUrl = obsidian.requestUrl;
} catch (_) {
  // requestUrl not available, will use fetch fallback
}

/*
 * SECURITY ANALYSIS & HARDENING PLAN
 * ===================================
 *
 * Trust Boundaries:
 * - Local vault content: TRUSTED (user's own notes)
 * - Remote API response: UNTRUSTED (could contain malicious code/scripts)
 * - Settings storage: SEMI-TRUSTED (user input, but stored locally)
 *
 * Identified Risks:
 * 1. Remote content injection: API responses written directly to notes without sanitization
 *    - Risk: dataviewjs code blocks, HTML <script> tags, executable code
 *    - Mitigation: Sanitize output before writing (strip dangerous code blocks, HTML tags)
 *
 * 2. License key exposure: Visible in plain text in settings UI
 *    - Risk: Shoulder surfing, screen sharing, accidental exposure
 *    - Mitigation: Mask input field as password type, add reveal toggle
 *
 * 3. Origin context leakage: Full note content sent to remote API
 *    - Risk: Privacy concern, but intentional for functionality
 *    - Mitigation: Document clearly in README what data is sent
 *
 * 4. Runaway retries: Retry logic could loop indefinitely
 *    - Risk: Infinite API calls, resource exhaustion
 *    - Mitigation: Cap retry attempts, clean up attemptCounts on success/failure
 *
 * 5. Origin file reset bug: previousFile gets nulled when opening non-md files or null files
 *    - Risk: Loss of origin context, broken functionality
 *    - Mitigation: Only update previousFile for valid markdown files
 *
 * Hardening Plan (Minimal UX Changes):
 * - Sanitize API output (default: strip code blocks + HTML, configurable)
 * - Mask license key in UI (password field + reveal toggle)
 * - Add output length limit (60k chars) to prevent huge writes
 * - Use Obsidian requestUrl() for better integration (fallback to fetch)
 * - Add in-flight locks to prevent double generation
 * - Fix retry cleanup and add attempt caps
 * - Reduce sensitive logging (truncate error bodies)
 */

module.exports = class ContextualWikiDefinitions extends Plugin {
  async onload() {
    await this.loadSettings();
    this.previousFile = this.app.workspace.getActiveFile();
    this._recentlyProcessed = new Set();
    this._attemptCounts = new Map();
    this._inFlightGenerations = new Set(); // Track files currently being generated

    // GRAPH-AWARE TRIGGER: track the previously-active leaf so we can tell when a
    // note was opened by clicking a node in the Graph / Local Graph view. Graph
    // clicks don't guarantee the previously-active NOTE links the term, so the
    // origin-link gate would otherwise silently skip them and leave a blank note.
    // We record the opened note by BASENAME (which survives the later move into
    // the definitions folder) plus a timestamp, and read it back after the
    // deferred generation kicks in (see _wasOpenedFromGraph).
    this._prevLeafType = null;
    this._graphOpenedBasename = null;
    this._graphOpenedAt = 0;
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf) => {
        let type = null;
        let base = null;
        try {
          type = leaf && leaf.view && typeof leaf.view.getViewType === 'function'
            ? leaf.view.getViewType()
            : null;
          const f = leaf && leaf.view && leaf.view.file;
          base = f && f.basename ? f.basename : null;
        } catch (_) {}
        const prev = this._prevLeafType;
        this._prevLeafType = type;
        // A markdown note became active and the leaf we just left was a graph view
        // → this note was reached by a graph-node click.
        if (type === 'markdown' && base && (prev === 'localgraph' || prev === 'graph')) {
          this._graphOpenedBasename = base;
          this._graphOpenedAt = Date.now();
        }
      })
    );

    this.registerEvent(
      this.app.workspace.on('file-open', async (file) => {
        const origin = this.previousFile;
        // SECURITY FIX: Only update previousFile for valid markdown files
        if (file && file.extension === 'md') {
          this.previousFile = file;
        }
        if (!file || !origin) {
          return;
        }

        if (file.extension !== 'md') {
          return;
        }
        if (!this.settings.autoInsertOnFileOpen) {
          return;
        }

        const initialStat = file.stat;
        const isBrandNew = initialStat && initialStat.size === 0;
        if (isBrandNew) {
          file = await this._ensureNoteInDefinitionsFolder(file);
          if (file && file.extension === 'md') {
            this.previousFile = file;
          }
        }

        // SECURITY FIX: Prevent double generation with in-flight lock
        if (this._inFlightGenerations.has(file.path)) {
          return;
        }
        this._inFlightGenerations.add(file.path);

        // Defer slightly to let other plugins (e.g., Templater) run first
        setTimeout(async () => {
          try {
            const stat = file.stat;
            const raw = await this.app.vault.read(file);
            const content = (raw || '').trim();
            const looksEmpty = !content || content.length < 10;
            const templaterError = /templater/i.test(content) && /error|abort/i.test(content);
            const alreadyPopulated = content.includes('## Term - The term being defined:');

            if (alreadyPopulated) {
              // BUG FIX: Clean up in-flight lock on early return
              this._inFlightGenerations.delete(file.path);
              return;
            }
            if (!(stat && stat.size === 0) && !looksEmpty && !templaterError) {
              // BUG FIX: Clean up in-flight lock on early return
              this._inFlightGenerations.delete(file.path);
              return;
            }
            if (this._isRecentlyProcessed(file.path)) {
              // BUG FIX: Clean up in-flight lock on early return
              this._inFlightGenerations.delete(file.path);
              return;
            }
            let effectiveOrigin = origin;
            let context = await this.app.vault.read(origin);
            if (this.settings.requireOriginLinkToTrigger) {
              const hasOriginLink = this._originHasLinkToTerm(origin, file, context);
              if (!hasOriginLink) {
                // The previously-active note doesn't link this term. Decide whether
                // this is still an intentional "define this" action:
                //   1) Some OTHER note actually links the term (e.g. a Local Graph
                //      neighbour) → use THAT note as the origin/context.
                //   2) The note was opened from a Graph / Local Graph view → treat
                //      it as intentional and generate with best-available context.
                // Otherwise (an unrelated empty note opened normally, e.g. a fresh
                // daily note) → skip, preserving the original safety behaviour.
                const linker = this._findNoteLinkingTerm(file.basename, file.path);
                const fromGraph = this._wasOpenedFromGraph(file);
                if (linker) {
                  effectiveOrigin = linker;
                  try { context = await this.app.vault.read(linker); } catch (_) {}
                } else if (!fromGraph) {
                  this._inFlightGenerations.delete(file.path);
                  return;
                }
                // fromGraph && !linker → keep the previously-active note as
                // best-effort context (it's usually the topical neighbourhood you
                // were browsing) and generate anyway.
              }
            }
            this._markProcessed(file.path);
            const term = file.basename;
            const originLink = this._computeOriginLinktext(effectiveOrigin, file);
            const prompt = this.buildPrompt(term, this._truncateContext(context), originLink, this._zkPlaceholderTraits());
            new Notice('Generating definition…');
            let definition = await this.queryCopilot(prompt);
            if (definition) {              definition = this._sanitizeOutput(definition);              definition = this._ensureSourceContextFromLine(definition, originLink);              await this.app.vault.modify(file, definition);
              this._attemptCounts.delete(file.path);              this._inFlightGenerations.delete(file.path);
              new Notice('Definition inserted.');
              this._enrichWithZettelkastenTraitsAsync(file, effectiveOrigin);
            } else {
              // Do not show an error yet; retry once after a short delay
              const key = file.path;
              const count = (this._attemptCounts.get(key) || 0) + 1;
              this._attemptCounts.set(key, count);
              // SECURITY FIX: Cap retries at 1 attempt to prevent infinite loops
              if (count <= 1) {
                setTimeout(async () => {
                  try {
                    const freshCtx = await this.app.vault.read(effectiveOrigin);
                    const retryOriginLink = this._computeOriginLinktext(effectiveOrigin, file);
                    const retryPrompt = this.buildPrompt(term, this._truncateContext(freshCtx), retryOriginLink, this._zkPlaceholderTraits());
                    let second = await this.queryCopilot(retryPrompt);
                    if (second) {
                      second = this._sanitizeOutput(second);
                      second = this._ensureSourceContextFromLine(second, retryOriginLink);
                      await this.app.vault.modify(file, second);
                      this._attemptCounts.delete(key);
                      this._inFlightGenerations.delete(file.path);
                      new Notice('Definition inserted.');
                      this._enrichWithZettelkastenTraitsAsync(file, effectiveOrigin);
                    } else {
                      // BUG FIX: both the first attempt and this retry returned empty.
                      // Previously this branch only showed a toast and left the note
                      // BLANK (the count>1 fallback path below is unreachable). Write
                      // the local fallback template so the note is never left empty.
                      try {
                        const fallback = this._buildLocalTemplate(term, retryOriginLink, this._truncateContext(freshCtx));
                        await this.app.vault.modify(file, fallback);
                        new Notice('Inserted local fallback definition (API failed).');
                      } catch (e2) {
                        console.error('Failed to insert fallback template (retry)', e2);
                        new Notice('Definition generation failed (see console).');
                      }
                      this._attemptCounts.delete(key);
                      this._inFlightGenerations.delete(file.path);
                    }
                  } catch (e) {
                    console.error('Retry generation failed', e);
                    // Last resort: still try the local fallback so a thrown error
                    // (e.g. a transient vault read failure) doesn't leave it blank.
                    try {
                      const retryOriginLink2 = this._computeOriginLinktext(effectiveOrigin, file);
                      const fallback = this._buildLocalTemplate(term, retryOriginLink2, this._truncateContext(context));
                      await this.app.vault.modify(file, fallback);
                      new Notice('Inserted local fallback definition (API failed).');
                    } catch (e3) {
                      console.error('Failed to insert fallback template (retry-catch)', e3);
                      new Notice('Definition generation failed (see console).');
                    }
                    this._attemptCounts.delete(key); // Clean up on error
                    this._inFlightGenerations.delete(file.path);
                  }
                }, 1000);
              } else {
                // Fallback: insert a minimal local template so user gets the From link
                try {
                  const fallback = this._buildLocalTemplate(term, originLink, this._truncateContext(context));
                  await this.app.vault.modify(file, fallback);
                  this._attemptCounts.delete(key); // Clean up on fallback
                  this._inFlightGenerations.delete(file.path);
                  new Notice('Inserted local fallback definition (API failed).');
                } catch (e) {
                  console.error('Failed to insert fallback template', e);
                  this._attemptCounts.delete(key); // Clean up on error
                  this._inFlightGenerations.delete(file.path);
                  new Notice('Definition generation failed (see console).');
                }
              }
            }
          } catch (err) {
            console.error('Contextual Wiki Definitions: file-open handler failed', err);            this._inFlightGenerations.delete(file.path);
          }
        }, 300);
      })
    );

    this.addSettingTab(new ContextualDefinitionSettingTab(this.app, this));

    // ONE command for the whole workflow (replaces the old separate
    // "Regenerate", "Pick origin", and "Test API roundtrip" commands):
    //  • With text selected → "Define selection": wrap the highlighted text as a
    //    [[wiki link]] in the current (origin) note, create the definition note
    //    in the configured definitions folder, generate the context-grounded
    //    definition, and open it.
    //  • With no selection → "Regenerate": rebuild the current note's definition
    //    using the previously-active note as origin; if no distinct origin is
    //    known, fall back to a quick origin picker.
    // Keeps id 'regenerate-definition' so any existing hotkey keeps working.
    this.addCommand({
      id: 'regenerate-definition',
      name: 'Define selection or regenerate definition',
      editorCallback: async (editor) => {
        const origin = this.app.workspace.getActiveFile();
        if (!origin || origin.extension !== 'md') return;

        const rawSel = (editor.getSelection() || '').trim();
        if (rawSel) {
          // ---- Define selection → new nested wiki-link note ----
          const term = this._cleanTerm(rawSel);
          if (!term) { new Notice('Select a term to define.'); return; }
          // Turn the highlighted text into a wiki link in the origin note
          // (skip if it is already a [[link]]).
          if (!/^\[\[[\s\S]*\]\]$/.test(rawSel)) {
            editor.replaceSelection(`[[${term}]]`);
          }
          const { target, created } = await this._createOrOpenLinkedNote(term);
          if (!target) return;
          if (!created) {
            // Don't clobber an existing definition — just open it.
            const existing = (await this.app.vault.read(target)).trim();
            if (existing.length > 0) { new Notice('Note already exists — opened it.'); return; }
          }
          await this._generateDefinitionInto(target, origin);
          return;
        }

        // ---- No selection → regenerate the current note ----
        const hasDistinctOrigin = this.previousFile && this.previousFile.path !== origin.path;
        if (hasDistinctOrigin) {
          await this.regenerateForCurrentNote();
        } else {
          // Fold in the old "pick origin" command: ask only when needed.
          const files = this.app.vault.getMarkdownFiles().filter((f) => f.path !== origin.path);
          new OriginNoteSuggestModal(this.app, files, async (picked) => {
            await this.regenerateForCurrentNote(picked);
          }).open();
        }
      },
    });
  }

  /**
   * Mapping of VZ trait keys → matching H2 section headings in the
   * Feynman-Metaphor template. Used by the async enrichment path to
   * locate and replace the placeholder body once a trait resolves.
   */
  _zkSectionMap() {
    return [
      { key: 'semanticLinker', heading: '🔗 Linked Concepts in This Vault' },
      { key: 'crossDomain',    heading: '🌉 Cross-Domain Metaphor Bridges' },
      { key: 'serendipity',    heading: '✨ Surprising Connections' },
      { key: 'echoChamber',    heading: '🪞 Where This Belief Could Break' },
      { key: 'orphanRescue',   heading: '🕯️ Forgotten Notes Worth Re-reading' },
    ];
  }

  /**
   * Empty trait set. As of v1.5.0 the five graph sections are written by the
   * MAIN model from the Five Vault Lenses baked into buildPrompt() — they are
   * real content from the first write, not placeholders. Vault Zettelkasten
   * enrichment (Ollama, minutes later) now only UPGRADES a section when it
   * returns genuine vault-grounded output; it never downgrades what the model
   * already wrote. Kept as a method so the sync fetchZettelkastenContext()
   * path can still pass real traits to buildPrompt when it wants them.
   */
  _zkPlaceholderTraits() {
    return { echoChamber: '', crossDomain: '', semanticLinker: '', serendipity: '', orphanRescue: '' };
  }

  /**
   * Fire-and-forget UPGRADE pass (v1.5.0 semantics: strictly non-destructive).
   * The five graph sections already contain real, lens-driven content written
   * by the main model. Vault Zettelkasten output is vault-GROUNDED (it queries
   * the actual link graph), so when a trait returns genuine content we swap it
   * in as an upgrade. But an absent VZ plugin, an empty result, or an error now
   * leaves the model's content untouched — we never replace real prose with an
   * "(unavailable)" stamp, which is what used to gut these notes.
   */
  _enrichWithZettelkastenTraitsAsync(targetFile, originFile) {
    if (!targetFile || !originFile) return;
    const vz = this.app.plugins?.plugins?.['vault-zettelkasten'];
    if (!vz?.api) {
      // VZ not running → keep the model-written sections exactly as they are.
      console.log('[CWD] Vault Zettelkasten unavailable — keeping model-written graph sections');
      return;
    }

    const term = targetFile.basename;

    (async () => {
      // TARGET FIX (v1.6.0). Previously this passed ONLY { notePath: origin },
      // so VZ analysed the ORIGIN NOTE and returned prose about the wrong
      // subject (observed: a section headed 'Echo Chamber Analysis for "Define
      // General Intelligence"' inside an "Artificial Intelligence" note).
      // VZ.resolveNoteContent() returns `noteContent` VERBATIM with no file
      // access, so passing the freshly-written definition makes the traits
      // reason about THE TERM — and sidesteps the fact that a brand-new note
      // is not yet indexed in Miyo. notePath stays pointed at the ORIGIN (an
      // indexed file) purely so VZ's fail-soft Miyo lookups can still find real
      // vault neighbours to ground the [[links]] in.
      let defContent = '';
      try { defContent = await this.app.vault.read(targetFile); } catch (_) {}
      const noteContent = `# ${term}\n\n${defContent}`.slice(0, 6000);
      // Pass the model PER CALL (VZ honours request.model over its own settings —
      // see ZettelkastenService.resolveModel). This keeps the hosted-model licence
      // key in THIS plugin's 0600 data.json only: VZ never needs a second copy,
      // and the traits run on the same hosted model as the definition itself
      // (Ollama was removed from the stack 2026-07-23).
      const req = {
        notePath: originFile.path,
        noteContent,
        model: {
          key: 'openai|copilot-plus-flash',
          name: 'copilot-plus-flash',
          provider: 'openai',
          baseUrl: 'https://models.brevilabs.com/v1',
          apiKey: this.settings.licenseKey || undefined,
          temperature: 0.7,
          maxTokens: 2048,
        },
        options: { limit: 8, batchMode: false, writeReport: false },
      };
      const calls = {
        echoChamber:    () => vz.api.echoChamber(req),
        crossDomain:    () => vz.api.crossDomain(req),
        semanticLinker: () => vz.api.semanticLinker(req),
        serendipity:    () => vz.api.serendipity(req),
        orphanRescue:   () => vz.api.orphanRescue(req),
      };

      // Each trait settles independently and may only UPGRADE its section:
      // output is sanitized (headings demoted, scaffolding stripped, capped)
      // and then must pass a quality gate. Anything that fails leaves the
      // model's lens-written content untouched.
      for (const { key, heading } of this._zkSectionMap()) {
        calls[key]()
          .then(async (result) => {
            const raw = (result && result.content) ? String(result.content) : '';
            if (!raw.trim()) {
              console.log(`[CWD] ${key}: no VZ signal — keeping model section`);
              return;
            }
            const clean = this._sanitizeTraitOutput(raw, term);
            const existing = await this._readSectionBody(targetFile, heading);
            const verdict = this._traitGate(clean, term, existing, originFile.basename);
            if (!verdict.ok) {
              console.log(`[CWD] ${key}: REJECTED (${verdict.reason}) — keeping model section [raw ${raw.length}b → clean ${clean.length}b]`);
              return;
            }
            console.log(`[CWD] ${key}: upgraded ${heading} [raw ${raw.length}b → clean ${clean.length}b, was ${existing.length}b]`);
            await this._replaceSectionInNote(targetFile, heading, clean);
          })
          .catch((err) => {
            console.warn(`[CWD] ${key} failed (keeping model section):`, err && err.message ? err.message : err);
          });
      }
    })();
  }

  /**
   * Max characters any single VZ-upgraded section may occupy.
   * Justification: the model's own lens sections measured 782–1,413 chars in
   * live runs, so 1,800 leaves VZ ~27% headroom to add value while capping the
   * five graph sections at ~9k total — keeping a note near the ~12.2k
   * model-only baseline instead of the 28.7k observed when VZ was unbounded.
   */
  _traitMaxChars() { return 1800; }

  /**
   * Make a VZ trait result safe to embed in an H2 section body.
   * The section matcher in _replaceSectionInNote is bounded by "\n## ", so a
   * heading inside the body silently truncates the section — observed live:
   * VZ emitted "## Structure Your Response" immediately after the section
   * heading, leaving THREE of five sections with a 0-char body.
   */
  _sanitizeTraitOutput(raw, term) {
    if (!raw) return '';
    let s = String(raw);
    // Fenced code blocks have no place in these sections and can hide headings.
    s = s.replace(/```[\s\S]*?```/g, '');
    // Demote every markdown heading to bold — preserves the words, removes the
    // structural damage. THIS is the fix for the emptied-section corruption.
    // Inner emphasis is stripped first: a heading like "### 1. **Relationship
    // Map**" would otherwise become nested/malformed bold ("**1. **X****").
    s = s.replace(/^[ \t]*#{1,6}[ \t]*(.+?)[ \t]*#*[ \t]*$/gm,
      (_m, t) => `**${String(t).replace(/\*+/g, '').replace(/\s+/g, ' ').trim()}**`);
    // Drop pure scaffolding/meta lines that carry no substance.
    const META = /^(\*\*)?\s*(structure your response.*|here(’s|'s| is)( my| the)? (analysis|response|breakdown).*|(serendipity|cross-domain|echo chamber|orphan rescue|semantic linker)[^a-z]*(analysis|insights|report)?( for .*)?)\s*(\*\*)?:?\s*$/i;
    s = s.split('\n').filter((l) => !META.test(l.trim())).join('\n');
    // Numbered scaffold headers → bullets: "1. **Foo**: bar" → "- **Foo:** bar"
    s = s.replace(/^[ \t]*\d+\.[ \t]*\*\*(.+?)\*\*:?[ \t]*/gm, '- **$1:** ');
    // Loose non-bullet, non-blank lines keep their prose, but collapse runaway
    // whitespace so sections stay tight.
    s = s.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
    // Cap at a line boundary so we never cut a bullet in half.
    const max = this._traitMaxChars();
    if (s.length > max) {
      const cut = s.slice(0, max);
      const lastNl = cut.lastIndexOf('\n');
      s = (lastNl > max * 0.5 ? cut.slice(0, lastNl) : cut).trim() + '\n- *(trimmed)*';
    }
    return s;
  }

  /**
   * Accept/reject gate: VZ content replaces the model's lens content ONLY if it
   * is on-topic, vault-grounded, structurally clean, and not thinner than what
   * it would overwrite. Returns { ok, reason }.
   */
  _traitGate(clean, term, existingBody, originName) {
    if (!clean || clean.length < 150) return { ok: false, reason: `too short/boilerplate (${clean ? clean.length : 0}b)` };
    if (/^[ \t]*#{1,6}[ \t]/m.test(clean)) return { ok: false, reason: 'still contains a markdown heading' };
    const links = (clean.match(/\[\[/g) || []).length;
    if (links < 2) return { ok: false, reason: `only ${links} wikilink(s) — not vault-grounded` };

    const lower = clean.toLowerCase();
    const t = (term || '').trim().toLowerCase();
    // ON-TOPIC CHECK. A bare "does the term appear anywhere" test is too weak:
    // the observed bad output was 1,788 chars ABOUT THE ORIGIN NOTE and still
    // happened to contain the term incidentally. Require the term to be the
    // actual subject — named early, or repeatedly — and reject text that opens
    // by describing the origin note instead.
    const head = lower.slice(0, 300);
    const o = (originName || '').trim().toLowerCase();
    if (o && o.length > 3 && head.includes(o)) {
      return { ok: false, reason: `opens by describing the ORIGIN note "${originName}" — wrong subject` };
    }
    if (t) {
      const mentions = lower.split(t).length - 1;
      const namedEarly = lower.slice(0, 400).includes(t);
      if (mentions === 0) return { ok: false, reason: `never mentions the term "${term}" (analysing the wrong note)` };
      if (!namedEarly && mentions < 2) {
        return { ok: false, reason: `term "${term}" only mentioned once and not up front — likely off-topic` };
      }
    }
    const existing = (existingBody || '').trim().length;
    if (existing > 0 && clean.length < existing * 0.6) {
      return { ok: false, reason: `thinner than model content (${clean.length}b < 60% of ${existing}b)` };
    }
    return { ok: true, reason: '' };
  }

  /**
   * Read the current body of an H2 section (same bounds the replacer uses), so
   * the gate can compare VZ's candidate against what it would overwrite.
   */
  async _readSectionBody(file, heading) {
    try {
      const content = await this.app.vault.read(file);
      const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`^## [^\\n]*${escaped}[^\\n]*\\n([\\s\\S]*?)(?=\\n## |\\n---\\n|$)`, 'm');
      const m = content.match(re);
      return m ? m[1].trim() : '';
    } catch (_) {
      return '';
    }
  }

  /**
   * Read the target file, locate the H2 section whose heading line contains
   * the given heading text, and replace the body (everything between that H2
   * and the next H2 / end-of-doc) with newBody. No-op if the heading isn't
   * found, so we never corrupt the note when the LLM omitted a section.
   */
  async _replaceSectionInNote(file, heading, newBody) {
    try {
      const content = await this.app.vault.read(file);
      const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Match: "## <anything containing heading>\n" then capture-greedy until next "## " or EOF.
      const re = new RegExp(`(^## [^\\n]*${escaped}[^\\n]*\\n)([\\s\\S]*?)(?=\\n## |\\n---\\n|$)`, 'm');
      if (!re.test(content)) return;
      const replaced = content.replace(re, `$1${newBody}\n`);
      if (replaced !== content) {
        await this.app.vault.modify(file, replaced);
      }
    } catch (e) {
      console.warn('[CWD] _replaceSectionInNote failed:', e);
    }
  }

  /**
   * Synchronous trait fetch with per-trait timeout. Kept for callers that
   * want blocking behavior (the test-API command, debugging). The four
   * production flows now use _enrichWithZettelkastenTraitsAsync instead.
   */
  async fetchZettelkastenContext(originFile) {
    const empty = { echoChamber: '', crossDomain: '', semanticLinker: '', serendipity: '', orphanRescue: '' };
    try {
      const vz = this.app.plugins?.plugins?.['vault-zettelkasten'];
      if (!vz?.api || !originFile) {
        console.log('[CWD] VZ not available; using empty trait context');
        return empty;
      }

      const req = { notePath: originFile.path, options: { limit: 8, batchMode: false, writeReport: false } };
      console.log('[CWD] fetching VZ traits for', originFile.path);

      // Each trait gets its own per-call timeout so a single stuck LLM call
      // can't block the whole chain. 25s ceiling per trait is generous for
      // local LM Studio (7B model, multi-call traits) but bounded.
      const withTimeout = (p, label, ms = 25000) =>
        Promise.race([
          p,
          new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timeout after ${ms}ms`)), ms)),
        ]);

      const [ec, cd, sl, sr, or] = await Promise.allSettled([
        withTimeout(vz.api.echoChamber(req),    'echoChamber'),
        withTimeout(vz.api.crossDomain(req),    'crossDomain'),
        withTimeout(vz.api.semanticLinker(req), 'semanticLinker'),
        withTimeout(vz.api.serendipity(req),    'serendipity'),
        withTimeout(vz.api.orphanRescue(req),   'orphanRescue'),
      ]);

      const pick = (r, name) => {
        if (r.status === 'fulfilled' && r.value && r.value.content) {
          console.log(`[CWD] VZ ${name}: ok (${r.value.content.length} chars)`);
          return r.value.content;
        }
        console.log(`[CWD] VZ ${name}: ${r.status === 'rejected' ? r.reason?.message : 'no content'}`);
        return '';
      };
      return {
        echoChamber:    pick(ec, 'echoChamber'),
        crossDomain:    pick(cd, 'crossDomain'),
        semanticLinker: pick(sl, 'semanticLinker'),
        serendipity:    pick(sr, 'serendipity'),
        orphanRescue:   pick(or, 'orphanRescue'),
      };
    } catch (e) {
      console.warn('[CWD] VZ trait fetch failed:', e);
      return empty;
    }
  }

  buildPrompt(term, context, originLink, traits = {}) {
    const t = {
      echoChamber:    traits.echoChamber    || '',
      crossDomain:    traits.crossDomain    || '',
      semanticLinker: traits.semanticLinker || '',
      serendipity:    traits.serendipity    || '',
      orphanRescue:   traits.orphanRescue   || '',
    };

    // Only append the trait block when REAL vault-grounded output was supplied.
    // The default path supplies none — the Five Vault Lenses above drive the
    // five graph sections instead, so the model is never handed a wall of
    // "(unavailable)" markers that invite placeholder output.
    const hasTraits = [t.echoChamber, t.crossDomain, t.semanticLinker, t.serendipity, t.orphanRescue]
      .some((v) => v && v.trim());
    const traitBlock = hasTraits ? `
VAULT-GROUNDED TRAIT OUTPUTS (real data from the Vault Zettelkasten link graph). Where one of these covers a section below, PREFER its concrete note names over your own inference, but keep that section's required structure:

[ECHO_CHAMBER]
${t.echoChamber || '(none)'}

[CROSS_DOMAIN]
${t.crossDomain || '(none)'}

[SEMANTIC_LINKER]
${t.semanticLinker || '(none)'}

[SERENDIPITY]
${t.serendipity || '(none)'}

[ORPHAN_RESCUE]
${t.orphanRescue || '(none)'}
` : '';

    return `Role: Feynman-Metaphor Learning Architect
Task: Convert the linked term into a 12-year-old-level explanation, formatted for Obsidian.

[CORE DIRECTIVE]
The linked term is: [[${term}]]
Use ONLY the originating note context AND the optional Vault Zettelkasten trait outputs supplied below. Do not invent sources, citations, or external facts.

Explain it using the Feynman Technique. If you cannot explain it simply, you don't understand it. Jargon is strictly forbidden unless defined immediately in plain English.

🚀 Execution Steps (internal — produce the OUTPUT FORMAT below, not these step labels):
1. Identify the core concept and abstraction level (Beginner / Intermediate / Advanced).
2. Apply the "Grandmother Test": one sentence on what it DOES and WHY it exists, pitched to a 12-year-old.
3. Build a Metaphor Anchor: TWO powerful metaphors from everyday life (cooking, cars, nature, libraries, kitchens, weather). Map technical parts 1:1.
4. Run the "Gaps Check": where would a beginner usually trip? Correct it before they trip.
5. Syntax Archaeology (only if the term is code/syntax): break down line-by-line, in plain English.
6. Teach-Back: a final paragraph that weaves both metaphors into one cohesive story.
7. Apply the FIVE VAULT LENSES below to write the five graph sections YOURSELF. They are first-class deliverables — never emit a placeholder, an apology, or a "not available" line for them.

🔬 THE FIVE VAULT LENSES (apply each to the linked term, using the originating note as your evidence base):

- **Semantic Linker** — a connection is worthless if it just says "related to." Every link must carry an EXPLICIT typed relationship drawn from this taxonomy: *hierarchical* (is-a, part-of, instance-of) · *causal* (causes, enables, prevents, results-in) · *temporal* (precedes, follows, evolves-into) · *logical* (supports, contradicts, refines, extends) · *functional* (uses, implements, depends-on). Also name ONE transitive chain — if A is part-of B and B is part-of C, say what A→C implies that no single link states.
- **Cross-Domain Connector** — first name the underlying STRUCTURAL PATTERN ("the shape of this idea"), then find that same isomorphism in genuinely distant domains (nature, cooking, economics, art, history, sport). Map it explicitly: "X here is like Y there BECAUSE…". Tag universal principles (#feedback-loop, #emergence, #antifragility) only where they honestly apply. Close with a compact Idea Compass: North = similar in-domain, South = its opposite, East = application elsewhere, West = historical root.
- **Serendipity Generator** — surface connections that share NO vocabulary with the term: semantic proximity expressed in different words, the "aha" kind a keyword search could never reach. Prefer distant nodes that SHOULD be linked but aren't. Finish with provocative catalyst questions that force an unexpected angle.
- **Echo Chamber Breaker** — steelman the opposition, never strawman it. Extract the assumptions the originating note treats as settled, then give substantive counter-positions argued fairly, plus how a different discipline (historian, biologist, artist, economist) would push back. Intellectual friction is the goal, not agreement.
- **Orphan Rescuer** — identify under-connected concepts this term should pull back into the graph. For each, give WHY it matters here AND the concrete reintegration action (the link text to add, the tag, or the parent MOC it belongs under).

💎 Constraints & Style:
- No "tech-to-tech" metaphors. Never say "it's like a pointer" or "it's like a database." Use "it's like a library card" or "it's like a kitchen pantry."
- Mentor tone. Friendly, encouraging, clear.
- Plain Markdown only. No HTML. No code fences inside the output unless Syntax Archaeology genuinely requires one.
- 500–800 words total, excluding the source quote.
- Use [[wiki links]] generously for any concept the reader could explore further.

📦 OUTPUT FORMAT (emit EXACTLY this, replacing every parenthesised guidance line with real content; keep section order; keep emoji headings):

---
aliases: ["${term}"]
tags: ["wiki", "auto", "feynman", "metaphor"]
origin: "${originLink}"
generated: true
confidence: "0-100"
sense: "one short phrase"
abstraction_level: "Beginner | Intermediate | Advanced"
concept_name: "${term}"
---

## 🎯 ${term}: Feynman Breakdown

> [!info] Abstraction level
> (Beginner / Intermediate / Advanced — and one short sentence saying why)

## 🧒 Grandmother Test
(One sentence. What it DOES + WHY it exists. 12-year-old reading level.)

## 🪜 Metaphor Anchor

### Metaphor 1 — (everyday object/scene)
(2–3 sentences setting up the metaphor. Then a 1:1 mapping list:)
- **(technical part)** ↔ **(metaphor part)** — (one-line why)
- **(technical part)** ↔ **(metaphor part)** — (one-line why)
- **(technical part)** ↔ **(metaphor part)** — (one-line why)

### Metaphor 2 — (a different everyday object/scene)
(2–3 sentences. Then a 1:1 mapping list:)
- **(technical part)** ↔ **(metaphor part)** — (one-line why)
- **(technical part)** ↔ **(metaphor part)** — (one-line why)
- **(technical part)** ↔ **(metaphor part)** — (one-line why)

## 🪤 Gaps Check (Where Beginners Trip)
- **The trap:** (the misconception)
  **The truth:** (the correction in plain English)
- **The trap:** (...)
  **The truth:** (...)

## 🧱 Syntax Archaeology
(If the term is NOT code, write one italic line: *Not applicable — this is a concept, not syntax.* and stop.
If it IS code, give a line-by-line breakdown. Each bullet quotes the line in backticks, then a "Human English:" sentence.)

## 🧶 Teach-Back
(One cohesive paragraph, 4–7 sentences. Weave BOTH metaphors into one story of how the concept works end-to-end. No bullet points.)

## 🌱 One-Sentence Definition
(Technical, ≤30 words.)

## 🧩 Building Blocks
- (2–4 prerequisites with [[wiki links]])

## 🎬 Example / Use (In this note's domain)
- (2–3 concrete examples drawn from the originating note)

## 🔗 Linked Concepts in This Vault
*(Semantic Linker lens — 4–6 links, each with an EXPLICIT typed relationship.)*
- [[Linked Note]] — **(relationship-type)** — (one line on why that exact type fits)
- [[Linked Note]] — **(relationship-type)** — (...)
- [[Linked Note]] — **(relationship-type)** — (...)
- [[Linked Note]] — **(relationship-type)** — (...)
- **Transitive chain:** [[A]] → [[B]] → [[C]] — (what the chain implies that no single link states)

## 🌉 Cross-Domain Metaphor Bridges
*(Cross-Domain Connector lens.)*
- **Structural pattern:** (name the underlying shape of this idea in one line)
- **From (domain):** [[Distant Note or concept]] — (the isomorphism: "X here is like Y there because...")
- **From (a different domain):** [[Distant Note or concept]] — (...)
- **From (a third domain):** [[Distant Note or concept]] — (...)
- **Universal principles:** (#tags that genuinely apply — or say "none clean enough")
- **Idea Compass:** N: (similar, same domain) · S: (its opposite) · E: (application elsewhere) · W: (historical root)

## ✨ Surprising Connections
*(Serendipity Generator lens — connections sharing NO vocabulary with the term.)*
- [[Note or concept]] — (the hidden isomorphism a keyword search would miss)
- [[Note or concept]] — (...)
- [[Note or concept]] — (...)
- **Catalyst questions:** 1. (provocative, forces an unexpected angle) 2. (...)

## 🪞 Where This Belief Could Break
*(Echo Chamber Breaker lens — steelman, never strawman.)*
- **Assumption baked in:** (an assumption the originating note treats as settled)
  **Strongest counter:** (a substantive opposing case, argued fairly) — [[Counter-note]]
- **Assumption baked in:** (...)
  **Strongest counter:** (...) — [[Counter-note]]
- **Outside the discipline:** A (historian / biologist / artist / economist) would object that (...)
- **What if:** (one radical reinterpretation that forces a cognitive shift)

## 🕯️ Forgotten Notes Worth Re-reading
*(Orphan Rescuer lens — under-connected material worth pulling back in.)*
- [[Orphan Note or concept]] — (why it matters here) → **Action:** (link to add / tag / parent MOC)
- [[Orphan Note or concept]] — (...) → **Action:** (...)
- **Where this belongs:** (the MOC, parent note, or series this term should sit under)

## 🪨 Common Misconceptions
- **It's NOT** (...) — (one line on what it actually is)
- **It's NOT** (...) — (...)

## 🚧 Boundaries (Not to confuse with)
- [[Near-miss concept]] — (one-line distinction)
- [[Near-miss concept]] — (one-line distinction)

## 📖 Source Context (From the Note)
- From: ${originLink}
> (Quote EXACTLY 1–2 lines copied from the originating note context — verbatim, no paraphrase.)

## 🧪 Self-check
1. (An application question — not recall.)
2. (An application question — not recall.)

---
${traitBlock}
ORIGINATING NOTE CONTEXT:
${context}`;
  }

  async regenerateForCurrentNote(originOverride) {
    const target = this.app.workspace.getActiveFile();
    if (!target || target.extension !== 'md') return;

    const origin = originOverride
      || ((this.previousFile && this.previousFile.path !== target.path) ? this.previousFile : null);
    // Fall back to the note's own content as context when no distinct origin is known.
    await this._generateDefinitionInto(target, origin || target);
  }

  /**
   * Shared generation core: read the origin's content as context, ask the model
   * for a definition, sanitize + write it into `target`, then kick off async
   * Vault Zettelkasten enrichment. On API failure, writes the local fallback
   * template so the note is never left empty. Used by both the regenerate path
   * and the "define selection" path.
   */
  async _generateDefinitionInto(target, originFile) {
    if (!target || target.extension !== 'md') return;
    const source = originFile || target;
    let context = '';
    try { context = await this.app.vault.read(source); } catch (_) {}

    const term = target.basename;
    const originLink = this._computeOriginLinktext(source, target);
    const prompt = this.buildPrompt(term, this._truncateContext(context), originLink, this._zkPlaceholderTraits());
    new Notice('Generating definition…');
    let definition = await this.queryCopilot(prompt);
    if (definition) {
      definition = this._sanitizeOutput(definition);
      definition = this._ensureSourceContextFromLine(definition, originLink);
      await this.app.vault.modify(target, definition);
      new Notice('Definition inserted.');
      this._enrichWithZettelkastenTraitsAsync(target, source);
    } else {
      try {
        const fallback = this._buildLocalTemplate(term, originLink, this._truncateContext(context));
        await this.app.vault.modify(target, fallback);
        new Notice('Inserted local fallback definition (API failed).');
      } catch (e) {
        console.error('Failed to insert fallback template (regen)', e);
        new Notice('Definition generation failed (see console).');
      }
    }
  }

  /**
   * Normalize highlighted text into a safe wiki-link term / note title:
   * strip any wrapping [[ ]], collapse whitespace/newlines, and drop
   * characters that are illegal in note names or that would break the link.
   */
  _cleanTerm(raw) {
    return (raw || '')
      .replace(/^\[\[|\]\]$/g, '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/[\[\]#\^|\\/:*?"<>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Create (or locate) the definition note for `term` inside the fixed
   * definitions folder (see settings), then open it. Marks the path as
   * recently-processed so the file-open auto-trigger does not also try to
   * generate (avoids double generation). The wiki link in the origin note
   * still resolves by basename, so it keeps working after the user moves the
   * note elsewhere. Returns { target, created }.
   */
  async _createOrOpenLinkedNote(term) {
    const folder = this._resolveDefinitionsFolder();
    await this._ensureFolderExists(folder);
    const desired = this._normalizeVaultPath(
      folder ? path.posix.join(folder, `${term}.md`) : `${term}.md`
    );
    let target = this.app.vault.getAbstractFileByPath(desired);
    const created = !target;
    if (!target) {
      try {
        target = await this.app.vault.create(desired, '');
      } catch (e) {
        console.error('Contextual Wiki Definitions: failed to create linked note', e);
        new Notice('Could not create the linked note (see console).');
        return { target: null, created: false };
      }
    }
    if (!target || target.extension !== 'md') return { target: null, created: false };
    // Suppress the file-open auto-trigger for this note; we generate directly.
    this._markProcessed(target.path);
    try { await this.app.workspace.getLeaf(true).openFile(target); } catch (_) {}
    return { target, created };
  }

  _computeOriginLinktext(originFile, targetFile) {
    try {
      if (!originFile) return '[[Unknown Origin]]';
      const sourcePath = targetFile && targetFile.path ? targetFile.path : '';
      // Emit a canonical [[Note]] link (omit the .md extension) so the origin resolves
      // via Obsidian's primary link-resolution path — this is what Origin Nest keys on to
      // nest the definition under its origin note. (Legacy notes with [[Note.md]] still
      // resolve via Origin Nest's .md fallback.)
      const linktext = this.app.metadataCache.fileToLinktext(originFile, sourcePath, true);
      return `[[${linktext}]]`;
    } catch (_) {
      return originFile && originFile.basename ? `[[${originFile.basename}]]` : '[[Unknown Origin]]';
    }
  }

  _ensureSourceContextFromLine(text, originLink) {
    try {
      if (!text) return text;
      const lines = text.split('\n');
      const headerIndex = lines.findIndex((l) => l.trim().toLowerCase() === '## source context (from the note)'.toLowerCase());
      if (headerIndex === -1) {
        // Append a minimal Source Context section if missing
        return `${text.trim()}\n\n## Source Context (From the Note)\n- From: ${originLink}\n`;
      }
      // Check next few lines for a "- From:" entry; insert if missing
      const insertionIndex = headerIndex + 1;
      const alreadyHasFrom = lines.slice(insertionIndex, insertionIndex + 3).some((l) => /^-\s*From\s*:/i.test(l.trim()));
      if (!alreadyHasFrom) {
        lines.splice(insertionIndex, 0, `- From: ${originLink}`);
      }
      return lines.join('\n');
    } catch (_) {
      return text;
    }
  }

  _buildLocalTemplate(term, originLink, context) {
    const safeContext = context || '';
    return `---
aliases: ["${term}"]
tags: ["wiki", "auto", "feynman"]
origin: "${originLink}"
generated: true
confidence: "0"
sense: "pending"
---

## Term - [[${term}]]

## Feynman Summary
- <pending - explain this simply, as if to someone with no background>

## Intuitive Analogy
- <pending - compare to something from everyday life>

## One-Sentence Definition
- <pending>

## Key Points
- <pending>

## Why This Matters
- <pending - real-world importance>

## Building Blocks
- <pending - prerequisite concepts>

## Example / Use (In this note's domain)
- <pending>

## Common Misconceptions
- <pending - what people often get wrong>

## Boundaries (Not to confuse with)
- <pending>

## Related Concepts
- <pending>

## Source Context (From the Note)
- From: ${originLink}
> <pending>

## Self-check
- <pending - questions that test genuine understanding>

Originating note context:
${safeContext}`;
  }

  _originHasLinkToTerm(originFile, targetFile, context) {
    try {
      const term = targetFile?.basename || '';
      if (!term) return false;
      const cache = this.app.metadataCache.getFileCache(originFile);
      const links = (cache && cache.links) ? cache.links : [];
      const directMatch = links.some((l) => {
        const link = (l && l.link) ? l.link : '';
        const base = link.split('#')[0];
        return base === term || base.endsWith(`/${term}`);
      });
      if (directMatch) return true;
      const raw = context || '';
      if (!raw) return false;
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`!?\\[\\[${escaped}(?:[\\]|#]|$)`, 'i');
      return re.test(raw);
    } catch (_) {
      return false;
    }
  }

  /**
   * Find a markdown note anywhere in the vault that links to `term` (matched by
   * basename), checking both resolved and unresolved links in the metadata cache.
   * Used as a better origin/context source when a note is reached from the Graph
   * view and the previously-active note isn't the one that actually links the term
   * (e.g. the term is linked by a graph *neighbour*). Returns a TFile or null;
   * skips `excludePath` (the target note itself).
   */
  _findNoteLinkingTerm(term, excludePath) {
    try {
      if (!term) return null;
      const wanted = term.toLowerCase();
      const mc = this.app.metadataCache;
      const pickFile = (src) => {
        if (!src || src === excludePath) return null;
        const f = this.app.vault.getAbstractFileByPath(src);
        return (f && f.extension === 'md') ? f : null;
      };
      // resolvedLinks: { sourcePath: { targetPath: count } }
      const resolved = (mc && mc.resolvedLinks) ? mc.resolvedLinks : {};
      for (const src of Object.keys(resolved)) {
        for (const tgt of Object.keys(resolved[src])) {
          const base = tgt.split('/').pop().replace(/\.md$/i, '');
          if (base.toLowerCase() === wanted) {
            const f = pickFile(src);
            if (f) return f;
          }
        }
      }
      // unresolvedLinks: { sourcePath: { linkText: count } } — for links whose
      // target note doesn't exist yet (the common case right before creation).
      const unresolved = (mc && mc.unresolvedLinks) ? mc.unresolvedLinks : {};
      for (const src of Object.keys(unresolved)) {
        for (const lt of Object.keys(unresolved[src])) {
          const base = lt.split('#')[0].split('|')[0].split('/').pop();
          if (base && base.toLowerCase() === wanted) {
            const f = pickFile(src);
            if (f) return f;
          }
        }
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  /**
   * True when `file` was opened by clicking a node in the Graph / Local Graph view.
   * The 'active-leaf-change' listener (see onload) records the basename + time when
   * a markdown note becomes active directly after a graph leaf. We match by basename
   * (it survives the note's relocation into the definitions folder) within a short
   * recency window, so this stays correct regardless of how long the graph was open.
   */
  _wasOpenedFromGraph(file) {
    try {
      if (!file || !file.basename) return false;
      return this._graphOpenedBasename === file.basename
        && (Date.now() - (this._graphOpenedAt || 0) < 8000);
    } catch (_) {
      return false;
    }
  }

  /**
   * NETWORKING: HTTP request wrapper using Obsidian requestUrl with fetch fallback
   * Prefers requestUrl for better Obsidian integration, falls back to fetch if unavailable
   */
  async _makeRequest(url, options) {
    // Configurable timeout, default 180s. The old hard 30s ceiling was the cause
    // of "pending"-only fallback notes: a full Feynman-Metaphor generation on
    // copilot-plus-flash measured 106.6s end-to-end (2026-07-16), so EVERY real
    // request was aborted mid-flight → null → local fallback template.
    const timeoutMs = Math.max(10000, Number(this.settings && this.settings.apiTimeoutMs) || 180000);
    // Prefer Obsidian requestUrl if available (better integration, mobile support)
    if (typeof requestUrl !== 'undefined' && requestUrl) {
      try {        // requestUrl doesn't support AbortController, so use Promise.race for timeout
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout')), timeoutMs);
        });

        const requestPromise = requestUrl({
          url: url,
          method: options.method || 'POST',
          headers: options.headers || {},
          body: options.body || '',
          throw: false // Don't throw on non-2xx, return response object
        });

        const response = await Promise.race([requestPromise, timeoutPromise]);        // requestUrl returns { status, statusText, headers, text, json, arrayBuffer }
        // text is a string property containing the response body (or null/undefined if empty)
        // Convert to fetch-like Response object for compatibility
        let responseText = '';
        if (response) {
          if (typeof response.text === 'string') {
            responseText = response.text;
          } else if (response.text != null) {
            // Handle case where text might be a number or other type
            responseText = String(response.text);
          }
          // If response.text is null/undefined, responseText stays as ''
        }        return {
          ok: response && response.status >= 200 && response.status < 300,
          status: response?.status || 0,
          statusText: response?.statusText || '',
          headers: {
            get: (name) => {
              const headerName = name.toLowerCase();
              const headers = response?.headers || {};
              // Headers might be object or Map-like
              if (typeof headers.get === 'function') {
                return headers.get(headerName) || headers.get(name) || null;
              }
              return headers[headerName] || headers[name] || null;
            }
          },
          text: async () => {
            // BUG FIX: Ensure we never return null - always return a string
            return responseText || '';
          },
          json: async () => {
            try {
              if (response && typeof response.json === 'function') {
                return response.json();
              }
              const text = responseText || '';
              if (!text) return {};
              return JSON.parse(text);
            } catch {
              return {};
            }
          }
        };
      } catch (e) {        // Fallback to fetch if requestUrl fails or times out
        if (e.message === 'Request timeout') throw e;
        // Continue to fetch fallback on other errors
      }
    }

    // Fallback to fetch (for compatibility or if requestUrl unavailable).
    // BUG FIX: the AbortController declaration was previously trapped inside the
    // trailing comment above (smushed-line artifact), so `controller` was never
    // declared and this whole fallback path threw ReferenceError. Latent in
    // Obsidian (requestUrl exists there) but real for any environment without it.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeout);
      return res;
    } catch (e) {
      clearTimeout(timeout);
      throw e;
    }
  }

  async queryCopilot(prompt) {
    const licenseKey = this.settings.licenseKey;
    const customBaseUrl = (this.settings.customApiBaseUrl || '').trim().replace(/\/+$/, '');
    // FORK: When customBaseUrl is set, license key is optional (local LLMs typically don't need auth).
    if (!customBaseUrl && !licenseKey) return null;
    const API_ENDPOINTS = customBaseUrl ? [
      // FORK: Custom OpenAI-compatible endpoint (Ollama: http://127.0.0.1:11434, LM Studio: http://127.0.0.1:1234, etc.)
      `${customBaseUrl}/v1/chat/completions`
    ] : [
      // Current BreviLabs endpoint
      'https://models.brevilabs.com/v1/chat/completions',
      // Legacy endpoint kept as fallback for compatibility
      'https://api.brevilabs.com/v1/chat/completions'
    ];
    let preferredEndpoint = API_ENDPOINTS[0];
    // Helper to call endpoint using our request wrapper
    const call = async ({ model, stream, accept }) => {
      const body = JSON.stringify({
        model,
        stream: !!stream,
        temperature: 0.2,
        messages: [ { role: 'user', content: prompt } ]
      });
      const endpoints = [preferredEndpoint, ...API_ENDPOINTS.filter((e) => e !== preferredEndpoint)];
      let lastRes = null;
      let lastErr = null;

      for (let i = 0; i < endpoints.length; i++) {
        const endpoint = endpoints[i];
        const isLast = i === endpoints.length - 1;
        try {
          const res = await this._makeRequest(endpoint, {
            method: 'POST',
            headers: Object.assign({
              'Content-Type': 'application/json',
              'Accept': accept || 'application/json',
            }, licenseKey ? { 'Authorization': `Bearer ${licenseKey}` } : {}),
            body: body
          });
          lastRes = res;

          // Endpoint-specific fallback for moved routes
          if (!isLast && (res.status === 404 || res.status === 405 || res.status === 410)) {
            const errorText = await res.text();
            const snippet = errorText ? errorText.slice(0, 200) : '';
            console.warn('Copilot endpoint unavailable, trying fallback', endpoint, res.status, snippet + (errorText && errorText.length > 200 ? '...' : ''));
            continue;
          }

          // Only remember an endpoint as preferred when it actually succeeded.
          // (Previously a dead endpoint's 404, returned from the last loop slot,
          // was promoted to preferred and led the NEXT attempt's ordering.)
          if (res.ok) preferredEndpoint = endpoint;
          return res;
        } catch (e) {
          lastErr = e;
          if (isLast) throw e;
        }
      }

      if (lastRes) return lastRes;
      if (lastErr) throw lastErr;
      throw new Error('Copilot request failed: no endpoint produced a response');
    };

    // FORK: Pick model name based on whether a custom endpoint is configured.
    const modelName = customBaseUrl
      ? ((this.settings.customApiModel || '').trim() || 'gpt-4o-mini')
      : 'copilot-plus-flash';

    // Parse either an SSE body ("data:" lines) or a plain JSON chat completion
    // into the message content. Shared by every attempt below.
    const extractContent = (text) => {
      if (!text) return '';
      if (text.includes('data:')) {
        let out = '';
        for (const rawLine of text.split('\n')) {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const evt = JSON.parse(payload);
            const choice = evt.choices && evt.choices[0];
            const delta = choice && (choice.delta || choice.message);
            const chunk = delta && (delta.content || '');
            if (chunk) out += chunk;
          } catch (_) {}
        }
        if (out.trim()) return out.trim();
      }
      try {
        const data = JSON.parse(text);
        const msg = data && data.choices && data.choices[0] && data.choices[0].message;
        if (msg && msg.content) return msg.content.trim();
      } catch (_) {}
      return '';
    };

    try {
      // Attempt 1: SSE stream FIRST. Measured 2026-07-16 (console-mirror
      // timeline): the same generation that HUNG past the 180s timeout as a
      // non-stream request completed in ~66s via SSE — streaming is the fast,
      // reliable path on this backend, so it now leads. Each attempt is
      // isolated so one thrown error can't skip the remaining fallbacks.
      try {
        const res1 = await call({ model: modelName, stream: true, accept: 'text/event-stream,*/*' });
        const text1 = await res1.text();
        const out1 = extractContent(text1);
        if (out1) return out1;
        if (!res1.ok) {
          // SECURITY: Reduce sensitive logging - only log status + short snippet
          const snippet = text1 ? text1.slice(0, 300) : '';
          console.error('Copilot non-OK response (stream)', res1.status, snippet);
        }
      } catch (e1) {
        console.warn('Copilot stream attempt failed:', e1 && e1.message ? e1.message : e1);
      }

      // Attempt 2: JSON, non-stream (the old primary; now the fallback)
      try {
        const res2 = await call({ model: modelName, stream: false, accept: 'application/json' });
        const text2 = await res2.text();
        const out2 = extractContent(text2);
        if (out2) return out2;
        if (!res2.ok) {
          const snippet = text2 ? text2.slice(0, 300) : '';
          console.error('Copilot non-OK response (json)', res2.status, snippet);
        }
      } catch (e2) {
        console.warn('Copilot json attempt failed:', e2 && e2.message ? e2.message : e2);
      }

      // Attempt 3: JSON, non-stream, non-flash model
      try {
        const res3 = await call({ model: 'copilot-plus', stream: false, accept: 'application/json' });
        const out3 = extractContent(await res3.text());
        if (out3) return out3;
      } catch (e3) {
        // Silently continue - only log if all attempts fail
      }

      // Only log error if ALL attempts failed
      console.warn('Copilot: All API attempts failed. Check your license key and network connection.');
      return null;
    } catch (e) {
      console.error('Copilot request failed', e);
      return null;
    }
  }

  async loadSettings() {
    const loaded = await this.loadData();    this.settings = Object.assign({
      licenseKey: '',
      autoInsertOnFileOpen: true,
      requireOriginLinkToTrigger: true,
      allowCodeBlocks: false, // SECURITY: Default OFF - strip all code blocks
      allowRawHTML: false, // SECURITY: Default OFF - strip HTML tags
      maxOutputLength: 60000, // SECURITY: Cap output to prevent huge writes
      apiTimeoutMs: 180000, // Full Feynman generations measured >100s on copilot-plus-flash; 30s was aborting every real request
      definitionsFolder: 'Contextual Wiki Definitions', // All new definition notes are created/relocated here
      customApiBaseUrl: '', // FORK: When set, replaces Brevilabs endpoints with this OpenAI-compatible base URL
      customApiModel: ''    // FORK: Model name to send to custom endpoint (e.g. "llama3.2", "gpt-4o-mini"); empty falls back to "gpt-4o-mini"
    }, loaded);  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  /**
   * SECURITY: Sanitize remote API output before writing to notes
   * Strips dangerous executable surfaces (code blocks, HTML tags) unless explicitly allowed
   */
  _sanitizeOutput(text) {
    if (!text) return text;
    let sanitized = text;
    const originalLength = text.length;
    const hadCodeBlocks = /```[\s\S]*?```/.test(text);
    const hadScriptTags = /<script[\s\S]*?<\/script>/gi.test(text);

    // SECURITY: Remove fenced code blocks (especially dataviewjs, javascript, etc.)
    if (!this.settings.allowCodeBlocks) {
      // Match code blocks with any language identifier or no identifier
      sanitized = sanitized.replace(/```[\s\S]*?```/g, '');
      // Also remove inline code that might be dangerous (conservative approach)
      // But keep inline code for now as it's less risky - only fenced blocks are executable
    }

    // SECURITY: Remove dangerous HTML tags
    if (!this.settings.allowRawHTML) {
      // Remove script, iframe, object, embed tags and their content
      sanitized = sanitized.replace(/<script[\s\S]*?<\/script>/gi, '');
      sanitized = sanitized.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
      sanitized = sanitized.replace(/<object[\s\S]*?<\/object>/gi, '');
      sanitized = sanitized.replace(/<embed[\s\S]*?>/gi, '');
      // Remove other potentially dangerous tags
      sanitized = sanitized.replace(/<style[\s\S]*?<\/style>/gi, '');
    }

    // SECURITY: Cap output length to prevent huge writes
    const maxLen = this.settings.maxOutputLength || 60000;
    const wasTruncated = sanitized.length > maxLen;
    if (sanitized.length > maxLen) {
      sanitized = sanitized.slice(0, maxLen) + '\n\n*(Output truncated for safety)*';
    }    return sanitized;
  }
  _truncateContext(text) {
    const max = 20000; // chars
    if (!text) return '';
    return text.length > max ? text.slice(0, max) : text;
  }

  /**
   * Relocate a freshly-created wiki-link note into the fixed definitions
   * folder (see settings) so every new definition lands in one place. No-op if
   * it's already there or if a same-named note already exists at the target.
   */
  async _ensureNoteInDefinitionsFolder(file) {
    if (!file || file.extension !== 'md') {
      return file;
    }

    const folder = this._resolveDefinitionsFolder();
    const currentFolder = this._getFolderPath(file);
    if (folder === currentFolder) {
      return file;
    }
    await this._ensureFolderExists(folder);

    const desiredPath = folder
      ? path.posix.join(folder, `${file.basename}.md`)
      : `${file.basename}.md`;
    const normalizedDesiredPath = this._normalizeVaultPath(desiredPath);
    const normalizedCurrentPath = this._normalizeVaultPath(file.path);

    if (!normalizedDesiredPath || !normalizedCurrentPath || normalizedCurrentPath === normalizedDesiredPath) {
      return file;
    }

    if (this.app.vault.getAbstractFileByPath(normalizedDesiredPath)) {
      return file;
    }

    try {
      const renamed = await this.app.fileManager.renameFile(file, normalizedDesiredPath);
      return renamed || file;
    } catch (err) {
      console.error('Contextual Wiki Definitions: failed to move new note to definitions folder', err);
      return file;
    }
  }

  /**
   * The vault-relative folder where all new definition notes are placed.
   * Defaults to "Contextual Wiki Definitions"; trims surrounding slashes.
   */
  _resolveDefinitionsFolder() {
    const raw = (this.settings.definitionsFolder || 'Contextual Wiki Definitions').trim();
    return this._normalizeVaultPath(raw.replace(/^\/+|\/+$/g, ''));
  }

  /**
   * Ensure `folderPath` (which may be nested, e.g. "Inbox/Defs") exists,
   * creating each missing segment. Safe to call repeatedly.
   */
  async _ensureFolderExists(folderPath) {
    if (!folderPath) return;
    if (this.app.vault.getAbstractFileByPath(folderPath)) return;
    let cur = '';
    for (const part of folderPath.split('/')) {
      if (!part) continue;
      cur = cur ? `${cur}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(cur)) {
        try { await this.app.vault.createFolder(cur); } catch (_) {}
      }
    }
  }

  _getFolderPath(fileOrPath) {
    const filePath = typeof fileOrPath === 'string'
      ? fileOrPath
      : fileOrPath?.path;
    const normalized = this._normalizeVaultPath(filePath);
    if (!normalized) {
      return '';
    }
    const dirname = path.posix.dirname(normalized);
    if (!dirname || dirname === '.' || dirname === './') {
      return '';
    }
    return dirname;
  }

  _normalizeVaultPath(filePath) {
    if (!filePath) return '';
    const replaced = filePath.replace(/\\/g, '/');
    let normalized = path.posix.normalize(replaced);
    if (this.app && this.app.vault && this.app.vault.adapter && typeof this.app.vault.adapter.getBasePath === 'function') {
      const base = this.app.vault.adapter.getBasePath().replace(/\\/g, '/');
      const normalizedBase = path.posix.normalize(base);
      if (normalizedBase && normalized.startsWith(normalizedBase)) {
        normalized = normalized.slice(normalizedBase.length);
        if (normalized.startsWith('/')) normalized = normalized.slice(1);
      }
    }
    return normalized.startsWith('./') ? normalized.slice(2) : normalized;
  }

  _isRecentlyProcessed(path) {
    return this._recentlyProcessed.has(path);
  }

  _markProcessed(path) {
    this._recentlyProcessed.add(path);
    setTimeout(() => this._recentlyProcessed.delete(path), 5000);
  }
};

class ContextualDefinitionSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.showLicenseKey = false; // Track reveal state for license key
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Contextual Wiki Definitions Settings' });

    // SECURITY: Mask license key with password field + reveal toggle
    const licenseKeySetting = new Setting(containerEl)
      .setName('Copilot License Key')
      .setDesc('Believer or Plus license key used for definition generation');

    let licenseKeyInput;
    licenseKeySetting.addText(text => {
      licenseKeyInput = text;
      text.inputEl.type = 'password'; // SECURITY: Mask by default
      text.setPlaceholder('enter your Copilot key')
        .setValue(this.plugin.settings.licenseKey)
        .onChange(async (value) => {
          this.plugin.settings.licenseKey = value.trim();
          await this.plugin.saveSettings();
        });
    });

    // Add reveal/hide toggle button
    licenseKeySetting.addButton(button => {
      button.setButtonText(this.showLicenseKey ? 'Hide' : 'Reveal')
        .setCta(false)
        .onClick(() => {
          this.showLicenseKey = !this.showLicenseKey;
          licenseKeyInput.inputEl.type = this.showLicenseKey ? 'text' : 'password';
          button.setButtonText(this.showLicenseKey ? 'Hide' : 'Reveal');
        });
    });

    new Setting(containerEl)
      .setName('Auto-insert on file open')
      .setDesc('When enabled, empty notes opened from a wiki link are automatically filled with a definition.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.autoInsertOnFileOpen)
        .onChange(async (value) => {
          this.plugin.settings.autoInsertOnFileOpen = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Require origin link to trigger')
      .setDesc('Only generate when the origin note actually contains a wiki link to the new note. Prevents generation for unrelated empty notes.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.requireOriginLinkToTrigger)
        .onChange(async (value) => {
          this.plugin.settings.requireOriginLinkToTrigger = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Definitions folder')
      .setDesc('All new definition notes are created/relocated into this vault folder (created automatically if missing). You can then move them wherever you like; the wiki link still resolves by name. Default: "Contextual Wiki Definitions".')
      .addText(text => text
        .setPlaceholder('Contextual Wiki Definitions')
        .setValue(this.plugin.settings.definitionsFolder || '')
        .onChange(async (value) => {
          this.plugin.settings.definitionsFolder = value.trim();
          await this.plugin.saveSettings();
        }));

    // SECURITY: Output sanitization settings
    new Setting(containerEl)
      .setName('Allow code blocks in output')
      .setDesc('If enabled, code blocks (including dataviewjs, javascript, etc.) will be preserved in generated definitions. Default: OFF for security.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.allowCodeBlocks)
        .onChange(async (value) => {
          this.plugin.settings.allowCodeBlocks = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Allow raw HTML in output')
      .setDesc('If enabled, HTML tags will be preserved in generated definitions. Default: OFF for security.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.allowRawHTML)
        .onChange(async (value) => {
          this.plugin.settings.allowRawHTML = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Maximum output length')
      .setDesc('Maximum characters allowed in generated definitions (default: 60000). Longer outputs will be truncated.')
      .addText(text => text
        .setPlaceholder('60000')
        .setValue(String(this.plugin.settings.maxOutputLength || 60000))
        .onChange(async (value) => {
          const num = parseInt(value, 10);
          if (!isNaN(num) && num > 0) {
            this.plugin.settings.maxOutputLength = num;
            await this.plugin.saveSettings();
          }
        }));

    new Setting(containerEl)
      .setName('API timeout (seconds)')
      .setDesc('How long to wait for the definition API before writing the local fallback template. Full Feynman generations can take 1–2 minutes on copilot-plus-flash; minimum 10, default 180.')
      .addText(text => text
        .setPlaceholder('180')
        .setValue(String(Math.round((this.plugin.settings.apiTimeoutMs || 180000) / 1000)))
        .onChange(async (value) => {
          const num = parseInt(value, 10);
          if (!isNaN(num) && num >= 10) {
            this.plugin.settings.apiTimeoutMs = num * 1000;
            await this.plugin.saveSettings();
          }
        }));

    // FORK: Custom (local or third-party) OpenAI-compatible endpoint.
    new Setting(containerEl)
      .setName('Custom API base URL (fork)')
      .setDesc('Optional OpenAI-compatible base URL. When set, replaces Brevilabs. Examples: http://127.0.0.1:11434 (Ollama), http://127.0.0.1:1234 (LM Studio), https://api.openai.com (with your own key in License Key field).')
      .addText(text => text
        .setPlaceholder('http://127.0.0.1:11434')
        .setValue(this.plugin.settings.customApiBaseUrl || '')
        .onChange(async (value) => {
          this.plugin.settings.customApiBaseUrl = value.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Custom API model (fork)')
      .setDesc('Model name to send when Custom API base URL is set. Examples: llama3.2, gpt-4o-mini, qwen2.5:14b. Default: gpt-4o-mini.')
      .addText(text => text
        .setPlaceholder('llama3.2')
        .setValue(this.plugin.settings.customApiModel || '')
        .onChange(async (value) => {
          this.plugin.settings.customApiModel = value.trim();
          await this.plugin.saveSettings();
        }));
  }
}

class OriginNoteSuggestModal extends SuggestModal {
  constructor(app, files, onChoose) {
    super(app);
    this.files = files || [];
    this.onChoose = onChoose;
    this.setPlaceholder('Type to search origin note…');
  }

  getSuggestions(query) {
    const q = (query || '').toLowerCase();
    return this.files
      .filter((f) => f.basename.toLowerCase().includes(q) || f.path.toLowerCase().includes(q))
      .slice(0, 100);
  }

  renderSuggestion(file, el) {
    el.createEl('div', { text: file.basename });
    el.createEl('small', { text: file.path, cls: 'mod-muted' });
  }

  onChooseSuggestion(file) {
    if (typeof this.onChoose === 'function') {
      this.onChoose(file);
    }
  }
}
