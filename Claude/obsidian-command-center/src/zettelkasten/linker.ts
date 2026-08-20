import { Vault } from "obsidian";
import type { App } from "obsidian";
import type { MiyoClient, MiyoSearchResult } from "../copilot-integration/miyo-client";

interface ZkToolResult {
  content?: Array<{ type: string; text: string }>;
  [key: string]: unknown;
}

interface LinkingResults {
  crossDomain: ZkToolResult | null;
  echoChamber: ZkToolResult | null;
  semantic: ZkToolResult | null;
  orphans: ZkToolResult | null;
  serendipity: ZkToolResult | null;
}

export interface MiyoLinkingOptions {
  enabled: boolean;
  threshold: number;
  maxResults: number;
  searchRetries: number;
}

// NOTE (2026-08-20): the stdio-subprocess linking lane (runZettelkastenLinking +
// subprocess/zettelkasten-client.ts) was RETIRED — it had been unreachable since
// the vault-zettelkasten plugin became the lane of record, and the bridge's
// zk_* tools never had a subprocess fallback. runVaultZKLinking below is the
// only linking path.

/**
 * VaultZK plugin API type (matches vault-zettelkasten's VaultZettelkastenAPI).
 * Declared here to avoid a hard dependency on the VaultZK plugin package.
 */
export interface VaultZKApi {
  serendipity(req: Record<string, unknown>): Promise<{ ok: boolean; content: string; suggestions?: unknown[] }>;
  crossDomain(req: Record<string, unknown>): Promise<{ ok: boolean; content: string; suggestions?: unknown[] }>;
  echoChamber(req: Record<string, unknown>): Promise<{ ok: boolean; content: string; suggestions?: unknown[] }>;
  semanticLinker(req: Record<string, unknown>): Promise<{ ok: boolean; content: string; suggestions?: unknown[] }>;
  orphanRescue(req: Record<string, unknown>): Promise<{ ok: boolean; content: string; suggestions?: unknown[] }>;
  // Bridge additions (zk_* MCP tools, 2026-08-20): vault-wide health + the
  // multi-step pipeline. Same VaultZettelkastenAPI object; kept loose here to
  // preserve the no-hard-dependency stance above.
  vaultHealth(
    req: Record<string, unknown>
  ): Promise<{ ok: boolean; content: string; healthScore?: unknown }>;
  pipeline(
    steps: Array<{ command: string; options?: Record<string, unknown> }>,
    baseRequest: Record<string, unknown>
  ): Promise<{ ok: boolean; combinedContent: string; steps?: unknown[] }>;
}

/**
 * Detect the VaultZK plugin and return its API, or null if not available.
 */
export function getVaultZKApi(app: App): VaultZKApi | null {
  const plugin = (app as any).plugins?.plugins?.["vault-zettelkasten"];
  return plugin?.api ?? null;
}

/**
 * Run Zettelkasten analysis via the in-process VaultZK plugin API.
 * Same 5 commands as runZettelkastenLinking, but zero subprocess overhead.
 * Miyo search runs concurrently (same pattern as the subprocess path).
 */
export async function runVaultZKLinking(
  vaultZK: VaultZKApi,
  synthesizerText: string,
  synthesizerNotePath: string,
  vault: Vault,
  miyoClient?: MiyoClient | null,
  miyoOptions?: MiyoLinkingOptions
): Promise<void> {
  const req = {
    noteContent: synthesizerText,
    notePath: synthesizerNotePath,
    options: { limit: 10, batchMode: false, writeReport: false },
  };

  // Start Miyo search concurrently
  const miyoPromise: Promise<MiyoSearchResult[]> = (async () => {
    if (!miyoClient || !miyoOptions?.enabled) return [];
    try {
      const healthy = await miyoClient.healthCheck();
      if (!healthy) return [];
      return await miyoClient.searchWithRetry(
        synthesizerText.slice(0, 2000),
        miyoOptions.maxResults,
        miyoOptions.threshold,
        miyoOptions.searchRetries
      );
    } catch {
      return [];
    }
  })();

  // Run all 5 VaultZK commands in parallel
  const [crossDomain, echoChamber, semantic, orphans, serendipity] =
    await Promise.allSettled([
      vaultZK.crossDomain(req),
      vaultZK.echoChamber(req),
      vaultZK.semanticLinker(req),
      vaultZK.orphanRescue(req),
      vaultZK.serendipity(req),
    ]);

  const results: LinkingResults = {
    crossDomain: wrapVaultZKResult(crossDomain),
    echoChamber: wrapVaultZKResult(echoChamber),
    semantic: wrapVaultZKResult(semantic),
    orphans: wrapVaultZKResult(orphans),
    serendipity: wrapVaultZKResult(serendipity),
  };

  const miyoResults = await miyoPromise;

  const note = vault.getAbstractFileByPath(synthesizerNotePath);
  if (!note) return;

  const existingContent = await vault.read(note as any);
  const appendix = buildLinkingAppendix(results, miyoResults);
  if (appendix) {
    await vault.modify(note as any, existingContent + "\n" + appendix);
  }
}

