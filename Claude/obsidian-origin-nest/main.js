'use strict';

/*
 * Origin Nest.
 *
 * View-layer plugin (with one opt-in exception, below). Reads a frontmatter key
 * (default "origin") on each note; if it points to another note (via [[wikilink]] or a
 * path), that note is the "origin" and this note one of its nested children. The File
 * Explorer is then augmented to show the relationship.
 *
 * Modes:
 *   - 'decorate' (Tier 1): count badge on origin notes + rail/indent/dim on child notes.
 *   - 'nest' (Tier 2): a collapsible group of the children is rendered directly beneath
 *     the origin note's row, and the children's real rows are hidden in their own folders.
 *     Tier 2 uses synthetic, plugin-owned rows (not reparented native nodes) and anchors
 *     each group INSIDE its origin's .nav-file element — the explorer is virtualized
 *     (InfinityScroll measures tree-items), so injected height must live inside a measured
 *     row; a free-floating sibling corrupts the scroller's geometry model and produced the
 *     jumpy-scroll / unstable-right-click glitch fixed in 0.3.1. Re-decoration is skipped
 *     while the pane is actively scrolling and whenever a mutation burst changed nothing
 *     relevant, so Obsidian's own mount/unmount churn no longer triggers rebuild storms.
 *
 * The ONE feature that writes to your notes (opt-in, default OFF): "Maintain a Definitions
 * list on origin notes" keeps a marker-delimited "## Definitions" block on each origin note
 * linking back down to its children. It is idempotent (loop-safe), self-healing, and turning
 * it off removes every managed block.
 *
 * All internal-DOM access is feature-detected and degrades to a harmless no-op if Obsidian's
 * explorer markup changes. Plain CommonJS, no build step — matches the sibling
 * contextual-wiki-definitions plugin.
 */

const obsidian = require('obsidian');
const { Plugin, PluginSettingTab, Setting, Notice, Menu, FuzzySuggestModal, TFile, setIcon } = obsidian;

const BACKLINK_START = '<!-- origin-nest:definitions -->';
const BACKLINK_END = '<!-- /origin-nest:definitions -->';

const DEFAULT_SETTINGS = {
  frontmatterKey: 'origin',
  mode: 'decorate', // 'decorate' | 'nest' | 'off'
  showCountBadge: true,
  dimChildren: true,
  indentChildren: true,
  hideNestedInFolder: true, // (nest mode) hide each child's real row in its own folder
  collapsed: [],            // (nest mode) origin paths whose group is collapsed
  maintainBacklinks: false, // write a managed "## Definitions" list into each origin note
  backlinkHeading: 'Definitions',
  backlinkedOrigins: [],    // internal: origins that currently have a managed block
};

