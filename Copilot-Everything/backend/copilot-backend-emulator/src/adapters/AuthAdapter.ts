import type { FastifyRequest } from "fastify";
import type { EmulatorEnv } from "../config/env.js";

interface AuthorizationOptions {
  allowApiKeyHeader?: boolean;
  allowAnyBearerHeader?: boolean;
}

export class AuthAdapter {
  constructor(private readonly env: EmulatorEnv) {}

  assertAuthorized(request: FastifyRequest, options: AuthorizationOptions = {}): void {
    if (!this.env.SELF_HOST_API_KEY) {
      return;
    }

    const authHeader = request.headers.authorization;
    const expected = `Bearer ${this.env.SELF_HOST_API_KEY}`;
    const xApiKeyHeader = this.getFirstHeaderValue(request.headers["x-api-key"]);
    const isAuthorized =
      authHeader === expected ||
      (options.allowAnyBearerHeader === true && this.hasAnyBearerHeader(authHeader)) ||
      (options.allowApiKeyHeader === true && xApiKeyHeader === this.env.SELF_HOST_API_KEY);
    if (!isAuthorized) {
      throw new Error("Invalid self-host authorization token.");
    }
  }

  private hasAnyBearerHeader(value: string | undefined): boolean {
    if (!value) {
      return false;
    }

    const trimmed = value.trim();
    return trimmed.startsWith("Bearer ") && trimmed.length > "Bearer ".length;
  }

  private getFirstHeaderValue(
    value: string | string[] | undefined
  ): string | undefined {
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  }
}