/**
 * Convert a VaultZK API result (Promise.allSettled) into the ZkToolResult shape
 * that buildLinkingAppendix expects.
 */
function wrapVaultZKResult(
  settled: PromiseSettledResult<{ ok: boolean; content: string }>
): ZkToolResult | null {
  if (settled.status === "fulfilled" && settled.value?.ok) {
    return { content: [{ type: "text", text: settled.value.content }] };
  }
  return null;
}

function buildLinkingAppendix(
  results: LinkingResults,
  miyoResults: MiyoSearchResult[]
): string {
  const sections: string[] = [];

  sections.push("\n---\n");
  sections.push("## Zettelkasten Graph Intelligence\n");

  if (results.crossDomain) {
    sections.push("### Cross-Domain Connections\n");
    sections.push(extractText(results.crossDomain));
    sections.push("");
  }

  if (results.echoChamber) {
    sections.push("### Blind Spots & Counter-Evidence\n");
    sections.push(extractText(results.echoChamber));
    sections.push("");
  }

  if (results.semantic) {
    sections.push("### Semantic Relationships\n");
    sections.push(extractText(results.semantic));
    sections.push("");
  }

  if (results.orphans) {
    sections.push("### Orphan Rescue Proposals\n");
    sections.push(extractText(results.orphans));
    sections.push("");
  }

  if (results.serendipity) {
    sections.push("### Serendipitous Connections\n");
    sections.push(extractText(results.serendipity));
    sections.push("");
  }

  // Miyo semantic connections
  if (miyoResults.length > 0) {
    sections.push("### Semantic Connections (Miyo)\n");
    sections.push(
      `> ${miyoResults.length} vault notes found via semantic similarity\n`
    );
    for (const r of miyoResults) {
      const title = r.title || r.file_name || noteNameFromPath(r.path);
      const excerpt = r.chunk_text
        ? r.chunk_text.trim().slice(0, 120).replace(/\n/g, " ")
        : "";
      const excerptSuffix = excerpt ? ` — "${excerpt}..."` : "";
      sections.push(
        `- [[${title}]] (similarity: ${(r.score ?? 0).toFixed(2)})${excerptSuffix}`
      );
    }
    sections.push("");
  }

  // Check if we have any content at all
  const hasZk = [
    results.crossDomain,
    results.echoChamber,
    results.semantic,
    results.orphans,
    results.serendipity,
  ].some((r) => r !== null);
  const hasMiyo = miyoResults.length > 0;

  return hasZk || hasMiyo ? sections.join("\n") : "";
}

/**
 * Extract readable text from a ZK tool result.
 * MCP tool results typically come as { content: [{ type: "text", text: "..." }] }.
 */
function extractText(result: ZkToolResult): string {
  if (result.content && Array.isArray(result.content)) {
    return result.content
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text)
      .join("\n\n");
  }
  if (typeof result === "string") return result;
  try {
    return "```json\n" + JSON.stringify(result, null, 2) + "\n```";
  } catch {
    return "(analysis result could not be rendered)";
  }
}

function noteNameFromPath(filePath: string): string {
  const parts = filePath.split("/");
  const fileName = parts[parts.length - 1] || "";
  return fileName.replace(/\.md$/, "");
}