function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
  return String(value).replace(/["\\\]#.:>~+*^$=|()[\s]/g, '\\$&');
}

class OriginNestPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    this._parentByChild = new Map();    // childPath  -> parentPath
    this._childrenByParent = new Map(); // parentPath -> Set<childPath>
    this._collapsed = new Set(this.settings.collapsed || []);
    this._observers = [];               // [{ obs, container, onScroll }]
    this._applyScheduled = false;
    this._applying = false;
    this._lastSig = new WeakMap();      // container -> signature of the last applied state
    this._scrollingUntil = 0;           // defer re-decoration while a pane is actively scrolling
    this._graphScheduled = false;
    this._writingPaths = new Set();     // backlink-write guard (ignore our own file events)
    this._syncing = false;
    this._backlinkScheduled = false;

    this.addSettingTab(new OriginNestSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      this.rebuildGraph();
      this.applyBodyClasses();
      this.attachObservers();
      this.scheduleApply();
      this.scheduleBacklinkSync();
    });

    // Keep the origin graph (and backlinks) in sync with metadata + vault changes.
    // metadataCache 'changed' fires on every edit burst, so the O(all files) graph rebuild
    // is debounced — decorations were being torn down and rebuilt while the user typed.
    this.registerEvent(this.app.metadataCache.on('resolved', () => { this.scheduleGraphRefresh(); }));
    this.registerEvent(this.app.metadataCache.on('changed', () => { this.scheduleGraphRefresh(); }));
    this.registerEvent(this.app.vault.on('rename', () => { this.scheduleGraphRefresh(); }));
    this.registerEvent(this.app.vault.on('create', () => { this.scheduleApply(); }));
    this.registerEvent(this.app.vault.on('delete', () => { this.scheduleGraphRefresh(); }));

    // Explorer panes can open/close/move; active file changes the highlight.
    this.registerEvent(this.app.workspace.on('layout-change', () => { this.attachObservers(); this.scheduleApply(); }));
    this.registerEvent(this.app.workspace.on('file-open', () => { this.scheduleApply(); }));

    this.addCommand({
      id: 'reveal-origin',
      name: 'Reveal origin of current note',
      checkCallback: (checking) => {
        const f = this.app.workspace.getActiveFile();
        const parent = f && this._parentByChild.get(f.path);
        if (checking) return !!parent;
        this.openPath(parent);
        return true;
      },
    });

    this.addCommand({
      id: 'list-nested',
      name: 'List notes nested under current note',
      checkCallback: (checking) => {
        const f = this.app.workspace.getActiveFile();
        const kids = f && this._childrenByParent.get(f.path);
        const has = !!(kids && kids.size);
        if (checking) return has;
        this.openChildPicker(f);
        return true;
      },
    });

    this.addCommand({
      id: 'toggle-collapse-all',
      name: 'Collapse / expand all origin groups',
      callback: () => this.toggleCollapseAll(),
    });

    this.addCommand({
      id: 'sync-backlinks',
      name: 'Rebuild Definitions backlinks now',
      checkCallback: (checking) => {
        if (checking) return !!this.settings.maintainBacklinks;
        this.scheduleBacklinkSync();
        return true;
      },
    });

    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      if (!(file instanceof TFile)) return;
      const parent = this._parentByChild.get(file.path);
      if (parent) {
        menu.addItem((it) => it
          .setTitle('Origin Nest: reveal origin')
          .setIcon('corner-left-up')
          .onClick(() => this.openPath(parent)));
      }
      const kids = this._childrenByParent.get(file.path);
      if (kids && kids.size) {
        menu.addItem((it) => it
          .setTitle(`Origin Nest: list ${kids.size} nested note${kids.size > 1 ? 's' : ''}`)
          .setIcon('list-tree')
          .onClick(() => this.openChildPicker(file)));
      }
    }));
  }

  onunload() {
    this.detachObservers();
    this.clearDecorations();
    document.body.removeClass('origin-nest-dim');
    document.body.removeClass('origin-nest-indent');
  }

  async saveSettings() {
    this.settings.collapsed = Array.from(this._collapsed);
    await this.saveData(this.settings);
  }

  // ---------- origin graph ----------

  parseOriginLinkpath(raw) {
    if (raw == null) return null;
    let s = Array.isArray(raw) ? raw[0] : raw;
    s = String(s).trim();
    if (!s) return null;
    const m = s.match(/^\[\[([\s\S]+)\]\]$/);
    if (m) s = m[1];
    s = s.split('|')[0].split('#')[0].trim(); // drop alias + heading/block subpath
    return s || null;
  }

  rebuildGraph() {
    try {
      const key = (this.settings.frontmatterKey || 'origin').trim();
      const parentByChild = new Map();
      const childrenByParent = new Map();
      for (const f of this.app.vault.getMarkdownFiles()) {
        const cache = this.app.metadataCache.getFileCache(f);
        const fm = cache && cache.frontmatter;
        if (!fm || !(key in fm)) continue;
        const linkpath = this.parseOriginLinkpath(fm[key]);
        if (!linkpath) continue;
        // Resolve as-is; legacy contextual-wiki-definitions notes embed a trailing ".md"
        // (e.g. [[Define general intelligence.md]]), so fall back to the stripped linkpath.
        let dest = this.app.metadataCache.getFirstLinkpathDest(linkpath, f.path);
        if (!dest && /\.md$/i.test(linkpath)) {
          dest = this.app.metadataCache.getFirstLinkpathDest(linkpath.replace(/\.md$/i, ''), f.path);
        }
        if (!dest || dest.path === f.path) continue;
        parentByChild.set(f.path, dest.path);
        let set = childrenByParent.get(dest.path);
        if (!set) { set = new Set(); childrenByParent.set(dest.path, set); }
        set.add(f.path);
      }
      this._parentByChild = parentByChild;
      this._childrenByParent = childrenByParent;
    } catch (e) {
      console.error('[Origin Nest] rebuildGraph failed', e);
    }
  }

  // ---------- explorer observers ----------

  getExplorerContainers() {
    const out = [];
    try {
      for (const leaf of this.app.workspace.getLeavesOfType('file-explorer')) {
        const view = leaf && leaf.view;
        const root = view && view.containerEl;
        const container = root && root.querySelector('.nav-files-container');
        if (container) out.push(container);
      }
    } catch (e) {
      console.error('[Origin Nest] getExplorerContainers failed', e);
    }
    return out;
  }

  attachObservers() {
    this.detachObservers();
    for (const container of this.getExplorerContainers()) {
      const obs = new MutationObserver(() => { if (!this._applying) this.scheduleApply(); });
      obs.observe(container, { childList: true, subtree: true });
      // The explorer is virtualized: scrolling mounts/unmounts rows, which fires the
      // observer. Rebuilding mid-scroll shifts content under the pointer, so mark the
      // pane as scrolling and let scheduleApply wait for idle.
      const onScroll = () => { this._scrollingUntil = Date.now() + 160; };
      container.addEventListener('scroll', onScroll, { passive: true });
      this._observers.push({ obs, container, onScroll });
    }
  }

  detachObservers() {
    for (const o of this._observers) {
      try { o.obs.disconnect(); } catch (_) { /* noop */ }
      try { if (o.onScroll) o.container.removeEventListener('scroll', o.onScroll); } catch (_) { /* noop */ }
    }
    this._observers = [];
  }

  // ---------- decoration + nesting ----------

  scheduleApply() {
    if (this._applyScheduled) return;
    this._applyScheduled = true;
    const attempt = () => {
      const wait = this._scrollingUntil - Date.now();
      if (wait > 0) { window.setTimeout(attempt, wait + 20); return; }
      this._applyScheduled = false;
      this.applyDecorations();
    };
    window.setTimeout(attempt, 40);
  }

  scheduleGraphRefresh() {
    if (this._graphScheduled) return;
    this._graphScheduled = true;
    window.setTimeout(() => {
      this._graphScheduled = false;
      this.rebuildGraph();
      this.scheduleApply();
      this.scheduleBacklinkSync();
    }, 250);
  }

  applyDecorations() {
    this._applying = true;
    for (const o of this._observers) { try { o.obs.disconnect(); } catch (_) { /* noop */ } }
    try {
      for (const container of this.getExplorerContainers()) {
        // Skip the teardown-and-rebuild entirely when this pane's relevant state is
        // unchanged AND our decorations are still physically present. Obsidian's
        // virtualized explorer fires mutation bursts constantly (mount/unmount, its own
        // re-renders); nuking and rebuilding every group on each burst is what made
        // scrolling and right-clicking glitch.
        const sig = this.containerSignature(container);
        if (this._lastSig.get(container) === sig && this.decorationsIntact(container)) continue;
        this.decorateContainer(container);
        this._lastSig.set(container, sig);
      }
    } catch (e) {
      console.error('[Origin Nest] applyDecorations failed', e);
    } finally {
      for (const o of this._observers) {
        try { o.obs.observe(o.container, { childList: true, subtree: true }); } catch (_) { /* noop */ }
      }
      this._applying = false;
    }
  }

  // What the decorated state of a container depends on — used to detect no-op mutation bursts.
  containerSignature(container) {
    const s = this.settings;
    const head = [
      s.mode, s.showCountBadge ? 1 : 0, s.hideNestedInFolder ? 1 : 0,
      (this.app.workspace.getActiveFile() || {}).path || '',
    ].join('~');
    const seen = [];
    container.querySelectorAll('.nav-file-title[data-path]').forEach((el) => {
      const p = el.getAttribute('data-path');
      if (!p) return;
      const kids = this._childrenByParent.get(p);
      const isChild = this._parentByChild.has(p);
      if (kids && kids.size) seen.push(`${p}:P${kids.size}${this._collapsed.has(p) ? 'c' : 'e'}`);
      if (isChild) seen.push(`${p}:C`);
    });
    seen.sort();
    return head + '||' + seen.join('|');
  }

  // True when every decoration we expect in this container is still physically present
  // (Obsidian re-rendering a row silently strips our badge/group — that must rebuild).
  decorationsIntact(container) {
    if (this.settings.mode === 'off') return true;
    const titles = container.querySelectorAll('.nav-file-title[data-path]');
    for (const el of titles) {
      const p = el.getAttribute('data-path');
      if (!p) continue;
      const kids = this._childrenByParent.get(p);
      if (kids && kids.size) {
        if (!el.classList.contains('origin-nest-parent')) return false;
        if (this.settings.showCountBadge && !el.querySelector('.origin-nest-count')) return false;
        if (this.settings.mode === 'nest') {
          const row = el.closest('.nav-file');
          if (!el.classList.contains('origin-nest-has-group')) return false;
          if (!row || !row.querySelector(':scope > .origin-nest-group')) return false;
        }
      }
      if (this._parentByChild.has(p)) {
        if (!el.classList.contains('origin-nest-child')) return false;
        if (this.settings.mode === 'nest' && this.settings.hideNestedInFolder) {
          // Only expected hidden when its parent's row is actually rendered here —
          // buildNesting leaves children visible when their origin is off-screen/collapsed.
          const parentPath = this._parentByChild.get(p);
          const parentTitle = container.querySelector(`.nav-file-title[data-path="${cssEscape(parentPath)}"]`);
          if (parentTitle) {
            const row = el.closest('.nav-file');
            if (row && !row.classList.contains('origin-nest-hidden')) return false;
          }
        }
      }
    }
    return true;
  }

  undoContainer(container) {
    container.querySelectorAll('.origin-nest-group').forEach((n) => n.remove());
    container.querySelectorAll('.origin-nest-toggle').forEach((n) => n.remove());
    container.querySelectorAll('.origin-nest-count').forEach((n) => n.remove());
    container.querySelectorAll('.origin-nest-hidden').forEach((el) => el.classList.remove('origin-nest-hidden'));
    container.querySelectorAll('.origin-nest-parent, .origin-nest-child, .origin-nest-has-group').forEach((el) => {
      el.classList.remove('origin-nest-parent', 'origin-nest-child', 'origin-nest-has-group');
      el.removeAttribute('data-origin-count');
    });
  }

  decorateContainer(container) {
    this.undoContainer(container);
    if (this.settings.mode === 'off') return;

    const titleByPath = new Map();
    const titles = container.querySelectorAll('.nav-file-title[data-path]');
    titles.forEach((el) => {
      const p = el.getAttribute('data-path');
      if (!p) return;
      titleByPath.set(p, el);

      const kids = this._childrenByParent.get(p);
      if (kids && kids.size) {
        el.classList.add('origin-nest-parent');
        el.setAttribute('data-origin-count', String(kids.size));
        if (this.settings.showCountBadge) {
          const badge = document.createElement('span');
          badge.className = 'origin-nest-count';
          badge.textContent = String(kids.size);
          badge.setAttr('aria-label', `${kids.size} nested note${kids.size > 1 ? 's' : ''}`);
          el.appendChild(badge);
        }
      }
      if (this._parentByChild.has(p)) {
        el.classList.add('origin-nest-child');
      }
    });

    if (this.settings.mode === 'nest') this.buildNesting(container, titleByPath);
  }

  buildNesting(container, titleByPath) {
    for (const [parentPath, childSet] of this._childrenByParent) {
      if (!childSet || !childSet.size) continue;

      const parentTitle = titleByPath.get(parentPath);
      if (!parentTitle) continue;
      const parentRow = parentTitle.closest('.nav-file');
      if (!parentRow) continue;

      const kids = [];
      for (const cp of childSet) {
        const cf = this.app.vault.getAbstractFileByPath(cp);
        if (cf instanceof TFile) kids.push(cf);
      }
      if (!kids.length) continue;
      kids.sort((a, b) => a.basename.localeCompare(b.basename));

      const collapsed = this._collapsed.has(parentPath);
      const activePath = (this.app.workspace.getActiveFile() || {}).path;

      parentTitle.classList.add('origin-nest-has-group');
      const toggle = document.createElement('div');
      toggle.className = 'origin-nest-toggle' + (collapsed ? ' is-collapsed' : '');
      setIcon(toggle, 'chevron-down');
      toggle.setAttr('aria-label', collapsed ? 'Expand nested notes' : 'Collapse nested notes');
      toggle.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.toggleCollapse(parentPath); });
      parentTitle.insertBefore(toggle, parentTitle.firstChild);

      const group = document.createElement('div');
      group.className = 'origin-nest-group' + (collapsed ? ' origin-nest-collapsed' : '');
      group.setAttribute('data-origin-parent', parentPath);

      for (const cf of kids) {
        const item = document.createElement('div');
        item.className = 'origin-nest-item' + (cf.path === activePath ? ' is-active' : '');
        item.setAttribute('data-path', cf.path);

        const title = document.createElement('div');
        title.className = 'origin-nest-item-title';
        title.textContent = cf.basename;
        item.appendChild(title);

        item.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.openPath(cf.path); });
        item.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); this.showItemMenu(e, cf); });
        group.appendChild(item);

        if (this.settings.hideNestedInFolder) {
          const realTitle = titleByPath.get(cf.path);
          const realRow = realTitle && realTitle.closest('.nav-file');
          if (realRow && realRow !== parentRow) realRow.classList.add('origin-nest-hidden');
        }
      }

      // INSIDE the parent's .nav-file, not as a following sibling: the explorer's
      // virtual scroller (InfinityScroll) measures tree-items, so height injected here
      // is accounted for; a foreign sibling's height is not, and corrupts the
      // scrollTop-to-content mapping in proportion to the expanded groups.
      parentRow.appendChild(group);
    }
  }

  toggleCollapse(parentPath) {
    const collapsed = !this._collapsed.has(parentPath);
    if (collapsed) this._collapsed.add(parentPath); else this._collapsed.delete(parentPath);
    for (const c of this.getExplorerContainers()) {
      c.querySelectorAll(`.origin-nest-group[data-origin-parent="${cssEscape(parentPath)}"]`)
        .forEach((g) => g.classList.toggle('origin-nest-collapsed', collapsed));
      const t = c.querySelector(`.nav-file-title[data-path="${cssEscape(parentPath)}"] .origin-nest-toggle`);
      if (t) t.classList.toggle('is-collapsed', collapsed);
    }
    void this.saveSettings();
  }

  toggleCollapseAll() {
    const anyExpanded = [...this._childrenByParent.keys()].some((p) => !this._collapsed.has(p));
    if (anyExpanded) { for (const p of this._childrenByParent.keys()) this._collapsed.add(p); }
    else { this._collapsed.clear(); }
    void this.saveSettings();
    this.scheduleApply();
  }

  clearDecorations() {
    for (const container of this.getExplorerContainers()) this.undoContainer(container);
  }

  applyBodyClasses() {
    const on = this.settings.mode !== 'off';
    document.body.toggleClass('origin-nest-dim', on && !!this.settings.dimChildren);
    document.body.toggleClass('origin-nest-indent', on && !!this.settings.indentChildren);
  }

  // ---------- reciprocal backlinks (the one feature that writes to your notes) ----------

  scheduleBacklinkSync() {
    if (!this.settings.maintainBacklinks) return;
    if (this._backlinkScheduled) return;
    this._backlinkScheduled = true;
    window.setTimeout(() => { this._backlinkScheduled = false; void this.syncBacklinks(); }, 500);
  }

  async syncBacklinks() {
    if (!this.settings.maintainBacklinks || this._syncing) return;
    this._syncing = true;
    try {
      const heading = (this.settings.backlinkHeading || 'Definitions').trim() || 'Definitions';
      const nowParents = new Set();
      for (const [parentPath, childSet] of this._childrenByParent) {
        if (!childSet || !childSet.size) continue;
        const pf = this.app.vault.getAbstractFileByPath(parentPath);
        if (!(pf instanceof TFile)) continue;
        const links = [];
        for (const cp of childSet) {
          const cf = this.app.vault.getAbstractFileByPath(cp);
          if (cf instanceof TFile) links.push(this._linkText(cf, pf.path));
        }
        if (!links.length) continue;
        links.sort((a, b) => a.localeCompare(b));
        nowParents.add(parentPath);
        await this._writeBacklinkBlock(pf, heading, links);
      }
      // Remove the managed block from origins that no longer have children.
      for (const oldPath of (this.settings.backlinkedOrigins || [])) {
        if (nowParents.has(oldPath)) continue;
        const of = this.app.vault.getAbstractFileByPath(oldPath);
        if (of instanceof TFile) await this._removeBacklinkBlock(of);
      }
      this.settings.backlinkedOrigins = Array.from(nowParents);
      await this.saveSettings();
    } catch (e) {
      console.error('[Origin Nest] syncBacklinks failed', e);
    } finally {
      this._syncing = false;
    }
  }

  async removeAllBacklinks() {
    try {
      for (const p of (this.settings.backlinkedOrigins || [])) {
        const f = this.app.vault.getAbstractFileByPath(p);
        if (f instanceof TFile) await this._removeBacklinkBlock(f);
      }
      this.settings.backlinkedOrigins = [];
      await this.saveSettings();
    } catch (e) {
      console.error('[Origin Nest] removeAllBacklinks failed', e);
    }
  }

  _linkText(file, sourcePath) {
    try { return `[[${this.app.metadataCache.fileToLinktext(file, sourcePath, true)}]]`; }
    catch (_) { return `[[${file.basename}]]`; }
  }

  _extractBlock(data) {
    const s = data.indexOf(BACKLINK_START);
    if (s === -1) return null;
    const e = data.indexOf(BACKLINK_END, s);
    if (e === -1) return null;
    return { start: s, end: e + BACKLINK_END.length };
  }

  async _writeBacklinkBlock(file, heading, links) {
    const block = `${BACKLINK_START}\n## ${heading}\n${links.map((l) => `- ${l}`).join('\n')}\n${BACKLINK_END}`;
    await this._editFile(file, (data) => {
      const at = this._extractBlock(data);
      if (at) {
        if (data.slice(at.start, at.end) === block) return null; // idempotent — no write, no loop
        return data.slice(0, at.start) + block + data.slice(at.end);
      }
      const sep = data.length === 0 ? '' : (data.endsWith('\n\n') ? '' : (data.endsWith('\n') ? '\n' : '\n\n'));
      return `${data}${sep}${block}\n`;
    });
  }

  async _removeBacklinkBlock(file) {
    await this._editFile(file, (data) => {
      const at = this._extractBlock(data);
      if (!at) return null;
      const before = data.slice(0, at.start).replace(/\n+$/, '\n');
      const after = data.slice(at.end).replace(/^\n+/, '');
      let out = (before + after).replace(/\n{3,}/g, '\n\n');
      if (out.length && !out.endsWith('\n')) out += '\n';
      return out;
    });
  }

  // Read → transform → write, but only when the content actually changes (loop-safe),
  // and never re-enter for a file we are mid-write on.
  async _editFile(file, transform) {
    if (this._writingPaths.has(file.path)) return;
    let data;
    try { data = await this.app.vault.read(file); } catch (_) { return; }
    const out = transform(data);
    if (out == null || out === data) return;
    try {
      this._writingPaths.add(file.path);
      await this.app.vault.modify(file, out);
    } catch (e) {
      console.error('[Origin Nest] backlink write failed for', file.path, e);
    } finally {
      window.setTimeout(() => this._writingPaths.delete(file.path), 400);
    }
  }

  // ---------- navigation ----------

  async openPath(path, newLeaf = false) {
    if (!path) return;
    const f = this.app.vault.getAbstractFileByPath(path);
    if (f instanceof TFile) {
      await this.app.workspace.getLeaf(newLeaf).openFile(f);
    }
  }

  showItemMenu(evt, file) {
    const menu = new Menu();
    menu.addItem((i) => i.setTitle('Open').setIcon('file').onClick(() => this.openPath(file.path)));
    menu.addItem((i) => i.setTitle('Open in new tab').setIcon('file-plus').onClick(() => this.openPath(file.path, 'tab')));
    menu.addSeparator();
    this.app.workspace.trigger('file-menu', menu, file, 'origin-nest');
    menu.showAtMouseEvent(evt);
  }

  openChildPicker(parentFile) {
    const kids = this._childrenByParent.get(parentFile.path);
    if (!kids || !kids.size) { new Notice('Origin Nest: no nested notes.'); return; }
    const files = [];
    for (const p of kids) {
      const f = this.app.vault.getAbstractFileByPath(p);
      if (f instanceof TFile) files.push(f);
    }
    files.sort((a, b) => a.basename.localeCompare(b.basename));
    new ChildPickerModal(this.app, files, (f) => this.openPath(f.path)).open();
  }
}

