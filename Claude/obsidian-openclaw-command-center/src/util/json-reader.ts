import { readFileSync, existsSync } from "fs";

/**
 * Safely read and parse a JSON file. Returns null if the file
 * doesn't exist, is empty, or contains invalid JSON.
 */
export function readJsonFile<T>(filePath: string): T | null {
  try {
    if (!existsSync(filePath)) return null;
    const raw = readFileSync(filePath, "utf8").trim();
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
