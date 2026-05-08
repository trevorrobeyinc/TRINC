import type { FastifyInstance } from "fastify";
import type { CompatibilityAliasService } from "../services/CompatibilityAliasService.js";

export async function registerCompatAliasRoutes(
  app: FastifyInstance,
  compatibilityAliasService: CompatibilityAliasService
): Promise<void> {
  app.get("/v0/health", async (request, reply) => {
    await compatibilityAliasService.handleV0Health(request, reply);
  });

  app.post("/v0/search", async (request, reply) => {
    await compatibilityAliasService.handleV0Search(request, reply);
  });

  app.post("/v0/search/related", async (request, reply) => {
    await compatibilityAliasService.handleV0SearchRelated(request, reply);
  });

  app.post("/v0/parse-doc", async (request, reply) => {
    await compatibilityAliasService.handleV0ParseDoc(request, reply);
  });

  app.post("/v0/index/upsert", async (request, reply) => {
    await compatibilityAliasService.handleV0IndexUpsert(request, reply);
  });

  app.delete("/v0/index/by_path", async (request, reply) => {
    await compatibilityAliasService.handleV0IndexByPath(request, reply);
  });

  app.post("/v0/index/clear", async (request, reply) => {
    await compatibilityAliasService.handleV0IndexClear(request, reply);
  });

  app.get("/v0/index/files", async (request, reply) => {
    await compatibilityAliasService.handleV0IndexFiles(request, reply);
  });

  app.get("/v0/index/stats", async (request, reply) => {
    await compatibilityAliasService.handleV0IndexStats(request, reply);
  });

  app.get("/v0/index/documents", async (request, reply) => {
    await compatibilityAliasService.handleV0IndexDocuments(request, reply);
  });
}