class ChildPickerModal extends FuzzySuggestModal {
  constructor(app, files, onChoose) {
    super(app);
    this.files = files;
    this.onChooseCb = onChoose;
    this.setPlaceholder('Open a nested note…');
  }
  getItems() { return this.files; }
  getItemText(f) { return f.basename; }
  onChooseItem(f) { this.onChooseCb(f); }
}

class OriginNestSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h3', { text: 'Origin Nest' });
    containerEl.createEl('p', {
      text: 'The explorer decoration/nesting is view-only. The Definitions-backlink feature below is the one thing that writes to your notes, and it is off by default.',
      cls: 'setting-item-description',
    });

    new Setting(containerEl)
      .setName('Origin frontmatter key')
      .setDesc('A note whose frontmatter has this field pointing to another note ([[link]] or path) is treated as nested under that note.')
      .addText((t) => t
        .setPlaceholder('origin')
        .setValue(this.plugin.settings.frontmatterKey)
        .onChange(async (v) => {
          this.plugin.settings.frontmatterKey = (v || '').trim() || 'origin';
          await this.plugin.saveSettings();
          this.plugin.rebuildGraph();
          this.plugin.scheduleApply();
          this.plugin.scheduleBacklinkSync();
        }));

    new Setting(containerEl)
      .setName('Mode')
      .setDesc('Decorate = badges + rails only. Nest = also fold each origin\'s children into a collapsible group beneath it.')
      .addDropdown((d) => d
        .addOption('decorate', 'Decorate (Tier 1)')
        .addOption('nest', 'Nest — collapsible (Tier 2)')
        .addOption('off', 'Off')
        .setValue(this.plugin.settings.mode)
        .onChange(async (v) => {
          this.plugin.settings.mode = v;
          await this.plugin.saveSettings();
          this.plugin.applyBodyClasses();
          this.plugin.scheduleApply();
        }));

    new Setting(containerEl)
      .setName('Count badge on origin notes')
      .setDesc('Show how many notes are nested under each origin note.')
      .addToggle((tg) => tg
        .setValue(this.plugin.settings.showCountBadge)
        .onChange(async (v) => {
          this.plugin.settings.showCountBadge = v;
          await this.plugin.saveSettings();
          this.plugin.scheduleApply();
        }));

    new Setting(containerEl)
      .setName('Hide nested notes in their own folder')
      .setDesc('Nest mode only: hide each child\'s real row in its home folder so it appears only under its origin.')
      .addToggle((tg) => tg
        .setValue(this.plugin.settings.hideNestedInFolder)
        .onChange(async (v) => {
          this.plugin.settings.hideNestedInFolder = v;
          await this.plugin.saveSettings();
          this.plugin.scheduleApply();
        }));

    new Setting(containerEl)
      .setName('Dim nested notes')
      .setDesc('Render nested (child) notes in a muted color.')
      .addToggle((tg) => tg
        .setValue(this.plugin.settings.dimChildren)
        .onChange(async (v) => {
          this.plugin.settings.dimChildren = v;
          await this.plugin.saveSettings();
          this.plugin.applyBodyClasses();
        }));

    new Setting(containerEl)
      .setName('Indent nested notes')
      .setDesc('Decorate mode: add a small left indent to nested (child) note rows.')
      .addToggle((tg) => tg
        .setValue(this.plugin.settings.indentChildren)
        .onChange(async (v) => {
          this.plugin.settings.indentChildren = v;
          await this.plugin.saveSettings();
          this.plugin.applyBodyClasses();
        }));

    containerEl.createEl('h4', { text: 'Reciprocal backlinks' });
    containerEl.createEl('p', {
      text: 'The one feature that writes to your notes. It maintains a marker-delimited "## Definitions" list on each origin note that links back down to its children (so the connection shows in the note body, its backlinks, and Graph view). Idempotent and self-healing; turning it off removes every managed block.',
      cls: 'setting-item-description',
    });

    new Setting(containerEl)
      .setName('Maintain a Definitions list on origin notes')
      .setDesc('Writes a marker-delimited block into each origin note. Fully reversible.')
      .addToggle((tg) => tg
        .setValue(this.plugin.settings.maintainBacklinks)
        .onChange(async (v) => {
          this.plugin.settings.maintainBacklinks = v;
          await this.plugin.saveSettings();
          if (v) { new Notice('Origin Nest: writing Definitions backlinks…'); this.plugin.scheduleBacklinkSync(); }
          else { new Notice('Origin Nest: removing Definitions backlinks…'); await this.plugin.removeAllBacklinks(); }
        }));

    new Setting(containerEl)
      .setName('Backlink section heading')
      .setDesc('The heading used for the managed list (default "Definitions").')
      .addText((t) => t
        .setPlaceholder('Definitions')
        .setValue(this.plugin.settings.backlinkHeading)
        .onChange(async (v) => {
          this.plugin.settings.backlinkHeading = (v || '').trim() || 'Definitions';
          await this.plugin.saveSettings();
          if (this.plugin.settings.maintainBacklinks) this.plugin.scheduleBacklinkSync();
        }));
  }
}

module.exports = OriginNestPlugin;
