import type { MiyoClient, MiyoSearchResult } from "../adapters/miyo-client";
import type { VaultFS } from "../adapters/vault-fs";
import type { QdrantClient } from "../adapters/qdrant-client";
import { ModelGateway } from "../adapters/model-gateway";
import type { VaultZKSettings } from "../constants";
import type { ResolvedModelConfig, CanonicalChatMessage } from "../types/model";
import type {
  ZettelkastenCommandRequest,
  ZettelkastenCommandResponse,
  ActionableSuggestion,
  TypedRelationship,
  VaultHealthScore,
} from "../types/zettelkasten";

/**
 * Obsidian-native ZettelkastenService.
 *
 * Ported from copilot-backend-emulator's ZettelkastenService.ts with 6 key adaptations:
 *   1. resolveNoteContent → VaultFS.readFile (was mcpOrchestrator.executeToolCall)
 *   2. vaultFs.listFiles   → VaultFS wrapping app.vault.getMarkdownFiles() (was node:fs)
 *   3. vaultFs.readFile     → VaultFS wrapping app.vault.read() (was node:fs)
 *   4. vaultFs.stat         → VaultFS wrapping app.vault.adapter.stat() (was node:fs)
 *   5. miyoClient.forward   → MiyoClient.search() / .searchRelated() (was generic proxy)
 *   6. modelGateway         → uses requestUrl instead of fetch (same interface)
 */
export class ZettelkastenService {
  private readonly vault: string;
  private readonly vaultRoot: string;

  constructor(
    private readonly vaultFs: VaultFS,
    private readonly miyoClient: MiyoClient,
    private readonly qdrantClient: QdrantClient,
    private readonly modelGateway: ModelGateway,
    private readonly getSettings: () => VaultZKSettings,
    vaultName: string,
    vaultRoot: string
  ) {
    this.vault = vaultName;
    this.vaultRoot = vaultRoot;
  }

  /* ── Serendipity Generator ───────────────────────────────────────── */

  async serendipity(request: ZettelkastenCommandRequest): Promise<ZettelkastenCommandResponse> {
    const start = Date.now();
    const vault = request.vault || this.vault;
    const model = this.resolveModel(request);
    let miyoQueries = 0;
    let llmCalls = 0;

    const noteContent = await this.resolveNoteContent(request);

    const concepts = await this.extractConcepts(noteContent, model);
    llmCalls++;

    const conceptResults: MiyoSearchResult[] = [];
    for (const concept of concepts.slice(0, 3)) {
      const results = await this.miyoSearch(concept, vault, 5);
      miyoQueries++;
      conceptResults.push(...results);
    }

    const randomNotes = await this.selectRandomNotes(3);
    const onThisDay = await this.findOnThisDay(5);

    const synthesis = await this.llmGenerate(
      model,
      this.buildSerendipityPrompt(noteContent, conceptResults, randomNotes, onThisDay)
    );
    llmCalls++;

    const suggestions = this.extractSuggestions(conceptResults, randomNotes, onThisDay);

    return {
      ok: true,
      command: "serendipity",
      content: synthesis,
      suggestions,
      metadata: {
        durationMs: Date.now() - start,
        notesAnalyzed: new Set([...conceptResults, ...randomNotes, ...onThisDay].map((r) => r.path)).size,
        miyoQueries,
        llmCalls,
        vault,
      },
    };
  }

  /* ── Cross-Domain Connector ──────────────────────────────────────── */

  async crossDomain(request: ZettelkastenCommandRequest): Promise<ZettelkastenCommandResponse> {
    const start = Date.now();
    const vault = request.vault || this.vault;
    const model = this.resolveModel(request);
    let miyoQueries = 0;
    let llmCalls = 0;

    const noteContent = await this.resolveNoteContent(request);

    const analysis = await this.llmGenerateJson<{
      structuralPattern: string;
      domain: string;
      concepts: string[];
    }>(model, [
      {
        role: "system",
        content:
          "Extract the core structural pattern, the domain this idea belongs to, " +
          "and 3-5 key concepts. Return strict JSON: " +
          '{"structuralPattern":"...","domain":"...","concepts":["..."]}',
      },
      { role: "user", content: noteContent },
    ]);
    llmCalls++;

    const searchResults: MiyoSearchResult[] = [];
    for (const concept of (analysis?.concepts ?? []).slice(0, 5)) {
      const results = await this.miyoSearch(concept, vault, 5);
      miyoQueries++;
      searchResults.push(...results);
    }

    let relatedResults: MiyoSearchResult[] = [];
    if (request.notePath) {
      relatedResults = await this.miyoSearchRelated(request.notePath, vault, 10);
      miyoQueries++;
    }

    const allResults = deduplicateByPath([...searchResults, ...relatedResults]);
    const domainMap = this.classifyByDomain(allResults);

    const synthesis = await this.llmGenerate(
      model,
      this.buildCrossDomainPrompt(noteContent, analysis, domainMap)
    );
    llmCalls++;

    const suggestions = this.extractSuggestions(allResults);

    return {
      ok: true,
      command: "cross-domain",
      content: synthesis,
      suggestions,
      metadata: {
        durationMs: Date.now() - start,
        notesAnalyzed: allResults.length,
        miyoQueries,
        llmCalls,
        vault,
      },
    };
  }

  /* ── Echo Chamber Breaker ────────────────────────────────────────── */

