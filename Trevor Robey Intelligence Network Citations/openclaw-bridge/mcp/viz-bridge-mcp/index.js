"use strict";

// viz-bridge-mcp — engine-side adapter for the Viz Studio bridge (:8800).
//
// WHY THIS EXISTS
// The trinc-viz-studio Obsidian plugin renders visualizations locally (mermaid
// diagrams, SVG charts, Canvas boards, vault link-graph snapshots) behind an
// HTTPS MCP bridge on https://127.0.0.1:8800. This adapter lets the engine —
// which the operator wants producing visuals too — reach those tools the same
// way the obsidian-bridge-mcp adapter reaches the canonical vault bridge:
// a THIN CLIENT. It opens no listener and spawns nothing.
//
// HOW THE ENGINE SHOULD CONSUME IT (deliberate, decided 2026-08-16)
// - Deliverable-render shape ONLY: deterministic post-workflow code (like
//   researchRuntime.ctgovSupplemental) may call chart()/mermaid()/renderSvg().
//   NO prefetch wiring and NO role bindings — engine LLM roles have no mid-run
//   tool loop, and viz output injected into prompts could carry PMID/NCT/DOI-
//   shaped text into the citation gate's grounded-id extraction.
// - Bundle assets must be SVG, never PNG: deliverable-packager.js reads every
//   shipped file as UTF-8 before hashing, which corrupts binary formats.
//   Every generating method therefore defaults returnContent: true and hands
//   back the raw SVG string for the caller to place.
// - The plugin also writes each artifact into the vault under Visualizations/
//   (a namespace nothing else owns), so there is no double-write hazard with
//   Command Center's autoGenerateNotes.
//
// AUTH — bearer token only. The Viz Studio bridge has no replay-guard headers
// (unlike :8798), so this adapter needs neither the time provider nor the
// entropy provider. The token is read from the plugin's own 0600 token file
// (~/.config/trinc-viz-studio/bridge-token) — the same file the bridge reads
// at startup, so there is no second copy of the secret anywhere.
//
// TLS — nothing adapter-specific: the launching process's NODE_EXTRA_CA_CERTS
// (already required for every other local-bridge caller) covers the mkcert CA.
//
// FAIL-SOFT IS MANDATORY. The bridge dies with Obsidian, and run-workflow.js
// can be launched standalone from a terminal. A closed Obsidian must degrade
// to "no visualization", never fail a run: callTool() never throws, and
// available() caches its probe so a closed vault costs one request per process.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_BRIDGE = "https://127.0.0.1:8800";

const VIZ_TOOLS = Object.freeze([
  "viz_health",
  "viz_mermaid",
  "viz_chart",
  "viz_render_svg",
  "viz_canvas",
  "viz_graph_snapshot",
  "viz_guided",
  "viz_perceptual_map",
]);

function defaultTokenPath() {
  return path.join(os.homedir(), ".config", "trinc-viz-studio", "bridge-token");
}

