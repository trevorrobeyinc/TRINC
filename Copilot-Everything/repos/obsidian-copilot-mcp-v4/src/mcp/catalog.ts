import { z } from "zod";
import type { McpServerConfig } from "./types";

export interface McpCatalogEntry {
  toolName: string;
  displayName: string;
  description: string;
  categoryDescription?: string;
  /**
   * Bridge operation hint. The bridge validates this against a STRICT zod enum
   * (obsidian ops only) BEFORE dispatching, so a tool whose name is not in this
   * list MUST omit `operation` entirely — the dispatcher keys on `tool` anyway.
   * Verified 2026-08-12: sending operation:"miyo_search_context" returns HTTP 400
   * invalid_enum_value.
   */
  operation?:
    | "open_vault"
    | "create_note"
    | "append_note"
    | "read_note"
    | "search_notes"
    | "execute_command";
  isMutating: boolean;
  schema: z.ZodTypeAny;
  buildInput: (args: Record<string, unknown>, server: McpServerConfig) => Record<string, unknown>;
}

// ── Vault Zettelkasten shared schema (zk_* tools below) ───────────────
// Note-scoped analyses accept a vault path OR raw text; the bridge enforces
// that one of the two is present (health needs neither).
const zkAnalysisSchema = z.object({
  notePath: z
    .string()
    .optional()
    .describe("Vault-relative path of the note to analyze (this or noteContent is required)"),
  noteContent: z
    .string()
    .optional()
    .describe("Raw note text to analyze instead of a vault path"),
  limit: z
    .number()
    .int()
    .positive()
    .max(50)
    .optional()
    .describe("Max suggestions/results (default 10)"),
});

