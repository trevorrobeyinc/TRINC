import { AppError } from "../server/errors";
import { ERROR_CODES } from "../server/errorCodes";

function extractJsonCandidate(input: string): string | null {
  const chars = [...input];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch !== "{" && ch !== "[") {
      continue;
    }

    const open = ch;
    const close = ch === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let j = i; j < chars.length; j++) {
      const c = chars[j];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (c === "\\") {
          escaped = true;
          continue;
        }
        if (c === '"') {
          inString = false;
        }
        continue;
      }

      if (c === '"') {
        inString = true;
        continue;
      }
      if (c === open) {
        depth += 1;
      } else if (c === close) {
        depth -= 1;
        if (depth === 0) {
          return chars.slice(i, j + 1).join("");
        }
      }
    }
  }

  return null;
}

export function parseJsonFromNoisyStdout(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const candidate = extractJsonCandidate(trimmed);
    if (!candidate) {
      throw new AppError(ERROR_CODES.CLI_OUTPUT_INVALID, "CLI output did not contain valid JSON.", false, {
        stdoutTail: trimmed.slice(-400),
      });
    }

    try {
      return JSON.parse(candidate);
    } catch (error) {
      throw new AppError(ERROR_CODES.CLI_OUTPUT_INVALID, "Failed to parse JSON extracted from CLI output.", false, {
        error: String(error),
        stdoutTail: trimmed.slice(-400),
      });
    }
  }
}
