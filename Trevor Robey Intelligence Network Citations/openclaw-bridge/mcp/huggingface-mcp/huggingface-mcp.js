"use strict";

/**
 * HuggingFace Hub MCP — queries the HuggingFace Hub API over HTTPS.
 *
 * Provides paper search, repo search/details, space search, and natural
 * language hub navigation for OpenClaw research agents.
 *
 * Uses the shared HTTPS client from ../../core/https-client.js for rate
 * limiting and connection management.
 *
 * Follows the same execute({name, arguments}) interface as other MCP providers.
 *
 * @module huggingface-mcp
 */

const { createHttpsClient } = require("../../core/https-client.js");
const { SCHEMA_BY_TOOL } = require("./huggingface-schema.js");

function isPlainObject(v) {
  return Boolean(v && typeof v === "object" && !Array.isArray(v));
}

/**
 * Map repo_type short name to the HuggingFace API path segment.
 */
const REPO_TYPE_PATH = Object.freeze({
  model: "/models",
  dataset: "/datasets",
  space: "/spaces"
});

/**
 * Format a paper result into a compact object.
 */
function formatPaper(item, concise) {
  const paper = item.paper || item;
  const base = {
    title: paper.title || "",
    authors: Array.isArray(paper.authors)
      ? paper.authors.map(a => (typeof a === "string" ? a : (a.name || a.user || ""))).filter(Boolean)
      : [],
    published_at: paper.publishedAt || paper.published_at || "",
    link: paper.id
      ? "https://huggingface.co/papers/" + paper.id
      : (paper.link || "")
  };
  if (!concise) {
    base.summary = paper.summary || paper.abstract || "";
  }
  return base;
}

/**
 * Format a repo result into a compact object.
 */
function formatRepo(item, repoType) {
  const tags = Array.isArray(item.tags) ? item.tags : [];
  return {
    id: item.id || item.modelId || "",
    type: repoType || (item._type || "model"),
    downloads: typeof item.downloads === "number" ? item.downloads : 0,
    likes: typeof item.likes === "number" ? item.likes : 0,
    tags_preview: tags.slice(0, 8)
  };
}

/**
 * Create a HuggingFace Hub MCP adapter.
 *
 * @param {object} [options]
 * @param {object} [options.logger] - Logger with info/warn/error methods
 * @returns {{ execute, isAvailable }}
 */
