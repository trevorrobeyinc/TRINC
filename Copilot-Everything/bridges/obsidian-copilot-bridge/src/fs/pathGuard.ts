import fs from "node:fs";
import path from "node:path";
import { AppError } from "../server/errors";
import { ERROR_CODES } from "../server/errorCodes";
import { containsIllegalPathChars, normalizeUnicodePath } from "./unicodePath";
import {
  hasWindowsAdsOrUncPattern,
  isCaseInsensitivePathPlatform,
  normalizeWindowsPathForCompare,
} from "./windowsPathSafety";

function safeRelative(input: string): string {
  const normalized = normalizeUnicodePath(input).replace(/\\/g, "/").trim();
  if (
    !normalized ||
    normalized === "." ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.includes("\0")
  ) {
    throw new AppError(ERROR_CODES.PATH_INVALID, "Path must be vault-relative and non-empty.");
  }
  if (containsIllegalPathChars(normalized)) {
    throw new AppError(ERROR_CODES.PATH_INVALID, "Path contains illegal control characters.");
  }
  if (normalized.split("/").some((segment) => segment === "" || segment.startsWith("."))) {
    throw new AppError(ERROR_CODES.PATH_INVALID, "Path traversal or dot-segments (e.g. .obsidian) are not allowed.");
  }
  if (process.platform === "win32" && hasWindowsAdsOrUncPattern(normalized)) {
    throw new AppError(ERROR_CODES.PATH_INVALID, "UNC paths and alternate data streams are not allowed.");
  }
  return normalized;
}

function normalizeForCompare(input: string): string {
  const normalized = normalizeUnicodePath(input);
  if (isCaseInsensitivePathPlatform(process.platform)) {
    return normalizeWindowsPathForCompare(normalized);
  }
  return normalized.replace(/\\/g, "/").replace(/\/+$/, "");
}

function containsPath(root: string, candidate: string): boolean {
  const r = normalizeForCompare(root);
  const c = normalizeForCompare(candidate);
  return c === r || c.startsWith(`${r}/`);
}

function canonicalizeCandidate(rootReal: string, candidate: string): string {
  const rel = path.relative(rootReal, candidate);
  const segments = rel.split(path.sep).filter(Boolean);
  let current = rootReal;

  for (const segment of segments) {
    const next = path.join(current, segment);
    if (fs.existsSync(next)) {
      const stat = fs.lstatSync(next);
      const resolved = stat.isSymbolicLink() ? fs.realpathSync.native(next) : next;
      if (!containsPath(rootReal, resolved)) {
        throw new AppError(ERROR_CODES.PATH_OUTSIDE_VAULT, "Resolved path escapes the configured vault root.", false, {
          vaultRoot: rootReal,
          resolved,
        });
      }
      current = resolved;
      continue;
    }

    current = next;
    if (!containsPath(rootReal, current)) {
      throw new AppError(ERROR_CODES.PATH_OUTSIDE_VAULT, "Resolved path escapes the configured vault root.", false, {
        vaultRoot: rootReal,
        resolved: current,
      });
    }
  }

  if (fs.existsSync(current)) {
    const real = fs.realpathSync.native(current);
    if (!containsPath(rootReal, real)) {
      throw new AppError(ERROR_CODES.PATH_OUTSIDE_VAULT, "Resolved path escapes the configured vault root.", false, {
        vaultRoot: rootReal,
        resolved: real,
      });
    }
    return real;
  }

  return current;
}

export interface GuardedPath {
  vaultRoot: string;
  relativePath: string;
  absolutePath: string;
}

export function guardVaultRelativePath(vaultRoot: string, relativePath: string): GuardedPath {
  if (!path.isAbsolute(vaultRoot)) {
    throw new AppError(ERROR_CODES.VAULT_NOT_FOUND, "Vault root must be absolute.");
  }

  const rootReal = normalizeUnicodePath(fs.realpathSync.native(vaultRoot));
  const rel = safeRelative(relativePath);
  const resolved = path.resolve(rootReal, rel);
  const canonical = canonicalizeCandidate(rootReal, resolved);

  if (!containsPath(rootReal, canonical)) {
    throw new AppError(ERROR_CODES.PATH_OUTSIDE_VAULT, "Resolved path escapes the configured vault root.", false, {
      vaultRoot: rootReal,
      relativePath: rel,
      resolved: canonical,
    });
  }

  return {
    vaultRoot: rootReal,
    relativePath: rel,
    absolutePath: canonical,
  };
}

export function revalidateGuardedPath(guardedPath: GuardedPath): GuardedPath {
  return guardVaultRelativePath(guardedPath.vaultRoot, guardedPath.relativePath);
}
