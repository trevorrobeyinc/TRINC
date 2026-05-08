import type { App, EventRef } from "obsidian";

/**
 * Workspace event bus for VaultZK cross-plugin communication.
 *
 * Events (workspace trigger names = prefix + local name):
 *   vaultZK:analysis:complete   → {command, notePath, durationMs}
 *   vaultZK:health:updated      → VaultHealthScore
 *   vaultZK:pipeline:complete   → {steps, durationMs}
 */

const EVENT_PREFIX = "vaultZK:";

export class EventBus {
  private app: App;
  private listeners: Map<string, Set<(...args: unknown[]) => void>> = new Map();
  private refs: Map<string, Map<Function, EventRef>> = new Map();

  constructor(app: App) {
    this.app = app;
  }

  on(event: string, callback: (...args: unknown[]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    const ref = (this.app.workspace as any).on(EVENT_PREFIX + event, callback);
    if (!this.refs.has(event)) this.refs.set(event, new Map());
    this.refs.get(event)!.set(callback, ref);
  }

  off(event: string, callback: (...args: unknown[]) => void): void {
    this.listeners.get(event)?.delete(callback);
    const ref = this.refs.get(event)?.get(callback);
    if (ref) {
      this.app.workspace.offref(ref);
      this.refs.get(event)!.delete(callback);
    }
  }

  emit(event: string, data?: unknown): void {
    const cbs = this.listeners.get(event);
    if (cbs) {
      for (const cb of cbs) {
        try {
          cb(data);
        } catch (e) {
          console.error(`[VaultZK:EventBus] Error in listener for ${event}:`, e);
        }
      }
    }
    (this.app.workspace as any).trigger(EVENT_PREFIX + event, data);
  }

  destroy(): void {
    for (const [, refMap] of this.refs) {
      for (const [, ref] of refMap) {
        this.app.workspace.offref(ref);
      }
    }
    this.refs.clear();
    this.listeners.clear();
  }
}
