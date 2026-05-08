import type { FastifyInstance } from "fastify";
import {
  zettelkastenCommandRequestSchema,
  zettelkastenPipelineRequestSchema,
} from "../types/zettelkasten.js";
import type { ZettelkastenService } from "../services/ZettelkastenService.js";
import type { AuthAdapter } from "../adapters/AuthAdapter.js";

export async function registerZettelkastenRoutes(
  app: FastifyInstance,
  authAdapter: AuthAdapter,
  zettelkastenService: ZettelkastenService
): Promise<void> {
  app.post("/v1/self-host/zettelkasten/serendipity", async (request, reply) => {
    try {
      authAdapter.assertAuthorized(request);
      const parsed = zettelkastenCommandRequestSchema.parse(request.body);
      return await zettelkastenService.serendipity(parsed);
    } catch (error) {
      reply.code(400);
      return {
        ok: false,
        command: "serendipity",
        error: {
          code: "zettelkasten_failed",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  });

  app.post("/v1/self-host/zettelkasten/cross-domain", async (request, reply) => {
    try {
      authAdapter.assertAuthorized(request);
      const parsed = zettelkastenCommandRequestSchema.parse(request.body);
      return await zettelkastenService.crossDomain(parsed);
    } catch (error) {
      reply.code(400);
      return {
        ok: false,
        command: "cross-domain",
        error: {
          code: "zettelkasten_failed",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  });

  app.post("/v1/self-host/zettelkasten/echo-chamber", async (request, reply) => {
    try {
      authAdapter.assertAuthorized(request);
      const parsed = zettelkastenCommandRequestSchema.parse(request.body);
      return await zettelkastenService.echoChamber(parsed);
    } catch (error) {
      reply.code(400);
      return {
        ok: false,
        command: "echo-chamber",
        error: {
          code: "zettelkasten_failed",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  });

  app.post("/v1/self-host/zettelkasten/semantic-linker", async (request, reply) => {
    try {
      authAdapter.assertAuthorized(request);
      const parsed = zettelkastenCommandRequestSchema.parse(request.body);
      return await zettelkastenService.semanticLinker(parsed);
    } catch (error) {
      reply.code(400);
      return {
        ok: false,
        command: "semantic-linker",
        error: {
          code: "zettelkasten_failed",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  });

  app.post("/v1/self-host/zettelkasten/orphan-rescue", async (request, reply) => {
    try {
      authAdapter.assertAuthorized(request);
      const parsed = zettelkastenCommandRequestSchema.parse(request.body);
      return await zettelkastenService.orphanRescue(parsed);
    } catch (error) {
      reply.code(400);
      return {
        ok: false,
        command: "orphan-rescue",
        error: {
          code: "zettelkasten_failed",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  });

  app.post("/v1/self-host/zettelkasten/health", async (request, reply) => {
    try {
      authAdapter.assertAuthorized(request);
      const parsed = zettelkastenCommandRequestSchema.parse(request.body);
      return await zettelkastenService.vaultHealth(parsed);
    } catch (error) {
      reply.code(400);
      return {
        ok: false,
        command: "health",
        error: {
          code: "zettelkasten_failed",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  });

  app.post("/v1/self-host/zettelkasten/pipeline", async (request, reply) => {
    try {
      authAdapter.assertAuthorized(request);
      const parsed = zettelkastenPipelineRequestSchema.parse(request.body);
      const baseRequest = {
        notePath: parsed.notePath,
        noteContent: parsed.noteContent,
        vault: parsed.vault,
        model: parsed.model,
        options: { limit: 10, batchMode: false, writeReport: parsed.writeReport },
      };
      return await zettelkastenService.pipeline(
        parsed.steps.map((s) => ({ command: s.command, options: s.options })),
        baseRequest
      );
    } catch (error) {
      reply.code(400);
      return {
        ok: false,
        error: {
          code: "zettelkasten_pipeline_failed",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  });
}
