/**
 * Pedagogical layout engine: turns a structured guided spec into VALID Mermaid
 * source. Mermaid then does the graph layout (node placement, edge routing,
 * subgraph boxes) — this module only encodes *semantics*: which stage a node
 * belongs to, what shape carries its role, and what an edge means.
 *
 * Deterministic by construction: ids come from input order (n1, n2, s1, s2…),
 * never from timestamps or randomness, so the same spec yields byte-identical
 * output on every run.
 */
import {
  type EdgeKind,
  type GuidedGroup,
  type GuidedPreset,
  type NodeShape,
  nodeKindStyle,
} from "./presets";

export interface GuidedNode {
  id: string;
  label: string;
  /** Group/stage id this node sits in. */
  stage?: string;
  kind?: string;
  shape?: NodeShape;
  /** Short prefix badge rendered inside the node, e.g. "L2". */
  badge?: string;
}

export interface GuidedEdge {
  from: string;
  to: string;
  label?: string;
  kind?: EdgeKind;
}

export interface GuidedSpec {
  stages?: GuidedGroup[];
  nodes: GuidedNode[];
  edges?: GuidedEdge[];
}

export interface BuiltMermaid {
  source: string;
  /** Groups actually rendered, in order — drives the step key when steps are absent. */
  groups: GuidedGroup[];
  /** Node kinds actually used — drives the auto legend. */
  usedKinds: string[];
  /** Edge kinds actually used — drives the auto legend. */
  usedEdgeKinds: EdgeKind[];
  nodeCount: number;
  edgeCount: number;
}

const MAX_NODES = 60;

/** Mermaid node-shape delimiters by semantic role. */
const SHAPE_WRAP: Record<NodeShape, [string, string]> = {
  process: ["[", "]"],
  endpoint: ["([", "])"],
  decision: ["{", "}"],
  datastore: ["[(", ")]"],
  sensor: ["{{", "}}"],
  actor: ["((", "))"],
};

/**
 * Mermaid label text. htmlLabels is globally false (see tools/mermaid.ts), so
 * `<br/>` is the only line-break mechanism — newlines are normalized to it.
 * Quotes and the delimiters that would terminate a node label are neutralized.
 */
