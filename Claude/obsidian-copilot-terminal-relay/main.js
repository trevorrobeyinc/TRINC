"use strict";

/**
 * TR-Obsidian Copilot Terminal Relay
 *
 * Bridges the Copilot agent to the Terminal plugin (polyipseity) inside Obsidian.
 *
 * Flow: the agent writes a command into an inbox note (it already has vault-write tools),
 * then invokes this plugin's parameterless command via obsidian_execute_command. The relay
 * reads the pending command and TYPES it into the terminal pane.
 *
 * SECURITY BOUNDARY — the reason this plugin exists in this shape:
 * `term-bridge` (a shared-tmux MCP exec surface) was retired 2026-07-28 after a re-audit named
 * autonomous shell exec the sharpest agent escape primitive. This relay is deliberately NOT that:
 * every newline is stripped from the payload before it reaches the terminal, so the relay has no
 * code path that can submit a command. The operator's Return key is the execution gate. Do not
 * add an auto-execute option — that would recreate the retired primitive.
 *
 * No build step: this file IS the source (same convention as contextual-wiki-definitions).
 */

const { Plugin, PluginSettingTab, Setting, Notice, TFile } = require("obsidian");

const DEFAULT_SETTINGS = Object.freeze({
  inboxPath: "copilot/terminal-inbox.md",
});

/** Max characters accepted from the inbox — a staged shell command, not a document. */
const MAX_COMMAND_LENGTH = 2000;

/**
 * Pull the staged command out of the inbox note. A fenced block wins (that is how a model
 * naturally writes a command); otherwise the last non-empty, non-heading line is used.
 */
function extractCommand(raw) {
  if (typeof raw !== "string") return "";

  const fenced = [...raw.matchAll(/```[a-zA-Z]*\s*\n([\s\S]*?)```/g)];
  if (fenced.length > 0) {
    const body = fenced[fenced.length - 1][1] ?? "";
    const line = body
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .pop();
    if (line) return line;
  }

  return (
    raw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith(">"))
      .pop() ?? ""
  );
}

/**
 * Strip everything that could submit the command. Newlines and carriage returns are removed
 * outright rather than escaped: this is the guarantee that the relay can only ever type.
 */
function sanitize(command) {
  return command.replace(/[\r\n\u2028\u2029]+/g, " ").trim();
}

/** Open terminal views, newest last. Matched by view type so no Terminal-plugin internals are assumed. */
function findTerminalViews(app) {
  const views = [];
  app.workspace.iterateAllLeaves((leaf) => {
    const view = leaf?.view;
    if (!view) return;
    let type = "";
    try {
      type = typeof view.getViewType === "function" ? view.getViewType() : "";
    } catch {
      return;
    }
    if (typeof type === "string" && type.toLowerCase().includes("terminal")) views.push(view);
  });
  return views;
}

/**
 * Locate the xterm.js Terminal owned by a view. Identified structurally — an object exposing both
 * `paste` and `write` — so a Terminal-plugin refactor or version bump does not break this.
 */
function findXterm(root, depth, seen) {
  if (!root || typeof root !== "object" || depth > 4 || seen.has(root)) return null;
  seen.add(root);
  if (typeof root.paste === "function" && typeof root.write === "function") return root;
  for (const key of Object.keys(root)) {
    let value;
    try {
      value = root[key];
    } catch {
      continue;
    }
    // A view holds its DOM subtree; descending into it is expensive and never finds the instance.
    if (typeof Node !== "undefined" && value instanceof Node) continue;
    const found = findXterm(value, depth + 1, seen);
    if (found) return found;
  }
  return null;
}

/**
 * Fallback path when the xterm instance is not reachable through enumerable properties (e.g. it
 * lives in a private field): xterm renders a helper textarea that turns a paste event into PTY
 * input, which is the same "type, do not submit" semantics.
 */
function pasteViaDom(view, text) {
  const textarea = view?.containerEl?.querySelector?.("textarea.xterm-helper-textarea");
  if (!textarea) return false;
  const transfer = new DataTransfer();
  transfer.setData("text/plain", text);
  textarea.focus();
  return textarea.dispatchEvent(
    new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true })
  );
}

module.exports = class CopilotTerminalRelay extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.addSettingTab(new CopilotTerminalRelaySettingTab(this.app, this));

    // Parameterless by necessity: obsidian_execute_command (the agent's only command-invoking
    // tool) passes no arguments, which is why the payload travels through the inbox note.
    this.addCommand({
      id: "send-to-terminal",
      name: "Send pending command to terminal",
      callback: () => void this.relayPendingCommand(),
    });

    this.addRibbonIcon("terminal", "Send pending Copilot command to terminal", () =>
      void this.relayPendingCommand()
    );
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  /** Read the inbox, then type its command into the newest terminal pane. Never submits it. */
  async relayPendingCommand() {
    const path = this.settings.inboxPath;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      new Notice(`Terminal relay: no inbox note at "${path}".`);
      return;
    }

    const command = sanitize(extractCommand(await this.app.vault.cachedRead(file)));
    if (!command) {
      new Notice("Terminal relay: the inbox note holds no command.");
      return;
    }
    if (command.length > MAX_COMMAND_LENGTH) {
      new Notice(`Terminal relay: command exceeds ${MAX_COMMAND_LENGTH} characters; not sent.`);
      return;
    }

    const views = findTerminalViews(this.app);
    if (views.length === 0) {
      new Notice("Terminal relay: open a terminal first (Terminal: Open root directory in terminal).");
      return;
    }

    const view = views[views.length - 1];
    const xterm = findXterm(view, 0, new Set());
    let delivered = false;
    if (xterm) {
      try {
        xterm.paste(command);
        delivered = true;
      } catch {
        delivered = false;
      }
    }
    if (!delivered) delivered = pasteViaDom(view, command);

    if (!delivered) {
      new Notice("Terminal relay: could not reach the terminal input.");
      return;
    }

    this.app.workspace.revealLeaf?.(view.leaf);
    new Notice(`Staged in terminal — press Return to run:\n${command}`, 8000);
  }
};

class CopilotTerminalRelaySettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Inbox note")
      .setDesc("Vault path the agent writes the command to before invoking the relay.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.inboxPath)
          .setValue(this.plugin.settings.inboxPath)
          .onChange(async (value) => {
            this.plugin.settings.inboxPath = value.trim() || DEFAULT_SETTINGS.inboxPath;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("p", {
      text:
        "The relay types the command into the terminal and stops there — it strips newlines, so " +
        "it cannot submit anything. Press Return yourself to run it.",
    });
  }
}