  async echoChamber(request: ZettelkastenCommandRequest): Promise<ZettelkastenCommandResponse> {
    const start = Date.now();
    const vault = request.vault || this.vault;
    const model = this.resolveModel(request);
    let miyoQueries = 0;
    let llmCalls = 0;

    const noteContent = await this.resolveNoteContent(request);

    const assumptions = await this.llmGenerateJson<{ assumptions: string[] }>(model, [
      {
        role: "system",
        content:
          "Extract the 3-5 core assumptions, beliefs, or theses from this content. " +
          'Return strict JSON: {"assumptions":["..."]}',
      },
      { role: "user", content: noteContent },
    ]);
    llmCalls++;

    const contradictions: Array<{ assumption: string; evidence: MiyoSearchResult[] }> = [];
    for (const assumption of (assumptions?.assumptions ?? []).slice(0, 5)) {
      const invertedQuery = `contradicts OR challenges OR opposes: ${assumption}`;
      const results = await this.miyoSearch(invertedQuery, vault, 5);
      miyoQueries++;
      contradictions.push({ assumption, evidence: results });
    }

    const broadSearch = await this.miyoSearch(noteContent.slice(0, 200), vault, 15);
    miyoQueries++;
    const distantResults = broadSearch.filter((r) => (r.score ?? 0) > 0.1 && (r.score ?? 0) < 0.5);

    const synthesis = await this.llmGenerate(
      model,
      this.buildEchoChamberPrompt(noteContent, contradictions, distantResults)
    );
    llmCalls++;

    const allEvidence = contradictions.flatMap((c) => c.evidence);
    const suggestions = this.extractSuggestions([...allEvidence, ...distantResults]);

    return {
      ok: true,
      command: "echo-chamber",
      content: synthesis,
      suggestions,
      metadata: {
        durationMs: Date.now() - start,
        notesAnalyzed: new Set([...allEvidence, ...distantResults].map((r) => r.path)).size,
        miyoQueries,
        llmCalls,
        vault,
      },
    };
  }

  /* ── Semantic Linker ──────────────────────────────────────────────── */

  async semanticLinker(request: ZettelkastenCommandRequest): Promise<ZettelkastenCommandResponse> {
    const start = Date.now();
    const vault = request.vault || this.vault;
    const model = this.resolveModel(request);
    let miyoQueries = 0;
    let llmCalls = 0;

    const noteContent = await this.resolveNoteContent(request);
    const sourcePath = request.notePath ?? "unknown";

    const limit = request.options?.limit ?? 15;
    let neighbors: MiyoSearchResult[] = [];
    if (request.notePath) {
      neighbors = await this.miyoSearchRelated(request.notePath, vault, limit);
      miyoQueries++;
    }
    if (neighbors.length < 5) {
      const concepts = await this.extractConcepts(noteContent, model);
      llmCalls++;
      for (const concept of concepts.slice(0, 3)) {
        const results = await this.miyoSearch(concept, vault, 5);
        miyoQueries++;
        neighbors.push(...results);
      }
      neighbors = deduplicateByPath(neighbors);
    }

    // Fetch content snippets for each neighbor (VaultFS read, Qdrant fallback)
    const neighborSnippets: Array<{ path: string; snippet: string }> = [];
    for (const n of neighbors.slice(0, 12)) {
      let snippet = n.chunk_text ?? "";
      try {
        const content = await this.vaultFs.readFile(n.path);
        snippet = content.slice(0, 500);
      } catch {
        try {
          const absolutePath = `${this.vaultRoot}/${n.path}`;
          const chunks = await this.qdrantClient.getChunksForFile(absolutePath);
          snippet = chunks[0]?.slice(0, 500) ?? snippet;
        } catch {
          // Use whatever we have from the search result
        }
      }
      neighborSnippets.push({ path: n.path, snippet: snippet.slice(0, 500) });
    }

    // LLM classifies relationship types
    const classified = await this.llmGenerateJson<{
      relationships: Array<{
        target: string;
        type: string;
        subtype: string;
        confidence: number;
        rationale: string;
      }>;
    }>(model, this.buildSemanticLinkerClassificationPrompt(sourcePath, noteContent, neighborSnippets));
    llmCalls++;

    const relationships: TypedRelationship[] = (classified?.relationships ?? [])
      .filter((r) => r.target && r.subtype)
      .map((r) => ({
        source: sourcePath,
        target: r.target,
        type: normalizeRelationshipType(r.type),
        subtype: normalizeRelationshipSubtype(r.subtype),
        confidence: Math.max(0, Math.min(1, r.confidence ?? 0.5)),
        rationale: r.rationale ?? "",
        dataviewSyntax: `[${normalizeRelationshipSubtype(r.subtype)}:: [[${r.target.replace(/\.md$/, "")}]]]`,
      }));

    const transitive = this.inferTransitiveRelationships(relationships, neighbors);
    const allRelationships = [...relationships, ...transitive];

    const synthesis = await this.llmGenerate(
      model,
      this.buildSemanticLinkerSynthesisPrompt(sourcePath, noteContent, allRelationships)
    );
    llmCalls++;

    const suggestions: ActionableSuggestion[] = allRelationships.slice(0, 10).map((r) => ({
      targetNote: r.target,
      wikilink: `[[${r.target.replace(/\.md$/, "")}]]`,
      rationale: r.rationale,
      relationship: r.subtype as ActionableSuggestion["relationship"],
      confidence: r.confidence,
    }));

    return {
      ok: true,
      command: "semantic-linker",
      content: synthesis,
      suggestions,
      relationships: allRelationships,
      metadata: {
        durationMs: Date.now() - start,
        notesAnalyzed: neighbors.length,
        miyoQueries,
        llmCalls,
        vault,
      },
    };
  }