function labelText(raw: string): string {
  return raw
    .replace(/\r/g, "")
    .replace(/\n/g, "<br/>")
    .replace(/"/g, "'")
    .replace(/[[\]{}()|]/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function sanitizeId(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_]/g, "_");
}

export function buildGuidedMermaid(
  spec: GuidedSpec,
  preset: GuidedPreset,
  direction?: "TB" | "LR"
): BuiltMermaid {
  const nodes = spec.nodes ?? [];
  if (nodes.length === 0) {
    throw new Error("spec.nodes must contain at least one node");
  }
  if (nodes.length > MAX_NODES) {
    throw new Error(
      `spec.nodes has ${nodes.length} nodes; the guided card is capped at ${MAX_NODES} for legibility and render time`
    );
  }

  // Stable id map: n1, n2, … in input order.
  const idOf = new Map<string, string>();
  nodes.forEach((n, i) => {
    if (!n || typeof n.id !== "string" || !n.id.trim()) {
      throw new Error(`spec.nodes[${i}].id must be a non-empty string`);
    }
    if (idOf.has(n.id)) throw new Error(`spec.nodes[${i}].id "${n.id}" is duplicated`);
    if (typeof n.label !== "string" || !n.label.trim()) {
      throw new Error(`spec.nodes[${i}].label must be a non-empty string`);
    }
    idOf.set(n.id, `n${i + 1}`);
  });

  const edges = spec.edges ?? [];
  edges.forEach((e, i) => {
    if (!e || typeof e !== "object") throw new Error(`spec.edges[${i}] must be an object`);
    for (const end of ["from", "to"] as const) {
      if (!idOf.has(String(e[end]))) {
        throw new Error(
          `spec.edges[${i}].${end} references unknown node id ${JSON.stringify(e[end])}`
        );
      }
    }
    if (e.kind && !preset.edgeKinds[e.kind]) {
      throw new Error(
        `spec.edges[${i}].kind must be one of ${Object.keys(preset.edgeKinds).join(", ")} (got ${JSON.stringify(e.kind)})`
      );
    }
  });

  // Groups: caller-supplied stages win; otherwise the preset's own groups, but
  // only those a node actually references (an empty stage box teaches nothing).
  const referenced = new Set(nodes.map((n) => n.stage).filter(Boolean) as string[]);
  const declared = spec.stages && spec.stages.length > 0 ? spec.stages : preset.groups;
  const groups = declared.filter((g) => referenced.has(g.id));
  for (const stage of referenced) {
    if (!groups.some((g) => g.id === stage)) {
      groups.push({ id: stage, label: stage });
    }
  }

  const lines: string[] = [];
  lines.push(`flowchart ${direction ?? preset.direction}`);

  const renderNode = (n: GuidedNode): string => {
    const style = nodeKindStyle(preset, n.kind);
    const [open, close] = SHAPE_WRAP[n.shape ?? style.shape] ?? SHAPE_WRAP.process;
    const badge = n.badge ? `${labelText(n.badge)} · ` : "";
    return `  ${idOf.get(n.id)}${open}"${badge}${labelText(n.label)}"${close}`;
  };

  // Grouped nodes first, in group order, then any ungrouped ones.
  const grouped = new Set<string>();
  groups.forEach((g, gi) => {
    const members = nodes.filter((n) => n.stage === g.id);
    if (members.length === 0) return;
    const title = preset.numberStages
      ? `Stage ${gi + 1} · ${labelText(g.label)}`
      : labelText(g.label);
    lines.push(`  subgraph s${gi + 1}["${title}"]`);
    lines.push(`    direction ${direction ?? preset.direction}`);
    for (const n of members) {
      lines.push(`  ${renderNode(n)}`);
      grouped.add(n.id);
    }
    lines.push("  end");
  });
  for (const n of nodes) {
    if (!grouped.has(n.id)) lines.push(renderNode(n));
  }

  // Edges, in input order so linkStyle indices line up exactly.
  const usedEdgeKinds: EdgeKind[] = [];
  edges.forEach((e) => {
    const kind = (e.kind ?? "data") as EdgeKind;
    const style = preset.edgeKinds[kind];
    if (!usedEdgeKinds.includes(kind)) usedEdgeKinds.push(kind);
    const from = idOf.get(e.from);
    const to = idOf.get(e.to);
    // Mermaid puts an edge label AFTER the complete arrow: `-->|"text"|`,
    // `-.->|"text"|`, `==>|"text"|`. Splitting the arrow around the label is a
    // parse error.
    const arrow = e.label ? `${style.arrow}|"${labelText(e.label)}"|` : style.arrow;
    lines.push(`  ${from} ${arrow} ${to}`);
  });

  // classDef + class assignment per used kind.
  const usedKinds: string[] = [];
  const byKind = new Map<string, string[]>();
  for (const n of nodes) {
    const kind = n.kind ?? Object.keys(preset.nodeKinds)[0] ?? "step";
    if (!usedKinds.includes(kind)) usedKinds.push(kind);
    byKind.set(kind, [...(byKind.get(kind) ?? []), idOf.get(n.id) as string]);
  }
  for (const kind of usedKinds) {
    lines.push(`  classDef ${sanitizeId(kind)} ${nodeKindStyle(preset, kind).classDef}`);
  }
  for (const kind of usedKinds) {
    lines.push(`  class ${(byKind.get(kind) ?? []).join(",")} ${sanitizeId(kind)}`);
  }

  // Per-index linkStyle carries the edge semantics (solid/dashed/bold-red).
  edges.forEach((e, i) => {
    const style = preset.edgeKinds[(e.kind ?? "data") as EdgeKind];
    lines.push(`  linkStyle ${i} ${style.linkStyle}`);
  });

  return {
    source: lines.join("\n"),
    groups,
    usedKinds,
    usedEdgeKinds,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  };
}
