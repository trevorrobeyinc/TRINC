import { getMcpCatalogEntry, getMcpCatalogToolNames } from "./catalog";
import type { McpServerConfig } from "./types";

const VIZ_TOOL_NAMES = [
  "viz_health",
  "viz_mermaid",
  "viz_chart",
  "viz_render_svg",
  "viz_canvas",
  "viz_graph_snapshot",
  "viz_guided",
  "viz_perceptual_map",
  "viz_diagram",
  "viz_stat_tiles",
  "viz_mockup",
  "viz_interactive",
];

function vizServer(): McpServerConfig {
  return {
    id: "viz-studio",
    displayName: "Viz Studio",
    enabled: true,
    transport: "http",
    httpEndpoint: "https://127.0.0.1:8800",
    authToken: "token-viz",
    timeoutMs: 20000,
    vaultName: "My Digital Garden",
    vaultRoot: "/vault",
    enabledToolNames: VIZ_TOOL_NAMES,
  };
}

describe("catalog", () => {
  describe("getMcpCatalogEntry()", () => {
    it("resolves every Viz Studio tool", () => {
      for (const name of VIZ_TOOL_NAMES) {
        const entry = getMcpCatalogEntry(name);
        expect(entry).toBeDefined();
        expect(entry?.toolName).toBe(name);
      }
    });

    it("declares no bridge operation on Viz Studio tools (the :8798 strict enum must not see one)", () => {
      for (const name of VIZ_TOOL_NAMES) {
        expect(getMcpCatalogEntry(name)?.operation).toBeUndefined();
      }
    });

    it("marks every Viz Studio writer mutating and only viz_health read-only", () => {
      expect(getMcpCatalogEntry("viz_health")?.isMutating).toBe(false);
      for (const name of VIZ_TOOL_NAMES.filter((n) => n !== "viz_health")) {
        expect(getMcpCatalogEntry(name)?.isMutating).toBe(true);
      }
    });

    it("accepts a valid viz_chart spec and passes args through buildInput unchanged", () => {
      const entry = getMcpCatalogEntry("viz_chart");
      const args = {
        type: "bar",
        title: "T",
        data: { labels: ["a", "b"], series: [{ name: "s", values: [1, 2] }] },
        targetNote: "Notes/Dash",
      };
      const parsed = entry?.schema.safeParse(args);
      expect(parsed?.success).toBe(true);
      expect(entry?.buildInput(args, vizServer())).toEqual(args);
    });

    it("accepts a viz_guided spec with stages, kinded nodes, and semantic edges", () => {
      const entry = getMcpCatalogEntry("viz_guided");
      const parsed = entry?.schema.safeParse({
        title: "How it works",
        preset: "network_segmentation",
        spec: {
          stages: [{ id: "l2", label: "Switching" }],
          nodes: [
            { id: "a", label: "Client", stage: "l2", kind: "endpoint" },
            { id: "b", label: "Switch", stage: "l2", kind: "infra", badge: "L2" },
          ],
          edges: [{ from: "a", to: "b", kind: "data" }],
        },
        steps: [{ title: "Frames", detail: "Forwarded by MAC address." }],
      });
      expect(parsed?.success).toBe(true);
    });

    it("rejects a viz_guided edge whose kind is not a known line semantic", () => {
      const entry = getMcpCatalogEntry("viz_guided");
      const parsed = entry?.schema.safeParse({
        title: "T",
        spec: {
          nodes: [{ id: "a", label: "A" }],
          edges: [{ from: "a", to: "a", kind: "sideways" }],
        },
      });
      expect(parsed?.success).toBe(false);
    });

    it("accepts a viz_perceptual_map spec with segments, sizes, and a canvas target", () => {
      const entry = getMcpCatalogEntry("viz_perceptual_map");
      const parsed = entry?.schema.safeParse({
        title: "Coffee brands",
        xAxis: { low: "Low Price", high: "High Price", label: "Price" },
        yAxis: { low: "Low Quality", high: "High Quality" },
        items: [
          { label: "Brand A", x: -5, y: 6, segment: "Premium", size: 30 },
          { label: "Brand B", x: 7, y: -2, color: "#4E79A7" },
        ],
        quadrantLabels: { topRight: "Premium leaders" },
        format: "canvas",
        targetCanvas: "Maps/Coffee",
      });
      expect(parsed?.success).toBe(true);
    });

    it("rejects a viz_perceptual_map spec whose format is not svg, png, or canvas", () => {
      const entry = getMcpCatalogEntry("viz_perceptual_map");
      const parsed = entry?.schema.safeParse({
        xAxis: { low: "L", high: "H" },
        yAxis: { low: "L", high: "H" },
        items: [{ label: "A", x: 0, y: 0 }],
        format: "board",
      });
      expect(parsed?.success).toBe(false);
    });

    it("accepts a viz_diagram spec with kinded cards, groups, and a dashed edge", () => {
      const entry = getMcpCatalogEntry("viz_diagram");
      const parsed = entry?.schema.safeParse({
        title: "Sensor pipeline",
        nodes: [
          { id: "central", title: "Aruba Central", subtitle: "pending license key", kind: "ink" },
          { id: "swarm", title: "swarm.cgi", kind: "coral", group: "AP-635" },
          { id: "siem", title: "Local SIEM", kind: "ink" },
        ],
        edges: [
          { from: "central", to: "swarm", dashed: true },
          { from: "swarm", to: "siem" },
        ],
        options: { style: "solid" },
      });
      expect(parsed?.success).toBe(true);
    });

    it("accepts a viz_stat_tiles spec mixing sparkline, meter, and unit tiles", () => {
      const entry = getMcpCatalogEntry("viz_stat_tiles");
      const parsed = entry?.schema.safeParse({
        title: "Pipeline",
        tiles: [
          { label: "Revenue", value: "$14,950", delta: "+100%", direction: "up", spark: [1, 2, 3] },
          { label: "Feed", value: 312, unit: "trials", meter: { value: 312, max: 390 } },
        ],
        options: { columns: 2 },
      });
      expect(parsed?.success).toBe(true);
    });

    it("accepts a viz_mockup spec with typed blocks and rejects an unknown block type", () => {
      const entry = getMcpCatalogEntry("viz_mockup");
      const good = entry?.schema.safeParse({
        frame: "browser",
        blocks: [
          { type: "header", title: "Intake", initials: "TR" },
          { type: "field", label: "Indication", placeholder: "NSCLC" },
          { type: "button_row", buttons: [{ label: "Submit", variant: "accent" }] },
        ],
      });
      expect(good?.success).toBe(true);
      const bad = entry?.schema.safeParse({ blocks: [{ type: "carousel" }] });
      expect(bad?.success).toBe(false);
    });

    it("accepts a viz_interactive spec and requires title and body", () => {
      const entry = getMcpCatalogEntry("viz_interactive");
      const good = entry?.schema.safeParse({
        title: "Price Explorer",
        body: '<div class="row"><input type="range" id="x"></div>',
        script: "document.getElementById('x');",
      });
      expect(good?.success).toBe(true);
      const bad = entry?.schema.safeParse({ title: "No body" });
      expect(bad?.success).toBe(false);
    });

    it("rejects a viz_diagram node whose kind is not a known color role", () => {
      const entry = getMcpCatalogEntry("viz_diagram");
      const parsed = entry?.schema.safeParse({
        nodes: [{ id: "a", kind: "mauve" }],
      });
      expect(parsed?.success).toBe(false);
    });

    it("rejects a viz_chart spec with an unknown chart type", () => {
      const entry = getMcpCatalogEntry("viz_chart");
      const parsed = entry?.schema.safeParse({
        type: "bogus",
        data: { series: [{ name: "s", values: [1] }] },
      });
      expect(parsed?.success).toBe(false);
    });
  });

  describe("getMcpCatalogToolNames()", () => {
    it("lists the Viz Studio tools alongside the existing catalog", () => {
      const names = getMcpCatalogToolNames();
      for (const name of VIZ_TOOL_NAMES) {
        expect(names).toContain(name);
      }
      expect(names).toContain("obsidian_health");
      expect(names).toContain("miyo_search_context");
    });
  });
});
