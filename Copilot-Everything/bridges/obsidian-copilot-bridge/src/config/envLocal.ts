/**
 * .env.local loader (no external dependency).
 *
 * The bridge daemon is spawned as a child process by the obsidian-bridge-launcher
 * Obsidian plugin, which inherits Obsidian's environment but does NOT auto-source
 * `.env.local`. Without this loader, secrets like OBSIDIAN_REST_API_KEY would only
 * be available when the daemon is launched manually from a shell that already
 * sourced the file.
 *
 * Usage: import this module at the very top of src/index.ts, BEFORE any other
 * import that reads process.env at module-load time.
 *
 * Format supported:
 *   - One KEY=VALUE per line
 *   - Lines starting with `#` are comments
 *   - Blank lines ignored
 *   - VALUE may be wrapped in single or double quotes (stripped on load)
 *   - No expansion, no multi-line values, no $VAR interpolation
 *
 * Existing process.env values are NOT overridden — explicit env wins over file.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_ENV_LOCAL_PATH = resolve(__dirname, "..", "..", ".env.local");

export function loadEnvLocal(envFilePath: string = DEFAULT_ENV_LOCAL_PATH): {
  loaded: boolean;
  path: string;
  count: number;
} {
  if (!existsSync(envFilePath)) {
    return { loaded: false, path: envFilePath, count: 0 };
  }

  const raw = readFileSync(envFilePath, "utf8");
  let count = 0;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
      count += 1;
    }
  }

  return { loaded: true, path: envFilePath, count };
}
