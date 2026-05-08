import type { FastifyReply, FastifyRequest } from "fastify";
import { AuthAdapter } from "../adapters/AuthAdapter.js";
import { MiyoCompatibilityService } from "./MiyoCompatibilityService.js";
import {
  miyoDocumentsQuerySchema,
  miyoDocumentsResponseSchema,
  miyoHealthResponseSchema,
  miyoIndexedFilesQuerySchema,
  miyoIndexedFilesResponseSchema,
  miyoIndexByPathRequestSchema,
  miyoIndexByPathResponseSchema,
  miyoIndexClearRequestSchema,
  miyoIndexStatsQuerySchema,
  miyoIndexStatsResponseSchema,
  miyoIndexUpsertRequestSchema,
  miyoIndexUpsertResponseSchema,
  miyoParseDocRequestSchema,
  miyoParseDocResponseSchema,
  miyoRelatedSearchRequestSchema,
  miyoRelatedSearchResponseSchema,
  miyoSearchRequestSchema,
  miyoSearchResponseSchema,
} from "../types/miyo.js";

export class CompatibilityAliasService {
  constructor(
    private readonly authAdapter: AuthAdapter,
    private readonly miyoCompatibilityService: MiyoCompatibilityService
  ) {}

  async handleV0Health(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    this.assertAuthorized(request);
    await this.miyoCompatibilityService.forwardGet(
      "/v0/health",
      request,
      reply,
      undefined,
      miyoHealthResponseSchema
    );
  }

  async handleV0Search(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    this.assertAuthorized(request);
    await this.miyoCompatibilityService.forwardJson(
      "POST",
      "/v0/search",
      request,
      reply,
      miyoSearchRequestSchema,
      miyoSearchResponseSchema
    );
  }

  async handleV0SearchRelated(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    this.assertAuthorized(request);
    await this.miyoCompatibilityService.forwardJson(
      "POST",
      "/v0/search/related",
      request,
      reply,
      miyoRelatedSearchRequestSchema,
      miyoRelatedSearchResponseSchema
    );
  }

  async handleV0ParseDoc(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    this.assertAuthorized(request);
    await this.miyoCompatibilityService.forwardJson(
      "POST",
      "/v0/parse-doc",
      request,
      reply,
      miyoParseDocRequestSchema,
      miyoParseDocResponseSchema
    );
  }

  async handleV0IndexUpsert(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    this.assertAuthorized(request);
    await this.miyoCompatibilityService.forwardJson(
      "POST",
      "/v0/index/upsert",
      request,
      reply,
      miyoIndexUpsertRequestSchema,
      miyoIndexUpsertResponseSchema
    );
  }

  async handleV0IndexByPath(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    this.assertAuthorized(request);
    await this.miyoCompatibilityService.forwardJson(
      "DELETE",
      "/v0/index/by_path",
      request,
      reply,
      miyoIndexByPathRequestSchema,
      miyoIndexByPathResponseSchema
    );
  }

  async handleV0IndexClear(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    this.assertAuthorized(request);
    await this.miyoCompatibilityService.forwardJson(
      "POST",
      "/v0/index/clear",
      request,
      reply,
      miyoIndexClearRequestSchema
    );
  }

  async handleV0IndexFiles(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    this.assertAuthorized(request);
    await this.miyoCompatibilityService.forwardGet(
      "/v0/index/files",
      request,
      reply,
      miyoIndexedFilesQuerySchema,
      miyoIndexedFilesResponseSchema
    );
  }

  async handleV0IndexStats(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    this.assertAuthorized(request);
    await this.miyoCompatibilityService.forwardGet(
      "/v0/index/stats",
      request,
      reply,
      miyoIndexStatsQuerySchema,
      miyoIndexStatsResponseSchema
    );
  }

  async handleV0IndexDocuments(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    this.assertAuthorized(request);
    await this.miyoCompatibilityService.forwardGet(
      "/v0/index/documents",
      request,
      reply,
      miyoDocumentsQuerySchema,
      miyoDocumentsResponseSchema
    );
  }

  async handleUnsupportedAlias(route: string, reply: FastifyReply): Promise<void> {
    reply.code(501).send({
      ok: false,
      alias: route,
      error: {
        code: "alias_not_supported",
        message: `The compatibility alias '${route}' is recognized but not implemented because it would require unsupported hosted or undocumented behavior.`,
        retryable: false,
      },
    });
  }

  private assertAuthorized(request: FastifyRequest): void {
    this.authAdapter.assertAuthorized(request, {
      allowApiKeyHeader: true,
      // Stable Copilot 3.2.5 now uses a license-derived bearer header for Miyo `/v0/*` calls.
      // Accept any non-empty bearer token on the localhost-only compatibility surface so the
      // official plugin can pass through its own auth contract while canonical `v1/self-host/*`
      // routes remain pinned to `SELF_HOST_API_KEY`.
      allowAnyBearerHeader: true,
    });
  }
}
