import type { ConsoleEntry, ConsoleLevel, ErrorEntry } from "./types";

/**
 * In-renderer ring buffers for renderer console output and uncaught errors.
 * Hooks `window.console.{log,info,warn,error,debug}`, `window.onerror`,
 * and `window.addEventListener('unhandledrejection')` so the bridge can
 * surface a recent slice on demand without CDP.
 *
 * Original console methods are preserved and called through — we only
 * append to the buffer, never swallow output.
 */
export class ConsoleCapture {
  private logs: ConsoleEntry[] = [];
  private errors: ErrorEntry[] = [];
  private logCapacity: number;
  private errorCapacity: number;
  private totalLogsSeen = 0;
  private totalErrorsSeen = 0;
  private installed = false;
  private originals: Partial<Record<ConsoleLevel, (...args: unknown[]) => void>> = {};
  private errorListener: ((ev: ErrorEvent) => void) | null = null;
  private rejectionListener: ((ev: PromiseRejectionEvent) => void) | null = null;

  constructor(logCapacity: number, errorCapacity: number) {
    this.logCapacity = logCapacity;
    this.errorCapacity = errorCapacity;
  }

  install(): void {
    if (this.installed) return;
    this.installed = true;
    const levels: ConsoleLevel[] = ["log", "info", "warn", "error", "debug"];
    for (const level of levels) {
      const orig = (console as unknown as Record<string, (...args: unknown[]) => void>)[level];
      if (typeof orig !== "function") continue;
      this.originals[level] = orig.bind(console);
      (console as unknown as Record<string, (...args: unknown[]) => void>)[level] = (...args: unknown[]) => {
        try {
          this.pushLog(level, args);
        } catch {
          // never break original logging
        }
        this.originals[level]!(...args);
      };
    }
    this.errorListener = (ev: ErrorEvent) => {
      this.pushError({
        ts: Date.now(),
        message: ev.message ?? String(ev.error ?? "unknown error"),
        stack: ev.error instanceof Error ? ev.error.stack : undefined,
        source: ev.filename,
        lineno: ev.lineno,
        colno: ev.colno,
        kind: "error",
      });
    };
    this.rejectionListener = (ev: PromiseRejectionEvent) => {
      const reason = ev.reason;
      this.pushError({
        ts: Date.now(),
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
        kind: "unhandledrejection",
      });
    };
    window.addEventListener("error", this.errorListener);
    window.addEventListener("unhandledrejection", this.rejectionListener);
  }

  uninstall(): void {
    if (!this.installed) return;
    this.installed = false;
    for (const [level, orig] of Object.entries(this.originals)) {
      (console as unknown as Record<string, (...args: unknown[]) => void>)[level] = orig;
    }
    this.originals = {};
    if (this.errorListener) window.removeEventListener("error", this.errorListener);
    if (this.rejectionListener) window.removeEventListener("unhandledrejection", this.rejectionListener);
    this.errorListener = null;
    this.rejectionListener = null;
  }

  private pushLog(level: ConsoleLevel, args: unknown[]): void {
    this.totalLogsSeen += 1;
    const entry: ConsoleEntry = {
      level,
      ts: Date.now(),
      message: this.formatArgs(args),
    };
    this.logs.push(entry);
    if (this.logs.length > this.logCapacity) {
      this.logs.splice(0, this.logs.length - this.logCapacity);
    }
  }

  private pushError(entry: ErrorEntry): void {
    this.totalErrorsSeen += 1;
    this.errors.push(entry);
    if (this.errors.length > this.errorCapacity) {
      this.errors.splice(0, this.errors.length - this.errorCapacity);
    }
  }

  private formatArgs(args: unknown[]): string {
    return args
      .map((a) => {
        if (a instanceof Error) return a.stack ?? `${a.name}: ${a.message}`;
        if (typeof a === "string") return a;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(" ");
  }

  getLogs(opts: { levels?: ConsoleLevel[]; limit?: number; sinceMs?: number }): {
    entries: ConsoleEntry[];
    totalCaptured: number;
    bufferCapacity: number;
  } {
    let filtered = this.logs;
    if (opts.levels && opts.levels.length > 0) {
      const set = new Set(opts.levels);
      filtered = filtered.filter((e) => set.has(e.level));
    }
    if (typeof opts.sinceMs === "number") {
      filtered = filtered.filter((e) => e.ts >= opts.sinceMs!);
    }
    if (typeof opts.limit === "number" && opts.limit > 0) {
      filtered = filtered.slice(-opts.limit);
    }
    return {
      entries: filtered,
      totalCaptured: this.totalLogsSeen,
      bufferCapacity: this.logCapacity,
    };
  }

  getErrors(opts: { limit?: number; sinceMs?: number }): {
    entries: ErrorEntry[];
    totalCaptured: number;
    bufferCapacity: number;
  } {
    let filtered = this.errors;
    if (typeof opts.sinceMs === "number") {
      filtered = filtered.filter((e) => e.ts >= opts.sinceMs!);
    }
    if (typeof opts.limit === "number" && opts.limit > 0) {
      filtered = filtered.slice(-opts.limit);
    }
    return {
      entries: filtered,
      totalCaptured: this.totalErrorsSeen,
      bufferCapacity: this.errorCapacity,
    };
  }
}