export const MCP_TOOL_CATALOG: Record<string, McpCatalogEntry> = {
  obsidian_health: {
    toolName: "obsidian_health",
    displayName: "Obsidian MCP Health",
    description: "Check the configured MCP bridge health, routing, and security state.",
    isMutating: false,
    schema: z.object({}),
    buildInput: () => ({}),
  },
  obsidian_open_vault: {
    toolName: "obsidian_open_vault",
    displayName: "Open Vault",
    description: "Open the configured Obsidian vault or a path within it via the MCP bridge.",
    operation: "open_vault",
    isMutating: false,
    schema: z.object({
      path: z.string().optional().describe("Optional vault-relative path to open"),
      paneType: z
        .enum(["tab", "split", "window"])
        .optional()
        .describe("How the target should open in Obsidian"),
    }),
    buildInput: (args, server) => ({
      vault: server.vaultName,
      path: args.path,
      paneType: args.paneType,
    }),
  },
  obsidian_read_note: {
    toolName: "obsidian_read_note",
    displayName: "Read Note via MCP",
    description: "Read a vault note through the configured MCP bridge.",
    operation: "read_note",
    isMutating: false,
    schema: z.object({
      path: z.string().min(1).describe("Vault-relative path to read"),
    }),
    buildInput: (args, server) => ({
      vault: server.vaultName,
      vaultRoot: server.vaultRoot,
      path: args.path,
    }),
  },
  obsidian_search_notes: {
    toolName: "obsidian_search_notes",
    displayName: "Search Notes via MCP",
    description: "Search notes through the configured MCP bridge.",
    operation: "search_notes",
    isMutating: false,
    schema: z.object({
      query: z.string().min(1).describe("Search query"),
      path: z.string().optional().describe("Optional folder path limit"),
      limit: z.number().int().positive().max(500).optional().describe("Optional result limit"),
      caseSensitive: z.boolean().optional().describe("Whether the search should be case sensitive"),
    }),
    buildInput: (args, server) => ({
      vault: server.vaultName,
      query: args.query,
      path: args.path,
      limit: args.limit,
      caseSensitive: args.caseSensitive,
    }),
  },
  obsidian_execute_command: {
    toolName: "obsidian_execute_command",
    displayName: "Execute Command via MCP",
    description: "Execute an Obsidian command ID through the MCP bridge.",
    operation: "execute_command",
    // Security (audit RF-3): command execution is mutating/dangerous — classify it as such
    // so read-only / prompt-on-writes policies correctly withhold it.
    isMutating: true,
    schema: z.object({
      id: z.string().min(1).describe("Obsidian command ID to execute"),
    }),
    buildInput: (args, server) => ({
      vault: server.vaultName,
      id: args.id,
    }),
  },
  obsidian_create_note: {
    toolName: "obsidian_create_note",
    displayName: "Create Note via MCP",
    description: "Create a note through the configured MCP bridge.",
    operation: "create_note",
    isMutating: true,
    schema: z.object({
      path: z.string().min(1).describe("Vault-relative note path to create"),
      content: z.string().default("").describe("Initial note content"),
      overwrite: z.boolean().optional().describe("Whether to overwrite an existing note"),
      open: z.boolean().optional().describe("Whether to open the note after creation"),
      newtab: z.boolean().optional().describe("Whether to open the note in a new tab"),
    }),
    buildInput: (args, server) => ({
      vault: server.vaultName,
      vaultRoot: server.vaultRoot,
      path: args.path,
      content: args.content,
      overwrite: args.overwrite,
      open: args.open,
      newtab: args.newtab,
    }),
  },
  obsidian_append_note: {
    toolName: "obsidian_append_note",
    displayName: "Append Note via MCP",
    description: "Append content to a note through the configured MCP bridge.",
    operation: "append_note",
    isMutating: true,
    schema: z.object({
      path: z.string().min(1).describe("Vault-relative note path"),
      content: z.string().min(1).describe("Content to append"),
      inline: z.boolean().optional().describe("Append without a leading newline"),
      idempotencyKey: z
        .string()
        .optional()
        .describe("Optional idempotency key; generated automatically if omitted"),
    }),
    buildInput: (args, server) => ({
      vault: server.vaultName,
      vaultRoot: server.vaultRoot,
      path: args.path,
      content: args.content,
      inline: args.inline,
      idempotencyKey: args.idempotencyKey,
    }),
  },
  // ── OpenClaw research-engine control surface ──────────────────────
  // Served by the Command Center bridge (:8799), which spawns run-workflow.js.
  // Completed-run output is pushed back into chat via the :8798 bridge's
  // `research` SSE stream (see McpEventBridge), so these tools drive the engine
  // while results arrive asynchronously as chat bubbles.
  obsidian_openclaw_run_workflow: {
    toolName: "obsidian_openclaw_run_workflow",
    displayName: "Run OpenClaw Research Workflow",
    description:
      "Start an OpenClaw research-engine workflow via the Command Center bridge. Launches a real, compute-costing run (typically 5-10 minutes); monitor with obsidian_openclaw_status and read output with obsidian_openclaw_results (results also arrive as a chat bubble when the run finishes).",
    // Mutating: launches a real research run (spawns run-workflow.js, consumes compute).
    isMutating: true,
    schema: z.object({
      template: z
        .string()
        .min(1)
        .describe("Workflow template id (use obsidian_openclaw_templates to list available ids)"),
      inputs: z
        // Zod v4 (upstream 4.0.0) requires explicit key AND value types for
        // z.record(); v3 allowed z.record(valueType) alone. Ported 2026-08-12.
        .record(z.string(), z.string())
        .optional()
        .describe("Template inputs as string key/value pairs (e.g. { indication: 'NSCLC' })"),
    }),
    buildInput: (args) => ({
      template: args.template,
      inputs: args.inputs ?? {},
    }),
  },
  obsidian_openclaw_status: {
    toolName: "obsidian_openclaw_status",
    displayName: "OpenClaw Workflow Status",
    description:
      "Check the status (idle / running / completed) of the current or most recent OpenClaw research workflow.",
    isMutating: false,
    schema: z.object({}),
    buildInput: () => ({}),
  },
  obsidian_openclaw_results: {
    toolName: "obsidian_openclaw_results",
    displayName: "OpenClaw Workflow Results",
    description: "Fetch the results of the most recent completed OpenClaw research workflow.",
    isMutating: false,
    schema: z.object({}),
    buildInput: () => ({}),
  },
  obsidian_openclaw_templates: {
    toolName: "obsidian_openclaw_templates",
    displayName: "OpenClaw Workflow Templates",
    description: "List the OpenClaw research workflow templates available to run.",
    isMutating: false,
    schema: z.object({}),
    buildInput: () => ({}),
  },
  // ── OpenClaw engine suite (added 2026-08-20) ──────────────────────
  // Extends the workflow lane to the engine's full agent-safe surface via the
  // same :8799 Command Center bridge. Contract of record:
  // Claude/obsidian-command-center/src/bridge/mcp-bridge-server.ts (keep in
  // sync — the bridge does server-side validation; these schemas mirror it).
  // NO `operation` field on any of these. Deliberately NOT exposed anywhere:
  // dataset missions, interaction logs, release packaging/token scripts, feed
  // REBUILDS, delivery-evidence rebuild mode.
  obsidian_openclaw_cancel: {
    toolName: "obsidian_openclaw_cancel",
    displayName: "Cancel OpenClaw Workflow",
    description:
      "Cancel the currently running OpenClaw workflow (SIGTERM, SIGKILL after 5s). The engine's " +
      "timeout is warn-only, so this is the ONLY way to stop a runaway or mistaken run.",
    // Mutating: terminates a real engine subprocess.
    isMutating: true,
    schema: z.object({}),
    buildInput: () => ({}),
  },
  obsidian_openclaw_history: {
    toolName: "obsidian_openclaw_history",
    displayName: "OpenClaw Run History",
    description:
      "List past OpenClaw workflow runs (newest first): workflow_id, template, status, " +
      "created/completed timestamps, inputs. Use the ids with status/artifacts/citation tools.",
    isMutating: false,
    schema: z.object({
      limit: z.number().int().min(1).max(50).optional().describe("Max entries (default 20)"),
    }),
    buildInput: (args) => ({ ...args }),
  },
  obsidian_openclaw_artifacts: {
    toolName: "obsidian_openclaw_artifacts",
    displayName: "OpenClaw Run Artifacts",
    description:
      "Artifacts of a workflow run: engine run-dir files, artifact ids, and the vault notes " +
      "folder with its note paths (read them with obsidian_read_note). Defaults to the latest run.",
    isMutating: false,
    schema: z.object({
      workflow_id: z.string().optional().describe("Workflow id (default: latest run)"),
    }),
    buildInput: (args) => ({ ...args }),
  },
  obsidian_openclaw_engine_health: {
    toolName: "obsidian_openclaw_engine_health",
    displayName: "OpenClaw Engine Health",
    description:
      "Read-only, ungated engine health check: Node runtime verification, a mock-provider LLM " +
      "probe (never real model spend, never the operator gate), and the connector-coverage " +
      "audit. Takes ~30-60s.",
    isMutating: false,
    schema: z.object({}),
    buildInput: () => ({}),
  },
  obsidian_openclaw_research_task: {
    toolName: "obsidian_openclaw_research_task",
    displayName: "OpenClaw Ad-hoc Research Task",
    description:
      "Run a single ad-hoc research task on the engine. provider 'mock' is fast and ungated " +
      "(pipeline verification, deterministic output); provider 'real' uses the engine's default " +
      "provider chain and REQUIRES a freshly armed one-shot operator-approve token (300s TTL) — " +
      "if unarmed you get operator_gate_not_armed with instructions to relay to the user. " +
      "Real tasks can take minutes.",
    // Mutating: launches engine compute and writes task outputs to the workspace.
    isMutating: true,
    schema: z.object({
      task: z.string().min(1).max(2000).describe("Task description"),
      type: z
        .enum(["summarize", "extract", "analyze", "synthesize", "freeform"])
        .optional()
        .describe("Task type (default freeform)"),
      provider: z
        .enum(["mock", "real"])
        .optional()
        .describe("mock = fast/ungated (default); real = gate-protected default provider chain"),
    }),
    buildInput: (args) => ({ ...args }),
  },
  obsidian_openclaw_research_tasks_list: {
    toolName: "obsidian_openclaw_research_tasks_list",
    displayName: "OpenClaw Research Tasks",
    description: "List past ad-hoc research tasks (read-only, instant).",
    isMutating: false,
    schema: z.object({}),
    buildInput: () => ({}),
  },
  obsidian_openclaw_research_output: {
    toolName: "obsidian_openclaw_research_output",
    displayName: "OpenClaw Research Output",
    description:
      "Read one ad-hoc research task's stored output by task id (read-only; truncated at 100k chars).",
    isMutating: false,
    schema: z.object({
      task_id: z.string().min(1).max(64).describe("Task id from research_tasks_list"),
    }),
    buildInput: (args) => ({ ...args }),
  },
  obsidian_openclaw_delivery_evidence: {
    toolName: "obsidian_openclaw_delivery_evidence",
    displayName: "OpenClaw Delivery Evidence",
    description:
      "Verify delivery evidence for a shipped offer. Modes: full or incremental only — the " +
      "rebuild mode writes derived snapshots and is operator-only, not exposed here.",
    isMutating: false,
    schema: z.object({
      mode: z
        .enum(["full", "incremental"])
        .optional()
        .describe("Verification mode (default incremental)"),
      offer_id: z.string().optional().describe("Optional offer id to scope to"),
    }),
    buildInput: (args) => ({ ...args }),
  },
  obsidian_openclaw_citation_integrity: {
    toolName: "obsidian_openclaw_citation_integrity",
    displayName: "OpenClaw Citation Integrity",
    description:
      "A run's citation-integrity record: the runtime verification verdict (grounded_ratio vs " +
      "min_grounded_ratio is the shippable gate), ungrounded and retracted lists, plus the " +
      "reproducibility manifest summary. Quote these fields as-is — never restate extraction " +
      "tallies as accuracy claims to a customer.",
    isMutating: false,
    schema: z.object({
      workflow_id: z.string().optional().describe("Workflow id (default: latest run)"),
    }),
    buildInput: (args) => ({ ...args }),
  },
  obsidian_openclaw_feed_stats: {
    toolName: "obsidian_openclaw_feed_stats",
    displayName: "Trial Graveyard Feed Stats",
    description:
      "Read-only profile of the shipped Trial Graveyard Feed registers: per indication, " +
      "paid/free row counts, as_of dates, status and amendment-risk distributions. Never " +
      "rebuilds or modifies feed data.",
    isMutating: false,
    schema: z.object({}),
    buildInput: () => ({}),
  },
  // Added 2026-08-12 during the 4.0.0 port. Schema mirrors the bridge's own
  // zod schema in obsidian-copilot-bridge/src/server/tools/miyoSearchContext.ts:
  //   { query: string().min(1), vault?: string().min(1), limit?: int 1..20 (default 5) }
  // NOTE: deliberately NO `operation` field — the bridge validates `operation`
  // against a strict enum of the 6 obsidian ops and 400s on anything else.
  // The dispatcher keys on the full tool name, sent as `tool`. Verified live.
  miyo_search_context: {
    toolName: "miyo_search_context",
    displayName: "Miyo Semantic Vault Search",
    description:
      "Semantic (embedding-based) search over the vault via Miyo, through the MCP bridge. " +
      "Use for meaning-based recall; use obsidian_search_notes for literal keyword matches.",
    isMutating: false,
    schema: z.object({
      query: z.string().min(1).describe("Natural-language search query"),
      limit: z
        .number()
        .int()
        .positive()
        .max(20)
        .optional()
        .describe("Max results (1-20, bridge default 5)"),
    }),
    buildInput: (args, server) => ({
      vault: server.vaultName,
      query: args.query,
      limit: args.limit,
    }),
  },
  // ── Viz Studio (:8800, trinc-viz-studio plugin) ─────────────────────────
  // Added 2026-08-16. Schemas mirror the bridge's own tools/list declarations
  // in Claude/obsidian-viz-studio/src/bridge/toolSchemas.ts (the contract of
  // record — keep in sync). Like miyo_search_context: NO `operation` field
  // (the :8798 strict enum does not apply here, and the Viz Studio dispatcher
  // keys on the full tool name), and args pass through unchanged — the bridge
  // owns vault context. Tool results are text/JSON only: every tool writes
  // into the vault and returns {path, embed} for the model to insert into a
  // note; images never render in chat.
  viz_health: {
    toolName: "viz_health",
    displayName: "Viz Studio Health",
    description:
      "Check the Viz Studio bridge: available viz tools, mermaid availability, output folders.",
    isMutating: false,
    schema: z.object({}),
    buildInput: () => ({}),
  },
  viz_mermaid: {
    toolName: "viz_mermaid",
    displayName: "Viz Studio Mermaid Diagram",
    description:
      "Create a Mermaid diagram (flowchart, sequence, mindmap, gantt, pie, …). Default format " +
      "'note' writes a ```mermaid fence Obsidian renders natively; 'svg'/'png' export an image. " +
      "Source is validated first — on a syntax error the mermaid parser message comes back " +
      "verbatim so you can correct and retry. Returns the vault path and an ![[embed]] string — " +
      "insert the embed into a note to display; images do not render in chat.",
    isMutating: true,
    schema: z.object({
      source: z.string().min(1).describe("Raw mermaid source WITHOUT the ```mermaid fence"),
      title: z.string().optional().describe("Diagram title (note heading + filename)"),
      format: z.enum(["note", "svg", "png"]).optional().describe("Default note (native render)"),
      fileName: z.string().optional().describe("Exact base filename (no extension)"),
      folder: z.string().optional().describe("Vault-relative output folder override"),
      targetNote: z
        .string()
        .optional()
        .describe("Note to append the result to (created if missing)"),
      overwrite: z.boolean().optional().describe("Replace instead of -2/-3 suffixing"),
      returnContent: z.boolean().optional().describe("Include raw content in the result"),
    }),
    buildInput: (args) => ({ ...args }),
  },
  viz_chart: {
    toolName: "viz_chart",
    displayName: "Viz Studio Chart",
    description:
      "Render a data chart (bar, line, area, scatter, pie, donut) to an SVG/PNG vault " +
      "attachment — deterministic local rendering. Returns the vault path and an ![[embed]] " +
      "string — insert the embed into a note to display; images do not render in chat.",
    isMutating: true,
    schema: z.object({
      type: z.enum(["bar", "line", "area", "scatter", "pie", "donut"]),
      title: z.string().optional(),
      data: z.object({
        labels: z.array(z.string()).optional().describe("Category labels / pie slice names"),
        series: z
          .array(
            z.object({
              name: z.string(),
              values: z.array(z.number()).optional().describe("One value per label"),
              points: z
                .array(z.tuple([z.number(), z.number()]))
                .optional()
                .describe("[x, y] pairs (scatter)"),
            })
          )
          .min(1),
      }),
      options: z
        .object({
          width: z.number().optional(),
          height: z.number().optional(),
          stacked: z.boolean().optional(),
          legend: z.boolean().optional(),
          xLabel: z.string().optional(),
          yLabel: z.string().optional(),
          yMin: z.number().optional(),
          yMax: z.number().optional(),
          palette: z.array(z.string()).optional(),
          background: z.string().optional(),
        })
        .optional(),
      format: z.enum(["svg", "png"]).optional(),
      fileName: z.string().optional(),
      folder: z.string().optional(),
      targetNote: z.string().optional(),
      overwrite: z.boolean().optional(),
      returnContent: z.boolean().optional(),
    }),
    buildInput: (args) => ({ ...args }),
  },
  viz_render_svg: {
    toolName: "viz_render_svg",
    displayName: "Viz Studio Render SVG",
    description:
      "Save self-contained SVG markup you author as a vault image (optionally rasterized to " +
      "PNG). Scripts, event handlers, foreignObject and external references are stripped and " +
      "reported in warnings. Returns the vault path and an ![[embed]] string — insert the embed " +
      "into a note to display; images do not render in chat.",
    isMutating: true,
    schema: z.object({
      svg: z.string().min(1).describe("Complete <svg>…</svg> markup, self-contained"),
      format: z.enum(["svg", "png"]).optional(),
      fileName: z.string().optional(),
      folder: z.string().optional(),
      targetNote: z.string().optional(),
      overwrite: z.boolean().optional(),
      returnContent: z.boolean().optional(),
    }),
    buildInput: (args) => ({ ...args }),
  },
  viz_canvas: {
    toolName: "viz_canvas",
    displayName: "Viz Studio Canvas Board",
    description:
      "Generate an Obsidian Canvas (.canvas) board — mind map, flow board, or cluster map — " +
      "from nodes and edges with automatic layout (grid, tree, radial). Node kinds: text, " +
      "file (vault note preview), url; optional group frames. Returns the vault path and an " +
      "![[embed]] string for display.",
    isMutating: true,
    schema: z.object({
      title: z.string().optional(),
      nodes: z
        .array(
          z.object({
            id: z.string(),
            label: z.string().optional(),
            text: z.string().optional(),
            file: z.string().optional(),
            url: z.string().optional(),
            group: z.string().optional(),
            color: z.string().optional().describe('"1"-"6" or "#rrggbb"'),
          })
        )
        .min(1),
      edges: z
        .array(
          z.object({
            from: z.string(),
            to: z.string(),
            label: z.string().optional(),
            color: z.string().optional(),
          })
        )
        .optional(),
      layout: z.enum(["grid", "tree", "radial"]).optional(),
      fileName: z.string().optional(),
      folder: z.string().optional(),
      targetNote: z.string().optional(),
      overwrite: z.boolean().optional(),
      returnContent: z.boolean().optional(),
    }),
    buildInput: (args) => ({ ...args }),
  },
  viz_guided: {
    toolName: "viz_guided",
    displayName: "Viz Studio Guided Learning Card",
    description:
      "Build a Guided Learning Visual Explainer Card — reach for this when TEACHING a " +
      "multi-stage technical concept (how a system works, an attack path, a request " +
      "lifecycle). From a structured spec it produces ONE self-contained SVG: title banner, " +
      "themed diagram with numbered stage groups and semantic node shapes, an auto-generated " +
      "legend, and a numbered step-by-step breakdown underneath. Edge 'kind' sets the line " +
      "semantics (data = solid, mirror/control = dashed, blocked = bold red). Presets: " +
      "flow_progression, network_segmentation, threat_containment, data_vs_control_plane. " +
      "Use viz_mermaid instead for a plain diagram with no teaching chrome. Returns the vault " +
      "path and an ![[embed]] string — insert the embed into a note to display; images do not " +
      "render in chat.",
    isMutating: true,
    schema: z.object({
      title: z.string().min(1).describe("Card headline"),
      subtitle: z.string().optional(),
      preset: z
        .enum([
          "flow_progression",
          "network_segmentation",
          "threat_containment",
          "data_vs_control_plane",
        ])
        .optional(),
      spec: z
        .object({
          stages: z
            .array(
              z.object({
                id: z.string(),
                label: z.string(),
                note: z.string().optional().describe("Used as step detail when steps are omitted"),
              })
            )
            .optional(),
          nodes: z
            .array(
              z.object({
                id: z.string(),
                label: z.string().describe("Use \\n for a line break"),
                stage: z.string().optional().describe("Stage/group id"),
                kind: z
                  .string()
                  .optional()
                  .describe(
                    "endpoint | infra | transit | server | datastore | sensor | control | threat | asset | decision | step"
                  ),
                shape: z
                  .enum(["process", "endpoint", "decision", "datastore", "sensor", "actor"])
                  .optional(),
                badge: z.string().optional().describe('Short prefix inside the node, e.g. "L2"'),
              })
            )
            .min(1)
            .max(60),
          edges: z
            .array(
              z.object({
                from: z.string(),
                to: z.string(),
                label: z.string().optional(),
                kind: z.enum(["data", "mirror", "control", "blocked"]).optional(),
              })
            )
            .optional(),
        })
        .optional()
        .describe("Structured spec. Provide this OR mermaid, never both."),
      mermaid: z.string().optional().describe("Raw Mermaid to wrap in card chrome instead"),
      steps: z
        .array(z.object({ title: z.string(), detail: z.string().optional() }))
        .optional()
        .describe("Bottom breakdown key; defaults to the stage list"),
      legend: z.array(z.object({ label: z.string(), color: z.string().optional() })).optional(),
      theme: z.enum(["contrast", "slate", "blueprint"]).optional(),
      direction: z.enum(["TB", "LR"]).optional(),
      width: z.number().optional(),
      sources: z
        .array(z.string())
        .optional()
        .describe(
          "Vault notes this lesson was built from (paths or [[wikilinks]]) — rendered into the note as 'Sources from your vault'"
        ),
      stepKeyNote: z
        .boolean()
        .optional()
        .describe(
          "Write the full lesson to a NEW note (image + step key + sources + source). Use this OR targetNote, not both"
        ),
      useActiveTab: z
        .boolean()
        .optional()
        .describe(
          "Put the lesson where the user is working: appended to the open NOTE, or added as a card in the open CANVAS (detected automatically)"
        ),
      useActiveNote: z.boolean().optional().describe("Alias of useActiveTab"),
      targetCanvas: z
        .string()
        .optional()
        .describe(
          "Canvas to add the lesson to (created if missing); existing nodes and edges are preserved"
        ),
      canvasNode: z
        .enum(["note", "image"])
        .optional()
        .describe(
          "Canvas card kind: 'note' embeds the lesson note (default), 'image' the card only"
        ),
      open: z
        .boolean()
        .optional()
        .describe("Open the lesson note when done so the user sees it (default true)"),
      format: z.enum(["svg", "png"]).optional(),
      fileName: z.string().optional(),
      folder: z.string().optional(),
      targetNote: z.string().optional(),
      overwrite: z.boolean().optional(),
      returnContent: z.boolean().optional(),
    }),
    buildInput: (args) => ({ ...args }),
  },
  viz_perceptual_map: {
    toolName: "viz_perceptual_map",
    displayName: "Viz Studio Perceptual Map",
    description:
      "Create a perceptual/positioning map (the marketing 2×2): two bipolar attribute axes " +
      "crossing at the center, competitors plotted as labeled bubbles with optional segment " +
      "colors, bubble sizing, and quadrant captions. format 'svg'/'png' renders one image to " +
      "embed in a note; format 'canvas' builds a native Obsidian Canvas board where each " +
      "competitor is a DRAGGABLE card inside four quadrant frames. targetCanvas adds the map " +
      "to an existing canvas; useActiveTab puts it wherever the user is working. Returns the " +
      "vault path and an ![[embed]] string — insert the embed into a note to display; images " +
      "do not render in chat.",
    isMutating: true,
    schema: z.object({
      title: z.string().optional().describe("Map headline; also the default filename"),
      xAxis: z.object({
        low: z.string().describe('Left pole label, e.g. "Low Price"'),
        high: z.string().describe('Right pole label, e.g. "High Price"'),
        label: z.string().optional().describe('Attribute name, e.g. "Price"'),
      }),
      yAxis: z.object({
        low: z.string().describe('Bottom pole label, e.g. "Low Quality"'),
        high: z.string().describe('Top pole label, e.g. "High Quality"'),
        label: z.string().optional().describe('Attribute name, e.g. "Quality"'),
      }),
      items: z
        .array(
          z.object({
            label: z.string(),
            x: z.number().describe("Position within scale (default -10..10)"),
            y: z.number().describe("Position within scale (default -10..10)"),
            segment: z
              .string()
              .optional()
              .describe("Optional grouping (e.g. market segment) → shared color + legend"),
            color: z.string().optional().describe('"#rrggbb" override'),
            size: z
              .number()
              .optional()
              .describe("Relative bubble weight (e.g. market share); scales the radius"),
          })
        )
        .min(1)
        .max(60)
        .describe("Competitors/brands to plot"),
      quadrantLabels: z
        .object({
          topLeft: z.string().optional(),
          topRight: z.string().optional(),
          bottomLeft: z.string().optional(),
          bottomRight: z.string().optional(),
        })
        .optional()
        .describe("Muted captions in the four quadrant corners"),
      scale: z
        .object({ min: z.number(), max: z.number() })
        .optional()
        .describe("Value range shared by both axes; default -10..10"),
      options: z
        .object({
          width: z.number().optional(),
          height: z.number().optional(),
          legend: z.boolean().optional(),
          grid: z.boolean().optional(),
          background: z.string().optional(),
          palette: z.array(z.string()).optional(),
        })
        .optional(),
      format: z
        .enum(["svg", "png", "canvas"])
        .optional()
        .describe("svg/png = image attachment; canvas = editable board with draggable cards"),
      targetCanvas: z
        .string()
        .optional()
        .describe(
          "Canvas to add the map to (created if missing): 'canvas' format inserts the board; svg/png insert the image as a card"
        ),
      useActiveTab: z
        .boolean()
        .optional()
        .describe(
          "Put the map where the user is working: appended to the open NOTE, or added to the open CANVAS (detected automatically)"
        ),
      open: z.boolean().optional().describe("Open the result in Obsidian when done (default true)"),
      fileName: z.string().optional(),
      folder: z.string().optional(),
      targetNote: z.string().optional(),
      overwrite: z.boolean().optional(),
      returnContent: z.boolean().optional(),
    }),
    buildInput: (args) => ({ ...args }),
  },
  viz_graph_snapshot: {
    toolName: "viz_graph_snapshot",
    displayName: "Viz Studio Graph Snapshot",
    description:
      "Render the wikilink graph around a vault note (from Obsidian's metadata cache) as an " +
      "SVG/PNG image, optionally with a clickable .canvas companion. Returns the vault path and " +
      "an ![[embed]] string for display.",
    isMutating: true,
    schema: z.object({
      focus: z.string().min(1).describe("Note name or vault path at the center"),
      depth: z.number().int().min(1).max(4).optional().describe("Link hops (default 2)"),
      maxNodes: z.number().int().min(2).max(300).optional().describe("Default 100"),
      includeUnresolved: z.boolean().optional(),
      canvasCompanion: z.boolean().optional(),
      format: z.enum(["svg", "png"]).optional(),
      fileName: z.string().optional(),
      folder: z.string().optional(),
      targetNote: z.string().optional(),
      overwrite: z.boolean().optional(),
      returnContent: z.boolean().optional(),
    }),
    buildInput: (args) => ({ ...args }),
  },
  // ── Vault Zettelkasten (:8799 Command Center bridge → in-process
  // vault-zettelkasten plugin api) ─────────────────────────────────────
  // Added 2026-08-20. The Command Center bridge dispatches by full tool name
  // to app.plugins["vault-zettelkasten"].api — the contract of record is
  // Claude/obsidian-command-center/src/bridge/mcp-bridge-server.ts (keep in
  // sync). Like miyo_search_context / viz_*: NO `operation` field (the :8798
  // strict enum does not apply here, and sending one 400s); args pass through
  // with vault context added. Analyses run synchronously against the local
  // Miyo/Qdrant services plus the model gateway: single analyses take seconds
  // to ~a minute, zk_full_pipeline can take minutes — set the :8799 server's
  // timeoutMs accordingly. Results come back as JSON; NOTHING is written to
  // the vault (save results explicitly with obsidian_create_note).
  zk_serendipity: {
    toolName: "zk_serendipity",
    displayName: "Vault ZK Serendipity",
    description:
      "Surface unexpected, cross-cutting connections between a note and the rest of the vault " +
      "(vault-zettelkasten graph engine). Provide notePath or noteContent. Returns markdown " +
      "plus [[wikilink]] suggestions with rationales; writes nothing to the vault.",
    isMutating: false,
    schema: zkAnalysisSchema,
    buildInput: (args, server) => ({ vault: server.vaultName, ...args }),
  },
  zk_cross_domain: {
    toolName: "zk_cross_domain",
    displayName: "Vault ZK Cross-Domain",
    description:
      "Identify structural isomorphisms — patterns in this note that mirror structures in " +
      "other knowledge domains across the vault. Provide notePath or noteContent. Returns " +
      "markdown plus suggestions; writes nothing.",
    isMutating: false,
    schema: zkAnalysisSchema,
    buildInput: (args, server) => ({ vault: server.vaultName, ...args }),
  },
  zk_echo_chamber: {
    toolName: "zk_echo_chamber",
    displayName: "Vault ZK Echo Chamber",
    description:
      "Challenge a note's assumptions with vault-grounded counterarguments and missing " +
      "perspectives. Provide notePath or noteContent. Returns markdown plus suggestions; " +
      "writes nothing.",
    isMutating: false,
    schema: zkAnalysisSchema,
    buildInput: (args, server) => ({ vault: server.vaultName, ...args }),
  },
  zk_semantic_linker: {
    toolName: "zk_semantic_linker",
    displayName: "Vault ZK Semantic Linker",
    description:
      "Propose semantically related notes and TYPED relationships " +
      "(supports/contradicts/extends/…) for a note. Provide notePath or noteContent. Returns " +
      "markdown, suggestions, and typed relationships; writes nothing. Use " +
      "miyo_search_context for a plain semantic search without relationship analysis.",
    isMutating: false,
    schema: zkAnalysisSchema,
    buildInput: (args, server) => ({ vault: server.vaultName, ...args }),
  },
  zk_orphan_rescue: {
    toolName: "zk_orphan_rescue",
    displayName: "Vault ZK Orphan Rescue",
    description:
      "Reconnect a note into the vault's link graph: concrete [[wikilink]] suggestions with " +
      "rationales, plus the vault's top orphan notes. Provide notePath or noteContent. " +
      "Writes nothing.",
    isMutating: false,
    schema: zkAnalysisSchema,
    buildInput: (args, server) => ({ vault: server.vaultName, ...args }),
  },
  zk_vault_health: {
    toolName: "zk_vault_health",
    displayName: "Vault ZK Health",
    description:
      "Vault-wide Zettelkasten health score: note totals, orphan count/ratio, average " +
      "connectivity, staleness, tag coverage. Takes no inputs; writes nothing.",
    isMutating: false,
    schema: z.object({}),
    buildInput: (_args, server) => ({ vault: server.vaultName }),
  },
  zk_full_pipeline: {
    toolName: "zk_full_pipeline",
    displayName: "Vault ZK Full Pipeline",
    description:
      "Run several Zettelkasten analyses in sequence on one note and get combined markdown " +
      "plus per-step results. The slowest zk tool — can take minutes. Default steps: " +
      "serendipity, cross-domain, semantic-linker, echo-chamber. Provide notePath or " +
      "noteContent; writes nothing.",
    isMutating: false,
    schema: zkAnalysisSchema.extend({
      steps: z
        .array(
          z.enum([
            "serendipity",
            "cross-domain",
            "echo-chamber",
            "semantic-linker",
            "orphan-rescue",
            "health",
          ])
        )
        .min(1)
        .max(5)
        .optional()
        .describe(
          "Analysis steps to run in order (default: serendipity, cross-domain, semantic-linker, echo-chamber)"
        ),
    }),
    buildInput: (args, server) => ({ vault: server.vaultName, ...args }),
  },
  // ── Video pipeline (:8799 Command Center bridge → Raycast runner) ────
  // Added 2026-08-20, completing the Command Center surface for agent chat:
  // the bridge has served these tools for a while (and the stdio adapter
  // proxies them for Claude/Raycast consumers), but without catalog entries
  // the IN-PLUGIN agent could not call them. Schemas mirror the bridge's own
  // tools/list declarations in
  // Claude/obsidian-command-center/src/bridge/mcp-bridge-server.ts (the
  // contract of record — keep in sync). NO `operation` field; args pass
  // through unchanged.
  video_pipeline_run: {
    toolName: "video_pipeline_run",
    displayName: "Video Pipeline Run",
    description:
      "Run the video-to-summary pipeline on an http(s) video URL or an absolute local video " +
      "file path (.mp4/.mkv/.webm/.mov/.m4v). Dispatches the Raycast runner: download, " +
      "subtitle claim or Whisper transcription, Copilot summarization, cleanup — the " +
      "finished summary lands in the vault under Copilot Summaries/. Login-gated hosts " +
      "(e.g. LinkedIn Learning) need ONE human click in Downie's UGE window — tell the user. " +
      "Returns after dispatch confirmation; poll video_pipeline_status every ~20s (typical " +
      "runs finish 1-4 minutes after the download starts). Set dry_run true to validate " +
      "without dispatching.",
    // Mutating: dispatches a real download/transcribe/summarize run.
    isMutating: true,
    schema: z.object({
      videoUrl: z
        .string()
        .min(1)
        .describe("http(s) video URL, or an absolute local video file path"),
      dry_run: z
        .boolean()
        .optional()
        .describe("Validate the input and return the Raycast deeplink without dispatching"),
    }),
    buildInput: (args) => ({ ...args }),
  },
  video_pipeline_status: {
    toolName: "video_pipeline_status",
    displayName: "Video Pipeline Status",
    description:
      "Progress of the most recent video pipeline run, read from its durable run log: " +
      "running/success/failed, the latest stage line, and the summary confirmation when " +
      "finished.",
    isMutating: false,
    schema: z.object({}),
    buildInput: () => ({}),
  },
};

export function getMcpCatalogEntry(toolName: string): McpCatalogEntry | undefined {
  return MCP_TOOL_CATALOG[toolName];
}

export function getMcpCatalogToolNames(): string[] {
  return Object.keys(MCP_TOOL_CATALOG);
}
