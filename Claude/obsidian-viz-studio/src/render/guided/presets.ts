/**
 * Guided-learning presets: the pedagogical vocabulary each explainer card is
 * built from. A preset fixes the *teaching structure* — ordered stages, what a
 * node kind means and how it looks, what an edge kind means and how it reads —
 * so every card of the same preset is consistent no matter which model called
 * the tool or how well it was prompted.
 *
 * Adding a preset is one object here; no schema change anywhere else.
 */

export type EdgeKind = "data" | "mirror" | "control" | "blocked";
export type NodeShape =
  | "process"
  | "endpoint"
  | "decision"
  | "datastore"
  | "sensor"
  | "actor";

export interface NodeKindStyle {
  /** Human label used in the auto-derived legend. */
  label: string;
  /** Mermaid classDef body, e.g. "fill:#123,stroke:#456,color:#fff". */
  classDef: string;
  /** Default shape when a node of this kind does not specify one. */
  shape: NodeShape;
  /** Legend swatch color. */
  swatch: string;
}

export interface EdgeKindStyle {
  label: string;
  /** Mermaid arrow operator. */
  arrow: "-->" | "-.->" | "==>";
  /** Mermaid linkStyle body applied per edge index. */
  linkStyle: string;
  /** Legend line rendering. */
  color: string;
  dashed: boolean;
  width: number;
}

export interface GuidedGroup {
  id: string;
  label: string;
  note?: string;
}

export interface GuidedPreset {
  id: string;
  /** One-line description surfaced in the tool schema. */
  description: string;
  direction: "TB" | "LR";
  /** Ordered groups. Empty = caller supplies stages. */
  groups: GuidedGroup[];
  /** True when groups should render as "Stage N · Label". */
  numberStages: boolean;
  accent: string;
  nodeKinds: Record<string, NodeKindStyle>;
  edgeKinds: Record<EdgeKind, EdgeKindStyle>;
}

// OPERATOR DECISION — guided-card semantics. These palettes and shapes define
// what every explainer card "means": which colors read as threat vs control vs
// asset, and whether telemetry is dashed-grey or dashed-blue. High-contrast
// values are chosen to stay legible on both Obsidian themes against the card's
// own painted background. Swap freely; nothing else keys on the exact hex.
const INK = "#ffffff";

const EDGE_KINDS: Record<EdgeKind, EdgeKindStyle> = {
  data: {
    label: "Primary data path",
    arrow: "-->",
    linkStyle: "stroke:#2f6f9f,stroke-width:2.5px",
    color: "#2f6f9f",
    dashed: false,
    width: 2.5,
  },
  mirror: {
    label: "Mirror / telemetry (out-of-band)",
    arrow: "-.->",
    linkStyle: "stroke:#7a828a,stroke-width:1.8px,stroke-dasharray:6 4",
    color: "#7a828a",
    dashed: true,
    width: 1.8,
  },
  control: {
    label: "Control plane / lookup",
    arrow: "-.->",
    linkStyle: "stroke:#6a4fa3,stroke-width:2px,stroke-dasharray:5 4",
    color: "#6a4fa3",
    dashed: true,
    width: 2,
  },
  blocked: {
    label: "Blocked / dropped",
    arrow: "==>",
    linkStyle: "stroke:#c0392b,stroke-width:3.5px",
    color: "#c0392b",
    dashed: false,
    width: 3.5,
  },
};

