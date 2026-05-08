import { spawn } from "node:child_process";
import { AppError } from "../server/errors";
import { ERROR_CODES } from "../server/errorCodes";
import type { BackendResult } from "../types";

export interface CliRunInput {
  binary: string;
  args: string[];
  timeoutMs: number;
  env?: Record<string, string>;
  cwd?: string;
}

export async function runCli(input: CliRunInput): Promise<BackendResult> {
  const started = Date.now();

  return await new Promise<BackendResult>((resolve, reject) => {
    const child = spawn(input.binary, input.args, {
      shell: false,
      windowsHide: true,
      cwd: input.cwd,
      env: {
        ...process.env,
        ...input.env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let killedForTimeout = false;

    const timeout = setTimeout(() => {
      killedForTimeout = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1_000).unref();
    }, input.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > 8 * 1024 * 1024) {
        stdout = stdout.slice(-8 * 1024 * 1024);
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 8 * 1024 * 1024) {
        stderr = stderr.slice(-8 * 1024 * 1024);
      }
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new AppError(ERROR_CODES.CLI_NOT_FOUND, `Obsidian CLI binary not found: ${input.binary}`));
        return;
      }
      reject(new AppError(ERROR_CODES.CLI_EXIT_NONZERO, `Failed to execute CLI process: ${error.message}`, true));
    });

    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      const durationMs = Date.now() - started;
      if (killedForTimeout) {
        reject(
          new AppError(ERROR_CODES.CLI_TIMEOUT, "Obsidian CLI command timed out.", true, {
            timeoutMs: input.timeoutMs,
            args: input.args,
          })
        );
        return;
      }

      if (code !== 0) {
        reject(
          new AppError(ERROR_CODES.CLI_EXIT_NONZERO, "Obsidian CLI command failed.", true, {
            exitCode: code,
            signal,
            stderrTail: stderr.slice(-500),
            stdoutTail: stdout.slice(-500),
            args: input.args,
          })
        );
        return;
      }

      resolve({
        statusCode: code ?? 0,
        stdout,
        stderr,
        durationMs,
      });
    });
  });
}
