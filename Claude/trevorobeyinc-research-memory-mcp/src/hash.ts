/**
 * Markdown canonicalization + SHA-256 for dedupe.
 * Plan section: Phase 6 (Idempotency + migration).
 *
 * Invariant: same logical content → same hash, regardless of OS line endings,
 * trailing whitespace, or YAML front-matter timestamps.
 */
import { createHash } from "node:crypto";

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;
const TIMESTAMP_KEYS = /^(date|created|updated|modified|ingested_at|generated_at|timestamp):\s*.+$/im;

export function canonicalize(md: string): string {
  // 1. Normalize line endings.
  let s = md.replace(/\r\n?/g, "\n");

  // 2. Strip timestamp keys from YAML front-matter (preserve other front-matter).
  const fm = s.match(FRONTMATTER_RE);
  if (fm) {
    const cleaned = fm[1]
      .split("\n")
      .filter((line) => !TIMESTAMP_KEYS.test(line))
      .join("\n");
    s = s.replace(FRONTMATTER_RE, `---\n${cleaned}\n---\n`);
  }

  // 3. Trim trailing whitespace per line.
  s = s
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n");

  // 4. Collapse 3+ blank lines to 2.
  s = s.replace(/\n{3,}/g, "\n\n");

  // 5. Trim leading/trailing whitespace overall.
  return s.trim();
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

export function hashPack(md: string): string {
  return sha256Hex(canonicalize(md));
}