  /* ── Orphan Rescuer ───────────────────────────────────────────────── */

  async orphanRescue(request: ZettelkastenCommandRequest): Promise<ZettelkastenCommandResponse> {
    const start = Date.now();
    const vault = request.vault || this.vault;
    const model = this.resolveModel(request);
    let miyoQueries = 0;
    let llmCalls = 0;
    const batchMode = request.options?.batchMode ?? false;

    if (batchMode) {
      const { orphans, totalFiles } = await this.buildLinkGraph();

      const rescueLimit = Math.min(request.options?.limit ?? 10, orphans.length);
      const rescueSuggestions: ActionableSuggestion[] = [];

      for (const orphanPath of orphans.slice(0, rescueLimit)) {
        const related = await this.miyoSearchRelated(orphanPath, vault, 5);
        miyoQueries++;
        for (const r of related.slice(0, 3)) {
          rescueSuggestions.push({
            targetNote: r.path,
            wikilink: `[[${r.path.replace(/\.md$/, "")}]]`,
            rationale: `Connect orphan [[${orphanPath.replace(/\.md$/, "")}]] to this semantically related note`,
            confidence: r.score,
          });
        }
      }

      const synthesis = await this.llmGenerate(
        model,
        this.buildOrphanBatchPrompt(orphans, totalFiles, rescueSuggestions)
      );
      llmCalls++;

      return {
        ok: true,
        command: "orphan-rescue",
        content: synthesis,
        suggestions: rescueSuggestions.slice(0, 20),
        metadata: {
          durationMs: Date.now() - start,
          notesAnalyzed: totalFiles,
          miyoQueries,
          llmCalls,
          vault,
        },
      };
    }

    // Single-note mode
    const noteContent = await this.resolveNoteContent(request);
    const notePath = request.notePath ?? "unknown";

    let neighbors: MiyoSearchResult[] = [];
    if (request.notePath) {
      neighbors = await this.miyoSearchRelated(request.notePath, vault, 10);
      miyoQueries++;
    }
    if (neighbors.length < 3) {
      const concepts = await this.extractConcepts(noteContent, model);
      llmCalls++;
      for (const concept of concepts.slice(0, 3)) {
        const results = await this.miyoSearch(concept, vault, 5);
        miyoQueries++;
        neighbors.push(...results);
      }
      neighbors = deduplicateByPath(neighbors);
    }

    const synthesis = await this.llmGenerate(
      model,
      this.buildOrphanSinglePrompt(notePath, noteContent, neighbors)
    );
    llmCalls++;

    const suggestions = this.extractSuggestions(neighbors);

    return {
      ok: true,
      command: "orphan-rescue",
      content: synthesis,
      suggestions,
      metadata: {
        durationMs: Date.now() - start,
        notesAnalyzed: neighbors.length,
        miyoQueries,
        llmCalls,
        vault,
      },
    };
  }

  /* ── Vault Health ─────────────────────────────────────────────────── */

  async vaultHealth(request: ZettelkastenCommandRequest): Promise<ZettelkastenCommandResponse> {
    const start = Date.now();
    const vault = request.vault || this.vault;

    const { orphans, totalFiles, linkMap, filePaths, filesScanned } = await this.buildLinkGraph();

    const orphanRatio = totalFiles > 0 ? orphans.length / totalFiles : 0;

    let totalInbound = 0;
    for (const inbound of linkMap.values()) {
      totalInbound += inbound.size;
    }
    const avgConnectivity = totalFiles > 0 ? totalInbound / totalFiles : 0;

    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
    let staleCount = 0;
    for (const f of filePaths) {
      try {
        const s = await this.vaultFs.stat(f);
        if (s.mtime.getTime() < ninetyDaysAgo) staleCount++;
      } catch {
        // skip unreadable files
      }
    }
    const stalenessRatio = totalFiles > 0 ? staleCount / totalFiles : 0;

    const tagCoverage = -1;

    const healthScore: VaultHealthScore = {
      totalFiles,
      orphanCount: orphans.length,
      orphanRatio: Math.round(orphanRatio * 1000) / 1000,
      avgConnectivity: Math.round(avgConnectivity * 100) / 100,
      stalenessRatio: Math.round(stalenessRatio * 1000) / 1000,
      tagCoverage,
      orphanPaths: orphans.slice(0, 50),
      computedAt: new Date().toISOString(),
    };

    const content = [
      `# Vault Health Report`,
      ``,
      `> Computed at ${healthScore.computedAt}`,
      ``,
      `| Metric | Value |`,
      `|---|---|`,
      `| Total files | ${totalFiles} |`,
      `| Orphan count | ${orphans.length} |`,
      `| Orphan ratio | ${(orphanRatio * 100).toFixed(1)}% |`,
      `| Avg connectivity | ${avgConnectivity.toFixed(2)} inbound links/file |`,
      `| Staleness (>90d) | ${(stalenessRatio * 100).toFixed(1)}% |`,
      `| Stale files | ${staleCount} |`,
      ``,
      orphans.length > 0
        ? `## Top Orphans\n\n${orphans
            .slice(0, 20)
            .map((p) => `- [[${p.replace(/\.md$/, "")}]]`)
            .join("\n")}`
        : "## No orphans detected",
    ].join("\n");

    return {
      ok: true,
      command: "health",
      content,
      suggestions: orphans.slice(0, 10).map((p) => ({
        targetNote: p,
        wikilink: `[[${p.replace(/\.md$/, "")}]]`,
        rationale: "Orphan note — no inbound links detected",
      })),
      healthScore,
      metadata: {
        durationMs: Date.now() - start,
        notesAnalyzed: totalFiles,
        miyoQueries: 0,
        llmCalls: 0,
        filesScanned,
        vault,
      },
    };
  }