const NODE_KIND_LIBRARY: Record<string, NodeKindStyle> = {
  endpoint: {
    label: "Endpoint / client",
    classDef: `fill:#2f6f9f,stroke:#1d4f74,stroke-width:2px,color:${INK}`,
    shape: "endpoint",
    swatch: "#2f6f9f",
  },
  infra: {
    label: "Network device",
    classDef: `fill:#3f7d58,stroke:#2a5a3e,stroke-width:2px,color:${INK}`,
    shape: "process",
    swatch: "#3f7d58",
  },
  transit: {
    label: "Transit / routing",
    classDef: `fill:#b5721f,stroke:#8a5615,stroke-width:2px,color:${INK}`,
    shape: "process",
    swatch: "#b5721f",
  },
  server: {
    label: "Server / service",
    classDef: `fill:#4a4f8c,stroke:#343869,stroke-width:2px,color:${INK}`,
    shape: "process",
    swatch: "#4a4f8c",
  },
  datastore: {
    label: "Data store",
    classDef: `fill:#5c5f66,stroke:#3f4247,stroke-width:2px,color:${INK}`,
    shape: "datastore",
    swatch: "#5c5f66",
  },
  sensor: {
    label: "Sensor / observer",
    classDef: `fill:#7a828a,stroke:#5a6169,stroke-width:2px,color:${INK}`,
    shape: "sensor",
    swatch: "#7a828a",
  },
  control: {
    label: "Control plane",
    classDef: `fill:#6a4fa3,stroke:#4d3878,stroke-width:2px,color:${INK}`,
    shape: "sensor",
    swatch: "#6a4fa3",
  },
  threat: {
    label: "Threat / hostile",
    classDef: `fill:#c0392b,stroke:#8e2a20,stroke-width:2px,color:${INK}`,
    shape: "actor",
    swatch: "#c0392b",
  },
  asset: {
    label: "Protected asset",
    classDef: `fill:#2f6f9f,stroke:#1d4f74,stroke-width:2px,color:${INK}`,
    shape: "process",
    swatch: "#2f6f9f",
  },
  decision: {
    label: "Decision point",
    classDef: `fill:#b5721f,stroke:#8a5615,stroke-width:2px,color:${INK}`,
    shape: "decision",
    swatch: "#b5721f",
  },
  step: {
    label: "Step",
    classDef: `fill:#4a4f8c,stroke:#343869,stroke-width:2px,color:${INK}`,
    shape: "process",
    swatch: "#4a4f8c",
  },
};

function kinds(...names: string[]): Record<string, NodeKindStyle> {
  const out: Record<string, NodeKindStyle> = {};
  for (const n of names) out[n] = NODE_KIND_LIBRARY[n];
  return out;
}

export const GUIDED_PRESETS: Record<string, GuidedPreset> = {
  flow_progression: {
    id: "flow_progression",
    description: "Generic numbered progression — caller supplies the stages.",
    direction: "TB",
    groups: [],
    numberStages: true,
    accent: "#2f6f9f",
    nodeKinds: kinds("step", "decision", "datastore", "endpoint", "control"),
    edgeKinds: EDGE_KINDS,
  },
  network_segmentation: {
    id: "network_segmentation",
    description:
      "Layered network path — physical, L2 switching, L3 routing, out-of-band sensors.",
    direction: "TB",
    groups: [
      { id: "physical", label: "Physical Layer" },
      { id: "l2", label: "L2 Switching" },
      { id: "l3", label: "L3 Routing" },
      { id: "oob", label: "Out-of-Band Sensors" },
    ],
    numberStages: true,
    accent: "#3f7d58",
    nodeKinds: kinds("endpoint", "infra", "transit", "server", "datastore", "sensor", "control"),
    edgeKinds: EDGE_KINDS,
  },
  threat_containment: {
    id: "threat_containment",
    description: "Incident response progression — detect, isolate, eradicate, recover.",
    direction: "LR",
    groups: [
      { id: "detect", label: "Detect" },
      { id: "isolate", label: "Isolate" },
      { id: "eradicate", label: "Eradicate" },
      { id: "recover", label: "Recover" },
    ],
    numberStages: true,
    accent: "#c0392b",
    nodeKinds: kinds("threat", "sensor", "control", "asset", "decision"),
    edgeKinds: EDGE_KINDS,
  },
  data_vs_control_plane: {
    id: "data_vs_control_plane",
    description: "Two-lane split — solid data path versus dashed control/telemetry.",
    direction: "LR",
    groups: [
      { id: "data", label: "Data Plane" },
      { id: "control", label: "Control Plane" },
    ],
    numberStages: false,
    accent: "#4a4f8c",
    nodeKinds: kinds("endpoint", "infra", "server", "control", "sensor", "datastore"),
    edgeKinds: EDGE_KINDS,
  },
};

export const PRESET_IDS = Object.keys(GUIDED_PRESETS);
export const DEFAULT_PRESET = "flow_progression";

/** Fallback style for a node whose kind the preset does not define. */
export const FALLBACK_NODE_KIND: NodeKindStyle = NODE_KIND_LIBRARY.step;

export function resolvePreset(id: string | undefined): GuidedPreset {
  const preset = GUIDED_PRESETS[id ?? DEFAULT_PRESET];
  if (!preset) {
    throw new Error(`preset must be one of ${PRESET_IDS.join(", ")} (got ${JSON.stringify(id)})`);
  }
  return preset;
}

export function nodeKindStyle(preset: GuidedPreset, kind: string | undefined): NodeKindStyle {
  if (!kind) return preset.nodeKinds[Object.keys(preset.nodeKinds)[0]] ?? FALLBACK_NODE_KIND;
  return preset.nodeKinds[kind] ?? NODE_KIND_LIBRARY[kind] ?? FALLBACK_NODE_KIND;
}
