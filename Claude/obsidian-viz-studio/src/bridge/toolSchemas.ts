/**
 * The viz_* tool declarations served by tools/list — the CONTRACT OF RECORD
 * for every consumer (Copilot Agent Mode and Claude's openclaw-obsidian door
 * discover these live; the Copilot fork's catalog.ts mirrors them).
 * Keep in sync with:
 *   Copilot-Everything/repos/obsidian-copilot-mcp-v4/src/mcp/catalog.ts (Lane A zod)
 *   Copilot-Everything/bridges/obsidian-stdio-adapter/index.mjs VIZ_TOOL_NAMES + VIZ_BLOCKED_PROPS
 *     (a new tool or write-target property must be added there; npm run test:profiles fails until it is)
 */

import { DEFAULT_PRESET, GUIDED_PRESETS, PRESET_IDS } from "../render/guided/presets";

interface JsonSchema {
  [key: string]: unknown;
}

/** Preset menu rendered into the viz_guided schema so agents can choose without guessing. */
const PRESET_SUMMARY = `Teaching structure. ${Object.values(GUIDED_PRESETS)
  .map((p) => `${p.id}: ${p.description}`)
  .join(" | ")}`;

export interface ToolDeclaration {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

const EMBED_NOTE =
  "Returns the vault path and an ![[embed]] string — insert the embed into a note to display the result; images do not render in chat output.";

const COMMON_WRITE_PROPS: Record<string, JsonSchema> = {
  fileName: {
    type: "string",
    description: "Exact base filename (no extension). Defaults to a slug of the title.",
  },
  folder: {
    type: "string",
    description: "Vault-relative output folder override.",
  },
  targetNote: {
    type: "string",
    description:
      "Note to append the embed to (created with a heading if missing). Vault-relative path or name.",
  },
  overwrite: {
    type: "boolean",
    description: "Replace an existing file of the same name instead of adding a -2/-3 suffix.",
    default: false,
  },
  returnContent: {
    type: "boolean",
    description:
      "Include the raw generated content (svg/canvas/mermaid) in the result for consumers that do not read the vault.",
    default: false,
  },
};

const FORMAT_SVG_PNG: JsonSchema = {
  type: "string",
  enum: ["svg", "png"],
  default: "svg",
  description: "Output format. PNG is rasterized locally at the configured scale.",
};

export const TOOL_DECLARATIONS: ToolDeclaration[] = [
  {
    name: "viz_health",
    description:
      "Viz Studio bridge health: vault name, tool list, mermaid availability, output folders.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "viz_mermaid",
    description:
      `Create a Mermaid diagram (flowchart, sequence, mindmap, gantt, pie, …). Source is ` +
      `validated first; on a syntax error the mermaid parser message is returned verbatim so ` +
      `you can correct and retry. CHOOSING A FORMAT: to put the diagram INSIDE an existing or ` +
      `new note, use format "note" WITH targetNote — the fence is appended inline and renders ` +
      `natively. To get an image you can embed anywhere (including inside another note), use ` +
      `format "svg". Only use format "note" WITHOUT targetNote for a standalone diagram note, ` +
      `and link to it with [[…]] — do NOT ![[embed]] such a note into another one, because a ` +
      `transcluded mermaid fence does not render reliably. ${EMBED_NOTE}`,
    inputSchema: {
      type: "object",
      required: ["source"],
      properties: {
        source: {
          type: "string",
          description:
            "Raw mermaid source WITHOUT the ```mermaid fence (e.g. \"flowchart TD\\n  A-->B\").",
        },
        title: { type: "string", description: "Diagram title; used for the note heading and filename." },
        format: {
          type: "string",
          enum: ["note", "svg", "png"],
          default: "note",
          description:
            "note = markdown fence rendered natively by Obsidian (preferred); svg/png = exported image.",
        },
        ...COMMON_WRITE_PROPS,
      },
      additionalProperties: false,
    },
  },
  {
    name: "viz_chart",
    description:
      `Render a data chart (bar, line, area, scatter, pie, donut) to an SVG/PNG vault attachment — ` +
      `deterministic local rendering, no external services. ${EMBED_NOTE}`,
    inputSchema: {
      type: "object",
      required: ["type", "data"],
      properties: {
        type: { type: "string", enum: ["bar", "line", "area", "scatter", "pie", "donut"] },
        title: { type: "string" },
        data: {
          type: "object",
          required: ["series"],
          properties: {
            labels: {
              type: "array",
              items: { type: "string" },
              description: "Category labels (x-axis, or pie slice names paired with series[0].values).",
            },
            series: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string" },
                  values: {
                    type: "array",
                    items: { type: "number" },
                    description: "One value per label (bar/line/area/pie).",
                  },
                  points: {
                    type: "array",
                    items: {
                      type: "array",
                      items: { type: "number" },
                      minItems: 2,
                      maxItems: 2,
                    },
                    description: "[x, y] pairs (scatter).",
                  },
                },
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        },
        options: {
          type: "object",
          properties: {
            width: { type: "number", default: 800 },
            height: { type: "number", default: 480 },
            stacked: { type: "boolean", description: "Stack bar/area series." },
            legend: { type: "boolean", default: true },
            xLabel: { type: "string" },
            yLabel: { type: "string" },
            yMin: { type: "number" },
            yMax: { type: "number" },
            palette: {
              type: "array",
              items: { type: "string" },
              description: "Series color overrides (hex).",
            },
            background: {
              type: "string",
              description: 'Chart background color; "transparent" to disable.',
            },
          },
          additionalProperties: false,
        },
        format: FORMAT_SVG_PNG,
        ...COMMON_WRITE_PROPS,
      },
      additionalProperties: false,
    },
  },
  {
    name: "viz_render_svg",
    description:
      `Save agent-authored SVG markup as a vault image (optionally rasterized to PNG). The SVG is ` +
      `sanitized: scripts, event handlers, foreignObject, and external references are stripped and ` +
      `reported in warnings. Keep it self-contained (inline styles, system fonts). ${EMBED_NOTE}`,
    inputSchema: {
      type: "object",
      required: ["svg"],
      properties: {
        svg: {
          type: "string",
          description: "Complete <svg>…</svg> markup, ≤ 800000 chars, self-contained.",
        },
        format: FORMAT_SVG_PNG,
        ...COMMON_WRITE_PROPS,
      },
      additionalProperties: false,
    },
  },
  {
    name: "viz_canvas",
    description:
      `Generate an Obsidian Canvas (.canvas) board — mind map, flow board, or cluster map — from ` +
      `nodes and edges with automatic layout (grid, tree, or radial). Node kinds: text (label/text), ` +
      `file (embeds a vault note), url (web card); optional group frames. ${EMBED_NOTE}`,
    inputSchema: {
      type: "object",
      required: ["nodes"],
      properties: {
        title: { type: "string" },
        nodes: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["id"],
            properties: {
              id: { type: "string" },
              label: { type: "string", description: "Short display text (alias of text)." },
              text: { type: "string", description: "Markdown body for a text card." },
              file: { type: "string", description: "Vault path → file preview card." },
              url: { type: "string", description: "External URL → link card." },
              group: { type: "string", description: "Group name; members get a frame." },
              color: { type: "string", description: '"1"-"6" (Canvas presets) or "#rrggbb".' },
            },
            additionalProperties: false,
          },
        },
        edges: {
          type: "array",
          items: {
            type: "object",
            required: ["from", "to"],
            properties: {
              from: { type: "string" },
              to: { type: "string" },
              label: { type: "string" },
              color: { type: "string" },
            },
            additionalProperties: false,
          },
        },
        layout: {
          type: "string",
          enum: ["grid", "tree", "radial"],
          description: "Defaults to tree when edges exist, grid otherwise.",
        },
        ...COMMON_WRITE_PROPS,
      },
      additionalProperties: false,
    },
  },
  {
    name: "viz_guided",
    description:
      `Build a "Guided Learning" Visual Explainer Card — the tool to reach for when TEACHING a ` +
      `multi-stage technical concept (how a system works, an attack path, a request lifecycle). ` +
      `From a structured spec it emits one self-contained SVG: a title banner, a themed diagram ` +
      `with numbered stage groups and semantic node shapes, an auto-generated legend, and a ` +
      `numbered step-by-step breakdown underneath. Stages become numbered subgraphs; edge "kind" ` +
      `controls the line semantics (data = solid, mirror/control = dashed, blocked = bold red). ` +
      `Because the result is one image, it renders reliably anywhere — unlike a diagram note. ` +
      `Use viz_mermaid instead for a plain single diagram with no pedagogical chrome. ${EMBED_NOTE}`,
    inputSchema: {
      type: "object",
      required: ["title"],
      properties: {
        title: { type: "string", description: "Card headline." },
        subtitle: { type: "string", description: "One-line framing under the headline." },
        preset: {
          type: "string",
          enum: PRESET_IDS,
          default: DEFAULT_PRESET,
          description: PRESET_SUMMARY,
        },
        spec: {
          type: "object",
          description: "Structured diagram spec. Provide this OR `mermaid`, never both.",
          required: ["nodes"],
          properties: {
            stages: {
              type: "array",
              description:
                "Ordered stages/groups. Omit to use the preset's own groups. Nodes join a stage by id.",
              items: {
                type: "object",
                required: ["id", "label"],
                properties: {
                  id: { type: "string" },
                  label: { type: "string" },
                  note: { type: "string", description: "Used as the step detail if steps are omitted." },
                },
                additionalProperties: false,
              },
            },
            nodes: {
              type: "array",
              minItems: 1,
              maxItems: 60,
              items: {
                type: "object",
                required: ["id", "label"],
                properties: {
                  id: { type: "string" },
                  label: { type: "string", description: "Use \\n for a line break." },
                  stage: { type: "string", description: "Stage/group id this node belongs to." },
                  kind: {
                    type: "string",
                    description:
                      "Semantic role driving color + shape: endpoint, infra, transit, server, datastore, sensor, control, threat, asset, decision, step.",
                  },
                  shape: {
                    type: "string",
                    enum: ["process", "endpoint", "decision", "datastore", "sensor", "actor"],
                    description: "Override the shape implied by kind.",
                  },
                  badge: { type: "string", description: "Short prefix inside the node, e.g. \"L2\"." },
                },
                additionalProperties: false,
              },
            },
            edges: {
              type: "array",
              items: {
                type: "object",
                required: ["from", "to"],
                properties: {
                  from: { type: "string" },
                  to: { type: "string" },
                  label: { type: "string" },
                  kind: {
                    type: "string",
                    enum: ["data", "mirror", "control", "blocked"],
                    default: "data",
                    description:
                      "data = solid primary path; mirror = dashed telemetry; control = dashed control plane; blocked = bold red.",
                  },
                },
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        },
        mermaid: {
          type: "string",
          description:
            "Raw Mermaid source to wrap in card chrome instead of a spec (no ```mermaid fence).",
        },
        steps: {
          type: "array",
          description:
            "Bottom breakdown key, auto-numbered. Defaults to the stage list when omitted.",
          items: {
            type: "object",
            required: ["title"],
            properties: {
              title: { type: "string" },
              detail: { type: "string", description: "What happens at this step." },
            },
            additionalProperties: false,
          },
        },
        legend: {
          type: "array",
          description: "Override the auto-derived legend.",
          items: {
            type: "object",
            required: ["label"],
            properties: { label: { type: "string" }, color: { type: "string" } },
            additionalProperties: false,
          },
        },
        sources: {
          type: "array",
          items: { type: "string" },
          description:
            "Vault notes this lesson was built from — paths or [[wikilinks]]. Written into the " +
            "lesson note as a 'Sources from your vault' section. Pass these whenever the content " +
            "came from the user's own notes; citations in chat alone are lost when it scrolls away.",
        },
        theme: { type: "string", enum: ["contrast", "slate", "blueprint"], default: "contrast" },
        direction: { type: "string", enum: ["TB", "LR"], description: "Overrides the preset." },
        width: { type: "number", default: 1200, minimum: 720, maximum: 2000 },
        stepKeyNote: {
          type: "boolean",
          default: false,
          description:
            "Write the lesson to a NEW note (image + step key + sources + editable Mermaid). " +
            "Use this OR targetNote, not both — targetNote already receives the full lesson.",
        },
        useActiveTab: {
          type: "boolean",
          default: false,
          description:
            "Put the lesson wherever the user is working: appended to the open NOTE, or added " +
            "as a card in the open CANVAS — the tool detects which. Use for 'put it here'.",
        },
        useActiveNote: {
          type: "boolean",
          default: false,
          description: "Alias of useActiveTab (kept for compatibility).",
        },
        targetCanvas: {
          type: "string",
          description:
            "Canvas to add the lesson to (created if missing). The lesson still becomes a real " +
            "note; a card pointing at it is inserted into the canvas, preserving existing nodes.",
        },
        canvasNode: {
          type: "string",
          enum: ["note", "image"],
          default: "note",
          description:
            "Canvas card kind: 'note' embeds the lesson note (readable + searchable), " +
            "'image' drops just the card image in for a purely visual board.",
        },
        open: {
          type: "boolean",
          default: true,
          description:
            "Open the lesson note in Obsidian when done so the user sees it immediately. " +
            "Set false for background/batch generation.",
        },
        format: FORMAT_SVG_PNG,
        ...COMMON_WRITE_PROPS,
      },
      additionalProperties: false,
    },
  },
  {
    name: "viz_diagram",
    description:
      `Create a styled system/architecture CARD DIAGRAM: rounded cards with a bold title and a ` +
      `muted subtitle line, semantic color roles per card, faint section headers over groups, and ` +
      `thin grey arrows (dashed for pending/planned links). Layout is automatic: nodes layer ` +
      `left-to-right by edge flow, grouped nodes share one labeled column, and disconnected ` +
      `subgraphs stack as separate bands. PREFER THIS over viz_mermaid for infrastructure/system/` +
      `component diagrams where the polished card look matters; use viz_mermaid for sequence/` +
      `gantt/mindmap, and viz_guided when teaching with a step key. Color guidance: 2-3 kinds per ` +
      `diagram, gray for neutral/structural, ink for hub/terminal nodes; reserve red/amber/green/` +
      `blue for genuine error/warning/success/info semantics. ${EMBED_NOTE}`,
    inputSchema: {
      type: "object",
      required: ["nodes"],
      properties: {
        title: { type: "string", description: "Diagram headline; also the default filename." },
        nodes: {
          type: "array",
          minItems: 1,
          maxItems: 40,
          items: {
            type: "object",
            required: ["id"],
            properties: {
              id: { type: "string" },
              title: { type: "string", description: "Card title (defaults to id)." },
              subtitle: { type: "string", description: "Muted second line, keep under ~5 words." },
              kind: {
                type: "string",
                enum: ["ink", "purple", "teal", "coral", "pink", "gray", "blue", "green", "amber", "red"],
                description: "Card color role. ink = near-black hub/terminal card; default gray.",
              },
              group: {
                type: "string",
                description: "Cluster name → members share one column under a faint section header.",
              },
            },
            additionalProperties: false,
          },
        },
        edges: {
          type: "array",
          items: {
            type: "object",
            required: ["from", "to"],
            properties: {
              from: { type: "string" },
              to: { type: "string" },
              label: { type: "string", description: "Rarely needed; prefer box subtitles." },
              dashed: { type: "boolean", description: "Dashed connector for pending/planned/inactive." },
            },
            additionalProperties: false,
          },
        },
        options: {
          type: "object",
          properties: {
            style: {
              type: "string",
              enum: ["solid", "soft"],
              default: "solid",
              description: "solid = saturated dark cards with light text; soft = light-tinted cards with dark text.",
            },
            background: { type: "string", description: 'Page background; "transparent" to disable.' },
          },
          additionalProperties: false,
        },
        format: FORMAT_SVG_PNG,
        targetCanvas: {
          type: "string",
          description: "Canvas to insert the diagram image into as a card (created if missing).",
        },
        useActiveTab: {
          type: "boolean",
          default: false,
          description:
            "Put the diagram wherever the user is working: appended to the open NOTE, or added to the open CANVAS — auto-detected.",
        },
        open: {
          type: "boolean",
          default: true,
          description: "Open the result in Obsidian when done. Set false for background/batch generation.",
        },
        ...COMMON_WRITE_PROPS,
      },
      additionalProperties: false,
    },
  },
  {
    name: "viz_perceptual_map",
    description:
      `Create a perceptual/positioning map (the marketing 2×2): two bipolar attribute axes ` +
      `crossing at the center, competitors/brands plotted as labeled bubbles, optional segment ` +
      `colors, bubble sizing (e.g. market share), and quadrant captions. CHOOSING A FORMAT: ` +
      `"svg"/"png" render one deterministic image to embed in a note (regular tab); ` +
      `"canvas" builds a native Obsidian Canvas board where each competitor is a DRAGGABLE card ` +
      `inside four quadrant frames — use it when the user wants to reposition items or ` +
      `workshop the map. targetCanvas adds the map to an existing canvas; useActiveTab puts it ` +
      `wherever the user is working (note or canvas, auto-detected). ${EMBED_NOTE}`,
    inputSchema: {
      type: "object",
      required: ["xAxis", "yAxis", "items"],
      properties: {
        title: { type: "string", description: "Map headline; also the default filename." },
        xAxis: {
          type: "object",
          required: ["low", "high"],
          properties: {
            low: { type: "string", description: 'Left pole label, e.g. "Low Price".' },
            high: { type: "string", description: 'Right pole label, e.g. "High Price".' },
            label: { type: "string", description: 'Attribute name, e.g. "Price".' },
          },
          additionalProperties: false,
        },
        yAxis: {
          type: "object",
          required: ["low", "high"],
          properties: {
            low: { type: "string", description: 'Bottom pole label, e.g. "Low Quality".' },
            high: { type: "string", description: 'Top pole label, e.g. "High Quality".' },
            label: { type: "string", description: 'Attribute name, e.g. "Quality".' },
          },
          additionalProperties: false,
        },
        items: {
          type: "array",
          minItems: 1,
          maxItems: 60,
          description: "Competitors/brands to plot.",
          items: {
            type: "object",
            required: ["label", "x", "y"],
            properties: {
              label: { type: "string" },
              x: { type: "number", description: "Position on the x axis within scale (default -10..10)." },
              y: { type: "number", description: "Position on the y axis within scale (default -10..10)." },
              segment: {
                type: "string",
                description: "Optional grouping (e.g. market segment) → shared color + legend entry.",
              },
              color: { type: "string", description: '"#rrggbb" override; wins over the segment color.' },
              size: {
                type: "number",
                description: "Relative bubble weight (e.g. market share); scales the radius.",
              },
            },
            additionalProperties: false,
          },
        },
        quadrantLabels: {
          type: "object",
          description: "Muted captions in the four quadrant corners.",
          properties: {
            topLeft: { type: "string" },
            topRight: { type: "string" },
            bottomLeft: { type: "string" },
            bottomRight: { type: "string" },
          },
          additionalProperties: false,
        },
        scale: {
          type: "object",
          description: "Value range shared by both axes (perceptual space is relative). Default -10..10.",
          required: ["min", "max"],
          properties: { min: { type: "number" }, max: { type: "number" } },
          additionalProperties: false,
        },
        options: {
          type: "object",
          properties: {
            width: { type: "number", default: 840 },
            height: { type: "number", default: 720 },
            legend: { type: "boolean", default: true, description: "Segment legend (only when segments exist)." },
            grid: { type: "boolean", default: false, description: "Light quarter gridlines." },
            background: { type: "string", description: '"transparent" to disable.' },
            palette: { type: "array", items: { type: "string" }, description: "Segment/item color overrides (hex)." },
          },
          additionalProperties: false,
        },
        format: {
          type: "string",
          enum: ["svg", "png", "canvas"],
          default: "svg",
          description: "svg/png = image attachment; canvas = editable .canvas board with draggable competitor cards.",
        },
        targetCanvas: {
          type: "string",
          description:
            "Canvas to add the map to (created if missing): format canvas inserts the whole board; svg/png insert the image as a card.",
        },
        useActiveTab: {
          type: "boolean",
          default: false,
          description:
            "Put the map wherever the user is working: appended to the open NOTE, or added to the open CANVAS — auto-detected. Use for 'put it here'.",
        },
        open: {
          type: "boolean",
          default: true,
          description: "Open the result in Obsidian when done. Set false for background/batch generation.",
        },
        ...COMMON_WRITE_PROPS,
      },
      additionalProperties: false,
    },
  },
  {
    name: "viz_stat_tiles",
    description:
      `Render headline numbers the RIGHT way — stat tiles, a KPI row, or meters — instead of a ` +
      `chart. Use when the data is a single current value (+ trend), a handful of headline ` +
      `numbers, or a ratio against a limit (a one-bar bar chart or 2-slice pie is wrong there). ` +
      `Each tile: muted label, large serif hero number, optional unit, status-colored delta ` +
      `(▲ green / ▼ red), and either a sparkline or a same-ramp meter. ${EMBED_NOTE}`,
    inputSchema: {
      type: "object",
      required: ["tiles"],
      properties: {
        title: { type: "string", description: "Row headline; also the default filename." },
        tiles: {
          type: "array",
          minItems: 1,
          maxItems: 12,
          items: {
            type: "object",
            required: ["label", "value"],
            properties: {
              label: { type: "string", description: "Muted caption above the number." },
              value: {
                type: ["string", "number"],
                description: 'Hero figure, preformatted (e.g. "$14,950", "82%", 37).',
              },
              unit: { type: "string", description: 'Small suffix after the hero (e.g. "/mo").' },
              delta: {
                type: ["string", "number"],
                description: 'Change readout under the hero (e.g. "+12% vs last month", -3).',
              },
              direction: {
                type: "string",
                enum: ["up", "down", "flat"],
                description: "Colors the delta (good/bad/neutral); inferred from a numeric delta's sign.",
              },
              spark: {
                type: "array",
                items: { type: "number" },
                description: "Sparkline values, oldest first.",
              },
              meter: {
                type: "object",
                required: ["value", "max"],
                properties: { value: { type: "number" }, max: { type: "number" } },
                additionalProperties: false,
                description: "Ratio-against-a-limit tile: renders a progress meter instead of a spark.",
              },
            },
            additionalProperties: false,
          },
        },
        options: {
          type: "object",
          properties: {
            columns: { type: "number", description: "Tiles per row (1-4; default fits the count)." },
            width: { type: "number" },
            background: { type: "string" },
          },
          additionalProperties: false,
        },
        format: FORMAT_SVG_PNG,
        targetCanvas: { type: "string", description: "Canvas to insert the image into as a card." },
        useActiveTab: {
          type: "boolean",
          default: false,
          description: "Append to the open note / add to the open canvas, auto-detected.",
        },
        open: { type: "boolean", default: true, description: "Open the result when done." },
        ...COMMON_WRITE_PROPS,
      },
      additionalProperties: false,
    },
  },
  {
    name: "viz_mockup",
    description:
      `Draw a UI MOCKUP from typed blocks in the design-system component language — flat white ` +
      `surfaces, hairline borders, pre-styled inputs/buttons, metric cards, badges, avatar ` +
      `lists — framed as a browser window, a phone, a raised card, or bare. Use for wireframes, ` +
      `screen concepts, form layouts, and dashboard sketches. Blocks stack vertically; no ` +
      `free-form SVG needed. At most ONE filled (primary/accent) button per view. ${EMBED_NOTE}`,
    inputSchema: {
      type: "object",
      required: ["blocks"],
      properties: {
        title: { type: "string", description: "Shown in the browser frame's address pill; default filename." },
        frame: {
          type: "string",
          enum: ["browser", "phone", "card", "none"],
          default: "browser",
          description: "Device/container framing.",
        },
        blocks: {
          type: "array",
          minItems: 1,
          maxItems: 30,
          description: "Typed UI blocks, rendered top to bottom.",
          items: {
            type: "object",
            required: ["type"],
            properties: {
              type: {
                type: "string",
                enum: [
                  "header",
                  "metric_row",
                  "field",
                  "select",
                  "button_row",
                  "text",
                  "list",
                  "badge_row",
                  "image",
                  "divider",
                ],
              },
              title: { type: "string", description: "header/text: heading line." },
              subtitle: { type: "string", description: "header: muted second line." },
              initials: { type: "string", description: "header: avatar initials (accent tint circle)." },
              metrics: {
                type: "array",
                items: {
                  type: "object",
                  required: ["label", "value"],
                  properties: { label: { type: "string" }, value: { type: "string" } },
                  additionalProperties: false,
                },
                description: "metric_row: up to 4 metric cards.",
              },
              label: { type: "string", description: "field/select: label above the control." },
              placeholder: { type: "string", description: "field: muted placeholder text." },
              value: { type: "string", description: "field/select: filled value." },
              buttons: {
                type: "array",
                items: {
                  type: "object",
                  required: ["label"],
                  properties: {
                    label: { type: "string" },
                    variant: { type: "string", enum: ["primary", "secondary", "accent"] },
                  },
                  additionalProperties: false,
                },
                description: "button_row: outline by default; at most one primary/accent fill per view.",
              },
              lines: { type: "array", items: { type: "string" }, description: "text: real content lines." },
              placeholderLines: {
                type: "number",
                description: "text: draw N grey wireframe bars instead of real text.",
              },
              items: {
                type: "array",
                items: {
                  type: "object",
                  required: ["title"],
                  properties: {
                    title: { type: "string" },
                    meta: { type: "string" },
                    initials: { type: "string" },
                  },
                  additionalProperties: false,
                },
                description: "list: bordered rows (dense-list rule), optional avatars.",
              },
              badges: {
                type: "array",
                items: {
                  type: "object",
                  required: ["label"],
                  properties: {
                    label: { type: "string" },
                    role: { type: "string", enum: ["accent", "success", "warning", "danger", "neutral"] },
                  },
                  additionalProperties: false,
                },
                description: "badge_row: pale role-tinted pills.",
              },
              height: { type: "number", description: "image: placeholder height (default 140)." },
            },
            additionalProperties: false,
          },
        },
        options: {
          type: "object",
          properties: { background: { type: "string" } },
          additionalProperties: false,
        },
        format: FORMAT_SVG_PNG,
        targetCanvas: { type: "string", description: "Canvas to insert the image into as a card." },
        useActiveTab: {
          type: "boolean",
          default: false,
          description: "Append to the open note / add to the open canvas, auto-detected.",
        },
        open: { type: "boolean", default: true, description: "Open the result when done." },
        ...COMMON_WRITE_PROPS,
      },
      additionalProperties: false,
    },
  },
  {
    name: "viz_interactive",
    description:
      `Create an INTERACTIVE explainer as a self-contained HTML file in the vault — sliders, ` +
      `buttons, live computed readouts, toggles — in the design-system look (tokens + ` +
      `pre-styled bare form tags: input/select/button/range need no classes; .card, .metric, ` +
      `.hero, .badge, .row, .grid helpers exist). Obsidian cannot run scripts in embeds, so the ` +
      `file OPENS IN THE SYSTEM BROWSER (open: true does this; the note gets a [[link]]). The ` +
      `document is network-inert: a strict CSP blocks every network request, so write ` +
      `self-contained JS (no fetch, no external src). Use for what-if calculators, parameter ` +
      `explorers, and step-through explainers; use viz_guided for a static teaching card.`,
    inputSchema: {
      type: "object",
      required: ["title", "body"],
      properties: {
        title: { type: "string", description: "Document title (H1 + <title>); default filename." },
        body: {
          type: "string",
          description:
            "HTML fragment. Bare form tags are pre-styled; inline onclick is allowed (sendPrompt is stubbed outside Claude). External src/href and iframes are stripped.",
        },
        script: {
          type: "string",
          description: "Raw inline JS (no <script> tag). Runs after the DOM. Round every displayed number.",
        },
        css: { type: "string", description: "Extra CSS appended after the base stylesheet." },
        fileName: { type: "string", description: "Exact base filename (no extension)." },
        folder: { type: "string", description: "Vault-relative output folder override." },
        targetNote: {
          type: "string",
          description: "Note to append the [[link]] to (created if missing).",
        },
        overwrite: { type: "boolean", default: false },
        returnContent: { type: "boolean", default: false, description: "Include the full HTML in the result." },
        open: {
          type: "boolean",
          default: true,
          description: "Open in the system browser when done.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "viz_graph_snapshot",
    description:
      `Render the local link graph around a vault note (wikilink neighborhood from Obsidian's ` +
      `metadata cache) as an SVG/PNG image; optionally also a clickable .canvas companion. ` +
      `Something external tools cannot see — this runs inside Obsidian. ${EMBED_NOTE}`,
    inputSchema: {
      type: "object",
      required: ["focus"],
      properties: {
        focus: { type: "string", description: "Note name or vault path at the center." },
        depth: {
          type: "number",
          default: 2,
          minimum: 1,
          maximum: 4,
          description: "Link hops to include (both directions).",
        },
        maxNodes: { type: "number", default: 100, maximum: 300 },
        includeUnresolved: {
          type: "boolean",
          default: false,
          description: "Include unresolved wikilink targets as dashed ghost nodes.",
        },
        canvasCompanion: {
          type: "boolean",
          default: false,
          description: "Also write a .canvas with clickable file nodes at the same coordinates.",
        },
        format: FORMAT_SVG_PNG,
        ...COMMON_WRITE_PROPS,
      },
      additionalProperties: false,
    },
  },
];

export const TOOL_NAMES: readonly string[] = TOOL_DECLARATIONS.map((t) => t.name);