  /* ══════════════════════════════════════════════════════════════════════
   *  SHARED HELPERS
   * ═════════════════════════════════════════════════════════════════════ */

  /**
   * Resolve note content from request — either provided directly, or read via VaultFS.
   * Adaptation #1: replaces mcpOrchestrator.executeToolCall(obsidian_read_note)
   */
  private async resolveNoteContent(request: ZettelkastenCommandRequest): Promise<string> {
    if (request.noteContent) {
      return request.noteContent;
    }

    if (!request.notePath) {
      return "(No note content provided)";
    }

    try {
      return await this.vaultFs.readFile(request.notePath);
    } catch {
      return `(Failed to read note: ${request.notePath})`;
    }
  }

  async extractConcepts(noteContent: string, model: ResolvedModelConfig): Promise<string[]> {
    const result = await this.llmGenerateJson<{ concepts: string[] }>(model, [
      {
        role: "system",
        content:
          "Extract 3-5 key concepts, themes, or topics from this text. " +
          'Return strict JSON only: {"concepts":["concept1","concept2",...]}',
      },
      { role: "user", content: noteContent.slice(0, 3000) },
    ]);

    return result?.concepts ?? [];
  }

  /* ── Miyo wrappers ─────────────────────────────────────────────────── */

  /**
   * Adaptation #5a: replaces miyoClient.forward({routePath: "/v0/search", body})
   */
  private async miyoSearch(query: string, vault: string, limit: number): Promise<MiyoSearchResult[]> {
    return this.miyoClient.search(query, vault, limit);
  }

  /**
   * Adaptation #5b: replaces miyoClient.forward({routePath: "/v0/search/related", body})
   */
  private async miyoSearchRelated(
    filePath: string,
    vault: string,
    limit: number
  ): Promise<MiyoSearchResult[]> {
    return this.miyoClient.searchRelated(filePath, vault, limit);
  }

  /* ── Pipeline composition ─────────────────────────────────────────── */

  async pipeline(
    steps: Array<{
      command: ZettelkastenCommandResponse["command"];
      options?: { limit?: number; batchMode?: boolean };
    }>,
    baseRequest: ZettelkastenCommandRequest
  ): Promise<{
    ok: true;
    steps: ZettelkastenCommandResponse[];
    combinedContent: string;
    metadata: { durationMs: number; totalLlmCalls: number; totalMiyoQueries: number };
  }> {
    const start = Date.now();
    const results: ZettelkastenCommandResponse[] = [];
    let totalLlmCalls = 0;
    let totalMiyoQueries = 0;

    for (const step of steps) {
      const request: ZettelkastenCommandRequest = {
        ...baseRequest,
        options: {
          limit: step.options?.limit ?? baseRequest.options?.limit ?? 10,
          batchMode: step.options?.batchMode ?? false,
          writeReport: false,
        },
      };

      // Feed previous step's content as additional context
      if (results.length > 0) {
        const prevContent = results[results.length - 1].content;
        request.noteContent =
          (request.noteContent ?? "") + `\n\n--- Previous Analysis ---\n\n${prevContent}`;
      }

      const handler = this.getCommandHandler(step.command);
      const result = await handler(request);
      results.push(result);
      totalLlmCalls += result.metadata.llmCalls;
      totalMiyoQueries += result.metadata.miyoQueries;
    }

    const combinedContent = results
      .map((r, i) => `# Step ${i + 1}: ${r.command}\n\n${r.content}`)
      .join("\n\n---\n\n");

    return {
      ok: true,
      steps: results,
      combinedContent,
      metadata: {
        durationMs: Date.now() - start,
        totalLlmCalls,
        totalMiyoQueries,
      },
    };
  }

  private getCommandHandler(
    command: ZettelkastenCommandResponse["command"]
  ): (req: ZettelkastenCommandRequest) => Promise<ZettelkastenCommandResponse> {
    switch (command) {
      case "serendipity":
        return (req) => this.serendipity(req);
      case "cross-domain":
        return (req) => this.crossDomain(req);
      case "echo-chamber":
        return (req) => this.echoChamber(req);
      case "semantic-linker":
        return (req) => this.semanticLinker(req);
      case "orphan-rescue":
        return (req) => this.orphanRescue(req);
      case "health":
        return (req) => this.vaultHealth(req);
    }
  }

  /* ── Link graph builder ──────────────────────────────────────────── */

