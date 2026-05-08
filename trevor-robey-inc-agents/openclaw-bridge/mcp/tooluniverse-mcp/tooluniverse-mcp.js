"use strict";

const { BaseMcp, normalizeText, stripHtml } = require("../base-mcp.js");
const entropyProvider = require("../../core/entropy-provider.js");
const { ToolUniverseInputSchema } = require("./tu-schema.js");
const { createToolUniverseProcessManager } = require("./tu-process-manager.js");
const { normalizeToolRecord, normalizeToolList } = require("./tu-record-normalizer.js");

const ACTION_TO_METHOD = Object.freeze({
  findTool: "find_tools",
  getToolInfo: "get_tool_info",
  executeTool: "execute_tool",
  listTools: "list_tools",
  grepTools: "grep_tools"
});

class ToolUniverseMcp extends BaseMcp {
  #processManager;
  #executionTimeoutMs;

  constructor(options = {}) {
    super({
      ...options,
      mcpSlug: "tooluniverse-mcp",
      source: "tooluniverse",
      inputSchema: ToolUniverseInputSchema,
      maxInputChars: options.maxInputChars || 1024,
      timeoutMs: options.timeoutMs || 12_000
    });

    this.#executionTimeoutMs = Math.min(120_000, Math.max(5_000, Number(options.executionTimeoutMs) || 60_000));

    this.#processManager = options.processManager || createToolUniverseProcessManager({
      logger: this.logger,
      pythonPath: options.pythonPath,
      toolUniverseDir: options.toolUniverseDir,
      executionTimeoutMs: this.#executionTimeoutMs
    });
  }

  async execute(input, context) {
    const method = ACTION_TO_METHOD[input.action];
    if (!method) {
      const error = new Error(`Unknown action: ${input.action}`);
      error.code = "TU_UNKNOWN_ACTION";
      throw error;
    }

    const params = this.#buildParams(input);
    const result = await this.#processManager.call(method, params);
    return this.#normalizeResult(result, input, context);
  }

  #buildParams(input) {
    const params = {};

    if (input.query) {
      params.query = input.query;
    }
    if (input.tool_name) {
      params.tool_name = input.tool_name;
    }
    if (input.arguments) {
      params.arguments = input.arguments;
    }
    if (input.limit) {
      params.limit = input.limit;
    }
    if (input.category) {
      params.category = input.category;
    }

    return params;
  }

  #normalizeResult(result, input, context) {
    if (Array.isArray(result)) {
      return normalizeToolList(result, {
        maxAbstractChars: this.maxAbstractChars,
        retrievedAt: this.timeProvider.nowIso()
      });
    }

    if (result && typeof result === "object") {
      if (Array.isArray(result.tools)) {
        return normalizeToolList(result.tools, {
          maxAbstractChars: this.maxAbstractChars,
          retrievedAt: this.timeProvider.nowIso()
        });
      }

      if (Array.isArray(result.results)) {
        return normalizeToolList(result.results, {
          maxAbstractChars: this.maxAbstractChars,
          retrievedAt: this.timeProvider.nowIso()
        });
      }

      const executionId = input.action === "executeTool"
        ? entropyProvider.randomHex(4)
        : "";

      return [normalizeToolRecord(
        { ...result, tool_name: input.tool_name || result.tool_name || result.name },
        {
          maxAbstractChars: this.maxAbstractChars,
          retrievedAt: this.timeProvider.nowIso(),
          executionId
        }
      )];
    }

    return [];
  }

  normalizeRecord(rawRecord, context) {
    const abstract = stripHtml(rawRecord && rawRecord.abstract);
    if (abstract.length > this.maxAbstractChars) {
      const error = new Error(`abstract exceeds max length (${this.maxAbstractChars})`);
      error.code = "MCP_OUTPUT_SCHEMA_INVALID";
      throw error;
    }

    const normalized = {
      source: "tooluniverse",
      paper_id: normalizeText(rawRecord && rawRecord.paper_id, 256),
      title: normalizeText(rawRecord && rawRecord.title, 2000),
      abstract,
      authors: Array.isArray(rawRecord && rawRecord.authors) ? rawRecord.authors : [],
      citation_velocity: Number.isFinite(Number(rawRecord && rawRecord.citation_velocity))
        ? Math.max(0, Math.floor(Number(rawRecord.citation_velocity)))
        : 0,
      published_at: normalizeText(rawRecord && rawRecord.published_at, 64) || "1970-01-01T00:00:00.000Z",
      retrieved_at: this.timeProvider.nowIso()
    };

    return {
      ...normalized,
      hash: this.constructor.computeRecordHash(normalized)
    };
  }

  shutdown() {
    this.#processManager.shutdown();
  }
}

function createToolUniverseMcp(options) {
  return new ToolUniverseMcp(options);
}

module.exports = {
  ToolUniverseInputSchema,
  ToolUniverseMcp,
  createToolUniverseMcp
};
