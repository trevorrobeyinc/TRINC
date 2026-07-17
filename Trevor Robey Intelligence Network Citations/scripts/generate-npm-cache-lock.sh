#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE_DIR="$ROOT/.ci/npm-cache"
LOCK_PATH="$ROOT/security/npm-cache.lock.json"

node - "$CACHE_DIR" "$LOCK_PATH" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const cacheDir = process.argv[2];
const lockPath = process.argv[3];

function walk(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // content-v2-only trust anchor (2026-07-17): pin ONLY the content-addressed dependency
      // blobs under content-v2/ — their path IS their content sha512, so they are self-verifying
      // and byte-reproducible from the lockfile. index-v5 (npm's cache index) embeds install-time
      // timestamps and is therefore NOT reproducibly verifiable; tmp/_npx/_logs are volatile.
      // All are excluded from the integrity manifest (npm still uses them locally for offline install).
      if (entry.name === "_logs" || entry.name === "index-v5" || entry.name === "tmp" || entry.name === "_npx") {
        continue;
      }
      walk(abs, files);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (entry.name === "_update-notifier-last-checked") {
      continue;
    }
    if (entry.name.endsWith(".tmp")) {
      continue;
    }
    files.push(abs);
  }
  return files;
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const content = fs.readFileSync(filePath);
  hash.update(content);
  return hash.digest("hex");
}

fs.mkdirSync(path.dirname(lockPath), { recursive: true });
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

const files = walk(cacheDir).sort();
const manifestFiles = files.map((absPath) => {
  const relPath = path.relative(path.dirname(lockPath), absPath).replace(/\\/g, "/");
  const stat = fs.statSync(absPath);
  return {
    path: relPath,
    size: stat.size,
    sha256: sha256File(absPath),
  };
});

const manifestHash = crypto
  .createHash("sha256")
  .update(JSON.stringify(manifestFiles))
  .digest("hex");

const lock = {
  schemaVersion: 1,
  cacheRoot: ".ci/npm-cache",
  fileCount: manifestFiles.length,
  manifestSha256: manifestHash,
  files: manifestFiles,
};

fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
process.stdout.write(`npm cache lock written: ${lockPath}\n`);
NODE
