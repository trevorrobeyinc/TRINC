"use strict";

// graph-analysis.js — deterministic, LLM-free structural analysis of a run's synthesizer output,
// rendered as one bounded vault note (2026-09-22, Obsidian re-integration plan, decision D6 = wire).
//
// WHAT IT USES. The Medical Zettelkasten MCP (Claude/Medical-Zettelkasten-MCP) — InfraNodus-style
// text-network analysis reimplemented from the papers: 4-gram co-occurrence graph, Louvain
// communities, Brandes betweenness, structural gaps, Shannon diversity. No LLM, in-memory, ~400 ms
// on a 12 KB synthesizer note. Called IN-PROCESS through the package's own
// `lib/openclaw-bridge-adapter.js` (no stdio server, no listener): its stdio lane was retired from
// the Command Center plugin on 2026-08-20 and nothing had invoked it since, while two business
// documents still advertised it as the post-run analysis. This makes them true again — headless.
//
// WHAT IT IS NOT. The plugin's LLM-driven Zettelkasten linking (`vault-zettelkasten`, hosted
// copilot-plus-flash) stays Obsidian-open and appends to the SYNTHESIZER note; this writes a
// SEPARATE note (`Graph Analysis.md`) so the two never touch the same file.
//
// RENDERING RULES. Bounded (top-N per section), NO wikilinks — the graph's nodes are tokens
// ("docetaxel", "neoadjuvant"), not vault notes, and hundreds of unresolved [[links]] would only
// pollute the vault graph. Identifiers and pipeline vocabulary (PMID/NCT/DOI tokens, "retrieved",
// "live data") are stripped before analysis; measured on a real run they otherwise dominate
// betweenness and hide the science terms.
//
// RESTRICTED GLOBALS: nothing here touches the clock or RNG; the adapter package (outside
// openclaw-bridge/) may.

const fs = require("node:fs");
const path = require("node:path");

const { CITATION_PATTERNS } = require("../core/citation-extractor.js");

const DEFAULT_PACKAGE_ROOT = "/Users/myhome/TRINC/Claude/Medical-Zettelkasten-MCP";
const DEFAULT_MAX_ITEMS = 8;
const MIN_TEXT_CHARS = 200;

// Vocabulary that belongs to the pipeline, not the science. Measured 2026-09-22 on the 07-30 run:
// with these present, top betweenness was pmid > nct > live > retrieve > nsclc.
const PIPELINE_TOKENS = [
  "pmid", "pmids", "nct", "doi", "dois", "chembl", "cid", "uniprot", "ensg",
  "live", "retrieve", "retrieved", "retrieval", "query", "queries", "source", "sources",
  "tooluniverse", "record", "records", "returned", "found", "unavailable", "error", "estimated",
  "verified", "unverified", "verifiable", "citation", "citations", "cite", "cited", "identifier",
  "identifiers", "database", "http", "https", "www", "com", "org", "gov", "md", "json",
  // The synthesizer's own meta-language about its evidence ("no verifiable citation found",
  // "stated by sponsor", "populate the table", "coverage of the universe") — measured leaking into
  // the central concepts of a real run.
  "stated", "plainly", "populate", "populated", "empty", "enumerable", "coverage", "universe",
  "represent", "title", "count", "field", "fields", "pull", "anchor", "absent", "index", "doc",
  "note", "notes", "section", "sections", "table", "tables", "row", "rows", "column", "columns",
  "listed", "list", "item", "items", "remain", "remains"
];

