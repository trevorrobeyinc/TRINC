"use strict";

/**
 * Tool descriptions for the HuggingFace Hub MCP, formatted for injection
 * into the agentic loop LLM prompt via buildToolInstructionBlock().
 *
 * @module huggingface-tool-descriptions
 */

const HF_TOOL_DESCRIPTIONS = Object.freeze([
  {
    name: "hf_paper_search",
    description: "Search ML and biomedical research papers on the HuggingFace Daily Papers index",
    parameters: '{ "query": "drug discovery transformers" [, "results_limit": 12] [, "concise_only": false] }'
  },
  {
    name: "hf_repo_search",
    description: "Search HuggingFace Hub for models, datasets, and spaces by keyword, author, or tag filters",
    parameters: '{ ["query": "protein structure prediction"] [, "repo_types": ["model", "dataset"]] [, "author": "facebook"] [, "filters": ["language:en", "task:text-generation"]] [, "sort": "downloads"] [, "limit": 20] }'
  },
  {
    name: "hf_repo_details",
    description: "Retrieve full metadata for one or more HuggingFace Hub repositories by ID",
    parameters: '{ "repo_ids": ["meta-llama/Llama-3-8B", "bigscience/bloom"] [, "repo_type": "model"] }'
  },
  {
    name: "hf_space_search",
    description: "Semantic search for HuggingFace Spaces, optionally filtered to MCP Server spaces only",
    parameters: '{ "query": "molecule viewer" [, "limit": 10] [, "mcp": false] }'
  },
  {
    name: "hf_hub_query",
    description: "Natural language navigator for the HuggingFace Hub — best-effort interpretation of freeform queries",
    parameters: '{ "message": "trending biomedical models this week" }'
  }
]);

module.exports = { HF_TOOL_DESCRIPTIONS };
