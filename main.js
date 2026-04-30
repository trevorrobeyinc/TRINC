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
          file = await this._ensureNewWikiLinkNoteInOriginFolder(file, origin);
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
            const context = await this.app.vault.read(origin);
            if (this.settings.requireOriginLinkToTrigger) {
              const hasOriginLink = this._originHasLinkToTerm(origin, file, context);
              if (!hasOriginLink) {
                this._inFlightGenerations.delete(file.path);
                return;
              }
            }
            this._markProcessed(file.path);
            const term = file.basename;
            const originLink = this._computeOriginLinktext(origin, file);
            new Notice('Gathering vault context…');
            const traits = await this.fetchZettelkastenContext(origin);
            const prompt = this.buildPrompt(term, this._truncateContext(context), originLink, traits);
            new Notice('Generating definition…');
            let definition = await this.queryCopilot(prompt);
            if (definition) {              definition = this._sanitizeOutput(definition);              definition = this._ensureSourceContextFromLine(definition, originLink);              await this.app.vault.modify(file, definition);
              this._attemptCounts.delete(file.path);              this._inFlightGenerations.delete(file.path);
              new Notice('Definition inserted.');
            } else {
              // Do not show an error yet; retry once after a short delay
              const key = file.path;
              const count = (this._attemptCounts.get(key) || 0) + 1;
              this._attemptCounts.set(key, count);
              // SECURITY FIX: Cap retries at 1 attempt to prevent infinite loops
              if (count <= 1) {
                setTimeout(async () => {
                  try {
                    const freshCtx = await this.app.vault.read(origin);
                    const retryOriginLink = this._computeOriginLinktext(origin, file);
                    const retryTraits = await this.fetchZettelkastenContext(origin);
                    const retryPrompt = this.buildPrompt(term, this._truncateContext(freshCtx), retryOriginLink, retryTraits);
                    let second = await this.queryCopilot(retryPrompt);
                    if (second) {
                      second = this._sanitizeOutput(second);
                      second = this._ensureSourceContextFromLine(second, retryOriginLink);
                      await this.app.vault.modify(file, second);
                      this._attemptCounts.delete(key);
                      this._inFlightGenerations.delete(file.path);
                      new Notice('Definition inserted.');
                    } else {
                      this._attemptCounts.delete(key); // Clean up on permanent failure
                      this._inFlightGenerations.delete(file.path);
                      new Notice('Definition generation failed (see console).');
                    }
                  } catch (e) {
                    console.error('Retry generation failed', e);
                    this._attemptCounts.delete(key); // Clean up on error
                    this._inFlightGenerations.delete(file.path);
                    new Notice('Definition generation failed (see console).');
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

    this.addCommand({
      id: 'regenerate-definition',
      name: 'Regenerate definition for current note',
      callback: async () => {
        await this.regenerateForCurrentNote();
      },
    });

    this.addCommand({
      id: 'pick-origin-and-regenerate',
      name: 'Pick origin note, then regenerate',
      callback: async () => {
        const target = this.app.workspace.getActiveFile();
        if (!target || target.extension !== 'md') return;

        const files = this.app.vault.getMarkdownFiles();
        const modal = new OriginNoteSuggestModal(this.app, files, async (origin) => {
          try {
            const context = await this.app.vault.read(origin);
            const term = target.basename;
            const originLink = this._computeOriginLinktext(origin, target);
            // BUG FIX: Apply context truncation consistently (same as elsewhere)
            const traits = await this.fetchZettelkastenContext(origin);
            const prompt = this.buildPrompt(term, this._truncateContext(context), originLink, traits);
            let definition = await this.queryCopilot(prompt);
            if (definition) {
              definition = this._sanitizeOutput(definition);
              definition = this._ensureSourceContextFromLine(definition, originLink);
              await this.app.vault.modify(target, definition);
            } else {
              try {
                const fallback = this._buildLocalTemplate(term, originLink, this._truncateContext(context));
                await this.app.vault.modify(target, fallback);
                new Notice('Inserted local fallback definition (API failed).');
              } catch (e) {
                console.error('Failed to insert fallback template (picker)', e);
              }
            }
          } catch (e) {
            console.error('Failed to regenerate with picked origin', e);
          }
        });
        modal.open();
      },
    });

    this.addCommand({
      id: 'test-api-roundtrip-log-only',
      name: 'Test API roundtrip (log only)',
      callback: async () => {
        try {
          const file = this.app.workspace.getActiveFile();
          if (!file) { new Notice('Open a note to test.'); return; }
          const ctx = await this.app.vault.read(file);
          const originLink = this._computeOriginLinktext(file, file);
          const prompt = this.buildPrompt(file.basename, this._truncateContext(ctx), originLink);
          new Notice('Testing API…');
          const out = await this.queryCopilot(prompt);
          console.log('[Contextual Wiki Definitions] Test output:', out);
          new Notice(out ? 'API OK — see console' : 'API failed — see console');
        } catch (err) {
          console.error('Test API failed', err);
          new Notice('Test failed (see console)');
        }
      },
    });
  }

  async fetchZettelkastenContext(originFile) {
    const empty = { echoChamber: '', crossDomain: '', semanticLinker: '', serendipity: '', orphanRescue: '' };
    try {
      const vz = this.app.plugins?.plugins?.['vault-zettelkasten'];
      if (!vz?.api || !originFile) return empty;

      const req = { notePath: originFile.path, options: { limit: 8, batchMode: false, writeReport: false } };

      const [ec, cd, sl, sr, or] = await Promise.allSettled([
        vz.api.echoChamber(req),
        vz.api.crossDomain(req),
        vz.api.semanticLinker(req),
        vz.api.serendipity(req),
        vz.api.orphanRescue(req),
      ]);

      const pick = (r) => (r.status === 'fulfilled' && r.value && r.value.content) ? r.value.content : '';
      return {
        echoChamber:    pick(ec),
        crossDomain:    pick(cd),
        semanticLinker: pick(sl),
        serendipity:    pick(sr),
        orphanRescue:   pick(or),
      };
    } catch (e) {
      console.warn('[ContextualWikiDefinitions] VZ trait fetch failed:', e);
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
7. Weave any provided Zettelkasten trait outputs into the matching H2 sections. If a trait output is missing or empty, render the section with a single italic line: *(unavailable — Vault Zettelkasten not running, or no signal found)*.

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
- [[Linked Note]] — (typed relationship)
- [[Linked Note]] — (typed relationship)
- [[Linked Note]] — (typed relationship)

## 🌉 Cross-Domain Metaphor Bridges
- **From [[Distant Note]]:** (one-line bridge)
- **From [[Distant Note]]:** (one-line bridge)

## ✨ Surprising Connections
- [[Note]] — (why it's an unexpected match)
- [[Note]] — (why)

## 🪞 Where This Belief Could Break
- **Assumption baked in:** (...)
  **Counter-evidence in the vault:** [[Note]] — (...)
- **Assumption baked in:** (...)
  **Counter-evidence in the vault:** [[Note]] — (...)

## 🕯️ Forgotten Notes Worth Re-reading
- [[Orphan Note]] — (why this orphan is worth pulling back in)
- [[Orphan Note]] — (why)

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

VAULT ZETTELKASTEN TRAIT OUTPUTS (use these to populate the matching H2 sections; ignore any sections you have no signal for):

[ECHO_CHAMBER]
${t.echoChamber || '(unavailable)'}

[CROSS_DOMAIN]
${t.crossDomain || '(unavailable)'}

[SEMANTIC_LINKER]
${t.semanticLinker || '(unavailable)'}

[SERENDIPITY]
${t.serendipity || '(unavailable)'}

[ORPHAN_RESCUE]
${t.orphanRescue || '(unavailable)'}

ORIGINATING NOTE CONTEXT:
${context}`;
  }

  async regenerateForCurrentNote() {
    const target = this.app.workspace.getActiveFile();
    if (!target || target.extension !== 'md') return;

    const origin = (this.previousFile && this.previousFile.path !== target.path)
      ? this.previousFile
      : null;
    let context = '';
    try {
      if (origin) {
        context = await this.app.vault.read(origin);
      } else {
        // Fallback: use current note content if no distinct origin is known
        context = await this.app.vault.read(target);
      }
    } catch (_) {}

    const term = target.basename;
    const originFile = origin || target;
    const originLink = this._computeOriginLinktext(originFile, target);
    const traits = await this.fetchZettelkastenContext(originFile);
    const prompt = this.buildPrompt(term, this._truncateContext(context), originLink, traits);
    new Notice('Generating definition…');
    let definition = await this.queryCopilot(prompt);
    if (definition) {
      definition = this._sanitizeOutput(definition);
      definition = this._ensureSourceContextFromLine(definition, originLink);
      await this.app.vault.modify(target, definition);
      new Notice('Definition inserted.');
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

  _computeOriginLinktext(originFile, targetFile) {
    try {
      if (!originFile) return '[[Unknown Origin]]';
      const sourcePath = targetFile && targetFile.path ? targetFile.path : '';
      const linktext = this.app.metadataCache.fileToLinktext(originFile, sourcePath, false);
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
   * NETWORKING: HTTP request wrapper using Obsidian requestUrl with fetch fallback
   * Prefers requestUrl for better Obsidian integration, falls back to fetch if unavailable
   */
  async _makeRequest(url, options) {    // Prefer Obsidian requestUrl if available (better integration, mobile support)
    if (typeof requestUrl !== 'undefined' && requestUrl) {
      try {        // requestUrl doesn't support AbortController, so use Promise.race for timeout
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout')), 30000);
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

    // Fallback to fetch (for compatibility or if requestUrl unavailable)    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
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

          preferredEndpoint = endpoint;
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

    try {
      // Attempt 1: JSON, non-stream
      let res = await call({ model: modelName, stream: false, accept: 'application/json' });
      if (!res.ok) {
        // SECURITY: Reduce sensitive logging - only log status + short snippet
        const errorText = await res.text();
        const snippet = errorText ? errorText.slice(0, 300) : '';
        console.error('Copilot non-OK response (1)', res.status, snippet + (errorText && errorText.length > 300 ? '...' : ''));
      } else {
        const ct1 = (res.headers.get('content-type') || '').toLowerCase();
        const text1 = await res.text();
        // BUG FIX: Handle null/undefined text responses
        if (!text1) {
          // Silently continue to next attempt
        } else {
          try {
            const data1 = JSON.parse(text1);
            const msg1 = data1 && data1.choices && data1.choices[0] && data1.choices[0].message;
            if (msg1 && msg1.content) return msg1.content.trim();
            // Silently continue to next attempt - don't log warnings for expected fallback behavior
          } catch (e1) {
            if (ct1.includes('text/event-stream') || (text1 && text1.startsWith('data:'))) {
            let out = '';
            for (const rawLine of text1.split('\n')) {
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
            // Silently continue to next attempt - don't log parse errors for expected fallback behavior
          }
        }
      }

      // Attempt 2: SSE stream
      try {
        res = await call({ model: modelName, stream: true, accept: 'text/event-stream,*/*' });
        const text2 = await res.text();
        let out2 = '';
        for (const rawLine of text2.split('\n')) {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const evt = JSON.parse(payload);
            const choice = evt.choices && evt.choices[0];
            const delta = choice && (choice.delta || choice.message);
            const chunk = delta && (delta.content || '');
            if (chunk) out2 += chunk;
          } catch (_) {}
        }
        if (out2.trim()) return out2.trim();
      } catch (e2) {
        // Silently continue to next attempt
      }

      // Attempt 3: JSON, non-stream, non-flash model
      try {
        res = await call({ model: 'copilot-plus', stream: false, accept: 'application/json' });
        const text3 = await res.text();
        try {
          const data3 = JSON.parse(text3);
          const msg3 = data3 && data3.choices && data3.choices[0] && data3.choices[0].message;
          if (msg3 && msg3.content) return msg3.content.trim();
        } catch (_) {}
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

  async _ensureNewWikiLinkNoteInOriginFolder(file, origin) {
    if (!file || file.extension !== 'md' || !origin || origin.extension !== 'md') {
      return file;
    }

    const originFolder = this._getFolderPath(origin);
    const currentFolder = this._getFolderPath(file);
    if (originFolder === currentFolder) {
      return file;
    }

    const desiredPath = originFolder
      ? path.posix.join(originFolder, `${file.basename}.md`)
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
      console.error('Contextual Wiki Definitions: failed to relocate new wiki link note', err);
      return file;
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