function isPlainObject(v) {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

/** Strip citation identifiers, pipeline lines and pipeline vocabulary before graphing. */
function precleanForGraph(text) {
  let out = String(text || "");
  for (const { regex } of CITATION_PATTERNS) {
    out = out.replace(new RegExp(regex.source, regex.flags), " ");
  }
  out = out
    .split("\n")
    .filter((line) => !/^\s*(\*\*)?(Source|Query|Retrieved)(\*\*)?\s*:/i.test(line))
    .filter((line) => !/^\s*(\*\*)?Live Data/i.test(line))
    .join("\n");
  out = out.replace(/https?:\/\/\S+/g, " ");
  out = out.replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, "$1");
  const vocab = new RegExp(`\\b(${PIPELINE_TOKENS.join("|")})\\b`, "gi");
  out = out.replace(vocab, " ");
  return out.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asText(item) {
  if (typeof item === "string") return item;
  if (isPlainObject(item)) {
    // Echo-chamber blind spot: { gap_between:[a,b], topic_a, topic_b, potential_bridge_concepts }
    if (typeof item.topic_a === "string" || typeof item.topic_b === "string") {
      const pair = Array.isArray(item.gap_between) ? ` (clusters ${item.gap_between.join(" / ")})` : "";
      const bridges = Array.isArray(item.potential_bridge_concepts) && item.potential_bridge_concepts.length
        ? ` — bridge concepts: ${item.potential_bridge_concepts.map(String).join(", ")}`
        : "";
      return `${item.topic_a || "?"} ↔ ${item.topic_b || "?"}${pair}${bridges}`;
    }
    for (const k of ["question", "text", "prompt", "description", "concept", "topic", "label", "name"]) {
      if (typeof item[k] === "string" && item[k].trim()) return item[k].trim();
    }
    return JSON.stringify(item).slice(0, 160);
  }
  return String(item);
}

function createGraphAnalysis(options = {}) {
  const packageRoot = String(options.packageRoot || DEFAULT_PACKAGE_ROOT);
  const maxItems = Math.max(3, Math.min(num(options.maxItems, DEFAULT_MAX_ITEMS), 25));
  const enabled = options.enabled !== false;
  const logger = isPlainObject(options.logger) ? options.logger : { info() {}, warn() {}, error() {} };
  const inputType = String(options.inputType || "openclaw_report");
  let adapter = null;
  let adapterError = null;

  function loadAdapter() {
    if (adapter || adapterError) return adapter;
    const file = path.join(packageRoot, "lib", "openclaw-bridge-adapter.js");
    try {
      if (!fs.existsSync(file)) throw new Error(`Medical Zettelkasten adapter not found at ${file}`);
      const { createOpenClawBridgeAdapter } = withQuietStdout(() => require(file));
      adapter = createOpenClawBridgeAdapter({ logger: { info() {}, warn() {}, error() {} } });
    } catch (err) {
      adapterError = err && err.message ? err.message : String(err);
      logger.warn({ event: "graph_analysis_adapter_unavailable", error: adapterError });
    }
    return adapter;
  }

  /**
   * One of the ZK package's dependencies loads `dotenv`, which (v17+) prints a "◇ injected env"
   * banner to STDOUT at require time. The engine's stdout carries the run's final JSON (and the
   * backfill CLI's `--json`), so that banner would corrupt a machine-readable stream. Ask dotenv to
   * be quiet, and — because the vendored version may predate the switch — drop exactly those lines
   * for the duration of the (synchronous) require.
   */
  function withQuietStdout(fn) {
    if (process.env.DOTENV_CONFIG_QUIET === undefined) process.env.DOTENV_CONFIG_QUIET = "true";
    const original = process.stdout.write;
    process.stdout.write = function quietWrite(chunk, ...rest) {
      const text = typeof chunk === "string" ? chunk : chunk && chunk.toString ? chunk.toString() : "";
      if (/^\s*◇ injected env/.test(text) || /\[dotenv@/.test(text)) {
        const cb = rest.find((r) => typeof r === "function");
        if (cb) cb();
        return true;
      }
      return original.call(process.stdout, chunk, ...rest);
    };
    try {
      return fn();
    } finally {
      process.stdout.write = original;
    }
  }

  /** Run the three analyses on cleaned text. Never throws; { ok:false, reason } on any problem. */
  async function analyze(text) {
    if (!enabled) return { ok: false, reason: "graph analysis disabled" };
    const a = loadAdapter();
    if (!a) return { ok: false, reason: adapterError || "adapter unavailable" };
    const cleaned = precleanForGraph(text);
    if (cleaned.length < MIN_TEXT_CHARS) return { ok: false, reason: `too little text after cleaning (${cleaned.length} chars)` };
    try {
      const net = await a.callTool("analyze_network", { text: cleaned, input_type: inputType, max_gaps: maxItems });
      if (!net.ok) return { ok: false, reason: `analyze_network: ${net.error}` };
      const clusters = await a.callTool("detect_clusters", { text: cleaned, input_type: inputType, min_cluster_size: 3 });
      const echo = await a.callTool("break_echo_chamber", { text: cleaned, input_type: inputType });

      const r = net.result || {};
      const graph = r.graph || {};
      const nodeCount = Array.isArray(graph.nodes) ? graph.nodes.length : num(graph.node_count, 0);
      const edgeCount = Array.isArray(graph.edges) ? graph.edges.length : num(graph.edge_count, 0);
      const communities = r.communities || {};
      const diversity = r.diversity || {};
      const central = Object.entries(r.centrality || {})
        .map(([term, score]) => ({ term: String(term), score: num(score) }))
        .sort((x, y) => y.score - x.score)
        .slice(0, maxItems);
      const gaps = (Array.isArray(r.gaps && r.gaps.gaps) ? r.gaps.gaps : Array.isArray(r.gaps) ? r.gaps : [])
        .slice(0, maxItems)
        .map((g) => ({
          a: num(g.community_a), b: num(g.community_b), score: num(g.gap_score),
          bridges: (Array.isArray(g.bridge_candidates) ? g.bridge_candidates : []).slice(0, maxItems).map(String)
        }));
      const clusterList = (clusters.ok && Array.isArray(clusters.result && clusters.result.clusters) ? clusters.result.clusters : [])
        .slice(0, maxItems)
        .map((c) => ({ id: num(c.community_id), size: num(c.size), terms: (Array.isArray(c.nodes) ? c.nodes : []).slice(0, maxItems).map(String) }));
      const e = (echo.ok && echo.result) || {};
      const blindSpots = (Array.isArray(e.blind_spots) ? e.blind_spots : []).slice(0, maxItems).map(asText);
      const questions = (Array.isArray(e.challenge_questions) ? e.challenge_questions : []).slice(0, maxItems).map(asText);
      const counter = (Array.isArray(e.counter_perspectives) ? e.counter_perspectives : []).slice(0, maxItems).map(asText);

      return {
        ok: true,
        summary: {
          nodes: nodeCount,
          edges: edgeCount,
          communities: num(communities.count),
          modularity: num(communities.modularity),
          diversity: num(diversity.score),
          dominanceRatio: num(diversity.dominanceRatio),
          cleanedChars: cleaned.length
        },
        central,
        clusters: clusterList,
        gaps,
        blindSpots,
        questions,
        counterPerspectives: counter
      };
    } catch (err) {
      const reason = err && err.message ? err.message : String(err);
      logger.warn({ event: "graph_analysis_failed", error: reason });
      return { ok: false, reason };
    }
  }

  /** Bounded, wikilink-free markdown for the vault. Deterministic for a given analysis. */
  function render(analysis, { title = "Graph Analysis", workflowId = "" } = {}) {
    if (!analysis || analysis.ok !== true) return "";
    const s = analysis.summary;
    const lines = [];
    lines.push(`# ${title}`, "");
    lines.push(`Workflow: [[Overview]]${workflowId ? ` (\`${workflowId}\`)` : ""}`, "");
    lines.push("> Deterministic text-network analysis of the synthesizer output (Medical Zettelkasten MCP: co-occurrence graph, Louvain communities, Brandes betweenness, Shannon diversity). No language model was involved; identifiers and pipeline vocabulary were stripped before analysis. Terms below are graph nodes, not vault notes.", "");
    lines.push("## Summary", "", "| Metric | Value |", "|---|---|");
    lines.push(`| Concept nodes | ${s.nodes} |`, `| Co-occurrence edges | ${s.edges} |`, `| Topical communities | ${s.communities} |`);
    lines.push(`| Modularity | ${s.modularity.toFixed(3)} |`, `| Diversity (0–1) | ${s.diversity.toFixed(2)} |`, `| Dominant-cluster share | ${(s.dominanceRatio * 100).toFixed(1)}% |`, "");
    if (analysis.central.length) {
      lines.push("## Central concepts (betweenness)", "");
      for (const c of analysis.central) lines.push(`- ${c.term} — ${c.score.toFixed(3)}`);
      lines.push("");
    }
    if (analysis.clusters.length) {
      lines.push("## Topical clusters (largest first)", "");
      for (const c of analysis.clusters) lines.push(`- Cluster ${c.id} (${c.size} terms): ${c.terms.join(", ")}`);
      lines.push("");
    }
    if (analysis.gaps.length) {
      lines.push("## Structural gaps (unconnected clusters, largest first)", "");
      for (const g of analysis.gaps) lines.push(`- Cluster ${g.a} ↔ Cluster ${g.b} — gap score ${g.score}${g.bridges.length ? `; bridge candidates: ${g.bridges.join(", ")}` : ""}`);
      lines.push("");
    }
    if (analysis.blindSpots.length) {
      lines.push("## Blind spots", "");
      for (const b of analysis.blindSpots) lines.push(`- ${b}`);
      lines.push("");
    }
    if (analysis.questions.length) {
      lines.push("## Challenge questions", "");
      for (const q of analysis.questions) lines.push(`- ${q}`);
      lines.push("");
    }
    // counterPerspectives is kept on the analysis object for callers but not rendered: on a real
    // run it degenerates to "<top term> vs <other term>" pairs with no explanatory value.
    return lines.join("\n").replace(/\[\[(?!Overview\]\])/g, "");
  }

  return Object.freeze({ analyze, render, enabled, _spec: Object.freeze({ packageRoot, maxItems, inputType }) });
}

module.exports = { createGraphAnalysis, precleanForGraph, PIPELINE_TOKENS };
