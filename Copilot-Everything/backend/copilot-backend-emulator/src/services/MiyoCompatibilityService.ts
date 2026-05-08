import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodError, type ZodType } from "zod";
import { MiyoCompatibilityClient, type MiyoForwardResponse } from "../adapters/MiyoCompatibilityClient.js";

export class MiyoCompatibilityService {
  constructor(private readonly client: MiyoCompatibilityClient) {}

  async forwardGet(
    routePath: string,
    request: FastifyRequest,
    reply: FastifyReply,
    querySchema?: ZodType,
    responseSchema?: ZodType
  ): Promise<void> {
    try {
      const parsedQuery = querySchema ? this.parseSchema(querySchema, request.query) : undefined;
      const downstream = await this.client.forward({
        method: "GET",
        routePath,
        query: parsedQuery as Record<string, string | number | boolean | undefined> | undefined,
        incomingAuthorization: request.headers.authorization,
        incomingApiKey: this.getHeaderValue(request.headers["x-api-key"]),
      });

      if (downstream.status < 400 && responseSchema) {
        try {
          responseSchema.parse(downstream.body);
        } catch (error) {
          this.sendInvalidDownstreamResponse(routePath, reply, error);
          return;
        }
      }
      this.sendForwardedResponse(downstream, reply);
    } catch (error) {
      this.sendError(routePath, reply, error);
    }
  }

  async forwardJson(
    method: "POST" | "DELETE",
    routePath: string,
    request: FastifyRequest,
    reply: FastifyReply,
    requestSchema: ZodType,
    responseSchema?: ZodType
  ): Promise<void> {
    try {
      const parsedBody = this.parseSchema(requestSchema, request.body);
      const downstream = await this.client.forward({
        method,
        routePath,
        body: parsedBody,
        incomingAuthorization: request.headers.authorization,
        incomingApiKey: this.getHeaderValue(request.headers["x-api-key"]),
      });

      if (downstream.status < 400 && responseSchema) {
        try {
          responseSchema.parse(downstream.body);
        } catch (error) {
          this.sendInvalidDownstreamResponse(routePath, reply, error);
          return;
        }
      }

      this.sendForwardedResponse(downstream, reply);
    } catch (error) {
      this.sendError(routePath, reply, error);
    }
  }

  private parseSchema(schema: ZodType, value: unknown): unknown {
    return schema.parse(value);
  }

  private sendForwardedResponse(downstream: MiyoForwardResponse, reply: FastifyReply): void {
    reply.code(downstream.status);
    if (downstream.contentType) {
      reply.type(downstream.contentType);
    }
    reply.send(downstream.body);
  }

  private sendInvalidDownstreamResponse(
    routePath: string,
    reply: FastifyReply,
    error: unknown
  ): void {
    const message =
      error instanceof ZodError
        ? error.issues.map((issue) => issue.message).join("; ")
        : "unknown validation error";
    reply.code(502).send({
      ok: false,
      error: {
        code: "miyo_response_invalid",
        message: `Downstream Miyo response for '${routePath}' did not match the documented compatibility contract: ${message}`,
        retryable: false,
      },
    });
  }

  private sendError(routePath: string, reply: FastifyReply, error: unknown): void {
    if (error instanceof ZodError) {
      reply.code(400).send({
        ok: false,
        error: {
          code: "invalid_request",
          message: `Compatibility request for '${routePath}' did not match the documented contract.`,
          retryable: false,
          details: error.issues,
        },
      });
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    reply.code(502).send({
      ok: false,
      error: {
        code: "miyo_unavailable",
        message: `Failed to reach the downstream Miyo service for '${routePath}': ${message}`,
        retryable: true,
      },
    });
  }

  private getHeaderValue(value: string | string[] | undefined): string | undefined {
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  }
}
