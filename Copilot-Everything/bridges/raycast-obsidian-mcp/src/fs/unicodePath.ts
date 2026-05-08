export function normalizeUnicodePath(input: string): string {
  return input.normalize("NFC");
}

export function containsIllegalPathChars(input: string): boolean {
  for (const ch of input) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code === 127) {
      return true;
    }
  }
  return false;
}
