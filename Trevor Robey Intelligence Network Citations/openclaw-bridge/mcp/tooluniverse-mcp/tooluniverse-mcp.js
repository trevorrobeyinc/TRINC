"use strict";

const { BaseMcp, normalizeText, stripHtml } = require("../base-mcp.js");
const entropyProvider = require("../../core/entropy-provider.js");
const { ToolUniverseInputSchema } = require("./tu-schema.js");
const { createToolUniverseProcessManager } = require("./tu-process-manager.js");
const { normalizeToolRecord, normalizeToolList, isErrorOnlyRow } = require("./tu-record-normalizer.js");

const ACTION_TO_METHOD = Object.freeze({
  findTool: "find_tools",
  getToolInfo: "get_tool_info",
  executeTool: "execute_tool",
  listTools: "list_tools",
  grepTools: "grep_tools"
});

// A call that came back with nothing but an upstream error, as tool-prefetch's catch block sees it:
// logged, counted `failed` in search-coverage.md, nothing rendered into the prompt.
function upstreamError(record, input) {
  const detail = typeof record.error === "string"
    ? record.error.trim()
    : (record.error && typeof record.error.message === "string" && record.error.message.trim()) || "upstream error";
  const error = new Error(`${input.tool_name || input.action}: ${detail}`);
  error.code = "TU_UPSTREAM_ERROR";
  error.retryable = record.retryable === true;
  return error;
}

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

  // Every row list goes through here (2026-10-24). Error-only rows (tu-record-normalizer.js
  // isErrorOnlyRow) are dropped. When nothing else came back -- every row an error, or no rows beside
  // an error on the envelope -- the call failed, so this throws: tool-prefetch then records the search
  // as `failed` (source unreachable, inconclusive) and renders nothing. Returning [] instead would
  // claim an honest zero; normalizing the error row claimed a returned record.
  #toRecords(rows, listOpts, input, envelope = null) {
    const kept = rows.filter((row) => !isErrorOnlyRow(row));
    if (kept.length === 0) {
      const failure = rows.length > 0 ? rows[0] : (isErrorOnlyRow(envelope) ? envelope : null);
      if (failure) throw upstreamError(failure, input);
    }
    if (kept.length < rows.length) {
      this.logger.warn({ event: "tu_error_rows_dropped", tool_name: input.tool_name || "", dropped: rows.length - kept.length });
    }
    return normalizeToolList(kept, listOpts);
  }

  #normalizeResult(result, input, context) {
    if (Array.isArray(result)) {
      return this.#toRecords(result, {
        maxAbstractChars: this.maxAbstractChars,
        retrievedAt: this.timeProvider.nowIso()
      }, input);
    }

    if (result && typeof result === "object") {
      const listOpts = {
        maxAbstractChars: this.maxAbstractChars,
        retrievedAt: this.timeProvider.nowIso()
      };

      if (Array.isArray(result.tools)) {
        return this.#toRecords(result.tools, listOpts, input, result);
      }

      if (Array.isArray(result.results)) {
        return this.#toRecords(result.results, listOpts, input, result);
      }

      // ToolUniverse's own execute_tool (ExecuteToolTool.run, v1.5.7) passes a dict result through and
      // wraps anything else as { result }, so a tool that returns a bare row list arrives as
      // { result: [...rows] } with nothing beside it (openalex_literature_search, DOAJ_search_articles,
      // live 2026-10-24). Before this the envelope fell through to one hollow record whose abstract was
      // the serialized JSON of every row, and search-coverage.md counted 1. A { result: "<text>" } (a
      // non-JSON string) is not a row list and still takes the single-record path below.
      if (Array.isArray(result.result)) {
        return this.#toRecords(result.result, listOpts, input, result);
      }

      // ToolUniverse SMCP wraps tool output as { status, data, metadata }. The actual
      // records live under `data` (PubMed/SemanticScholar/EuropePMC: data is an array)
      // or one level deeper (ClinicalTrials: data.studies; others: data.results/articles/
      // records/hits). Without this, every executeTool result fell through to the
      // single-hollow-record branch and the payload + identifiers were dropped.
      if (Array.isArray(result.data)) {
        return this.#toRecords(result.data, listOpts, input, result);
      }
      if (result.data && typeof result.data === "object") {
        for (const key of ["studies", "results", "articles", "records", "hits", "trials"]) {
          if (Array.isArray(result.data[key])) {
            return this.#toRecords(result.data[key], listOpts, input, result);
          }
        }
        // Open Targets GraphQL search (OpenTargets_get_drug_id_description_by_name, 2026-10-24): the
        // rows sit under the query's root field, data.search.hits = [{ id, name, description }], read
        // off a live v1.5.7 response. Before this the envelope fell through to one empty record that
        // search-coverage.md still counted "returned".
        if (result.data.search && Array.isArray(result.data.search.hits)) {
          return this.#toRecords(result.data.search.hits, listOpts, input, result);
        }
        // Resilience for tools whose envelope nests the row list under an unlisted key:
        // if EXACTLY ONE property is an array, treat it as the records rather than dropping
        // to a single hollow record (which silently loses the payload + identifiers). We
        // require exactly one to avoid mis-picking a metadata array (e.g. warnings/errors).
        const arrayProps = Object.values(result.data).filter(Array.isArray);
        if (arrayProps.length === 1) {
          return this.#toRecords(arrayProps[0], listOpts, input, result);
        }
      }
      // A successful call with no `data` at all: ToolUniverse v1.5.x envelopes (the FAERS
      // case-report tools first, 2026-10-24) carry the rows in a top-level array beside paging
      // fields — { status, reports: [...], count, total_available, truncated, truncation_note }.
      // Same rule as the data level: exactly one array property is the rows. Only reached where
      // the branch below would otherwise return nothing, so no existing shape changes.
      if (result.status === "success" && (result.data === undefined || result.data === null)) {
        const topArrays = Object.values(result).filter(Array.isArray);
        if (topArrays.length === 1) {
          return this.#toRecords(topArrays[0], listOpts, input, result);
        }
      }
      // An error envelope with no rows to unwrap -- { status: "error", error: "Semantic Scholar API
      // error 429", retryable: true } (live, 2026-10-24) -- is a failed call. Taken as the one row it
      // is, it rendered as a hollow "*error*" record that search-coverage.md counted "returned".
      if (isErrorOnlyRow(result)) {
        throw upstreamError(result, input);
      }
      // A successful call that simply returned no rows → empty, not a hollow record.
      if (result.status === "success" &&
          (result.data === undefined || result.data === null ||
           (Array.isArray(result.data) && result.data.length === 0))) {
        return [];
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
