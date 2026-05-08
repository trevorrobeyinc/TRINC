import path from "node:path";
import type { Operation } from "../types";
import { AppError } from "../server/errors";
import { ERROR_CODES } from "../server/errorCodes";

const allowedOperationKeys: Record<Operation, string[]> = {
  open_vault: ["vault", "path", "paneType"],
  create_note: ["vault", "name", "path", "content", "template", "overwrite", "open", "newtab"],
  append_note: ["vault", "path", "file", "content", "inline"],
  read_note: ["vault", "path", "file"],
  search_notes: ["vault", "query", "path", "limit", "format", "total", "case"],
  execute_command: ["vault", "id"],
};

const commandByOperation: Record<Operation, string> = {
  open_vault: "open",
  create_note: "create",
  append_note: "append",
  read_note: "read",
  search_notes: "search",
  execute_command: "command",
};

function toArgValue(value: unknown): string {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string") {
    return value.replace(/\r\n/g, "\n").replace(/\n/g, "\\n");
  }
  throw new AppError(ERROR_CODES.PATH_INVALID, "Unsupported argument value type.");
}

export function buildArgs(operation: Operation, input: Record<string, unknown>): string[] {
  const command = commandByOperation[operation];
  const allowed = new Set(allowedOperationKeys[operation]);
  const args: string[] = [command];

  const vault = input.vault;
  if (typeof vault === "string" && vault.trim()) {
    args.unshift(`vault=${vault}`);
  }

  if (
    (operation === "append_note" || operation === "read_note") &&
    typeof input.file !== "string" &&
    typeof input.path === "string" &&
    input.path.trim()
  ) {
    args.push(`file=${toArgValue(path.posix.basename(input.path))}`);
  }

  for (const [key, value] of Object.entries(input)) {
    if (key === "vault" || value === undefined || value === null) {
      continue;
    }
    if (!allowed.has(key)) {
      continue;
    }

    if (typeof value === "boolean") {
      if (value) {
        args.push(key);
      }
      continue;
    }

    args.push(`${key}=${toArgValue(value)}`);
  }

  if (operation === "search_notes" && !args.some((arg) => arg.startsWith("format="))) {
    args.push("format=json");
  }

  return args;
}