function createHuggingfaceMcp(options = {}) {
  const logger = isPlainObject(options.logger)
    ? options.logger
    : { info() {}, warn() {}, error() {} };

  const token = process.env.HF_TOKEN || "";
  const headers = {};
  if (token) {
    headers.Authorization = "Bearer " + token;
  }

  const client = createHttpsClient({
    hostname: "huggingface.co",
    basePath: "/api",
    maxPerSecond: 5,
    headers
  });

  async function execute(input) {
    const toolName = (input && typeof input.name === "string") ? input.name : "";
    const args = (input && isPlainObject(input.arguments)) ? input.arguments : {};

    if (!toolName) throw new Error("huggingface-mcp: tool name is required");

    const schema = SCHEMA_BY_TOOL[toolName];
    if (!schema) throw new Error("huggingface-mcp: unknown tool " + toolName);

    const validated = schema.parse(args);
    let result;

    switch (toolName) {

      case "hf_paper_search": {
        const params = new URLSearchParams();
        params.set("query", validated.query);
        params.set("limit", String(validated.results_limit));

        const qs = "/daily_papers/search?" + params.toString();
        const data = await client.getJson(qs);
        const items = Array.isArray(data) ? data : [];

        result = {
          ok: true,
          papers: items.slice(0, validated.results_limit).map(p => formatPaper(p, validated.concise_only)),
          count: items.length
        };
        break;
      }

      case "hf_repo_search": {
        const allRepos = [];

        for (const repoType of validated.repo_types) {
          const pathSegment = REPO_TYPE_PATH[repoType];
          if (!pathSegment) continue;

          const params = new URLSearchParams();
          if (validated.query) params.set("search", validated.query);
          if (validated.author) params.set("author", validated.author);
          if (validated.sort) params.set("sort", validated.sort);
          params.set("limit", String(validated.limit));

          if (validated.filters && validated.filters.length > 0) {
            for (const f of validated.filters) {
              params.append("filter", f);
            }
          }

          const qs = pathSegment + "?" + params.toString();
          const data = await client.getJson(qs);
          const items = Array.isArray(data) ? data : [];

          for (const item of items) {
            allRepos.push(formatRepo(item, repoType));
          }
        }

        result = {
          ok: true,
          repos: allRepos,
          count: allRepos.length
        };
        break;
      }

      case "hf_repo_details": {
        const repos = [];

        for (const repoId of validated.repo_ids) {
          let detail = null;

          if (validated.repo_type) {
            const pathSegment = REPO_TYPE_PATH[validated.repo_type];
            const qs = pathSegment + "/" + encodeURIComponent(repoId).replace(/%2F/g, "/");
            try {
              detail = await client.getJson(qs);
              if (detail) detail._type = validated.repo_type;
            } catch (_) {
              detail = null;
            }
          } else {
            // Auto-detect: try models, then datasets, then spaces
            for (const tryType of ["model", "dataset", "space"]) {
              const pathSegment = REPO_TYPE_PATH[tryType];
              const qs = pathSegment + "/" + encodeURIComponent(repoId).replace(/%2F/g, "/");
              try {
                detail = await client.getJson(qs);
                if (detail) {
                  detail._type = tryType;
                  break;
                }
              } catch (_) {
                detail = null;
              }
            }
          }

          if (detail) {
            repos.push({
              id: detail.id || detail.modelId || repoId,
              type: detail._type || "model",
              author: detail.author || "",
              sha: detail.sha || "",
              last_modified: detail.lastModified || "",
              private: Boolean(detail.private),
              disabled: Boolean(detail.disabled),
              gated: detail.gated || false,
              downloads: typeof detail.downloads === "number" ? detail.downloads : 0,
              likes: typeof detail.likes === "number" ? detail.likes : 0,
              tags: Array.isArray(detail.tags) ? detail.tags : [],
              pipeline_tag: detail.pipeline_tag || "",
              library_name: detail.library_name || "",
              card_data: detail.cardData || null
            });
          } else {
            repos.push({
              id: repoId,
              type: validated.repo_type || "unknown",
              error: "not_found"
            });
          }
        }

        result = {
          ok: true,
          repos,
          count: repos.length
        };
        break;
      }

      case "hf_space_search": {
        const params = new URLSearchParams();
        params.set("search", validated.query);
        params.set("limit", String(validated.mcp ? validated.limit * 3 : validated.limit));

        const qs = "/spaces?" + params.toString();
        const data = await client.getJson(qs);
        let items = Array.isArray(data) ? data : [];

        if (validated.mcp) {
          items = items.filter(s => {
            const tags = Array.isArray(s.tags) ? s.tags : [];
            const id = (s.id || "").toLowerCase();
            return tags.some(t => String(t).toLowerCase().includes("mcp")) ||
                   id.includes("mcp");
          });
        }

        items = items.slice(0, validated.limit);

        result = {
          ok: true,
          spaces: items.map(s => ({
            id: s.id || "",
            author: s.author || "",
            likes: typeof s.likes === "number" ? s.likes : 0,
            sdk: s.sdk || "",
            runtime_stage: s.runtime && s.runtime.stage ? s.runtime.stage : "",
            tags: Array.isArray(s.tags) ? s.tags.slice(0, 8) : [],
            link: s.id ? "https://huggingface.co/spaces/" + s.id : ""
          })),
          count: items.length
        };
        break;
      }

      case "hf_hub_query": {
        const params = new URLSearchParams();
        params.set("search", validated.message);
        params.set("limit", "20");

        const qs = "/models?" + params.toString();
        const data = await client.getJson(qs);
        const items = Array.isArray(data) ? data : [];

        result = {
          ok: true,
          interpretation: "best-effort model search for: " + validated.message,
          repos: items.map(item => formatRepo(item, "model")),
          count: items.length
        };
        break;
      }
    }

    logger.info({
      event: "huggingface_mcp_execute",
      tool_name: toolName,
      ok: result && result.ok
    });

    return JSON.stringify(result, null, 2);
  }

  /**
   * Quick availability check: fetch one model and verify valid response.
   */
  async function isAvailable() {
    try {
      const data = await client.getJson("/models?limit=1");
      return Boolean(data && Array.isArray(data) && data.length > 0);
    } catch (_) {
      return false;
    }
  }

  return Object.freeze({ execute, isAvailable });
}

module.exports = { createHuggingfaceMcp };
