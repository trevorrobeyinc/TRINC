import path from "node:path";

export function normalizeWindowsPathForCompare(input: string): string {
  return input
    .normalize("NFC")
    .replace(/\\/g, "/")
    .replace(/^([A-Z]):/, (m) => m.toLowerCase())
    .replace(/\/+$/, "")
    .toLowerCase();
}

export function hasWindowsAdsOrUncPattern(input: string): boolean {
  const normalized = input.replace(/\\/g, "/");
  if (normalized.startsWith("//") || normalized.startsWith("\\\\") || normalized.startsWith("\\\\?\\") || normalized.startsWith("//?/")) {
    return true;
  }
  const base = path.basename(normalized);
  return /:[^/]+$/.test(base);
}

export function isCaseInsensitivePathPlatform(platform: NodeJS.Platform): boolean {
  return platform === "win32" || platform === "darwin";
}
