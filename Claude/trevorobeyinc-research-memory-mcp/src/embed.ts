/**
 * In-process embedding via @xenova/transformers running nomic-embed-text-v1 ONNX.
 * Plan section: Phase 1 (Embedding decision).
 *
 * Cold start ~5s (model download + warmup). Warm calls ~50ms per pack.
 * Applies nomic's recommended prefix scheme:
 *   - "search_document: " for ingestion (stored vectors)
 *   - "search_query: " for queries
 * The prefix is critical for retrieval quality with this model.
 */
import { log } from "./log.js";

const MODEL_ID = process.env.EMBED_MODEL || "Xenova/nomic-embed-text-v1";
export const MODEL_DIM = 768;
export const MODEL_NAME = MODEL_ID;

/**
 * OFFLINE BY DEFAULT (2026-09-22). @xenova/transformers fetches a model from huggingface.co
 * whenever it is missing from its cache (node_modules/@xenova/transformers/.cache/). Every
 * automated caller of this package — the OpenClaw engine's post-run ingest and prefetch, the
 * Command Center's ingest, the stdio MCP server — must never do that as a side effect, so remote
 * loading is allowed ONLY when EMBED_ALLOW_REMOTE=1 is set explicitly for the one-time manual
 * fetch. A cache miss without it fails loudly (EMBED_MODEL_NOT_CACHED) instead of downloading.
 */
export const ALLOW_REMOTE_MODELS = process.env.EMBED_ALLOW_REMOTE === "1";
export const EMBED_MODEL_NOT_CACHED = "EMBED_MODEL_NOT_CACHED";

type FeatureExtractionPipeline = (
  text: string | string[],
  opts?: { pooling?: "mean" | "cls"; normalize?: boolean },
) => Promise<{ data: Float32Array; dims: number[] }>;

let pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

async function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (pipelinePromise) return pipelinePromise;
  pipelinePromise = (async () => {
    const start = Date.now();
    log("info", "embed_pipeline_loading", { model: MODEL_ID, allow_remote: ALLOW_REMOTE_MODELS });
    // Dynamic import — the package is ESM and large; defer until first use.
    const { pipeline, env } = await import("@xenova/transformers");
    env.allowRemoteModels = ALLOW_REMOTE_MODELS;
    let fe: FeatureExtractionPipeline;
    try {
      fe = (await pipeline("feature-extraction", MODEL_ID, {
        quantized: true,
      })) as unknown as FeatureExtractionPipeline;
    } catch (err) {
      const message = (err as Error).message;
      if (!ALLOW_REMOTE_MODELS) {
        log("error", "embed_model_not_cached", { model: MODEL_ID, message });
        throw new Error(
          `${EMBED_MODEL_NOT_CACHED}: ${MODEL_ID} is not in the local transformers cache and remote ` +
            `model loading is off by default (${message}). One-time manual fetch by the operator: ` +
            `run the CLI once with EMBED_ALLOW_REMOTE=1; automated callers never set it.`,
        );
      }
      throw err;
    }
    log("info", "embed_pipeline_ready", {
      model: MODEL_ID,
      load_ms: Date.now() - start,
    });
    return fe;
  })();
  return pipelinePromise;
}

function prefix(role: "document" | "query", text: string): string {
  return role === "document"
    ? `search_document: ${text}`
    : `search_query: ${text}`;
}

export async function embedDocument(text: string): Promise<number[]> {
  const fe = await getPipeline();
  const start = Date.now();
  const out = await fe(prefix("document", text), {
    pooling: "mean",
    normalize: true,
  });
  log("info", "embed_document", {
    chars: text.length,
    latency_ms: Date.now() - start,
    dim: out.dims[out.dims.length - 1],
  });
  return Array.from(out.data);
}

export async function embedQuery(query: string): Promise<number[]> {
  const fe = await getPipeline();
  const start = Date.now();
  const out = await fe(prefix("query", query), {
    pooling: "mean",
    normalize: true,
  });
  log("info", "embed_query", {
    chars: query.length,
    latency_ms: Date.now() - start,
  });
  return Array.from(out.data);
}

/** Cosine similarity between two unit-normalized vectors → just a dot product. */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
