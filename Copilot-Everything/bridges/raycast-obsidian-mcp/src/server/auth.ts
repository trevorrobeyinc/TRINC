import { createHash, timingSafeEqual } from "node:crypto";
import { AppError } from "./errors";
import { ERROR_CODES } from "./errorCodes";

function hashToken(input: string): Buffer {
  return createHash("sha256").update(input, "utf8").digest();
}

export function verifyAuthToken(expectedToken: string, providedToken: string | undefined): void {
  if (!providedToken) {
    throw new AppError(ERROR_CODES.AUTH_INVALID, "Missing MCP authentication token.");
  }
  const expected = hashToken(expectedToken);
  const provided = hashToken(providedToken);

  if (!timingSafeEqual(expected, provided)) {
    throw new AppError(ERROR_CODES.AUTH_INVALID, "Invalid MCP authentication token.");
  }
}
