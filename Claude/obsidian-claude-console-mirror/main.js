'use strict';

const { Plugin } = require('obsidian');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const LOG_FILE = path.join(os.homedir(), '.claude', 'logs', 'obsidian-console.jsonl');
const MAX_LOG_BYTES = 10 * 1024 * 1024; // rotate at 10MB — the log otherwise grows unbounded

function ensureDir() {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  } catch (_) {}
}

function rotateIfHuge() {
  // Keep exactly one previous generation (LOG_FILE.1); rename replaces it.
  try {
    const st = fs.statSync(LOG_FILE);
    if (st.size > MAX_LOG_BYTES) {
      fs.renameSync(LOG_FILE, LOG_FILE + '.1');
    }
  } catch (_) {}
}

function safeStringify(value) {
  try {
    if (value instanceof Error) {
      return JSON.stringify({ name: value.name, message: value.message, stack: value.stack });
    }
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value, (_k, v) =>
        v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v
      );
    }
    return JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
}

function appendLine(entry) {
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf-8');
  } catch (_) {
    // never crash the renderer
  }
}

class ClaudeConsoleMirrorPlugin extends Plugin {
  async onload() {
    ensureDir();
    rotateIfHuge();

    if (window.__claudeConsoleMirrorInstalled) {
      return;
    }

    const wrap = (level, original) =>
      function (...args) {
        try {
          appendLine({
            ts: new Date().toISOString(),
            source: 'obsidian-console',
            level,
            args: args.map(safeStringify),
          });
        } catch (_) {}
        return original.apply(this, args);
      };

    const origLog = console.log.bind(console);
    const origWarn = console.warn.bind(console);
    const origError = console.error.bind(console);
    console.log = wrap('log', origLog);
    console.warn = wrap('warn', origWarn);
    console.error = wrap('error', origError);
    this._origConsole = { log: origLog, warn: origWarn, error: origError };

    this._onWindowError = (event) => {
      appendLine({
        ts: new Date().toISOString(),
        source: 'obsidian-window-error',
        level: 'error',
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error && event.error.stack ? event.error.stack : null,
      });
    };

    this._onUnhandledRejection = (event) => {
      const reason = event.reason;
      appendLine({
        ts: new Date().toISOString(),
        source: 'obsidian-unhandled-rejection',
        level: 'error',
        reason:
          reason instanceof Error
            ? { name: reason.name, message: reason.message, stack: reason.stack }
            : safeStringify(reason),
      });
    };

    window.addEventListener('error', this._onWindowError);
    window.addEventListener('unhandledrejection', this._onUnhandledRejection);

    window.__claudeConsoleMirrorInstalled = true;
    appendLine({
      ts: new Date().toISOString(),
      source: 'plugin-lifecycle',
      level: 'info',
      message: 'claude-console-mirror loaded',
    });
    origLog('[ClaudeConsoleMirror] installed → ~/.claude/logs/obsidian-console.jsonl');
  }

  onunload() {
    try {
      window.removeEventListener('error', this._onWindowError);
      window.removeEventListener('unhandledrejection', this._onUnhandledRejection);
      if (this._origConsole) {
        console.log = this._origConsole.log;
        console.warn = this._origConsole.warn;
        console.error = this._origConsole.error;
      }
      window.__claudeConsoleMirrorInstalled = false;
      appendLine({
        ts: new Date().toISOString(),
        source: 'plugin-lifecycle',
        level: 'info',
        message: 'claude-console-mirror unloaded',
      });
    } catch (_) {}
  }
}

module.exports = ClaudeConsoleMirrorPlugin;