  private async buildLinkGraph(): Promise<{
    orphans: string[];
    totalFiles: number;
    linkMap: Map<string, Set<string>>;
    filePaths: string[];
    filesScanned: number;
  }> {
    const filePaths = await this.vaultFs.listFiles();
    const totalFiles = filePaths.length;

    const linkMap = new Map<string, Set<string>>();
    const allPaths = new Set(filePaths);

    for (const path of allPaths) {
      linkMap.set(path, new Set());
    }

    let filesScanned = 0;
    for (const filePath of filePaths) {
      let content: string;
      try {
        content = await this.vaultFs.readFile(filePath);
        filesScanned++;
      } catch {
        continue;
      }

      const outboundLinks = new Set(this.vaultFs.extractWikilinks(content));

      for (const target of outboundLinks) {
        const targetMd = target.endsWith(".md") ? target : `${target}.md`;
        const targetNoMd = target.replace(/\.md$/, "");

        const matchedPath =
          allPaths.has(targetMd)
            ? targetMd
            : allPaths.has(targetNoMd)
              ? targetNoMd
              : findPathCaseInsensitive(allPaths, targetMd) ??
                findPathCaseInsensitive(allPaths, targetNoMd);

        if (matchedPath && matchedPath !== filePath) {
          const inbound = linkMap.get(matchedPath) ?? new Set();
          inbound.add(filePath);
          linkMap.set(matchedPath, inbound);
        }
      }
    }

    const orphans = filePaths.filter((p) => {
      if (isSpecialFile(p)) return false;
      const inbound = linkMap.get(p);
      return !inbound || inbound.size === 0;
    });

    return { orphans, totalFiles, linkMap, filePaths, filesScanned };
  }

  /* ── Transitive relationship inference ─────────────────────────────── */

  private inferTransitiveRelationships(
    direct: TypedRelationship[],
    _neighbors: MiyoSearchResult[]
  ): TypedRelationship[] {
    const transitive: TypedRelationship[] = [];
    const existingPairs = new Set(direct.map((r) => `${r.source}\u2192${r.target}`));

    for (const ab of direct) {
      for (const bc of direct) {
        if (ab.target === bc.source && ab.source !== bc.target) {
          const key = `${ab.source}\u2192${bc.target}`;
          if (!existingPairs.has(key)) {
            existingPairs.add(key);
            transitive.push({
              source: ab.source,
              target: bc.target,
              type: "logical",
              subtype: "relates-to",
              confidence: Math.min(ab.confidence, bc.confidence) * 0.8,
              rationale: `Transitive: ${ab.source} ${ab.subtype} ${ab.target} and ${bc.source} ${bc.subtype} ${bc.target}`,
              dataviewSyntax: `[relates-to:: [[${bc.target.replace(/\.md$/, "")}]]]`,
            });
          }
        }
      }
    }

    return transitive.slice(0, 5);
  }

  /* ── Random note selection ─────────────────────────────────────────── */

