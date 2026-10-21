"use strict";

// web-snapshot-store.js — content-addressed store for the web pages a business-lane run read
// (2026-10-21).
//
// A web page has no registry identifier, and it can change or vanish after the run. So the
// identifier IS the content: `WEB: <id>` where id = first 12 hex of sha256(url + "\n" + text) of the
// exact text the model was shown. That gives the web the two properties the citation gate relies
// on for PMIDs and NCTs:
//   • GROUNDING — the id appears in the evidence only if this run fetched and stored that page, so
//     a model-invented WEB id is ungrounded exactly like an invented PMID.
//   • RE-RESOLUTION — at delivery the re-resolver re-reads the stored snapshot and recomputes its
//     hash. A missing snapshot is UNRESOLVED (the run never read it); a hash mismatch is UNRESOLVED
//     (it was altered). What this proves is "this is exactly what was read, from this URL, at this
//     time" — NOT that the page is still live or that its content is correct. Copy must say that.
//
// Snapshots live under workspace/cache/web-snapshots/ (runtime state, not source). The packager
// copies the cited ones into the bundle so a buyer can read every web source the report used.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ID_RE = /^[0-9a-f]{12}$/;

function snapshotHash(url, text) {
  return crypto.createHash("sha256").update(`${String(url)}\n${String(text)}`, "utf8").digest("hex");
}

function createWebSnapshotStore(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const dir = options.dir || path.join(rootDir, "workspace", "cache", "web-snapshots");
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => "";

  function fileFor(id) {
    return path.join(dir, `${id}.json`);
  }

  /** Store a snapshot; returns its record (idempotent: same url+text → same id). */
  function put({ url, title, text }) {
    const sha256 = snapshotHash(url, text);
    const id = sha256.slice(0, 12);
    const record = {
      id,
      url: String(url),
      title: title ? String(title) : "",
      retrieved_at: nowIso(),
      sha256,
      text: String(text)
    };
    fs.mkdirSync(dir, { recursive: true });
    const file = fileFor(id);
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(record, null, 2), "utf8");
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }

  /** Read a snapshot by id; null when absent or unreadable. Never throws. */
  function get(id) {
    const key = String(id || "").toLowerCase();
    if (!ID_RE.test(key)) return null;
    try {
      return JSON.parse(fs.readFileSync(fileFor(key), "utf8"));
    } catch {
      return null;
    }
  }

  /**
   * Verify a snapshot: { status: "found" | "missing" | "altered", record }.
   * "altered" means the stored text no longer hashes to its id.
   */
  function verify(id) {
    const record = get(id);
    if (!record) return { status: "missing", record: null };
    const recomputed = snapshotHash(record.url, record.text);
    if (recomputed.slice(0, 12) !== String(id).toLowerCase() || recomputed !== record.sha256) {
      return { status: "altered", record };
    }
    return { status: "found", record };
  }

  return Object.freeze({ put, get, verify, dir });
}

module.exports = { createWebSnapshotStore, snapshotHash };
