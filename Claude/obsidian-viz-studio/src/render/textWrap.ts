import { estimateTextWidth } from "./svgUtils";

/**
 * Greedy word wrap against the same width estimator the charts use. Long words
 * that exceed the line budget on their own are hard-split so a URL or an
 * identifier can never overflow the card.
 */
export function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  const words = String(text).replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (estimateTextWidth(candidate, fontSize) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (estimateTextWidth(word, fontSize) <= maxWidth) {
      current = word;
      continue;
    }
    // Word alone is too wide — hard-split it.
    let chunk = "";
    for (const ch of word) {
      if (estimateTextWidth(chunk + ch, fontSize) > maxWidth && chunk) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk += ch;
      }
    }
    current = chunk;
  }
  if (current) lines.push(current);
  return lines;
}