function createVizBridgeMcp(options = {}) {
  const logger =
    options.logger && typeof options.logger.warn === "function"
      ? options.logger
      : { info() {}, warn() {}, error() {} };

  const fetchImpl = options.fetchImpl || (typeof fetch === "function" ? fetch : null);
  const bridgeUrl = String(options.bridgeUrl || DEFAULT_BRIDGE).replace(/\/+$/, "");
  const tokenPath = options.tokenPath || defaultTokenPath();
  const timeoutMs = Number(options.timeoutMs) || 20_000;
  // Injectable so tests don't need a token file on disk.
  const tokenOverride = typeof options.authToken === "string" ? options.authToken : null;

  let cachedToken = tokenOverride;
  let tokenLookupFailed = false;
  // Availability is cached per instance: a closed Obsidian shouldn't cost every caller a timeout.
  let availability = null;

  function readToken() {
    if (cachedToken) return cachedToken;
    if (tokenLookupFailed) return null;
    try {
      const raw = fs.readFileSync(tokenPath, "utf8").trim();
      if (raw.length >= 32) {
        cachedToken = raw;
        return cachedToken;
      }
      logger.warn(`[viz-bridge-mcp] token file looks invalid (too short): ${tokenPath}`);
    } catch (err) {
      logger.warn(
        `[viz-bridge-mcp] cannot read token file (${tokenPath}): ${err && err.message ? err.message : err}`
      );
    }
    tokenLookupFailed = true;
    return null;
  }

  /**
   * One authenticated POST to the bridge's /mcp/tool endpoint.
   * The Viz Studio bridge answers the FLATTENED shape { ok: true, ...fields }
   * (no `data` wrapper). Returns { ok, data?, error?, status? } and NEVER
   * throws — an unreachable bridge must degrade, not abort a run.
   */
  async function callTool(tool, input) {
    if (typeof fetchImpl !== "function") {
      return { ok: false, error: "no fetch implementation available" };
    }
    const token = readToken();
    if (!token) return { ok: false, error: "viz bridge auth token unavailable" };

    const body = JSON.stringify({ tool, input: input || {} });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${bridgeUrl}/mcp/tool`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-mcp-token": token,
        },
        body,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || json.ok !== true) {
        const message =
          (json && json.error && json.error.message) || `HTTP ${res ? res.status : "no-response"}`;
        return { ok: false, error: message, status: res ? res.status : 0 };
      }
      const data = { ...json };
      delete data.ok;
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Is the viz bridge reachable right now? Cached after the first probe.
   * `force: true` re-probes (same cold-start rationale as obsidian-bridge-mcp:
   * for a few seconds after Obsidian launches the plugin may not be listening yet).
   */
  async function available({ force = false } = {}) {
    if (availability !== null && !force) return availability;
    const res = await callTool("viz_health", {});
    availability = res.ok === true;
    if (!availability) {
      logger.warn(`[viz-bridge-mcp] viz bridge unavailable — continuing without it: ${res.error}`);
    }
    return availability;
  }

  async function health() {
    return callTool("viz_health", {});
  }

  /**
   * Render a chart. `spec` mirrors the bridge's viz_chart contract:
   * { type, title?, data: { labels?, series }, options?, format?, fileName?,
   *   folder?, targetNote?, overwrite?, returnContent? }.
   * returnContent defaults true so deliverable renderers get the raw SVG
   * (data.svg) without reading the vault. Fail-soft: { ok: false } on error.
   */
  async function chart(spec = {}) {
    return callTool("viz_chart", { returnContent: true, ...spec });
  }

  /** Create a mermaid diagram (see viz_mermaid contract). */
  async function mermaid(args = {}) {
    return callTool("viz_mermaid", { returnContent: true, ...args });
  }

  /** Sanitize + persist caller-authored SVG (see viz_render_svg contract). */
  async function renderSvg(args = {}) {
    return callTool("viz_render_svg", { returnContent: true, ...args });
  }

  /** Generate an Obsidian Canvas board (see viz_canvas contract). */
  async function canvasBoard(args = {}) {
    return callTool("viz_canvas", { returnContent: true, ...args });
  }

  /** Render the link graph around a vault note (see viz_graph_snapshot contract). */
  async function graphSnapshot(args = {}) {
    return callTool("viz_graph_snapshot", args);
  }

  /**
   * Guided Learning explainer card — banner + staged diagram + legend + step key
   * as ONE SVG (see viz_guided contract). The natural fit for teaching a
   * multi-stage concept inside a deliverable; SVG-only for bundles.
   */
  async function guided(args = {}) {
    return callTool("viz_guided", { returnContent: true, ...args });
  }

  /**
   * Perceptual/positioning map — bipolar axes, quadrants, labeled competitor
   * bubbles (see viz_perceptual_map contract). Deliverables want the SVG image
   * form; format "canvas" exists for vault-side editing, not for bundles.
   */
  async function perceptualMap(args = {}) {
    return callTool("viz_perceptual_map", { returnContent: true, ...args });
  }

  return {
    available,
    health,
    chart,
    mermaid,
    renderSvg,
    canvasBoard,
    graphSnapshot,
    guided,
    perceptualMap,
    // exposed for tests / diagnostics
    _spec: { bridgeUrl, tokenPath, timeoutMs, VIZ_TOOLS },
  };
}

module.exports = { createVizBridgeMcp, VIZ_TOOLS };