  private async selectRandomNotes(count: number): Promise<MiyoSearchResult[]> {
    const files = await this.vaultFs.listFiles();
    if (files.length === 0) return [];

    const picked: string[] = [];
    const pool = [...files];
    const n = Math.min(count, pool.length);
    for (let i = 0; i < n; i++) {
      const j = i + Math.floor(Math.random() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
      picked.push(pool[i]);
    }

    return picked.map((p) => ({ path: p, score: undefined }));
  }

  /* ── "On This Day" ─────────────────────────────────────────────────── */

  private async findOnThisDay(limit: number): Promise<MiyoSearchResult[]> {
    const now = new Date();
    const todayMonth = now.getMonth();
    const todayDay = now.getDate();
    const currentYear = now.getFullYear();

    const files = await this.vaultFs.listFiles();
    const results: MiyoSearchResult[] = [];

    for (const filePath of files) {
      if (results.length >= limit) break;
      try {
        const s = await this.vaultFs.stat(filePath);
        const fMonth = s.mtime.getMonth();
        const fDay = s.mtime.getDate();
        const fYear = s.mtime.getFullYear();

        if (fMonth === todayMonth && fDay === todayDay && fYear < currentYear) {
          results.push({ path: filePath, score: undefined, mtime: s.mtime.getTime() });
        }
      } catch {
        continue;
      }
    }

    return results;
  }

  /* ── Domain classification (folder path heuristic) ─────────────────── */

  private classifyByDomain(results: MiyoSearchResult[]): Map<string, MiyoSearchResult[]> {
    const domains = new Map<string, MiyoSearchResult[]>();

    for (const result of results) {
      const parts = result.path.split("/");
      const domain = parts.length > 1 ? parts[0] : "Root";
      const existing = domains.get(domain) ?? [];
      existing.push(result);
      domains.set(domain, existing);
    }

    return domains;
  }

  /* ── Suggestion extraction ─────────────────────────────────────────── */

  private extractSuggestions(...resultSets: MiyoSearchResult[][]): ActionableSuggestion[] {
    const all = deduplicateByPath(resultSets.flat());
    return all.slice(0, 10).map((r) => ({
      targetNote: r.path,
      wikilink: `[[${r.path.replace(/\.md$/, "")}]]`,
      rationale: r.chunk_text?.slice(0, 150) ?? "Semantically related",
      confidence: r.score,
    }));
  }

  /* ── LLM helpers ───────────────────────────────────────────────────── */

  private resolveModel(request: ZettelkastenCommandRequest): ResolvedModelConfig {
    if (request.model) {
      return request.model as ResolvedModelConfig;
    }
    return ModelGateway.fromSettings(this.getSettings());
  }

  private async llmGenerate(
    model: ResolvedModelConfig,
    messages: CanonicalChatMessage[]
  ): Promise<string> {
    const result = await this.modelGateway.generateText({ model, messages });
    return result.text;
  }

  private async llmGenerateJson<T>(
    model: ResolvedModelConfig,
    messages: CanonicalChatMessage[]
  ): Promise<T | null> {
    const text = await this.llmGenerate(model, messages);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }

  /* ── Prompt builders ───────────────────────────────────────────────── */

  private buildSerendipityPrompt(
    noteContent: string,
    conceptResults: MiyoSearchResult[],
    randomNotes: MiyoSearchResult[],
    onThisDay: MiyoSearchResult[]
  ): CanonicalChatMessage[] {
    const vaultContext = this.formatVaultContext("Semantically Related Notes", conceptResults);
    const randomContext = this.formatVaultContext("Random Catalyst Notes", randomNotes);
    const temporalContext = this.formatVaultContext("On This Day (Past Years)", onThisDay);

    return [
      {
        role: "system",
        content:
          'You are a "Serendipity Generator" for a Zettelkasten knowledge base. ' +
          "Your role is to surface unexpected connections, forgotten insights, and novel perspectives. " +
          'Create "happy accidents" by finding surprising links between ideas.\n\n' +
          "You have access to REAL notes from the user's vault. Reference them with [[wikilinks]].\n\n" +
          "Structure your response with these sections:\n" +
          "1. **Temporal Resurfacing**: Why are older notes suddenly relevant now?\n" +
          '2. **Semantic Proximity**: "Aha!" connections using different terminology\n' +
          "3. **Lateral Connections**: Structural similarities from unrelated domains\n" +
          "4. **Graph Gaps**: Distant notes that should connect\n" +
          "5. **Random Catalysts**: Novel juxtapositions from random vault notes\n" +
          "6. **Exploration Prompts**: Questions that spark further discovery\n\n" +
          "Use [[Note Name]] syntax for all note references. Only reference notes that appear in the vault context below.",
      },
      {
        role: "user",
        content:
          `## Current Note\n\n${noteContent.slice(0, 3000)}\n\n` +
          `${vaultContext}\n\n${randomContext}\n\n${temporalContext}\n\n` +
          "Generate serendipity insights grounded in the vault notes above.",
      },
    ];
  }

  private buildCrossDomainPrompt(
    noteContent: string,
    analysis: { structuralPattern?: string; domain?: string; concepts?: string[] } | null,
    domainMap: Map<string, MiyoSearchResult[]>
  ): CanonicalChatMessage[] {
    const domainSections = Array.from(domainMap.entries())
      .map(([domain, results]) => this.formatVaultContext(`Domain: ${domain}`, results))
      .join("\n\n");

    return [
      {
        role: "system",
        content:
          'You are a "Cross-Domain Connector" for a Zettelkasten knowledge base. ' +
          "Your role is to identify structural isomorphisms and create bridges between disparate fields.\n\n" +
          "You have access to REAL notes from the user's vault organized by domain/folder. " +
          "Reference them with [[wikilinks]].\n\n" +
          "Structure your response:\n" +
          "1. **Structural Pattern**: The core shape of the idea\n" +
          "2. **Isomorphisms**: 3-5 domains where this pattern appears (grounded in vault notes)\n" +
          '3. **Analogical Mapping**: Explicit "A is like B because..." format\n' +
          "4. **Universal Principles**: Tags like #feedback-loop, #antifragility, #emergence\n" +
          "5. **Convergence Points**: MOC suggestions connecting domains\n" +
          "6. **Idea Compass**: North (similar), South (opposing), East (cross-domain), West (historical)\n" +
          "7. **Bridge Notes**: Specific cross-pollination link recommendations\n\n" +
          "Use [[Note Name]] syntax for all references.",
      },
      {
        role: "user",
        content:
          `## Current Note\n\n${noteContent.slice(0, 3000)}\n\n` +
          `## Structural Analysis\n${JSON.stringify(analysis ?? {})}\n\n` +
          `## Vault Notes by Domain\n\n${domainSections}\n\n` +
          "Generate cross-domain connections grounded in the vault notes above.",
      },
    ];
  }

  private buildEchoChamberPrompt(
    noteContent: string,
    contradictions: Array<{ assumption: string; evidence: MiyoSearchResult[] }>,
    distantResults: MiyoSearchResult[]
  ): CanonicalChatMessage[] {
    const contradictionSections = contradictions
      .map((c) => {
        const evidence = this.formatVaultContext(`Evidence against: "${c.assumption}"`, c.evidence);
        return `### Assumption: "${c.assumption}"\n${evidence}`;
      })
      .join("\n\n");

    const distantContext = this.formatVaultContext("Semantically Distant but Relevant", distantResults);

    return [
      {
        role: "system",
        content:
          'You are an "Echo Chamber Breaker" for a Zettelkasten knowledge base. ' +
          "Your role is to strengthen understanding through intellectual friction.\n\n" +
          "You have access to REAL notes from the user's vault that may contradict or complicate " +
          "the assumptions in the current note. Reference them with [[wikilinks]].\n\n" +
          "Structure your response:\n" +
          "1. **Core Assumptions Identified**: List the main beliefs\n" +
          "2. **Counterarguments**: 3-5 substantive challenges (grounded in vault evidence where available)\n" +
          "3. **Contradictory Evidence**: What vault notes complicate this perspective?\n" +
          "4. **Cross-Domain Perspectives**: How would a historian/scientist/artist/philosopher view this?\n" +
          '5. **"What If" Scenarios**: 2-3 radical reinterpretations\n' +
          "6. **Semantic Distance Connections**: Non-obvious links from distant vault notes\n\n" +
          "Be respectful but intellectually rigorous. Use [[Note Name]] syntax.",
      },
      {
        role: "user",
        content:
          `## Current Note\n\n${noteContent.slice(0, 3000)}\n\n` +
          `## Vault Evidence per Assumption\n\n${contradictionSections}\n\n` +
          `${distantContext}\n\n` +
          "Generate an echo chamber analysis grounded in the vault evidence above.",
      },
    ];
  }

  /* ── Semantic Linker prompts ──────────────────────────────────────── */

  private buildSemanticLinkerClassificationPrompt(
    sourcePath: string,
    noteContent: string,
    neighbors: Array<{ path: string; snippet: string }>
  ): CanonicalChatMessage[] {
    const neighborList = neighbors
      .map((n, i) => `${i + 1}. **${n.path}**: ${n.snippet.slice(0, 300)}`)
      .join("\n");

    return [
      {
        role: "system",
        content:
          "You are a semantic relationship classifier for a Zettelkasten knowledge base.\n\n" +
          "For each neighbor note, classify the relationship to the source note.\n\n" +
          "Relationship types:\n" +
          "- hierarchical: is-a, part-of, parent-of, instance-of\n" +
          "- causal: causes, enables, prevents, results-in\n" +
          "- temporal: precedes, follows, evolves-into\n" +
          "- logical: supports, contradicts, refines, extends\n" +
          "- social: author-of, influenced-by\n" +
          "- functional: uses, implements, depends-on\n\n" +
          "Return strict JSON:\n" +
          '{"relationships":[{"target":"filename.md","type":"logical","subtype":"supports","confidence":0.85,"rationale":"..."}]}',
      },
      {
        role: "user",
        content:
          `## Source Note: ${sourcePath}\n\n${noteContent.slice(0, 2000)}\n\n` +
          `## Neighbor Notes\n\n${neighborList}\n\n` +
          "Classify the relationship between the source note and each neighbor.",
      },
    ];
  }

  private buildSemanticLinkerSynthesisPrompt(
    sourcePath: string,
    noteContent: string,
    relationships: TypedRelationship[]
  ): CanonicalChatMessage[] {
    const relList = relationships
      .map(
        (r) =>
          `- [[${r.target.replace(/\.md$/, "")}]] \u2014 ${r.subtype} (${r.type}, confidence: ${r.confidence.toFixed(2)}): ${r.rationale}`
      )
      .join("\n");

    const dataviewBlock = relationships.map((r) => r.dataviewSyntax).join("\n");

    return [
      {
        role: "system",
        content:
          'You are a "Semantic Linker" for a Zettelkasten knowledge base. ' +
          "Your role is to define specific typed relationships between notes.\n\n" +
          "You have classified relationships below. Synthesize them into a clear analysis.\n\n" +
          "Structure your response:\n" +
          "1. **Relationship Map**: Visual summary of how this note connects\n" +
          "2. **Key Relationships**: The most important typed connections with rationale\n" +
          "3. **Transitive Chains**: Inferred relationships through intermediate notes\n" +
          "4. **Dataview Metadata**: Copy-paste-ready inline fields\n" +
          "5. **Missing Connections**: Relationships that should exist but don't\n\n" +
          "Use [[Note Name]] syntax for all references.",
      },
      {
        role: "user",
        content:
          `## Source Note: ${sourcePath}\n\n${noteContent.slice(0, 2000)}\n\n` +
          `## Classified Relationships\n\n${relList}\n\n` +
          `## Dataview Syntax Block\n\n\`\`\`\n${dataviewBlock}\n\`\`\`\n\n` +
          "Synthesize these relationships into a structured analysis.",
      },
    ];
  }

  /* ── Orphan Rescuer prompts ────────────────────────────────────────── */

  private buildOrphanSinglePrompt(
    notePath: string,
    noteContent: string,
    neighbors: MiyoSearchResult[]
  ): CanonicalChatMessage[] {
    const vaultContext = this.formatVaultContext("Semantically Related Notes", neighbors);

    return [
      {
        role: "system",
        content:
          'You are an "Orphan Rescuer" for a Zettelkasten knowledge base. ' +
          "Your role is to reintegrate isolated notes into the knowledge graph.\n\n" +
          "You have access to REAL vault notes that are semantically related. " +
          "Reference them with [[wikilinks]].\n\n" +
          "Structure your response:\n" +
          "1. **Orphan Assessment**: Is this note truly isolated? What connections exist?\n" +
          "2. **Key Concepts**: Connection points extracted from the content\n" +
          "3. **Link Suggestions**: 3-5 specific notes to link to, with rationale\n" +
          "4. **Contextual Placement**: MOC assignment, parent note, series membership\n" +
          "5. **Metadata Recommendations**: Tags, aliases, properties for discoverability\n" +
          "6. **Rescue Plan**: Specific actions with link text and tag additions\n\n" +
          "Provide copy-paste-ready Dataview syntax where applicable.",
      },
      {
        role: "user",
        content:
          `## Orphan Note: ${notePath}\n\n${noteContent.slice(0, 3000)}\n\n` +
          `${vaultContext}\n\n` +
          "Generate a rescue plan to reintegrate this note into the knowledge graph.",
      },
    ];
  }

  private buildOrphanBatchPrompt(
    orphans: string[],
    totalFiles: number,
    suggestions: ActionableSuggestion[]
  ): CanonicalChatMessage[] {
    const orphanList = orphans
      .slice(0, 30)
      .map((p) => `- [[${p.replace(/\.md$/, "")}]]`)
      .join("\n");

    const suggestionList = suggestions
      .slice(0, 20)
      .map((s) => `- ${s.rationale}: ${s.wikilink}`)
      .join("\n");

    return [
      {
        role: "system",
        content:
          'You are an "Orphan Rescuer" performing a vault-wide scan. ' +
          "Summarize the orphan situation and provide a prioritized rescue strategy.\n\n" +
          "Structure your response:\n" +
          "1. **Overview**: Orphan count, percentage, severity assessment\n" +
          "2. **High-Priority Orphans**: Which should be rescued first and why\n" +
          "3. **Cluster Analysis**: Do orphans group by topic or folder?\n" +
          "4. **Rescue Strategy**: Batch actions (MOC creation, tag campaigns, etc.)\n" +
          "5. **Suggested MOCs**: New Maps of Content that would connect orphan clusters\n\n" +
          "Use [[Note Name]] syntax for all references.",
      },
      {
        role: "user",
        content:
          `## Vault Stats\n\nTotal files: ${totalFiles}\nOrphan count: ${orphans.length}\n` +
          `Orphan ratio: ${((orphans.length / Math.max(totalFiles, 1)) * 100).toFixed(1)}%\n\n` +
          `## Orphans Found\n\n${orphanList}\n` +
          (orphans.length > 30 ? `\n...and ${orphans.length - 30} more\n` : "") +
          `\n## Rescue Suggestions (from semantic search)\n\n${suggestionList}\n\n` +
          "Generate a prioritized vault-wide rescue strategy.",
      },
    ];
  }

  /* ── Format helpers ────────────────────────────────────────────────── */

  private formatVaultContext(heading: string, results: MiyoSearchResult[]): string {
    if (results.length === 0) {
      return `## ${heading}\n\n(No results found)`;
    }

    const items = results.slice(0, 10).map((r) => {
      const path = r.path;
      const link = `[[${path.replace(/\.md$/, "")}]]`;
      const score = r.score != null ? ` (score: ${r.score.toFixed(3)})` : "";
      const snippet = r.chunk_text
        ? `: ${r.chunk_text.replace(/\s+/g, " ").trim().slice(0, 200)}`
        : "";
      return `- ${link}${score}${snippet}`;
    });

    return `## ${heading}\n\n${items.join("\n")}`;
  }
}

/* ── Utilities ───────────────────────────────────────────────────────── */

function deduplicateByPath(results: MiyoSearchResult[]): MiyoSearchResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.path)) return false;
    seen.add(r.path);
    return true;
  });
}

