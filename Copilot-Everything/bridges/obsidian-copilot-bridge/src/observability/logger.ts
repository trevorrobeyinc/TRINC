import fs from "node:fs";
import path from "node:path";

export type LogLevel = "error" | "warn" | "info" | "debug" | "trace";

const levelRank: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};

export class StructuredLogger {
  private readonly level: LogLevel;
  private readonly filePath: string;

  constructor(level: LogLevel, filePath: string) {
    this.level = level;
    this.filePath = path.resolve(filePath);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
  }

  log(level: LogLevel, message: string, fields: Record<string, unknown> = {}): void {
    if (levelRank[level] > levelRank[this.level]) {
      return;
    }

    const entry = {
      ts: new Date().toISOString(),
      level,
      message,
      ...fields,
    };

    const line = `${JSON.stringify(entry)}\n`;
    try {
      fs.appendFileSync(this.filePath, line);
    } catch (err) {
      try {
        process.stderr.write(`[logger] appendFileSync failed for ${this.filePath}: ${(err as Error).message}\n`);
        process.stderr.write(line);
      } catch {
        // last-resort: never throw out of log()
      }
    }
    if (levelRank[level] <= levelRank.info) {
      try {
        process.stdout.write(line);
      } catch {
        // never throw out of log()
      }
    }
  }

  error(message: string, fields?: Record<string, unknown>): void {
    this.log("error", message, fields);
  }

  warn(message: string, fields?: Record<string, unknown>): void {
    this.log("warn", message, fields);
  }

  info(message: string, fields?: Record<string, unknown>): void {
    this.log("info", message, fields);
  }

  debug(message: string, fields?: Record<string, unknown>): void {
    this.log("debug", message, fields);
  }

  trace(message: string, fields?: Record<string, unknown>): void {
    this.log("trace", message, fields);
  }
}
