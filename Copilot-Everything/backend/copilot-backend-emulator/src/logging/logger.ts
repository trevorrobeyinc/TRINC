import pino from "pino";

export function createLogger(verbose: boolean) {
  return pino({
    level: verbose ? "debug" : "info",
    base: undefined,
    redact: {
      paths: ["req.headers.authorization", "headers.authorization", "model.apiKey"],
      censor: "[REDACTED]",
    },
  });
}