function findPathCaseInsensitive(paths: Set<string>, target: string): string | undefined {
  const lower = target.toLowerCase();
  for (const p of paths) {
    if (p.toLowerCase() === lower) return p;
  }
  return undefined;
}

function isSpecialFile(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.includes("template") ||
    lower.includes("daily/") ||
    lower.includes("dailies/") ||
    lower.startsWith("copilot/") ||
    lower.startsWith(".obsidian/") ||
    lower.includes("zettelkasten/reports/") ||
    /^\d{4}-\d{2}-\d{2}\.md$/.test(path.split("/").pop() ?? "")
  );
}

const RELATIONSHIP_TYPE_MAP: Record<string, TypedRelationship["type"]> = {
  hierarchical: "hierarchical",
  causal: "causal",
  temporal: "temporal",
  logical: "logical",
  social: "social",
  functional: "functional",
};

const RELATIONSHIP_SUBTYPE_MAP: Record<string, TypedRelationship["subtype"]> = {
  "is-a": "is-a",
  "part-of": "part-of",
  "parent-of": "parent-of",
  "instance-of": "instance-of",
  causes: "causes",
  enables: "enables",
  prevents: "prevents",
  "results-in": "results-in",
  precedes: "precedes",
  follows: "follows",
  "evolves-into": "evolves-into",
  supports: "supports",
  contradicts: "contradicts",
  refines: "refines",
  extends: "extends",
  "relates-to": "relates-to",
  "author-of": "author-of",
  "influenced-by": "influenced-by",
  uses: "uses",
  implements: "implements",
  "depends-on": "depends-on",
};

function normalizeRelationshipType(raw: string): TypedRelationship["type"] {
  return RELATIONSHIP_TYPE_MAP[raw.toLowerCase()] ?? "logical";
}

function normalizeRelationshipSubtype(raw: string): TypedRelationship["subtype"] {
  return RELATIONSHIP_SUBTYPE_MAP[raw.toLowerCase()] ?? "supports";
}
